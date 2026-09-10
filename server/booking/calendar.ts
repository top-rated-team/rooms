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

import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import type {
  BookingConflictResponse,
  CancelBookingResponse,
  ChangeBookingRequest,
  CreateBookingRequest,
  CreateBookingResponse,
  ExistingBookingResponse,
  HoldBookingResponse,
} from "@shared/api";
import { calendarAccountId } from "../unipile/accounts";
import {
  createCalendarEvent,
  getCalendarEvent,
  getPrimaryCalendar,
} from "../unipile/calendar";
import { available, unipileRequest, unavailableLine } from "../unipile/client";
import { sendInChat } from "../unipile/messaging";
import { mintBookingCode, normalizeBookingCode } from "./code";
import {
  ADDRESS_REQUIRED_LINE,
  BOOKING_GONE_LINE,
  bookingEventDescription,
  existingBookingResponse,
  getStoredBooking,
  holdToResponse,
  markBookingCancelled,
  placeHold,
  recordBooking,
  slotIsHeld,
  updateStoredBooking,
  whatsappGateAllowed,
  type StoredBooking,
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

export type ChangeBookingResult =
  | { ok: true; status: 200; body: ExistingBookingResponse }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; body: BookingConflictResponse }
  | { ok: false; status: 503; error: string };

export type CancelBookingResult =
  | { ok: true; status: 200; body: CancelBookingResponse }
  | { ok: false; status: 404; error: string }
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

/**
 * What the two of us see in our calendars. The owner asked for the address on
 * the row because that is what he needs at a glance the morning of the call —
 * "Call with Dan" is four identical rows in a week and tells him nothing about
 * which one this is. Where there is no address (the WhatsApp route) the name
 * is all we were given, and it goes in the same slot rather than leaving a
 * dangling arrow. Read from the door so it cannot drift from the footer, the
 * invoices and the legal pages, which all name the business the same way.
 */
export function bookingEventTitle(input: { name: string; email?: string }): string {
  const other = (input.email ?? "").trim() || input.name.trim();
  /* displayName is optional on the type — a room with no door behind it may
     omit it — so fall back to the required legalName rather than to a
     literal that would drift from the door the day the name changes. */
  const ours = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;
  const us = ours.displayName ?? ours.legalName;
  return other ? `${us} <=> ${other}` : us;
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
      title: bookingEventTitle(input),
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

  const code = mintBookingCode();
  recordBooking({
    code,
    eventId: created.eventId,
    calendarId: primary.calendar.id,
    date: input.date,
    time: input.time,
    startsAt: starts.toISOString(),
    timezone: primary.calendar.timezone,
    meetUrl: created.meetUrl,
    invited: created.invited,
    email: input.email ?? null,
    chatId: null,
    name: input.name,
    topic: input.topic,
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
      startsAt: starts.toISOString(),
      timezone: primary.calendar.timezone,
      meetUrl: created.meetUrl,
      invited: created.invited,
      /* Email is the confirmation channel. The code is the return credential
         for this browser, not a WhatsApp path — url stays empty so a fork is
         never handed the house number. */
      whatsapp: { url: "", code },
    },
  };
}

export function getExistingBooking(codeRaw: string, now = Date.now()): ExistingBookingResponse {
  return existingBookingResponse(codeRaw, now);
}

