/**
 * The booking times inside an email. Run it with:
 *
 *   npx tsx --test shared/booking-widget.test.ts
 *
 * What has to stay true: only days with a free time are offered, times are
 * spread across the day rather than bunched at nine, every link opens the
 * popup on the time it names and asks for email confirmation, a merge tag
 * survives untouched, and nothing in the block can run or break out of an
 * attribute.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { BookingSlotsResponse } from "./api";
import { bookLinkTarget, parseBookLinkHash } from "./booking-link";
import { buildBookingWidget, chooseWidgetDays, spreadTimes, widgetDayLabel } from "./booking-widget";

const FULL_DAY = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];

const SLOTS: BookingSlotsResponse = {
  timezone: "Europe/Bratislava",
  slotMinutes: 30,
  days: [
    { date: "2026-10-01", slots: [] },
    { date: "2026-10-02", slots: FULL_DAY },
    { date: "2026-10-03", slots: [] },
    { date: "2026-10-05", slots: ["14:00", "16:30"] },
    { date: "2026-10-06", slots: ["09:00"] },
  ],
};

const BASE = { baseUrl: "https://top-rated.team", slots: SLOTS, hostName: "Top-Rated Team" };

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!.replace(/&amp;/g, "&"));
}

describe("spreadTimes", () => {
  it("spreads a limited pick across the day, first and last included", () => {
    assert.deepEqual(spreadTimes(FULL_DAY, 4), ["09:00", "11:30", "14:00", "16:30"]);
    assert.deepEqual(spreadTimes(FULL_DAY, 1), ["09:00"]);
    assert.deepEqual(spreadTimes(["09:00", "09:30"], 6), ["09:00", "09:30"]);
  });
});

describe("chooseWidgetDays", () => {
  it("offers only days with a free time, up to the number asked for", () => {
    assert.deepEqual(
      chooseWidgetDays(SLOTS, 2, 3).map((day) => day.date),
      ["2026-10-02", "2026-10-05"],
    );
  });
});

describe("widgetDayLabel", () => {
  it("names the civil date", () => {
    assert.equal(widgetDayLabel("2026-10-02"), "Fri 2 Oct");
  });
});

describe("buildBookingWidget", () => {
  it("links every time to the popup with that time picked and email confirmation asked for", () => {
    const widget = buildBookingWidget({ ...BASE, show: "times", days: 3, timesPerDay: 4, recipient: "dan+ads@example.com" });
    const links = hrefs(widget.html);
    /* 4 + 2 + 1 times, and the "Other times" link. */
    assert.equal(links.length, 8);
    const first = new URL(links[0]!);
    const target = bookLinkTarget(first.search);
    assert.deepEqual(parseBookLinkHash(target.slice(target.indexOf("#"))), {
      email: "dan+ads@example.com",
      date: "2026-10-02",
      time: "09:00",
      confirmByEmail: true,
      confirmation: null,
    });
    assert.ok(links.every((href) => href.startsWith("https://top-rated.team/book?") && href.includes("confirm=email")));
    assert.match(widget.html, /Times are in Europe\/Bratislava\./);
    assert.match(widget.text, /^Fri 2 Oct$/m);
    assert.match(widget.text, /^ {2}16:30 {2}https:\/\/top-rated\.team\/book\?date=2026-10-02&time=16:30&confirm=email&email=dan%2Bads%40example\.com$/m);
  });

  it("links days to the popup open on that day when only days are shown", () => {
    const widget = buildBookingWidget({ ...BASE, show: "days", days: 3, timesPerDay: 4 });
    const links = hrefs(widget.html);
    assert.deepEqual(links, [
      "https://top-rated.team/book?date=2026-10-02&confirm=email",
      "https://top-rated.team/book?date=2026-10-05&confirm=email",
      "https://top-rated.team/book?date=2026-10-06&confirm=email",
      "https://top-rated.team/book?confirm=email",
    ]);
    assert.match(widget.html, /Fri 2 Oct · 16 times/);
    assert.match(widget.html, /Tue 6 Oct · 1 time</);
  });

  it("leaves a merge tag in every link for the mail tool to fill in", () => {
    const widget = buildBookingWidget({ ...BASE, show: "times", days: 1, timesPerDay: 2, recipient: "{{ contact.EMAIL }}" });
    assert.ok(hrefs(widget.html).every((href) => href.endsWith("&email={{ contact.EMAIL }}")));
  });

  it("says so when nothing is free, and still offers the calendar", () => {
    const widget = buildBookingWidget({ ...BASE, slots: { ...SLOTS, days: [{ date: "2026-10-01", slots: [] }] }, show: "times", days: 3, timesPerDay: 4 });
    assert.match(widget.html, /No free times in the next days/);
    assert.deepEqual(hrefs(widget.html), ["https://top-rated.team/book?confirm=email"]);
  });

  it("has nothing in it that runs, and nothing that escapes an attribute", () => {
    const widget = buildBookingWidget({ ...BASE, hostName: `<script>alert(1)</script>"`, show: "times", days: 3, timesPerDay: 16, recipient: `x"onmouseover="alert(1)` });
    assert.doesNotMatch(widget.html, /<script|onmouseover=|<style/i);
    assert.ok(hrefs(widget.html).every((href) => !href.includes("email=")), "a recipient that is neither an address nor a tag is left out");
  });
});
