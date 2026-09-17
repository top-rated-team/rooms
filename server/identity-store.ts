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
 *
 * Booking Sign in with LinkedIn is not a room claim. That flow lives in
 * server/booking/signin.ts and must never call putBinding — a booker has no
 * workspaceId, and writing them here would mint a room owner out of a
 * calendar invite.
 */

import { eq } from "drizzle-orm";
import { roomBindings, roomWhatsappNotes } from "@shared/schema-rooms";
import { accountIdentities, accounts, sessions } from "@shared/schema-accounts";
import type { RoomAccountProvider, RoomBindingProvider } from "@shared/api";
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

export interface StoredAccount {
  id: string;
  displayName: string | null;
  /** Readable, shown only back to this person. See shared/schema-accounts.ts. */
  email: string | null;
  createdAt: string;
}

export interface StoredAccountIdentity {
  provider: RoomAccountProvider;
  providerId: string;
  accountId: string;
  attachedAt: string;
}

export interface StoredSession {
  tokenHash: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

export type AttachIdentityResult =
  | { ok: true; identity: StoredAccountIdentity }
  | { ok: false; reason: "belongs-to-other-account"; accountId: string };

const bindings = new Map<string, StoredBinding>();
const notes = new Map<string, StoredWhatsappNote>();
/** Reverse index: given this person, which rooms are theirs. */
const byPerson = new Map<string, Set<string>>();

const accountRows = new Map<string, StoredAccount>();
const identityRows = new Map<string, StoredAccountIdentity>();
const sessionRows = new Map<string, StoredSession>();

function identityKey(provider: RoomAccountProvider, providerId: string): string {
  return `${provider}\0${providerId}`;
}

let hydrated = false;
let hydrateInFlight: Promise<void> | null = null;

function personKey(provider: StoredBinding["provider"], providerId: string): string {
  return `${provider}\0${providerId}`;
}

function indexBinding(row: StoredBinding): void {
  const key = personKey(row.provider, row.providerId);
  const ids = byPerson.get(key) ?? new Set<string>();
  ids.add(row.workspaceId);
  byPerson.set(key, ids);
}

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
    /* ONE FLAG, SET ONCE, AT THE END OF BOTH READS. It used to be set in the
       first read's own `finally`, which meant a caller arriving while the
       accounts query was still on the wire took the `if (hydrated) return`
       path at the top and read an EMPTY account store: a valid session came
       back signed-out, and a sign-in in that window would have minted a
       second account for an identity the database already owned. Render
       restarts this service several times a day, so that window opens
       several times a day. */
    try {
      const [bindingRows, noteRows] = await Promise.all([
        db.select().from(roomBindings),
        db.select().from(roomWhatsappNotes),
      ]);
      for (const row of bindingRows) {
        if (!bindings.has(row.workspaceId)) {
          const stored = fromBindingRow(row);
          bindings.set(row.workspaceId, stored);
          indexBinding(stored);
        }
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
    }
    try {
      const [accountList, identityList, sessionList] = await Promise.all([
        db.select().from(accounts),
        db.select().from(accountIdentities),
        db.select().from(sessions),
      ]);
      for (const row of accountList) {
        if (!accountRows.has(row.id)) {
          accountRows.set(row.id, {
            id: row.id,
            displayName: row.displayName,
            email: row.email,
            createdAt: iso(row.createdAt),
          });
        }
      }
      for (const row of identityList) {
        const provider: RoomAccountProvider =
          row.provider === "whatsapp" ? "whatsapp" : row.provider === "email" ? "email" : "linkedin";
        const stored: StoredAccountIdentity = {
          provider,
          providerId: row.providerId,
          accountId: row.accountId,
          attachedAt: iso(row.attachedAt),
        };
        const key = identityKey(stored.provider, stored.providerId);
        if (!identityRows.has(key)) identityRows.set(key, stored);
      }
      const now = Date.now();
      for (const row of sessionList) {
        const expiresAt = iso(row.expiresAt);
        if (new Date(expiresAt).getTime() <= now) continue;
        if (!sessionRows.has(row.tokenHash)) {
          sessionRows.set(row.tokenHash, {
            tokenHash: row.tokenHash,
            accountId: row.accountId,
            createdAt: iso(row.createdAt),
            expiresAt,
          });
        }
      }
    } catch (error) {
      console.error(
        "[identity-store] accounts is not readable. Sign-in stays in memory and vanishes on restart until DATABASE_URL is set and `npm run db:push` creates the table.",
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

/**
 * The reverse of getBinding: given this person, which rooms are theirs.
 * Same hashed identifiers the forward map already stores. Nothing new is written.
 */
export async function listBindingsByPerson(
  provider: RoomBindingProvider,
  providerId: string,
): Promise<StoredBinding[]> {
  await hydrateFromDb();
  const ids = byPerson.get(personKey(provider, providerId));
  if (!ids) return [];
  const rows: StoredBinding[] = [];
  for (const id of ids) {
    const row = bindings.get(id);
    if (row) rows.push(row);
  }
  return rows;
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
  indexBinding(row);

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

export async function createAccount(input: {
  id: string;
  displayName?: string | null;
  email?: string | null;
  createdAt?: string;
}): Promise<StoredAccount> {
  await hydrateFromDb();
  const row: StoredAccount = {
    id: input.id,
    displayName: input.displayName?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  accountRows.set(row.id, row);
  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.insert(accounts).values({
          id: row.id,
          displayName: row.displayName,
          email: row.email,
          createdAt: new Date(row.createdAt),
        });
      } catch (error) {
        console.error(
          "[identity-store] could not persist an account. It is in this process only.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  return row;
}

export async function getAccount(accountId: string): Promise<StoredAccount | undefined> {
  await hydrateFromDb();
  return accountRows.get(accountId);
}

export async function setAccountDisplayName(accountId: string, displayName: string | null): Promise<void> {
  await hydrateFromDb();
  const row = accountRows.get(accountId);
  if (!row) return;
  if (row.displayName) return;
  const next = displayName?.trim() || null;
  if (!next) return;
  row.displayName = next;
  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.update(accounts).set({ displayName: next }).where(eq(accounts.id, accountId));
      } catch (error) {
        console.error(
          "[identity-store] could not persist an account name. It is in this process only.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

/**
 * Remember the address a way in told us, once.
 *
 * Same shape as the display name above, and for the same reason: the first way
 * in that knows it wins, and a later one does not quietly overwrite what the
 * person has been seeing.
 */
export async function setAccountEmail(accountId: string, email: string | null): Promise<void> {
  await hydrateFromDb();
  const row = accountRows.get(accountId);
  if (!row) return;
  if (row.email) return;
  const next = email?.trim().toLowerCase() || null;
  if (!next) return;
  row.email = next;
  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.update(accounts).set({ email: next }).where(eq(accounts.id, accountId));
      } catch (error) {
        console.error(
          "[identity-store] could not persist an account address. It is in this process only.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

export async function findAccountByIdentity(
  provider: RoomAccountProvider,
  providerId: string,
): Promise<StoredAccount | undefined> {
  await hydrateFromDb();
  const identity = identityRows.get(identityKey(provider, providerId));
  if (!identity) return undefined;
  return accountRows.get(identity.accountId);
}

export async function listIdentitiesForAccount(accountId: string): Promise<StoredAccountIdentity[]> {
  await hydrateFromDb();
  const rows: StoredAccountIdentity[] = [];
  for (const row of identityRows.values()) {
    if (row.accountId === accountId) rows.push(row);
  }
  return rows;
}

/** Every account this deployment has. The people page is the only caller. */
export async function listAccounts(): Promise<StoredAccount[]> {
  await hydrateFromDb();
  return [...accountRows.values()];
}

/** Every way-in this deployment has stored. */
export async function listAccountIdentities(): Promise<StoredAccountIdentity[]> {
  await hydrateFromDb();
  return [...identityRows.values()];
}

/** Every room binding this deployment has stored. */
export async function listBindings(): Promise<StoredBinding[]> {
  await hydrateFromDb();
  return [...bindings.values()];
}

/**
 * First write wins. If this identity already belongs to another account, refuse.
 * Silently joining two accounts would hand one person's rooms to another.
 */
export async function attachIdentity(input: {
  provider: RoomAccountProvider;
  providerId: string;
  accountId: string;
  attachedAt?: string;
}): Promise<AttachIdentityResult> {
  await hydrateFromDb();
  const key = identityKey(input.provider, input.providerId);
  const existing = identityRows.get(key);
  if (existing) {
    if (existing.accountId === input.accountId) return { ok: true, identity: existing };
    return { ok: false, reason: "belongs-to-other-account", accountId: existing.accountId };
  }

  const row: StoredAccountIdentity = {
    provider: input.provider,
    providerId: input.providerId,
    accountId: input.accountId,
    attachedAt: input.attachedAt ?? new Date().toISOString(),
  };
  identityRows.set(key, row);

  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.insert(accountIdentities).values({
          provider: row.provider,
          providerId: row.providerId,
          accountId: row.accountId,
          attachedAt: new Date(row.attachedAt),
        });
      } catch (error) {
        console.error(
          "[identity-store] could not persist an account identity. It is in this process only.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return { ok: true, identity: row };
}

export async function putSession(row: StoredSession): Promise<StoredSession> {
  await hydrateFromDb();
  sessionRows.set(row.tokenHash, row);
  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.insert(sessions).values({
          tokenHash: row.tokenHash,
          accountId: row.accountId,
          createdAt: new Date(row.createdAt),
          expiresAt: new Date(row.expiresAt),
        });
      } catch (error) {
        console.error(
          "[identity-store] could not persist a session. It is in this process only.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  return row;
}

export async function getSession(tokenHash: string, now = Date.now()): Promise<StoredSession | undefined> {
  await hydrateFromDb();
  const row = sessionRows.get(tokenHash);
  if (!row) return undefined;
  if (new Date(row.expiresAt).getTime() <= now) {
    sessionRows.delete(tokenHash);
    return undefined;
  }
  return row;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await hydrateFromDb();
  sessionRows.delete(tokenHash);
  if (hasDb()) {
    const db = getDb();
    if (db) {
      try {
        await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
      } catch (error) {
        console.error(
          "[identity-store] could not delete a session row.",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

export function resetIdentityStoreForTests(): void {
  bindings.clear();
  notes.clear();
  byPerson.clear();
  accountRows.clear();
  identityRows.clear();
  sessionRows.clear();
  hydrated = false;
  hydrateInFlight = null;
}
