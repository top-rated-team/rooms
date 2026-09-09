/**
 * ChatWoot's Client API — the path a room uses to make its own contact and
 * its own conversation in an inbox, keyed by inbox_identifier and
 * contact_identifier.
 *
 * The Application API in chatwoot.ts is the other path: speaking as an agent
 * into one conversation somebody already found. This file does not replace
 * that. It is what you call when the room should open the conversation.
 *
 * The room's identity travels as ChatWoot custom attributes, never as
 * message text, and never as the room token. A restart still forgets the
 * in-memory map; these attributes are how a person looking at ChatWoot can
 * tell which room a conversation belongs to, not how the webhook finds it.
 */

import { createHmac } from "node:crypto";
import { clearTimeout, setTimeout } from "node:timers";
import { payloadContainsToken } from "./attribution";
import { CHATWOOT_SEND_FAILED, CHATWOOT_SEND_UNCONFIGURED } from "./chatwoot";

const SEND_MS = 5_000;

/** The ChatWoot custom-attribute key that names the room. Not the token. */
export const ROOM_IDENTITY_ATTRIBUTE = "workspace_id";

export interface ChatwootInboxSendInput {
  baseUrl: string;
  inboxIdentifier: string;
  contactIdentifier: string;
  conversationId: string;
  text: string;
}

export type ChatwootInboxSendResult = { ok: true } | { ok: false; line: string };

export interface EnsureChatwootInboxInput {
  baseUrl: string;
  inboxIdentifier: string;
  workspaceId: string;
  workspaceName: string;
  /** Bearer credential. Used only to assert it is not in any payload. */
  token: string;
  hmacToken?: string | null;
}

export type EnsureChatwootInboxResult =
  | {
      ok: true;
      contactIdentifier: string;
      conversationId: string;
      inboxId: string | null;
    }
  | { ok: false; line: string };

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

export function roomIdentityAttributes(workspaceId: string): Record<string, string> {
  return { [ROOM_IDENTITY_ATTRIBUTE]: workspaceId };
}

/**
 * ChatWoot's identifier_hash, when the inbox has HMAC verification on.
 * SHA-256 of the identifier, hex, keyed by the inbox HMAC token.
 */
export function identifierHash(identifier: string, hmacToken: string): string {
  return createHmac("sha256", hmacToken).update(identifier).digest("hex");
}

/**
 * The stable identifier we give ChatWoot for this room's contact. The
 * workspace id, not the token: the token is the account.
 */
export function contactExternalId(workspaceId: string): string {
  return workspaceId;
}

function inboxRoot(baseUrl: string, inboxIdentifier: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/public/api/v1/inboxes/${encodeURIComponent(inboxIdentifier)}`;
}

async function postJson(
  url: string,
  payload: unknown,
  token: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; body: unknown } | { ok: false; line: string }> {
  if (payloadContainsToken(payload, token)) {
    return { ok: false, line: CHATWOOT_SEND_FAILED };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SEND_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, line: CHATWOOT_SEND_FAILED };
    const text = await res.text();
    if (!text.trim()) return { ok: true, body: {} };
    try {
      return { ok: true, body: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, line: CHATWOOT_SEND_FAILED };
    }
  } catch {
    return { ok: false, line: CHATWOOT_SEND_FAILED };
  } finally {
    clearTimeout(timer);
  }
}

function contactIdentifierFrom(body: unknown, fallback: string): string | null {
  const rec = asRecord(body);
  if (!rec) return fallback || null;
  return (
    stringish(rec.source_id) ??
    stringish(nested(rec, "contact_inbox")?.source_id) ??
    stringish(rec.identifier) ??
    stringish(rec.id) ??
    (fallback || null)
  );
}

function conversationIdFrom(body: unknown): string | null {
  const rec = asRecord(body);
  if (!rec) return null;
  return stringish(rec.id) ?? stringish(rec.display_id) ?? stringish(nested(rec, "conversation")?.id);
}

function inboxIdFrom(body: unknown): string | null {
  const rec = asRecord(body);
  if (!rec) return null;
  return stringish(rec.inbox_id) ?? stringish(nested(rec, "inbox")?.id);
}

/**
 * Create (or reuse) a contact for this room, then open a conversation on
 * that contact. Custom attributes carry workspace_id. The token is checked
 * against every payload and is never a field.
 */
export async function ensureChatwootInboxConversation(
  input: EnsureChatwootInboxInput,
  fetchImpl: typeof fetch = fetch,
): Promise<EnsureChatwootInboxResult> {
  const base = input.baseUrl.replace(/\/+$/, "");
  const inboxIdentifier = input.inboxIdentifier.trim();
  const workspaceId = input.workspaceId.trim();
  if (!base || !inboxIdentifier || !workspaceId) {
    return { ok: false, line: CHATWOOT_SEND_UNCONFIGURED };
  }
  if (payloadContainsToken({ workspaceId, inboxIdentifier, name: input.workspaceName }, input.token)) {
    return { ok: false, line: CHATWOOT_SEND_FAILED };
  }

  const identifier = contactExternalId(workspaceId);
  const attributes = roomIdentityAttributes(workspaceId);
  if (payloadContainsToken(attributes, input.token)) {
    return { ok: false, line: CHATWOOT_SEND_FAILED };
  }

  const contactPayload: Record<string, unknown> = {
    identifier,
    name: input.workspaceName.trim() || "Room",
    custom_attributes: attributes,
  };
  const hmac = input.hmacToken?.trim();
  if (hmac) {
    contactPayload.identifier_hash = identifierHash(identifier, hmac);
  }

  const contactUrl = `${inboxRoot(base, inboxIdentifier)}/contacts`;
  const contact = await postJson(contactUrl, contactPayload, input.token, fetchImpl);
  if (!contact.ok) return contact;
  const contactIdentifier = contactIdentifierFrom(contact.body, identifier);
  if (!contactIdentifier) return { ok: false, line: CHATWOOT_SEND_FAILED };

  const conversationPayload = { custom_attributes: attributes };
  const conversationUrl = `${inboxRoot(base, inboxIdentifier)}/contacts/${encodeURIComponent(contactIdentifier)}/conversations`;
  const conversation = await postJson(conversationUrl, conversationPayload, input.token, fetchImpl);
  if (!conversation.ok) return conversation;
  const conversationId = conversationIdFrom(conversation.body);
  if (!conversationId) return { ok: false, line: CHATWOOT_SEND_FAILED };

  return {
    ok: true,
    contactIdentifier,
    conversationId,
    inboxId: inboxIdFrom(conversation.body) ?? inboxIdFrom(contact.body),
  };
}

/**
 * POST one attributed text as the contact — the room speaking into the
 * conversation it opened. Not the Application API; that would arrive as an
 * agent.
 */
export async function sendChatwootInboxText(
  input: ChatwootInboxSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatwootInboxSendResult> {
  const base = input.baseUrl.replace(/\/+$/, "");
  if (!base || !input.inboxIdentifier || !input.contactIdentifier || !input.conversationId) {
    return { ok: false, line: CHATWOOT_SEND_UNCONFIGURED };
  }

  const url = `${inboxRoot(base, input.inboxIdentifier)}/contacts/${encodeURIComponent(input.contactIdentifier)}/conversations/${encodeURIComponent(input.conversationId)}/messages`;
  const payload = { content: input.text };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SEND_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
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
