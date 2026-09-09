/**
 * Three generations per identified person.
 *
 * Three is capacity, not a gift: a Google Ads API developer token is limited
 * to 15,000 operations a day across every client of that token, and one of
 * these structures is about 150 operations if it were later written into an
 * account. This module does not write into an account. The cap still holds
 * that line.
 *
 * Durable means a table (`adgrant_generations` in shared/schema-adgrant.ts).
 * Without DATABASE_URL, or before `npm run db:push`, the count lives in this
 * process and a restart forgets it — the same degradation as room identity.
 */

import { nanoid } from "nanoid";
import { adgrantGenerations } from "@shared/schema-adgrant";
import type { AdGrantQuotaView } from "@shared/api";
import { getDb, hasDb } from "../db";

export const GENERATIONS_PER_PERSON = 3;
export const OPERATIONS_PER_DAY = 15_000;
export const OPERATIONS_PER_GENERATION = 150;

export const GENERATION_CAP_REASON =
  `Three is capacity, not a gift. A Google Ads API developer token is limited to ${OPERATIONS_PER_DAY.toLocaleString("en-US")} operations a day across every client, and one of these structures is about ${OPERATIONS_PER_GENERATION} operations if it were later written into an account. This response is not that write. The cap still holds the line for when writing into an account is a separate product.`;

export const MEMORY_COUNT_LINE =
  "This count lives in memory on this process and resets when the process restarts, because no database is configured.";

const counts = new Map<string, number>();

let hydrated = false;
let hydrateInFlight: Promise<void> | null = null;

async function hydrateFromDb(): Promise<void> {
  if (hydrated) return;
  if (!hasDb()) {
    hydrated = true;
    return;
  }
  if (hydrateInFlight) {
    await hydrateInFlight;
    return;
  }
  hydrateInFlight = (async () => {
    const db = getDb();
    if (!db) {
      hydrated = true;
      return;
    }
    try {
      const rows = await db.select().from(adgrantGenerations);
      const tallies = new Map<string, number>();
      for (const row of rows) {
        tallies.set(row.personKey, (tallies.get(row.personKey) ?? 0) + 1);
      }
      for (const [personKey, used] of tallies) {
        const already = counts.get(personKey) ?? 0;
        if (used > already) counts.set(personKey, used);
      }
    } catch (error) {
      console.error(
        "[adgrant-quota] adgrant_generations is not readable. Counts stay in memory and vanish on restart until DATABASE_URL is set and `npm run db:push` creates the table.",
        error instanceof Error ? error.message : error,
      );
    } finally {
      hydrated = true;
    }
  })();
  try {
    await hydrateInFlight;
  } finally {
    hydrateInFlight = null;
  }
}

export async function hydrateAdgrantQuota(): Promise<void> {
  await hydrateFromDb();
}

/**
 * LinkedIn `sub` or a hashed WhatsApp chat id, tagged with the provider so the
 * two cannot collide. Never a phone number.
 */
export function personKeyFor(binding: { provider: string; providerId: string }): string {
  return `${binding.provider}:${binding.providerId}`;
}

export function usedForPersonSync(personKey: string): number {
  return counts.get(personKey) ?? 0;
}

export async function remainingForPerson(personKey: string): Promise<number> {
  await hydrateFromDb();
  return Math.max(0, GENERATIONS_PER_PERSON - usedForPersonSync(personKey));
}

export function quotaViewFor(personKey: string): AdGrantQuotaView {
  const remaining = Math.max(0, GENERATIONS_PER_PERSON - usedForPersonSync(personKey));
  const durable = hasDb();
  const view: AdGrantQuotaView = {
    remaining,
    cap: GENERATIONS_PER_PERSON,
    capReason: GENERATION_CAP_REASON,
    durable,
  };
  if (!durable) view.durableLine = MEMORY_COUNT_LINE;
  return view;
}

export async function quotaViewForPerson(personKey: string): Promise<AdGrantQuotaView> {
  await hydrateFromDb();
  return quotaViewFor(personKey);
}

/**
 * Count a generation that has already been produced. Returns remaining after
 * the write, or remaining 0 with recorded false when the person is at the cap.
 */
export async function recordGeneration(input: {
  personKey: string;
  workspaceId: string;
}): Promise<{ recorded: boolean; remaining: number }> {
  await hydrateFromDb();
  const used = usedForPersonSync(input.personKey);
  if (used >= GENERATIONS_PER_PERSON) {
    return { recorded: false, remaining: 0 };
  }

  counts.set(input.personKey, used + 1);

  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.insert(adgrantGenerations).values({
          id: nanoid(),
          personKey: input.personKey,
          workspaceId: input.workspaceId,
          createdAt: new Date(),
        });
      } catch (error) {
        console.error(
          "[adgrant-quota] could not persist a generation. The count is in this process only, and a deploy will destroy it. The table has to exist first — DATABASE_URL plus `npm run db:push`.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return { recorded: true, remaining: GENERATIONS_PER_PERSON - used - 1 };
}

/** Test seam: forget every count. Does not delete database rows. */
export function resetAdgrantQuotaForTests(): void {
  counts.clear();
  hydrated = false;
  hydrateInFlight = null;
}

/** Test seam: the column we query, so a test can assert a phone is not the key. */
export function personColumn(): typeof adgrantGenerations.personKey {
  return adgrantGenerations.personKey;
}
