/**
 * A durable account and the cookie that points at it.
 *
 * Wave 13's sign-in was stateless: prove who you are, pick a room, and the
 * room token in localStorage is what remembers you. There was no session, so
 * there was nothing for Sign out to end and nothing for a second way in to
 * be attached to.
 *
 * The cookie is a credential: HttpOnly, Secure in production, SameSite=Lax,
 * rotated on every sign-in, and measured in years. An expiry in days would
 * forget somebody the owner asked to remember for as long as possible.
 *
 * Attaching a second identity to a signed-in account is the dangerous
 * operation. If that identity already belongs to another account, refuse.
 * Silently joining two accounts would hand one person's rooms to another,
 * and a room token is a bearer credential.
 */

import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import {
  ROOM_SESSION_OUTCOME_LINES,
  ROOM_SESSION_REFUSED_LINE,
  type RoomAccountProvider,
  type RoomSession,
  type RoomSessionOutcome,
} from "@shared/api";
import {
  attachIdentity,
  createAccount,
  deleteSession,
  findAccountByIdentity,
  getAccount,
  getSession,
  listBindingsByPerson,
  listIdentitiesForAccount,
  putSession,
  setAccountDisplayName,
  setAccountEmail,
  type AttachIdentityResult,
  type StoredAccount,
} from "./identity-store";

export const ROOM_SESSION_COOKIE = "room_session";

/** Ten years. Browsers may clamp this; the intent is not a few days. */
export const ROOM_SESSION_YEARS = 10;
export const ROOM_SESSION_MAX_AGE_MS = ROOM_SESSION_YEARS * 365 * 24 * 60 * 60 * 1000;
export const ROOM_SESSION_MAX_AGE_SEC = Math.floor(ROOM_SESSION_MAX_AGE_MS / 1000);

export const SESSION_TICKET_PREFIX = "__session__:";

const TICKET_MS = 15 * 60_000;

export type SignInIdentity = {
  provider: RoomAccountProvider;
  providerId: string;
  displayName?: string | null;
  /**
   * The readable address, when the way in knew one. `providerId` stays a hash;
   * this is kept only to hand back to the person it belongs to — so a booking
   * form does not ask them for an address they have already given us.
   */
  email?: string | null;
};

export type SignInResult =
  | { ok: true; kind: "created" | "signed-in" | "attached"; account: StoredAccount; token: string }
  | { ok: false; reason: "belongs-to-other-account"; line: string };

export type LinkedInTicketFinish =
  | {
      ok: false;
      outcome: Extract<
        RoomSessionOutcome,
        "missing-state" | "wrong-browser" | "missing-pending" | "linkedin-error" | "token-failed"
      >;
    }
  | { ok: true; outcome: Extract<RoomSessionOutcome, "no-room" | "signed-in">; rooms: { token: string }[]; identity: SignInIdentity };

interface LinkedInTicket {
  createdAt: number;
  finish: LinkedInTicketFinish;
}

const tickets = new Map<string, LinkedInTicket>();

function sweepTickets(now = Date.now()): void {
  for (const [id, row] of tickets) {
    if (now - row.createdAt > TICKET_MS) tickets.delete(id);
  }
}

function sessionPepper(): Buffer {
  const configured = process.env.ROOM_HASH_PEPPER?.trim();
  return configured ? Buffer.from(configured, "utf8") : Buffer.alloc(0);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(sessionPepper()).update("\0").update("session").update("\0").update(token).digest("hex");
}

export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const cut = trimmed.indexOf("=");
    if (cut <= 0) continue;
    if (trimmed.slice(0, cut) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(cut + 1));
    } catch {
      return trimmed.slice(cut + 1);
    }
  }
  return null;
}

export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ROOM_SESSION_MAX_AGE_MS,
  };
}

export async function readSessionAccount(cookieHeader: string | undefined, now = Date.now()): Promise<StoredAccount | undefined> {
  const token = cookieValue(cookieHeader, ROOM_SESSION_COOKIE);
  if (!token) return undefined;
  const row = await getSession(hashSessionToken(token), now);
  if (!row) return undefined;
  return getAccount(row.accountId);
}

/**
 * Every room reachable from every way in on this account.
 *
 * LinkedIn and WhatsApp bind a room to a person in identity-store; an address
 * binds one in room-access, under a different key, which is why email is
 * looked up separately rather than skipped.
 */
