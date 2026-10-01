/**
 * Towns for the widget page's "Where they are". Run it with:
 *
 *   npx tsx --test server/booking/city-search.test.ts
 *
 * What has to stay true: a town is found by the start of its name, biggest
 * first, narrowed by state or country; each brings its own clock, not its
 * state's; a point on the map is named for the town it is in.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { nearestCity, searchCities } from "./city-search";

describe("searchCities", () => {
  it("finds towns by the start of their name, biggest first, each with its state", () => {
    const springfields = searchCities("Springf");
    assert.equal(springfields.length, 8);
    assert.deepEqual(springfields[0], {
      place: "Springfield, MO",
      label: "Springfield, MO, United States",
      zone: "America/Chicago",
      population: springfields[0]!.population,
      lat: springfields[0]!.lat,
      lon: springfields[0]!.lon,
    });
    assert.ok(springfields.every((hit, i) => i === 0 || hit.population <= springfields[i - 1]!.population));
  });

  it("narrows by state or country, written either way", () => {
    assert.deepEqual(searchCities("Springfield, IL").map((hit) => hit.place), ["Springfield, IL"]);
    assert.deepEqual(searchCities("Springfield, Illinois").map((hit) => hit.place), ["Springfield, IL"]);
    assert.equal(searchCities("Brno, Czechia")[0]?.label, "Brno, Czechia");
  });

  it("gives a town its own clock, not its state's", () => {
    assert.equal(searchCities("El Paso, TX")[0]?.zone, "America/Denver");
    assert.equal(searchCities("Phoenix, AZ")[0]?.zone, "America/Phoenix");
    assert.equal(searchCities("Zurich")[0]?.zone, "Europe/Zurich", "without the umlaut too");
  });

  it("asks for two letters at least", () => {
    assert.deepEqual(searchCities("P"), []);
  });
});

describe("nearestCity", () => {
  it("names a point for the town it is in: the city, not its district", () => {
    assert.equal(nearestCity(50.087, 14.421)?.place, "Prague");
    assert.equal(nearestCity(37.3229, -122.0322)?.place, "Cupertino, CA");
    assert.equal(nearestCity(40.2142, -77.0086)?.place, "Mechanicsburg, PA");
  });

  it("names nothing in the middle of the ocean", () => {
    assert.equal(nearestCity(0, -30), null);
  });
});
