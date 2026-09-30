/**
 * Reply to book: the email a recipient sends to a time in the block books it.
 *
 * The block (shared/booking-widget.ts) makes each time a mailto: to an address
 * that names the slot — call-2026-09-30-1030@<BOOKING_INBOX_DOMAIN>, see
 * shared/booking-reply.ts. Resend receives mail for that domain and posts an
 * `email.received` webhook to POST /api/booking/inbound-email. From there:
 *
 *   1. The webhook's own fields are not believed. Its email id is looked up
 *      with Resend's API, under our key; a forged webhook names an email that
 *      is not there, and whatever it claimed about sender and slot is never
 *      read. (server/index.ts is frozen and parses JSON before any route, so
 *      the raw body a signature check needs does not reach this file — and
 *      asking Resend is the stronger proof anyway.)
 *   2. The slot comes from the address it was sent to, the person from the
 *      address it came from. Mail that is ours, automatic, or not to a slot
 *      address is left alone.
 *   3. An address that already has a call coming up is told so rather than
 *      given a second one: one sender cannot fill the calendar.
 *   4. postBooking writes it — the calendar is asked again, and the sender's
 *      address goes on the event so Google sends the invite — and the sender
 *      gets a reply: booked, with the way to change or cancel it; or taken,
 *      with the times still free, each again a time to write to.
 *
 * Each email is handled once, however often the webhook is retried. A failure
 * that is worth retrying (the calendar or Resend briefly away) answers 503 so
 * that Resend tries again; everything else answers 200.
 *
 * What this does not do: check SPF or DKIM. Someone who forges the From line
 * can book a call in another person's name, and that person gets an invite
 * they can decline — the same as typing their address into the popup.
 */

import type { BookingDay, BookingSlotsResponse } from "@shared/api";
import { bookingLinkEmail } from "@shared/booking-link";
import { parseReplyAddress } from "@shared/booking-reply";
import { buildBookingWidget, widgetDayLabel } from "@shared/booking-widget";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import { mailFrom } from "../mail-from";
import { postBooking } from "./calendar";
import { sendBookingLetter } from "./confirm-email";
import { bookingReturnUrl, listStoredBookings } from "./hold";
import { SLOT_MINUTES, getBookingSlots } from "./slots";

const RESEND_API = "https://api.resend.com";
const REQUEST_MS = 10_000;
const SEEN_LIMIT = 500;

export const REPLY_TO_BOOK_NO_DOMAIN_LINE =
  "Reply to book is off: BOOKING_INBOX_DOMAIN is not set, so a time in the email is a link to the booking popup instead of an address to write to.";
export const REPLY_TO_BOOK_NO_KEY_LINE =
  "Reply to book is off: RESEND_API_KEY is not set, so the mail that books a time could not be read.";

export type InboundOutcome =
  | "booked"
  | "taken"
  | "already-booked"
  | "ignored"
  | "not-a-slot"
  | "unknown-email"
  | "off";

export interface InboundResult {
  status: 200 | 400 | 503;
  outcome: InboundOutcome;
  /** What happened, for the log. Never the sender's address. */
  detail?: string;
}

/* ------------------------------- config ----------------------------------- */

function inboxDomain(): string | null {
  const raw = process.env.BOOKING_INBOX_DOMAIN?.trim().toLowerCase().replace(/^@/, "") ?? "";
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(raw) ? raw : null;
}

/** Whether a time in the block is an address to write to here, and if not, why. */
export function replyToBook(): { on: true; domain: string } | { on: false; line: string } {
  const domain = inboxDomain();
  if (!domain) return { on: false, line: REPLY_TO_BOOK_NO_DOMAIN_LINE };
  if (!process.env.RESEND_API_KEY?.trim()) return { on: false, line: REPLY_TO_BOOK_NO_KEY_LINE };
  return { on: true, domain };
}

/* ---------------------------- reading the mail ----------------------------- */

interface ReceivedEmail {
  from: string;
  to: string[];
  subject: string;
  headers: Record<string, string>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function addresses(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.filter((part): part is string => typeof part === "string");
  return [];
}

/* Headers arrive as an object or as a list of { name, value }; either way, lower-cased names. */
function headerMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    for (const entry of value) {
      const row = asRecord(entry);
      if (row && typeof row.name === "string" && typeof row.value === "string") out[row.name.toLowerCase()] = row.value;
    }
    return out;
  }
  for (const [name, raw] of Object.entries(asRecord(value) ?? {})) {
    if (typeof raw === "string") out[name.toLowerCase()] = raw;
  }
  return out;
}

