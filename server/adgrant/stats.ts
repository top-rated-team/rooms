/**
 * Today's figures for the AdGrant.AI home page, read from the live product
 * rather than from the copy frozen into shared/adgrant.ts at build time.
 *
 * WHY A PROXY AND NOT A FETCH FROM THE PAGE. adgrant.ai/api/templates/stats
 * sends no Access-Control-Allow-Origin, so a browser on top-rated.team cannot
 * read it. Checked, not assumed.
 *
 * WHY NOT SIMULATE. The owner asked for the numbers to update daily. They do
 * update — when AdGrant.AI processes more accounts — and this reads that.
 * Inventing movement between real readings would be manufacturing a statistic
 * on a page whose whole argument is that its numbers are measured, in a
 * codebase that already had to grow a guard (scripts/build-adgrant.ts) after a
 * vague claim was turned into a precise false one. If the figure sits still
 * for a week, it sat still for a week.
 *
 * The built-in snapshot stays the floor: a fetch that fails, times out or
 * comes back malformed leaves the page showing the figures it shipped with,
 * never a spinner and never a zero.
 */

import { STATS, type AdGrantStats } from "@shared/adgrant";

const SOURCE = "https://adgrant.ai/api/templates/stats";
/** Long enough that a busy day costs one request, short enough to be "daily". */
const TTL_MS = 6 * 60 * 60_000;
const TIMEOUT_MS = 8_000;

interface Cached {
  stats: AdGrantStats;
  at: number;
  live: boolean;
}

let cached: Cached | null = null;
let inFlight: Promise<Cached> | null = null;

export function resetAdGrantStatsForTests(): void {
  cached = null;
  inFlight = null;
}

/**
 * Shape-checked rather than cast. A published statistic is exactly the kind of
 * value where a silent undefined becomes "NaN accounts processed" on a page
 * somebody is deciding whether to trust.
 */
export function parseStats(value: unknown): AdGrantStats | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const totals = row.totals as Record<string, unknown> | undefined;
  if (!totals || typeof totals !== "object") return null;
  const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (!positive(row.accountsProcessed)) return null;
  for (const key of ["campaigns", "adGroups", "keywords", "ads"]) {
    if (!positive(totals[key])) return null;
  }
  /* Everything below accountsProcessed and totals is prose on the page rather
     than a headline, so the shipped snapshot fills any gap instead of the
     whole reading being thrown away. */
  return { ...STATS, ...(row as Partial<AdGrantStats>), totals: { ...STATS.totals, ...(totals as AdGrantStats["totals"]) } };
}

async function read(fetchImpl: typeof fetch): Promise<Cached> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(SOURCE, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { stats: STATS, at: Date.now(), live: false };
    const parsed = parseStats(await response.json());
    if (!parsed) return { stats: STATS, at: Date.now(), live: false };
    return { stats: parsed, at: Date.now(), live: true };
  } catch {
    return { stats: STATS, at: Date.now(), live: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Today's figures, or the shipped ones. Never throws, never blocks twice. */
export async function adGrantStats(fetchImpl: typeof fetch = fetch): Promise<{ stats: AdGrantStats; live: boolean }> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return { stats: cached.stats, live: cached.live };
  /* One reader at a time: the home page is the busiest route in this tree and
     a cold cache should not become a dozen simultaneous requests to a product
     that is somebody else's to keep up. */
  if (!inFlight) {
    inFlight = read(fetchImpl).finally(() => {
      inFlight = null;
    });
  }
  cached = await inFlight;
  return { stats: cached.stats, live: cached.live };
}
