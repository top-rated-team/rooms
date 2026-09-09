/**
 * Write a booking onto the primary calendar. There is no visitor-calendar
 * connection: the cheap 95% of two-way sync is notify: true, so Google emails
 * the invite and the visitor's own client does the conflict check.
 *
 * 201 from Unipile is only {event_id}. The Meet URL, if any, is read back
 * with GET. email is the only optional field.
 *
 * WITH an address the event is created immediately, notify true. WITHOUT an
 * address this file does not create an event: hold.ts reserves the slot and
 * confirm.ts writes the event after WhatsApp proves it. A hold is not a
 * booking.
 */

import type {
  BookingConflictResponse,
  CreateBookingRequest,
  CreateBookingResponse,
  HoldBookingResponse,
} from "@shared/api";
import {
  createCalendarEvent,
  getCalendarEvent,
  getPrimaryCalendar,
} from "../unipile/calendar";
import { available, unavailableLine } from "../unipile/client";
import {
  ADDRESS_REQUIRED_LINE,
  bookingEventDescription,
  holdToResponse,
  placeHold,
  slotIsHeld,
  whatsappGateAllowed,
} from "./hold";
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
 * is not used as a stand-in attendee: an empty attendee list works, and
 * putting the host on his own event mailed him an invitation to it.
 */
export const HOST_ATTENDEE_EMAIL = "dan@top-rated.team";
export const SLOT_TAKEN_LINE = "That time has just been taken. Here is what is still free.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PostBookingResult =
  | { ok: true; status: 201; body: CreateBookingResponse | HoldBookingResponse }
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
   * `attendees: []` IS accepted. Probed against the real tenant on 2026-09-09:
   * a POST with an empty array returned 201. `notify` goes false with it —
   * there is nobody to notify, and naming the organiser as the sole attendee
   * mailed him an invitation to his own event.
   */
  return { invited: false, attendees: [], notify: false };
}

export async function createBookingEvent(
  input: {
    calendarId: string;
    timezone: string;
    starts: Date;
    ends: Date;
    name: string;
    topic: string;
    email?: string;
    visitorProfile?: { name: string; url: string };
  },
  fetchImpl: typeof fetch,
): Promise<{ ok: true; eventId: string; meetUrl: string | null; invited: boolean } | { ok: false; error: string }> {
  const { invited, attendees, notify } = attendeesFor(input.email);
  const created = await createCalendarEvent(
    {
      calendarId: input.calendarId,
      title: `Call with ${input.name}`,
      body: bookingEventDescription({ topic: input.topic, visitorProfile: input.visitorProfile }),
      attendees,
      start: { dateTime: input.starts.toISOString(), timeZone: input.timezone },
      end: { dateTime: input.ends.toISOString(), timeZone: input.timezone },
      transparency: "opaque",
      conference: { provider: "google_meet" },
      notify,
    },
    fetchImpl,
  );
  if (!created.ok) return { ok: false, error: created.line };

  const fetched = await getCalendarEvent(input.calendarId, created.body.eventId, fetchImpl);
  const meetUrl = fetched.ok && fetched.body ? fetched.body.conferenceUrl : null;
  return { ok: true, eventId: created.body.eventId, meetUrl, invited };
}

export async function postBooking(
  raw: unknown,
  opts: { fetchImpl?: typeof fetch; now?: Date; host?: string } = {},
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

  const hasAddress = Boolean(input.email);
  if (!hasAddress && !whatsappGateAllowed(opts.host)) {
    return { ok: false, status: 503, error: ADDRESS_REQUIRED_LINE };
  }

  const primary = await getPrimaryCalendar(fetchImpl);
  if (!primary.ok) return { ok: false, status: 503, error: primary.line };

  const starts = wallClockToUtc(input.date, input.time, primary.calendar.timezone);
  if (!starts) return { ok: false, status: 503, error: "Need a date, a time, a name and a topic." };
  const ends = new Date(starts.getTime() + SLOT_MINUTES * 60_000);

  invalidateSlotsCache();
  const slots = await getBookingSlots(input.date, 1, { fetchImpl, now });
  if (!slots.ok) return { ok: false, status: 503, error: slots.error };
  if (!slotIsFree(slots.body, input.date, input.time) || slotIsHeld(input.date, input.time, now.getTime())) {
    const wider = await getBookingSlots(input.date, 14, { fetchImpl, now });
    const days = wider.ok ? wider.body.days : slots.body.days;
    return { ok: false, status: 409, body: { error: SLOT_TAKEN_LINE, days } };
  }

  if (!hasAddress) {
    const held = placeHold(
      {
        date: input.date,
        time: input.time,
        name: input.name,
        topic: input.topic,
        timezone: primary.calendar.timezone,
        startsAt: starts.toISOString(),
      },
      now.getTime(),
    );
    if ("taken" in held) {
      const wider = await getBookingSlots(input.date, 14, { fetchImpl, now });
      const days = wider.ok ? wider.body.days : slots.body.days;
      return { ok: false, status: 409, body: { error: SLOT_TAKEN_LINE, days } };
    }
    invalidateSlotsCache();
    return { ok: true, status: 201, body: holdToResponse(held) };
  }

  const created = await createBookingEvent(
    {
      calendarId: primary.calendar.id,
      timezone: primary.calendar.timezone,
      starts,
      ends,
      name: input.name,
      topic: input.topic,
      email: input.email,
    },
    fetchImpl,
  );
  if (!created.ok) return { ok: false, status: 503, error: created.error };

  invalidateSlotsCache();
  return {
    ok: true,
    status: 201,
    body: {
      booked: true,
      startsAt: starts.toISOString(),
      timezone: primary.calendar.timezone,
      meetUrl: created.meetUrl,
      invited: created.invited,
      /* Email is the confirmation channel. Do not hand the house WhatsApp
         number to a fork, and do not plant a hold against a slot already booked. */
      whatsapp: { url: "", code: "" },
    },
  };
}
