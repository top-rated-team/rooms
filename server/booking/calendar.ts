/**
 * Write a booking onto the primary calendar. There is no visitor-calendar
 * connection: the cheap 95% of two-way sync is notify: true, so Google emails
 * the invite and the visitor's own client does the conflict check.
 *
 * 201 from Unipile is only {event_id}. The Meet URL, if any, is read back
 * with GET. email is the only optional field; without it the event is still
 * created, invited is false, and the host address satisfies attendees.
 */

import type { BookingConflictResponse, CreateBookingRequest, CreateBookingResponse } from "@shared/api";
import {
  createCalendarEvent,
  getCalendarEvent,
  getPrimaryCalendar,
} from "../unipile/calendar";
import { available, unavailableLine } from "../unipile/client";
import { plantBookingCode } from "./confirm";
import {
  SLOT_MINUTES,
  getBookingSlots,
  isCalendarDate,
  isWallClockTime,
  invalidateSlotsCache,
  slotIsFree,
  wallClockToUtc,
} from "./slots";

/**
 * Kept as the organiser's own address for anything that needs to name it. It
 * is no longer used as a stand-in attendee: an empty attendee list works, and
 * putting the host on his own event mailed him an invitation to it.
 */
export const HOST_ATTENDEE_EMAIL = "dan@top-rated.team";
export const SLOT_TAKEN_LINE = "That time has just been taken. Here is what is still free.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PostBookingResult =
  | { ok: true; status: 201; body: CreateBookingResponse }
  | { ok: false; status: 409; body: BookingConflictResponse }
  | { ok: false; status: 503; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parseCreateBooking(body: unknown): CreateBookingRequest | null {
  const record = asRecord(body);
  if (!record) return null;
  const date = asString(record.date);
  const time = asString(record.time);
  const name = asString(record.name);
  const topic = asString(record.topic);
  if (!date || !time || !name || !topic) return null;
  const emailRaw = typeof record.email === "string" ? record.email.trim() : "";
  const parsed: CreateBookingRequest = { date, time, name, topic };
  if (emailRaw) parsed.email = emailRaw;
  return parsed;
}

function attendeesFor(email: string | undefined): {
  invited: boolean;
  attendees: { email: string }[];
  notify: boolean;
} {
  if (email && EMAIL_RE.test(email)) {
    return { invited: true, attendees: [{ email }], notify: true };
  }
  /*
   * `attendees: []` IS accepted. This was the parcel's open question and it
   * was right to refuse to guess; the answer came from a probe against the
   * real tenant on 2026-09-09, where a POST with an empty array returned 201
   * and the event was created.
   *
   * And `notify` goes false with it. It used to be true unconditionally,
   * which put the host on his own event as a guest and then mailed him an
   * invitation to it — once per booking taken without an address. There is
   * nobody to notify when there is no attendee.
   */
  return { invited: false, attendees: [], notify: false };
}

export async function postBooking(
  raw: unknown,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<PostBookingResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  if (!available()) return { ok: false, status: 503, error: unavailableLine() };

  const input = parseCreateBooking(raw);
  if (!input || !isCalendarDate(input.date) || !isWallClockTime(input.time)) {
    return { ok: false, status: 503, error: "Need a date, a time, a name and a topic." };
  }
  if (input.email && !EMAIL_RE.test(input.email)) {
    return { ok: false, status: 503, error: "That email address is not one we can send an invite to." };
  }

  const primary = await getPrimaryCalendar(fetchImpl);
  if (!primary.ok) return { ok: false, status: 503, error: primary.line };

  const starts = wallClockToUtc(input.date, input.time, primary.calendar.timezone);
  if (!starts) return { ok: false, status: 503, error: "Need a date, a time, a name and a topic." };
  const ends = new Date(starts.getTime() + SLOT_MINUTES * 60_000);

  invalidateSlotsCache();
  const slots = await getBookingSlots(input.date, 1, { fetchImpl, now });
  if (!slots.ok) return { ok: false, status: 503, error: slots.error };
  if (!slotIsFree(slots.body, input.date, input.time)) {
    const wider = await getBookingSlots(input.date, 14, { fetchImpl, now });
    const days = wider.ok ? wider.body.days : slots.body.days;
    return { ok: false, status: 409, body: { error: SLOT_TAKEN_LINE, days } };
  }

  const { invited, attendees, notify } = attendeesFor(input.email);
  const created = await createCalendarEvent(
    {
      calendarId: primary.calendar.id,
      title: `Call with ${input.name}`,
      body: input.topic,
      attendees,
      start: { dateTime: starts.toISOString(), timeZone: primary.calendar.timezone },
      end: { dateTime: ends.toISOString(), timeZone: primary.calendar.timezone },
      transparency: "opaque",
      conference: { provider: "google_meet" },
      notify,
    },
    fetchImpl,
  );
  if (!created.ok) return { ok: false, status: 503, error: created.line };

  const fetched = await getCalendarEvent(primary.calendar.id, created.body.eventId, fetchImpl);
  const meetUrl = fetched.ok && fetched.body ? fetched.body.conferenceUrl : null;
  const whatsapp = plantBookingCode(now.getTime());
  invalidateSlotsCache();

  return {
    ok: true,
    status: 201,
    body: {
      booked: true,
      startsAt: starts.toISOString(),
      timezone: primary.calendar.timezone,
      meetUrl,
      invited,
      whatsapp,
    },
  };
}
