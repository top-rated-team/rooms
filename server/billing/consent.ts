/**
 * Whether two agents in this room may answer each other, and on whose word.
 *
 * THE RULE, which is the owner's and which decides everything here: "until the
 * budget runs out" is not a stopping condition. So an exchange between agents
 * needs three things at once, and the absence of any one of them is a refusal
 * rather than a smaller allowance:
 *
 *   1. A CARD ON FILE. Not because this charges anything — it does not — but
 *      because an exchange that can run on without a person watching is a
 *      thing somebody has to be answerable for.
 *   2. CONSENT, from a person, with the ceiling SHOWN to them first. The
 *      number they saw is stored beside their consent, so raising the default
 *      later cannot raise what they already agreed to.
 *   3. TURNS LEFT under that ceiling.
 *
 * `server/spend.ts` stays underneath as the last line. It is not this: a
 * spending limit that is reached is a bill nobody expected, and this exists so
 * that limit is never the thing that stops an exchange.
 *
 * Same shape as the rest of this repository's stores: a memory cache over a
 * table, hydrated once, written through, and honest about running without a
 * database rather than pretending.
 */

import { eq } from "drizzle-orm";

import { roomBilling } from "@shared/schema-billing";
import { getDb, hasDb } from "../db";

/** What a person is shown, and agreed to, when they turn an exchange on. */
export const DEFAULT_EXCHANGE_TURNS = 6;

export const NO_CARD_LINE =
  "Agents can answer each other once there is a card on this room. Nothing is charged to attach one.";
export const NO_CONSENT_LINE =
  "Nobody has turned on agents answering each other in this room yet.";
export const SPENT_LINE =
  "The agents have used the turns this room agreed to. Agree to more to carry on.";

export interface RoomBilling {
  workspaceId: string;
  customerId: string | null;
  paymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardAddedAt: string | null;
  agentExchangeTurns: number | null;
  agentExchangeUsed: number;
  agentExchangeConsentAt: string | null;
  agentExchangeConsentBy: string | null;
  updatedAt: string;
}

const rows = new Map<string, RoomBilling>();
let hydrated = false;
let hydrateInFlight: Promise<void> | null = null;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function blank(workspaceId: string): RoomBilling {
  return {
    workspaceId,
    customerId: null,
    paymentMethodId: null,
    cardBrand: null,
    cardLast4: null,
    cardAddedAt: null,
    agentExchangeTurns: null,
    agentExchangeUsed: 0,
    agentExchangeConsentAt: null,
    agentExchangeConsentBy: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function hydrateBilling(): Promise<void> {
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
    if (!db) return;
    try {
      for (const row of await db.select().from(roomBilling)) {
        if (rows.has(row.workspaceId)) continue;
        rows.set(row.workspaceId, {
          workspaceId: row.workspaceId,
          customerId: row.customerId,
          paymentMethodId: row.paymentMethodId,
          cardBrand: row.cardBrand,
          cardLast4: row.cardLast4,
          cardAddedAt: iso(row.cardAddedAt),
          agentExchangeTurns: row.agentExchangeTurns,
          agentExchangeUsed: row.agentExchangeUsed,
          agentExchangeConsentAt: iso(row.agentExchangeConsentAt),
          agentExchangeConsentBy: row.agentExchangeConsentBy,
          updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(
        "[billing] room_billing is not readable. A card and a consent stay in memory and vanish on restart until DATABASE_URL is set and `npm run db:push` creates the table.",
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

async function persist(row: RoomBilling): Promise<void> {
  if (!hasDb()) return;
  const db = getDb();
  if (!db) return;
  const values = {
    workspaceId: row.workspaceId,
    customerId: row.customerId,
    paymentMethodId: row.paymentMethodId,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    cardAddedAt: row.cardAddedAt ? new Date(row.cardAddedAt) : null,
    agentExchangeTurns: row.agentExchangeTurns,
    agentExchangeUsed: row.agentExchangeUsed,
    agentExchangeConsentAt: row.agentExchangeConsentAt ? new Date(row.agentExchangeConsentAt) : null,
    agentExchangeConsentBy: row.agentExchangeConsentBy,
    updatedAt: new Date(row.updatedAt),
  };
  try {
    await db
      .insert(roomBilling)
      .values(values)
      .onConflictDoUpdate({ target: roomBilling.workspaceId, set: values });
  } catch (error) {
    console.error(
      "[billing] could not persist a card or a consent. It is in this process only.",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function billingFor(workspaceId: string): Promise<RoomBilling> {
  await hydrateBilling();
  return rows.get(workspaceId) ?? blank(workspaceId);
}

async function write(workspaceId: string, change: Partial<RoomBilling>): Promise<RoomBilling> {
  await hydrateBilling();
  const next: RoomBilling = {
    ...(rows.get(workspaceId) ?? blank(workspaceId)),
    ...change,
    workspaceId,
    updatedAt: new Date().toISOString(),
  };
  rows.set(workspaceId, next);
  await persist(next);
  return next;
}

export async function rememberCustomer(workspaceId: string, customerId: string): Promise<RoomBilling> {
  return write(workspaceId, { customerId });
}

export async function rememberCard(
  workspaceId: string,
  card: { paymentMethodId: string; brand: string | null; last4: string | null },
): Promise<RoomBilling> {
  return write(workspaceId, {
    paymentMethodId: card.paymentMethodId,
    cardBrand: card.brand,
    cardLast4: card.last4,
    cardAddedAt: new Date().toISOString(),
  });
}

/**
 * Turning the exchange on. `turnsShown` is what the person had in front of
 * them, and it is what gets stored — not a default read at the time of use.
 */
export async function recordExchangeConsent(
  workspaceId: string,
  input: { turnsShown: number; by: string },
): Promise<RoomBilling> {
  const turns = Math.max(1, Math.min(50, Math.trunc(input.turnsShown)));
  return write(workspaceId, {
    agentExchangeTurns: turns,
    agentExchangeUsed: 0,
    agentExchangeConsentAt: new Date().toISOString(),
    agentExchangeConsentBy: input.by,
  });
}

export async function withdrawExchangeConsent(workspaceId: string): Promise<RoomBilling> {
  return write(workspaceId, {
    agentExchangeTurns: null,
    agentExchangeConsentAt: null,
    agentExchangeConsentBy: null,
  });
}

export type ExchangeVerdict =
  | { allowed: true; turnsLeft: number }
  | { allowed: false; reason: "no-card" | "no-consent" | "spent"; line: string };

/** The one question the agent loop asks. Three conditions, all of them. */
export async function mayAgentsAnswerEachOther(workspaceId: string): Promise<ExchangeVerdict> {
  const row = await billingFor(workspaceId);
  if (!row.paymentMethodId) return { allowed: false, reason: "no-card", line: NO_CARD_LINE };
  if (!row.agentExchangeTurns) return { allowed: false, reason: "no-consent", line: NO_CONSENT_LINE };
  const left = row.agentExchangeTurns - row.agentExchangeUsed;
  if (left <= 0) return { allowed: false, reason: "spent", line: SPENT_LINE };
  return { allowed: true, turnsLeft: left };
}

/** Called once per agent turn that an exchange raised, never for a person's. */
export async function countExchangeTurn(workspaceId: string): Promise<RoomBilling> {
  const row = await billingFor(workspaceId);
  return write(workspaceId, { agentExchangeUsed: row.agentExchangeUsed + 1 });
}

export function resetBillingForTests(): void {
  rows.clear();
  hydrated = false;
  hydrateInFlight = null;
}
