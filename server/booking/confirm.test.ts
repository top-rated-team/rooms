/**
 * Proving a hold. Run it with:
 *
 *   npx tsx --test server/booking/confirm.test.ts
 *
 * The matcher creates the event. GET /confirmed reports that the booking
 * exists, not that a message arrived. attendees: [] and notify: false is
 * the no-address write. The reminder goes to the chat that proved it.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_WHATSAPP_ACCOUNT_ID } from "../unipile/accounts";
import { resetUnipileCalendarForTests } from "../unipile/calendar";
import { acceptUnipileInbound, resetInboundForTests, type AcceptedInboundMessage } from "../unipile/inbound";
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

const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const ACCOUNT = "cal_account_for_tests";
const CALENDAR_ID = "primary-cal-id";
const TZ = "Europe/Bratislava";
const SECRET = "test-unipile-webhook-secret-value";
const OUR_USER = "42000000000@s.whatsapp.net";
const VISITOR = "123456789012345@lid";
const CHAT = "chat_booking_1";
const OTHER_CHAT = "chat_booking_other";

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
  /* bookingReturnUrl is built from this, and without it the confirmation
     message carries no way back at all — which is itself worth pinning: the
     test below fails loudly rather than quietly checking nothing. */
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
  const inbound = acceptUnipileInbound(liveMessage(text, overrides), SECRET);
  if (!inbound.authorized || inbound.kind !== "message") {
    throw new Error("expected an accepted inbound message");
  }
  return inbound.message;
}

function mockUnipile(): { fetchImpl: typeof fetch; posts: Record<string, unknown>[]; chatPosts: string[]; chatTexts: string[]; deletes: string[] } {
  const posts: Record<string, unknown>[] = [];
  const chatPosts: string[] = [];
  /* The BODY, not only the address. The return code now reaches the visitor
     in the message and nowhere else, so a test that never reads the message
     cannot see what they were given. */
  const chatTexts: string[] = [];
  const deletes: string[] = [];
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
        conference: { provider: "google_meet", url: "https://meet.google.com/aaa-bbbb-ccc" },
      });
    }
    if (method === "GET" && url.includes("/events")) {
      return jsonResponse(200, { data: [] });
    }
    if (method === "POST" && url.includes("/events")) {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse(201, { object: "CalendarEventCreated", event_id: "evt_1" });
    }
    if (method === "DELETE" && url.includes("/events/")) {
      deletes.push(url);
      return jsonResponse(200, {});
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
  resetUnipileCalendarForTests();
  resetSlotsCacheForTests();
  process.env.UNIPILE_WEBHOOK_SECRET = SECRET;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  installBookingInbound();
});

afterEach(() => {
  resetHoldsForTests();
  resetBookingCodesForTests();
  resetInboundForTests();
  resetUnipileCalendarForTests();
  resetSlotsCacheForTests();
  delete process.env.UNIPILE_WEBHOOK_SECRET;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
});

describe("proveHeldBooking", () => {
  it("creates the event with attendees [] and notify false, then reports the booking exists", async () => {
    setConfigured();
    const { fetchImpl, posts, chatPosts } = mockUnipile();
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
    assert.equal(posts[0]?.notify, false);
    assert.equal(String(posts[0]?.body).includes(HOST_LINKEDIN_LINE), true);
    assert.equal(chatPosts.length, 1);
    assert.equal(chatPosts[0]?.includes(CHAT), true);

    const confirmed = getBookingConfirmed(held.code);
    assert.equal(confirmed.confirmed, true);
    if (!confirmed.confirmed) return;
    assert.equal(confirmed.meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
    assert.equal(confirmed.startsAt, "2026-09-10T12:00:00.000Z");
    assert.equal(confirmed.invited, false);
  });

  it("does not create an event for a code from a different chat than the one that first presented it", async () => {
    setConfigured();
    const { fetchImpl, posts } = mockUnipile();
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
    await proveHeldBooking(
      accepted(bookingConfirmMessage(held.code), { chat_id: OTHER_CHAT, message_id: "msg_other" }),
      { fetchImpl },
    );
    assert.equal(posts.length, 1);
    assert.equal(getBookingConfirmed(held.code).confirmed, true);
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
    const { fetchImpl, chatPosts, chatTexts, deletes } = mockUnipile();
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

    /* THE HOLD'S CODE MUST NOT WORK. It was printed on the popup, drawn into
       a QR anybody may scan and sent through WhatsApp; if it still opened the
       booking, every screen that showed it would be a standing grant to read
       the Meet link and delete the call. */
    assert.equal(getExistingBooking(held.code, Date.parse("2026-09-09T08:00:00.000Z")).found, false);

    /* The return code reaches the visitor in the message and nowhere else. */
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
    assert.doesNotMatch(deletes[0] ?? "", /notify=/);
    assert.equal(chatPosts.length, 2);
    assert.equal(chatPosts.every((url) => url.includes(CHAT)), true);
    assert.equal(chatPosts.some((url) => url.includes(OTHER_CHAT)), false);
  });
});