export async function deleteCalendarEvent(
  input: { calendarId: string; eventId: string },
  fetchImpl: typeof fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await unipileRequest<unknown>(
    {
      method: "DELETE",
      path: `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      /* notify is NOT sent. The connector documents it as a body field of
         the CREATE call and documents no parameter but account_id on the
         delete — and this client refuses a body on a DELETE, so a query
         string was the only carrier available and it was a guess. An unknown
         query parameter is ignored, which is the quiet kind of wrong: the
         code looked as though it asked Google to tell the guest and it did
         not. The popup no longer promises that either. */
      query: { account_id: calendarAccountId() },
    },
    fetchImpl,
  );
  if (result.ok) return { ok: true };
  if (result.error.status === 404) return { ok: true };
  return { ok: false, error: result.line };
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

async function messageProvingChat(
  booking: StoredBooking,
  text: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (!booking.chatId) return;
  await sendInChat({ chatId: booking.chatId, text }, fetchImpl);
}

export function parseChangeBooking(body: unknown): ChangeBookingRequest | null {
  const record = asRecord(body);
  if (!record) return null;
  const code = normalizeBookingCode(typeof record.code === "string" ? record.code : "");
  const date = asString(record.date);
  const time = asString(record.time);
  if (!code || !date || !time) return null;
  return { code, date, time };
}

export function parseCancelBooking(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  return normalizeBookingCode(typeof record.code === "string" ? record.code : "");
}

/**
 * Move a booking. The new slot is re-checked as free before the old event
 * is released — losing the slot while moving it is worse than refusing.
 * The new event is written first; the old one is deleted after. That is
 * cancel-and-book in meaning, with the release last so a failed write
 * does not leave them with nothing.
 */
export async function changeBooking(
  raw: unknown,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ChangeBookingResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  if (!available()) return { ok: false, status: 503, error: unavailableLine() };

  const input = parseChangeBooking(raw);
  if (!input || !isCalendarDate(input.date) || !isWallClockTime(input.time)) {
    return { ok: false, status: 404, error: BOOKING_GONE_LINE };
  }

  const existing = getStoredBooking(input.code, now.getTime());
  if (!existing) return { ok: false, status: 404, error: BOOKING_GONE_LINE };

  if (existing.date === input.date && existing.time === input.time) {
    return { ok: true, status: 200, body: existingBookingResponse(input.code, now.getTime()) };
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

  const created = await createBookingEvent(
    {
      calendarId: primary.calendar.id,
      timezone: primary.calendar.timezone,
      starts,
      ends,
      name: existing.name,
      topic: existing.topic,
      email: existing.email ?? undefined,
    },
    fetchImpl,
  );
  if (!created.ok) return { ok: false, status: 503, error: created.error };

  const previous = { eventId: existing.eventId, calendarId: existing.calendarId, invited: existing.invited };
  const updated = updateStoredBooking(
    input.code,
    {
      eventId: created.eventId,
      calendarId: primary.calendar.id,
      date: input.date,
      time: input.time,
      startsAt: starts.toISOString(),
      timezone: primary.calendar.timezone,
      meetUrl: created.meetUrl,
      invited: created.invited,
    },
    now.getTime(),
  );
  if (!updated) return { ok: false, status: 404, error: BOOKING_GONE_LINE };

  /* The result used to be discarded. A failed delete then left the OLD
     event standing in the calendar while the endpoint answered 200 and the
     store forgot the old event id forever — two calls, one of them
     unreachable and unremovable. The new event is already written and the
     new slot already taken, so this cannot fail the whole move; it reports
     instead, and says which event was left behind so a person can remove it. */
  const removedOld = await deleteCalendarEvent(
    { calendarId: previous.calendarId, eventId: previous.eventId },
    fetchImpl,
  );
  if (!removedOld.ok) {
    console.error(
      `[booking] moved a booking but could not delete its old event ${previous.eventId}: ${removedOld.error}`,
    );
  }
  invalidateSlotsCache();

  if (updated.chatId) {
    const when = formatWhen(updated.startsAt, updated.timezone);
    const meet = updated.meetUrl ? ` Google Meet: ${updated.meetUrl}` : "";
    await messageProvingChat(updated, `The call has been moved to ${when}.${meet}`, fetchImpl);
  }

  return { ok: true, status: 200, body: existingBookingResponse(input.code, now.getTime()) };
}

export async function cancelBooking(
  raw: unknown,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<CancelBookingResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  if (!available()) return { ok: false, status: 503, error: unavailableLine() };

  const code = parseCancelBooking(raw);
  if (!code) return { ok: false, status: 404, error: BOOKING_GONE_LINE };

  const existing = getStoredBooking(code, now.getTime());
  if (!existing) return { ok: false, status: 404, error: BOOKING_GONE_LINE };

  const deleted = await deleteCalendarEvent(
    { calendarId: existing.calendarId, eventId: existing.eventId },
    fetchImpl,
  );
  if (!deleted.ok) return { ok: false, status: 503, error: deleted.error };

  const removed = markBookingCancelled(code, now.getTime());
  invalidateSlotsCache();
  if (!removed) return { ok: false, status: 404, error: BOOKING_GONE_LINE };

  if (removed.chatId) {
    const when = formatWhen(removed.startsAt, removed.timezone);
    await messageProvingChat(removed, `The call for ${when} has been cancelled.`, fetchImpl);
  }

  return { ok: true, status: 200, body: { cancelled: true } };
}
