/**
 * Reply to book: the email a recipient sends books the time. Run it with:
 *
 *   npx tsx --test server/booking/reply-to-book.test.ts
 *
 * What has to stay true: the webhook's own claims are never believed — only
 * what Resend returns for its email id; the sender's address goes on the
 * event, so Google invites them, and gets a reply with the way back; an email
 * is handled once however often the webhook comes; a taken time is answered
 * with times still free; one sender cannot hold two upcoming calls; our own
 * mail, automatic replies and other addresses book nothing; and a failure
 * worth retrying says so.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { resetBookingCodesForTests } from "./confirm";
import { GOOGLE_CALENDAR_API, GOOGLE_FREEBUSY_URL, GOOGLE_TOKEN_URL, resetGcalForTests } from "./gcal";
import { resetHoldsForTests } from "./hold";
import { REPLY_TO_BOOK_NO_DOMAIN_LINE, handleInboundEmail, replyToBook, resetReplyToBookForTests } from "./reply-to-book";
import { resetSlotsCacheForTests } from "./slots";

const CALENDAR_ID = "dan@top-rated.team";
const DOMAIN = "book.top-rated.team";
const NOW = new Date("2026-09-09T08:00:00.000Z");
/* 14:00 in Bratislava on the 10th: 12:00Z. */
const SLOT_TO = "call-2026-09-10-1400@book.top-rated.team";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const ENV = [
  "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON",
  "GOOGLE_CALENDAR_ID",
  "PUBLIC_BASE_URL",
  "RESEND_API_KEY",
  "LEAD_EMAIL_FROM",
  "BOOKING_INBOX_DOMAIN",
];

function reset(): void {
  resetSlotsCacheForTests();
  resetGcalForTests();
  resetBookingCodesForTests();
  resetHoldsForTests();
  resetReplyToBookForTests();
  for (const name of ENV) delete process.env[name];
}

function configure(): void {
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: "service_account",
    client_email: "sa@test.iam.gserviceaccount.com",
    private_key: privateKey,
  });
  process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
  process.env.PUBLIC_BASE_URL = "https://top-rated.team";
  process.env.RESEND_API_KEY = "re_full_access_test";
  process.env.LEAD_EMAIL_FROM = "contact@top-rated.team";
  process.env.BOOKING_INBOX_DOMAIN = DOMAIN;
}

beforeEach(reset);
afterEach(reset);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Received = { from: string; to: string[]; subject?: string; headers?: unknown };

/** Google Calendar and Resend, both sides of Resend: what it received, and what we sent. */
function fakes(opts: { busy?: boolean; receiving?: number } = {}) {
  const received = new Map<string, Received>();
  const events: Record<string, unknown>[] = [];
  const replies: Record<string, unknown>[] = [];
  const state = { busy: opts.busy ?? false, receiving: opts.receiving ?? 200 };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === GOOGLE_TOKEN_URL) return json(200, { access_token: "t", expires_in: 3600 });
    if (method === "GET" && url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) {
      return json(200, { id: CALENDAR_ID, timeZone: "Europe/Bratislava" });
    }
    if (method === "POST" && url === GOOGLE_FREEBUSY_URL) {
      return json(200, { calendars: { [CALENDAR_ID]: { busy: state.busy ? [{ start: "2026-09-10T12:00:00.000Z", end: "2026-09-10T12:30:00.000Z" }] : [] } } });
    }
    if (method === "POST" && url.includes("/events")) {
      events.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return json(200, { id: `evt_${events.length}`, hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" });
    }
    if (method === "GET" && url.startsWith("https://api.resend.com/emails/receiving/")) {
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer re_full_access_test");
      if (state.receiving !== 200) return json(state.receiving, { message: "nope" });
      const id = decodeURIComponent(url.slice("https://api.resend.com/emails/receiving/".length));
      const email = received.get(id);
      return email ? json(200, { id, subject: "Book the call", ...email }) : json(404, { message: "Not found" });
    }
    if (method === "POST" && url === "https://api.resend.com/emails") {
      replies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return json(200, { id: `sent_${replies.length}` });
    }
    return json(404, {});
  };
  return { fetchImpl, received, events, replies, state };
}

