/**
 * Unipile's calendar surface. Seven routes exist and none of them is
 * availability — that calculation lives in server/booking/. This file is the
 * HTTP: list calendars, list events, create an event, read it back.
 *
 * The primary calendar is read once (is_primary, is_read_only === false) and
 * cached in this process. Widget loads do not list calendars again.
 *
 * start/end on the events list are containment filters. Callers pad the
 * window; this file just sends what they pass, always with
 * expand_recurring=true, because without it a weekly standup arrives as one
 * master with an RRULE and is invisible to the overlap test.
 */

import { calendarAccountId } from "./accounts";
import { available, unipileRequest, unavailableLine, type UnipileResult } from "./client";
import { visitorLine, type UnipileError } from "./errors";

export const PRIMARY_CALENDAR_UNWRITABLE_LINE =
  "The calendar cannot be written to right now.";
export const PRIMARY_CALENDAR_MISSING_LINE = "The calendar is not connected.";

export type CalendarAccessRole = "owner" | "writer" | "reader" | "freeBusyReader";

export interface UnipileCalendar {
  id: string;
  isPrimary: boolean;
  isReadOnly: boolean;
  accessRole: CalendarAccessRole | null;
  timezone: string | null;
}

export type EventTime =
  | { date: string; dateTime?: undefined; timeZone?: string }
  | { dateTime: string; timeZone?: string; date?: undefined };

export interface UnipileCalendarEvent {
  id: string;
  title: string | null;
  isCancelled: boolean;
  isAllDay: boolean;
  transparency: "opaque" | "transparent" | null;
  eventType: string | null;
  start: EventTime | null;
  end: EventTime | null;
  recurrence: string[] | null;
  masterEventId: string | null;
  conferenceUrl: string | null;
  attendees: { email: string; responseStatus: string | null; isOrganizer: boolean }[];
}

export interface CreateCalendarEventInput {
  calendarId: string;
  title: string;
  attendees: { email: string }[];
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  body?: string;
  transparency: "opaque";
  conference: { provider: "google_meet" };
  /*
   * Unipile defaults this to false, so a caller that wants Google to email the
   * invite must say so. It was pinned to the literal `true` to make forgetting
   * impossible — but a booking with no attendee has nobody to notify, and
   * notifying an empty list mailed the organiser an invite to his own event.
   * Required rather than optional, so it is still impossible to forget.
   */
  notify: boolean;
}

export interface CreatedCalendarEvent {
  eventId: string;
}

export interface PrimaryCalendar {
  id: string;
  timezone: string;
}

export type PrimaryCalendarResult =
  | { ok: true; calendar: PrimaryCalendar }
  | { ok: false; line: string; error?: UnipileError };

const ACCESS_ROLES = new Set<string>(["owner", "writer", "reader", "freeBusyReader"]);
const DEFAULT_TIMEZONE = "Europe/Bratislava";
const LIST_LIMIT = 100;

let primaryCache: PrimaryCalendar | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function resetUnipileCalendarForTests(): void {
  primaryCache = null;
}

export function parseEventTime(value: unknown): EventTime | null {
  const record = asRecord(value);
  if (!record) return null;
  /* All-day events are {date} with no date_time. Branch on "date" in start,
     never on date_time, or a holiday becomes Invalid Date and reads as free. */
  if ("date" in record && typeof record.date === "string" && record.date.length > 0) {
    return { date: record.date, timeZone: asString(record.time_zone) ?? undefined };
  }
  const dateTime = asString(record.date_time);
  if (!dateTime) return null;
  return { dateTime, timeZone: asString(record.time_zone) ?? undefined };
}

export function parseCalendar(value: unknown): UnipileCalendar | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  if (!id) return null;
  const roleRaw = typeof record.access_role === "string" ? record.access_role : null;
  const accessRole = roleRaw && ACCESS_ROLES.has(roleRaw) ? (roleRaw as CalendarAccessRole) : null;
  return {
    id,
    isPrimary: record.is_primary === true,
    isReadOnly: record.is_read_only === true,
    accessRole,
    timezone: asString(record.timezone),
  };
}

function parseAttendee(value: unknown): UnipileCalendarEvent["attendees"][number] | null {
  const record = asRecord(value);
  if (!record) return null;
  const email = asString(record.email);
  if (!email) return null;
  return {
    email,
    responseStatus: asString(record.response_status),
    isOrganizer: record.is_organizer === true,
  };
}

export function parseCalendarEvent(value: unknown): UnipileCalendarEvent | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  if (!id) return null;
  const recurrence = Array.isArray(record.recurrence)
    ? record.recurrence.filter((row): row is string => typeof row === "string")
    : null;
  const attendees = Array.isArray(record.attendees)
    ? record.attendees.map(parseAttendee).filter((row): row is NonNullable<typeof row> => row !== null)
    : [];
  const conference = asRecord(record.conference);
  return {
    id,
    title: asString(record.title),
    isCancelled: record.is_cancelled === true,
    isAllDay: record.is_all_day === true,
    transparency: record.transparency === "transparent" || record.transparency === "opaque" ? record.transparency : null,
    eventType: asString(record.event_type),
    start: parseEventTime(record.start),
    end: parseEventTime(record.end),
    recurrence: recurrence && recurrence.length > 0 ? recurrence : null,
    masterEventId: asString(record.master_event_id),
    conferenceUrl: conference ? asString(conference.url) : null,
    attendees,
  };
}

