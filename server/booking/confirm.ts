/**
 * Match the inbound WhatsApp that carries a planted booking code, create the
 * event, and answer GET /api/booking/confirmed. The seven inbound checks
 * belong to server/whatsapp/; this file registers a matcher and does
 * not parse a webhook itself.
 *
 * confirmed means the booking exists — the calendar event was written —
 * not that a message arrived. If the hold expires unproven, nothing was
 * booked.
 *
 * Reminders follow the route the visitor used: WhatsApp to the chat that
 * proved it. Never LinkedIn. Never a new chat to a stranger.
 *
 * The other proof is the emailed link of a time picked inside an email
 * (confirm-email.ts). confirmEmailHold writes that event, with the address on
 * it, so the invite Google sends is the one reminder there is.
 */

import type { BookingConfirmedResponse, BookingDay, CreateBookingResponse, EmailHoldStatusResponse } from "@shared/api";
import { registerInboundMatcher, sendMessage, type AcceptedInboundMessage } from "../whatsapp";
import { SLOT_TAKEN_LINE, createBookingEvent } from "./calendar";
import { available as gcalAvailable, getOurCalendar, queryFreeBusy, unavailableLine as gcalUnavailableLine } from "./gcal";
import { BOOKING_CODE_RE, extractBookingCode, mintBookingCode } from "./code";
import {
  HOLD_TTL_MS,
  bindHoldChat,
  bookingReturnUrl,
  getHold,
  getHoldByToken,
  holdExpired,
  holdToResponse,
  markHoldBooked,
  placeHold,
  recordBooking,
  releaseHold,
  liveBookingsHaveEvent,
  resetHoldsForTests,
} from "./hold";
import { SLOT_MINUTES, getBookingSlots, invalidateSlotsCache, overlaps, wallClockToUtc } from "./slots";

export const BOOKING_CODE_TTL_MS = HOLD_TTL_MS;

let matcherInstalled = false;
let eventFetch: typeof fetch = fetch;

export function resetBookingCodesForTests(): void {
  matcherInstalled = false;
  eventFetch = fetch;
  confirming.clear();
  resetHoldsForTests();
}

export function setBookingEventFetchForTests(impl: typeof fetch): void {
  eventFetch = impl;
}

/**
 * Test seam: plants a hold so inbound matcher tests have a code to prove.
 * Production holds come from POST /api/booking with no address.
 */
export function plantBookingCode(now = Date.now()): { code: string; url: string } {
  /*
   * TOMORROW, not a date typed into the source. It was pinned to 2026-09-10,
   * and on 13 September the fixture was three days in the past — which nothing
   * noticed until getBookingConfirmed started asking whether the booking is
   * still live, and then two tests failed for a reason that had nothing to do
   * with what they were testing. A fixture with a calendar date in it rots on
   * a schedule nobody is watching.
   */
  const day = new Date(now + 24 * 60 * 60_000);
  const date = day.toISOString().slice(0, 10);
  const times = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];
  for (const time of times) {
    const held = placeHold(
      {
        date,
        time,
        name: "Visitor",
        topic: "call",
        timezone: "Europe/Bratislava",
        startsAt: `${date}T${time}:00.000Z`,
      },
      now,
    );
    if (!("taken" in held)) {
      const body = holdToResponse(held);
      return { code: body.whatsapp.code, url: body.whatsapp.url };
    }
  }
  return { code: "", url: "" };
}

/**
 * The stored booking a proved hold turned into, if it is still live.
 *
 * A hold and its booking no longer share a code — the booking's is minted
 * fresh so the broadcast hold code cannot cancel anything — so they are
 * matched on the event they both point at.
 */
function bookingForHold(hold: { eventId: string | null }, now: number): boolean {
  if (!hold.eventId) return false;
  return liveBookingsHaveEvent(hold.eventId, now);
}

export function getBookingConfirmed(codeRaw: string, now = Date.now()): BookingConfirmedResponse {
  const code = codeRaw.trim().toUpperCase();
  const row = getHold(code);
  if (!row) return { confirmed: false };
  /* THE HOLD OUTLIVES THE BOOKING IT PROVED. It stays in the sweep window for
     three TTLs, so a booking cancelled a minute after it was made kept
     answering "confirmed", with its start time and its Meet link, for the
     next fifteen minutes — to the popup that was still polling, and to
     anybody who had the hold code. The booking store is what knows whether
     the call still stands, so ask it. */
  if (row.confirmedAt && row.eventId && !bookingForHold(row, now)) {
    return { confirmed: false };
  }
  if (row.confirmedAt && row.eventId) {
    return {
      confirmed: true,
      at: row.confirmedAt,
      meetUrl: row.meetUrl,
      startsAt: row.startsAt,
      timezone: row.timezone,
      /* An email hold is written with its address on the event, so Google
         has sent the invite; a WhatsApp one has nobody to invite. */
      invited: row.via === "email",
    };
  }
  if (holdExpired(row, now)) return { confirmed: false, expired: true };
  return { confirmed: false };
}

