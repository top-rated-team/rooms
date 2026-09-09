/**
 * Slot calculation. Run it with:
 *
 *   npx tsx --test server/booking/slots.test.ts
 *
 * Three fixtures, each of which shows a busy day as free if its trap is
 * missing: all-day {date} with no date_time, a containment-filtered event
 * that still overlaps, and an unexpanded RRULE master.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { UnipileCalendarEvent } from "../unipile/calendar";
import { resetUnipileCalendarForTests } from "../unipile/calendar";
import { placeHold, resetHoldsForTests } from "./hold";
import {
  WINDOW_PAD_MS,
  busyInterval,
  daysFromEvents,
  eventIsBusy,
  getBookingSlots,
  paddedWindow,
  resetSlotsCacheForTests,
  wallClockToUtc,
} from "./slots";

const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const ACCOUNT = "cal_account_for_tests";
const CALENDAR_ID = "primary-cal-id";
const TZ = "Europe/Bratislava";
const FROM = "2026-09-10";
const NOW = new Date("2026-09-09T08:00:00.000Z");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setConfigured(): void {
  process.env.UNIPILE_DSN = DSN;
  process.env.UNIPILE_API_KEY = KEY;
  process.env.UNIPILE_CALENDAR_ACCOUNT_ID = ACCOUNT;
}

function event(partial: Partial<UnipileCalendarEvent> & Pick<UnipileCalendarEvent, "id" | "start">): UnipileCalendarEvent {
  return {
    title: null,
    isCancelled: false,
    isAllDay: false,
    transparency: "opaque",
    eventType: "default",
    end: null,
    recurrence: null,
    masterEventId: null,
    conferenceUrl: null,
    attendees: [],
    ...partial,
  };
}

beforeEach(() => {
  resetSlotsCacheForTests();
  resetUnipileCalendarForTests();
  resetHoldsForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

afterEach(() => {
  resetSlotsCacheForTests();
  resetUnipileCalendarForTests();
  resetHoldsForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

describe("wallClockToUtc", () => {
  it("maps 14:00 in Europe/Bratislava in September to 12:00Z, which is the brief's own example", () => {
    const instant = wallClockToUtc("2026-09-10", "14:00", TZ);
    assert.equal(instant?.toISOString(), "2026-09-10T12:00:00.000Z");
  });

  it("maps 14:00 in Europe/Bratislava in January to 13:00Z", () => {
    const instant = wallClockToUtc("2026-01-15", "14:00", TZ);
    assert.equal(instant?.toISOString(), "2026-01-15T13:00:00.000Z");
  });
});

describe("trap 1: all-day events have no date_time", () => {
  it("treats a holiday {date} as busy for that whole date; new Date(date_time) would not", () => {
    const holiday = event({
      id: "holiday",
      isAllDay: true,
      start: { date: "2026-09-10" },
      end: { date: "2026-09-11" },
    });
    assert.equal(holiday.start && "dateTime" in holiday.start ? holiday.start.dateTime : undefined, undefined);
    assert.equal(Number.isNaN(new Date((holiday.start as { date_time?: string }).date_time as string).getTime()), true);

    const days = daysFromEvents({ from: FROM, days: 2, timezone: TZ, events: [holiday], now: NOW });
    const thursday = days.find((row) => row.date === "2026-09-10");
    const friday = days.find((row) => row.date === "2026-09-11");
    assert.ok(thursday);
    assert.deepEqual(thursday?.slots, []);
    assert.ok(friday && friday.slots.includes("09:00"));
  });
});

describe("trap 2: start/end are containment filters", () => {
  it("marks 09:30 busy when an event 09:00-10:00 overlaps it, which a 09:30-11:00 containment query would drop", () => {
    const start = wallClockToUtc("2026-09-10", "09:00", TZ);
    const end = wallClockToUtc("2026-09-10", "10:00", TZ);
    assert.ok(start && end);
    const blocking = event({
      id: "standup",
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
    });
    const days = daysFromEvents({ from: FROM, days: 1, timezone: TZ, events: [blocking], now: NOW });
    const slots = days[0]?.slots ?? [];
    assert.equal(slots.includes("09:00"), false);
    assert.equal(slots.includes("09:30"), false);
    assert.equal(slots.includes("10:00"), true);
  });

  it("pads the Unipile window by a day on each side", () => {
    const window = paddedWindow(FROM, 14, TZ);
    assert.ok(window);
    const realStart = wallClockToUtc(FROM, "00:00", TZ);
    assert.ok(realStart);
    assert.equal(new Date(window.start).getTime(), realStart.getTime() - WINDOW_PAD_MS);
    assert.equal(new Date(window.end).getTime() - realStart.getTime() > 14 * WINDOW_PAD_MS, true);
  });
});

describe("trap 3: expand_recurring", () => {
  it("sends expand_recurring=true, and expanded Wednesday instances block that slot", async () => {
    setConfigured();
    const urls: string[] = [];
    const wedStart = wallClockToUtc("2026-09-16", "10:00", TZ);
    const wedEnd = wallClockToUtc("2026-09-16", "10:30", TZ);
    assert.ok(wedStart && wedEnd);

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/calendars?") || /\/api\/v1\/calendars$/.test(url.split("?")[0])) {
        return jsonResponse(200, {
          data: [{ id: CALENDAR_ID, is_primary: true, is_read_only: false, timezone: TZ }],
        });
      }
      assert.match(url, /expand_recurring=true/);
      return jsonResponse(200, {
        data: [
          {
            id: "standup-2026-09-16",
            master_event_id: "standup-master",
            is_cancelled: false,
            transparency: "opaque",
            event_type: "default",
            start: { date_time: wedStart.toISOString(), time_zone: TZ },
            end: { date_time: wedEnd.toISOString(), time_zone: TZ },
          },
        ],
      });
    };

    const result = await getBookingSlots(FROM, 14, { fetchImpl, now: NOW });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const wednesday = result.body.days.find((row) => row.date === "2026-09-16");
    assert.ok(wednesday);
    assert.equal(wednesday?.slots.includes("10:00"), false);
    assert.equal(wednesday?.slots.includes("09:30"), true);
    assert.equal(
      urls.some((url) => url.includes("expand_recurring=true")),
      true,
    );
  });

  it("does not let an unexpanded RRULE master hide a week as free once instances are present", () => {
    const master = event({
      id: "standup-master",
      start: { dateTime: "2026-01-07T09:00:00.000Z", timeZone: TZ },
      end: { dateTime: "2026-01-07T09:30:00.000Z", timeZone: TZ },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=WE"],
    });
    const instanceStart = wallClockToUtc("2026-09-16", "10:00", TZ);
    const instanceEnd = wallClockToUtc("2026-09-16", "10:30", TZ);
    assert.ok(instanceStart && instanceEnd);
    const instance = event({
      id: "standup-2026-09-16",
      masterEventId: "standup-master",
      start: { dateTime: instanceStart.toISOString(), timeZone: TZ },
      end: { dateTime: instanceEnd.toISOString(), timeZone: TZ },
    });
    const withoutExpand = daysFromEvents({ from: FROM, days: 14, timezone: TZ, events: [master], now: NOW });
    const withExpand = daysFromEvents({ from: FROM, days: 14, timezone: TZ, events: [master, instance], now: NOW });
    const wedWithout = withoutExpand.find((row) => row.date === "2026-09-16");
    const wedWith = withExpand.find((row) => row.date === "2026-09-16");
    assert.equal(wedWithout?.slots.includes("10:00"), true, "a master in January does not block September");
    assert.equal(wedWith?.slots.includes("10:00"), false);
  });
});

describe("what counts as busy", () => {
  it("skips cancelled, transparent, birthday and fromGmail", () => {
    const timed = {
      dateTime: "2026-09-10T07:00:00.000Z",
      timeZone: TZ,
    };
    assert.equal(eventIsBusy(event({ id: "a", start: timed, isCancelled: true })), false);
    assert.equal(eventIsBusy(event({ id: "b", start: timed, transparency: "transparent" })), false);
    assert.equal(eventIsBusy(event({ id: "c", start: timed, eventType: "birthday" })), false);
    assert.equal(eventIsBusy(event({ id: "d", start: timed, eventType: "fromGmail" })), false);
    assert.equal(eventIsBusy(event({ id: "e", start: timed, eventType: "outOfOffice" })), true);
    assert.equal(eventIsBusy(event({ id: "f", start: timed })), true);
  });

  it("does not use busy=true as the only filter: a transparent event still has an interval of null", () => {
    const start = wallClockToUtc("2026-09-10", "09:00", TZ);
    const end = wallClockToUtc("2026-09-10", "10:00", TZ);
    assert.ok(start && end);
    const free = event({
      id: "focus-available",
      transparency: "transparent",
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
    });
    assert.equal(busyInterval(free, TZ), null);
  });
});

describe("getBookingSlots", () => {
  it("returns a day with an empty array rather than omitting it, and caches the window", async () => {
    setConfigured();
    let eventLists = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/calendars?") || /\/api\/v1\/calendars$/.test(url.split("?")[0])) {
        return jsonResponse(200, {
          data: [{ id: CALENDAR_ID, is_primary: true, is_read_only: false, timezone: TZ }],
        });
      }
      eventLists += 1;
      return jsonResponse(200, { data: [] });
    };
    const first = await getBookingSlots(FROM, 14, { fetchImpl, now: NOW });
    const second = await getBookingSlots(FROM, 14, { fetchImpl, now: NOW });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.body.timezone, TZ);
    assert.equal(first.body.slotMinutes, 30);
    assert.equal(first.body.days.length, 14);
    assert.equal(first.body.days[0]?.date, FROM);
    const saturday = first.body.days.find((row) => row.date === "2026-09-12");
    assert.ok(saturday);
    assert.deepEqual(saturday?.slots, []);
    assert.equal(second.ok, true);
    assert.equal(eventLists, 1);
  });

  it("hides a slot that is held, even when the calendar itself is free", async () => {
    setConfigured();
    const held = placeHold({
      date: FROM,
      time: "14:00",
      name: "Ada",
      topic: "google-ads",
      timezone: TZ,
      startsAt: "2026-09-10T12:00:00.000Z",
    });
    assert.equal("taken" in held, false);
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/calendars?") || /\/api\/v1\/calendars$/.test(url.split("?")[0])) {
        return jsonResponse(200, {
          data: [{ id: CALENDAR_ID, is_primary: true, is_read_only: false, timezone: TZ }],
        });
      }
      return jsonResponse(200, { data: [] });
    };
    const result = await getBookingSlots(FROM, 1, { fetchImpl, now: NOW });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.days[0]?.slots.includes("14:00"), false);
    assert.equal(result.body.days[0]?.slots.includes("09:00"), true);
  });

  it("is inert with a sentence when Unipile is not configured", async () => {
    const result = await getBookingSlots(FROM, 14, { now: NOW });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 503);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
  });
});
