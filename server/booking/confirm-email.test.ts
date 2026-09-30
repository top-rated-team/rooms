/**
 * A time picked inside an email, confirmed from the inbox. Run it with:
 *
 *   npx tsx --test server/booking/confirm-email.test.ts
 *
 * What has to stay true: picking the time writes nothing to the calendar and
 * sends one letter with a link; the slot is held meanwhile; only that link
 * writes the event, with the address on it so Google invites them; it writes
 * one event however many times it is used; a hold nobody confirms runs out;
 * the owner's own calendar is asked again before writing; there is never a
 * WhatsApp route; and a deployment that cannot send mail books as it always
 * did rather than leaving the person waiting for a letter that never comes.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { changeBooking, postBooking } from "./calendar";
import { EMAIL_CONFIRM_ADDRESS_LINE, EMAIL_CONFIRM_SEND_FAILED_LINE, confirmationLetter } from "./confirm-email";
import { signAddress } from "./link-sign";
import {
  EMAIL_LINK_EXPIRED_LINE,
  confirmEmailHold,
  emailHoldStatus,
  getBookingConfirmed,
  resetBookingCodesForTests,
} from "./confirm";
import { GOOGLE_CALENDAR_API, GOOGLE_FREEBUSY_URL, GOOGLE_TOKEN_URL, resetGcalForTests } from "./gcal";
import { bindHoldChat, getHoldByToken, resetHoldsForTests, slotIsHeld } from "./hold";
import { getBookingSlots, resetSlotsCacheForTests } from "./slots";

const CALENDAR_ID = "dan@top-rated.team";
const TZ = "Europe/Bratislava";
const NOW = new Date("2026-09-09T08:00:00.000Z");
const MINUTE = 60_000;
/* 14:00 in Bratislava on the 10th, as the calendar test pins it. */
const PICK = { date: "2026-09-10", time: "14:00", name: "ada", topic: "call", email: "ada+ads@example.com", confirm: "email" };

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function configure(opts: { mail?: boolean } = {}): void {
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: "service_account",
    client_email: "sa@test.iam.gserviceaccount.com",
    private_key: privateKey,
  });
  process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
  process.env.PUBLIC_BASE_URL = "https://top-rated.team";
  /* A WhatsApp transport too, so "never a WhatsApp route" is tested where one exists. */
  process.env.HOSTED_WHATSAPP_BASE_URL = "https://hosted.test.example:9443/api/v1";
  process.env.HOSTED_WHATSAPP_API_KEY = "test-hosted-key";
  process.env.HOSTED_WHATSAPP_ACCOUNT_ID = "acc";
  if (opts.mail !== false) {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.LEAD_EMAIL_FROM = "contact@top-rated.team";
  }
}

function reset(): void {
  resetSlotsCacheForTests();
  resetGcalForTests();
  resetBookingCodesForTests();
  resetHoldsForTests();
  for (const name of [
    "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON",
    "GOOGLE_CALENDAR_ID",
    "PUBLIC_BASE_URL",
    "HOSTED_WHATSAPP_BASE_URL",
    "HOSTED_WHATSAPP_API_KEY",
    "HOSTED_WHATSAPP_ACCOUNT_ID",
    "RESEND_API_KEY",
    "LEAD_EMAIL_FROM",
  ]) {
    delete process.env[name];
  }
}

beforeEach(reset);
afterEach(reset);

