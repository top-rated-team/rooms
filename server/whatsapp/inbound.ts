/**
 * Who a message is from, who it is to, and which chat it is in. The owner
 * asked for that check by name. Every inbound payload — both transports —
 * goes through it. Each of the seven checks is a named export with its own
 * test.
 *
 * The seven:
 *   1. who it is from     — senderIsKnown
 *   2. who it is to       — accountIdIsOurs (it arrived on an account we operate)
 *   3. which chat it is in — chatIdIsExpected
 *   4. is it our own echo — isNotOurEcho / echoFlag / fromMe
 *   5. is it a group      — isNotGroup
 *   6. has the code expired — timestampIsRecent (a reconnect burst is not a live answer;
 *                            application TTLs on planted codes sit above this)
 *   7. is the account ours — accountIdIsOurs
 *
 * There is no HMAC on the hosted webhook. The shared secret is compared with
 * timingSafeEqual. No secret configured means this endpoint refuses
 * everything — identity.ts:466-474 does the same comparison and passes when
 * its env var is unset; that line is the bug, and it is not copied here.
 *
 * A check dropped because a webhook spells a field differently is the bug
 * this parcel exists to avoid. Hosted messaging uses `message` for the body
 * and `message_received` for the event; WAHA uses `body`/`text` and `message`.
 * Both are accepted. Reading the REST send field `text` as the hosted body
 * would hide that mismatch.
 */

import { timingSafeEqual } from "node:crypto";

import { hostedAccountId, hostedWebhookSecret } from "./hosted";
import { isWhatsAppGroup, parseWahaInbound, wahaSessionName, wahaWebhookSecret } from "./waha";
import type { AcceptedInboundMessage, AccountStatusInbound, SenderProviderId } from "./types";

/** Reconnect bursts older than this are not live answers. */
export const INBOUND_MAX_AGE_MS = 15 * 60_000;
/** A little clock skew the other way is not a reconnect burst. */
const TIMESTAMP_FUTURE_SLACK_MS = 2 * 60_000;
const SEEN_TTL_MS = 60 * 60_000;
const DROP_CAP = 200;

export type InboundDropReason =
  | "secret"
  | "account"
  | "echo"
  | "unknown-self"
  | "unknown-sender"
  | "chat"
  | "group"
  | "duplicate"
  | "event"
  | "timestamp";

export interface InboundDrop {
  reason: InboundDropReason;
  at: number;
  messageId: string | null;
}

export type InboundResult =
  | { authorized: false; reason: "secret" }
  | { authorized: true; kind: "dropped"; reason: InboundDropReason }
  | { authorized: true; kind: "account_status"; status: AccountStatusInbound }
  | { authorized: true; kind: "message"; message: AcceptedInboundMessage };

export type InboundMatcher = (message: AcceptedInboundMessage) => void | Promise<void>;
export type AccountStatusMatcher = (status: AccountStatusInbound) => void | Promise<void>;

const seenMessageIds = new Map<string, number>();
const drops: InboundDrop[] = [];
const messageMatchers: InboundMatcher[] = [];
const accountStatusMatchers: AccountStatusMatcher[] = [];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function recordDrop(reason: InboundDropReason, messageId: string | null = null): void {
  drops.push({ reason, at: Date.now(), messageId });
  if (drops.length > DROP_CAP) drops.splice(0, drops.length - DROP_CAP);
  console.info(`[whatsapp] inbound dropped: ${reason}`);
}

function reportUnattributable(reason: InboundDropReason, raw: unknown): void {
  const root = asRecord(raw);
  const top = root ? Object.keys(root).sort().join(",") : "(not an object)";
  const info = root ? asRecord(root.account_info) : null;
  const nested = info ? Object.keys(info).sort().join(",") : "(absent)";
  console.info(`[whatsapp] ${reason}: fields=[${top}] account_info=[${nested}]`);
}

export function inboundDrops(): readonly InboundDrop[] {
  return drops;
}

export function resetInboundForTests(): void {
  seenMessageIds.clear();
  drops.length = 0;
  messageMatchers.length = 0;
  accountStatusMatchers.length = 0;
}

export function registerInboundMatcher(matcher: InboundMatcher): () => void {
  messageMatchers.push(matcher);
  return () => {
    const index = messageMatchers.indexOf(matcher);
    if (index >= 0) messageMatchers.splice(index, 1);
  };
}

