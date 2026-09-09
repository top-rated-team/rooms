/**
 * Writing a booking. Run it with:
 *
 *   npx tsx --test server/booking/calendar.test.ts
 *
 * notify defaults to false in Unipile and must be sent as true. 201 is only
 * {event_id}, so the Meet URL is read back. email is the only optional field.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { resetUnipileCalendarForTests } from "../unipile/calendar";
import { HOST_ATTENDEE_EMAIL, SLOT_TAKEN_LINE, parseCreateBooking, postBooking } from "./calendar";
import { resetBookingCodesForTests } from "./confirm";
import { resetSlotsCacheForTests } from "./slots";

const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const ACCOUNT = "cal_account_for_tests";
const CALENDAR_ID = "primary-cal-id";
const TZ = "Europe/Bratislava";
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

beforeEach(() => {
  resetSlotsCacheForTests();
  resetUnipileCalendarForTests();
  resetBookingCodesForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

afterEach(() => {
  resetSlotsCacheForTests();
  resetUnipileCalendarForTests();
  resetBookingCodesForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

function mockUnipile(opts: { busy?: boolean; meetUrl?: string | null } = {}): { fetchImpl: typeof fetch; posts: Record<string, unknown>[] } {
  const posts: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && (url.includes("/calendars?") || /\/api\/v1\/calendars$/.test(url.split("?")[0]))) {
      return jsonResponse(200, {
        data: [{ id: CALENDAR_ID, is_primary: true, is_read_only: false, timezone: TZ }],
      });
    }
    if (method === "GET" && url.includes("/events/") && !url.endsWith("/events")) {
      return jsonResponse(200, {
        id: "evt_1",
        is_cancelled: false,
        transparency: "opaque",
        event_type: "default",
        start: { date_time: "2026-09-10T12:00:00.000Z", time_zone: TZ },
        end: { date_time: "2026-09-10T12:30:00.000Z", time_zone: TZ },
        conference: opts.meetUrl === null ? { provider: "google_meet" } : { provider: "google_meet", url: opts.meetUrl ?? "https://meet.google.com/aaa-bbbb-ccc" },
      });
    }
    if (method === "GET" && url.includes("/events")) {
      if (opts.busy) {
        return jsonResponse(200, {
          data: [
            {
              id: "taken",
              is_cancelled: false,
              transparency: "opaque",
              event_type: "default",
              start: { date_time: "2026-09-10T12:00:00.000Z", time_zone: TZ },
              end: { date_time: "2026-09-10T12:30:00.000Z", time_zone: TZ },
            },
          ],
        });
      }
      return jsonResponse(200, { data: [] });
    }
    if (method === "POST" && url.includes("/events")) {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse(201, { object: "CalendarEventCreated", event_id: "evt_1" });
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, posts };
}

describe("parseCreateBooking", () => {
  it("treats email as the only optional field", () => {
    assert.equal(parseCreateBooking({ date: "2026-09-10", time: "14:00", name: "Ada" }), null);
    const withEmail = parseCreateBooking({
      date: "2026-09-10",
      time: "14:00",
      name: "Ada",
      topic: "google-ads",
      email: "ada@example.com",
    });
    assert.equal(withEmail?.email, "ada@example.com");
    const without = parseCreateBooking({ date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads" });
    assert.equal(without?.email, undefined);
  });
});

describe("postBooking", () => {
  it("writes UTC-with-Z and time_zone, notify true, opaque, Meet with no url, then reads the Meet link back", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockUnipile();
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.status, 201);
    assert.equal(result.body.booked, true);
    assert.equal(result.body.startsAt, "2026-09-10T12:00:00.000Z");
    assert.equal(result.body.timezone, TZ);
    assert.equal(result.body.invited, true);
    assert.equal(result.body.meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
    assert.match(result.body.whatsapp.url, /^https:\/\/wa\.me\/420774654822\?text=/);
    assert.match(result.body.whatsapp.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

    assert.equal(posts.length, 1);
    const body = posts[0];
    assert.equal(body.notify, true);
    assert.equal(body.transparency, "opaque");
    assert.deepEqual(body.conference, { provider: "google_meet" });
    assert.equal("url" in (body.conference as object), false);
    const start = body.start as { date_time: string; time_zone: string };
    assert.match(start.date_time, /Z$/);
    assert.equal(start.time_zone, TZ);
    assert.deepEqual(body.attendees, [{ email: "ada@example.com" }]);
  });

  it("sends an empty attendee list and notify false when there is no address", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockUnipile();
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads" },
      { fetchImpl, now: NOW },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.invited, false);
    /* Probed against the real tenant: a POST with attendees: [] returns 201.
       The host address used to stand in here, which mailed him an invite to
       his own event on every booking taken without an address. */
    assert.deepEqual(posts[0]?.attendees, []);
    assert.equal(posts[0]?.notify, false, "nobody to notify when there is no attendee");
  });

  it("returns 409 with fresh days when that time has just been taken", async () => {
    setConfigured();
    const { fetchImpl } = mockUnipile({ busy: true });
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 409);
    if (result.status !== 409) return;
    assert.equal(result.body.error, SLOT_TAKEN_LINE);
    assert.ok(Array.isArray(result.body.days));
  });

  it("does not claim the visitor was invited when there is no address", async () => {
    setConfigured();
    const { fetchImpl } = mockUnipile();
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads" },
      { fetchImpl, now: NOW },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.invited, false);
  });
});
