/**
 * Direct Google Calendar client. Run it with:
 *
 *   npx tsx --test server/booking/gcal.test.ts
 *
 * The live Meet probe is `npx tsx server/booking/gcal.ts` and needs the two
 * environment variables. This file never opens a socket.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GCAL_UNCONFIGURED_LINE,
  GOOGLE_CALENDAR_API,
  GOOGLE_FREEBUSY_URL,
  GOOGLE_TOKEN_URL,
  available,
  calendarId,
  createEvent,
  decodeJwtPayload,
  deleteEvent,
  getOurCalendar,
  meetUrlFromEvent,
  parseServiceAccountJson,
  probeMeetLink,
  queryFreeBusy,
  resetGcalForTests,
  serviceAccountJwt,
  unavailableLine,
} from "./gcal";

const TZ = "Europe/Bratislava";
const CALENDAR_ID = "dan@top-rated.team";
const SA_EMAIL = "top-rated-team@top-rated-team-cal.iam.gserviceaccount.com";

const { privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "service_account",
  client_email: SA_EMAIL,
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

beforeEach(() => {
  resetGcalForTests();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
});

afterEach(() => {
  resetGcalForTests();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
});

function mockGoogle(opts: {
  busy?: { start: string; end: string }[];
  meetUrl?: string | null;
  calendarId?: string;
  deletesFail?: boolean;
}): {
  fetchImpl: typeof fetch;
  posts: { url: string; body: Record<string, unknown> }[];
  deletes: string[];
  urls: string[];
} {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const deletes: string[] = [];
  const urls: string[] = [];
  const cal = opts.calendarId ?? CALENDAR_ID;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === GOOGLE_TOKEN_URL) {
      return jsonResponse(200, { access_token: "sa-token-for-tests", expires_in: 3600 });
    }
    if (method === "GET" && url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(cal)}`) {
      return jsonResponse(200, { id: cal, timeZone: TZ });
    }
    if (method === "POST" && url === GOOGLE_FREEBUSY_URL) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      posts.push({ url, body });
      return jsonResponse(200, {
        calendars: {
          [cal]: { busy: opts.busy ?? [] },
        },
      });
    }
    if (method === "POST" && url.includes("/events")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      posts.push({ url, body });
      return jsonResponse(200, {
        id: "evt_gcal_1",
        hangoutLink: opts.meetUrl === null ? undefined : (opts.meetUrl ?? "https://meet.google.com/aaa-bbbb-ccc"),
      });
    }
    if (method === "GET" && url.includes("/events/")) {
      return jsonResponse(200, {
        id: "evt_gcal_1",
        hangoutLink: opts.meetUrl === null ? undefined : (opts.meetUrl ?? "https://meet.google.com/aaa-bbbb-ccc"),
      });
    }
    if (method === "DELETE" && url.includes("/events/")) {
      deletes.push(url);
      if (opts.deletesFail) return jsonResponse(500, { error: { code: 500 } });
      return new Response(null, { status: 204 });
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, posts, deletes, urls };
}

describe("parseServiceAccountJson", () => {
  it("parses the JSON and restores escaped newlines in private_key", () => {
    const escaped = JSON.stringify({
      type: "service_account",
      client_email: SA_EMAIL,
      private_key: "-----BEGIN PRIVATE KEY-----\\nLINE\\n-----END PRIVATE KEY-----\\n",
    });
    /* JSON.stringify already escaped the backslashes. The env var holds one
       JSON document; JSON.parse of that document is what restores \n. */
    const parsed = parseServiceAccountJson(escaped);
    assert.ok(parsed);
    assert.equal(parsed?.clientEmail, SA_EMAIL);
    assert.equal(parsed?.privateKey.includes("\n"), true);
    assert.equal(parsed?.privateKey.includes("\\n"), false);
  });

  it("returns null for missing or incomplete JSON", () => {
    assert.equal(parseServiceAccountJson(""), null);
    assert.equal(parseServiceAccountJson("{"), null);
    assert.equal(parseServiceAccountJson(JSON.stringify({ client_email: SA_EMAIL })), null);
  });
});

describe("available", () => {
  it("is inert with a sentence when the two variables are missing", () => {
    assert.equal(available(), false);
    assert.equal(unavailableLine(), GCAL_UNCONFIGURED_LINE);
  });

  it("is true only when both variables are set", () => {
    process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
    assert.equal(available(), false);
    process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
    assert.equal(available(), true);
    assert.equal(calendarId(), CALENDAR_ID);
  });
});

describe("serviceAccountJwt", () => {
  it("signs RS256, names the service account, and does not impersonate by default", () => {
    const account = parseServiceAccountJson(SERVICE_ACCOUNT_JSON);
    assert.ok(account);
    const jwt = serviceAccountJwt(account, { now: 1_700_000_000 });
    const payload = decodeJwtPayload(jwt);
    assert.equal(payload?.iss, SA_EMAIL);
    assert.equal(payload?.aud, GOOGLE_TOKEN_URL);
    assert.equal("sub" in (payload ?? {}), false);
  });

  it("puts GOOGLE_CALENDAR_ID in sub when impersonating", () => {
    setConfigured();
    const account = parseServiceAccountJson(SERVICE_ACCOUNT_JSON);
    assert.ok(account);
    const jwt = serviceAccountJwt(account, { impersonate: true, now: 1_700_000_000 });
    const payload = decodeJwtPayload(jwt);
    assert.equal(payload?.sub, CALENDAR_ID);
  });
});

