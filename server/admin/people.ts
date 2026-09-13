/**
 * The people list for the person who runs this deployment.
 *
 * A room address is a bearer credential. This module is the gate: no session
 * from room-account, or a session that is not the operator of THIS
 * deployment, and the list is not assembled. There is no shared password,
 * no secret path, and no query key.
 */

import type { Request } from "express";
import {
  type AdminPeopleResponse,
  type AdminPerson,
  type AdminPersonBooking,
  type AdminPersonRoom,
  type AdminPersonSignIn,
  type AdminSignInMethod,
} from "@shared/api";
import { isHouseHost } from "@shared/operator";
import { emailHashFor, roomsForEmailHash } from "../room-access";
import { operatorConfig } from "../operator";
import {
  listAccountIdentities,
  listAccounts,
  listBindingsByPerson,
  listIdentitiesForAccount,
  type StoredAccount,
  type StoredAccountIdentity,
} from "../identity-store";
import { listStoredBookings, type StoredBooking } from "../booking/hold";
import { roomLoginAvailability, tokensForAccountRooms, whatsappProviderId } from "../room-login";
import { readSessionAccount } from "../room-account";
import { storage } from "../storage";
import { getDb, hasDb } from "../db";
import { workspaces } from "@shared/schema";
import { inArray } from "drizzle-orm";

export const ADMIN_UNSIGNED_LINE = "This page is only for the person who runs this deployment. Sign in, then open it again.";

export const ADMIN_NOT_OPERATOR_LINE = "This page is only for the person who runs this deployment.";

export const ADMIN_OPERATOR_UNCONFIGURED_LINE =
  "This page is only for the person who runs this deployment, and no operator identity is configured.";

export const WHATSAPP_PHONE_NOT_HELD_LINE =
  "The phone number is not held. WhatsApp sign-in gives a peppered chat hash and a display name.";

export const LINKEDIN_CONTACT_LINE =
  "LinkedIn sign-in gives a display name. No email from that sign-in is stored on the account.";

export const EMAIL_HASH_ONLY_LINE =
  "An email sign-in proved possession of an address. The address itself is not stored.";

export const WHITE_LABEL_YES_LINE = "This person has a room opened through the white-label door.";

export const WHITE_LABEL_NO_LINE = "Not a white-label partner, from the rooms we have.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminGate =
  | { ok: true; account: StoredAccount }
  | { ok: false; status: 401 | 403; error: string };

function parseAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
}

function linkedinKeys(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const bare = trimmed.startsWith("linkedin:") ? trimmed.slice("linkedin:".length) : trimmed;
  if (!bare) return [];
  return [`linkedin:${bare}`, bare];
}

/**
 * Addresses and LinkedIn member ids that count as the operator of this
 * deployment. An env var is explicit. A fork's contact field is that
 * partner's own address when it is an email. On a house host the notify
 * address already on the deployment is the last fallback, because it is
 * already the owner's.
 */
export function operatorEmailsForHost(host: string): string[] {
  const found = new Set<string>();
  const explicit = parseAddress(process.env.OPERATOR_EMAIL);
  if (explicit) found.add(explicit);

  const contact = parseAddress(operatorConfig()?.identity.contact ?? null);
  if (contact) found.add(contact);

  if (isHouseHost(host)) {
    for (const part of (process.env.LEAD_NOTIFY_EMAIL ?? "").split(",")) {
      const email = parseAddress(part);
      if (email) found.add(email);
    }
  }
  return [...found];
}

export function operatorLinkedInIds(): string[] {
  const raw = process.env.OPERATOR_LINKEDIN_SUB?.trim() ?? "";
  if (!raw) return [];
  const ids = new Set<string>();
  for (const part of raw.split(",")) {
    for (const key of linkedinKeys(part)) ids.add(key);
  }
  return [...ids];
}

export function operatorIdentityConfigured(host: string): boolean {
  return operatorEmailsForHost(host).length > 0 || operatorLinkedInIds().length > 0;
}

function emailHashFromProviderId(providerId: string): string {
  return providerId.startsWith("email:") ? providerId.slice("email:".length) : providerId;
}

function identityMatchesOperator(identity: StoredAccountIdentity, host: string): boolean {
  if (identity.provider === "email") {
    const held = emailHashFromProviderId(identity.providerId);
    for (const email of operatorEmailsForHost(host)) {
      if (emailHashFor(email) === held) return true;
    }
    return false;
  }
  if (identity.provider === "linkedin") {
    const allowed = new Set(operatorLinkedInIds());
    if (allowed.size === 0) return false;
    return allowed.has(identity.providerId) || allowed.has(identity.providerId.replace(/^linkedin:/, ""));
  }
  return false;
}

