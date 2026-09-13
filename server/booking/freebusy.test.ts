/**
 * Visitor free/busy. Run it with:
 *
 *   npx tsx --test server/booking/freebusy.test.ts
 *
 * The cases that would ship a lie: asking Google for more than calendar.freebusy;
 * writing the token down; disconnecting our calendar, LinkedIn or WhatsApp;
 * staying alive past five minutes; offering the option on a fork.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  VISITOR_CALENDAR_SCOPE,
  VISITOR_CALENDAR_TTL_MS,
  completeVisitorCalendarConnect,
  dropVisitorCalendar,
  parseFreeBusy,
  putVisitorCalendarForTests,
  queryVisitorFreeBusy,
  resetVisitorCalendarForTests,
  sanitizeVisitorCalendarReturnPath,
  startVisitorCalendarConnect,
  visitorCalendarConfigured,
  visitorCalendarView,
} from "./freebusy";

const CLIENT_ID = "freebusy-client-id-for-tests";
const CLIENT_SECRET = "freebusy-client-secret-for-tests";
const NOW = new Date("2026-09-13T10:00:00.000Z");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setConfigured(): void {
  process.env.GOOGLE_FREEBUSY_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_FREEBUSY_CLIENT_SECRET = CLIENT_SECRET;
}

beforeEach(() => {
  resetVisitorCalendarForTests();
  delete process.env.GOOGLE_FREEBUSY_CLIENT_ID;
  delete process.env.GOOGLE_FREEBUSY_CLIENT_SECRET;
});

afterEach(() => {
  resetVisitorCalendarForTests();
  delete process.env.GOOGLE_FREEBUSY_CLIENT_ID;
  delete process.env.GOOGLE_FREEBUSY_CLIENT_SECRET;
});

describe("inert without the owner's app", () => {
  it("is off when either credential is missing, and says nothing about a calendar", () => {
    assert.equal(visitorCalendarConfigured(), false);
    assert.deepEqual(visitorCalendarView(undefined), { offered: false });
    process.env.GOOGLE_FREEBUSY_CLIENT_ID = CLIENT_ID;
    assert.equal(visitorCalendarConfigured(), false);
    assert.deepEqual(startVisitorCalendarConnect({ publicBaseUrl: "https://example.test" }), { ok: false });
  });

  it("does not start a Google authorize URL on a fork", () => {
    const start = startVisitorCalendarConnect({ publicBaseUrl: "https://fork.example" });
    assert.equal(start.ok, false);
  });
});

describe("authorize asks for calendar.freebusy and nothing else", () => {
  it("puts only that scope on the URL, online access, and include_granted_scopes=false", () => {
    setConfigured();
    const start = startVisitorCalendarConnect({
      publicBaseUrl: "https://top-rated.team",
      returnPath: "/services/google-ads",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const url = new URL(start.url);
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("scope"), VISITOR_CALENDAR_SCOPE);
    assert.equal(url.searchParams.get("access_type"), "online");
    assert.equal(url.searchParams.get("include_granted_scopes"), "false");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(
      url.searchParams.get("redirect_uri"),
      "https://top-rated.team/api/booking/calendar/callback",
    );
    const scope = url.searchParams.get("scope") ?? "";
    assert.equal(scope.includes("calendar.events"), false);
    assert.equal(scope.includes("calendarlist"), false);
    assert.equal(scope.includes("calendar.readonly"), false);
    assert.equal(scope.includes("calendar.events.public"), false);
  });
});

describe("the token is held in memory for five minutes", () => {
  it("stores only the access token, drops a refresh token if Google sent one, and expires", async () => {
    setConfigured();
    const start = startVisitorCalendarConnect({ publicBaseUrl: "https://example.test" });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    let grantType: string | null = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      assert.equal(String(input), "https://oauth2.googleapis.com/token");
      grantType = new URLSearchParams(String(init?.body ?? "")).get("grant_type");
      return jsonResponse(200, {
        access_token: "visitor-access-token",
        refresh_token: "must-never-be-kept",
        expires_in: 3600,
        token_type: "Bearer",
        scope: VISITOR_CALENDAR_SCOPE,
      });
    };

    const done = await completeVisitorCalendarConnect({
      code: "auth-code",
      state,
      cookieState: state,
      now: NOW,
      fetchImpl,
    });
    assert.ok(done.handle);
    assert.equal(grantType, "authorization_code");
    assert.match(done.redirectTo, /visitor_cal=1/);

    const live = visitorCalendarView(done.handle, NOW.getTime());
    assert.equal(live.offered, true);
    if (!live.offered || !live.connected) return;
    assert.equal(live.expiresAt, new Date(NOW.getTime() + VISITOR_CALENDAR_TTL_MS).toISOString());

    const after = visitorCalendarView(done.handle, NOW.getTime() + VISITOR_CALENDAR_TTL_MS);
    assert.deepEqual(after, { offered: true, connected: false });
  });

  it("does not keep a connection when Google sends no access token", async () => {
    setConfigured();
    const start = startVisitorCalendarConnect({ publicBaseUrl: "https://example.test" });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state") ?? "";
    const done = await completeVisitorCalendarConnect({
      code: "auth-code",
      state,
      cookieState: state,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, { token_type: "Bearer" }),
    });
    assert.equal(done.handle, null);
    assert.equal(done.ok, false);
    assert.match(done.redirectTo, /visitor_cal=failed/);
  });

  it("refuses a return that did not start in this browser, and does not spend the code", async () => {
    /* The wave before this one shipped exactly this hole in the LinkedIn
       flow. Here the prize is smaller — a picker filtered by a stranger's
       calendar, with a stranger's token behind the cookie — and the guard is
       the same one. */
    setConfigured();
    const start = startVisitorCalendarConnect({ publicBaseUrl: "https://example.test" });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state") ?? "";
    assert.equal(start.state, state, "the state planted as a cookie is the state sent to Google");

    let exchanged = false;
    const noCookie = await completeVisitorCalendarConnect({
      code: "auth-code",
      state,
      now: NOW,
      fetchImpl: async () => {
        exchanged = true;
        return jsonResponse(200, { access_token: "should-never-be-fetched" });
      },
    });
    assert.equal(noCookie.handle, null);
    assert.equal(noCookie.ok, false);
    assert.equal(exchanged, false, "a refused return must not spend the code either");

    /* And the pending row is gone, so the right browser cannot rescue it. */
    const retry = await completeVisitorCalendarConnect({
      code: "auth-code",
      state,
      cookieState: state,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, { access_token: "t" }),
    });
    assert.equal(retry.handle, null);

    const other = startVisitorCalendarConnect({ publicBaseUrl: "https://example.test" });
    assert.equal(other.ok, true);
    if (!other.ok) return;
    const wrong = await completeVisitorCalendarConnect({
      code: "auth-code",
      state: other.state,
      cookieState: "somebody-elses-state",
      now: NOW,
      fetchImpl: async () => jsonResponse(200, { access_token: "t" }),
    });
    assert.equal(wrong.handle, null);
    assert.equal(wrong.ok, false);
  });
});

