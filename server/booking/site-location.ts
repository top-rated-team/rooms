/**
 * Where a company is, read from its own website — for the widget page, when
 * the recipient's address says nothing and the signature names the site.
 *
 * Small organisations are on no map and in no encyclopaedia, but nearly every
 * one prints its address on its own site, usually in the footer. So the home
 * page is read (and, when it says nothing, the contact and about pages) for,
 * most trusted first:
 *   1. a point: schema.org "geo", a geo.position / ICBM / place:location
 *      meta tag, or the coordinates inside a Google Maps embed or link;
 *   2. an address: schema.org PostalAddress, a Maps link's place, or a
 *      United States, Canadian or Australian address in the text
 *      ("Smalltown, PA 17000") — a state that keeps one clock is answered
 *      here, any other is placed on the map;
 *   3. a telephone link's country code, for a country that keeps one clock;
 *   4. the site's own country domain.
 *
 * FETCHING SOMEBODY ELSE'S URL FROM OUR SERVER. Only http and https, only the
 * standard ports, only hosts that resolve to public addresses (checked again
 * on every redirect, of which at most four), at most 1.5 MB, and a few
 * seconds. The endpoint is the operator's alone; this keeps a typo or a
 * hostile redirect from reaching anything inside.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

import { guessZoneFromAddress, isFreeMailDomain, isTimeZone } from "@shared/time-zones";

import { LOOKUP_USER_AGENT, geocodeToZone, zoneAt } from "./geo";

export { isFreeMailDomain };

export interface SiteHit {
  zone: string;
  /** What was found, for the page to name: "Smalltown, PA 17000". */
  place: string;
  /** The site it was read from: "back2basicsadventures.org". */
  site: string;
}

const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/i;

/**
 * The website in what the owner typed: a URL, a bare domain
 * ("Back2BasicsAdventures.org (Back2Basics Outdoor Ministries Inc)"), or an
 * address at a company's own domain. Null for a mail service's domain.
 */