export async function accountIsOperator(account: StoredAccount, host: string): Promise<boolean> {
  if (!operatorIdentityConfigured(host)) return false;
  const identities = await listIdentitiesForAccount(account.id);
  return identities.some((identity) => identityMatchesOperator(identity, host));
}

/**
 * THE BOOTSTRAP. To name yourself the operator you need OPERATOR_LINKEDIN_SUB,
 * and the value is your LinkedIn subject id — which nothing shows you, because
 * it arrives inside a token exchange and is never printed. So the refusal
 * writes the identities the refused account actually holds to the SERVER LOG,
 * where only whoever runs the deployment can read it, and the first refusal
 * tells you exactly what to paste.
 *
 * These are identifiers, not credentials: a LinkedIn sub, or the hash an
 * address is already stored under. Neither opens anything on its own.
 */
async function reportRefusal(account: StoredAccount, host: string): Promise<void> {
  try {
    const identities = await listIdentitiesForAccount(account.id);
    const shown = identities.map((identity) => `${identity.provider}=${identity.providerId}`).join(" ");
    console.warn(
      `[admin] refused ${host}: this account is not the operator. It holds ${shown || "no identity"}. ` +
        `Set OPERATOR_LINKEDIN_SUB or OPERATOR_EMAIL to name it.`,
    );
  } catch {
    /* A refusal that cannot be explained is still a refusal. */
  }
}

export async function requireDeploymentOperator(req: Request): Promise<AdminGate> {
  const host = req.hostname || "";
  const account = await readSessionAccount(req.headers.cookie);
  if (!account) return { ok: false, status: 401, error: ADMIN_UNSIGNED_LINE };
  if (!operatorIdentityConfigured(host)) {
    return { ok: false, status: 403, error: ADMIN_OPERATOR_UNCONFIGURED_LINE };
  }
  if (!(await accountIsOperator(account, host))) {
    await reportRefusal(account, host);
    return { ok: false, status: 403, error: ADMIN_NOT_OPERATOR_LINE };
  }
  return { ok: true, account };
}

function contactLine(method: AdminSignInMethod): string {
  if (method === "whatsapp") return WHATSAPP_PHONE_NOT_HELD_LINE;
  if (method === "linkedin") return LINKEDIN_CONTACT_LINE;
  return EMAIL_HASH_ONLY_LINE;
}

function signInFrom(identity: StoredAccountIdentity, accountName: string | null): AdminPersonSignIn {
  return {
    method: identity.provider,
    displayName: accountName,
    contactLine: contactLine(identity.provider),
  };
}

function emailHashesFor(identities: StoredAccountIdentity[]): string[] {
  const hashes: string[] = [];
  for (const identity of identities) {
    if (identity.provider !== "email") continue;
    hashes.push(emailHashFromProviderId(identity.providerId));
  }
  return hashes;
}

function whatsappIdsFor(identities: StoredAccountIdentity[]): Set<string> {
  const ids = new Set<string>();
  for (const identity of identities) {
    if (identity.provider !== "whatsapp") continue;
    ids.add(identity.providerId);
    const bare = identity.providerId.startsWith("whatsapp:")
      ? identity.providerId.slice("whatsapp:".length)
      : identity.providerId;
    ids.add(bare);
    ids.add(`whatsapp:${bare}`);
  }
  return ids;
}

function bookingBelongsTo(row: StoredBooking, identities: StoredAccountIdentity[]): boolean {
  if (row.email) {
    const hash = emailHashFor(row.email);
    if (emailHashesFor(identities).includes(hash)) return true;
  }
  if (row.chatId) {
    const hashed = whatsappProviderId(row.chatId);
    const ids = whatsappIdsFor(identities);
    if (ids.has(hashed) || ids.has(row.chatId)) return true;
  }
  return false;
}

function bookingView(row: StoredBooking): AdminPersonBooking {
  return {
    startsAt: row.startsAt,
    timezone: row.timezone,
    topic: row.topic,
    stands: row.cancelledAt == null,
  };
}

async function lastActiveByToken(tokens: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (tokens.length === 0 || !hasDb()) return found;
  const db = getDb();
  if (!db) return found;
  try {
    const rows = await db
      .select({ token: workspaces.token, lastActiveAt: workspaces.lastActiveAt })
      .from(workspaces)
      .where(inArray(workspaces.token, tokens));
    for (const row of rows) {
      const value =
        row.lastActiveAt instanceof Date ? row.lastActiveAt.toISOString() : String(row.lastActiveAt ?? "");
      if (value) found.set(row.token, value);
    }
  } catch {
    // Rooms live in memory when the table is missing. The page says so.
  }
  return found;
}

