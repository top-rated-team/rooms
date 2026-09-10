/**
 * Match the inbound WhatsApp that carries a planted booking code, create the
 * event, and answer GET /api/booking/confirmed. The seven inbound checks
 * belong to server/unipile/inbound.ts; this file registers a matcher and does
 * not parse a webhook itself.
 *
 * confirmed means the booking exists — the calendar event was written —
 * not that a message arrived. If the hold expires unproven, nothing was
 * booked.
 *
 * Reminders follow the route the visitor used: WhatsApp to the chat that
 * proved it. Never LinkedIn. Never a new chat to a stranger.
 */

import type { BookingConfirmedResponse } from "@shared/api";
import { getPrimaryCalendar } from "../unipile/calendar";
import { registerInboundMatcher, type AcceptedInboundMessage } from "../unipile/inbound";
import { sendInChat } from "../unipile/messaging";
import { createBookingEvent } from "./calendar";
import { BOOKING_CODE_RE, extractBookingCode, mintBookingCode } from "./code";
import {
  HOLD_TTL_MS,
  bindHoldChat,
  bookingReturnUrl,
  getHold,
  holdToResponse,
  markHoldBooked,
  placeHold,
  recordBooking,
  liveBookingsHaveEvent,
  resetHoldsForTests,
} from "./hold";
import { SLOT_MINUTES, invalidateSlotsCache, wallClockToUtc } from "./slots";

export const BOOKING_CODE_TTL_MS = HOLD_TTL_MS;

let matcherInstalled = false;
let eventFetch: typeof fetch = fetch;

export function resetBookingCodesForTests(): void {
  matcherInstalled = false;
  eventFetch = fetch;
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
  const times = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];
  for (const time of times) {
    const held = placeHold(
      {
        date: "2026-09-10",
        time,
        name: "Visitor",
        topic: "call",
        timezone: "Europe/Bratislava",
        startsAt: "2026-09-10T12:00:00.000Z",
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
      invited: false,
    };
  }
  if (now - row.createdAt > HOLD_TTL_MS) return { confirmed: false, expired: true };
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

  const primary = await getPrimaryCalendar(fetchImpl);
  if (!primary.ok) return;
  const starts = wallClockToUtc(bound.date, bound.time, bound.timezone);
  if (!starts) return;
  const ends = new Date(starts.getTime() + SLOT_MINUTES * 60_000);

  const created = await createBookingEvent(
    {
      calendarId: primary.calendar.id,
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
    calendarId: primary.calendar.id,
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
  await sendInChat({ chatId: proved.chatId, text: reminderText(proved, returnCode) }, fetchImpl);
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