export function registerAccountStatusMatcher(matcher: AccountStatusMatcher): () => void {
  accountStatusMatchers.push(matcher);
  return () => {
    const index = accountStatusMatchers.indexOf(matcher);
    if (index >= 0) accountStatusMatchers.splice(index, 1);
  };
}

function pruneSeen(now: number): void {
  for (const [id, seenAt] of seenMessageIds) {
    if (now - seenAt > SEEN_TTL_MS) seenMessageIds.delete(id);
  }
}

function operatedAccountIds(): Set<string> {
  const ids = new Set<string>();
  const hosted = hostedAccountId();
  if (hosted) ids.add(hosted);
  ids.add(wahaSessionName());
  return ids;
}

function configuredSecrets(): string[] {
  const secrets: string[] = [];
  const hosted = hostedWebhookSecret();
  if (hosted) secrets.push(hosted);
  const waha = wahaWebhookSecret();
  if (waha) secrets.push(waha);
  return secrets;
}

/** The shared secret matches. No secret configured → refuse. */
export function secretMatches(provided: string | undefined): boolean {
  const expected = configuredSecrets();
  if (expected.length === 0) return false;
  if (!provided) return false;
  const b = Buffer.from(provided);
  for (const secret of expected) {
    const a = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** (2) (7) account_id is on the allowlist of accounts we operate, not merely present. */
export function accountIdIsOurs(accountId: unknown): boolean {
  if (typeof accountId !== "string" || accountId.length === 0) return false;
  return operatedAccountIds().has(accountId);
}

/** (1) Who it is from. A message from nobody must not enter a room under a name we invented. */
export function senderIsKnown(senderProviderId: unknown): boolean {
  return typeof senderProviderId === "string" && senderProviderId.length > 0;
}

/**
 * (4) It is not our own echo. Hosted sent messages arrive as message_received
 * too. WAHA carries fromMe.
 */
export function isNotOurEcho(senderProviderId: unknown, ourUserId: unknown): boolean {
  if (typeof senderProviderId !== "string" || senderProviderId.length === 0) return false;
  if (typeof ourUserId !== "string" || ourUserId.length === 0) return false;
  return senderProviderId !== ourUserId;
}

/**
 * The provider's own answer to "did this account send it".
 * Hosted WhatsApp sends 0 or 1. true means our echo, false means the visitor,
 * and null means the field was absent and the fallback has to decide.
 */
export function echoFlag(isSender: unknown): boolean | null {
  if (typeof isSender === "boolean") return isSender;
  if (typeof isSender === "number") return isSender !== 0;
  if (isSender === "0" || isSender === "false") return false;
  if (isSender === "1" || isSender === "true") return true;
  return null;
}

export function selfIdKnown(ourUserId: unknown): boolean {
  return typeof ourUserId === "string" && ourUserId.length > 0;
}

/**
 * (3) chat_id is present, and equals the chat expected for whatever this
 * answers when `expected` is passed. A booking code from a different chat
 * than the one it was planted in is not a match.
 */
export function chatIdIsExpected(chatId: unknown, expected?: string): boolean {
  if (typeof chatId !== "string" || chatId.length === 0) return false;
  if (expected === undefined) return true;
  return chatId === expected;
}

/** (5) A group chat is not a 1:1 proof. Booking and room sign-in are 1:1. */
export function isNotGroup(chatId: unknown, attendeeCount?: number): boolean {
  if (typeof chatId === "string" && isWhatsAppGroup(chatId)) return false;
  if (typeof attendeeCount === "number" && attendeeCount > 2) return false;
  return typeof chatId === "string" && chatId.length > 0;
}

export function messageIdIsNew(messageId: unknown, now = Date.now()): boolean {
  if (typeof messageId !== "string" || messageId.length === 0) return false;
  pruneSeen(now);
  return !seenMessageIds.has(messageId);
}

export function rememberMessageId(messageId: string, now = Date.now()): void {
  pruneSeen(now);
  seenMessageIds.set(messageId, now);
}

/**
 * Hosted messaging fires `message_received`. WAHA fires `message`. The other
 * hosted events (reaction, read, edited, deleted, delivered) are not messages.
 */
export function eventIsMessageReceived(event: unknown): boolean {
  return event === "message_received" || event === "message";
}

/** (6) timestamp is recent. A reconnect delivers a burst from the disconnected period. */
export function timestampIsRecent(timestamp: unknown, now = Date.now()): boolean {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    if (ms > now + TIMESTAMP_FUTURE_SLACK_MS) return false;
    return now - ms <= INBOUND_MAX_AGE_MS;
  }
  if (typeof timestamp !== "string" || timestamp.length === 0) return false;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return false;
  if (ms > now + TIMESTAMP_FUTURE_SLACK_MS) return false;
  return now - ms <= INBOUND_MAX_AGE_MS;
}

export function parseSenderProviderId(raw: string): SenderProviderId {
  if (raw.endsWith("@lid")) return { form: "lid", value: raw };
  if (raw.endsWith("@s.whatsapp.net")) return { form: "s.whatsapp.net", value: raw };
  return { form: "other", value: raw };
}

function isoFromTimestamp(timestamp: unknown): string {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    return new Date(ms).toISOString();
  }
  if (typeof timestamp === "string" && timestamp.length > 0) {
    const ms = Date.parse(timestamp);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
    return timestamp;
  }
  return new Date().toISOString();
}

