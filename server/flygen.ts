/**
 * Rented accounts as the room is allowed to see them.
 *
 * They are called boosters, and they are capacity, not people. Nothing in this
 * file writes a booster into the members table, the mention list, or a log.
 * The API returns the real name of the person whose account is rented, plus
 * the password and the 2FA secret, inline. That payload is third-party
 * personal data. It is redacted in the same function that fetched it, by
 * building a new object from the fields the room may see — never by deleting
 * the ones it may not. The raw body is not assigned, not cached, not logged,
 * and not placed in an error.
 *
 * This module is read-only. It does not rent, release, sign in, appeal, retry,
 * or compute a 2FA code.
 */

import type { BoosterInventory, BoosterState, RoomBooster } from "@shared/api";

export const FLYGEN_ACCOUNTS_URL = "https://api.flygen.in/api/m2m/accounts";

/** Flygen allows 20 requests per minute per token. One cached projection is the defence. */
const DEFAULT_CACHE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 8_000;

const UNAVAILABLE: BoosterInventory = { status: "unavailable" };

/**
 * A register of things — minerals, stars, weather, rivers. Not people's names,
 * not actors, not characters. The API `name` field is a real person; a call
 * sign is what makes it possible to recognise a unit without ever repeating
 * that name. A human-sounding label would recreate the confusion this panel
 * exists to avoid.
 */
export const CALL_SIGNS = [
  "Basalt",
  "Granite",
  "Quartz",
  "Obsidian",
  "Marble",
  "Slate",
  "Flint",
  "Mica",
  "Feldspar",
  "Graphite",
  "Bauxite",
  "Magnetite",
  "Pyrite",
  "Calcite",
  "Dolomite",
  "Shale",
  "Pumice",
  "Schist",
  "Gneiss",
  "Andesite",
  "Rhyolite",
  "Malachite",
  "Jasper",
  "Agate",
  "Sirius",
  "Rigel",
  "Altair",
  "Deneb",
  "Polaris",
  "Spica",
  "Aldebaran",
  "Procyon",
  "Capella",
  "Antares",
  "Canopus",
  "Achernar",
  "Fomalhaut",
  "Betelgeuse",
  "Alnilam",
  "Mintaka",
  "Mistral",
  "Sirocco",
  "Bora",
  "Chinook",
  "Haboob",
  "Khamsin",
  "Levanter",
  "Pampero",
  "Harmattan",
  "Tramontane",
  "Cirrus",
  "Stratus",
  "Nimbus",
  "Cumulus",
  "Virga",
  "Graupel",
  "Danube",
  "Rhine",
  "Seine",
  "Loire",
  "Tagus",
  "Ebro",
  "Elbe",
  "Oder",
  "Thames",
  "Volga",
  "Dnieper",
  "Vistula",
  "Douro",
  "Garonne",
  "Moselle",
  "Meuse",
  "Shannon",
  "Yukon",
  "Mekong",
  "Zambezi",
  "Tigris",
  "Euphrates",
  "Orinoco",
  "Parana",
] as const;

export interface CallSign {
  number: number;
  word: string;
  label: string;
}

let cacheMs = DEFAULT_CACHE_MS;
let timeoutMs = DEFAULT_TIMEOUT_MS;
let cache: { at: number; inventory: BoosterInventory } | null = null;
let inflight: Promise<BoosterInventory> | null = null;

export function resetFlygenForTests(options?: { timeoutMs?: number; cacheMs?: number }): void {
  cache = null;
  inflight = null;
  timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  cacheMs = options?.cacheMs ?? DEFAULT_CACHE_MS;
}