function webhook(emailId: string, claims: Record<string, unknown> = {}) {
  return { type: "email.received", created_at: NOW.toISOString(), data: { email_id: emailId, ...claims } };
}

describe("reply to book", () => {
  it("books the time for the address the email came from, and tells them how to change it", async () => {
    configure();
    const fake = fakes();
    fake.received.set("em_1", { from: "Ada Lovelace <Ada+Calls@Example.com>", to: [SLOT_TO] });
    const result = await handleInboundEmail(webhook("em_1"), { fetchImpl: fake.fetchImpl, now: NOW });
    assert.deepEqual(result, { status: 200, outcome: "booked" });
    assert.equal(fake.events.length, 1);
    assert.deepEqual(fake.events[0]!.attendees, [{ email: "ada+calls@example.com" }]);
    assert.deepEqual((fake.events[0]!.start as { dateTime: string }).dateTime, "2026-09-10T12:00:00.000Z");
    assert.equal(fake.replies.length, 1);
    const reply = fake.replies[0]!;
    assert.deepEqual(reply.to, ["ada+calls@example.com"]);
    assert.match(String(reply.subject), /^Booked: Thursday 10 September( at)? 14:00 CEST$/);
    assert.match(String(reply.text), /Google is sending the calendar invite to this address/);
    assert.match(String(reply.text), /To move it or cancel it: https:\/\/top-rated\.team\/[A-Z2-9]{6}/);
  });

  it("believes Resend, not the webhook: a forged id books nothing, and forged claims are not read", async () => {
    configure();
    const fake = fakes();
    const forged = await handleInboundEmail(webhook("em_forged", { from: "mallory@example.com", to: [SLOT_TO] }), { fetchImpl: fake.fetchImpl, now: NOW });
    assert.equal(forged.outcome, "unknown-email");
    assert.equal(fake.events.length, 0);

    fake.received.set("em_2", { from: "ada@example.com", to: ["call-2026-09-10-1100@book.top-rated.team"] });
    await handleInboundEmail(webhook("em_2", { from: "mallory@example.com", to: [SLOT_TO] }), { fetchImpl: fake.fetchImpl, now: NOW });
    assert.deepEqual(fake.events[0]!.attendees, [{ email: "ada@example.com" }]);
    assert.equal((fake.events[0]!.start as { dateTime: string }).dateTime, "2026-09-10T09:00:00.000Z", "the slot Resend says it was sent to");
  });

  it("handles an email once, however often the webhook comes", async () => {
    configure();
    const fake = fakes();
    fake.received.set("em_3", { from: "ada@example.com", to: [SLOT_TO] });
    const [a, b] = await Promise.all([
      handleInboundEmail(webhook("em_3"), { fetchImpl: fake.fetchImpl, now: NOW }),
      handleInboundEmail(webhook("em_3"), { fetchImpl: fake.fetchImpl, now: NOW }),
    ]);
    const c = await handleInboundEmail(webhook("em_3"), { fetchImpl: fake.fetchImpl, now: NOW });
    assert.deepEqual([a.outcome, b.outcome, c.outcome], ["booked", "booked", "booked"]);
    assert.equal(fake.events.length, 1);
    assert.equal(fake.replies.length, 1);
  });

  it("answers a taken time with the times still free, each again a time to write to", async () => {
    configure();
    const fake = fakes({ busy: true });
    fake.received.set("em_4", { from: "ada@example.com", to: [SLOT_TO] });
    const result = await handleInboundEmail(webhook("em_4"), { fetchImpl: fake.fetchImpl, now: NOW });
    assert.equal(result.outcome, "taken");
    assert.equal(fake.events.length, 0);
    const reply = fake.replies[0]!;
    assert.match(String(reply.subject), /^That time was taken: Thu 10 Sept at 14:00$/);
    assert.match(String(reply.html), /href="mailto:call-2026-09-10-1600@book\.top-rated\.team\?subject=/);
    assert.doesNotMatch(String(reply.html), /mailto:call-2026-09-10-1400@/, "not the taken time");
    assert.match(String(reply.text), /email call-2026-09-10-1600@book\.top-rated\.team/);
  });

  it("does not give one address two upcoming calls", async () => {
    configure();
    const fake = fakes();
    fake.received.set("em_5", { from: "ada@example.com", to: [SLOT_TO] });
    fake.received.set("em_6", { from: "ADA@example.com", to: ["call-2026-09-10-1500@book.top-rated.team"] });
    await handleInboundEmail(webhook("em_5"), { fetchImpl: fake.fetchImpl, now: NOW });
    const second = await handleInboundEmail(webhook("em_6"), { fetchImpl: fake.fetchImpl, now: NOW });
    assert.equal(second.outcome, "already-booked");
    assert.equal(fake.events.length, 1);
    assert.match(String(fake.replies[1]!.text), /already have a call .* booked for Thursday 10 September/);
  });

  it("books nothing from our own mail, automatic replies, or mail to other addresses", async () => {
    configure();
    const fake = fakes();
    fake.received.set("own", { from: "Top-Rated Team <contact@top-rated.team>", to: [SLOT_TO] });
    fake.received.set("loop", { from: "call-2026-09-10-1500@book.top-rated.team", to: [SLOT_TO] });
    fake.received.set("ooo", { from: "ada@example.com", to: [SLOT_TO], subject: "Automatic reply: Book the call" });
    fake.received.set("auto", { from: "ada@example.com", to: [SLOT_TO], headers: { "Auto-Submitted": "auto-replied" } });
    fake.received.set("hello", { from: "ada@example.com", to: ["hello@book.top-rated.team"] });
    fake.received.set("elsewhere", { from: "ada@example.com", to: ["call-2026-09-10-1400@other.example"] });
    const outcomes = [];
    for (const id of ["own", "loop", "ooo", "auto", "hello", "elsewhere"]) {
      outcomes.push((await handleInboundEmail(webhook(id), { fetchImpl: fake.fetchImpl, now: NOW })).outcome);
    }
    assert.deepEqual(outcomes, ["ignored", "ignored", "ignored", "ignored", "not-a-slot", "not-a-slot"]);
    assert.equal(fake.events.length, 0);
    assert.equal(fake.replies.length, 0);
  });

  it("asks to be tried again when Resend is away, and books on the retry", async () => {
    configure();
    const fake = fakes({ receiving: 500 });
    fake.received.set("em_7", { from: "ada@example.com", to: [SLOT_TO] });
    assert.equal((await handleInboundEmail(webhook("em_7"), { fetchImpl: fake.fetchImpl, now: NOW })).status, 503);
    fake.state.receiving = 200;
    assert.equal((await handleInboundEmail(webhook("em_7"), { fetchImpl: fake.fetchImpl, now: NOW })).outcome, "booked");
  });

  it("is off, and says why, until the inbox domain is set", async () => {
    configure();
    delete process.env.BOOKING_INBOX_DOMAIN;
    assert.deepEqual(replyToBook(), { on: false, line: REPLY_TO_BOOK_NO_DOMAIN_LINE });
    const fake = fakes();
    assert.equal((await handleInboundEmail(webhook("em_8"), { fetchImpl: fake.fetchImpl, now: NOW })).outcome, "off");
    process.env.BOOKING_INBOX_DOMAIN = "@Book.Top-Rated.Team";
    assert.deepEqual(replyToBook(), { on: true, domain: "book.top-rated.team" });
  });

  it("ignores other webhook events", async () => {
    assert.equal((await handleInboundEmail({ type: "email.delivered", data: { email_id: "x" } })).outcome, "ignored");
  });
});
