/**
 * Where a company is, as a time zone — for the widget page, when the
 * recipient's address says nothing (gmail.com) and the owner knows the
 * company they work for.
 *
 * In order, stopping at the first answer:
 *   0. A website in what was typed — a URL, a bare domain, or an address at
 *      a company's own domain: the address the site prints, usually in its
 *      footer (site-location.ts). Small organisations are on no map and in
 *      no encyclopaedia, but almost all of them say where they are.
 *   1. A place or country named exactly: "Prague", "Czechia", "Chicago".
 *   2. Wikidata, for a company: the first result that has a headquarters
 *      (P159) — whose coordinates are the answer — or is itself a place
 *      (P625). Notable companies only, but those it knows precisely.
 *   3. OpenStreetMap's Nominatim, for anything with an address or a place in
 *      it ("Acme Brno", "Chicago Animal Care and Control").
 * Coordinates become a zone through @photostructure/tz-lookup, which carries
 * the zone borders with it.
 *
 * It is a guess the owner sees and can change, never a fact: the page names
 * what was found. Only the text the owner typed leaves the server, and only
 * to those two public services; answers are kept a day so the same name is
 * not asked for twice. Nominatim asks for a named client and at most one
 * request a second, which an owner typing on one page does not approach.
 */

import { zoneCity } from "@shared/time-zones";

import { geocodeToZone, getJson, zoneAt } from "./geo";
import { siteFromQuery, zoneFromSite, type Resolve } from "./site-location";

export interface ZoneLookupHit {
  zone: string;
  /** What was found, for the page to name: "Mladá Boleslav, Czechia". */
  place: string;
  source: "website" | "place name" | "Wikidata" | "OpenStreetMap";
  /** The website it was read from, when it was. */
  site?: string;
}

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const KEEP_MS = 24 * 60 * 60_000;

const answers = new Map<string, { at: number; hit: ZoneLookupHit | null }>();

export function resetZoneLookupForTests(): void {
  answers.clear();
}

function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* Countries that keep one clock, by the names people write. Several-clock
   countries (the United States, Canada, Russia, Australia, Brazil, Mexico)
   are left to the geocoders, which answer with a place. */
const COUNTRY_ZONES: Record<string, string> = {
  "czechia": "Europe/Prague",
  "czech republic": "Europe/Prague",
  "slovakia": "Europe/Bratislava",
  "poland": "Europe/Warsaw",
  "germany": "Europe/Berlin",
  "austria": "Europe/Vienna",
  "switzerland": "Europe/Zurich",
  "hungary": "Europe/Budapest",
  "slovenia": "Europe/Ljubljana",
  "croatia": "Europe/Zagreb",
  "serbia": "Europe/Belgrade",
  "romania": "Europe/Bucharest",
  "bulgaria": "Europe/Sofia",
  "greece": "Europe/Athens",
  "turkey": "Europe/Istanbul",
  "turkiye": "Europe/Istanbul",
  "ukraine": "Europe/Kyiv",
  "lithuania": "Europe/Vilnius",
  "latvia": "Europe/Riga",
  "estonia": "Europe/Tallinn",
  "finland": "Europe/Helsinki",
  "sweden": "Europe/Stockholm",
  "norway": "Europe/Oslo",
  "denmark": "Europe/Copenhagen",
  "iceland": "Atlantic/Reykjavik",
  "ireland": "Europe/Dublin",
  "united kingdom": "Europe/London",
  "uk": "Europe/London",
  "great britain": "Europe/London",
  "england": "Europe/London",
  "scotland": "Europe/London",
  "wales": "Europe/London",
  "netherlands": "Europe/Amsterdam",
  "the netherlands": "Europe/Amsterdam",
  "belgium": "Europe/Brussels",
  "luxembourg": "Europe/Luxembourg",
  "france": "Europe/Paris",
  "spain": "Europe/Madrid",
  "italy": "Europe/Rome",
  "malta": "Europe/Malta",
  "israel": "Asia/Jerusalem",
  "united arab emirates": "Asia/Dubai",
  "uae": "Asia/Dubai",
  "saudi arabia": "Asia/Riyadh",
  "india": "Asia/Kolkata",
  "pakistan": "Asia/Karachi",
  "singapore": "Asia/Singapore",
  "japan": "Asia/Tokyo",
  "south korea": "Asia/Seoul",
  "korea": "Asia/Seoul",
  "china": "Asia/Shanghai",
  "hong kong": "Asia/Hong_Kong",
  "taiwan": "Asia/Taipei",
  "philippines": "Asia/Manila",
  "thailand": "Asia/Bangkok",
  "vietnam": "Asia/Ho_Chi_Minh",
  "new zealand": "Pacific/Auckland",
  "south africa": "Africa/Johannesburg",
  "nigeria": "Africa/Lagos",
  "kenya": "Africa/Nairobi",
  "egypt": "Africa/Cairo",
  "georgia": "Asia/Tbilisi",
  "armenia": "Asia/Yerevan",
  "argentina": "America/Argentina/Buenos_Aires",
  "colombia": "America/Bogota",
  "peru": "America/Lima",
  "chile": "America/Santiago",
};

let cityIndex: Map<string, string> | null = null;

