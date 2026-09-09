/**
 * ChatWoot Application API: speaking as an agent into one conversation.
 *
 * Right for a conversation the owner already found. Wrong for a room that
 * should make its own — that path is inbox.ts (Client API, keyed by
 * inbox_identifier and contact_identifier).
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

export type ChatwootMessageType = "incoming" | "outgoing" | "activity" | "template" | null;

export interface ChatwootInbound {
  accountId: string;
  conversationId: string;
  inboxId: string | null;
  /** ChatWoot user id for a contractor; contact id for a client. */
  senderId: string | null;
  senderType: "user" | "contact" | "agent_bot" | "unknown";
  body: string;
  messageId: string | null;
  messageType: ChatwootMessageType;
  /** A private note. Those do not enter the room. */
  privateNote: boolean;
  /**
   * Agent-path echo: our own Application-API send comes back as
   * message_type outgoing, and so do bot messages and private notes.
   * Inbox-path echo is different — the room is the contact, so incoming
   * is what we sent. Use isChatwootEcho(inbound, mode).
   */
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

export function messageTypeOf(value: unknown): ChatwootMessageType {
  if (value === 0 || value === "0" || value === "incoming") return "incoming";
  if (value === 1 || value === "1" || value === "outgoing") return "outgoing";
  if (value === 2 || value === "2" || value === "activity") return "activity";
  if (value === 3 || value === "3" || value === "template") return "template";
  return null;
}

/**
 * Whether this webhook is our own send coming back, or a private note, or
 * a bot. Mode matters: on the agent path we sent outgoing; on the inbox
 * path the room is the contact and we sent incoming.
 */
export function isChatwootEcho(inbound: ChatwootInbound, mode: "agent" | "inbox"): boolean {
  if (inbound.privateNote) return true;
  if (inbound.senderType === "agent_bot") return true;
  if (inbound.messageType === "activity" || inbound.messageType === "template") return true;
  if (mode === "inbox") {
    return inbound.messageType === "incoming" || inbound.senderType === "contact";
  }
  return inbound.messageType === "outgoing";
}

/**
 * A ChatWoot `message_created` (or a body that already is the message).
 * Bot/API echoes are marked `echo` so the room does not write them twice.
 * `echo` is the agent-path answer; inbox-path callers use isChatwootEcho.
 */
export function parseChatwootInbound(raw: unknown): ChatwootInbound | null {
  const root = asRecord(raw);
  if (!root) return null;

  const event = stringish(root.event);
  if (event && event !== "message_created" && event !== "message_updated") return null;

  const conv = nested(root, "conversation");
  const account = nested(root, "account");
  const sender = nested(root, "sender") ?? nested(root, "user");
  const message = nested(root, "message");

  const conversationId =
    stringish(root.conversation_id) ?? stringish(conv?.id) ?? stringish(conv?.display_id);
  const accountId = stringish(root.account_id) ?? stringish(account?.id);
  if (!conversationId || !accountId) return null;

  const inboxId = stringish(root.inbox_id) ?? stringish(conv?.inbox_id) ?? stringish(nested(conv, "inbox")?.id);
  const body = stringish(root.content) ?? stringish(root.body) ?? stringish(message?.content) ?? "";
  const type = stringish(sender?.type);
  const messageType = messageTypeOf(root.message_type ?? message?.message_type);
  const senderType = senderTypeOf(
    type ?? (messageType === "incoming" ? "contact" : messageType === "outgoing" ? "user" : null),
  );
  const senderId = stringish(sender?.id) ?? stringish(sender?.phone_number) ?? stringish(sender?.email);
  const messageId = stringish(root.id) ?? stringish(root.message_id) ?? stringish(message?.id);
  const privateNote = root.private === true || message?.private === true;
  const echo = senderType === "agent_bot" || privateNote || messageType === "outgoing";

  return {
    accountId,
    conversationId,
    inboxId,
    senderId,
    senderType,
    body,
    messageId,
    messageType,
    privateNote,
    echo,
  };
}
