/**
 * Time zones for the email block and the widget page. Run it with:
 *
 *   npx tsx --test shared/time-zones.test.ts
 *
 * What has to stay true: one clock is one entry, in clock order, west to
 * east; a clock's name is shown only where every city listed goes by it; a
 * zone the list spells differently still finds its entry; old zone names
 * read as today's cities.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { guessZoneFromAddress, wallClockIn, wallClockToInstant, zoneCity, zoneGroupFor, zoneGroups, zonePhrase } from "./time-zones";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const LIST = [
  "America/Chicago", "America/Winnipeg", "America/Indiana/Knox", "America/Denver", "America/Phoenix",
  "America/New_York", "America/Detroit", "Europe/Prague", "Europe/Berlin", "Europe/Bratislava", "Africa/Lagos",
  "Europe/Istanbul", "Europe/Moscow", "Asia/Riyadh", "Asia/Calcutta", "UTC",
];

describe("zoneGroups", () => {
  const groups = zoneGroups(LIST, NOW);

  it("makes one entry of zones that keep the same time all year, and keeps apart those that do not", () => {
    const chicago = zoneGroupFor("America/Chicago", groups, NOW)!;
    assert.deepEqual(chicago.members, ["America/Chicago", "America/Indiana/Knox", "America/Winnipeg"]);
    /* Phoenix keeps no summer time: the same as Denver in winter, not now. */
    assert.notEqual(zoneGroupFor("America/Phoenix", groups, NOW), zoneGroupFor("America/Denver", groups, NOW));
    /* Lagos is never on summer time; Prague is. */
    assert.notEqual(zoneGroupFor("Africa/Lagos", groups, NOW), zoneGroupFor("Europe/Prague", groups, NOW));
    /* Phoenix, Denver, Chicago, New York, UTC, Lagos, Prague, Istanbul, Kolkata. */
    assert.equal(groups.length, 9);
  });

  it("lists them west to east, by the names the clocks have where they are kept", () => {
    const offsets = groups.map((group) => group.offset);
    assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
    assert.equal(groups[0]!.label, "Mountain Standard Time (MST) — Phoenix");
    assert.doesNotMatch(groups.map((group) => group.label).join("\n"), /GMT[+-]/, "every clock here has a name of its own");
  });

  it("puts the clocks most calls are on first", () => {
    assert.deepEqual(
      groups.filter((group) => group.common).map((group) => group.zone),
      ["America/Phoenix", "America/Denver", "America/Chicago", "America/New_York", "Europe/Prague", "Europe/Istanbul", "Asia/Calcutta"],
    );
  });

  it("names the clock only where every city shown goes by that name", () => {
    assert.equal(zoneGroupFor("Europe/Berlin", groups, NOW)!.label, "Central European Time (CEST) — Prague, Berlin");
    assert.equal(zoneGroupFor("Europe/Moscow", groups, NOW)!.label, "Istanbul (TRT), Moscow (MSK), Riyadh (AST)");
    assert.equal(zoneGroupFor("America/New_York", groups, NOW)!.label, "Eastern Time (EDT) — New York");
    /* No continent filed after the cities, and no zone id. */
    assert.doesNotMatch(groups.map((group) => group.label).join("\n"), /\/|— (America|Europe|Asia|Africa)$|, (America|Europe|Asia|Africa)$/m);
  });

  it("stores the best-known zone of an entry, and finds the entry for a zone it does not list", () => {
    assert.equal(zoneGroupFor("Europe/Bratislava", groups, NOW)!.zone, "Europe/Prague");
    assert.equal(zoneGroupFor("America/Indiana/Indianapolis", groups, NOW)!.zone, "America/New_York");
    assert.equal(zoneGroupFor("Mars/Base", groups, NOW), undefined);
  });

  it("reads an old zone name as today's city", () => {
    assert.equal(zoneCity("Asia/Calcutta"), "Kolkata");
    assert.equal(zoneCity("Europe/Kiev"), "Kyiv");
    assert.match(zoneGroupFor("Asia/Kolkata", groups, NOW)!.label, /India Standard Time \(IST\) — Kolkata/);
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