describe("disconnect removes that visitor's Google account and nothing else", () => {
  it("revokes only the visitor token at Google and never calls Unipile", async () => {
    setConfigured();
    putVisitorCalendarForTests({
      handle: "visitor-handle",
      accessToken: "visitor-access-token",
      now: NOW.getTime(),
    });
    const urls: string[] = [];
    const bodies: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      urls.push(String(input));
      bodies.push(String(init?.body ?? ""));
      return new Response(null, { status: 200 });
    };

    const view = await dropVisitorCalendar("visitor-handle", { now: NOW, fetchImpl });
    assert.deepEqual(view, { offered: true, connected: false });
    assert.deepEqual(urls, ["https://oauth2.googleapis.com/revoke"]);
    assert.equal(bodies[0]?.includes("visitor-access-token"), true);
    assert.equal(
      urls.some((url) => url.includes("unipile") || url.includes("linkedin") || url.includes("whatsapp")),
      false,
    );
    assert.deepEqual(visitorCalendarView("visitor-handle", NOW.getTime()), { offered: true, connected: false });
  });

  it("does not revoke anything when there is no visitor row", async () => {
    setConfigured();
    let called = 0;
    const view = await dropVisitorCalendar("unknown", {
      now: NOW,
      fetchImpl: async () => {
        called += 1;
        return new Response(null, { status: 200 });
      },
    });
    assert.deepEqual(view, { offered: true, connected: false });
    assert.equal(called, 0);
  });
});