async function roomsForPerson(identities: StoredAccountIdentity[]): Promise<AdminPersonRoom[]> {
  const workspaceIds: string[] = [];
  const seen = new Set<string>();
  const byToken = new Map<string, { workspaceId?: string }>();

  for (const identity of identities) {
    if (identity.provider === "email") {
      for (const bound of await roomsForEmailHash(emailHashFromProviderId(identity.providerId))) {
        if (seen.has(bound.workspaceId)) continue;
        seen.add(bound.workspaceId);
        workspaceIds.push(bound.workspaceId);
        byToken.set(bound.workspaceToken, { workspaceId: bound.workspaceId });
      }
      continue;
    }
    if (identity.provider !== "linkedin" && identity.provider !== "whatsapp") continue;
    const bindings = await listBindingsByPerson(identity.provider, identity.providerId);
    const also =
      identity.provider === "whatsapp"
        ? await listBindingsByPerson(
            "whatsapp",
            identity.providerId.startsWith("whatsapp:")
              ? identity.providerId.slice("whatsapp:".length)
              : `whatsapp:${identity.providerId}`,
          )
        : [];
    for (const binding of [...bindings, ...also]) {
      if (seen.has(binding.workspaceId)) continue;
      seen.add(binding.workspaceId);
      workspaceIds.push(binding.workspaceId);
    }
  }

  const tokens = await tokensForAccountRooms(workspaceIds);
  for (const room of tokens) {
    if (!byToken.has(room.token)) byToken.set(room.token, {});
  }

  const rooms: AdminPersonRoom[] = [];
  const seenTokens = new Set<string>();
  const allTokens = [...new Set([...tokens.map((row) => row.token), ...byToken.keys()])];
  const lastActive = await lastActiveByToken(allTokens);
  for (const token of allTokens) {
    if (seenTokens.has(token)) continue;
    seenTokens.add(token);
    const state = await storage.getWorkspaceByToken(token);
    if (!state) {
      rooms.push({
        token,
        name: "A room",
        openedAt: "",
        lastActiveAt: lastActive.get(token) ?? null,
      });
      continue;
    }
    const openedAt =
      state.workspace.createdAt instanceof Date
        ? state.workspace.createdAt.toISOString()
        : String(state.workspace.createdAt);
    rooms.push({
      token,
      name: state.workspace.name,
      openedAt,
      lastActiveAt: lastActive.get(token) ?? null,
    });
  }
  return rooms;
}

function roomIsWhiteLabel(token: string, cache: Map<string, string | null>): Promise<boolean> | boolean {
  const cached = cache.get(token);
  if (cached !== undefined) return cached === "white-label";
  return storage.getWorkspaceByToken(token).then((state) => {
    const door = typeof state?.workspace.source?.door === "string" ? state.workspace.source.door : null;
    cache.set(token, door);
    return door === "white-label";
  });
}

async function personFromAccount(
  account: StoredAccount,
  identities: StoredAccountIdentity[],
  bookings: StoredBooking[],
  doorCache: Map<string, string | null>,
): Promise<AdminPerson> {
  const signedInWith = identities
    .map((identity) => signInFrom(identity, account.displayName))
    .sort((a, b) => a.method.localeCompare(b.method));

  const rooms = await roomsForPerson(identities);
  let whiteLabelPartner = false;
  for (const room of rooms) {
    const flag = await roomIsWhiteLabel(room.token, doorCache);
    if (flag) whiteLabelPartner = true;
  }

  const theirs = bookings.filter((row) => bookingBelongsTo(row, identities)).map(bookingView);
  theirs.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    id: account.id,
    displayName: account.displayName,
    signedInWith,
    rooms,
    bookings: theirs,
    whiteLabelPartner,
    whiteLabelLine: whiteLabelPartner ? WHITE_LABEL_YES_LINE : WHITE_LABEL_NO_LINE,
    orders: [],
    tasks: [],
  };
}

export async function listAdminPeople(req: Request): Promise<AdminPeopleResponse> {
  const host = req.hostname || "";
  const ways = await roomLoginAvailability({ host });
  const offeredSignIn: Record<AdminSignInMethod, boolean> = {
    linkedin: ways.linkedin.available,
    whatsapp: ways.whatsapp.available,
    email: ways.email.available,
  };

  const [accounts, identities, bookings] = await Promise.all([
    listAccounts(),
    listAccountIdentities(),
    Promise.resolve(listStoredBookings()),
  ]);

  const byAccount = new Map<string, StoredAccountIdentity[]>();
  for (const identity of identities) {
    const rows = byAccount.get(identity.accountId) ?? [];
    rows.push(identity);
    byAccount.set(identity.accountId, rows);
  }

  const doorCache = new Map<string, string | null>();
  const people: AdminPerson[] = [];
  const sorted = [...accounts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const account of sorted) {
    const attached = byAccount.get(account.id) ?? [];
    if (attached.length === 0) continue;
    people.push(await personFromAccount(account, attached, bookings, doorCache));
  }

  return {
    people,
    offeredSignIn,
    house: isHouseHost(host),
  };
}