async function roomsForIdentities(identities: Awaited<ReturnType<typeof listIdentitiesForAccount>>): Promise<{ token: string }[]> {
  const { tokensForAccountRooms } = await import("./room-login");
  const { roomsForEmailHash } = await import("./room-access");
  const workspaceIds: string[] = [];
  const seen = new Set<string>();
  const tokens: { token: string }[] = [];
  const seenTokens = new Set<string>();
  for (const identity of identities) {
    if (identity.provider === "email") {
      for (const bound of await roomsForEmailHash(emailHashFromProviderId(identity.providerId))) {
        if (seen.has(bound.workspaceId)) continue;
        seen.add(bound.workspaceId);
        if (seenTokens.has(bound.workspaceToken)) continue;
        seenTokens.add(bound.workspaceToken);
        tokens.push({ token: bound.workspaceToken });
      }
      continue;
    }
    const bindings = await listBindingsByPerson(identity.provider, identity.providerId);
    for (const binding of bindings) {
      if (seen.has(binding.workspaceId)) continue;
      seen.add(binding.workspaceId);
      workspaceIds.push(binding.workspaceId);
    }
  }
  for (const room of await tokensForAccountRooms(workspaceIds)) {
    if (seenTokens.has(room.token)) continue;
    seenTokens.add(room.token);
    tokens.push(room);
  }
  return tokens;
}

/** The providerId an address is stored under, and the hash back out of it. */
export function emailProviderId(emailHash: string): string {
  return `email:${emailHash}`;
}

function emailHashFromProviderId(providerId: string): string {
  return providerId.startsWith("email:") ? providerId.slice("email:".length) : providerId;
}

export async function whoAmI(cookieHeader: string | undefined, now = Date.now()): Promise<RoomSession> {
  const account = await readSessionAccount(cookieHeader, now);
  if (!account) return { signedIn: false };
  const identities = await listIdentitiesForAccount(account.id);
  const attached: Record<RoomAccountProvider, boolean> = {
    linkedin: false,
    whatsapp: false,
    email: false,
  };
  for (const identity of identities) attached[identity.provider] = true;
  return {
    signedIn: true,
    displayName: account.displayName,
    /* Only ever sent to the browser holding this account's own session. */
    email: account.email,
    attached,
    rooms: await roomsForIdentities(identities),
  };
}

/**
 * Mint a session and, when this browser already had one, END that one.
 *
 * "Rotated on every sign-in" was only half true: a new row was written and
 * the old row was left valid for its full ten years, so a cookie copied off a
 * shared machine outlived every later sign-in and every sign-out but the one
 * performed with that exact value. Only the token being replaced is ended —
 * the account's other sessions are its other devices.
 */
async function rotateSession(
  accountId: string,
  now = Date.now(),
  replacing?: string,
): Promise<string> {
  const token = mintSessionToken();
  await putSession({
    tokenHash: hashSessionToken(token),
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ROOM_SESSION_MAX_AGE_MS).toISOString(),
  });
  if (replacing) await deleteSession(hashSessionToken(replacing));
  return token;
}

/**
 * Find or create the account for this identity, then mint a new session.
 * When a session is already present, attach instead — and refuse if the
 * identity belongs to a different account.
 */
export async function signInOrAttach(input: {
  identity: SignInIdentity;
  cookieHeader?: string;
  now?: number;
}): Promise<SignInResult> {
  const now = input.now ?? Date.now();
  const held = cookieValue(input.cookieHeader, ROOM_SESSION_COOKIE) ?? undefined;
  const current = await readSessionAccount(input.cookieHeader, now);

  if (current) {
    const attached = await attachIdentity({
      provider: input.identity.provider,
      providerId: input.identity.providerId,
      accountId: current.id,
    });
    if (!attached.ok) {
      return { ok: false, reason: "belongs-to-other-account", line: ROOM_SESSION_REFUSED_LINE };
    }
    if (input.identity.displayName) {
      await setAccountDisplayName(current.id, input.identity.displayName);
    }
    if (input.identity.email) await setAccountEmail(current.id, input.identity.email);
    const token = await rotateSession(current.id, now, held);
    const account = (await getAccount(current.id)) ?? current;
    return { ok: true, kind: "attached", account, token };
  }

  const existing = await findAccountByIdentity(input.identity.provider, input.identity.providerId);
  if (existing) {
    if (input.identity.displayName) {
      await setAccountDisplayName(existing.id, input.identity.displayName);
    }
    if (input.identity.email) await setAccountEmail(existing.id, input.identity.email);
    const token = await rotateSession(existing.id, now, held);
    const account = (await getAccount(existing.id)) ?? existing;
    return { ok: true, kind: "signed-in", account, token };
  }

  /* The identity is claimed first, under an id that has no row yet. Creating
     the account first and attaching second left an unreachable account behind
     whenever the attach lost a race, and answered the loser with the line that
     says the identity belongs to somebody else — which, in that race, is the
     person themselves. */
  const id = `acct_${nanoid(16)}`;
  const attached = await attachIdentity({
    provider: input.identity.provider,
    providerId: input.identity.providerId,
    accountId: id,
    attachedAt: new Date(now).toISOString(),
  });
  if (!attached.ok) {
    const won = await findAccountByIdentity(input.identity.provider, input.identity.providerId);
    if (!won) return { ok: false, reason: "belongs-to-other-account", line: ROOM_SESSION_REFUSED_LINE };
    const token = await rotateSession(won.id, now, held);
    return { ok: true, kind: "signed-in", account: won, token };
  }
  const account = await createAccount({
    id,
    displayName: input.identity.displayName ?? null,
    email: input.identity.email ?? null,
    createdAt: new Date(now).toISOString(),
  });
  const token = await rotateSession(account.id, now, held);
  return { ok: true, kind: "created", account, token };
}