function listItems(body: unknown): unknown[] {
  const record = asRecord(body);
  if (!record) return [];
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.items)) return record.items;
  return [];
}

function nextCursor(body: unknown): string | null {
  const record = asRecord(body);
  return record ? asString(record.next_cursor) : null;
}

export async function listCalendars(
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<UnipileCalendar[]>> {
  const result = await unipileRequest<unknown>(
    {
      method: "GET",
      path: "/calendars",
      query: { account_id: calendarAccountId(), limit: 10 },
    },
    fetchImpl,
  );
  if (!result.ok) return result;
  const calendars = listItems(result.body)
    .map(parseCalendar)
    .filter((row): row is UnipileCalendar => row !== null);
  return { ok: true, status: result.status, body: calendars };
}

/**
 * The writable primary calendar, cached for the life of the process. Not
 * fetched per widget load.
 */
export async function getPrimaryCalendar(
  fetchImpl: typeof fetch = fetch,
): Promise<PrimaryCalendarResult> {
  if (primaryCache) return { ok: true, calendar: primaryCache };
  if (!available()) return { ok: false, line: unavailableLine() };

  const listed = await listCalendars(fetchImpl);
  if (!listed.ok) return { ok: false, line: listed.line, error: listed.error };

  const primary = listed.body.find((row) => row.isPrimary) ?? null;
  if (!primary) return { ok: false, line: PRIMARY_CALENDAR_MISSING_LINE };
  if (primary.isReadOnly) return { ok: false, line: PRIMARY_CALENDAR_UNWRITABLE_LINE };

  primaryCache = {
    id: primary.id,
    timezone: primary.timezone && primary.timezone.length > 0 ? primary.timezone : DEFAULT_TIMEZONE,
  };
  return { ok: true, calendar: primaryCache };
}

export async function listCalendarEvents(
  input: {
    calendarId: string;
    start: string;
    end: string;
    expandRecurring?: boolean;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<UnipileCalendarEvent[]>> {
  const events: UnipileCalendarEvent[] = [];
  let cursor: string | undefined;
  const expandRecurring = input.expandRecurring !== false;

  for (;;) {
    const result = await unipileRequest<unknown>(
      {
        method: "GET",
        path: `/calendars/${encodeURIComponent(input.calendarId)}/events`,
        query: {
          account_id: calendarAccountId(),
          start: input.start,
          end: input.end,
          expand_recurring: expandRecurring,
          limit: LIST_LIMIT,
          cursor,
        },
      },
      fetchImpl,
    );
    if (!result.ok) return result;
    for (const row of listItems(result.body)) {
      const parsed = parseCalendarEvent(row);
      if (parsed) events.push(parsed);
    }
    const next = nextCursor(result.body);
    if (!next) break;
    cursor = next;
  }

  return { ok: true, status: 200, body: events };
}

export async function createCalendarEvent(
  input: CreateCalendarEventInput,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<CreatedCalendarEvent>> {
  const result = await unipileRequest<{ object?: unknown; event_id?: unknown }>(
    {
      method: "POST",
      path: `/calendars/${encodeURIComponent(input.calendarId)}/events`,
      query: { account_id: calendarAccountId() },
      json: {
        title: input.title,
        body: input.body,
        attendees: input.attendees,
        start: { date_time: input.start.dateTime, time_zone: input.start.timeZone },
        end: { date_time: input.end.dateTime, time_zone: input.end.timeZone },
        transparency: input.transparency,
        conference: { provider: input.conference.provider },
        notify: input.notify,
      },
    },
    fetchImpl,
  );
  if (!result.ok) return result;
  const eventId = asString(result.body?.event_id);
  if (!eventId) {
    return {
      ok: false,
      error: { type: "unknown", status: result.status },
      line: visitorLine({ type: "unknown", status: result.status }),
    };
  }
  return { ok: true, status: result.status, body: { eventId } };
}

export async function getCalendarEvent(
  calendarId: string,
  eventId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<UnipileCalendarEvent | null>> {
  const result = await unipileRequest<unknown>(
    {
      method: "GET",
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      query: { account_id: calendarAccountId() },
    },
    fetchImpl,
  );
  if (!result.ok) {
    if (result.error.status === 404) return { ok: true, status: 404, body: null };
    return result;
  }
  const parsed = parseCalendarEvent(result.body);
  if (!parsed) {
    return {
      ok: false,
      error: { type: "unknown", status: result.status },
      line: visitorLine({ type: "unknown", status: result.status }),
    };
  }
  return { ok: true, status: result.status, body: parsed };
}
