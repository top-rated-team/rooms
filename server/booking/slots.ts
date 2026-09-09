/**
 * Availability. Unipile has no free/busy endpoint, so we list events over a
 * padded window and do the overlap test here.
 *
 * Three traps, each of which silently shows a busy day as free:
 *   1. An all-day event is {date} with no date_time.
 *   2. Unipile's start/end are containment filters, not overlap filters.
 *   3. Without expand_recurring a weekly standup arrives as one master RRULE.
 *
 * Working hours are 09:00–17:00 on weekdays in the calendar's own timezone,
 * 30-minute slots. A day with nothing free is still present, with an empty
 * array, so the popup can say so rather than omitting the day.
 *
 * The computed window is cached for 45 seconds. One Unipile call covers every
 * cell the widget renders.
 */

import type { BookingDay, BookingSlotsResponse } from "@shared/api";
import { available, unavailableLine } from "../unipile/client";
import {
  getPrimaryCalendar,
  listCalendarEvents,
  type UnipileCalendarEvent,
} from "../unipile/calendar";

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
 */
export const SKIPPED_EVENT_TYPES = new Set(["birthday", "fromGmail", "declined"]);

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

/**
 * What counts as busy. Readable here, not an undocumented busy=true query:
 * not cancelled, not transparent, event_type not in the skipped set.
 */
export function eventIsBusy(event: UnipileCalendarEvent): boolean {
  if (event.isCancelled) return false;
  if (event.transparency === "transparent") return false;
  const type = event.eventType ?? "default";
  if (SKIPPED_EVENT_TYPES.has(type)) return false;
  const declined = event.attendees.filter((row) => !row.isOrganizer);
  if (declined.length > 0 && declined.every((row) => row.responseStatus === "no")) return false;
  return true;
}

function parseInstant(dateTime: string, timeZone: string): Date | null {
  if (/Z$/i.test(dateTime) || /[+-]\d{2}:\d{2}$/.test(dateTime)) {
    const parsed = new Date(dateTime);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(dateTime);
  if (match) return wallClockToUtc(match[1], match[2], timeZone);
  const parsed = new Date(dateTime);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function busyInterval(event: UnipileCalendarEvent, calendarTimeZone: string): BusyInterval | null {
  if (!eventIsBusy(event)) return null;
  const start = event.start;
  if (!start) return null;

  if ("date" in start && start.date) {
    const zone = start.timeZone ?? calendarTimeZone;
    const from = wallClockToUtc(start.date, "00:00", zone);
    if (!from) return null;
    const endDate = event.end && "date" in event.end && event.end.date ? event.end.date : addCalendarDays(start.date, 1);
    const until = wallClockToUtc(endDate, "00:00", event.end && "date" in event.end ? (event.end.timeZone ?? zone) : zone);
    if (!until) return null;
    return { start: from.getTime(), end: until.getTime() };
  }

  if (!start.dateTime) return null;
  const zone = start.timeZone ?? calendarTimeZone;
  const from = parseInstant(start.dateTime, zone);
  if (!from) return null;
  let until: Date | null = null;
  if (event.end && "dateTime" in event.end && event.end.dateTime) {
    until = parseInstant(event.end.dateTime, event.end.timeZone ?? zone);
  }
  if (!until) until = new Date(from.getTime() + SLOT_MINUTES * 60_000);
  return { start: from.getTime(), end: until.getTime() };
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

export function daysFromEvents(input: {
  from: string;
  days: number;
  timezone: string;
  events: UnipileCalendarEvent[];
  now: Date;
}): BookingDay[] {
  const busy = input.events
    .map((event) => busyInterval(event, input.timezone))
    .filter((row): row is BusyInterval => row !== null);
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
        const taken = busy.some((interval) => overlaps(start.getTime(), end, interval.start, interval.end));
        if (!taken) slots.push(time);
      }
    }
    days.push({ date, slots });
  }
  return days;
}

export type GetBookingSlotsResult =
  | { ok: true; body: BookingSlotsResponse }
  | { ok: false; status: 503; error: string };

export async function getBookingSlots(
  fromRaw: string,
  daysRaw: number,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<GetBookingSlotsResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  if (!available()) return { ok: false, status: 503, error: unavailableLine() };

  const primary = await getPrimaryCalendar(fetchImpl);
  if (!primary.ok) return { ok: false, status: 503, error: primary.line };

  const from = isCalendarDate(fromRaw) ? fromRaw : wallDateInZone(now, primary.calendar.timezone);
  if (!isCalendarDate(from)) {
    return { ok: false, status: 503, error: "That date is not one we can offer." };
  }
  const days = Number.isFinite(daysRaw) ? Math.min(MAX_SLOT_DAYS, Math.max(1, Math.trunc(daysRaw))) : DEFAULT_SLOT_DAYS;
  const cacheKey = `${primary.calendar.id}:${from}:${days}:${primary.calendar.timezone}`;
  if (slotsCache && slotsCache.key === cacheKey && slotsCache.expiresAt > now.getTime()) {
    return { ok: true, body: slotsCache.body };
  }

  const window = paddedWindow(from, days, primary.calendar.timezone);
  if (!window) return { ok: false, status: 503, error: "That date is not one we can offer." };

  const listed = await listCalendarEvents(
    {
      calendarId: primary.calendar.id,
      start: window.start,
      end: window.end,
      expandRecurring: true,
    },
    fetchImpl,
  );
  if (!listed.ok) return { ok: false, status: 503, error: listed.line };

  const body: BookingSlotsResponse = {
    timezone: primary.calendar.timezone,
    slotMinutes: SLOT_MINUTES,
    days: daysFromEvents({
      from,
      days,
      timezone: primary.calendar.timezone,
      events: listed.body,
      now,
    }),
  };
  slotsCache = { key: cacheKey, body, expiresAt: now.getTime() + SLOTS_CACHE_MS };
  return { ok: true, body };
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
