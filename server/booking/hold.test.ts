/**
 * Holds. Run it with:
 *
 *   npx tsx --test server/booking/hold.test.ts
 *
 * A hold is not a booking. It expires in five minutes. Two holds on the
 * same slot collide. A fork is never offered the house WhatsApp number.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ADDRESS_REQUIRED_LINE,
  HOLD_TTL_MS,
  HOST_LINKEDIN_LINE,
  activeHeldSlots,
  bookingEventDescription,
  existingBookingResponse,
  holdToResponse,
  placeHold,
  recordBooking,
  resetHoldsForTests,
  slotIsHeld,
  whatsappGateAllowed,
} from "./hold";

const DRAFT = {
  date: "2026-09-10",
  time: "14:00",
  name: "Ada",
  topic: "google-ads",
  timezone: "Europe/Bratislava",
  startsAt: "2026-09-10T12:00:00.000Z",
};

beforeEach(() => {
  resetHoldsForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.PUBLIC_BASE_URL;
});

afterEach(() => {
  resetHoldsForTests();
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.PUBLIC_BASE_URL;
});

describe("whatsappGateAllowed", () => {
  it("is false when Unipile is not configured, even on localhost", () => {
    assert.equal(whatsappGateAllowed("http://localhost"), false);
  });

  it("is true on a house host once Unipile is configured", () => {
    process.env.UNIPILE_DSN = "unipile.test.example:9443";
    process.env.UNIPILE_API_KEY = "test-unipile-key-do-not-log";
    assert.equal(whatsappGateAllowed("http://localhost"), true);
    assert.equal(whatsappGateAllowed("https://ai.top-rated.team"), true);
  });

  it("is false on a fork, so the Prague number cannot leak", () => {
    process.env.UNIPILE_DSN = "unipile.test.example:9443";
    process.env.UNIPILE_API_KEY = "test-unipile-key-do-not-log";
    assert.equal(whatsappGateAllowed("https://partner.example"), false);
    assert.equal(typeof ADDRESS_REQUIRED_LINE, "string");
  });
});

describe("placeHold", () => {
  it("returns a dictatable code and a wa.me link, and is not a booking", () => {
    const held = placeHold(DRAFT);
    assert.equal("taken" in held, false);
    if ("taken" in held) return;
    const body = holdToResponse(held);
    assert.equal(body.booked, false);
    assert.equal(body.held, true);
    assert.equal(body.meetUrl, null);
    assert.equal(body.invited, false);
    assert.match(body.whatsapp.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.match(body.whatsapp.url, /^https:\/\/wa\.me\/420774654822\?text=/);
    assert.equal(slotIsHeld(DRAFT.date, DRAFT.time), true);
  });

  it("refuses a second hold on the same slot", () => {
    assert.equal("taken" in placeHold(DRAFT), false);
    assert.deepEqual(placeHold({ ...DRAFT, name: "Bea" }), { taken: true });
  });

  it("frees the slot after five minutes if it was never proved", () => {
    const createdAt = Date.now() - HOLD_TTL_MS - 1;
    const held = placeHold(DRAFT, createdAt);
    assert.equal("taken" in held, false);
    assert.equal(slotIsHeld(DRAFT.date, DRAFT.time), false);
    assert.equal(activeHeldSlots().length, 0);
  });
});

describe("bookingEventDescription", () => {
  it("names the host with a LinkedIn profile and omits a visitor line when none was handed over", () => {
    const body = bookingEventDescription({ topic: "google-ads" });
    assert.equal(body.startsWith(HOST_LINKEDIN_LINE), true);
    assert.equal(body.includes("google-ads"), true);
    assert.equal(body.includes("Visitor"), false);
  });

  it("adds the visitor line only when a LinkedIn profile was actually given", () => {
    const body = bookingEventDescription({
      topic: "google-ads",
      visitorProfile: { name: "Ada Lovelace", url: "https://www.linkedin.com/in/ada/" },
    });
    assert.equal(body.includes("Ada Lovelace: https://www.linkedin.com/in/ada/"), true);
  });
});

describe("stored booking", () => {
  const ROW = {
    code: "K7QMX2",
    eventId: "evt_1",
    calendarId: "cal_1",
    date: "2026-09-10",
    time: "14:00",
    startsAt: "2026-09-10T12:00:00.000Z",
    timezone: "Europe/Bratislava",
    meetUrl: "https://meet.google.com/aaa-bbbb-ccc" as string | null,
    invited: true,
    email: "ada@example.com",
    chatId: null as string | null,
    name: "Ada",
    topic: "google-ads",
    createdAt: Date.parse("2026-09-09T08:00:00.000Z"),
    cancelledAt: null as number | null,
  };

  it("shows time and Meet, never name or address, and only until the call has ended", () => {
    recordBooking(ROW);
    const shown = existingBookingResponse("k7qmx2", Date.parse("2026-09-09T08:00:00.000Z"));
    assert.equal(shown.found, true);
    if (!shown.found) return;
    assert.equal(shown.startsAt, ROW.startsAt);
    assert.equal(shown.viaWhatsApp, false);
    assert.equal("email" in shown, false);
    assert.equal("name" in shown, false);
    /* Still there DURING the call: taking the Meet link away from somebody
       a second after the start is taking it from the person sitting in it. */
    assert.equal(existingBookingResponse("K7QMX2", Date.parse("2026-09-10T12:00:01.000Z")).found, true);
    assert.equal(existingBookingResponse("K7QMX2", Date.parse("2026-09-10T12:29:00.000Z")).found, true);
    /* Gone once it has ended. */
    assert.deepEqual(existingBookingResponse("K7QMX2", Date.parse("2026-09-10T12:31:00.000Z")), { found: false });
  });
});