async function fetchReceivedEmail(
  emailId: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; email: ReceivedEmail } | { ok: false; status: 404 | 503; detail: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, status: 503, detail: "no RESEND_API_KEY" };
  let response: Response;
  try {
    response = await fetchImpl(`${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_MS),
    });
  } catch (error) {
    return { ok: false, status: 503, detail: `Resend unreachable: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (response.status === 404) return { ok: false, status: 404, detail: "Resend has no such received email" };
  if (response.status === 401 || response.status === 403) {
    /* A sending-only key cannot read received mail. Say which, once per email. */
    return { ok: false, status: 503, detail: `Resend refused the key (${response.status}): it needs full access to read received mail` };
  }
  if (!response.ok) return { ok: false, status: 503, detail: `Resend answered ${response.status}` };
  const body = asRecord(await response.json().catch(() => null));
  if (!body) return { ok: false, status: 503, detail: "Resend answered with something that is not JSON" };
  return {
    ok: true,
    email: {
      from: typeof body.from === "string" ? body.from : "",
      to: [...addresses(body.to), ...addresses(body.cc)],
      subject: typeof body.subject === "string" ? body.subject : "",
      headers: headerMap(body.headers),
    },
  };
}

function displayName(from: string): string | null {
  const match = /^\s*"?([^"<]+?)"?\s*<[^<>]+>\s*$/.exec(from);
  return match?.[1]?.trim() || null;
}

/* Out-of-office answers and bounces are mail to a slot address too. */
function isAutomatic(email: ReceivedEmail): boolean {
  const auto = email.headers["auto-submitted"]?.toLowerCase();
  if (auto && auto !== "no") return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(email.headers.precedence ?? "")) return true;
  if (email.headers["x-autoreply"] || email.headers["x-autorespond"]) return true;
  return /^(auto(matic)?[ -]?(reply|response)|out of (the )?office|undeliverable|delivery status notification)/i.test(email.subject.trim());
}

/* ------------------------------- the letters ------------------------------- */

function hostName(): string {
  const contract = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;
  return (contract.displayName ?? contract.legalName).trim();
}

function formatWhen(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(new Date(startsAt));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function paragraphs(lines: string[], extraHtml = ""): string {
  return (
    `<div style="font-family:'Newsreader',Georgia,'Times New Roman',serif;font-size:16px;line-height:24px;color:#1B1713;max-width:560px;">` +
    lines.map((line) => `<p style="margin:0 0 16px 0;">${escapeHtml(line)}</p>`).join("") +
    extraHtml +
    `</div>`
  );
}

function freeTimesBlock(slots: BookingSlotsResponse, domain: string, recipient: string) {
  const base = process.env.PUBLIC_BASE_URL?.trim() || "https://top-rated.team";
  return buildBookingWidget({
    baseUrl: base,
    slots,
    show: "times",
    days: 3,
    timesPerDay: 6,
    recipient,
    hostName: hostName(),
    replyTo: { domain },
    liveImages: true,
  });
}

/* ------------------------------ the handler -------------------------------- */

const seen = new Map<string, InboundResult>();
const inflight = new Map<string, Promise<InboundResult>>();

export function resetReplyToBookForTests(): void {
  seen.clear();
  inflight.clear();
}

function remember(emailId: string, result: InboundResult): InboundResult {
  /* A retryable failure is not remembered: the retry must be allowed to try. */
  if (result.status !== 503) {
    seen.set(emailId, result);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.keys().next().value!);
  }
  return result;
}