function parseAccountStatus(raw: unknown): AccountStatusInbound | null {
  const root = asRecord(raw);
  if (!root) return null;
  const nested = asRecord(root.AccountStatus);
  if (!nested) return null;
  const accountId = asString(nested.account_id);
  const status = asString(nested.message);
  if (!accountId || !status) return null;
  const accountType = asString(nested.account_type);
  return { accountId, accountType, status };
}

interface ParsedMessage {
  accountId: unknown;
  chatId: unknown;
  messageId: unknown;
  message: unknown;
  event: unknown;
  isSender: unknown;
  fromMe: boolean | null;
  timestamp: unknown;
  senderProviderId: unknown;
  senderAttendeeId: unknown;
  senderName: unknown;
  ourUserId: unknown;
  attendeeCount: number | undefined;
}

function parseHostedMessage(raw: unknown): ParsedMessage | null {
  const root = asRecord(raw);
  if (!root) return null;
  if (root.account_id == null && root.chat_id == null && root.message == null && root.event == null && root.event_type == null) {
    return null;
  }
  const sender = asRecord(root.sender);
  const accountInfo = asRecord(root.account_info);
  const attendees = Array.isArray(root.attendees) ? root.attendees : undefined;
  return {
    accountId: root.account_id,
    chatId: root.chat_id,
    messageId: root.message_id,
    message: root.message,
    event: root.event ?? root.event_type,
    isSender: root.is_sender,
    fromMe: null,
    timestamp: root.timestamp,
    senderProviderId: sender?.attendee_provider_id,
    senderAttendeeId: sender?.attendee_id,
    senderName: sender?.attendee_name,
    ourUserId: accountInfo?.user_id,
    attendeeCount: attendees?.length,
  };
}

function parseWahaMessage(raw: unknown): ParsedMessage | null {
  const parsed = parseWahaInbound(raw);
  if (!parsed) return null;
  const root = asRecord(raw);
  const payload = (root && asRecord(root.payload)) ?? root;
  const messageId =
    asString(payload?.id) ??
    asString(payload?.message_id) ??
    asString(root?.id) ??
    `${parsed.chatId}:${parsed.body}`;
  const senderId = parsed.shared ? parsed.participant ?? parsed.chatId : parsed.chatId;
  const timestamp = payload?.timestamp ?? root?.timestamp;
  const session = asString(root?.session) ?? wahaSessionName();
  const pushName = asString(payload?.pushName) ?? "";
  return {
    accountId: session,
    chatId: parsed.chatId,
    messageId,
    message: parsed.body,
    event: root?.event ?? "message",
    isSender: parsed.fromMe,
    fromMe: parsed.fromMe,
    timestamp,
    senderProviderId: senderId,
    senderAttendeeId: parsed.participant,
    senderName: pushName,
    ourUserId: session,
    attendeeCount: parsed.shared ? 3 : 2,
  };
}

function parseMessagePayload(raw: unknown): ParsedMessage | null {
  const hosted = parseHostedMessage(raw);
  if (hosted && (hosted.chatId || hosted.message != null || hosted.accountId)) return hosted;
  return parseWahaMessage(raw);
}

/**
 * Run the seven checks. Secret failure is unauthorized (401). Everything
 * else is recorded and dropped, and the caller still answers 200.
 */
