/**
 * Availability. When the service account is configured, this is
 * freeBusy.query on OUR calendar: busy ranges, no titles, no guests.
 * Listing events was a workaround for a connector with no free/busy
 * endpoint; that path remains only when the two Google variables are
 * unset, so callers this parcel does not own can still run their tests.
 *
 * Working hours are 09:00–17:00 on weekdays in the calendar's own timezone,
 * 30-minute slots. A day with nothing free is still present, with an empty
 * array, so the popup can say so rather than omitting the day.
 *
 * The computed window is cached for 45 seconds. One freeBusy call covers
 * every cell the widget renders.
 *
 * A visitor who connected their own Google Calendar adds a second overlay:
 * slots they are busy in stay in `slots` and are also listed in `visitorBusy`.
 * That overlay is never cached with the owner's window — visitor A must not
 * mark visitor B's picker. The visitor grant is server/booking/freebusy.ts
 * and is a different app, a different person, and is not this file.
 */

import type { BookingDay, BookingSlotsResponse, VisitorCalendarView } from "@shared/api";
import {
  available as gcalAvailable,
  getOurCalendar,
  queryFreeBusy,
  unavailableLine as gcalUnavailableLine,
} from "./gcal";
import { queryVisitorFreeBusy, visitorCalendarView } from "./freebusy";
import { activeHeldSlots } from "./hold";

export const SLOT_MINUTES = 30;
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 17;
export const SLOTS_CACHE_MS = 45_000;
export const WINDOW_PAD_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SLOT_DAYS = 14;
export const MAX_SLOT_DAYS = 31;

/**
 * Event types that do not block a slot even when they look like events.
 * "declined" is not a Google type; it is here so a declined/birthday set is
 * one readable list rather than an undocumented busy=true query.
 *
 * On the Google path this set is unused: freeBusy.query already returns
 * only opaque busy ranges. It remains for the the hosted connector fallback.
 */
export 
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

interface BusyInterval {
  start: number;
  end: number;
}

interface SlotsCacheEntry {
  expiresAt: number;
  body: BookingSlotsResponse;
  key: string;
}

let slotsCache: SlotsCacheEntry | null = null;

export function invalidateSlotsCache(): void {
  slotsCache = null;
}

