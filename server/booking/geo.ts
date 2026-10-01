/**
 * The two things every way of finding a recipient's zone ends in: a point on
 * the map turned into a zone, and a place's name turned into a point
 * (OpenStreetMap's Nominatim, which asks for a named client and at most one
 * request a second — an owner typing on one page does not approach that).
 */

import tzLookup from "@photostructure/tz-lookup";

import { isTimeZone } from "@shared/time-zones";

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
export const LOOKUP_USER_AGENT = "top-rated.team booking widget (https://top-rated.team)";
const REQUEST_MS = 6_000;

export function zoneAt(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;
  try {
    const zone = tzLookup(lat, lon);
    return zone && isTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": LOOKUP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** A place's name as a zone, with the name OpenStreetMap gave it. */
export async function geocodeToZone(query: string, fetchImpl: typeof fetch): Promise<{ zone: string; place: string } | null> {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", "accept-language": "en" });
  const rows = await getJson(`${NOMINATIM_SEARCH}?${params}`, fetchImpl);
  const first = record(Array.isArray(rows) ? rows[0] : null);
  if (!first) return null;
  const zone = zoneAt(Number(first.lat), Number(first.lon));
  if (!zone) return null;
  const name = typeof first.display_name === "string" ? first.display_name : query;
  /* The full address is long; the last three parts say where. */
  const place = name.split(",").map((part) => part.trim()).filter(Boolean).slice(-3).join(", ");
  return { zone, place };
}
