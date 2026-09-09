/**
 * Who a message is from, who it is to, and which chat it is in. The owner
 * asked for that check by name, and every inbound Unipile payload goes through
 * it. Each of the seven checks is a named export with its own test.
 *
 * There is no HMAC. The shared secret in Unipile-Auth is compared with
 * timingSafeEqual. No secret configured means this endpoint refuses
 * everything — identity.ts:466-474 does the same comparison and passes when
 * its env var is unset; that line is the bug, and it is not copied here.
 *
 * Our own sent messages arrive as message_received too, so check 3 is what
 * stops the room echoing our own agents back as if the visitor had said them.
 * WhatsApp answers it with `is_sender`, the provider's own flag, and that is
 * read first because it is a statement of fact rather than our inference. The
 * documented `account_info.user_id` is the fallback: it is present on the
 * LINKEDIN payload Unipile documents and ABSENT on the WhatsApp one, which is
 * what dropped every WhatsApp message here as "unknown-self" until 9 Sep 2026.
 * The body field is `message`, a string; the REST send path calls it `text`.
 * Reading `text` here would hide that mismatch.
 *
 * Account-status payloads are not messages and never reach the message path.
 * Reply 200 fast; later parcels register a matcher and do their work after.
 */

import { timingSafeEqual } from "node:crypto";

import { calendarAccountId, whatsappAccountId } from "./accounts";
import { parseAttendeeProviderId, type AttendeeProviderId } from "./messaging";

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
  /* Distinct from "echo": the payload did not say who WE are, so check (3)
     could not be made. Dropping is still right — an unattributable message
     must not enter a room — but calling it an echo would send whoever reads
     the drops looking for a loop that is not there. */
  | "unknown-self"
  /* The sender is missing. Distinct again from "unknown-self": we know who WE
     are, we cannot tell who THEY are, and a message from nobody must not enter
     a room under a name we invented for it. */
  | "unknown-sender"
  | "chat"
  | "duplicate"
  | "event"
  | "timestamp";

export interface InboundDrop {
  reason: InboundDropReason;
  at: number;
  messageId: string | null;
}

export interface AcceptedInboundMessage {
  accountId: string;
  chatId: string;
  messageId: string;
  /** The webhook body field is `message`. The REST send path calls it `text`. */
  message: string;
  sender: {
    attendeeId: string | null;
    attendeeName: string | null;
    attendeeProviderId: AttendeeProviderId;
  };
  timestamp: string;
}