export function acceptInbound(raw: unknown, providedSecret: string | undefined): InboundResult {
  if (!secretMatches(providedSecret)) {
    recordDrop("secret");
    return { authorized: false, reason: "secret" };
  }

  const accountStatus = parseAccountStatus(raw);
  if (accountStatus) {
    if (!accountIdIsOurs(accountStatus.accountId)) {
      recordDrop("account");
      return { authorized: true, kind: "dropped", reason: "account" };
    }
    return { authorized: true, kind: "account_status", status: accountStatus };
  }

  const parsed = parseMessagePayload(raw);
  if (!parsed) {
    recordDrop("event");
    return { authorized: true, kind: "dropped", reason: "event" };
  }

  if (!eventIsMessageReceived(parsed.event)) {
    recordDrop("event", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "event" };
  }
  if (!accountIdIsOurs(parsed.accountId)) {
    recordDrop("account", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "account" };
  }
  const flagged = parsed.fromMe === true ? true : parsed.fromMe === false ? false : echoFlag(parsed.isSender);
  if (flagged === true) {
    recordDrop("echo", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "echo" };
  }
  if (flagged === null) {
    if (!selfIdKnown(parsed.ourUserId)) {
      reportUnattributable("unknown-self", raw);
      recordDrop("unknown-self", asString(parsed.messageId));
      return { authorized: true, kind: "dropped", reason: "unknown-self" };
    }
    if (!isNotOurEcho(parsed.senderProviderId, parsed.ourUserId)) {
      recordDrop("echo", asString(parsed.messageId));
      return { authorized: true, kind: "dropped", reason: "echo" };
    }
  }
  if (!senderIsKnown(parsed.senderProviderId)) {
    reportUnattributable("unknown-sender", raw);
    recordDrop("unknown-sender", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "unknown-sender" };
  }
  if (!chatIdIsExpected(parsed.chatId)) {
    recordDrop("chat", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "chat" };
  }
  if (!isNotGroup(parsed.chatId, parsed.attendeeCount)) {
    recordDrop("group", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "group" };
  }
  if (!timestampIsRecent(parsed.timestamp)) {
    recordDrop("timestamp", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "timestamp" };
  }
  if (!messageIdIsNew(parsed.messageId)) {
    recordDrop("duplicate", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "duplicate" };
  }
  if (typeof parsed.message !== "string") {
    recordDrop("event", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "event" };
  }

  const messageId = parsed.messageId as string;
  rememberMessageId(messageId);
  const senderName = typeof parsed.senderName === "string" && parsed.senderName.trim() ? parsed.senderName : null;
  const chatId = parsed.chatId as string;
  return {
    authorized: true,
    kind: "message",
    message: {
      accountId: parsed.accountId as string,
      chatId,
      messageId,
      message: parsed.message,
      sender: {
        attendeeId: asString(parsed.senderAttendeeId),
        attendeeName: senderName,
        attendeeProviderId: parseSenderProviderId(parsed.senderProviderId as string),
      },
      timestamp: isoFromTimestamp(parsed.timestamp),
      fromMe: false,
      isGroup: !isNotGroup(chatId, parsed.attendeeCount),
    },
  };
}

/**
 * After the HTTP handler has already answered 200. Matcher failures stay here.
 *
 * identity.ts still registers its room-bind matcher with the previous inbound
 * module. Until that file imports from this one instead, accepted messages are
 * forwarded so a room bind on the house number keeps resolving. See the
 * handoff on this parcel.
 */
export function dispatchInbound(result: InboundResult): void {
  if (!result.authorized) return;
  if (result.kind === "account_status") {
    const status = result.status;
    if (
      status.status !== "OK" &&
      status.status !== "CREATION_SUCCESS" &&
      status.status !== "RECONNECTED" &&
      status.status !== "SYNC_SUCCESS"
    ) {
      console.error(`[whatsapp] account status ${status.status} on ${status.accountId}`);
    }
    for (const matcher of accountStatusMatchers) {
      void Promise.resolve(matcher(status)).catch(() => {
        /* a matcher must not take the process down */
      });
    }
    return;
  }
  if (result.kind !== "message") return;
  const message = result.message;
  for (const matcher of messageMatchers) {
    void Promise.resolve(matcher(message)).catch(() => {
      /* a matcher must not take the process down */
    });
  }
}