/** FNV-1a, 32-bit. Same id, same index, across restarts, with nothing stored. */
function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function callSignFor(accountId: string): CallSign {
  const index = hashId(accountId) % CALL_SIGNS.length;
  const number = index + 1;
  const word = CALL_SIGNS[index];
  const label = `Booster ${String(number).padStart(2, "0")} · ${word}`;
  return { number, word, label };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function accountRows(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  const rec = asRecord(payload);
  if (!rec) return null;
  if (Array.isArray(rec.accounts)) return rec.accounts;
  if (Array.isArray(rec.data)) return rec.data;
  if (Array.isArray(rec.items)) return rec.items;
  return null;
}

function readState(raw: Record<string, unknown>): BoosterState {
  const value = raw.state ?? raw.status;
  if (typeof value !== "string") return "unknown";
  const normalised = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalised === "live" || normalised === "active" || normalised === "ok") return "live";
  if (normalised === "restricted" || normalised === "limited") return "restricted";
  if (normalised === "under_appeal" || normalised === "appeal" || normalised === "appealing") return "under_appeal";
  if (normalised === "rental_ending" || normalised === "ending" || normalised === "expiring") return "rental_ending";
  return "unknown";
}

function readLocation(raw: Record<string, unknown>): string | null {
  const proxy = asRecord(raw.proxy);
  if (!proxy) return null;
  if (typeof proxy.location !== "string") return null;
  const trimmed = proxy.location.trim();
  if (!trimmed || trimmed.length > 16) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

function asIsoDate(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const at = Date.parse(value);
    if (Number.isNaN(at)) return null;
    return new Date(at).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  return null;
}

function readRentalEnd(raw: Record<string, unknown>): string | null {
  const keys = ["rentalEndDate", "rentalEndsAt", "rental_end_date", "rental_ends_at", "rentalEnd", "rental_end"];
  for (const key of keys) {
    const iso = asIsoDate(raw[key]);
    if (iso) return iso;
  }
  return null;
}

/**
 * Allowlist projection. The seven dropped fields — `name`, `email`, `password`,
 * `twoFactorSecret`, `twoFactorSecretExpirationTime`, `description`, and the
 * whole `proxy` object except `location` — are never copied, because they are
 * never named here.
 */
export function projectAccount(raw: unknown): RoomBooster | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = rec.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const named = callSignFor(String(id));
  const booster: RoomBooster = {
    callSign: named.label,
    number: named.number,
    state: readState(rec),
    location: readLocation(rec),
    rentalEndsAt: readRentalEnd(rec),
  };
  return booster;
}

function projectPayload(payload: unknown): RoomBooster[] | null {
  const rows = accountRows(payload);
  if (!rows) return null;
  const boosters: RoomBooster[] = [];
  for (const row of rows) {
    const booster = projectAccount(row);
    if (booster) boosters.push(booster);
  }
  boosters.sort((a, b) => a.number - b.number || a.callSign.localeCompare(b.callSign));
  return boosters;
}

function isAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { name?: string }).name === "AbortError";
}

async function loadInventory(): Promise<BoosterInventory> {
  const key = process.env.FLYGEN_API_KEY?.trim();
  if (!key) return UNAVAILABLE;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let payload: unknown;
  try {
    const response = await fetch(FLYGEN_ACCOUNTS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 429) return UNAVAILABLE;
    if (!response.ok) return UNAVAILABLE;
    const text = await response.text();
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return UNAVAILABLE;
    }
  } catch (error) {
    if (isAbort(error)) return UNAVAILABLE;
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }

  const boosters = projectPayload(payload);
  payload = null;
  if (!boosters) return UNAVAILABLE;
  return { status: "ok", boosters };
}

/**
 * The room's view of the inventory. Failures are `unavailable`, never an empty
 * ok-list: an empty list means none are held.
 */
export async function listBoosters(): Promise<BoosterInventory> {
  const now = Date.now();
  if (cache && now - cache.at < cacheMs) return cache.inventory;
  if (inflight) return inflight;

  let pending: Promise<BoosterInventory>;
  pending = loadInventory()
    .then((inventory) => {
      cache = { at: Date.now(), inventory };
      return inventory;
    })
    .catch((): BoosterInventory => {
      cache = { at: Date.now(), inventory: UNAVAILABLE };
      return UNAVAILABLE;
    })
    .finally(() => {
      if (inflight === pending) inflight = null;
    });

  inflight = pending;
  return pending;
}
