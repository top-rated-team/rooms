/**
 * Reply to book: the addresses. Run it with:
 *
 *   npx tsx --test shared/booking-reply.test.ts
 *
 * What has to stay true: an address names exactly one slot and reads back to
 * it; nothing at another domain or of another shape is taken for a booking;
 * and in the email block every time opens a message to its own address while
 * day links and "Other times" stay web links.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { BookingSlotsResponse } from "./api";
import { parseReplyAddress, replyAddress, replyMailto } from "./booking-reply";
import { buildBookingWidget } from "./booking-widget";

const DOMAIN = "book.top-rated.team";

describe("replyAddress and parseReplyAddress", () => {
  it("name one slot, and read back to it", () => {
    const address = replyAddress("Book.Top-Rated.Team", "2026-09-30", "10:30");
    assert.equal(address, "call-2026-09-30-1030@book.top-rated.team");
    assert.deepEqual(parseReplyAddress(address, DOMAIN), { date: "2026-09-30", time: "10:30" });
    assert.deepEqual(parseReplyAddress("Top-Rated Team <CALL-2026-09-30-1030@Book.Top-Rated.Team>", DOMAIN), {
      date: "2026-09-30",
      time: "10:30",
    });
  });

  it("take nothing else for a booking", () => {
    for (const address of [
      "call-2026-09-30-1030@elsewhere.example",
      "dan@book.top-rated.team",
      "call-2026-02-31-1030@book.top-rated.team",
      "call-2026-09-30-2530@book.top-rated.team",
      "call-2026-09-30-103@book.top-rated.team",
      "xcall-2026-09-30-1030@book.top-rated.team",
      "call-2026-09-30-1030@book.top-rated.team.evil.example",
    ]) {
      assert.equal(parseReplyAddress(address, DOMAIN), null, address);
    }
  });
});

describe("replyMailto", () => {
  it("opens a message to the slot's address that says what sending does", () => {
    const href = replyMailto(DOMAIN, { date: "2026-09-30", time: "10:30", when: "Wed 30 Sept, 10:30 (Europe/Bratislava)", minutes: 30, hostName: "Top-Rated Team" });
    const url = new URL(href);
    assert.equal(url.protocol, "mailto:");
    assert.equal(url.pathname, "call-2026-09-30-1030@book.top-rated.team");
    assert.equal(url.searchParams.get("subject"), "Book the call: Wed 30 Sept, 10:30 (Europe/Bratislava)");
    assert.match(url.searchParams.get("body") ?? "", /^Sending this email books a 30-minute call with Top-Rated Team/);
  });
});

describe("the email block, replying to book", () => {
  const SLOTS: BookingSlotsResponse = {
    timezone: "Europe/Bratislava",
    slotMinutes: 30,
    days: [{ date: "2026-09-30", slots: ["09:00", "10:30"] }],
  };
  const base = { baseUrl: "https://top-rated.team", slots: SLOTS, days: 1, timesPerDay: 4, hostName: "Top-Rated Team", replyTo: { domain: DOMAIN } };
  const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));

  it("makes every time a message to its own address, and keeps Other times on the web", () => {
    const widget = buildBookingWidget({ ...base, show: "times" });
    const links = hrefs(widget.html);
    assert.deepEqual(
      links.slice(0, 2).map((href) => new URL(href).pathname),
      ["call-2026-09-30-0900@book.top-rated.team", "call-2026-09-30-1030@book.top-rated.team"],
    );
    assert.equal(links[2], "https://top-rated.team/book?confirm=email");
    assert.doesNotMatch(widget.html, /mailto:[^"]*" target=/, "a mailto: opens the mail app, not a tab");
    assert.match(widget.html, /Send it, and the call is booked/);
    assert.match(widget.text, /^ {2}10:30 {2}email call-2026-09-30-1030@book\.top-rated\.team$/m);
  });

  it("leaves days-only blocks as web links, since a day is not yet a time", () => {
    const widget = buildBookingWidget({ ...base, show: "days" });
    assert.ok(hrefs(widget.html).every((href) => href.startsWith("https://top-rated.team/book")));
  });
});
