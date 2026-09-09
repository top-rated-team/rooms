/**
 * Persistence for room ownership and for the WhatsApp number-as-note.
 *
 * identity.ts is the logic; this file is the store. In memory when there is
 * no DATABASE_URL, which is how the product runs today, and every deploy then
 * destroys the rows. When a database is configured the same rows go to
 * `room_bindings` / `room_whatsapp_notes` — tables that still have to be
 * pushed with drizzle-kit before a write there means anything.
 *
 * The first binding on a room is its owner. A later bind does not replace it.
 * A number someone typed is a note, stored apart from a binding, so the two
 * cannot be printed as the same fact.
 */

import { eq } from "drizzle-orm";
import { roomBindings, roomWhatsappNotes } from "@shared/schema-rooms";
import type { RoomBindingProvider } from "@shared/api";
import { getDb, hasDb } from "./db";

export interface StoredBinding {
  workspaceId: string;
  provider: RoomBindingProvider;
  /** Opaque. LinkedIn `sub`, or a hash of a WhatsApp chat id. Never a phone, never a token. */
  providerId: string;
  displayName: string;
  boundAt: string;
}

export interface StoredWhatsappNote {
  workspaceId: string;
  number: string;
  addedAt: string;
}

const bindings = new Map<string, StoredBinding>();
const notes = new Map<string, StoredWhatsappNote>();

let hydrated = false;
let hydrateInFlight: Promise<void> | null = null;

function iso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function fromBindingRow(row: {
  workspaceId: string;
  provider: string;
  providerId: string;
  displayName: string;
  boundAt: Date;
}): StoredBinding {
  return {
    workspaceId: row.workspaceId,
    provider: row.provider === "whatsapp" ? "whatsapp" : "linkedin",
    providerId: row.providerId,
    displayName: row.displayName,
    boundAt: iso(row.boundAt),
  };
}

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
      const [bindingRows, noteRows] = await Promise.all([
        db.select().from(roomBindings),
        db.select().from(roomWhatsappNotes),
      ]);
      for (const row of bindingRows) {
        if (!bindings.has(row.workspaceId)) bindings.set(row.workspaceId, fromBindingRow(row));
      }
      for (const row of noteRows) {
        if (!notes.has(row.workspaceId)) {
          notes.set(row.workspaceId, {
            workspaceId: row.workspaceId,
            number: row.number,
            addedAt: iso(row.addedAt),
          });
        }
      }
    } catch (error) {
      // The tables this parcel adds are not on the deployment until db:push.
      // Falling through to memory is the same as having no database: a claim
      // written here will not survive a restart. Said once, plainly.
      console.error(
        "[identity-store] room_bindings is not readable. Claims stay in memory and vanish on restart until DATABASE_URL is set and `npm run db:push` creates the table.",
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

export async function hydrateIdentityStore(): Promise<void> {
  await hydrateFromDb();
}

export function getBinding(workspaceId: string): StoredBinding | undefined {
  return bindings.get(workspaceId);
}

export function getWhatsappNote(workspaceId: string): StoredWhatsappNote | undefined {
  return notes.get(workspaceId);
}

/**
 * First write wins. The first binding on a room is its owner.
 * Returns the row that is now stored — the existing owner, or the one just written.
 */
export async function putBinding(row: StoredBinding): Promise<StoredBinding> {
  await hydrateFromDb();
  const existing = bindings.get(row.workspaceId);
  if (existing) return existing;

  bindings.set(row.workspaceId, row);

  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.insert(roomBindings).values({
          workspaceId: row.workspaceId,
          provider: row.provider,
          providerId: row.providerId,
          displayName: row.displayName,
          boundAt: new Date(row.boundAt),
        });
      } catch (error) {
        console.error(
          "[identity-store] could not persist a room binding. The claim is in this process only, and a deploy will destroy it. The table has to exist first — DATABASE_URL plus `npm run db:push`.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return row;
}

export async function putWhatsappNote(row: StoredWhatsappNote): Promise<StoredWhatsappNote> {
  await hydrateFromDb();
  notes.set(row.workspaceId, row);

  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        const existing = await db
          .select()
          .from(roomWhatsappNotes)
          .where(eq(roomWhatsappNotes.workspaceId, row.workspaceId))
          .limit(1);
        if (existing.length > 0) {
          await db
            .update(roomWhatsappNotes)
            .set({ number: row.number, addedAt: new Date(row.addedAt) })
            .where(eq(roomWhatsappNotes.workspaceId, row.workspaceId));
        } else {
          await db.insert(roomWhatsappNotes).values({
            workspaceId: row.workspaceId,
            number: row.number,
            addedAt: new Date(row.addedAt),
          });
        }
      } catch (error) {
        console.error(
          "[identity-store] could not persist a WhatsApp note. It is in this process only.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return row;
}

export function resetIdentityStoreForTests(): void {
  bindings.clear();
  notes.clear();
  hydrated = false;
  hydrateInFlight = null;
}
