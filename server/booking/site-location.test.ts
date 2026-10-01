/**
 * A company's zone, read from its own website. Run it with:
 *
 *   npx tsx --test server/booking/site-location.test.ts
 *
 * What has to stay true: the website is found in what the owner typed, and
 * a mail service's domain is not one; the address a site prints in its
 * footer is read, a state that keeps one clock needs no map and one that
 * keeps two is put on it; a point (schema.org, a Maps embed) beats words;
 * the contact page is read when the home page says nothing; nothing inside
 * a private network is ever fetched, not even by a redirect.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { siteClues, siteFromQuery, textAddresses, zoneFromSite } from "./site-location";
import { lookUpZone, resetZoneLookupForTests } from "./zone-lookup";

const PUBLIC: (host: string) => Promise<string[]> = async () => ["93.184.216.34"];

function html(body: string, head = ""): string {
  return `<!doctype html><html><head><title>Site</title>${head}</head><body><header><nav><a href="/">Home</a></nav></header><main><h1>Welcome</h1><p>We take people outdoors.</p></main>${body}</body></html>`;
}

function fakeWeb(pages: Record<string, string | { status: number; location?: string }>, nominatim: Record<string, unknown[]> = {}) {
  const asked: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    asked.push(url);
    if (url.startsWith("https://nominatim.openstreetmap.org/")) {
      const q = new URL(url).searchParams.get("q") ?? "";
      return new Response(JSON.stringify(nominatim[q] ?? []), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const page = pages[url];
    if (page === undefined) return new Response("not here", { status: 404 });
    if (typeof page !== "string") return new Response(null, { status: page.status, headers: page.location ? { Location: page.location } : {} });
    return new Response(page, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  };
  return { fetchImpl, asked };
}

beforeEach(() => resetZoneLookupForTests());

describe("siteFromQuery", () => {
  it("finds the website in what the owner typed", () => {
    assert.equal(siteFromQuery("Back2BasicsAdventures.org (Back2Basics Outdoor Ministries Inc)")?.host, "back2basicsadventures.org");
    assert.equal(siteFromQuery("https://www.acme-shelter.org/about-us")?.host, "www.acme-shelter.org");
    assert.equal(siteFromQuery("Jan Novak <jan@firma-brno.cz>")?.host, "firma-brno.cz");
  });

  it("takes no mail service for a company, and no abbreviation for a domain", () => {
    assert.equal(siteFromQuery("pat@gmail.com"), null);
    assert.equal(siteFromQuery("outlook.com"), null);
    assert.equal(siteFromQuery("Back2Basics Outdoor Ministries Inc."), null);
    assert.equal(siteFromQuery("e.g. a shelter in Ohio"), null);
  });
});

describe("textAddresses", () => {
  it("reads a United States, Canadian or Australian address, the last on the page first", () => {
    const rows = textAddresses("Office: 10 Main St\nRichmond, VA 23219\nCamp: 1234 Camp Road\nSmalltown, PA 17000-1234");
    assert.deepEqual(rows.map((row) => [row.text, row.zone]), [
      ["Smalltown, PA 17000", "America/New_York"],
      ["Richmond, VA 23219", "America/New_York"],
    ]);
    assert.equal(textAddresses("Toronto, ON M5V 2T6")[0]?.zone, "America/Toronto");
    assert.equal(textAddresses("Fitzroy VIC 3065")[0]?.zone, "Australia/Melbourne");
    assert.equal(textAddresses("Boise, Idaho 83702")[0]?.text, "Boise, ID 83702");
  });
});

describe("zoneFromSite", () => {
  it("reads the address in a footer, and needs no map for a state that keeps one clock", async () => {
    const web = fakeWeb({
      "https://back2basicsadventures.org/": html(
        `<footer><div class="widget"><p>Back2Basics Outdoor Ministries Inc.<br>1234 Camp Road<br>Smalltown, PA 17000</p><p><a href="tel:+17175551234">(717) 555-1234</a></p><p>© 2026</p></div></footer>`,
      ),
    });
    const hit = await zoneFromSite("back2basicsadventures.org", { fetchImpl: web.fetchImpl, resolve: PUBLIC });
    assert.deepEqual(hit, { zone: "America/New_York", place: "Smalltown, PA 17000", site: "back2basicsadventures.org" });
    assert.ok(web.asked.every((url) => !url.includes("nominatim")), "no map asked");
  });

  it("puts a state that keeps two clocks on the map, and falls back to the clock most of it keeps", async () => {
    const page = html(`<footer>Desert Camp · 500 Mesa St, El Paso, TX 79901</footer>`);
    const mapped = fakeWeb(
      { "https://desertcamp.org/": page },
      { "Mesa St El Paso, TX 79901": [{ lat: "31.7619", lon: "-106.485", display_name: "El Paso, Texas, United States" }], "El Paso, TX 79901": [{ lat: "31.7619", lon: "-106.485", display_name: "El Paso, Texas, United States" }] },
    );
    assert.equal((await zoneFromSite("desertcamp.org", { fetchImpl: mapped.fetchImpl, resolve: PUBLIC }))?.zone, "America/Denver");
    const unmapped = fakeWeb({ "https://desertcamp.org/": page });
    assert.equal((await zoneFromSite("desertcamp.org", { fetchImpl: unmapped.fetchImpl, resolve: PUBLIC }))?.zone, "America/Chicago");
  });

  it("trusts a point over words: schema.org geo, and a Google Maps embed", async () => {
    const schema = html(
      `<footer>Smalltown, PA 17000</footer>`,
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"NGO","name":"Camp","location":{"@type":"Place","geo":{"@type":"GeoCoordinates","latitude":41.8781,"longitude":-87.6298}}}</script>`,
    );
    const a = fakeWeb({ "https://camp.org/": schema });
    assert.equal((await zoneFromSite("camp.org", { fetchImpl: a.fetchImpl, resolve: PUBLIC }))?.zone, "America/Chicago");
    const embed = html(`<footer><iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.2!2d-122.4194!3d37.7749!2m3!1f0"></iframe></footer>`);
    const b = fakeWeb({ "https://camp.org/": embed });
    assert.equal((await zoneFromSite("camp.org", { fetchImpl: b.fetchImpl, resolve: PUBLIC }))?.zone, "America/Los_Angeles");
  });

  it("reads the contact page when the home page says nothing, after following the site's own redirect", async () => {
    const web = fakeWeb({
      "https://shelter.org/": { status: 301, location: "https://www.shelter.org/" },
      "https://www.shelter.org/": html(`<footer>Adopt, foster, volunteer.</footer>`),
      "https://www.shelter.org/contact": html(`<main><address>77 Bark Ave, Portland, ME 04101</address></main>`),
    });
    const hit = await zoneFromSite("shelter.org", { fetchImpl: web.fetchImpl, resolve: PUBLIC });
    assert.deepEqual(hit, { zone: "America/New_York", place: "Portland, ME 04101", site: "shelter.org" });
  });

  it("reads a telephone's country, then the site's own country domain", async () => {
    const tel = fakeWeb({ "https://firma.eu/": html(`<footer><a href="tel:+420 777 123 456">Call</a></footer>`) });
    assert.equal((await zoneFromSite("firma.eu", { fetchImpl: tel.fetchImpl, resolve: PUBLIC }))?.zone, "Europe/Prague");
    const none = fakeWeb({});
    assert.deepEqual(await zoneFromSite("firma.cz", { fetchImpl: none.fetchImpl, resolve: PUBLIC }), { zone: "Europe/Prague", place: "a .cz site", site: "firma.cz" });
    assert.equal(await zoneFromSite("nowhere.org", { fetchImpl: none.fetchImpl, resolve: PUBLIC }), null);
  });

  it("never fetches anything inside a private network, not even through a redirect", async () => {
    const web = fakeWeb({ "https://evil.example/": { status: 302, location: "http://169.254.169.254/latest/meta-data/" } });
    assert.equal(await zoneFromSite("evil.example", { fetchImpl: web.fetchImpl, resolve: PUBLIC }), null);
    assert.ok(!web.asked.some((url) => url.includes("169.254")), "the redirect target was not fetched");
    const inside = fakeWeb({ "https://intranet.example/": html(`<footer>Smalltown, PA 17000</footer>`) });
    assert.equal(await zoneFromSite("intranet.example", { fetchImpl: inside.fetchImpl, resolve: async () => ["10.0.0.5"] }), null);
    assert.equal(inside.asked.length, 0);
  });
});

describe("siteClues", () => {
  it("reads a schema.org PostalAddress and a Maps link's place", () => {
    const clues = siteClues(
      html(
        `<footer><a href="https://maps.google.com/?q=1234+Camp+Road,+Smalltown,+PA+17000">Directions</a></footer>`,
        `<script type="application/ld+json">[{"@type":"Organization","address":{"@type":"PostalAddress","streetAddress":"1 Main","addressLocality":"Brno","postalCode":"60200","addressCountry":"CZ"}}]</script>`,
      ),
    );
    assert.deepEqual(
      clues.filter((clue) => clue.kind === "address").map((clue) => (clue.kind === "address" ? clue.text : "")),
      ["1 Main, Brno, 60200, CZ", "1234 Camp Road, Smalltown, PA 17000"],
    );
  });
});

describe("lookUpZone with a website in it", () => {
  it("answers from the site, and names it", async () => {
    const web = fakeWeb({
      "https://back2basicsadventures.org/": html(`<footer><p>1234 Camp Road<br>Smalltown, PA 17000</p></footer>`),
    });
    const hit = await lookUpZone("Back2BasicsAdventures.org (Back2Basics Outdoor Ministries Inc)", { fetchImpl: web.fetchImpl, resolve: PUBLIC });
    assert.deepEqual(hit, {
      zone: "America/New_York",
      place: "Smalltown, PA 17000",
      source: "website",
      site: "back2basicsadventures.org",
    });
  });
});
