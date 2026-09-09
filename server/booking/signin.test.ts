/**
 * Booking Sign in with LinkedIn. Run it with:
 *
 *   npx tsx --test server/booking/signin.test.ts
 *
 * The case a first implementation forgets: LinkedIn handed a name and no
 * address. That is the same as leaving the field blank — a hold, a wa.me
 * code, and no calendar write. It is not an error.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resetIdentityForTests,
  storedBindingForTests,
  storedBindingsForPersonForTests,
} from "../identity";
import { resetUnipileCalendarForTests } from "../unipile/calendar";
import { SLOT_TAKEN_LINE } from "./calendar";
import { resetBookingCodesForTests } from "./confirm";
import { ADDRESS_REQUIRED_LINE, HOST_LINKEDIN_LINE, placeHold, resetHoldsForTests } from "./hold";
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
const LINKEDIN_SUB = "782bbtaQ";

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
  delete process.env.PUBLIC_BASE_URL;
});

function mockRoundTrip(opts: {
  userinfo?: Record<string, unknown>;
  busy?: boolean;
  tokenStatus?: number;
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
      if (opts.tokenStatus && opts.tokenStatus !== 200) {
        return jsonResponse(opts.tokenStatus, { error: "invalid_grant" });
      }
      return jsonResponse(200, { access_token: "liau_booking_must_drop", expires_in: 3600 });
    }
    if (url.includes("/userinfo")) {
      return jsonResponse(200, opts.userinfo ?? { sub: LINKEDIN_SUB });
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

function startDraft(
  returnPath = "/",
  host?: string,
): ReturnType<typeof startBookingLinkedIn> {
  return startBookingLinkedIn({
    date: "2026-09-10",
    time: "14:00",
    name: "Visitor",
    topic: "google-ads",
    returnPath,
    publicBaseUrl: "https://example.test",
    host,
  });
}

async function assertNoRoomClaim(sub = LINKEDIN_SUB): Promise<void> {
  const byPerson = await storedBindingsForPersonForTests("linkedin", `linkedin:${sub}`);
  assert.equal(byPerson.length, 0);
  assert.equal(storedBindingForTests(sub), undefined);
  assert.equal(storedBindingForTests(`linkedin:${sub}`), undefined);
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
  it("asks for email, uses the booking callback, and carries the draft in state", async () => {
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
    await assertNoRoomClaim();
  });
});

describe("signed in with no address", () => {
  it("holds the slot, plants a WhatsApp code, and writes nothing to the calendar", async () => {
    const start = startDraft("/", "http://localhost");
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts, urls } = mockRoundTrip({
      userinfo: {
        sub: LINKEDIN_SUB,
        name: "Ada Example",
        picture: "https://media.licdn.com/dms/image/ada.jpg",
      },
    });
    const done = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: NOW,
      host: "http://localhost",
    });
    assert.ok(done.sessionId);
    const session = getBookingLinkedInSession(done.sessionId ?? "");
    assert.ok(session);
    assert.equal(session.result.booked, false);
    if (session.result.booked) return;
    assert.equal("held" in session.result && session.result.held, true);
    if (!("held" in session.result) || !session.result.held) return;
    assert.equal(session.result.invited, false);
    assert.equal(session.result.meetUrl, null);
    assert.match(session.result.whatsapp.url, /^https:\/\/wa\.me\/420774654822\?text=/);
    assert.match(session.result.whatsapp.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(session.booker.email, null);
    assert.equal(session.booker.profileUrl, null);
    assert.equal(session.draft.date, "2026-09-10");
    assert.equal(session.draft.time, "14:00");

    assert.equal(posts.length, 0);
    await assertNoRoomClaim();
    assert.equal(
      urls.some((url) => url.includes("/chats") || url.includes("/messages")),
      false,
    );
    assert.equal(getBookingLinkedInSession(done.sessionId ?? ""), null);
  });

  it("refuses the address-less booking on a fork, the same as POST /api/booking", async () => {
    const start = startDraft("/", "https://partner.example");
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      userinfo: { sub: LINKEDIN_SUB, name: "Ada Example" },
    });
    const done = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: NOW,
      host: "https://partner.example",
    });
    const session = getBookingLinkedInSession(done.sessionId ?? "");
    assert.ok(session);
    assert.equal(session.result.booked, false);
    if (session.result.booked) return;
    assert.equal("held" in session.result && session.result.held, false);
    assert.equal("error" in session.result && session.result.error, ADDRESS_REQUIRED_LINE);
    assert.equal(posts.length, 0);
    await assertNoRoomClaim();
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
        sub: LINKEDIN_SUB,
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
    await assertNoRoomClaim();
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
      userinfo: { sub: LINKEDIN_SUB, name: "Ada Example", email: "ada@example.com" },
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
    assert.equal("error" in session.result && session.result.error, SLOT_TAKEN_LINE);
    assert.ok("days" in session.result && Array.isArray(session.result.days));
    assert.equal(session.draft.date, "2026-09-10");
    assert.equal(session.draft.time, "14:00");
    assert.equal(session.booker.email, "ada@example.com");
    assert.equal(posts.length, 0);
  });

  it("returns 409 when a hold covers that time, not only a calendar event", async () => {
    const held = placeHold(
      {
        date: "2026-09-10",
        time: "14:00",
        name: "Earlier",
        topic: "call",
        timezone: TZ,
        startsAt: "2026-09-10T12:00:00.000Z",
      },
      NOW.getTime(),
    );
    assert.equal("taken" in held, false);

    const start = startDraft();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      userinfo: { sub: LINKEDIN_SUB, name: "Ada Example", email: "ada@example.com" },
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
    assert.equal("error" in session.result && session.result.error, SLOT_TAKEN_LINE);
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
    await assertNoRoomClaim("should-not-be-read");
  });
});

describe("expired or replayed state", () => {
  it("drops an expired pending row and writes nothing", async () => {
    const start = startDraft();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      userinfo: { sub: LINKEDIN_SUB, name: "Ada Example", email: "ada@example.com" },
    });
    const done = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: new Date(Date.now() + 16 * 60_000),
    });
    assert.equal(done.sessionId, null);
    assert.equal(done.redirectTo, "/");
    assert.equal(posts.length, 0);
  });

  it("refuses a replayed state", async () => {
    const start = startDraft();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      userinfo: { sub: LINKEDIN_SUB, name: "Ada Example", email: "ada@example.com" },
    });
    const first = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: NOW,
    });
    assert.ok(first.sessionId);
    const replay = await completeBookingLinkedIn({
      state,
      code: "ok-code",
      fetchImpl,
      now: NOW,
    });
    assert.equal(replay.sessionId, null);
    assert.equal(replay.redirectTo, "/");
    assert.equal(posts.length, 1);
  });
});

describe("LinkedIn refuses the token exchange", () => {
  it("writes nothing and brings the pick back", async () => {
    const start = startDraft("/services/google-ads");
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const { fetchImpl, posts } = mockRoundTrip({
      tokenStatus: 400,
      userinfo: { sub: LINKEDIN_SUB, name: "Ada Example", email: "ada@example.com" },
    });
    const done = await completeBookingLinkedIn({
      state,
      code: "bad-code",
      fetchImpl,
      now: NOW,
    });
    assert.match(done.redirectTo, /^\/services\/google-ads\?booking_signin=/);
    const session = getBookingLinkedInSession(done.sessionId ?? "");
    assert.ok(session);
    assert.equal(session.result.booked, false);
    if (session.result.booked) return;
    assert.equal(
      "error" in session.result && session.result.error,
      "LinkedIn sign-in did not finish. The time you picked is still here.",
    );
    assert.equal(session.draft.time, "14:00");
    assert.equal(posts.length, 0);
    await assertNoRoomClaim();
  });
});

describe("return path", () => {
  it("rejects an open redirect, including a path that normalises into one", () => {
    assert.equal(sanitizeBookingReturnPath("https://evil.example/phish"), "/");
    assert.equal(sanitizeBookingReturnPath("//evil.example"), "/");
    assert.equal(sanitizeBookingReturnPath("/..//evil.example"), "/");
    assert.equal(sanitizeBookingReturnPath("/foo/..//evil.example"), "/");
    assert.equal(sanitizeBookingReturnPath("/%2F%2Fevil.example"), "/");
    assert.equal(sanitizeBookingReturnPath("/services/google-ads"), "/services/google-ads");
  });
});
