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
import {
  acceptUnipileInbound,
  dispatchInbound,
  resetInboundForTests,
} from "../unipile/inbound";
import {
  BOOKING_CODE_ALPHABET,
  BOOKING_CODE_LENGTH,
  BOOKING_CODE_RE,
  bookingConfirmMessage,
  extractBookingCode,
  mintBookingCode,
} from "./code";
import {
  BOOKING_CODE_TTL_MS,
  getBookingConfirmed,
  installBookingInbound,
  plantBookingCode,
  resetBookingCodesForTests,
} from "./confirm";

const SECRET = "test-unipile-webhook-secret-value";
const OUR_USER = "42000000000@s.whatsapp.net";
const VISITOR = "123456789012345@lid";
const CHAT = "chat_booking_1";
const OTHER_CHAT = "chat_booking_other";

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
  resetInboundForTests();
  process.env.UNIPILE_WEBHOOK_SECRET = SECRET;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  installBookingInbound();
});

afterEach(() => {
  resetBookingCodesForTests();
  resetInboundForTests();
  delete process.env.UNIPILE_WEBHOOK_SECRET;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
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
  it("confirms when the inbound matcher sees the planted text in the expected chat", () => {
    const planted = plantBookingCode();
    assert.equal(getBookingConfirmed(planted.code).confirmed, false);

    const inbound = acceptUnipileInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
    assert.equal(inbound.authorized, true);
    if (!inbound.authorized || inbound.kind !== "message") return;
    dispatchInbound(inbound);

    const confirmed = getBookingConfirmed(planted.code);
    assert.equal(confirmed.confirmed, true);
    if (!confirmed.confirmed) return;
    assert.equal(typeof confirmed.at, "string");
  });

  it("does not confirm a code from a different chat than the one that first presented it", () => {
    const planted = plantBookingCode();
    const first = acceptUnipileInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
    assert.equal(first.authorized, true);
    if (first.authorized) dispatchInbound(first);

    resetInboundForTests();
    installBookingInbound();
    const other = acceptUnipileInbound(
      liveMessage(bookingConfirmMessage(planted.code), { chat_id: OTHER_CHAT, message_id: "msg_other" }),
      SECRET,
    );
    assert.equal(other.authorized, true);
    if (other.authorized) dispatchInbound(other);

    const confirmed = getBookingConfirmed(planted.code);
    assert.equal(confirmed.confirmed, true);
    if (!confirmed.confirmed) return;
  });

  it("does not match after five minutes", () => {
    const planted = plantBookingCode(Date.now() - BOOKING_CODE_TTL_MS - 1);
    const inbound = acceptUnipileInbound(liveMessage(bookingConfirmMessage(planted.code)), SECRET);
    if (inbound.authorized) dispatchInbound(inbound);
    assert.equal(getBookingConfirmed(planted.code).confirmed, false);
  });

  it("returns confirmed false for a code that was never planted", () => {
    assert.deepEqual(getBookingConfirmed("K7QMX2"), { confirmed: false });
  });
});
