/**
 * Unipile calendar HTTP. Run it with:
 *
 *   npx tsx --test server/unipile/calendar.test.ts
 *
 * The primary calendar is listed once. Events are listed with
 * expand_recurring=true. Creating an event sends notify: true, opaque
 * transparency, and a Meet conference with no url.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createCalendarEvent,
  getCalendarEvent,
  getPrimaryCalendar,
  listCalendarEvents,
  parseCalendar,
  parseCalendarEvent,
  parseEventTime,
  resetUnipileCalendarForTests,
  PRIMARY_CALENDAR_UNWRITABLE_LINE,
} from "./calendar";

const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const ACCOUNT = "cal_account_for_tests";
const CALENDAR_ID = "primary-cal-id";

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

beforeEach(() => {
  resetUnipileCalendarForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

afterEach(() => {
  resetUnipileCalendarForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

describe("parseEventTime", () => {
  it("branches on date in start, because an all-day event has no date_time", () => {
    const parsed = parseEventTime({ date: "2026-09-10" });
    assert.deepEqual(parsed, { date: "2026-09-10", timeZone: undefined });
    assert.equal(parsed !== null && "date" in parsed, true);
    assert.equal(parsed !== null && "dateTime" in parsed, false);
  });

  it("reads a timed event as date_time plus time_zone", () => {
    const parsed = parseEventTime({ date_time: "2026-09-10T12:00:00.000Z", time_zone: "Europe/Bratislava" });
    assert.deepEqual(parsed, { dateTime: "2026-09-10T12:00:00.000Z", timeZone: "Europe/Bratislava" });
  });
});

describe("parseCalendar", () => {
  it("keeps is_primary, is_read_only and timezone", () => {
    const parsed = parseCalendar({
      object: "Calendar",
      id: CALENDAR_ID,
      is_primary: true,
      is_read_only: false,
      access_role: "owner",
      timezone: "Europe/Bratislava",
      name: "Dan",
    });
    assert.equal(parsed?.isPrimary, true);
    assert.equal(parsed?.isReadOnly, false);
    assert.equal(parsed?.timezone, "Europe/Bratislava");
  });
});

describe("getPrimaryCalendar", () => {
  it("takes is_primary, refuses a read-only calendar, and does not list again", async () => {
    setConfigured();
    let lists = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/calendars?") || /\/calendars$/.test(url.split("?")[0])) {
        lists += 1;
        return jsonResponse(200, {
          data: [
            {
              id: "readonly",
              is_primary: false,
              is_read_only: true,
              timezone: "UTC",
            },
            {
              id: CALENDAR_ID,
              is_primary: true,
              is_read_only: false,
              timezone: "Europe/Bratislava",
            },
          ],
        });
      }
      return jsonResponse(404, {});
    };

    const first = await getPrimaryCalendar(fetchImpl);
    const second = await getPrimaryCalendar(fetchImpl);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.calendar.id, CALENDAR_ID);
    assert.equal(first.calendar.timezone, "Europe/Bratislava");
    assert.equal(second.ok, true);
    assert.equal(lists, 1);
  });

  it("does not cache a read-only primary", async () => {
    setConfigured();
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(200, {
        data: [{ id: CALENDAR_ID, is_primary: true, is_read_only: true, timezone: "Europe/Bratislava" }],
      });
    const result = await getPrimaryCalendar(fetchImpl);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.line, PRIMARY_CALENDAR_UNWRITABLE_LINE);
  });
});

describe("listCalendarEvents", () => {
  it("always sends expand_recurring=true", async () => {
    setConfigured();
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      return jsonResponse(200, { data: [] });
    };
    await listCalendarEvents(
      {
        calendarId: CALENDAR_ID,
        start: "2026-09-09T00:00:00.000Z",
        end: "2026-09-25T00:00:00.000Z",
      },
      fetchImpl,
    );
    assert.equal(urls.length, 1);
    assert.match(urls[0], /expand_recurring=true/);
    assert.match(urls[0], /account_id=/);
  });
});

describe("createCalendarEvent", () => {
  it("posts notify true, opaque, google_meet with no url, UTC date_time and time_zone", async () => {
    setConfigured();
    let posted: unknown = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      posted = JSON.parse(String(init?.body));
      return jsonResponse(201, { object: "CalendarEventCreated", event_id: "evt_1" });
    };
    const result = await createCalendarEvent(
      {
        calendarId: CALENDAR_ID,
        title: "Call with Ada",
        attendees: [{ email: "ada@example.com" }],
        start: { dateTime: "2026-09-10T12:00:00.000Z", timeZone: "Europe/Bratislava" },
        end: { dateTime: "2026-09-10T12:30:00.000Z", timeZone: "Europe/Bratislava" },
        transparency: "opaque",
        conference: { provider: "google_meet" },
        notify: true,
      },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    const body = posted as Record<string, unknown>;
    assert.equal(body.notify, true);
    assert.equal(body.transparency, "opaque");
    assert.deepEqual(body.conference, { provider: "google_meet" });
    assert.equal("url" in (body.conference as object), false);
    const start = body.start as { date_time: string; time_zone: string };
    assert.equal(start.date_time, "2026-09-10T12:00:00.000Z");
    assert.match(start.date_time, /Z$/);
    assert.equal(start.time_zone, "Europe/Bratislava");
  });
});

describe("getCalendarEvent", () => {
  it("reads the Meet url off the event Unipile did not return on 201", async () => {
    setConfigured();
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(200, {
        object: "CalendarEvent",
        id: "evt_1",
        is_cancelled: false,
        is_all_day: false,
        transparency: "opaque",
        event_type: "default",
        start: { date_time: "2026-09-10T12:00:00.000Z", time_zone: "Europe/Bratislava" },
        end: { date_time: "2026-09-10T12:30:00.000Z", time_zone: "Europe/Bratislava" },
        conference: { provider: "google_meet", url: "https://meet.google.com/abc-defg-hij" },
      });
    const result = await getCalendarEvent(CALENDAR_ID, "evt_1", fetchImpl);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body?.conferenceUrl, "https://meet.google.com/abc-defg-hij");
  });
});

describe("parseCalendarEvent", () => {
  it("does not treat a missing date_time as a timed start", () => {
    const parsed = parseCalendarEvent({
      id: "holiday",
      is_cancelled: false,
      start: { date: "2026-09-10" },
      end: { date: "2026-09-11" },
      transparency: "opaque",
      event_type: "default",
    });
    assert.ok(parsed?.start && "date" in parsed.start);
    assert.equal(parsed?.start && "dateTime" in parsed.start ? parsed.start.dateTime : undefined, undefined);
  });
});