export function siteFromQuery(query: string): { host: string; matched: string } | null {
  const url = /\bhttps?:\/\/[^\s<>()"']+/i.exec(query);
  if (url) {
    try {
      const host = new URL(url[0]).hostname.toLowerCase();
      if (host.includes(".") && !isFreeMailDomain(host)) return { host, matched: url[0] };
    } catch {
      /* Not a URL after all. */
    }
  }
  const email = /\b[^\s@<>()]+@((?:[a-z0-9-]+\.)+[a-z]{2,24})\b/i.exec(query);
  if (email) {
    const host = email[1]!.toLowerCase();
    return isFreeMailDomain(host) ? null : { host, matched: email[0] };
  }
  const bare = DOMAIN_RE.exec(query);
  if (!bare) return null;
  const host = bare[1]!.toLowerCase();
  /* "Inc." and "e.g." are not domains: a label of two letters at least, a real-looking ending. */
  const labels = host.split(".");
  if (labels.some((label) => label.length === 0) || labels[labels.length - 2]!.length < 2) return null;
  if (isFreeMailDomain(host)) return null;
  return { host, matched: bare[0] };
}

/* --------------------------------- fetching -------------------------------- */

const PAGE_MS = 7_000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;

function privateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return privateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

export type Resolve = (host: string) => Promise<string[]>;

const resolveHost: Resolve = async (host) => (await lookup(host, { all: true })).map((row) => row.address);

async function publicUrl(raw: string, resolve: Resolve): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.port !== "" || url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return privateAddress(host) ? null : url;
  try {
    const addresses = await resolve(host);
    return addresses.length > 0 && addresses.every((ip) => !privateAddress(ip)) ? url : null;
  } catch {
    return null;
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    size += value.byteLength;
    chunks.push(value);
    if (size >= MAX_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/** A page's HTML, or null: not public, not HTML, too slow, or gone. */
export async function fetchPage(raw: string, opts: { fetchImpl: typeof fetch; resolve: Resolve }): Promise<{ url: string; html: string } | null> {
  let next = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await publicUrl(next, opts.resolve);
    if (!url) return null;
    let res: Response;
    try {
      res = await opts.fetchImpl(url.toString(), {
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": `Mozilla/5.0 (compatible; ${LOOKUP_USER_AGENT})`,
        },
        signal: AbortSignal.timeout(PAGE_MS),
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      next = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return null;
    try {
      return { url: url.toString(), html: await readCapped(res) };
    } catch {
      return null;
    }
  }
  return null;
}

/* --------------------------------- reading --------------------------------- */

export type SiteClue =
  | { kind: "point"; lat: number; lon: number; place: string }
  | { kind: "address"; text: string }
  | { kind: "zone"; zone: string; place: string };

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#8217;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

/** The page's words, one block per line, scripts and styles left out. */
export function pageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|footer|address|section|tr|td|span)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function walk(value: unknown, visit: (row: Record<string, unknown>) => void, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  visit(row);
  for (const child of Object.values(row)) walk(child, visit, depth + 1);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string") {
    return String((value as { name: string }).name).trim();
  }
  return "";
}

function schemaClues(html: string): SiteClue[] {
  const clues: SiteClue[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(decodeEntities(match[1]!.trim()));
    } catch {
      continue;
    }
    walk(data, (row) => {
      const geo = row.geo as Record<string, unknown> | undefined;
      if (geo && typeof geo === "object") {
        const lat = Number(geo.latitude);
        const lon = Number(geo.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) clues.push({ kind: "point", lat, lon, place: text(row.name) });
      }
      const address = row.address;
      if (typeof address === "string" && address.trim()) clues.push({ kind: "address", text: address.trim() });
      else if (address && typeof address === "object" && !Array.isArray(address)) {
        const a = address as Record<string, unknown>;
        const line = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
          .map(text)
          .filter(Boolean)
          .join(", ");
        if (line) clues.push({ kind: "address", text: line });
      }
    });
  }
  return clues;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const content = tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : null;
  return content ? decodeEntities(content).trim() : null;
}

function metaClues(html: string): SiteClue[] {
  const clues: SiteClue[] = [];
  const pair = (value: string | null) => {
    const m = value ? /(-?\d{1,2}(?:\.\d+)?)\s*[;,]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(value) : null;
    if (m) clues.push({ kind: "point", lat: Number(m[1]), lon: Number(m[2]), place: "" });
  };
  pair(metaContent(html, "geo\\.position"));
  pair(metaContent(html, "ICBM"));
  const lat = metaContent(html, "place:location:latitude");
  const lon = metaContent(html, "place:location:longitude");
  if (lat && lon) pair(`${lat};${lon}`);
  const business = ["street_address", "locality", "region", "postal_code", "country_name"]
    .map((part) => metaContent(html, `business:contact_data:${part}`))
    .filter(Boolean)
    .join(", ");
  if (business) clues.push({ kind: "address", text: business });
  return clues;
}

function mapClues(html: string): SiteClue[] {
  const clues: SiteClue[] = [];
  const raw = decodeEntities(html);
  /* A Maps embed's pb: …!2d<longitude>!3d<latitude>… */
  for (const m of raw.matchAll(/!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,2}\.\d+)/g)) clues.push({ kind: "point", lat: Number(m[2]), lon: Number(m[1]), place: "" });
  for (const m of raw.matchAll(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/g)) clues.push({ kind: "point", lat: Number(m[1]), lon: Number(m[2]), place: "" });
  for (const m of raw.matchAll(/(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl)[^"'\s<>]*?@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/gi)) {
    clues.push({ kind: "point", lat: Number(m[1]), lon: Number(m[2]), place: "" });
  }
  for (const m of raw.matchAll(/(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)[^"'\s<>]*?[?&](?:q|ll|query|center|daddr|destination)=([^&"'\s<>]+)/gi)) {
    let value = "";
    try {
      value = decodeURIComponent(m[1]!.replace(/\+/g, " ")).trim();
    } catch {
      continue;
    }
    const point = /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/.exec(value);
    if (point) clues.push({ kind: "point", lat: Number(point[1]), lon: Number(point[2]), place: "" });
    else if (value.length > 3) clues.push({ kind: "address", text: value });
  }
  for (const m of raw.matchAll(/google\.[a-z.]+\/maps\/(?:place|search)\/([^/@"'?\s<>]+)/gi)) {
    try {
      const value = decodeURIComponent(m[1]!.replace(/\+/g, " ")).trim();
      if (value.length > 3) clues.push({ kind: "address", text: value });
    } catch {
      /* A link we cannot read. */
    }
  }
  return clues;
}

/* United States: the clock each state keeps, and the states that keep two. */
const US_STATE_ZONES: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles",
  CO: "America/Denver", CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York",
  GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago",
  OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York", WI: "America/Chicago",
  WY: "America/Denver", PR: "America/Puerto_Rico",
};
const US_TWO_CLOCKS = new Set(["AK", "FL", "ID", "IN", "KS", "KY", "MI", "NE", "ND", "OR", "SD", "TN", "TX"]);
const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const CA_PROVINCE_ZONES: Record<string, string> = {
  AB: "America/Edmonton", BC: "America/Vancouver", MB: "America/Winnipeg", NB: "America/Moncton", NL: "America/St_Johns",
  NS: "America/Halifax", NT: "America/Yellowknife", NU: "America/Iqaluit", ON: "America/Toronto", PE: "America/Halifax",
  QC: "America/Toronto", SK: "America/Regina", YT: "America/Whitehorse",
};
const AU_STATE_ZONES: Record<string, string> = {
  NSW: "Australia/Sydney", VIC: "Australia/Melbourne", QLD: "Australia/Brisbane", SA: "Australia/Adelaide",
  WA: "Australia/Perth", TAS: "Australia/Hobart", NT: "Australia/Darwin", ACT: "Australia/Sydney",
};

const CITY = "([A-Z][A-Za-z.'’-]*(?: [A-Z][A-Za-z.'’-]*){0,3})";

/** A street address in the page's words, nearest the end (the footer) first. */
export function textAddresses(words: string): { text: string; zone: string | null; twoClocks: boolean }[] {
  const found: { at: number; text: string; zone: string | null; twoClocks: boolean }[] = [];
  const us = new RegExp(`${CITY},?\\s+(${Object.keys(US_STATE_ZONES).join("|")})\\.?,?\\s+(\\d{5})(?:-\\d{4})?\\b`, "g");
  for (const m of words.matchAll(us)) {
    const state = m[2]!;
    found.push({ at: m.index ?? 0, text: `${m[1]}, ${state} ${m[3]}`, zone: US_STATE_ZONES[state]!, twoClocks: US_TWO_CLOCKS.has(state) });
  }
  const usLong = new RegExp(`${CITY},\\s*(${Object.keys(US_STATE_NAMES).map((name) => name.replace(/ /g, "\\s")).join("|")})\\b,?\\s*(\\d{5})?`, "gi");
  for (const m of words.matchAll(usLong)) {
    const state = US_STATE_NAMES[m[2]!.toLowerCase().replace(/\s+/g, " ")];
    if (!state || !/^[A-Z]/.test(m[1]!)) continue;
    found.push({ at: m.index ?? 0, text: `${m[1]}, ${state}${m[3] ? ` ${m[3]}` : ""}`, zone: US_STATE_ZONES[state]!, twoClocks: US_TWO_CLOCKS.has(state) });
  }
  const ca = new RegExp(`${CITY},?\\s+(${Object.keys(CA_PROVINCE_ZONES).join("|")})\\.?,?\\s+([A-Z]\\d[A-Z])\\s?(\\d[A-Z]\\d)\\b`, "g");
  for (const m of words.matchAll(ca)) {
    const province = m[2]!;
    found.push({ at: m.index ?? 0, text: `${m[1]}, ${province} ${m[3]} ${m[4]}`, zone: CA_PROVINCE_ZONES[province]!, twoClocks: ["BC", "ON", "QC", "NL", "NU", "SK"].includes(province) });
  }
  const au = new RegExp(`${CITY},?\\s+(${Object.keys(AU_STATE_ZONES).join("|")})\\s+(\\d{4})\\b`, "g");
  for (const m of words.matchAll(au)) {
    const state = m[2]!;
    found.push({ at: m.index ?? 0, text: `${m[1]} ${state} ${m[3]}`, zone: AU_STATE_ZONES[state]!, twoClocks: false });
  }
  return found.sort((a, b) => b.at - a.at).map(({ text, zone, twoClocks }) => ({ text, zone, twoClocks }));
}

/* Calling codes of countries that keep one clock. */
const CALLING_CODES: Record<string, string> = {
  "420": "Europe/Prague", "421": "Europe/Bratislava", "48": "Europe/Warsaw", "49": "Europe/Berlin", "43": "Europe/Vienna",
  "41": "Europe/Zurich", "36": "Europe/Budapest", "44": "Europe/London", "353": "Europe/Dublin", "33": "Europe/Paris",
  "34": "Europe/Madrid", "39": "Europe/Rome", "31": "Europe/Amsterdam", "32": "Europe/Brussels", "45": "Europe/Copenhagen",
  "46": "Europe/Stockholm", "47": "Europe/Oslo", "358": "Europe/Helsinki", "372": "Europe/Tallinn", "371": "Europe/Riga",
  "370": "Europe/Vilnius", "380": "Europe/Kyiv", "40": "Europe/Bucharest", "359": "Europe/Sofia", "30": "Europe/Athens",
  "90": "Europe/Istanbul", "972": "Asia/Jerusalem", "971": "Asia/Dubai", "91": "Asia/Kolkata", "65": "Asia/Singapore",
  "81": "Asia/Tokyo", "82": "Asia/Seoul", "86": "Asia/Shanghai", "852": "Asia/Hong_Kong", "64": "Pacific/Auckland",
  "27": "Africa/Johannesburg", "234": "Africa/Lagos", "254": "Africa/Nairobi", "20": "Africa/Cairo", "351": "Europe/Lisbon",
  "386": "Europe/Ljubljana", "385": "Europe/Zagreb", "381": "Europe/Belgrade",
};

function phoneClues(html: string): SiteClue[] {
  const clues: SiteClue[] = [];
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const digits = decodeEntities(m[1]!).replace(/[^\d+]/g, "").replace(/^00/, "+");
    if (!digits.startsWith("+")) continue;
    const body = digits.slice(1);
    for (const length of [3, 2]) {
      const zone = CALLING_CODES[body.slice(0, length)];
      if (zone) {
        clues.push({ kind: "zone", zone, place: `telephone +${body.slice(0, length)}` });
        break;
      }
    }
  }
  return clues;
}

/** Everything a page says about where it is, most trusted first. */
export function siteClues(html: string): SiteClue[] {
  const words = pageText(html);
  const footer = [...html.matchAll(/<footer\b[\s\S]*?<\/footer>/gi)].map((m) => pageText(m[0])).join("\n");
  const addresses = [...textAddresses(footer), ...textAddresses(words)];
  const points = [...schemaClues(html).filter((clue) => clue.kind === "point"), ...metaClues(html).filter((clue) => clue.kind === "point"), ...mapClues(html).filter((clue) => clue.kind === "point")];
  const named = [...schemaClues(html), ...metaClues(html), ...mapClues(html)].filter((clue) => clue.kind === "address");
  const local: SiteClue[] = addresses.map((row) =>
    row.zone && !row.twoClocks ? { kind: "zone", zone: row.zone, place: row.text } : { kind: "address", text: row.text },
  );
  /* A text address in a two-clock state still has a fallback: the clock most of that state keeps. */
  const fallbacks: SiteClue[] = addresses
    .filter((row) => row.zone && row.twoClocks)
    .map((row) => ({ kind: "zone", zone: row.zone!, place: row.text }));
  return [...points, ...named, ...local, ...phoneClues(html), ...fallbacks];
}

/* -------------------------------- answering -------------------------------- */

const SECOND_PAGES = ["/contact", "/contact-us", "/about", "/about-us"];

async function answer(clues: SiteClue[], site: string, fetchImpl: typeof fetch): Promise<SiteHit | null> {
  let geocoded = 0;
  for (const clue of clues) {
    if (clue.kind === "point") {
      const zone = zoneAt(clue.lat, clue.lon);
      if (zone) return { zone, place: clue.place || "the map on the site", site };
      continue;
    }
    if (clue.kind === "zone") {
      if (isTimeZone(clue.zone)) return { zone: clue.zone, place: clue.place, site };
      continue;
    }
    /* A state that keeps one clock needs no map. */
    const local = textAddresses(clue.text).find((row) => row.zone && !row.twoClocks);
    if (local?.zone) return { zone: local.zone, place: clue.text, site };
    /* At most two addresses are put on the map: Nominatim asks for one request a second. */
    if (geocoded >= 2) continue;
    geocoded += 1;
    const placed = await geocodeToZone(clue.text, fetchImpl);
    if (placed) return { zone: placed.zone, place: clue.text, site };
  }
  return null;
}

export async function zoneFromSite(
  host: string,
  opts: { fetchImpl?: typeof fetch; resolve?: Resolve } = {},
): Promise<SiteHit | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const resolve = opts.resolve ?? resolveHost;
  const site = host.replace(/^www\./, "");
  const home = (await fetchPage(`https://${host}/`, { fetchImpl, resolve })) ?? (await fetchPage(`http://${host}/`, { fetchImpl, resolve }));
  if (home) {
    const hit = await answer(siteClues(home.html), site, fetchImpl);
    if (hit) return hit;
    const origin = new URL(home.url).origin;
    for (const path of SECOND_PAGES) {
      const page = await fetchPage(`${origin}${path}`, { fetchImpl, resolve });
      if (!page) continue;
      const found = await answer(siteClues(page.html), site, fetchImpl);
      if (found) return found;
    }
  }
  /* Nothing on the site, or no site: its own country domain, where that says one clock. */
  const guess = guessZoneFromAddress(`x@${site}`);
  return guess ? { zone: guess.zone, place: `a ${guess.domain} site`, site } : null;
}