export async function endSession(cookieHeader: string | undefined): Promise<void> {
  const token = cookieValue(cookieHeader, ROOM_SESSION_COOKIE);
  if (!token) return;
  await deleteSession(hashSessionToken(token));
}

export function putLinkedInTicket(finish: LinkedInTicketFinish): string {
  sweepTickets();
  const id = nanoid(24);
  tickets.set(id, { createdAt: Date.now(), finish });
  return id;
}

export function takeLinkedInTicket(idRaw: string, now = Date.now()): LinkedInTicketFinish | undefined {
  sweepTickets(now);
  const id = idRaw.trim();
  if (!id) return undefined;
  const row = tickets.get(id);
  if (!row) return undefined;
  tickets.delete(id);
  return row.finish;
}

export function isSessionTicketLine(line: string): boolean {
  return line.startsWith(SESSION_TICKET_PREFIX);
}

export function sessionTicketFromLine(line: string): string | null {
  if (!isSessionTicketLine(line)) return null;
  const id = line.slice(SESSION_TICKET_PREFIX.length).trim();
  return id || null;
}

export function roomSessionOutcomePath(outcome: RoomSessionOutcome): string {
  const params = new URLSearchParams({
    signin: "1",
    signin_outcome: outcome,
  });
  return `/?${params.toString()}`;
}

export function roomSessionOutcomeLine(outcome: RoomSessionOutcome): string {
  return ROOM_SESSION_OUTCOME_LINES[outcome];
}

export async function claimLinkedInSession(input: {
  ticket: string;
  cookieHeader?: string;
}): Promise<{ location: string; token?: string }> {
  const finish = takeLinkedInTicket(input.ticket);
  if (!finish) {
    return { location: roomSessionOutcomePath("missing-pending") };
  }
  if (!finish.ok) {
    return { location: roomSessionOutcomePath(finish.outcome) };
  }

  const signed = await signInOrAttach({
    identity: finish.identity,
    cookieHeader: input.cookieHeader,
  });
  if (!signed.ok) {
    return { location: roomSessionOutcomePath("refused") };
  }

  const outcome: RoomSessionOutcome =
    signed.kind === "attached" && input.cookieHeader
      ? "attached"
      : finish.outcome === "no-room"
        ? "no-room"
        : "signed-in";
  return { location: roomSessionOutcomePath(outcome), token: signed.token };
}

export type ClaimWhatsAppResult =
  | { ok: true; kind: "created" | "signed-in" | "attached"; token: string; rooms: { token: string }[] }
  | { ok: false; reason: "not-confirmed" | "belongs-to-other-account"; line: string; rooms: { token: string }[] };

export async function claimWhatsAppSession(input: {
  code: string;
  cookieHeader?: string;
}): Promise<ClaimWhatsAppResult> {
  const { takeWhatsAppLoginResult } = await import("./room-login");
  const result = takeWhatsAppLoginResult(input.code);
  if (!result) {
    return { ok: false, reason: "not-confirmed", line: "That WhatsApp sign-in is not confirmed.", rooms: [] };
  }
  const signed = await signInOrAttach({
    identity: {
      provider: "whatsapp",
      providerId: result.providerId,
      displayName: result.displayName,
    },
    cookieHeader: input.cookieHeader,
  });
  /* No rooms on the refusal. The whole point of refusing is that this chat's
     rooms belong to another account; returning them in the same breath would
     hand over exactly what was just withheld. */
  if (!signed.ok) return { ...signed, rooms: [] };
  return { ok: true, kind: signed.kind, token: signed.token, rooms: result.rooms };
}

export function resetRoomAccountForTests(): void {
  tickets.clear();
}

export type { AttachIdentityResult };
