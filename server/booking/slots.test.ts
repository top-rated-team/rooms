/**
 * Slot calculation. Run it with:
 *
 *   npx tsx --test server/booking/slots.test.ts
 *
 * Production availability is freeBusy.query. The three the hosted connector traps still
 * have fixtures for the overlap test itself: all-day as a day-long range,
 * a 09:00–10:00 block that must cover 09:30, and expanded recurrence.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { placeHold, resetHoldsForTests } from "./hold";
import { putVisitorCalendarForTests, resetVisitorCalendarForTests } from "./freebusy";
import {
  GOOGLE_CALENDAR_API,
  GOOGLE_FREEBUSY_URL,
  GOOGLE_TOKEN_URL,
  resetGcalForTests,
} from "./gcal";
import {
  WINDOW_PAD_MS,
  daysFromBusyIntervals,
  getBookingSlots,
  overlayVisitorBusy,
  paddedWindow,
  resetSlotsCacheForTests,
  wallClockToUtc,
} from "./slots";

const CALENDAR_ID = "dan@top-rated.team";
const TZ = "Europe/Bratislava";
const FROM = "2026-09-10";
const NOW = new Date("2026-09-09T08:00:00.000Z");

const { privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "service_account",
  client_email: "sa@test.iam.gserviceaccount.com",
  private_key: TEST_PRIVATE_KEY,
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setConfigured(): void {
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
}

function mockOwnerGoogle(opts: {
  busy?: { start: string; end: string }[];
  onOwnerFreeBusy?: () => void;
  visitor?: { busy?: { start: string; end: string }[]; errors?: unknown };
}): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === GOOGLE_TOKEN_URL) {
      return jsonResponse(200, { access_token: "sa-token-for-tests", expires_in: 3600 });
    }
    if (method === "GET" && url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) {
      return jsonResponse(200, { id: CALENDAR_ID, timeZone: TZ });
    }
    if (method === "POST" && url === GOOGLE_FREEBUSY_URL) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { items?: { id?: string }[] };
      const asked = body.items?.[0]?.id;
      if (asked === "primary") {
        if (opts.visitor?.errors) {
          return jsonResponse(200, { calendars: { primary: { errors: opts.visitor.errors, busy: [] } } });
        }
        return jsonResponse(200, { calendars: { primary: { busy: opts.visitor?.busy ?? [] } } });
      }
      opts.onOwnerFreeBusy?.();
      return jsonResponse(200, { calendars: { [CALENDAR_ID]: { busy: opts.busy ?? [] } } });
    }
    return jsonResponse(404, {});
  };
}


beforeEach(() => {
  resetSlotsCacheForTests();
  resetGcalForTests();
  resetGcalForTests();
  resetHoldsForTests();
  resetVisitorCalendarForTests();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.GOOGLE_FREEBUSY_CLIENT_ID;
  delete process.env.GOOGLE_FREEBUSY_CLIENT_SECRET;
});

afterEach(() => {
  resetSlotsCacheForTests();
  resetGcalForTests();
  resetGcalForTests();
  resetHoldsForTests();
  resetVisitorCalendarForTests();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.GOOGLE_FREEBUSY_CLIENT_ID;
  delete process.env.GOOGLE_FREEBUSY_CLIENT_SECRET;
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



describe("trap 3: recurrence is already expanded on freeBusy", () => {
  it("asks freeBusy.query, and a Wednesday busy range blocks that slot", async () => {
    setConfigured();
    const urls: string[] = [];
    const wedStart = wallClockToUtc("2026-09-16", "10:00", TZ);
    const wedEnd = wallClockToUtc("2026-09-16", "10:30", TZ);
    assert.ok(wedStart && wedEnd);

    const inner = mockOwnerGoogle({
      busy: [{ start: wedStart.toISOString(), end: wedEnd.toISOString() }],
    });
    const fetchImpl: typeof fetch = async (input, init) => {
      urls.push(String(input));
      return inner(input, init);
    };

    const result = await getBookingSlots(FROM, 14, { fetchImpl, now: NOW });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const wednesday = result.body.days.find((row) => row.date === "2026-09-16");
    assert.ok(wednesday);
    assert.equal(wednesday?.slots.includes("10:00"), false);
    assert.equal(wednesday?.slots.includes("09:30"), true);
    assert.equal(urls.some((url) => url === GOOGLE_FREEBUSY_URL), true);
    assert.equal(urls.some((url) => url.includes("expand_recurring")), false);
  });

});


describe("getBookingSlots", () => {
  it("returns a day with an empty array rather than omitting it, and caches the window", async () => {
    setConfigured();
    let freeBusyCalls = 0;
    const fetchImpl = mockOwnerGoogle({ onOwnerFreeBusy: () => { freeBusyCalls += 1; } });
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
    assert.equal(freeBusyCalls, 1);
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
    const result = await getBookingSlots(FROM, 1, { fetchImpl: mockOwnerGoogle({}), now: NOW });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.days[0]?.slots.includes("14:00"), false);
    assert.equal(result.body.days[0]?.slots.includes("09:00"), true);
  });

  it("is inert with a sentence when the calendar is not configured", async () => {
    const result = await getBookingSlots(FROM, 14, { now: NOW });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 503);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
  });

  it("does not mention a visitor calendar on a fork", async () => {
    setConfigured();
    const result = await getBookingSlots(FROM, 1, { fetchImpl: mockOwnerGoogle({}), now: NOW });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.body.visitorCalendar, { offered: false });
    assert.equal(result.body.days[0]?.visitorBusy, undefined);
  });
});

describe("visitor busy is marked, not removed", () => {
  it("keeps a slot the visitor is busy in, and lists it on visitorBusy", () => {
    const start = wallClockToUtc(FROM, "14:00", TZ);
    const end = wallClockToUtc(FROM, "14:30", TZ);
    assert.ok(start && end);
    const days = daysFromBusyIntervals({ from: FROM, days: 1, timezone: TZ, busy: [], now: NOW });
    assert.equal(days[0]?.slots.includes("14:00"), true);
    const marked = overlayVisitorBusy(days, [{ start: start.getTime(), end: end.getTime() }], TZ);
    assert.equal(marked[0]?.slots.includes("14:00"), true);
    assert.deepEqual(marked[0]?.visitorBusy, ["14:00"]);
    assert.equal(marked[0]?.slots.includes("09:00"), true);
    assert.equal(marked[0]?.visitorBusy?.includes("09:00"), false);
  });

  it("overlays the visitor's free/busy without changing the owner's slot list or leaking into the cache", async () => {
    setConfigured();
    process.env.GOOGLE_FREEBUSY_CLIENT_ID = "freebusy-client-id-for-tests";
    process.env.GOOGLE_FREEBUSY_CLIENT_SECRET = "freebusy-client-secret-for-tests";
    putVisitorCalendarForTests({
      handle: "visitor-a",
      accessToken: "visitor-a-token",
      now: NOW.getTime(),
    });
    const start = wallClockToUtc(FROM, "14:00", TZ);
    const end = wallClockToUtc(FROM, "15:00", TZ);
    assert.ok(start && end);

    const fetchImpl = mockOwnerGoogle({
      visitor: { busy: [{ start: start.toISOString(), end: end.toISOString() }] },
    });

    const withVisitor = await getBookingSlots(FROM, 1, {
      fetchImpl,
      now: NOW,
      visitorHandle: "visitor-a",
    });
    assert.equal(withVisitor.ok, true);
    if (!withVisitor.ok) return;
    assert.equal(withVisitor.body.days[0]?.slots.includes("14:00"), true);
    assert.deepEqual(withVisitor.body.days[0]?.visitorBusy, ["14:00", "14:30"]);
    assert.equal(withVisitor.body.visitorCalendar?.offered, true);
    if (withVisitor.body.visitorCalendar?.offered) {
      assert.equal(withVisitor.body.visitorCalendar.connected, true);
    }

    const otherVisitor = await getBookingSlots(FROM, 1, { fetchImpl, now: NOW, visitorHandle: "visitor-b" });
    assert.equal(otherVisitor.ok, true);
    if (!otherVisitor.ok) return;
    assert.equal(otherVisitor.body.days[0]?.slots.includes("14:00"), true);
    assert.equal(otherVisitor.body.days[0]?.visitorBusy, undefined);
    assert.deepEqual(otherVisitor.body.visitorCalendar, { offered: true, connected: false });
  });

  it("says the calendar could not be read rather than showing a connected row over an unmarked grid", async () => {
    /* freeBusy answers 200 with a per-calendar errors array for notFound and
       for a calendar the grant does not cover. The overlay is then empty and
       the connection is still live, so the picker used to say "your calendar
       is marking the times you are busy" over a grid with nothing marked. */
    setConfigured();
    process.env.GOOGLE_FREEBUSY_CLIENT_ID = "freebusy-client-id-for-tests";
    process.env.GOOGLE_FREEBUSY_CLIENT_SECRET = "freebusy-client-secret-for-tests";
    putVisitorCalendarForTests({
      handle: "visitor-c",
      accessToken: "visitor-c-token",
      now: NOW.getTime(),
    });

    const fetchImpl = mockOwnerGoogle({
      visitor: { errors: [{ reason: "notFound" }] },
    });

    const result = await getBookingSlots(FROM, 1, { fetchImpl, now: NOW, visitorHandle: "visitor-c" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.days[0]?.visitorBusy, undefined, "nothing may be marked from a failed read");
    assert.equal(result.body.visitorCalendar?.offered, true);
    if (!result.body.visitorCalendar?.offered || !result.body.visitorCalendar.connected) {
      assert.fail("the connection is still live, so the row must not say it is gone");
    }
    assert.equal(result.body.visitorCalendar.unreadable, true);
  });
});
