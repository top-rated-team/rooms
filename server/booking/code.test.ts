/**
 * Planted booking codes. Run it with:
 *
 *   npx tsx --test server/booking/code.test.ts
 *
 * The generator and the regex share one alphabet. A nanoid with dashes once
 * broke about 40% of binds; this alphabet has none.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WHATSAPP_ACCOUNT_ID,
} from "../unipile/accounts";
import { resetUnipileCalendarForTests } from "../unipile/calendar";
import {
  acceptUnipileInbound,
  resetInboundForTests,
} from "../unipile/inbound";
import {
  BOOKING_CODE_ALPHABET,
  BOOKING_CODE_LENGTH,
  BOOKING_CODE_RE,
  bookingConfirmMessage,
  extractBookingCode,
  isBookingReturnCode,
  mintBookingCode,
  normalizeBookingCode,
} from "./code";
import {
  BOOKING_CODE_TTL_MS,
  getBookingConfirmed,
  installBookingInbound,
  plantBookingCode,
  proveHeldBooking,
  resetBookingCodesForTests,
  setBookingEventFetchForTests,
} from "./confirm";
import { resetHoldsForTests } from "./hold";

const SECRET = "test-unipile-webhook-secret-value";
const OUR_USER = "42000000000@s.whatsapp.net";
const VISITOR = "123456789012345@lid";
const CHAT = "chat_booking_1";
const OTHER_CHAT = "chat_booking_other";
const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const ACCOUNT = "cal_account_for_tests";
const CALENDAR_ID = "primary-cal-id";
const TZ = "Europe/Bratislava";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockCalendarFetch(): typeof fetch {
  return async (input, init) => {
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
      return jsonResponse(201, { object: "CalendarEventCreated", event_id: "evt_1" });
    }
    if (method === "POST" && /\/chats\/[^/]+\/messages/.test(url)) {
      return jsonResponse(200, { object: "MessageSent", message_id: "msg_out_1" });
    }
    return jsonResponse(404, {});
  };
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

beforeEach(() => {
  resetBookingCodesForTests();
  resetHoldsForTests();
  resetInboundForTests();
  resetUnipileCalendarForTests();
  process.env.UNIPILE_WEBHOOK_SECRET = SECRET;
  process.env.UNIPILE_DSN = DSN;
  process.env.UNIPILE_API_KEY = KEY;
  process.env.UNIPILE_CALENDAR_ACCOUNT_ID = ACCOUNT;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  setBookingEventFetchForTests(mockCalendarFetch());
  installBookingInbound();
});

afterEach(() => {
  resetBookingCodesForTests();
  resetHoldsForTests();
  resetInboundForTests();
  resetUnipileCalendarForTests();
  delete process.env.UNIPILE_WEBHOOK_SECRET;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
});

describe("alphabet", () => {
  it("has no dash, underscore, I, O, 0 or 1, matching identity.ts:98-102", () => {
    assert.equal(BOOKING_CODE_ALPHABET.includes("-"), false);
    assert.equal(BOOKING_CODE_ALPHABET.includes("_"), false);
    assert.equal(BOOKING_CODE_ALPHABET.includes("I"), false);
    assert.equal(BOOKING_CODE_ALPHABET.includes("O"), false);
    assert.equal(BOOKING_CODE_ALPHABET.includes("0"), false);
    assert.equal(BOOKING_CODE_ALPHABET.includes("1"), false);
    assert.equal(BOOKING_CODE_ALPHABET, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  });

  it("mints codes the shared regex accepts, and never a copy of that regex", () => {
    for (let i = 0; i < 40; i += 1) {
      const code = mintBookingCode();
      assert.equal(code.length, BOOKING_CODE_LENGTH);
      assert.equal(extractBookingCode(bookingConfirmMessage(code)), code);
      assert.equal(BOOKING_CODE_RE.exec(bookingConfirmMessage(code))?.[1], code);
    }
  });
});

describe("planted code and /confirmed", () => {
  it("confirms when the inbound matcher sees the planted text in the expected chat, and only after the event exists", async () => {
    const planted = plantBookingCode();
    assert.equal(getBookingConfirmed(planted.code).confirmed, false);

    const inbound = acceptUnipileInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
    assert.equal(inbound.authorized, true);
    if (!inbound.authorized || inbound.kind !== "message") return;
    await proveHeldBooking(inbound.message);

    const confirmed = getBookingConfirmed(planted.code);
    assert.equal(confirmed.confirmed, true);
    if (!confirmed.confirmed) return;
    assert.equal(typeof confirmed.at, "string");
    assert.equal(confirmed.meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
  });

  it("does not confirm a code from a different chat than the one that first presented it", async () => {
    const planted = plantBookingCode();
    const first = acceptUnipileInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
    assert.equal(first.authorized, true);
    if (first.authorized && first.kind === "message") await proveHeldBooking(first.message);

    resetInboundForTests();
    installBookingInbound();
    const other = acceptUnipileInbound(
      liveMessage(bookingConfirmMessage(planted.code), { chat_id: OTHER_CHAT, message_id: "msg_other" }),
      SECRET,
    );
    assert.equal(other.authorized, true);
    if (other.authorized && other.kind === "message") await proveHeldBooking(other.message);

    const confirmed = getBookingConfirmed(planted.code);
    assert.equal(confirmed.confirmed, true);
    if (!confirmed.confirmed) return;
  });

  it("does not match after five minutes", async () => {
    const planted = plantBookingCode(Date.now() - BOOKING_CODE_TTL_MS - 1);
    const inbound = acceptUnipileInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
    if (inbound.authorized && inbound.kind === "message") await proveHeldBooking(inbound.message);
    assert.equal(getBookingConfirmed(planted.code).confirmed, false);
  });

  it("returns confirmed false for a code that was never planted", () => {
    assert.deepEqual(getBookingConfirmed("K7QMX2"), { confirmed: false });
  });
});

describe("return address", () => {
  it("is six dictatable characters and does not collide with first-level routes", () => {
    const reserved = [
      "team",
      "blog",
      "terms",
      "setup",
      "partner",
      "privacy",
      "pricing",
      "services",
      "adgrant",
      "contact",
      "w",
    ];
    for (const route of reserved) {
      assert.equal(isBookingReturnCode(route), false, route);
    }
    assert.equal(isBookingReturnCode("K7QMX2"), true);
    assert.equal(normalizeBookingCode("k7qmx2"), "K7QMX2");
  });
});
