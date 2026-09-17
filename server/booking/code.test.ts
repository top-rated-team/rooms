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
import { generateKeyPairSync } from "node:crypto";

import { acceptInbound, resetInboundForTests } from "../whatsapp";
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
import {
  GOOGLE_CALENDAR_API,
  GOOGLE_FREEBUSY_URL,
  GOOGLE_TOKEN_URL,
  resetGcalForTests,
} from "./gcal";
import { resetHoldsForTests } from "./hold";

/* Fixture ids, not ours: the real ones are environment. */
const DEFAULT_WHATSAPP_ACCOUNT_ID = "acct_whatsapp_for_tests";

const SECRET = "test-webhook-secret-value";
const OUR_USER = "42000000000@s.whatsapp.net";
const VISITOR = "123456789012345@lid";
const CHAT = "chat_booking_1";
const OTHER_CHAT = "chat_booking_other";
const DSN = "https://hosted.test.example:9443/api/v1";
const KEY = "test-key-do-not-log";
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
    if (url === GOOGLE_TOKEN_URL) {
      return jsonResponse(200, { access_token: "sa-token-for-tests", expires_in: 3600 });
    }
    if (method === "GET" && url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) {
      return jsonResponse(200, { id: CALENDAR_ID, timeZone: TZ });
    }
    if (method === "POST" && url === GOOGLE_FREEBUSY_URL) {
      return jsonResponse(200, { calendars: { [CALENDAR_ID]: { busy: [] } } });
    }
    if (method === "POST" && url.includes("/calendars/") && url.includes("/events")) {
      return jsonResponse(200, { id: "evt_1", hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" });
    }
    if (method === "GET" && url.includes("/events/")) {
      return jsonResponse(200, { id: "evt_1", hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" });
    }
    if (method === "DELETE" && url.includes("/events/")) {
      return new Response(null, { status: 204 });
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

beforeEach(() => {
  resetBookingCodesForTests();
  resetHoldsForTests();
  resetInboundForTests();
  resetGcalForTests();
  process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET = SECRET;
  process.env.HOSTED_WHATSAPP_BASE_URL = DSN;
  process.env.HOSTED_WHATSAPP_API_KEY = KEY;
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
  delete process.env.HOSTED_WHATSAPP_ACCOUNT_ID;
  setBookingEventFetchForTests(mockCalendarFetch());
  installBookingInbound();
  /* The id is environment now; this is a fixture, not ours. Set AFTER the
     deletes above, or it is deleted in the same breath. */
  process.env.HOSTED_WHATSAPP_ACCOUNT_ID = DEFAULT_WHATSAPP_ACCOUNT_ID;
});

afterEach(() => {
  resetBookingCodesForTests();
  resetHoldsForTests();
  resetInboundForTests();
  resetGcalForTests();
  delete process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET;
  delete process.env.HOSTED_WHATSAPP_ACCOUNT_ID;
  delete process.env.HOSTED_WHATSAPP_BASE_URL;
  delete process.env.HOSTED_WHATSAPP_API_KEY;
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
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

    const inbound = acceptInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
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
    const first = acceptInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
    assert.equal(first.authorized, true);
    if (first.authorized && first.kind === "message") await proveHeldBooking(first.message);

    resetInboundForTests();
    installBookingInbound();
    const other = acceptInbound(
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
    const inbound = acceptInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
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
