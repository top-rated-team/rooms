/**
 * GET /api/admin/booking-widget. Run it with:
 *
 *   npx tsx --test server/admin/booking-widget.test.ts
 *
 * What has to stay true: only the person who runs the deployment gets a
 * block; the block is built from the calendar's free times with the options
 * asked for; and the page is told when a time picked from it would not be
 * confirmed by email, rather than finding out from a recipient.
 */

import { generateKeyPairSync } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { ROOM_SESSION_COOKIE, emailProviderId, resetRoomAccountForTests, signInOrAttach } from "../room-account";
import { resetIdentityStoreForTests } from "../identity-store";
import { emailHashForTests, resetRoomAccessForTests } from "../room-access";
import { resetRoomLoginForTests } from "../room-login";
import { resetHoldsForTests } from "../booking/hold";
import { GOOGLE_CALENDAR_API, GOOGLE_FREEBUSY_URL, GOOGLE_TOKEN_URL, resetGcalForTests } from "../booking/gcal";
import { resetSlotsCacheForTests } from "../booking/slots";
import { EMAIL_CONFIRM_NO_MAIL_LINE } from "../booking/confirm-email";

const OPERATOR_EMAIL = "ada@example.test";
const CALENDAR_ID = "dan@top-rated.team";
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

let origin = "";
let server: Server | null = null;
const realFetch = globalThis.fetch;

/* The route asks Google through the global fetch; this test talks to its own
   server over node:http so the two never meet. */
/* Busy ranges the fake calendar reports; a test may add one between reads. */
let busy: { start: string; end: string }[] = [];

function fakeGoogle(): void {
  busy = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === GOOGLE_TOKEN_URL) return json({ access_token: "t", expires_in: 3600 });
    if (url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) return json({ id: CALENDAR_ID, timeZone: "Europe/Bratislava" });
    if (url === GOOGLE_FREEBUSY_URL && init?.method === "POST") return json({ calendars: { [CALENDAR_ID]: { busy } } });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