describe("getOurCalendar", () => {
  it("reads the timezone once and does not list every calendar", async () => {
    setConfigured();
    const { fetchImpl, urls } = mockGoogle({});
    const first = await getOurCalendar(fetchImpl);
    const second = await getOurCalendar(fetchImpl);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.calendar.id, CALENDAR_ID);
    assert.equal(first.calendar.timezone, TZ);
    assert.equal(second.ok, true);
    assert.equal(
      urls.filter((url) => url.includes("/calendars/") && !url.includes("/events")).length,
      1,
    );
    assert.equal(
      urls.some((url) => url.includes("/calendarList") || /\/calendars\?/.test(url)),
      false,
    );
  });
});

describe("queryFreeBusy", () => {
  it("asks freeBusy.query for OUR calendar id, never primary and never another address", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockGoogle({
      busy: [{ start: "2026-09-10T12:00:00.000Z", end: "2026-09-10T12:30:00.000Z" }],
    });
    const result = await queryFreeBusy(
      { start: "2026-09-09T00:00:00.000Z", end: "2026-09-24T00:00:00.000Z" },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.busy.length, 1);
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.url, GOOGLE_FREEBUSY_URL);
    assert.deepEqual(posts[0]?.body.items, [{ id: CALENDAR_ID }]);
    assert.equal(JSON.stringify(posts[0]?.body).includes("primary"), false);
  });
});

describe("createEvent", () => {
  it("writes conferenceDataVersion=1, opaque, Meet createRequest, and sendUpdates when inviting", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockGoogle({});
    const result = await createEvent(
      {
        title: "Top-Rated Team <=> ada@example.com",
        description: "Dan Burykin: https://www.linkedin.com/in/burykin/",
        attendees: [{ email: "ada@example.com" }],
        start: { dateTime: "2026-09-10T12:00:00.000Z", timeZone: TZ },
        end: { dateTime: "2026-09-10T12:30:00.000Z", timeZone: TZ },
        notify: true,
      },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.eventId, "evt_gcal_1");
    assert.equal(result.meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
    assert.equal(posts.length, 1);
    assert.match(posts[0]?.url ?? "", /conferenceDataVersion=1/);
    assert.match(posts[0]?.url ?? "", /sendUpdates=all/);
    assert.equal((posts[0]?.url ?? "").includes(encodeURIComponent(CALENDAR_ID)), true);
    const body = posts[0]?.body ?? {};
    assert.equal(body.transparency, "opaque");
    assert.equal(body.summary, "Top-Rated Team <=> ada@example.com");
    assert.deepEqual(body.attendees, [{ email: "ada@example.com" }]);
    const conference = body.conferenceData as { createRequest?: { conferenceSolutionKey?: { type?: string } } };
    assert.equal(conference.createRequest?.conferenceSolutionKey?.type, "hangoutsMeet");
    const start = body.start as { dateTime: string; timeZone: string };
    assert.match(start.dateTime, /Z$/);
    assert.equal(start.timeZone, TZ);
  });

  it("does not sendUpdates when there is nobody to notify", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockGoogle({});
    const result = await createEvent(
      {
        title: "Top-Rated Team <=> Ada",
        attendees: [],
        start: { dateTime: "2026-09-10T12:00:00.000Z", timeZone: TZ },
        end: { dateTime: "2026-09-10T12:30:00.000Z", timeZone: TZ },
        notify: false,
      },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    assert.match(posts[0]?.url ?? "", /sendUpdates=none/);
    assert.deepEqual(posts[0]?.body.attendees, []);
  });

  it("never writes a calendar other than GOOGLE_CALENDAR_ID", async () => {
    setConfigured();
    const { fetchImpl, urls } = mockGoogle({});
    await createEvent(
      {
        title: "x",
        attendees: [],
        start: { dateTime: "2026-09-10T12:00:00.000Z", timeZone: TZ },
        end: { dateTime: "2026-09-10T12:30:00.000Z", timeZone: TZ },
        notify: false,
      },
      fetchImpl,
    );
    const calendarUrls = urls.filter((url) => url.includes("/calendars/"));
    assert.ok(calendarUrls.length > 0);
    for (const url of calendarUrls) {
      assert.equal(url.includes(encodeURIComponent(CALENDAR_ID)), true);
      assert.equal(url.includes("someone-else"), false);
    }
  });
});

describe("deleteEvent", () => {
  it("deletes with sendUpdates=all when they were invited, and treats 404 as gone", async () => {
    setConfigured();
    const { fetchImpl, deletes } = mockGoogle({});
    const deleted = await deleteEvent("evt_gcal_1", { notify: true }, fetchImpl);
    assert.equal(deleted.ok, true);
    assert.equal(deletes.length, 1);
    assert.match(deletes[0] ?? "", /sendUpdates=all/);
    assert.doesNotMatch(deletes[0] ?? "", /notify=/);
  });
});

describe("meetUrlFromEvent", () => {
  it("reads hangoutLink, then conferenceData entryPoints", () => {
    assert.equal(meetUrlFromEvent({ hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" }), "https://meet.google.com/aaa-bbbb-ccc");
    assert.equal(
      meetUrlFromEvent({
        conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/xyz-uvwx-rst" }] },
      }),
      "https://meet.google.com/xyz-uvwx-rst",
    );
    assert.equal(meetUrlFromEvent({ hangoutLink: "https://example.com/not-meet" }), null);
  });
});

describe("probeMeetLink", () => {
  it("creates with conferenceDataVersion=1 and deletes the event on both paths", async () => {
    setConfigured();
    const { fetchImpl, posts, deletes } = mockGoogle({ meetUrl: "https://meet.google.com/aaa-bbbb-ccc" });
    const result = await probeMeetLink(fetchImpl);
    assert.equal(result.needed, "shared-calendar");
    assert.equal(result.sharedCalendarMeet, true);
    assert.equal(posts.some((row) => row.url.includes("conferenceDataVersion=1")), true);
    assert.equal(deletes.length >= 1, true);
  });
});