describe("freeBusy.query", () => {
  it("sends the visitor bearer token and reads only busy intervals", async () => {
    setConfigured();
    putVisitorCalendarForTests({
      handle: "visitor-handle",
      accessToken: "visitor-access-token",
      now: NOW.getTime(),
    });
    const fetchImpl: typeof fetch = async (input, init) => {
      assert.equal(String(input), "https://www.googleapis.com/calendar/v3/freeBusy");
      assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer visitor-access-token");
      const sent = JSON.parse(String(init?.body ?? "{}")) as { items?: { id: string }[] };
      assert.deepEqual(sent.items, [{ id: "primary" }]);
      return jsonResponse(200, {
        calendars: {
          primary: {
            busy: [{ start: "2026-09-14T07:00:00Z", end: "2026-09-14T08:00:00Z" }],
          },
        },
      });
    };
    const intervals = await queryVisitorFreeBusy({
      handle: "visitor-handle",
      start: "2026-09-14T00:00:00.000Z",
      end: "2026-09-15T00:00:00.000Z",
      now: NOW,
      fetchImpl,
    });
    assert.deepEqual(intervals, [{ start: Date.parse("2026-09-14T07:00:00Z"), end: Date.parse("2026-09-14T08:00:00Z") }]);
  });

  it("drops the connection when Google refuses the token, and returns no intervals", async () => {
    setConfigured();
    putVisitorCalendarForTests({
      handle: "visitor-handle",
      accessToken: "dead-token",
      now: NOW.getTime(),
    });
    const intervals = await queryVisitorFreeBusy({
      handle: "visitor-handle",
      start: "2026-09-14T00:00:00.000Z",
      end: "2026-09-15T00:00:00.000Z",
      now: NOW,
      fetchImpl: async () => jsonResponse(401, { error: "invalid_token" }),
    });
    assert.equal(intervals, null);
    assert.deepEqual(visitorCalendarView("visitor-handle", NOW.getTime()), { offered: true, connected: false });
  });

  it("parses busy intervals and ignores anything that is not a start and an end", () => {
    assert.deepEqual(
      parseFreeBusy({
        calendars: {
          primary: {
            busy: [
              { start: "2026-09-14T07:00:00Z", end: "2026-09-14T08:00:00Z" },
              { start: "not-a-date", end: "2026-09-14T09:00:00Z" },
              { summary: "must never be read" },
            ],
          },
        },
      }),
      [{ start: Date.parse("2026-09-14T07:00:00Z"), end: Date.parse("2026-09-14T08:00:00Z") }],
    );
  });

  it("reads a per-calendar error as unreadable, not as a week with nothing in it", () => {
    /* freeBusy answers 200 with an errors array for notFound and for a
       calendar the grant does not cover. An empty busy list there would tell
       somebody they are free all week while the picker still says their
       calendar is connected — the one outcome worse than no overlay. */
    assert.equal(
      parseFreeBusy({ calendars: { primary: { errors: [{ reason: "notFound" }], busy: [] } } }),
      null,
    );
    assert.equal(parseFreeBusy({ calendars: {} }), null);
    assert.deepEqual(parseFreeBusy({ calendars: { primary: { busy: [] } } }), []);
  });
});

describe("return path", () => {
  it("rejects an off-site return so the callback cannot bounce elsewhere", () => {
    assert.equal(sanitizeVisitorCalendarReturnPath("https://evil.example/"), "/");
    assert.equal(sanitizeVisitorCalendarReturnPath("//evil.example"), "/");
    assert.equal(sanitizeVisitorCalendarReturnPath("/services/google-ads"), "/services/google-ads");
  });
});
