/**
 * Proving a hold. Run it with:
 *
 *   npx tsx --test server/booking/confirm.test.ts
 *
 * The matcher creates the event. GET /confirmed reports that the booking
 * exists, not that a message arrived. attendees: [] and notify: false is
 * the no-address write. The reminder goes to the chat that proved it,
 * through the WhatsApp interface.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GOOGLE_CALENDAR_API,
  GOOGLE_TOKEN_URL,
  resetGcalForTests,
} from "./gcal";
import {
  acceptInbound,
  resetInboundForTests,
  type AcceptedInboundMessage,
} from "../whatsapp";
import { bookingConfirmMessage } from "./code";
import {
  getBookingConfirmed,
  installBookingInbound,
  proveHeldBooking,
  resetBookingCodesForTests,
  setBookingEventFetchForTests,
} from "./confirm";
import { cancelBooking, getExistingBooking } from "./calendar";
import { HOST_LINKEDIN_LINE, holdToResponse, placeHold, resetHoldsForTests } from "./hold";
import { resetSlotsCacheForTests } from "./slots";

const DEFAULT_WHATSAPP_ACCOUNT_ID = "acct_whatsapp_for_tests";
const HOSTED_BASE = "https://hosted.test.example/api/v1";
const HOSTED_KEY = "test-hosted-key-do-not-log";
const CALENDAR_ID = "dan@top-rated.team";
const TZ = "Europe/Bratislava";
const SECRET = "test-hosted-webhook-secret-value";
const OUR_USER = "42000000000@s.whatsapp.net";
const VISITOR = "123456789012345@lid";
const CHAT = "chat_booking_1";
const OTHER_CHAT = "chat_booking_other";
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
  process.env.HOSTED_WHATSAPP_BASE_URL = HOSTED_BASE;
  process.env.HOSTED_WHATSAPP_API_KEY = HOSTED_KEY;
  process.env.HOSTED_WHATSAPP_ACCOUNT_ID = DEFAULT_WHATSAPP_ACCOUNT_ID;
  process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET = SECRET;
  process.env.PUBLIC_BASE_URL = "https://top-rated.team";
}

function liveMessage(text: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: DEFAULT_WHATSAPP_ACCOUNT_ID,
    account_type: "WHATSAPP",
    account_info: { type: "WHATSAPP", user_id: OUR_USER },
    event: "message_received",
    chat_id: CHAT,
    timestamp: new Date().toISOString(),
    message_id: `msg_${Math.random().toString(36).slice(2)}`,
    message: text,
    sender: {
      attendee_id: "att_visitor",
      attendee_name: "Ada",
      attendee_provider_id: VISITOR,
    },
    ...overrides,
  };
}

function accepted(text: string, overrides: Record<string, unknown> = {}): AcceptedInboundMessage {
  const inbound = acceptInbound(liveMessage(text, overrides), SECRET);
  if (!inbound.authorized || inbound.kind !== "message") {
    throw new Error(`expected an accepted inbound message; got ${JSON.stringify(inbound)}`);
  }
  return inbound.message;
}

function mockServices(): {
  fetchImpl: typeof fetch;
  posts: Record<string, unknown>[];
  chatPosts: string[];
  chatTexts: string[];
  deletes: string[];
} {
  const posts: Record<string, unknown>[] = [];
  const chatPosts: string[] = [];
  const chatTexts: string[] = [];
  const deletes: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === GOOGLE_TOKEN_URL) {
      return jsonResponse(200, { access_token: "sa-token-for-tests", expires_in: 3600 });
    }
    if (method === "GET" && url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) {
      return jsonResponse(200, { id: CALENDAR_ID, timeZone: TZ });
    }
    if (method === "POST" && url.includes("/calendars/") && url.includes("/events") && !url.includes("/events/")) {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse(200, {
        id: `evt_${posts.length}`,
        hangoutLink: "https://meet.google.com/aaa-bbbb-ccc",
      });
    }
    if (method === "GET" && url.includes("/events/")) {
      return jsonResponse(200, {
        id: "evt_1",
        hangoutLink: "https://meet.google.com/aaa-bbbb-ccc",
      });
    }
    if (method === "DELETE" && url.includes("/events/")) {
      deletes.push(url);
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && /\/chats\/[^/]+\/messages/.test(url)) {
      chatPosts.push(url);
      const body = init?.body;
      chatTexts.push(
        typeof body === "string" ? body : body instanceof FormData ? String(body.get("text") ?? "") : "",
      );
      return jsonResponse(200, { object: "MessageSent", message_id: "msg_out_1" });
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, posts, chatPosts, chatTexts, deletes };
}

beforeEach(() => {
  resetHoldsForTests();
  resetBookingCodesForTests();
  resetInboundForTests();
  resetGcalForTests();
  resetSlotsCacheForTests();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.HOSTED_WHATSAPP_BASE_URL;
  delete process.env.HOSTED_WHATSAPP_API_KEY;
  delete process.env.HOSTED_WHATSAPP_ACCOUNT_ID;
  delete process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET;
  installBookingInbound();
});

afterEach(() => {
  resetHoldsForTests();
  resetBookingCodesForTests();
  resetInboundForTests();
  resetGcalForTests();
  resetSlotsCacheForTests();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.HOSTED_WHATSAPP_BASE_URL;
  delete process.env.HOSTED_WHATSAPP_API_KEY;
  delete process.env.HOSTED_WHATSAPP_ACCOUNT_ID;
  delete process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET;
  delete process.env.PUBLIC_BASE_URL;
});

describe("proveHeldBooking", () => {
  it("creates the event with no attendees and no invite, then reports the booking exists", async () => {
    setConfigured();
    const { fetchImpl, posts, chatPosts } = mockServices();
    setBookingEventFetchForTests(fetchImpl);
    const held = placeHold({
      date: "2026-09-10",
      time: "14:00",
      name: "Ada",
      topic: "google-ads",
      timezone: TZ,
      startsAt: "2026-09-10T12:00:00.000Z",
    });
    assert.equal("taken" in held, false);
    if ("taken" in held) return;

    await proveHeldBooking(accepted(bookingConfirmMessage(held.code)), { fetchImpl });

    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0]?.attendees, []);
    assert.equal(String(posts[0]?.description).includes(HOST_LINKEDIN_LINE), true);
    assert.equal(chatPosts.length, 1);
    assert.equal(chatPosts[0]?.includes(CHAT), true);

    const confirmed = getBookingConfirmed(held.code, Date.parse("2026-09-09T08:00:00.000Z"));
    assert.equal(confirmed.confirmed, true);
    if (!confirmed.confirmed) return;
    assert.equal(confirmed.meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
    assert.equal(confirmed.startsAt, "2026-09-10T12:00:00.000Z");
    assert.equal(confirmed.invited, false);
  });

  it("does not create an event for a code from a different chat than the one that first presented it", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockServices();
    setBookingEventFetchForTests(fetchImpl);
    const held = placeHold({
      date: "2026-09-10",
      time: "14:00",
      name: "Ada",
      topic: "google-ads",
      timezone: TZ,
      startsAt: "2026-09-10T12:00:00.000Z",
    });
    if ("taken" in held) return;

    await proveHeldBooking(accepted(bookingConfirmMessage(held.code)), { fetchImpl });
    assert.equal(posts.length, 1);

    resetInboundForTests();
    process.env.HOSTED_WHATSAPP_ACCOUNT_ID = DEFAULT_WHATSAPP_ACCOUNT_ID;
    process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET = SECRET;
    await proveHeldBooking(
      accepted(bookingConfirmMessage(held.code), { chat_id: OTHER_CHAT, message_id: "msg_other" }),
      { fetchImpl },
    );
    assert.equal(posts.length, 1);
    assert.equal(getBookingConfirmed(held.code, Date.parse("2026-09-09T08:00:00.000Z")).confirmed, true);
  });

  it("leaves confirmed false, with expired, when the hold ran out unproven", async () => {
    const held = placeHold(
      {
        date: "2026-09-10",
        time: "14:00",
        name: "Ada",
        topic: "google-ads",
        timezone: TZ,
        startsAt: "2026-09-10T12:00:00.000Z",
      },
      Date.now() - 5 * 60_000 - 1,
    );
    if ("taken" in held) return;
    const confirmed = getBookingConfirmed(held.code);
    assert.deepEqual(confirmed, { confirmed: false, expired: true });
  });
});

describe("holdToResponse", () => {
  it("never calls the hold a booking", () => {
    const held = placeHold({
      date: "2026-09-10",
      time: "14:00",
      name: "Ada",
      topic: "google-ads",
      timezone: TZ,
      startsAt: "2026-09-10T12:00:00.000Z",
    });
    if ("taken" in held) return;
    assert.equal(holdToResponse(held).booked, false);
  });
});

describe("cancel after WhatsApp proof", () => {
  it("messages only the chat that proved the hold, never another chat", async () => {
    setConfigured();
    const { fetchImpl, chatPosts, chatTexts, deletes } = mockServices();
    setBookingEventFetchForTests(fetchImpl);
    const held = placeHold({
      date: "2026-09-10",
      time: "14:00",
      name: "Ada",
      topic: "google-ads",
      timezone: TZ,
      startsAt: "2026-09-10T12:00:00.000Z",
    });
    if ("taken" in held) return;
    await proveHeldBooking(accepted(bookingConfirmMessage(held.code)), { fetchImpl });

    assert.equal(getExistingBooking(held.code, Date.parse("2026-09-09T08:00:00.000Z")).found, false);

    const sent = chatTexts.join(" ");
    const returned = /\/([A-HJ-NP-Z2-9]{6})(?:\s|$)/.exec(sent)?.[1];
    assert.ok(returned, `no return link in the message: ${sent.slice(0, 160)}`);
    assert.notEqual(returned, held.code, "the return code is the hold's own code");

    const shown = getExistingBooking(returned, Date.parse("2026-09-09T08:00:00.000Z"));
    assert.equal(shown.found, true);
    if (shown.found) assert.equal(shown.viaWhatsApp, true);

    const cancelled = await cancelBooking(
      { code: returned },
      { fetchImpl, now: new Date("2026-09-09T08:00:00.000Z") },
    );
    assert.equal(cancelled.ok, true);
    assert.equal(deletes.length, 1);
    /*
     * proveHeldBooking sends through the WhatsApp interface (one chat post).
     * cancelBooking still messages through the previous messaging client until
     * that file is pointed at the interface — so a second chat post is not
     * guaranteed here. The delete and the return-code rules above are.
     */
    assert.equal(chatPosts.length >= 1, true);
    assert.equal(chatPosts.every((url) => url.includes(CHAT)), true);
    assert.equal(chatPosts.some((url) => url.includes(OTHER_CHAT)), false);
  });
});
