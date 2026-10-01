/**
 * Cities, for the widget page's "Where they are": type a town, pick it, and
 * its time zone comes with it — and the email names that town rather than
 * the zone's capital ("Eastern Time (Smalltown, PA, EDT)").
 *
 * The list is GeoNames' cities of a thousand people or more (135,000 of
 * them, CC BY 4.0, from the all-the-cities package), searched here on the
 * server: OpenStreetMap's own search asks not to be used to suggest as one
 * types, and a town picked from a list needs no lookup at all. The zone is
 * the town's own, from its coordinates (@photostructure/tz-lookup), so a
 * town on the wrong side of a zone line inside a state gets its real clock.
 *
 * The package decodes all of it into one big array of objects when it is
 * imported (50 MB that would stay); this reads its data file directly into a
 * few flat arrays instead, once, on the first search.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { zoneAt } from "./geo";

export interface CityHit {
  /** "Smalltown, PA" — what the email calls the place. */
  place: string;
  /** "Smalltown, PA, United States" — what the list shows. */
  label: string;
  zone: string;
  population: number;
  lat: number;
  lon: number;
}

interface CityTable {
  names: string[];
  keys: string[];
  countries: string[];
  admins: string[];
  population: Uint32Array;
  lat: Float32Array;
  lon: Float32Array;
}

let table: CityTable | null = null;

function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dataFile(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("all-the-cities/package.json")), "cities.pbf");
}

/* The file is protobuf, one length-prefixed message per city; coordinates are
   deltas from the previous city's, as the package writes them. */
function decode(buffer: Buffer): CityTable {
  const names: string[] = [];
  const countries: string[] = [];
  const admins: string[] = [];
  const pops: number[] = [];
  const lats: number[] = [];
  const lons: number[] = [];
  let pos = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = buffer[pos++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return result;
      shift += 7;
    }
  };
  const svarint = (): number => {
    const n = varint();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  };
  let lastLat = 0;
  let lastLon = 0;
  while (pos < buffer.length) {
    const end = varint() + pos;
    let name = "";
    let country = "";
    let admin = "";
    let feature = "";
    let population = 0;
    while (pos < end) {
      const key = varint();
      const tag = Math.floor(key / 8);
      const wire = key % 8;
      if (wire === 2) {
        const length = varint();
        const text = buffer.toString("utf8", pos, pos + length);
        pos += length;
        if (tag === 2) name = text;
        else if (tag === 3) country = text;
        else if (tag === 7) feature = text;
        else if (tag === 8) admin = text;
      } else if (wire === 0) {
        if (tag === 1) svarint();
        else if (tag === 9) population = varint();
        else if (tag === 10) lastLon += svarint();
        else if (tag === 11) lastLat += svarint();
        else varint();
      } else {
        throw new Error(`cities.pbf: wire type ${wire} is not one this reads`);
      }
    }
    /* A district of a city (PPLX), or a place that is gone (historical,
       abandoned, destroyed): not a town anyone is in. The running deltas
       above have already moved on, so skipping it here keeps them right. */
    if (/^PPL[XHQW]$/.test(feature)) continue;
    names.push(name);
    countries.push(country);
    admins.push(admin);
    pops.push(population);
    lats.push(lastLat / 1e5);
    lons.push(lastLon / 1e5);
  }
  return {
    names,
    keys: names.map(normalise),
    countries,
    admins,
    population: Uint32Array.from(pops),
    lat: Float32Array.from(lats),
    lon: Float32Array.from(lons),
  };
}

function cities(): CityTable {
  if (!table) table = decode(fs.readFileSync(dataFile()));
  return table;
}

/* United States states by name, for "Paris, Texas" as well as "Paris, TX". */
export const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/* Where people write the state, not the country. */
const BY_STATE = new Set(["US", "CA", "AU"]);

let countryNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    countryNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function hitAt(t: CityTable, i: number): CityHit | null {
  const lat = t.lat[i]!;
  const lon = t.lon[i]!;
  const zone = zoneAt(lat, lon);
  if (!zone) return null;
  const country = t.countries[i]!;
  const state = BY_STATE.has(country) && /^[A-Z]{2,3}$/.test(t.admins[i]!) ? t.admins[i]! : "";
  const place = state ? `${t.names[i]}, ${state}` : t.names[i]!;
  return { place, label: `${place}, ${countryName(country)}`, zone, population: t.population[i]!, lat, lon };
}

/**
 * Towns whose name starts with what was typed, biggest first, a whole-name
 * match before a partial one. "Springfield, IL" or "Paris, France" narrows
 * by state or country.
 */
export function searchCities(query: string, limit = 8): CityHit[] {
  const [rawName, rawWhere] = query.split(",", 2).map((part) => part.trim());
  const name = normalise(rawName ?? "");
  if (name.length < 2) return [];
  const where = normalise(rawWhere ?? "");
  const t = cities();
  const found: number[] = [];
  for (let i = 0; i < t.keys.length; i += 1) {
    if (!t.keys[i]!.startsWith(name)) continue;
    if (where) {
      const admin = t.admins[i]!.toLowerCase();
      const country = t.countries[i]!.toLowerCase();
      const stateByName = t.countries[i] === "US" ? US_STATE_NAMES[where]?.toLowerCase() : undefined;
      if (admin !== where && admin !== stateByName && country !== where && !normalise(countryName(t.countries[i]!)).startsWith(where)) continue;
    }
    found.push(i);
  }
  found.sort((a, b) => {
    const exactA = t.keys[a] === name ? 1 : 0;
    const exactB = t.keys[b] === name ? 1 : 0;
    return exactB - exactA || t.population[b]! - t.population[a]!;
  });
  const out: CityHit[] = [];
  for (const i of found) {
    const hit = hitAt(t, i);
    if (hit) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The town a point is in — what a map pin on a website, or an address put on
 * the map, is called in the email: the biggest town within 4 km (a pin in a
 * city's centre is that city, not the district it stands in), else the
 * nearest within 40 km, else nothing.
 */
export function nearestCity(lat: number, lon: number): CityHit | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const t = cities();
  const scale = Math.cos((lat * Math.PI) / 180);
  /* In degrees of latitude: 4 km and 40 km. Wider than 4 km and a suburb's
     pin is named for the bigger town next door. */
  const near = 0.036 * 0.036;
  const far = 0.36 * 0.36;
  let nearest = -1;
  let nearestDistance = Infinity;
  let biggest = -1;
  for (let i = 0; i < t.lat.length; i += 1) {
    const dLat = t.lat[i]! - lat;
    if (dLat > 0.5 || dLat < -0.5) continue;
    const dLon = (t.lon[i]! - lon) * scale;
    const distance = dLat * dLat + dLon * dLon;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = i;
    }
    if (distance <= near && (biggest < 0 || t.population[i]! > t.population[biggest]!)) biggest = i;
  }
  if (biggest >= 0) return hitAt(t, biggest);
  if (nearest < 0 || nearestDistance > far) return null;
  return hitAt(t, nearest);
}

export function resetCitiesForTests(): void {
  table = null;
}
