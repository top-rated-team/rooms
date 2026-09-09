/**
 * Writing a booking. Run it with:
 *
 *   npx tsx --test server/booking/calendar.test.ts
 *
 * With an address, notify is true and the event is created immediately.
 * With no address on a house host, POST does not create an event.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { resetUnipileCalendarForTests } from "../unipile/calendar";
import { SLOT_TAKEN_LINE, bookingEventTitle, parseCreateBooking, postBooking } from "./calendar";
import { resetBookingCodesForTests } from "./confirm";
import { ADDRESS_REQUIRED_LINE, HOST_LINKEDIN_LINE, resetHoldsForTests } from "./hold";
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
  resetHoldsForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  delete process.env.PUBLIC_BASE_URL;
});

afterEach(() => {
  resetSlotsCacheForTests();
  resetUnipileCalendarForTests();
  resetBookingCodesForTests();
  resetHoldsForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  delete process.env.PUBLIC_BASE_URL;
});

function mockUnipile(opts: { busy?: boolean; meetUrl?: string | null } = {}): {
  fetchImpl: typeof fetch;
  posts: Record<string, unknown>[];
} {
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
        conference:
          opts.meetUrl === null
            ? { provider: "google_meet" }
            : { provider: "google_meet", url: opts.meetUrl ?? "https://meet.google.com/aaa-bbbb-ccc" },
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

describe("bookingEventTitle", () => {
  it("puts the address on the row, because that is what tells two calls apart", () => {
    assert.equal(bookingEventTitle({ name: "Ada", email: "ada@example.com" }), "Top-Rated Team <=> ada@example.com");
  });

  it("falls back to the name on the WhatsApp route, where there is no address", () => {
    assert.equal(bookingEventTitle({ name: "Ada" }), "Top-Rated Team <=> Ada");
    assert.equal(bookingEventTitle({ name: "Ada", email: "   " }), "Top-Rated Team <=> Ada");
  });

  it("leaves no dangling arrow when it was given nothing at all", () => {
    assert.equal(bookingEventTitle({ name: "  " }), "Top-Rated Team");
  });
});

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
    if (!result.body.booked) return;
    assert.equal(result.body.startsAt, "2026-09-10T12:00:00.000Z");
    assert.equal(result.body.timezone, TZ);
    assert.equal(result.body.invited, true);
    assert.equal(result.body.meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
    assert.equal(result.body.whatsapp.url, "");
    assert.equal(result.body.whatsapp.code, "");

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
    assert.equal(typeof body.body, "string");
    assert.equal(String(body.body).includes(HOST_LINKEDIN_LINE), true);
    assert.equal(String(body.body).includes("Ada:"), false);
  });

  it("does not create an event when there is no address: it holds the slot and returns the WhatsApp code", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockUnipile();
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads" },
      { fetchImpl, now: NOW },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.booked, false);
    if (result.body.booked) return;
    assert.equal(result.body.held, true);
    assert.equal(result.body.invited, false);
    assert.equal(result.body.meetUrl, null);
    assert.match(result.body.whatsapp.url, /^https:\/\/wa\.me\/420774654822\?text=/);
    assert.match(result.body.whatsapp.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(posts.length, 0);
  });

  it("requires an address off a house host, and never returns the house WhatsApp number", async () => {
    setConfigured();
    process.env.PUBLIC_BASE_URL = "https://partner.example";
    const { fetchImpl, posts } = mockUnipile();
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads" },
      { fetchImpl, now: NOW, host: "https://partner.example" },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 503);
    if (result.status !== 503) return;
    assert.equal(result.error, ADDRESS_REQUIRED_LINE);
    assert.equal(posts.length, 0);
  });

  it("still creates the event immediately with notify true when a fork booking has an address", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockUnipile();
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW, host: "https://partner.example" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.booked, true);
    if (!result.body.booked) return;
    assert.equal(result.body.invited, true);
    assert.equal(posts[0]?.notify, true);
    assert.deepEqual(posts[0]?.attendees, [{ email: "ada@example.com" }]);
    assert.equal(result.body.whatsapp.url.includes("420774654822"), false);
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

  it("returns 409 when a hold already covers that time", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockUnipile();
    const first = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads" },
      { fetchImpl, now: NOW },
    );
    assert.equal(first.ok, true);
    const second = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Bea", topic: "google-ads", email: "bea@example.com" },
      { fetchImpl, now: NOW },
    );
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(second.status, 409);
    assert.equal(posts.length, 0);
  });
});
