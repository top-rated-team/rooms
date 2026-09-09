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
import { BOOKING_CODE_RE, extractBookingCode } from "./code";
import {
  HOLD_TTL_MS,
  bindHoldChat,
  getHold,
  holdToResponse,
  markHoldBooked,
  placeHold,
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

export function getBookingConfirmed(codeRaw: string, now = Date.now()): BookingConfirmedResponse {
  const code = codeRaw.trim().toUpperCase();
  const row = getHold(code);
  if (!row) return { confirmed: false };
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

function reminderText(hold: { startsAt: string; timezone: string; meetUrl: string | null }): string {
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
  if (hold.meetUrl) return `The call is booked for ${when}. Google Meet: ${hold.meetUrl}`;
  return `The call is booked for ${when}.`;
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
  invalidateSlotsCache();

  const proved = getHold(code);
  if (!proved?.chatId) return;
  await sendInChat({ chatId: proved.chatId, text: reminderText(proved) }, fetchImpl);
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
