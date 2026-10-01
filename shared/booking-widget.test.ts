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
      sig: null,
      instant: false,
      guests: [],
    });
    assert.ok(links.every((href) => href.startsWith("https://top-rated.team/book?") && href.includes("confirm=email")));
    assert.match(widget.html, /Times are <strong[^>]*>Central European Time \(Bratislava, CEST\)<\/strong>\./);
    assert.match(widget.text, /^Pick a time\. Times are Central European Time \(Bratislava, CEST\)\.$/m);
    assert.match(widget.text, /^Fri 2 Oct$/m);
    assert.match(widget.text, /^ {2}16:30 {2}https:\/\/top-rated\.team\/book\?date=2026-10-02&time=16:30&confirm=email&email=dan%2Bads%40example\.com$/m);
  });

  it("shows the times on the reader's clock and names the zone, while every link books the calendar's own time", () => {
    const widget = buildBookingWidget({ ...BASE, show: "times", days: 2, timesPerDay: 16, liveImages: true, viewerZone: "America/New_York" });
    assert.equal(widget.zone, "America/New_York");
    /* 09:00 in Bratislava on 2 October is 03:00 in New York. */
    assert.deepEqual(widget.days[0], { date: "2026-10-02", slots: FULL_DAY.map((time) => `${String(Number(time.slice(0, 2)) - 6).padStart(2, "0")}${time.slice(2)}`) });
    assert.match(widget.html, /Times are <strong[^>]*>Eastern Time \(New York, EDT\)<\/strong>/);
    const links = hrefs(widget.html);
    assert.ok(links[0]!.includes("date=2026-10-02&time=09:00&"), links[0]);
    const images = [...widget.html.matchAll(/<img src="([^"]*)" width="64" height="34" alt="([^"]*)"/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(images[0], ["https://top-rated.team/api/booking/slot/2026-10-02/0900.png?label=0300", "03:00"]);
    assert.match(widget.text, /^ {2}03:00 {2}https:\/\/top-rated\.team\/book\?date=2026-10-02&time=09:00&confirm=email$/m);
  });

  it("makes a block worked out when it is opened: places in a queue, drawn and resolved by the server", () => {
    const grid = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
    const widget = buildBookingWidget({
      ...BASE,
      show: "times",
      days: 2,
      timesPerDay: 3,
      frame: "live",
      workingTimes: grid,
      liveImages: true,
      recipient: "ada@example.com",
      recipientSig: "AbCdEfGhIjKlMnOpQrStUv",
      viewerZone: "America/New_York",
    });
    const links = hrefs(widget.html);
    assert.equal(links.length, 7, "two rows of three, and Other times");
    assert.equal(links[0], "https://top-rated.team/book/live?r=0&t=0900&c=0900,1300,1600&confirm=email&email=ada%40example.com&sig=AbCdEfGhIjKlMnOpQrStUv");
    assert.ok(links.slice(0, 6).every((href) => !href.includes("instant")));
    assert.match(widget.html, /src="https:\/\/top-rated\.team\/api\/booking\/live\/1\/weekday\.png\?c=0900,1300,1600&amp;tz=America%2FNew_York" width="34" height="16" alt="Tue 6 Oct"/);
    /* As it stands now, for a reader with no pictures: 09:00 in Bratislava is 03:00 in New York. */
    assert.match(widget.html, /\/api\/booking\/live\/0\/0900\.png\?c=0900,1300,1600&amp;tz=America%2FNew_York&amp;label=0300" width="64" height="34" alt="03:00"/);
    assert.match(widget.html, /nearest free times whenever this email is opened/);
    assert.match(widget.text, /^ {2}03:00 {2}https:\/\/top-rated\.team\/book\/live\?r=0&t=0900&/m);
    assert.deepEqual(widget.days.map((day) => day.date), ["2026-10-02", "2026-10-06"], "the 5th has none of these times free");
  });

  it("names the reader's own town in their zone, when the owner knows it", () => {
    const widget = buildBookingWidget({ ...BASE, show: "times", days: 1, timesPerDay: 2, viewerZone: "America/New_York", viewerPlace: "Smalltown, PA" });
    assert.match(widget.html, /Times are <strong[^>]*>Eastern Time \(Smalltown, PA, EDT\)<\/strong>/);
    assert.match(widget.text, /Times are Eastern Time \(Smalltown, PA, EDT\)\./);
  });

  it("moves a time past the reader's midnight onto the reader's next day", () => {
    const widget = buildBookingWidget({ ...BASE, show: "times", days: 3, timesPerDay: 16, viewerZone: "Asia/Tokyo" });
    /* Bratislava is seven hours behind Tokyo: 16:30 on the 2nd is 23:30, and 14:00 on the 5th is 21:00. */
    assert.deepEqual(
      widget.days.map((day) => [day.date, day.slots[0], day.slots.at(-1)]),
      [
        ["2026-10-02", "16:00", "23:30"],
        ["2026-10-05", "21:00", "23:30"],
        ["2026-10-06", "16:00", "16:00"],
      ],
    );
    const tokyoMidnight = buildBookingWidget({
      ...BASE,
      slots: { ...SLOTS, days: [{ date: "2026-10-02", slots: ["16:30", "17:00", "17:30"] }] },
      show: "times",
      days: 3,
      timesPerDay: 16,
      viewerZone: "Asia/Tokyo",
    });
    assert.deepEqual(tokyoMidnight.days, [
      { date: "2026-10-02", slots: ["23:30"] },
      { date: "2026-10-03", slots: ["00:00", "00:30"] },
    ]);
    assert.match(tokyoMidnight.html, /Sat 3 Oct/);
  });

  it("gives each day its own offset when the block spans a change of clocks", () => {
    const autumn: BookingSlotsResponse = {
      ...SLOTS,
      days: [
        { date: "2026-10-23", slots: ["10:00"] },
        { date: "2026-10-26", slots: ["10:00"] },
      ],
    };
    const widget = buildBookingWidget({ ...BASE, slots: autumn, show: "times", days: 2, timesPerDay: 4 });
    assert.match(widget.html, /Times are <strong[^>]*>Central European Time \(Bratislava\)<\/strong>\./);
    assert.match(widget.html, />Fri 23 Oct · CEST</);
    assert.match(widget.html, />Mon 26 Oct · CET</);
  });

  it("ignores a zone that is not one, and keeps the calendar's days when only days are shown", () => {
    assert.equal(buildBookingWidget({ ...BASE, show: "times", days: 1, timesPerDay: 2, viewerZone: "Mars/Base" }).zone, "Europe/Bratislava");
    const days = buildBookingWidget({ ...BASE, show: "days", days: 2, timesPerDay: 2, viewerZone: "Asia/Tokyo" });
    assert.equal(days.zone, "Europe/Bratislava");
    assert.deepEqual(days.days.map((day) => day.date), ["2026-10-02", "2026-10-05"]);
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

  it("draws each time as a live picture when asked, with the time as its text for readers without images", () => {
    const widget = buildBookingWidget({ ...BASE, show: "times", days: 1, timesPerDay: 16, liveImages: true, recipient: "ada@example.com" });
    const images = [...widget.html.matchAll(/<img src="([^"]*)" width="64" height="34" alt="([^"]*)"/g)].map((m) => [m[1], m[2]]);
    assert.equal(images.length, 16);
    assert.deepEqual(images[3], ["https://top-rated.team/api/booking/slot/2026-10-02/1030.png", "10:30"]);
    assert.ok(hrefs(widget.html).slice(0, 16).every((href) => href.includes("confirm=email&email=ada%40example.com")), "each picture is still the link");
    assert.match(widget.html, /A time crossed out has been taken since this email was sent\./);
  });

  it("books a signed block's times at once, says nothing under them, and carries the signature in every link", () => {
    const widget = buildBookingWidget({ ...BASE, show: "times", days: 1, timesPerDay: 2, recipient: "ada@example.com", recipientSig: "AbCdEfGhIjKlMnOpQrStUv" });
    const links = hrefs(widget.html);
    assert.ok(links.every((href) => href.endsWith("&email=ada%40example.com&sig=AbCdEfGhIjKlMnOpQrStUv")));
    assert.ok(links.slice(0, -1).every((href) => href.includes("&instant=1&")), "a time books in one click");
    assert.ok(!links.at(-1)!.includes("instant=1"), "Other times opens the picker");
    assert.doesNotMatch(widget.html, /ada@example\.com only|We email you a link to confirm it/, "nothing under the times but Other times");
    assert.match(widget.html, /<td style="padding:12px 0 0 0;[^"]*"><a [^>]*>Other times<\/a><\/td>/);
    assert.doesNotMatch(widget.text, /only:|confirm it/);
    assert.match(widget.text, /Other times: \S+$/);
  });

  it("keeps a time with no picture as a plain button", () => {
    const odd = { ...SLOTS, days: [{ date: "2026-10-02", slots: ["09:15", "10:30"] }] };
    const widget = buildBookingWidget({ ...BASE, slots: odd, show: "times", days: 1, timesPerDay: 4, liveImages: true });
    assert.equal((widget.html.match(/<img /g) ?? []).length, 1);
    assert.match(widget.html, />09:15<\/a>/);
  });

  it("has nothing in it that runs, and nothing that escapes an attribute", () => {
    const widget = buildBookingWidget({ ...BASE, hostName: `<script>alert(1)</script>"`, show: "times", days: 3, timesPerDay: 16, recipient: `x"onmouseover="alert(1)` });
    assert.doesNotMatch(widget.html, /<script|onmouseover=|<style/i);
    assert.ok(hrefs(widget.html).every((href) => !href.includes("email=")), "a recipient that is neither an address nor a tag is left out");
  });
});