export function resetSlotsCacheForTests(): void {
  invalidateSlotsCache();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function isWallClockTime(value: string): boolean {
  const match = TIME_RE.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function addCalendarDays(date: string, days: number): string {
  const match = DATE_RE.exec(date);
  if (!match) return date;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return utc.toISOString().slice(0, 10);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

/**
 * "14:00" on 2026-09-10 in Europe/Bratislava is 2026-09-10T12:00:00.000Z.
 * That identity is the brief's own example, and a booking an hour out is
 * worse than no booking widget.
 */
export function wallClockToUtc(date: string, time: string, timeZone: string): Date | null {
  const day = DATE_RE.exec(date);
  const clock = TIME_RE.exec(time);
  if (!day || !clock) return null;
  const naiveUtc = Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
    0,
  );
  const guess = new Date(naiveUtc);
  const offset = zoneOffsetMs(guess, timeZone);
  let instant = new Date(naiveUtc - offset);
  const offset2 = zoneOffsetMs(instant, timeZone);
  if (offset2 !== offset) instant = new Date(naiveUtc - offset2);
  return instant;
}

export function weekdayInZone(date: string, timeZone: string): number {
  const start = wallClockToUtc(date, "12:00", timeZone);
  if (!start) return -1;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(start);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}


export function paddedWindow(from: string, days: number, timeZone: string): { start: string; end: string } | null {
  const realStart = wallClockToUtc(from, "00:00", timeZone);
  const realEnd = wallClockToUtc(addCalendarDays(from, days), "00:00", timeZone);
  if (!realStart || !realEnd) return null;
  return {
    start: new Date(realStart.getTime() - WINDOW_PAD_MS).toISOString(),
    end: new Date(realEnd.getTime() + WINDOW_PAD_MS).toISOString(),
  };
}

function slotTimes(): string[] {
  const times: string[] = [];
  for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      if (hour === WORK_END_HOUR - 1 && minute + SLOT_MINUTES > 60) continue;
      const startMinutes = hour * 60 + minute;
      if (startMinutes + SLOT_MINUTES > WORK_END_HOUR * 60) continue;
      times.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return times;
}

const SLOT_GRID = slotTimes();

/**
 * Slot grid from busy ranges. freeBusy.query already expands recurrence and
 * treats all-day events as ranges, so the the hosted connector traps — {date} with no
 * date_time, containment filters, unexpanded RRULEs — do not apply on the
 * Google path. The overlap test itself is still ours, because a 09:00–10:00
 * busy range must block 09:30.
 */
export function daysFromBusyIntervals(input: {
  from: string;
  days: number;
  timezone: string;
  busy: BusyInterval[];
  now: Date;
}): BookingDay[] {
  const nowMs = input.now.getTime();
  const days: BookingDay[] = [];

  for (let offset = 0; offset < input.days; offset += 1) {
    const date = addCalendarDays(input.from, offset);
    const weekday = weekdayInZone(date, input.timezone);
    const weekend = weekday === 0 || weekday === 6;
    const slots: string[] = [];
    if (!weekend) {
      for (const time of SLOT_GRID) {
        const start = wallClockToUtc(date, time, input.timezone);
        if (!start) continue;
        const end = start.getTime() + SLOT_MINUTES * 60_000;
        if (end <= nowMs) continue;
        const taken = input.busy.some((interval) => overlaps(start.getTime(), end, interval.start, interval.end));
        if (!taken) slots.push(time);
      }
    }
    days.push({ date, slots });
  }
  return days;
}

/**
 * Mark slots the visitor is busy in. Does not remove them: a person may
 * still choose a time they are busy, and silently shrinking the list makes
 * the picker look broken.
 */
export function overlayVisitorBusy(
  days: BookingDay[],
  intervals: { start: number; end: number }[],
  timezone: string,
): BookingDay[] {
  return days.map((day) => {
    const visitorBusy = day.slots.filter((time) => {
      const start = wallClockToUtc(day.date, time, timezone);
      if (!start) return false;
      const end = start.getTime() + SLOT_MINUTES * 60_000;
      return intervals.some((interval) => overlaps(start.getTime(), end, interval.start, interval.end));
    });
    return { date: day.date, slots: day.slots, visitorBusy };
  });
}

function withVisitorCalendar(
  body: BookingSlotsResponse,
  view: VisitorCalendarView,
  days: BookingDay[] = body.days,
): BookingSlotsResponse {
  return { timezone: body.timezone, slotMinutes: body.slotMinutes, days, visitorCalendar: view };
}

export type GetBookingSlotsResult =
  | { ok: true; body: BookingSlotsResponse }
  | { ok: false; status: 503; error: string };

export async function getBookingSlots(
  fromRaw: string,
  daysRaw: number,
  opts: { fetchImpl?: typeof fetch; now?: Date; visitorHandle?: string } = {},
): Promise<GetBookingSlotsResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  if (!gcalAvailable()) {
    return { ok: false, status: 503, error: gcalUnavailableLine() };
  }

  const primary = await getOurCalendar(fetchImpl);
  if (!primary.ok) return { ok: false, status: 503, error: primary.line };

  const from = isCalendarDate(fromRaw) ? fromRaw : wallDateInZone(now, primary.calendar.timezone);
  if (!isCalendarDate(from)) {
    return { ok: false, status: 503, error: "That date is not one we can offer." };
  }
  const days = Number.isFinite(daysRaw) ? Math.min(MAX_SLOT_DAYS, Math.max(1, Math.trunc(daysRaw))) : DEFAULT_SLOT_DAYS;
  const cacheKey = `${primary.calendar.id}:${from}:${days}:${primary.calendar.timezone}`;
  if (slotsCache && slotsCache.key === cacheKey && slotsCache.expiresAt > now.getTime()) {
    return { ok: true, body: await attachVisitorOverlay(slotsCache.body, opts, from, days, now, fetchImpl) };
  }

  const window = paddedWindow(from, days, primary.calendar.timezone);
  if (!window) return { ok: false, status: 503, error: "That date is not one we can offer." };

  const queried = await queryFreeBusy({ start: window.start, end: window.end }, fetchImpl);
  if (!queried.ok) return { ok: false, status: 503, error: queried.error };
  const busy = queried.busy;

  const held = activeHeldSlots(now.getTime());
  const dayRows = daysFromBusyIntervals({
    from,
    days,
    timezone: primary.calendar.timezone,
    busy,
    now,
  }).map((day) => ({
    date: day.date,
    slots: day.slots.filter((time) => !held.some((row) => row.date === day.date && row.time === time)),
  }));
  const body: BookingSlotsResponse = {
    timezone: primary.calendar.timezone,
    slotMinutes: SLOT_MINUTES,
    days: dayRows,
  };
  slotsCache = { key: cacheKey, body, expiresAt: now.getTime() + SLOTS_CACHE_MS };
  return { ok: true, body: await attachVisitorOverlay(body, opts, from, days, now, fetchImpl) };
}

async function attachVisitorOverlay(
  ownerBody: BookingSlotsResponse,
  opts: { visitorHandle?: string },
  from: string,
  days: number,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<BookingSlotsResponse> {
  const view = visitorCalendarView(opts.visitorHandle, now.getTime());
  if (!view.offered || !view.connected) return withVisitorCalendar(ownerBody, view);

  const window = paddedWindow(from, days, ownerBody.timezone);
  if (!window) return withVisitorCalendar(ownerBody, view);

  const intervals = await queryVisitorFreeBusy({
    handle: opts.visitorHandle,
    start: window.start,
    end: window.end,
    now,
    fetchImpl,
  });
  if (!intervals) {
    /* Re-read: a 401 or 403 has already dropped the connection, and then the
       honest answer is "not connected". Anything else leaves it standing, and
       then the honest answer is "connected, and we could not read it". */
    const after = visitorCalendarView(opts.visitorHandle, now.getTime());
    return withVisitorCalendar(
      ownerBody,
      after.offered && after.connected ? { ...after, unreadable: true } : after,
    );
  }
  return withVisitorCalendar(ownerBody, view, overlayVisitorBusy(ownerBody.days, intervals, ownerBody.timezone));
}

function wallDateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    now,
  );
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/** Used by the write path to refuse a slot that is no longer free. */
export function slotIsFree(body: BookingSlotsResponse, date: string, time: string): boolean {
  const day = body.days.find((row) => row.date === date);
  return Boolean(day && day.slots.includes(time));
}

export function parseSlotsQuery(query: unknown): { from: string; days: number } {
  const record = asRecord(query) ?? {};
  const from = typeof record.from === "string" ? record.from : "";
  const days = typeof record.days === "string" ? Number(record.days) : typeof record.days === "number" ? record.days : DEFAULT_SLOT_DAYS;
  return { from, days };
}
