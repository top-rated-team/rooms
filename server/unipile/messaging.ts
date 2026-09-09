/**
 * Send and read over Unipile's messaging routes. Both send paths are
 * multipart/form-data, not JSON — the largest difference from WAHA.
 *
 * POST /api/v1/chats is the upsert: Unipile creates a chat if needed or uses
 * an existing one. POST /api/v1/chats/{chat_id}/messages writes into a chat
 * we already have. account_id goes on both, as a safety rail so a send cannot
 * land on a chat that is not ours.
 *
 * attendee_provider_id is a tagged union, not a phone number. WhatsApp is
 * migrating to LID; Unipile has no LID-to-phone resolver, and its own docs
 * disagree about which form is "internal". This file classifies the suffix
 * and never pulls digits out of the value.
 *
 * Contact reads return name (a self-set push name, display only), picture_url
 * and provider_id. There is no phone field and no WhatsApp branch of
 * specifics. This parcel does not touch identity.ts; room-identity imports us.
 */

import { unipileRequest, type UnipileResult } from "./client";
import { visitorLine } from "./errors";
import { whatsappAccountId } from "./accounts";

export type AttendeeProviderId =
  | { form: "s.whatsapp.net"; value: string }
  | { form: "lid"; value: string }
  | { form: "other"; value: string };

export interface ChatAttendee {
  id: string;
  providerId: AttendeeProviderId;
  /** Push name. User-set, unverified, changeable, sometimes absent. Display only. */
  name: string | null;
  pictureUrl: string | null;
  isSelf: boolean;
}

export interface MessageSent {
  object: "MessageSent";
  messageId: string;
}

export interface ChatStarted {
  object: "ChatStarted";
  chatId: string;
  messageId: string;
}

export interface SendInChatInput {
  chatId: string;
  text: string;
  accountId?: string;
  quoteId?: string;
  typingDuration?: string;
}

export interface StartOrReuseChatInput {
  attendeesIds: string[];
  text: string;
  accountId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Classify a provider id by its suffix. The local part is kept whole: a LID
 * is not a phone number, and a JID's local part is not recovered here either.
 */
export function parseAttendeeProviderId(raw: string): AttendeeProviderId {
  if (raw.endsWith("@lid")) return { form: "lid", value: raw };
  if (raw.endsWith("@s.whatsapp.net")) return { form: "s.whatsapp.net", value: raw };
  return { form: "other", value: raw };
}

function sendAccountId(explicit?: string): string {
  const trimmed = explicit?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : whatsappAccountId();
}

function appendTextFields(form: FormData, fields: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    form.append(key, value);
  }
}

export function parseChatAttendee(value: unknown): ChatAttendee | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const providerRaw = asString(record.provider_id);
  if (!id || !providerRaw) return null;
  const name = typeof record.name === "string" && record.name.trim() ? record.name : null;
  const pictureUrl = asString(record.picture_url);
  const isSelf = record.is_self === 1 || record.is_self === true;
  return {
    id,
    providerId: parseAttendeeProviderId(providerRaw),
    name,
    pictureUrl,
    isSelf,
  };
}

function listItems(body: unknown): unknown[] {
  const record = asRecord(body);
  if (!record) return [];
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  return [];
}

/**
 * Reply in an existing chat. multipart/form-data: text, account_id, optional
 * quote_id and typing_duration (WhatsApp only).
 */
export async function sendInChat(
  input: SendInChatInput,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<MessageSent>> {
  const form = new FormData();
  appendTextFields(form, {
    text: input.text,
    account_id: sendAccountId(input.accountId),
    quote_id: input.quoteId,
    typing_duration: input.typingDuration,
  });

  const result = await unipileRequest<{ object?: unknown; message_id?: unknown }>(
    {
      method: "POST",
      path: `/chats/${encodeURIComponent(input.chatId)}/messages`,
      body: form,
    },
    fetchImpl,
  );
  if (!result.ok) return result;
  const messageId = asString(result.body?.message_id);
  if (!messageId) {
    return {
      ok: false,
      error: { type: "unknown", status: result.status },
      line: visitorLine({ type: "unknown", status: result.status }),
    };
  }
  return { ok: true, status: result.status, body: { object: "MessageSent", messageId } };
}

/**
 * The upsert send path. POST /api/v1/chats creates a chat if needed or uses
 * an existing one. account_id is required by Unipile and sent even when the
 * caller omits it, using the WhatsApp account we operate.
 */
export async function startOrReuseChat(
  input: StartOrReuseChatInput,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<ChatStarted>> {
  const form = new FormData();
  form.append("account_id", sendAccountId(input.accountId));
  form.append("text", input.text);
  for (const attendeeId of input.attendeesIds) {
    form.append("attendees_ids", attendeeId);
  }

  const result = await unipileRequest<{ object?: unknown; chat_id?: unknown; message_id?: unknown }>(
    {
      method: "POST",
      path: "/chats",
      body: form,
    },
    fetchImpl,
  );
  if (!result.ok) return result;
  const chatId = asString(result.body?.chat_id);
  const messageId = asString(result.body?.message_id);
  if (!chatId || !messageId) {
    return {
      ok: false,
      error: { type: "unknown", status: result.status },
      line: visitorLine({ type: "unknown", status: result.status }),
    };
  }
  return { ok: true, status: result.status, body: { object: "ChatStarted", chatId, messageId } };
}

/** GET /api/v1/chats/{chat_id}/attendees */
export async function listChatAttendees(
  chatId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<ChatAttendee[]>> {
  const result = await unipileRequest<unknown>(
    {
      method: "GET",
      path: `/chats/${encodeURIComponent(chatId)}/attendees`,
      query: { account_id: whatsappAccountId() },
    },
    fetchImpl,
  );
  if (!result.ok) return result;
  const attendees = listItems(result.body)
    .map(parseChatAttendee)
    .filter((row): row is ChatAttendee => row !== null);
  return { ok: true, status: result.status, body: attendees };
}

/** GET /api/v1/chat_attendees/{id} */
export async function getChatAttendee(
  attendeeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<ChatAttendee | null>> {
  const result = await unipileRequest<unknown>(
    {
      method: "GET",
      path: `/chat_attendees/${encodeURIComponent(attendeeId)}`,
      query: { account_id: whatsappAccountId() },
    },
    fetchImpl,
  );
  if (!result.ok) {
    if (result.error.status === 404) return { ok: true, status: 404, body: null };
    return result;
  }
  const attendee = parseChatAttendee(result.body);
  if (!attendee) {
    return {
      ok: false,
      error: { type: "unknown", status: result.status },
      line: visitorLine({ type: "unknown", status: result.status }),
    };
  }
  return { ok: true, status: result.status, body: attendee };
}