function reminderText(hold: {
  startsAt: string;
  timezone: string;
  meetUrl: string | null;
}, returnCode: string): string {
  const when = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: hold.timezone,
    timeZoneName: "short",
  }).format(new Date(hold.startsAt));
  const parts = [`The call is booked for ${when}.`];
  if (hold.meetUrl) parts.push(`Google Meet: ${hold.meetUrl}`);
  /* The RETURN code, which is not the hold's. */
  const back = bookingReturnUrl(returnCode);
  if (back) parts.push(`To change or cancel: ${back}`);
  return parts.join(" ");
}

export async function proveHeldBooking(
  message: AcceptedInboundMessage,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const code = extractBookingCode(message.message);
  if (!code) return;
  const fetchImpl = opts.fetchImpl ?? eventFetch;
  const now = Date.now();
  const bound = bindHoldChat(code, message.chatId, now);
  if (!bound) return;
  if (bound.eventId) return;

  let calendarId = "";
  if (gcalAvailable()) {
    const primary = await getOurCalendar(fetchImpl);
    if (!primary.ok) return;
    calendarId = primary.calendar.id;
  }
  const starts = wallClockToUtc(bound.date, bound.time, bound.timezone);
  if (!starts) return;
  const ends = new Date(starts.getTime() + SLOT_MINUTES * 60_000);

  const created = await createBookingEvent(
    {
      calendarId,
      timezone: bound.timezone,
      starts,
      ends,
      name: bound.name,
      topic: bound.topic,
    },
    fetchImpl,
  );
  if (!created.ok) return;

  markHoldBooked(code, {
    eventId: created.eventId,
    meetUrl: created.meetUrl,
    at: message.timestamp,
  });

  const proved = getHold(code);
  if (!proved) return;
  /*
   * A FRESH CODE, not the hold's own. The hold's code was printed in a box on
   * the popup, drawn into a QR the copy invites anyone to scan, and sent
   * through WhatsApp — it is a one-shot inbound matcher token and it has been
   * broadcast. Reusing it here made every screen that ever showed it a
   * standing grant to read this booking's Meet link, move it, or delete it,
   * for the life of the call. The address path already mints its own and
   * never renders it; this now does the same, and the new one reaches the
   * visitor only in the message below, which goes to the chat that proved it
   * and to no other.
   */
  const returnCode = mintBookingCode();
  recordBooking({
    code: returnCode,
    eventId: created.eventId,
    calendarId,
    date: proved.date,
    time: proved.time,
    startsAt: proved.startsAt,
    timezone: proved.timezone,
    meetUrl: created.meetUrl,
    invited: false,
    email: null,
    chatId: proved.chatId,
    name: proved.name,
    topic: proved.topic,
    createdAt: Date.parse(message.timestamp) || Date.now(),
    cancelledAt: null,
  });
  invalidateSlotsCache();

  if (!proved.chatId) return;
  await sendMessage({ chatId: proved.chatId, text: reminderText(proved, returnCode) }, fetchImpl);
}

/* ------------------------------ email proof ------------------------------- */

export const EMAIL_LINK_UNKNOWN_LINE = "This confirmation link is not one we know. Pick a time again.";
export const EMAIL_LINK_EXPIRED_LINE = "This link was not used in time, so nothing was booked and the time is free again.";

/** What the emailed link stands for, for the popup to show before it asks. */
export function emailHoldStatus(token: string, now = Date.now()): EmailHoldStatusResponse {
  const row = token ? getHoldByToken(token, now) : undefined;
  if (!row || row.via !== "email") return { status: "unknown" };
  if (row.eventId) {
    /* Cancelled since: the link must not go on saying the call stands. */
    if (!liveBookingsHaveEvent(row.eventId, now)) return { status: "unknown" };
    return { status: "confirmed", startsAt: row.startsAt, timezone: row.timezone };
  }
  if (holdExpired(row, now)) return { status: "expired" };
  return {
    status: "pending",
    startsAt: row.startsAt,
    timezone: row.timezone,
    expiresAt: new Date(row.createdAt + row.ttlMs).toISOString(),
    email: row.email ?? "",
  };
}

export type ConfirmEmailHoldResult =
  | { ok: true; status: 200 | 201; body: CreateBookingResponse }
  | { ok: false; status: 404 | 410 | 503; error: string }
  | { ok: false; status: 409; error: string; days: BookingDay[] };

