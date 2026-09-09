/**
 * Booking Sign in with LinkedIn. Run it with:
 *
 *   npx tsx --test server/booking/signin.test.ts
 *
 * The case a first implementation forgets: LinkedIn handed a name and no
 * address. That still writes the event, with attendees: [] and notify: false.
 * It is not an error, and it is not a WhatsApp hold.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { resetIdentityForTests, storedBindingForTests } from "../identity";
import { resetUnipileCalendarForTests } from "../unipile/calendar";
import { SLOT_TAKEN_LINE } from "./calendar";
import { resetBookingCodesForTests } from "./confirm";
import { HOST_LINKEDIN_LINE, resetHoldsForTests } from "./hold";
import { resetSlotsCacheForTests } from "./slots";
import {
  BOOKING_LINKEDIN_UNCONFIGURED_LINE,
  bookingLinkedInAvailability,
  completeBookingLinkedIn,
  getBookingLinkedInSession,
  resetBookingLinkedInForTests,
  sanitizeBookingReturnPath,
  startBookingLinkedIn,
} from "./signin";

const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const ACCOUNT = "cal_account_for_tests";
const CALENDAR_ID = "primary-cal-id";
const TZ = "Europe/Bratislava";
const NOW = new Date("2026-09-09T08:00:00.000Z");
const WORKSPACE = "ws_booking_linkedin_must_not_bind";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setLinkedIn(): void {
  process.env.LINKEDIN_CLIENT_ID = "linkedin-client-id-for-tests";
  process.env.LINKEDIN_CLIENT_SECRET = "linkedin-client-secret-for-tests";
}

function setUnipile(): void {
  process.env.UNIPILE_DSN = DSN;
  process.env.UNIPILE_API_KEY = KEY;
  process.env.UNIPILE_CALENDAR_ACCOUNT_ID = ACCOUNT;
}

beforeEach(() => {
  resetBookingLinkedInForTests();
  resetIdentityForTests();
  resetSlotsCacheForTests();
  resetUnipileCalendarForTests();
  resetBookingCodesForTests();
  resetHoldsForTests();
  setLinkedIn();
  setUnipile();
});

afterEach(() => {
  resetBookingLinkedInForTests();
  resetIdentityForTests();
  resetSlotsCacheForTests();
  resetUnipileCalendarForTests();
  resetBookingCodesForTests();
  resetHoldsForTests();
  delete process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_CLIENT_SECRET;
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

function mockRoundTrip(opts: {
  userinfo: Record<string, unknown>;
  busy?: boolean;
}): { fetchImpl: typeof fetch; posts: Record<string, unknown>[]; urls: string[] } {
  const posts: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("chats") || url.includes("/messages")) {
      throw new Error(`LinkedIn sign-in must not send a message: ${url}`);
    }

    if (url.includes("oauth/v2/accessToken")) {
      return jsonResponse(200, { access_token: "liau_booking_must_drop", expires_in: 3600 });
    }
    if (url.includes("/userinfo")) {
      return jsonResponse(200, opts.userinfo);
    }

    if (method === "GET" && (url.includes("/calendars?") || /\/api\/v1\/calendars$/.test(url.split("?")[0]))) {
      return jsonResponse(200, {
        data: [{ id: CALENDAR_ID, is_primary: true, is_read_only: false, timezone: TZ }],
      });
    }
    if (method === "GET" && url.includes("/events/") && !url.endsWith("/events")) {
      return jsonResponse(200, {
        id: "evt_li",
        is_cancelled: false,
        transparency: "opaque",
        event_type: "default",
        start: { date_time: "2026-09-10T12:00:00.000Z", time_zone: TZ },
        end: { date_time: "2026-09-10T12:30:00.000Z", time_zone: TZ },
        conference: { provider: "google_meet", url: "https://meet.google.com/aaa-bbbb-ccc" },
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
      return jsonResponse(201, { object: "CalendarEventCreated", event_id: "evt_li" });
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, posts, urls };
}

function startDraft(returnPath = "/"): ReturnType<typeof startBookingLinkedIn> {
  return startBookingLinkedIn({
    date: "2026-09-10",
    time: "14:00",
    name: "Visitor",
    topic: "google-ads",
    returnPath,
    publicBaseUrl: "https://example.test",
  });
}

describe("inert without LINKEDIN_CLIENT_ID", () => {
  it("reports itself unavailable in one sentence and does not start", () => {
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
    const availability = bookingLinkedInAvailability();
    assert.equal(availability.available, false);
    if (availability.available) return;
    assert.equal(availability.unavailableLine, BOOKING_LINKEDIN_UNCONFIGURED_LINE);
    const start = startDraft();
    assert.equal(start.ok, false);
    if (start.ok) return;
    assert.equal(start.line, BOOKING_LINKEDIN_UNCONFIGURED_LINE);
  });
});

describe("the roomless OIDC start", () => {
  it("asks for email, uses the booking callback, and carries the draft in state", () => {
    const start = startDraft("/services/google-ads");
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const auth = new URL(start.url);
    assert.equal(auth.origin + auth.pathname, "https://www.linkedin.com/oauth/v2/authorization");
    assert.equal(auth.searchParams.get("scope"), "openid profile email");
    assert.equal(
      auth.searchParams.get("redirect_uri"),
      "https://example.test/api/booking/linkedin/callback",
    );
    assert.ok(auth.searchParams.get("state"));
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });
});

describe("signed in with no address", () => {
  it("creates the event with attendees [] and notify false, and is not an error", async () => {
    const start = startDraft();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts, urls } = mockRoundTrip({
      userinfo: {
        sub: "782bbtaQ",
        name: "Ada Example",
        picture: "https://media.licdn.com/dms/image/ada.jpg",
      },
    });
    const done = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: NOW,
    });
    assert.ok(done.sessionId);
    const session = getBookingLinkedInSession(done.sessionId ?? "");
    assert.ok(session);
    assert.equal(session.result.booked, true);
    if (!session.result.booked) return;
    assert.equal(session.result.invited, false);
    assert.equal(session.booker.email, null);
    assert.equal(session.booker.profileUrl, null);
    assert.equal(session.draft.date, "2026-09-10");
    assert.equal(session.draft.time, "14:00");

    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0]?.attendees, []);
    assert.equal(posts[0]?.notify, false);
    assert.equal(String(posts[0]?.body).includes(HOST_LINKEDIN_LINE), true);
    assert.equal(String(posts[0]?.body).includes("Ada Example:"), false);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
    assert.equal(
      urls.some((url) => url.includes("/chats") || url.includes("/messages")),
      false,
    );
  });
});

describe("signed in with an address and a profile", () => {
  it("invites that address and names both LinkedIn profiles on the event", async () => {
    const start = startDraft();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      userinfo: {
        sub: "782bbtaQ",
        name: "Ada Example",
        email: "ada@example.com",
        email_verified: true,
        profile: "https://www.linkedin.com/in/ada-example/",
      },
    });
    const done = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: NOW,
    });
    const session = getBookingLinkedInSession(done.sessionId ?? "");
    assert.ok(session);
    assert.equal(session.result.booked, true);
    if (!session.result.booked) return;
    assert.equal(session.result.invited, true);
    assert.equal(session.booker.email, "ada@example.com");
    assert.equal(session.booker.profileUrl, "https://www.linkedin.com/in/ada-example/");
    assert.deepEqual(posts[0]?.attendees, [{ email: "ada@example.com" }]);
    assert.equal(posts[0]?.notify, true);
    assert.equal(String(posts[0]?.body).includes(HOST_LINKEDIN_LINE), true);
    assert.equal(
      String(posts[0]?.body).includes("Ada Example: https://www.linkedin.com/in/ada-example/"),
      true,
    );
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });
});

describe("the slot after the round trip", () => {
  it("returns 409 and keeps the pick when the time has been taken", async () => {
    const start = startDraft();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      busy: true,
      userinfo: { sub: "782bbtaQ", name: "Ada Example", email: "ada@example.com" },
    });
    const done = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: NOW,
    });
    const session = getBookingLinkedInSession(done.sessionId ?? "");
    assert.ok(session);
    assert.equal(session.result.booked, false);
    if (session.result.booked) return;
    assert.equal(session.result.error, SLOT_TAKEN_LINE);
    assert.ok(Array.isArray(session.result.days));
    assert.equal(session.draft.date, "2026-09-10");
    assert.equal(session.draft.time, "14:00");
    assert.equal(session.booker.email, "ada@example.com");
    assert.equal(posts.length, 0);
  });
});

describe("denied consent", () => {
  it("writes nothing and brings the pick back", async () => {
    const start = startDraft("/services/google-ads");
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      userinfo: { sub: "should-not-be-read" },
    });
    const done = await completeBookingLinkedIn({
      state,
      error: "user_cancelled_login",
      fetchImpl,
      now: NOW,
    });
    assert.match(done.redirectTo, /^\/services\/google-ads\?booking_signin=/);
    const session = getBookingLinkedInSession(done.sessionId ?? "");
    assert.ok(session);
    assert.equal(session.result.booked, false);
    assert.equal(session.draft.time, "14:00");
    assert.equal(posts.length, 0);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });
});

describe("return path", () => {
  it("rejects an open redirect", () => {
    assert.equal(sanitizeBookingReturnPath("https://evil.example/phish"), "/");
    assert.equal(sanitizeBookingReturnPath("//evil.example"), "/");
    assert.equal(sanitizeBookingReturnPath("/services/google-ads"), "/services/google-ads");
  });
});
