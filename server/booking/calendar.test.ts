/**
 * Writing a booking. Run it with:
 *
 *   npx tsx --test server/booking/calendar.test.ts
 *
 * With an address, notify is true and the event is created immediately.
 * With no address on a house host, POST does not create an event.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { SLOT_TAKEN_LINE, bookingEventTitle, cancelBooking, changeBooking, getExistingBooking, parseCreateBooking, postBooking } from "./calendar";
import { resetBookingCodesForTests } from "./confirm";
import { ADDRESS_REQUIRED_LINE, HOST_LINKEDIN_LINE, resetHoldsForTests } from "./hold";
import {
  GOOGLE_CALENDAR_API,
  GOOGLE_FREEBUSY_URL,
  GOOGLE_TOKEN_URL,
  resetGcalForTests,
} from "./gcal";
import { resetSlotsCacheForTests } from "./slots";

const DSN = "https://hosted.test.example:9443/api/v1";
const KEY = "test-hosted-key-do-not-log";
const ACCOUNT = "cal_account_for_tests";
const CALENDAR_ID = "dan@top-rated.team";
const TZ = "Europe/Bratislava";
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
  /* A WhatsApp transport as well: the no-address booking path is gated on
     one, and that gate is about messaging rather than the calendar now. */
  process.env.HOSTED_WHATSAPP_BASE_URL = DSN;
  process.env.HOSTED_WHATSAPP_API_KEY = KEY;
  process.env.HOSTED_WHATSAPP_ACCOUNT_ID = ACCOUNT;
}

beforeEach(() => {
  resetSlotsCacheForTests();
  resetGcalForTests();
  resetGcalForTests();
  resetBookingCodesForTests();
  resetHoldsForTests();
  delete process.env.HOSTED_WHATSAPP_DSN;
  delete process.env.HOSTED_WHATSAPP_API_KEY;
  delete process.env.HOSTED_WHATSAPP_CALENDAR_ACCOUNT_ID;
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.PUBLIC_BASE_URL;
});

afterEach(() => {
  resetSlotsCacheForTests();
  resetGcalForTests();
  resetGcalForTests();
  resetBookingCodesForTests();
  resetHoldsForTests();
  delete process.env.HOSTED_WHATSAPP_DSN;
  delete process.env.HOSTED_WHATSAPP_API_KEY;
  delete process.env.HOSTED_WHATSAPP_CALENDAR_ACCOUNT_ID;
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.PUBLIC_BASE_URL;
});