function get(pathname: string, cookie?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(pathname, origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: { accept: "application/json", host: "top-rated.team", ...(cookie ? { cookie: `${ROOM_SESSION_COOKIE}=${cookie}` } : {}) },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function operatorToken(): Promise<string> {
  const signed = await signInOrAttach({
    identity: { provider: "email", providerId: emailProviderId(emailHashForTests(OPERATOR_EMAIL)), displayName: "ada" },
  });
  if (!signed.ok) throw new Error("sign-in failed");
  return signed.token;
}

function reset(): void {
  globalThis.fetch = realFetch;
  resetIdentityStoreForTests();
  resetRoomAccountForTests();
  resetRoomLoginForTests();
  resetRoomAccessForTests();
  resetHoldsForTests();
  resetGcalForTests();
  resetSlotsCacheForTests();
  for (const name of ["GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", "GOOGLE_CALENDAR_ID", "RESEND_API_KEY", "LEAD_EMAIL_FROM", "PUBLIC_BASE_URL", "BOOKING_INBOX_DOMAIN"]) {
    delete process.env[name];
  }
}

before(async () => {
  const { registerRoutes } = await import("../routes");
  const app = express();
  registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

beforeEach(() => {
  reset();
  process.env.ROOM_HASH_PEPPER = "booking-widget-test-pepper";
  process.env.OPERATOR_EMAIL = OPERATOR_EMAIL;
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: "service_account",
    client_email: "sa@test.iam.gserviceaccount.com",
    private_key: privateKey,
  });
  process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
  process.env.PUBLIC_BASE_URL = "https://top-rated.team";
  fakeGoogle();
});

afterEach(() => {
  reset();
  delete process.env.ROOM_HASH_PEPPER;
  delete process.env.OPERATOR_EMAIL;
});

describe("GET /api/admin/booking-widget", () => {
  it("refuses anyone who is not signed in as the operator", async () => {
    assert.equal((await get("/api/admin/booking-widget")).status, 401);
  });

  it("gives the operator a block of free times with the options asked for", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.LEAD_EMAIL_FROM = "contact@top-rated.team";
    const token = await operatorToken();
    const { status, body } = await get(`/api/admin/booking-widget?show=times&days=2&perDay=3&recipient=${encodeURIComponent("{{email}}")}`, token);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.timezone, "Europe/Bratislava");
    const days = body.days as { date: string; slots: string[] }[];
    assert.equal(days.length, 2);
    /* Late in the day, today may have fewer than three times left. */
    assert.ok(days.every((day) => day.slots.length >= 1 && day.slots.length <= 3));
    const html = String(body.html);
    const times = days.reduce((sum, day) => sum + day.slots.length, 0);
    assert.equal((html.match(/href="/g) ?? []).length, times + 1, "one link a time, and Other times");
    assert.ok(html.includes("https://top-rated.team/book?date="));
    assert.ok(html.includes("&amp;confirm=email&amp;email={{email}}"));
    assert.deepEqual(body.emailConfirmation, { on: true });
    assert.deepEqual(body.recipient, { kind: "tag", value: "{{email}}" }, "the page is told what the links carry");
  });

  it("puts a To field's address into every link, and says so", async () => {
    const token = await operatorToken();
    const { body } = await get(`/api/admin/booking-widget?recipient=${encodeURIComponent("Ada <ada+ads@example.com>")}`, token);
    assert.deepEqual(body.recipient, { kind: "address", value: "ada+ads@example.com", signed: true });
    const links = [...String(body.html).matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
    assert.ok(links.length > 1 && links.every((href) => /&amp;email=ada%2Bads%40example\.com&amp;sig=[A-Za-z0-9_-]{22}$/.test(href)), links[0]);
    assert.match(String(body.html), /For ada\+ads@example\.com only: clicking a time books the call in that name/);
    assert.ok(links.slice(0, -1).every((href) => href.includes("&amp;instant=1&amp;")), "each time books in one click");
    assert.ok(!links.at(-1)!.includes("instant=1"), "Other times opens the picker");
  });

  it("does not sign a merge tag: the address it stands for is not known here", async () => {
    const token = await operatorToken();
    const tagged = await get(`/api/admin/booking-widget?recipient=${encodeURIComponent("{{email}}")}`, token);
    assert.ok(!String(tagged.body.html).includes("sig="));
    assert.match(String(tagged.body.html), /We email you a link to confirm it/);
  });

  it("reads the calendar afresh every time, and names the calendar it read", async () => {
    const token = await operatorToken();
    const first = await get("/api/admin/booking-widget?show=times&days=1&perDay=16", token);
    const calendar = first.body.calendar as { id: string; readAt: string };
    assert.equal(calendar.id, CALENDAR_ID);
    assert.ok(Math.abs(Date.parse(calendar.readAt) - Date.now()) < 60_000);
    const [day] = first.body.days as { date: string; slots: string[] }[];
    assert.ok(day && day.slots.length > 0);

    /* The owner books the first free half-hour in his own calendar. The next
       block must not offer it — not in 45 seconds, now. */
    const time = day.slots[0]!;
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bratislava", timeZoneName: "longOffset" })
      .formatToParts(new Date(`${day.date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
    const start = new Date(`${day.date}T${time}:00${offset}`);
    busy = [{ start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() }];
    const second = await get("/api/admin/booking-widget?show=times&days=1&perDay=16", token);
    const [again] = second.body.days as { date: string; slots: string[] }[];
    assert.ok(!(again?.date === day.date && again.slots.includes(time)), `${day.date} ${time} is busy now and must not be offered`);
  });

  it("never makes a time an email to write, even with reply to book set up: a click books", async () => {
    const token = await operatorToken();
    process.env.RESEND_API_KEY = "re_test";
    process.env.BOOKING_INBOX_DOMAIN = "book.top-rated.team";
    const { body } = await get(`/api/admin/booking-widget?show=times&days=1&perDay=2&recipient=${encodeURIComponent("ada@example.com")}`, token);
    const links = [...String(body.html).matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
    assert.ok(links.every((href) => href.startsWith("https://top-rated.team/book?")), links.join("\n"));
    assert.ok(!("replyToBook" in body));
  });

  it("says when a time picked from the block would not be confirmed by email", async () => {
    const token = await operatorToken();
    const { body } = await get("/api/admin/booking-widget?show=days", token);
    assert.deepEqual(body.emailConfirmation, { on: false, line: EMAIL_CONFIRM_NO_MAIL_LINE });
  });
});