export function handleInboundEmail(
  raw: unknown,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<InboundResult> {
  const root = asRecord(raw);
  const data = asRecord(root?.data);
  if (root?.type !== "email.received") return Promise.resolve({ status: 200, outcome: "ignored", detail: "not an email.received event" });
  const emailId = typeof data?.email_id === "string" ? data.email_id.trim() : "";
  if (!emailId) return Promise.resolve({ status: 400, outcome: "ignored", detail: "no email_id" });
  const done = seen.get(emailId);
  /* Said as a repeat, so the log never reads like a second booking. */
  if (done) return Promise.resolve({ ...done, detail: "already handled" });
  const running = inflight.get(emailId);
  if (running) return running;
  const run = handle(emailId, opts)
    .then((result) => remember(emailId, result))
    .finally(() => inflight.delete(emailId));
  inflight.set(emailId, run);
  return run;
}

async function handle(emailId: string, opts: { fetchImpl?: typeof fetch; now?: Date }): Promise<InboundResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const config = replyToBook();
  if (!config.on) return { status: 200, outcome: "off", detail: config.line };

  const fetched = await fetchReceivedEmail(emailId, fetchImpl);
  if (!fetched.ok) {
    return fetched.status === 404
      ? { status: 200, outcome: "unknown-email", detail: fetched.detail }
      : { status: 503, outcome: "ignored", detail: fetched.detail };
  }
  const email = fetched.email;

  const slot = email.to.map((address) => parseReplyAddress(address, config.domain)).find(Boolean) ?? null;
  if (!slot) return { status: 200, outcome: "not-a-slot" };

  const sender = bookingLinkEmail(email.from)?.toLowerCase() ?? null;
  if (!sender) return { status: 200, outcome: "ignored", detail: "no sender address" };
  const ours = mailFrom()?.toLowerCase() ?? "";
  if (sender.endsWith(`@${config.domain}`) || (ours && ours.includes(`<${sender}>`)) || ours === sender) {
    return { status: 200, outcome: "ignored", detail: "our own mail" };
  }
  if (isAutomatic(email)) return { status: 200, outcome: "ignored", detail: "an automatic reply" };

  const upcoming = listStoredBookings().find(
    (row) => row.cancelledAt == null && row.email?.toLowerCase() === sender && Date.parse(row.startsAt) > now.getTime(),
  );
  if (upcoming) {
    const when = formatWhen(upcoming.startsAt, upcoming.timezone);
    const back = bookingReturnUrl(upcoming.code);
    const lines = [
      `You already have a call with ${hostName()} booked for ${when}, so this email did not book another one.`,
      back ? `To move it or cancel it: ${back}` : "Reply to this email to move it.",
    ];
    await sendBookingLetter({ to: sender, subject: `You already have a call: ${when}`, text: lines.join("\n\n"), html: paragraphs(lines) }, fetchImpl);
    return { status: 200, outcome: "already-booked" };
  }

  const name = displayName(email.from) ?? sender.split("@")[0] ?? "Visitor";
  const result = await postBooking(
    { date: slot.date, time: slot.time, name, topic: "call", email: sender },
    { fetchImpl, now, host: process.env.PUBLIC_BASE_URL?.trim() },
  );

  if (result.ok && result.body.booked) {
    const booked = result.body;
    const when = formatWhen(booked.startsAt, booked.timezone);
    const back = booked.code ? bookingReturnUrl(booked.code) : null;
    const lines = [
      `Your ${SLOT_MINUTES}-minute call with ${hostName()} is booked for ${when}.`,
      booked.invited ? "Google is sending the calendar invite to this address." : "",
      booked.meetUrl ? `Google Meet: ${booked.meetUrl}` : "",
      back ? `To move it or cancel it: ${back}` : "",
    ].filter(Boolean);
    await sendBookingLetter({ to: sender, subject: `Booked: ${when}`, text: lines.join("\n\n"), html: paragraphs(lines) }, fetchImpl);
    return { status: 200, outcome: "booked" };
  }

  if (!result.ok && result.status === 409) {
    const fresh = await getBookingSlots("", 14, { fetchImpl, now });
    const slots: BookingSlotsResponse | null = fresh.ok ? fresh.body : null;
    const picked = `${widgetDayLabel(slot.date)} at ${slot.time}`;
    const lines = [`${picked} is not free any more, so this email did not book it.`];
    const free: BookingDay[] = slots?.days.filter((day) => day.slots.length > 0) ?? [];
    if (slots && free.length > 0) {
      const block = freeTimesBlock(slots, config.domain, sender);
      lines.push("These times are free. Pick one, and send the email it opens:");
      await sendBookingLetter(
        { to: sender, subject: `That time was taken: ${picked}`, text: `${lines.join("\n\n")}\n\n${block.text}`, html: paragraphs(lines, block.html) },
        fetchImpl,
      );
    } else {
      lines.push("There are no free times in the next two weeks. Reply to this email and we will find one.");
      await sendBookingLetter({ to: sender, subject: `That time was taken: ${picked}`, text: lines.join("\n\n"), html: paragraphs(lines) }, fetchImpl);
    }
    return { status: 200, outcome: "taken" };
  }

  /* The calendar, or something under it, is away. Resend will try again. */
  return { status: 503, outcome: "ignored", detail: result.ok ? "held rather than booked" : result.error };
}