/* A double click, or the link opened in two tabs, must write one event. The
   second call waits for the first and gets its answer. */
const confirming = new Map<string, Promise<ConfirmEmailHoldResult>>();

export function confirmEmailHold(
  tokenRaw: unknown,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ConfirmEmailHoldResult> {
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  const pending = confirming.get(token);
  if (pending) return pending;
  const run = writeEmailHold(token, opts).finally(() => confirming.delete(token));
  confirming.set(token, run);
  return run;
}

async function writeEmailHold(
  token: string,
  opts: { fetchImpl?: typeof fetch; now?: Date },
): Promise<ConfirmEmailHoldResult> {
  const fetchImpl = opts.fetchImpl ?? eventFetch;
  const now = opts.now ?? new Date();
  const row = token ? getHoldByToken(token, now.getTime()) : undefined;
  if (!row || row.via !== "email") return { ok: false, status: 404, error: EMAIL_LINK_UNKNOWN_LINE };

  if (row.eventId) {
    if (!liveBookingsHaveEvent(row.eventId, now.getTime())) {
      return { ok: false, status: 404, error: EMAIL_LINK_UNKNOWN_LINE };
    }
    /* Already confirmed. No return code the second time: the first answer
       carried it, and a link that has been in an inbox is not a credential
       for moving or cancelling the call. */
    return {
      ok: true,
      status: 200,
      body: {
        booked: true,
        code: "",
        startsAt: row.startsAt,
        timezone: row.timezone,
        meetUrl: row.meetUrl,
        invited: true,
        whatsapp: { url: "", code: "" },
      },
    };
  }
  if (holdExpired(row, now.getTime())) return { ok: false, status: 410, error: EMAIL_LINK_EXPIRED_LINE };

  if (!gcalAvailable()) return { ok: false, status: 503, error: gcalUnavailableLine() };
  const primary = await getOurCalendar(fetchImpl);
  if (!primary.ok) return { ok: false, status: 503, error: primary.line };
  const starts = wallClockToUtc(row.date, row.time, row.timezone);
  if (!starts) return { ok: false, status: 404, error: EMAIL_LINK_UNKNOWN_LINE };
  const ends = new Date(starts.getTime() + SLOT_MINUTES * 60_000);

  /* The hold kept other visitors off this time for half an hour. It did not
     keep the owner off it: something he put in his own calendar meanwhile is
     only visible here. */
  const busy = await queryFreeBusy({ start: starts.toISOString(), end: ends.toISOString() }, fetchImpl);
  if (!busy.ok) return { ok: false, status: 503, error: busy.error };
  if (busy.busy.some((range) => overlaps(range.start, range.end, starts.getTime(), ends.getTime()))) {
    releaseHold(row.code);
    invalidateSlotsCache();
    const wider = await getBookingSlots(row.date, 14, { fetchImpl, now });
    return { ok: false, status: 409, error: SLOT_TAKEN_LINE, days: wider.ok ? wider.body.days : [] };
  }

  const created = await createBookingEvent(
    {
      calendarId: primary.calendar.id,
      timezone: row.timezone,
      starts,
      ends,
      name: row.name,
      topic: row.topic,
      email: row.email ?? undefined,
    },
    fetchImpl,
  );
  if (!created.ok) return { ok: false, status: 503, error: created.error };

  markHoldBooked(row.code, { eventId: created.eventId, meetUrl: created.meetUrl, at: now.toISOString() });
  /* A fresh code, as on the WhatsApp route: the way back is minted when the
     booking exists and reaches only the browser that confirmed it. */
  const code = mintBookingCode();
  recordBooking({
    code,
    eventId: created.eventId,
    calendarId: primary.calendar.id,
    date: row.date,
    time: row.time,
    startsAt: row.startsAt,
    timezone: row.timezone,
    meetUrl: created.meetUrl,
    invited: created.invited,
    email: row.email,
    chatId: null,
    name: row.name,
    topic: row.topic,
    createdAt: now.getTime(),
    cancelledAt: null,
  });
  invalidateSlotsCache();
  return {
    ok: true,
    status: 201,
    body: {
      booked: true,
      code,
      startsAt: row.startsAt,
      timezone: row.timezone,
      meetUrl: created.meetUrl,
      invited: created.invited,
      whatsapp: { url: "", code },
    },
  };
}

function onBookingMessage(message: AcceptedInboundMessage): void {
  void proveHeldBooking(message);
}

export function installBookingInbound(): void {
  if (matcherInstalled) return;
  matcherInstalled = true;
  registerInboundMatcher(onBookingMessage);
}

/** Test seam: the planted regex is the same object the matcher uses. */
export { BOOKING_CODE_RE };