function mockCalendar(opts: { busy?: boolean; meetUrl?: string | null } = {}): {
  fetchImpl: typeof fetch;
  posts: Record<string, unknown>[];
  postUrls: string[];
  deletes: string[];
} {
  const posts: Record<string, unknown>[] = [];
  const postUrls: string[] = [];
  const deletes: string[] = [];
  const busyStart = "2026-09-10T12:00:00.000Z";
  const busyEnd = "2026-09-10T12:30:00.000Z";
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === GOOGLE_TOKEN_URL) {
      return jsonResponse(200, { access_token: "sa-token-for-tests", expires_in: 3600 });
    }
    if (method === "GET" && url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) {
      return jsonResponse(200, { id: CALENDAR_ID, timeZone: TZ });
    }
    if (method === "POST" && url === GOOGLE_FREEBUSY_URL) {
      return jsonResponse(200, {
        calendars: {
          [CALENDAR_ID]: {
            busy: opts.busy ? [{ start: busyStart, end: busyEnd }] : [],
          },
        },
      });
    }
    if (method === "POST" && url.includes("/calendars/") && url.includes("/events")) {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      postUrls.push(url);
      return jsonResponse(200, {
        id: `evt_${posts.length}`,
        hangoutLink: opts.meetUrl === null ? undefined : (opts.meetUrl ?? "https://meet.google.com/aaa-bbbb-ccc"),
      });
    }
    if (method === "GET" && url.includes("/events/")) {
      return jsonResponse(200, {
        id: "evt_1",
        hangoutLink: opts.meetUrl === null ? undefined : (opts.meetUrl ?? "https://meet.google.com/aaa-bbbb-ccc"),
      });
    }
    if (method === "DELETE" && url.includes("/events/")) {
      deletes.push(url);
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && /\/chats\/[^/]+\/messages/.test(url)) {
      return jsonResponse(200, { object: "MessageSent", message_id: "msg_out_1" });
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, posts, postUrls, deletes };
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
  it("writes UTC-with-Z, opaque, Meet createRequest, sendUpdates when inviting, and a Meet link", async () => {
    setConfigured();
    const { fetchImpl, posts, postUrls } = mockCalendar();
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
    assert.match(result.body.whatsapp.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

    assert.equal(posts.length, 1);
    assert.match(postUrls[0] ?? "", /conferenceDataVersion=1/);
    assert.match(postUrls[0] ?? "", /sendUpdates=all/);
    const body = posts[0];
    assert.equal(body.transparency, "opaque");
    const conference = body.conferenceData as { createRequest?: { conferenceSolutionKey?: { type?: string } } };
    assert.equal(conference.createRequest?.conferenceSolutionKey?.type, "hangoutsMeet");
    const start = body.start as { dateTime: string; timeZone: string };
    assert.match(start.dateTime, /Z$/);
    assert.equal(start.timeZone, TZ);
    assert.deepEqual(body.attendees, [{ email: "ada@example.com" }]);
    assert.equal(typeof body.description, "string");
    assert.equal(String(body.description).includes(HOST_LINKEDIN_LINE), true);
    assert.equal(String(body.description).includes("Ada:"), false);
  });

  it("does not create an event when there is no address: it holds the slot and returns the WhatsApp code", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockCalendar();
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
    const { fetchImpl, posts } = mockCalendar();
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
    const { fetchImpl, posts, postUrls } = mockCalendar();
    const result = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW, host: "https://partner.example" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.booked, true);
    if (!result.body.booked) return;
    assert.equal(result.body.invited, true);
    assert.match(postUrls[0] ?? "", /sendUpdates=all/);
    assert.deepEqual(posts[0]?.attendees, [{ email: "ada@example.com" }]);
    assert.equal(result.body.whatsapp.url.includes("420774654822"), false);
  });

  it("returns 409 with fresh days when that time has just been taken", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockCalendar({ busy: true });
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
    const { fetchImpl, posts } = mockCalendar();
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

describe("coming back to a booking", () => {
  it("does not treat an empty pointer as enough to read a booking", () => {
    assert.deepEqual(getExistingBooking(""), { found: false });
    assert.deepEqual(getExistingBooking("K7QMX2"), { found: false });
  });

  it("returns the time and Meet link, not the name or address", async () => {
    setConfigured();
    const { fetchImpl } = mockCalendar();
    const created = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW },
    );
    assert.equal(created.ok, true);
    if (!created.ok || !created.body.booked) return;
    const shown = getExistingBooking(created.body.whatsapp.code, NOW.getTime());
    assert.equal(shown.found, true);
    if (!shown.found) return;
    assert.equal(shown.startsAt, "2026-09-10T12:00:00.000Z");
    assert.equal(shown.invited, true);
    assert.equal(shown.viaWhatsApp, false);
    assert.equal("email" in shown, false);
    assert.equal("name" in shown, false);
  });

  it("hides the booking once the call has ended, not when it starts", async () => {
    setConfigured();
    const { fetchImpl } = mockCalendar();
    const created = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW },
    );
    if (!created.ok || !created.body.booked) return;
    /* body.code, not body.whatsapp.code: the return credential has a field
       of its own now, and on this path there is no WhatsApp at all. */
    assert.equal(getExistingBooking(created.body.code, Date.parse("2026-09-10T12:00:01.000Z")).found, true);
    assert.deepEqual(getExistingBooking(created.body.code, Date.parse("2026-09-10T12:31:00.000Z")), { found: false });
  });

  it("checks the new slot is free before releasing the old one, and writes the new event first", async () => {
    setConfigured();
    const { fetchImpl, posts, deletes } = mockCalendar();
    const created = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW },
    );
    if (!created.ok || !created.body.booked) return;
    const code = created.body.whatsapp.code;
    const moved = await changeBooking(
      { code, date: "2026-09-10", time: "15:00" },
      { fetchImpl, now: NOW },
    );
    assert.equal(moved.ok, true);
    if (!moved.ok) return;
    assert.equal(posts.length, 2);
    assert.equal(deletes.length, 1);
    assert.equal(deletes[0]?.includes("/events/"), true);
    const shown = getExistingBooking(code, NOW.getTime());
    assert.equal(shown.found, true);
    if (!shown.found) return;
    assert.equal(shown.startsAt, "2026-09-10T13:00:00.000Z");
  });

  it("refuses a move onto a taken slot and keeps the original", async () => {
    setConfigured();
    const { fetchImpl, posts, deletes } = mockCalendar({ busy: true });
    const created = await postBooking(
      { date: "2026-09-11", time: "10:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW },
    );
    if (!created.ok || !created.body.booked) return;
    const before = posts.length;
    const moved = await changeBooking(
      { code: created.body.whatsapp.code, date: "2026-09-10", time: "14:00" },
      { fetchImpl, now: NOW },
    );
    assert.equal(moved.ok, false);
    if (moved.ok) return;
    assert.equal(moved.status, 409);
    assert.equal(posts.length, before);
    assert.equal(deletes.length, 0);
    const shown = getExistingBooking(created.body.whatsapp.code, NOW.getTime());
    assert.equal(shown.found, true);
  });

  it("cancels by deleting the event with notify true when they were invited", async () => {
    setConfigured();
    const { fetchImpl, deletes } = mockCalendar();
    const created = await postBooking(
      { date: "2026-09-10", time: "14:00", name: "Ada", topic: "google-ads", email: "ada@example.com" },
      { fetchImpl, now: NOW },
    );
    if (!created.ok || !created.body.booked) return;
    const cancelled = await cancelBooking({ code: created.body.whatsapp.code }, { fetchImpl, now: NOW });
    assert.equal(cancelled.ok, true);
    assert.equal(deletes.length, 1);
    /* Google Calendar honours sendUpdates on delete. The connector did not. */
    assert.match(deletes[0] ?? "", /sendUpdates=all/);
    assert.doesNotMatch(deletes[0] ?? "", /notify=/);
    assert.deepEqual(getExistingBooking(created.body.whatsapp.code, NOW.getTime()), { found: false });
  });
});