function zoneByCity(): Map<string, string> {
  if (cityIndex) return cityIndex;
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const index = new Map<string, string>();
  for (const zone of intl.supportedValuesOf?.("timeZone") ?? []) {
    const city = normalise(zoneCity(zone));
    if (city && city !== "utc" && !index.has(city)) index.set(city, zone);
  }
  /* Where the zone's own name is not the city people write. */
  index.set("kiev", "Europe/Kyiv");
  index.set("new york city", "America/New_York");
  index.set("nyc", "America/New_York");
  index.set("san francisco", "America/Los_Angeles");
  index.set("washington", "America/New_York");
  index.set("washington dc", "America/New_York");
  index.set("boston", "America/New_York");
  index.set("munich", "Europe/Berlin");
  index.set("brno", "Europe/Prague");
  index.set("bombay", "Asia/Kolkata");
  index.set("mumbai", "Asia/Kolkata");
  index.set("delhi", "Asia/Kolkata");
  index.set("new delhi", "Asia/Kolkata");
  index.set("bangalore", "Asia/Kolkata");
  index.set("saigon", "Asia/Ho_Chi_Minh");
  cityIndex = index;
  return index;
}

/** "Prague", "Czechia", "Prague, Czech Republic": a place or country, named and nothing else. */
export function zoneFromPlaceName(query: string): ZoneLookupHit | null {
  const parts = query.split(",").map(normalise).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  const [first, second] = parts as [string, string | undefined];
  const place = query.trim();
  if (second !== undefined) {
    /* "Brno, Czechia": any town in a one-clock country. "Paris, Texas" is
       not Paris, so a second part that is not such a country is left to the
       geocoders. */
    const country = COUNTRY_ZONES[second];
    return country ? { zone: country, place, source: "place name" } : null;
  }
  const city = zoneByCity().get(first);
  if (city) return { zone: city, place, source: "place name" };
  const country = COUNTRY_ZONES[first];
  return country ? { zone: country, place, source: "place name" } : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

type Claims = Record<string, unknown[]>;

function claimsOf(entity: unknown): Claims {
  return (record(record(entity)?.claims) as Claims | null) ?? {};
}

function mainValue(claims: Claims, property: string): unknown {
  const first = record(claims[property]?.[0]);
  return record(record(first?.mainsnak)?.datavalue)?.value;
}

function coordinates(claims: Claims): { lat: number; lon: number } | null {
  const value = record(mainValue(claims, "P625"));
  if (!value) return null;
  const lat = Number(value.latitude);
  const lon = Number(value.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function label(entity: unknown): string {
  const en = record(record(record(entity)?.labels)?.en);
  return typeof en?.value === "string" ? en.value : "";
}

async function entities(ids: string[], fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  if (ids.length === 0) return {};
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "claims|labels",
    languages: "en",
    format: "json",
  });
  return record(record(await getJson(`${WIKIDATA_API}?${params}`, fetchImpl))?.entities) ?? {};
}

async function fromWikidata(query: string, fetchImpl: typeof fetch): Promise<ZoneLookupHit | null> {
  const search = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: "en",
    type: "item",
    limit: "5",
    format: "json",
  });
  const found = record(await getJson(`${WIKIDATA_API}?${search}`, fetchImpl))?.search;
  const ids = (Array.isArray(found) ? found : [])
    .map((row) => record(row)?.id)
    .filter((id): id is string => typeof id === "string" && /^Q\d+$/.test(id));
  const byId = await entities(ids, fetchImpl);
  for (const id of ids) {
    const entity = byId[id];
    const claims = claimsOf(entity);
    const hq = record(mainValue(claims, "P159"))?.id;
    if (typeof hq === "string" && /^Q\d+$/.test(hq)) {
      const place = (await entities([hq], fetchImpl))[hq];
      const at = coordinates(claimsOf(place));
      const zone = at ? zoneAt(at.lat, at.lon) : null;
      if (zone) return { zone, place: [label(entity), label(place)].filter(Boolean).join(", "), source: "Wikidata" };
      continue;
    }
    const at = coordinates(claims);
    const zone = at ? zoneAt(at.lat, at.lon) : null;
    if (zone) return { zone, place: label(entity) || query, source: "Wikidata" };
  }
  return null;
}

async function fromNominatim(query: string, fetchImpl: typeof fetch): Promise<ZoneLookupHit | null> {
  const placed = await geocodeToZone(query, fetchImpl);
  return placed ? { ...placed, source: "OpenStreetMap" } : null;
}

export async function lookUpZone(
  raw: string,
  opts: { fetchImpl?: typeof fetch; now?: number; resolve?: Resolve } = {},
): Promise<ZoneLookupHit | null> {
  const query = raw.trim().replace(/\s+/g, " ").slice(0, 200);
  if (query.length < 2) return null;
  const key = normalise(query);
  const now = opts.now ?? Date.now();
  const kept = answers.get(key);
  if (kept && now - kept.at < KEEP_MS) return kept.hit;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const hit = await lookUp(query, fetchImpl, opts.resolve);
  if (answers.size > 500) answers.clear();
  answers.set(key, { at: now, hit });
  return hit;
}

async function lookUp(query: string, fetchImpl: typeof fetch, resolve?: Resolve): Promise<ZoneLookupHit | null> {
  /* The website first: what a company says about itself beats a name match. */
  const site = siteFromQuery(query);
  if (site) {
    const found = await zoneFromSite(site.host, { fetchImpl, ...(resolve ? { resolve } : {}) });
    if (found) return { zone: found.zone, place: found.place, source: "website", site: found.site };
  }
  /* Then the rest of what was typed: "(Back2Basics Outdoor Ministries Inc)". */
  const rest = (site ? query.replace(site.matched, " ") : query).replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (rest.length < 2) return null;
  return zoneFromPlaceName(rest) ?? (await fromWikidata(rest, fetchImpl)) ?? (await fromNominatim(rest, fetchImpl));
}
