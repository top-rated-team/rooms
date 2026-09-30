/**
 * A company's time zone, for the widget page. Run it with:
 *
 *   npx tsx --test server/booking/zone-lookup.test.ts
 *
 * What has to stay true: a place named outright is answered without asking
 * anyone; "Paris, Texas" is not Paris; a company is found by its
 * headquarters, skipping results that are neither a company nor a place;
 * OpenStreetMap answers what Wikidata does not; the client is named; an
 * answer, or no answer, is not asked for twice.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { lookUpZone, resetZoneLookupForTests, zoneFromPlaceName } from "./zone-lookup";

type Entity = { labels?: { en: { value: string } }; claims?: Record<string, unknown[]> };

function coord(lat: number, lon: number) {
  return { P625: [{ mainsnak: { datavalue: { value: { latitude: lat, longitude: lon } } } }] };
}

function hq(id: string) {
  return { P159: [{ mainsnak: { datavalue: { value: { id } } } }] };
}

function fakeWeb(opts: { search?: Record<string, string[]>; entities?: Record<string, Entity>; nominatim?: Record<string, unknown[]> }) {
  const asked: { url: string; agent: string | null }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    asked.push({ url: url.toString(), agent: new Headers(init?.headers).get("User-Agent") });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.hostname === "www.wikidata.org" && url.searchParams.get("action") === "wbsearchentities") {
      return json({ search: (opts.search?.[url.searchParams.get("search") ?? ""] ?? []).map((id) => ({ id })) });
    }
    if (url.hostname === "www.wikidata.org" && url.searchParams.get("action") === "wbgetentities") {
      const ids = (url.searchParams.get("ids") ?? "").split("|");
      return json({ entities: Object.fromEntries(ids.map((id) => [id, opts.entities?.[id] ?? {}])) });
    }
    if (url.hostname === "nominatim.openstreetmap.org") return json(opts.nominatim?.[url.searchParams.get("q") ?? ""] ?? []);
    return new Response("{}", { status: 404 });
  };
  return { fetchImpl, asked };
}

beforeEach(() => resetZoneLookupForTests());

describe("zoneFromPlaceName", () => {
  it("answers a city or a one-clock country named outright", () => {
    assert.equal(zoneFromPlaceName("Prague")?.zone, "Europe/Prague");
    assert.equal(zoneFromPlaceName("  new york ")?.zone, "America/New_York");
    assert.equal(zoneFromPlaceName("Czech Republic")?.zone, "Europe/Prague");
    assert.equal(zoneFromPlaceName("Brno, Czechia")?.zone, "Europe/Prague");
    assert.equal(zoneFromPlaceName("Zürich")?.zone, "Europe/Zurich");
  });

  it("leaves to the geocoders what it cannot be sure of", () => {
    assert.equal(zoneFromPlaceName("Paris, Texas"), null);
    assert.equal(zoneFromPlaceName("United States"), null);
    assert.equal(zoneFromPlaceName("Acme Holdings"), null);
  });
});

describe("lookUpZone", () => {
  it("names a place without asking anyone", async () => {
    const web = fakeWeb({});
    assert.deepEqual(await lookUpZone("Prague", { fetchImpl: web.fetchImpl }), { zone: "Europe/Prague", place: "Prague", source: "place name" });
    assert.equal(web.asked.length, 0);
  });

  it("finds a company by its headquarters, passing over a result that is neither", async () => {
    const web = fakeWeb({
      search: { Apple: ["Q89", "Q312"] },
      entities: {
        Q89: { labels: { en: { value: "apple" } }, claims: {} },
        Q312: { labels: { en: { value: "Apple Inc." } }, claims: hq("Q189471") },
        Q189471: { labels: { en: { value: "Cupertino" } }, claims: coord(37.3229, -122.0322) },
      },
    });
    assert.deepEqual(await lookUpZone("Apple", { fetchImpl: web.fetchImpl }), {
      zone: "America/Los_Angeles",
      place: "Apple Inc., Cupertino",
      source: "Wikidata",
    });
    assert.ok(web.asked.every((row) => row.agent?.includes("top-rated.team")), "the client is named");
  });

  it("asks OpenStreetMap what Wikidata does not know, and 'Paris, Texas' is in Texas", async () => {
    const web = fakeWeb({
      nominatim: {
        "Paris, Texas": [{ lat: "33.6609", lon: "-95.5555", display_name: "Paris, Lamar County, Texas, United States" }],
      },
    });
    assert.deepEqual(await lookUpZone("Paris, Texas", { fetchImpl: web.fetchImpl }), {
      zone: "America/Chicago",
      place: "Lamar County, Texas, United States",
      source: "OpenStreetMap",
    });
  });

  it("says nothing was found, and does not ask twice", async () => {
    const web = fakeWeb({});
    assert.equal(await lookUpZone("Nowhere Holdings Ltd", { fetchImpl: web.fetchImpl }), null);
    const asked = web.asked.length;
    assert.ok(asked >= 2);
    assert.equal(await lookUpZone("nowhere holdings ltd", { fetchImpl: web.fetchImpl }), null);
    assert.equal(web.asked.length, asked);
  });

  it("answers null, not an error, when the services cannot be reached", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("offline");
    };
    assert.equal(await lookUpZone("Acme Holdings", { fetchImpl }), null);
  });
});
