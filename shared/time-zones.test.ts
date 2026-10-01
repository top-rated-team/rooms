/**
 * Time zones for the email block and the widget page. Run it with:
 *
 *   npx tsx --test shared/time-zones.test.ts
 *
 * What has to stay true: a clock is named as it is called where it is kept,
 * and for the recipient's own town when that is known; old zone names read
 * as today's cities; a guess comes only from a one-clock country's domain.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { clockName, guessZoneFromAddress, wallClockIn, wallClockToInstant, zoneAbbreviation, zoneCity, zonePhrase } from "./time-zones";

const NOW = Date.parse("2026-10-01T12:00:00Z");

describe("naming a clock", () => {
  it("names the town the recipient is in, when it is known, instead of the zone's capital", () => {
    assert.equal(zonePhrase("America/New_York", NOW, "Smalltown, PA"), "Eastern Time (Smalltown, PA, EDT)");
    assert.equal(zonePhrase("America/New_York", NOW), "Eastern Time (New York, EDT)");
  });

  it("uses the name a clock has where it is kept, GMT only where it has none", () => {
    assert.equal(clockName("Europe/Prague", NOW), "Central European Time (CEST)");
    assert.equal(clockName("Asia/Tokyo", NOW), "Japan Standard Time (JST)");
    assert.equal(zoneAbbreviation("Europe/London", NOW), "BST");
    assert.equal(zoneAbbreviation("Asia/Kolkata", NOW), "IST");
    assert.equal(zoneAbbreviation("Pacific/Norfolk", NOW), "GMT+11");
  });

  it("reads an old zone name as today's city", () => {
    assert.equal(zoneCity("Asia/Calcutta"), "Kolkata");
    assert.equal(zoneCity("Europe/Kiev"), "Kyiv");
    assert.equal(zonePhrase("Asia/Calcutta", NOW), "India Standard Time (Kolkata, IST)");
  });
});

describe("the clock helpers", () => {
  it("turns a wall clock into an instant and back, across zones", () => {
    const ms = wallClockToInstant("2026-10-01", "16:30", "Europe/Prague")!;
    assert.equal(new Date(ms).toISOString(), "2026-10-01T14:30:00.000Z");
    assert.deepEqual(wallClockIn("America/New_York", ms), { date: "2026-10-01", time: "10:30" });
    assert.deepEqual(wallClockIn("Asia/Tokyo", ms), { date: "2026-10-01", time: "23:30" });
  });

  it("guesses only from a one-clock country's own domain", () => {
    assert.deepEqual(guessZoneFromAddress("jan@firma.cz"), { zone: "Europe/Prague", domain: ".cz" });
    assert.equal(guessZoneFromAddress("pat@gmail.com"), null);
    assert.equal(guessZoneFromAddress("sam@shop.us"), null);
  });
});
