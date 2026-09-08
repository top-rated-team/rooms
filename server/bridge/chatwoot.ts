/**
 * ChatWoot: the contractors' shared inbox, talking to one conversation.
 *
 * Read-and-write into that conversation, never a mirror of the whole inbox.
 * When ChatWoot is down the send fails with a sentence and the caller marks
 * that on the message in the room. The API token never goes back out in a
 * payload the client can read.
 */

import { clearTimeout, setTimeout } from "node:timers";

const SEND_MS = 5_000;

export const CHATWOOT_SEND_UNCONFIGURED = "ChatWoot is not configured for this bridge.";
export const CHATWOOT_SEND_FAILED = "ChatWoot could not be reached.";

export interface ChatwootSendInput {
  baseUrl: string;
  accountId: string;
  conversationId: string;
  token: string;
  text: string;
}

export type ChatwootSendResult = { ok: true } | { ok: false; line: string };

export interface ChatwootInbound {
  accountId: string;
  conversationId: string;
  inboxId: string | null;
  /** ChatWoot user id for a contractor; contact id for a client. */
  senderId: string | null;
  senderType: "user" | "contact" | "agent_bot" | "unknown";
  body: string;
  /** Outgoing from the API or a bot — skip, we sent it. */
  echo: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function stringish(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!record) return null;
  return asRecord(record[key]);
}

export async function sendChatwootText(
  input: ChatwootSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatwootSendResult> {
  const base = input.baseUrl.replace(/\/+$/, "");
  if (!base || !input.accountId || !input.conversationId || !input.token) {
    return { ok: false, line: CHATWOOT_SEND_UNCONFIGURED };
  }

  const url = `${base}/api/v1/accounts/${encodeURIComponent(input.accountId)}/conversations/${encodeURIComponent(input.conversationId)}/messages`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SEND_MS);
  const payload = {
    content: input.text,
    message_type: "outgoing",
    private: false,
  };

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        api_access_token: input.token,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, line: CHATWOOT_SEND_FAILED };
    return { ok: true };
  } catch {
    return { ok: false, line: CHATWOOT_SEND_FAILED };
  } finally {
    clearTimeout(timer);
  }
}

function senderTypeOf(raw: string | null): ChatwootInbound["senderType"] {
  if (raw === "user") return "user";
  if (raw === "contact") return "contact";
  if (raw === "agent_bot" || raw === "AgentBot") return "agent_bot";
  return "unknown";
}

/**
 * A ChatWoot `message_created` (or a body that already is the message).
 * Bot/API echoes are marked `echo` so the room does not write them twice.
 */
export function parseChatwootInbound(raw: unknown): ChatwootInbound | null {
  const root = asRecord(raw);
  if (!root) return null;

  const event = stringish(root.event);
  if (event && event !== "message_created" && event !== "message_updated") return null;

  const conv = nested(root, "conversation");
  const account = nested(root, "account");
  const sender = nested(root, "sender") ?? nested(root, "user");

  const conversationId =
    stringish(root.conversation_id) ?? stringish(conv?.id) ?? stringish(conv?.display_id);
  const accountId = stringish(root.account_id) ?? stringish(account?.id);
  if (!conversationId || !accountId) return null;

  const inboxId = stringish(root.inbox_id) ?? stringish(conv?.inbox_id) ?? stringish(nested(conv, "inbox")?.id);
  const body = stringish(root.content) ?? stringish(root.body) ?? "";
  const type = stringish(sender?.type);
  const messageType = stringish(root.message_type);
  const senderType = senderTypeOf(
    type ?? (messageType === "incoming" ? "contact" : messageType === "outgoing" ? "user" : null),
  );
  const senderId = stringish(sender?.id) ?? stringish(sender?.phone_number) ?? stringish(sender?.email);
  const echo = senderType === "agent_bot" || root.private === true;

  return {
    accountId,
    conversationId,
    inboxId,
    senderId,
    senderType,
    body,
    echo,
  };
}
