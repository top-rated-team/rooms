/**
 * Booking client. Run it with:
 *
 *   npx tsx --test client/src/lib/booking.test.ts
 *
 * The cases that have to stay true: slots keep empty days, a 409 redraws from
 * `days`, an omitted email is omitted from the body, openBooking() with no host
 * returns false so the room's /call fallback still works, and bookingReady is
 * gone.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SLOT_DAYS,
  bookSlot,
  buildBookBody,
  confirmedUrl,
  errorFromBody,
  formatSlotDay,
  openBooking,
  parseBookedPayload,
  parseConfirmedPayload,
  parseDays,
  parseSlotsPayload,
  registerBookingHost,
  resetBookingForTests,
  slotsUrl,
  todayStamp,
} from "./booking";

const SLOTS = {
  timezone: "Europe/Bratislava",
  slotMinutes: 30,
  days: [
    { date: "2026-09-10", slots: ["09:00", "09:30", "14:00"] },
    { date: "2026-09-11", slots: [] },
  ],
};

const BOOKED = {
  booked: true as const,
  startsAt: "2026-09-10T12:00:00.000Z",
  timezone: "Europe/Bratislava",
  meetUrl: "https://meet.google.com/abc-defg-hij",
  invited: true,
  whatsapp: { url: "https://wa.me/420774654822?text=K7QMX2", code: "K7QMX2" },
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetBookingForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetBookingForTests();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("slotsUrl", () => {
  it("builds the brief's GET /api/booking/slots shape", () => {
    assert.equal(slotsUrl("2026-09-10", 14), "/api/booking/slots?from=2026-09-10&days=14");
    assert.equal(SLOT_DAYS, 14);
  });
});

describe("confirmedUrl", () => {
  it("puts the planted code on the query string", () => {
    assert.equal(confirmedUrl("K7QMX2"), "/api/booking/confirmed?code=K7QMX2");
  });
});

describe("todayStamp", () => {
  it("returns a YYYY-MM-DD calendar date", () => {
    assert.match(todayStamp("UTC"), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(todayStamp("Europe/Bratislava"), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("buildBookBody", () => {
  it("omits email when it is blank, and keeps it when it is not", () => {
    assert.deepEqual(buildBookBody({ date: "2026-09-10", time: "14:00" }), {
      date: "2026-09-10",
      time: "14:00",
      name: "Visitor",
      topic: "call",
    });
    assert.deepEqual(buildBookBody({ date: "2026-09-10", time: "14:00", email: "  " }), {
      date: "2026-09-10",
      time: "14:00",
      name: "Visitor",
      topic: "call",
    });
    assert.deepEqual(buildBookBody({ date: "2026-09-10", time: "14:00", email: " someone@example.com " }), {
      date: "2026-09-10",
      time: "14:00",
      email: "someone@example.com",
      name: "someone",
      topic: "call",
    });
  });
});

describe("parseSlotsPayload", () => {
  it("keeps a day with no slots, so the UI can say nothing is free", () => {
    const parsed = parseSlotsPayload(SLOTS);
    assert.equal(parsed.timezone, "Europe/Bratislava");
    assert.equal(parsed.slotMinutes, 30);
    assert.equal(parsed.days.length, 2);
    assert.deepEqual(parsed.days[1], { date: "2026-09-11", slots: [] });
  });

  it("refuses a payload with no timezone, because wall-clock times are not absolute", () => {
    assert.throws(() => parseSlotsPayload({ ...SLOTS, timezone: "" }), /timezone/);
  });
});

describe("parseDays", () => {
  it("returns null rather than guessing when a slot is not a string", () => {
    assert.equal(parseDays([{ date: "2026-09-10", slots: [14] }]), null);
    assert.equal(parseDays("nope"), null);
  });
});

describe("parseBookedPayload", () => {
  it("reads the brief's 201 shape, including a null Meet link", () => {
    const withMeet = parseBookedPayload(BOOKED);
    assert.equal(withMeet.meetUrl, BOOKED.meetUrl);
    assert.equal(withMeet.whatsapp.code, "K7QMX2");
    const withoutMeet = parseBookedPayload({ ...BOOKED, meetUrl: null, invited: false });
    assert.equal(withoutMeet.meetUrl, null);
    assert.equal(withoutMeet.invited, false);
  });
});

describe("parseConfirmedPayload", () => {
  it("accepts both answers the brief allows", () => {
    assert.deepEqual(parseConfirmedPayload({ confirmed: false }), { confirmed: false });
    assert.deepEqual(parseConfirmedPayload({ confirmed: true, at: "2026-09-09T10:03:00.000Z" }), {
      confirmed: true,
      at: "2026-09-09T10:03:00.000Z",
    });
  });
});

describe("errorFromBody", () => {
  it("prefers the server's visitor-readable sentence", () => {
    assert.equal(
      errorFromBody({ error: "That time has just been taken. Here is what is still free." }, "fallback"),
      "That time has just been taken. Here is what is still free.",
    );
    assert.equal(errorFromBody({ error: "  " }, "fallback"), "fallback");
    assert.equal(errorFromBody(null, "fallback"), "fallback");
  });
});

describe("formatSlotDay", () => {
  it("prints the civil date, not a timezone-shifted neighbour", () => {
    assert.equal(formatSlotDay("2026-09-10"), "Thu 10 Sept");
    assert.equal(formatSlotDay("not-a-date"), "not-a-date");
  });
});

describe("openBooking", () => {
  it("returns false with no host, so Composer can still window.open", () => {
    resetBookingForTests();
    assert.equal(openBooking(), false);
  });

  it("returns true once a host is registered, with no click required", () => {
    resetBookingForTests();
    let mounted = false;
    registerBookingHost(() => {
      mounted = true;
    });
    assert.equal(openBooking(), true);
    assert.equal(mounted, true);
  });
});

describe("bookSlot", () => {
  it("treats a 409 as fresh days, not as a swallowed error", async () => {
    const days = [
      { date: "2026-09-10", slots: ["09:00"] },
      { date: "2026-09-11", slots: [] },
    ];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      assert.match(String(input), /\/api\/booking$/);
      return jsonResponse(409, {
        error: "That time has just been taken. Here is what is still free.",
        days,
      });
    }) as typeof fetch;

    const result = await bookSlot({ date: "2026-09-10", time: "14:00" });
    assert.equal(result.ok, false);
    if (result.ok || !result.conflict) throw new Error("expected a conflict");
    assert.equal(result.error, "That time has just been taken. Here is what is still free.");
    assert.deepEqual(result.days, days);
  });

  it("reads a 201 and does not send a blank email", async () => {
    let sent: string | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = typeof init?.body === "string" ? init.body : null;
      return jsonResponse(201, BOOKED);
    }) as typeof fetch;

    const result = await bookSlot({ date: "2026-09-10", time: "14:00", email: "  " });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected a booking");
    assert.equal(result.booked.whatsapp.code, "K7QMX2");
    assert.deepEqual(JSON.parse(sent ?? ""), {
      date: "2026-09-10",
      time: "14:00",
      name: "Visitor",
      topic: "call",
    });
  });
});

describe("bookingReady", () => {
  it("is not exported", async () => {
    const mod = (await import("./booking")) as Record<string, unknown>;
    assert.equal("bookingReady" in mod, false);
  });
});