/** Google Calendar and Resend, recording what was written and sent. */
function fakes(opts: { resendStatus?: number } = {}) {
  const state = { busy: false };
  const events: { url: string; body: Record<string, unknown> }[] = [];
  const moves: { url: string; body: Record<string, unknown> }[] = [];
  const letters: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === GOOGLE_TOKEN_URL) return jsonResponse(200, { access_token: "t", expires_in: 3600 });
    if (method === "GET" && url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) {
      return jsonResponse(200, { id: CALENDAR_ID, timeZone: TZ });
    }
    if (method === "POST" && url === GOOGLE_FREEBUSY_URL) {
      return jsonResponse(200, {
        calendars: { [CALENDAR_ID]: { busy: state.busy ? [{ start: "2026-09-10T11:45:00.000Z", end: "2026-09-10T12:15:00.000Z" }] : [] } },
      });
    }
    if (method === "POST" && url.includes("/events")) {
      events.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return jsonResponse(200, { id: `evt_${events.length}`, hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" });
    }
    if (method === "PATCH" && url.includes("/events/")) {
      moves.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return jsonResponse(200, { id: "evt_1", status: "confirmed", hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" });
    }
    if (method === "POST" && url === "https://api.resend.com/emails") {
      letters.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse(opts.resendStatus ?? 200, { id: "email_1" });
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, state, events, moves, letters };
}

function tokenFrom(letter: Record<string, unknown>): string {
  const match = /https:\/\/top-rated\.team\/book\/confirm\/([A-Za-z0-9_-]+)/.exec(String(letter.text));
  assert.ok(match, "the letter carries the confirmation link");
  return match[1]!;
}

async function pick(fake: ReturnType<typeof fakes>) {
  const result = await postBooking(PICK, { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("not held");
  return result.body;
}

describe("a time picked inside an email", () => {
  it("is held, not written, and one letter with a link goes to the address it was picked for", async () => {
    configure();
    const fake = fakes();
    const body = await pick(fake);
    assert.equal(body.booked, false);
    assert.ok("via" in body && body.via === "email");
    if (!("via" in body)) return;
    assert.equal(body.email, "ada+ads@example.com");
    assert.equal(body.startsAt, "2026-09-10T12:00:00.000Z");
    assert.equal(Date.parse(body.expiresAt) - NOW.getTime(), 30 * MINUTE);
    assert.equal(fake.events.length, 0, "nothing on the calendar yet");
    assert.equal(fake.letters.length, 1);
    assert.deepEqual(fake.letters[0]!.to, ["ada+ads@example.com"]);
    assert.match(String(fake.letters[0]!.subject), /^Confirm your call: /);
    assert.match(String(fake.letters[0]!.html), /Confirm the call/);
    tokenFrom(fake.letters[0]!);

    const slots = await getBookingSlots("2026-09-10", 1, { fetchImpl: fake.fetchImpl, now: NOW });
    assert.ok(slots.ok && !slots.body.days[0]!.slots.includes("14:00"), "the held time is not offered to anyone else");
    assert.deepEqual(getBookingConfirmed(body.code, NOW.getTime()), { confirmed: false });
  });

  it("is written once the link is used, with the address on it so Google sends the invite", async () => {
    configure();
    const fake = fakes();
    const held = await pick(fake);
    const token = tokenFrom(fake.letters[0]!);
    assert.equal(emailHoldStatus(token, NOW.getTime() + MINUTE).status, "pending");

    const later = new Date(NOW.getTime() + 10 * MINUTE);
    const [first, second] = await Promise.all([
      confirmEmailHold(token, { fetchImpl: fake.fetchImpl, now: later }),
      confirmEmailHold(token, { fetchImpl: fake.fetchImpl, now: later }),
    ]);
    assert.equal(fake.events.length, 1, "a double click writes one event");
    assert.equal(first.ok && first.status, 201);
    assert.deepEqual(second, first, "the second click gets the first one's answer");
    if (!first.ok) return;
    assert.match(first.body.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(first.body.invited, true);
    assert.deepEqual(fake.events[0]!.body.attendees, [{ email: "ada+ads@example.com" }]);
    assert.match(fake.events[0]!.url, /sendUpdates=all/);

    const again = await confirmEmailHold(token, { fetchImpl: fake.fetchImpl, now: later });
    assert.equal(again.ok && again.status, 200);
    assert.equal(again.ok && again.body.code, "", "a used link is not a way to move or cancel the call");
    assert.equal(fake.events.length, 1);

    assert.equal(emailHoldStatus(token, later.getTime()).status, "confirmed");
    const polled = getBookingConfirmed("code" in held ? held.code : "", later.getTime());
    assert.equal(polled.confirmed, true, "the popup that is still waiting sees it");
    assert.equal(polled.confirmed && polled.invited, true);
  });

  it("gives the old time back when the confirmed call is moved", async () => {
    configure();
    const fake = fakes();
    await pick(fake);
    const later = new Date(NOW.getTime() + 10 * MINUTE);
    const confirmed = await confirmEmailHold(tokenFrom(fake.letters[0]!), { fetchImpl: fake.fetchImpl, now: later });
    if (!confirmed.ok) throw new Error("not confirmed");
    assert.equal(slotIsHeld(PICK.date, PICK.time, later.getTime()), true);

    const moved = await changeBooking({ code: confirmed.body.code, date: PICK.date, time: "15:00" }, { fetchImpl: fake.fetchImpl, now: later });
    assert.equal(moved.ok, true, JSON.stringify(moved));
    assert.equal(fake.moves.length, 1, "moved in place");
    assert.equal(fake.events.length, 1, "no second event");
    assert.equal(slotIsHeld(PICK.date, PICK.time, later.getTime()), false, "the old time is free again");
    assert.equal(slotIsHeld(PICK.date, "15:00", later.getTime()), true);
  });

  it("runs out when nobody confirms it, and frees the time", async () => {
    configure();
    const fake = fakes();
    await pick(fake);
    const token = tokenFrom(fake.letters[0]!);
    const late = new Date(NOW.getTime() + 31 * MINUTE);
    assert.equal(emailHoldStatus(token, late.getTime()).status, "expired");
    const result = await confirmEmailHold(token, { fetchImpl: fake.fetchImpl, now: late });
    assert.deepEqual(result, { ok: false, status: 410, error: EMAIL_LINK_EXPIRED_LINE });
    assert.equal(fake.events.length, 0);
    const slots = await getBookingSlots("2026-09-10", 1, { fetchImpl: fake.fetchImpl, now: late });
    assert.ok(slots.ok && slots.body.days[0]!.slots.includes("14:00"));
  });

  it("asks the owner's calendar again, and gives the time up if he has filled it meanwhile", async () => {
    configure();
    const fake = fakes();
    await pick(fake);
    const token = tokenFrom(fake.letters[0]!);
    fake.state.busy = true;
    const result = await confirmEmailHold(token, { fetchImpl: fake.fetchImpl, now: new Date(NOW.getTime() + 5 * MINUTE) });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 409);
    assert.equal(fake.events.length, 0);
    assert.equal(getHoldByToken(token, NOW.getTime()), undefined, "the hold is released");
  });

  it("is never offered a WhatsApp route: no address is an error, and a WhatsApp message proves nothing", async () => {
    configure();
    const fake = fakes();
    const noAddress = await postBooking({ ...PICK, email: "" }, { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" });
    assert.deepEqual(noAddress, { ok: false, status: 503, error: EMAIL_CONFIRM_ADDRESS_LINE });

    const held = await pick(fake);
    assert.equal(bindHoldChat("code" in held ? held.code : "", "chat_1", NOW.getTime()), null);
  });

  it("gives the time back and says so when the letter cannot be sent", async () => {
    configure();
    const fake = fakes({ resendStatus: 500 });
    const result = await postBooking(PICK, { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" });
    assert.deepEqual(result, { ok: false, status: 503, error: EMAIL_CONFIRM_SEND_FAILED_LINE });
    const slots = await getBookingSlots("2026-09-10", 1, { fetchImpl: fake.fetchImpl, now: NOW });
    assert.ok(slots.ok && slots.body.days[0]!.slots.includes("14:00"));
  });

  it("books at once, with Google's invite, where this deployment cannot send mail", async () => {
    configure({ mail: false });
    const fake = fakes();
    const result = await postBooking(PICK, { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" });
    assert.equal(result.ok && result.body.booked, true);
    assert.equal(fake.letters.length, 0);
    assert.equal(fake.events.length, 1);
  });

  it("knows nothing about a token it did not mint", () => {
    assert.equal(emailHoldStatus("a".repeat(43)).status, "unknown");
    assert.equal(emailHoldStatus("").status, "unknown");
  });
});

describe("a time picked from a block the owner signed for that address", () => {
  it("is booked at once, with Google's invite, and no confirmation letter", async () => {
    configure();
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    try {
      const fake = fakes();
      const sig = signAddress(PICK.email)!;
      const result = await postBooking({ ...PICK, sig }, { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" });
      assert.equal(result.ok && result.body.booked, true, JSON.stringify(result));
      assert.equal(fake.letters.length, 0, "no confirmation letter");
      assert.equal(fake.events.length, 1);
      assert.deepEqual(fake.events[0]!.body.attendees, [{ email: PICK.email }]);
      assert.match(fake.events[0]!.url, /sendUpdates=all/);
    } finally {
      delete process.env.LEAD_INBOX_KEY;
    }
  });

  it("books once per block: a later click, on the same time or another, books nothing and cannot change it", async () => {
    configure();
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    try {
      const fake = fakes();
      const sig = signAddress(PICK.email)!;
      const opts = { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" };
      const first = await postBooking({ ...PICK, sig }, opts);
      assert.ok(first.ok && first.body.booked && first.body.code.length === 6, "the first click gets the way back");

      /* The same email, opened by somebody else in Cc: the same time… */
      const again = await postBooking({ ...PICK, sig }, opts);
      assert.ok(again.ok && again.body.booked);
      if (again.ok && again.body.booked) {
        assert.equal(again.body.code, "", "no code, so no Change or Cancel");
        assert.equal(again.body.startsAt, "2026-09-10T12:00:00.000Z");
        assert.equal("already" in again.body, false);
      }
      /* …and another time in the same block. */
      const other = await postBooking({ ...PICK, time: "15:30", sig }, opts);
      assert.ok(other.ok && other.body.booked);
      if (other.ok && other.body.booked) {
        assert.equal(other.body.code, "");
        assert.equal(other.body.already, true);
        assert.equal(other.body.startsAt, "2026-09-10T12:00:00.000Z", "shown the call that stands, not the one clicked");
      }
      assert.equal(fake.events.length, 1, "one call in the calendar");
    } finally {
      delete process.env.LEAD_INBOX_KEY;
    }
  });

  it("still counts a call that has begun: a slot is offered until it ends", async () => {
    configure();
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    try {
      const fake = fakes();
      const sig = signAddress(PICK.email)!;
      /* 12:10Z: the 14:00-Bratislava (12:00Z) call started ten minutes ago. */
      const during = new Date("2026-09-10T12:10:00.000Z");
      const first = await postBooking({ ...PICK, sig }, { fetchImpl: fake.fetchImpl, now: during, host: "top-rated.team" });
      assert.ok(first.ok && first.body.booked && first.body.code.length === 6);
      const cc = await postBooking({ ...PICK, time: "15:30", sig }, { fetchImpl: fake.fetchImpl, now: during, host: "top-rated.team" });
      assert.ok(cc.ok && cc.body.booked && cc.body.code === "" && cc.body.already === true);
      assert.equal(fake.events.length, 1);
    } finally {
      delete process.env.LEAD_INBOX_KEY;
    }
  });

  it("keeps the rule to signed blocks: the popup's own bookings are not limited by it", async () => {
    configure({ mail: false });
    const fake = fakes();
    const opts = { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" };
    await postBooking({ date: "2026-09-10", time: "14:00", name: "ada", topic: "call", email: "ada@example.com" }, opts);
    const second = await postBooking({ date: "2026-09-10", time: "15:30", name: "ada", topic: "call", email: "ada@example.com" }, opts);
    assert.ok(second.ok && second.body.booked && second.body.code.length === 6);
    assert.equal(fake.events.length, 2);
  });

  it("is still confirmed by email when the signature is not for this address, or not ours", async () => {
    configure();
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    try {
      const fake = fakes();
      const other = await postBooking(
        { ...PICK, sig: signAddress("bea@example.com")! },
        { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" },
      );
      assert.ok(other.ok && "via" in other.body && other.body.via === "email", "an address changed in the popup is somebody else's");
      const forged = await postBooking(
        { ...PICK, time: "15:00", sig: "A".repeat(22) },
        { fetchImpl: fake.fetchImpl, now: NOW, host: "top-rated.team" },
      );
      assert.ok(forged.ok && "via" in forged.body && forged.body.via === "email");
      assert.equal(fake.events.length, 0);
      assert.equal(fake.letters.length, 2);
    } finally {
      delete process.env.LEAD_INBOX_KEY;
    }
  });
});

describe("confirmationLetter", () => {
  it("names the time in the calendar's zone and says what happens if it is not used", () => {
    const letter = confirmationLetter(
      { startsAt: "2026-09-10T12:00:00.000Z", timezone: TZ },
      "https://top-rated.team/book/confirm/tok",
      30,
    );
    assert.match(letter.text, /30-minute call with Top-Rated Team on Thursday 10 September( at)? 14:00 CEST/);
    assert.match(letter.text, /nothing is booked and the time is free again/);
    assert.match(letter.html, /href="https:\/\/top-rated\.team\/book\/confirm\/tok"/);
  });
});