export interface AccountStatusInbound {
  accountId: string;
  accountType: string | null;
  status: string;
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

function configuredSecret(): string | null {
  const raw = process.env.UNIPILE_WEBHOOK_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function recordDrop(reason: InboundDropReason, messageId: string | null = null): void {
  drops.push({ reason, at: Date.now(), messageId });
  if (drops.length > DROP_CAP) drops.splice(0, drops.length - DROP_CAP);
  console.info(`[unipile] inbound dropped: ${reason}`);
}

/**
 * Both unattributable drops are silent by design about their contents — a
 * WhatsApp payload holds a phone number and a person's message. The KEYS carry
 * no such thing, and they are the whole diagnosis: this bug cost an evening
 * because the log said "unknown-self" and not which fields had arrived.
 */
function reportUnattributable(reason: InboundDropReason, raw: unknown): void {
  const root = asRecord(raw);
  const top = root ? Object.keys(root).sort().join(",") : "(not an object)";
  const info = root ? asRecord(root.account_info) : null;
  const nested = info ? Object.keys(info).sort().join(",") : "(absent)";
  console.info(`[unipile] ${reason}: fields=[${top}] account_info=[${nested}]`);
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
  return new Set([whatsappAccountId(), calendarAccountId()]);
}

/** (1) The shared secret matches. No secret configured → refuse. */
export function secretMatches(provided: string | undefined): boolean {
  const expected = configuredSecret();
  if (!expected) return false;
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** (2) account_id is on the allowlist of accounts we operate, not merely present. */
export function accountIdIsOurs(accountId: unknown): boolean {
  if (typeof accountId !== "string" || accountId.length === 0) return false;
  return operatedAccountIds().has(accountId);
}

/**
 * (3) It is not our own echo. Sent messages arrive as message_received too.
 * There is no fromMe flag.
 */
export function isNotOurEcho(senderProviderId: unknown, ourUserId: unknown): boolean {
  if (typeof senderProviderId !== "string" || senderProviderId.length === 0) return false;
  if (typeof ourUserId !== "string" || ourUserId.length === 0) return false;
  return senderProviderId !== ourUserId;
}

/**
 * (3a) `is_sender` — the provider's own answer to "did this account send it".
 * WhatsApp sends 0 or 1. true means our echo, false means the visitor, and
 * null means the field was absent and the fallback below has to decide.
 * Anything unrecognised is null rather than false: guessing "not ours" about a
 * field we do not understand is the one wrong way to fail here.
 */
export function echoFlag(isSender: unknown): boolean | null {
  if (typeof isSender === "boolean") return isSender;
  if (typeof isSender === "number") return isSender !== 0;
  if (isSender === "0" || isSender === "false") return false;
  if (isSender === "1" || isSender === "true") return true;
  return null;
}

/**
 * Whether the payload says who we are on this account, which check (3) needs.
 *
 * Unipile's documented payload carries `account_info.user_id`, but its example
 * is a LINKEDIN account. It is ABSENT on WhatsApp — confirmed in production on
 * 9 Sep 2026, when a real booking confirmation was answered 200 and dropped as
 * "unknown-self" one millisecond later. So this is now the fallback, reached
 * only when `is_sender` is absent, and it still drops rather than guessing.
 */
export function selfIdKnown(ourUserId: unknown): boolean {
  return typeof ourUserId === "string" && ourUserId.length > 0;
}

/**
 * (4) chat_id is present, and equals the chat expected for whatever this
 * answers when `expected` is passed. A booking code from a different chat
 * than the one it was planted in is not a match. When no expected chat is
 * known yet (first inbound from a visitor), presence is the whole check.
 */
export function chatIdIsExpected(chatId: unknown, expected?: string): boolean {
  if (typeof chatId !== "string" || chatId.length === 0) return false;
  if (expected === undefined) return true;
  return chatId === expected;
}

/**
 * (5) message_id has not been seen. Five retries are guaranteed on any
 * non-200 within 30s. Looking up does not record; call rememberMessageId
 * only after the other checks pass, so a dropped payload cannot burn the id.
 */
export function messageIdIsNew(messageId: unknown, now = Date.now()): boolean {
  if (typeof messageId !== "string" || messageId.length === 0) return false;
  pruneSeen(now);
  return !seenMessageIds.has(messageId);
}

export function rememberMessageId(messageId: string, now = Date.now()): void {
  pruneSeen(now);
  seenMessageIds.set(messageId, now);
}

/** (6) event === message_received. The other five events are not messages. */
export function eventIsMessageReceived(event: unknown): boolean {
  return event === "message_received";
}

/** (7) timestamp is recent. A reconnect delivers a burst from the disconnected period. */
export function timestampIsRecent(timestamp: unknown, now = Date.now()): boolean {
  if (typeof timestamp !== "string" || timestamp.length === 0) return false;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return false;
  if (ms > now + TIMESTAMP_FUTURE_SLACK_MS) return false;
  return now - ms <= INBOUND_MAX_AGE_MS;
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

function parseMessagePayload(raw: unknown): {
  accountId: unknown;
  chatId: unknown;
  messageId: unknown;
  message: unknown;
  event: unknown;
  isSender: unknown;
  timestamp: unknown;
  senderProviderId: unknown;
  senderAttendeeId: unknown;
  senderName: unknown;
  ourUserId: unknown;
} | null {
  const root = asRecord(raw);
  if (!root) return null;
  const sender = asRecord(root.sender);
  const accountInfo = asRecord(root.account_info);
  return {
    accountId: root.account_id,
    chatId: root.chat_id,
    messageId: root.message_id,
    message: root.message,
    /* The messaging webhook's field list names this `event_type`; the payload
       observed on 9 Sep 2026 carried `event`. Accept either rather than bet on
       which one a given source sends. */
    event: root.event ?? root.event_type,
    isSender: root.is_sender,
    timestamp: root.timestamp,
    senderProviderId: sender?.attendee_provider_id,
    senderAttendeeId: sender?.attendee_id,
    senderName: sender?.attendee_name,
    ourUserId: accountInfo?.user_id,
  };
}

/**
 * Run the seven checks. Secret failure is unauthorized (401). Everything
 * else is recorded and dropped, and the caller still answers 200. The body
 * is read from `message`, never from `text`.
 */
export function acceptUnipileInbound(raw: unknown, providedSecret: string | undefined): InboundResult {
  if (!secretMatches(providedSecret)) {
    recordDrop("secret");
    return { authorized: false, reason: "secret" };
  }

  const accountStatus = parseAccountStatus(raw);
  if (accountStatus) {
    /* The owner's rule is about every inbound payload, not only messages. An
       account-status body was accepted on the secret alone, so anything
       holding the secret could report a status for an account that is not
       ours and have it logged as though it were. */
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
  const flagged = echoFlag(parsed.isSender);
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
  /* isNotOurEcho was also the only thing insisting on a sender. On the
     is_sender path nothing has looked at it yet, and the room would go on to
     name the author from a field that is not there. */
  if (!asString(parsed.senderProviderId)) {
    reportUnattributable("unknown-sender", raw);
    recordDrop("unknown-sender", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "unknown-sender" };
  }
  if (!chatIdIsExpected(parsed.chatId)) {
    recordDrop("chat", asString(parsed.messageId));
    return { authorized: true, kind: "dropped", reason: "chat" };
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
  return {
    authorized: true,
    kind: "message",
    message: {
      accountId: parsed.accountId as string,
      chatId: parsed.chatId as string,
      messageId,
      message: parsed.message,
      sender: {
        attendeeId: asString(parsed.senderAttendeeId),
        attendeeName: senderName,
        attendeeProviderId: parseAttendeeProviderId(parsed.senderProviderId as string),
      },
      timestamp: parsed.timestamp as string,
    },
  };
}

/**
 * After the HTTP handler has already answered 200. Matcher failures stay here.
 */
export function dispatchInbound(result: InboundResult): void {
  if (!result.authorized) return;
  if (result.kind === "account_status") {
    const status = result.status;
    if (status.status !== "OK" && status.status !== "CREATION_SUCCESS" && status.status !== "RECONNECTED" && status.status !== "SYNC_SUCCESS") {
      console.error(`[unipile] account status ${status.status} on ${status.accountId}`);
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
