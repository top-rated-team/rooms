/**
 * A way back into a room that survives a cleared browser: a link sent to an
 * address, valid once and for one hour.
 *
 * The room's own address is a bearer credential. Putting it in an email would
 * make that email a credential too, forever, in whatever archive it lands in.
 * So the mailed URL carries a different token, hashed before it is stored, and
 * spent when it is used. A stolen database of hashes does not yield a working
 * link.
 *
 * THE REPLY ON SCREEN IS THE SAME whether or not a room was found. A form that
 * says "no room for that address" is a form that tells anybody whether a given
 * person is a customer here. The no-room path waits as long as a send would, so
 * latency does not say what the words do not.
 *
 * An address earns a room only through bindRoomAddress. workspaces.visitorEmail
 * is self-asserted and is not read here.
 */

import { createHash, randomBytes } from "node:crypto";
import { mailFrom } from "./mail-from";
import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import {
  ROOM_ACCESS_SENT_LINE,
  ROOM_ACCESS_TTL_MS,
  ROOM_ACCESS_TTL_PHRASE,
  ROOM_ACCESS_UNAVAILABLE_LINE,
  type RoomAccessAvailability,
  type SendRoomAccessResponse,
} from "@shared/api";
import { roomAccessLinks, roomAddressBindings } from "@shared/schema-rooms";
import { getDb, hasDb } from "./db";
import { storage } from "./storage";

export {
  ROOM_ACCESS_SENT_LINE,
  ROOM_ACCESS_TTL_MS,
  ROOM_ACCESS_TTL_PHRASE,
  ROOM_ACCESS_UNAVAILABLE_LINE,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 200;
const ACCESS_TOKEN_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ACCESS_TOKEN_LENGTH = 32;
const mintAccessToken = customAlphabet(ACCESS_TOKEN_ALPHABET, ACCESS_TOKEN_LENGTH);
const EMAIL_TIMEOUT_MS = 8_000;
/** One send per address, and one per room, inside this window. */
export const SEND_COOLDOWN_MS = 15 * 60_000;
/** Both the found and the not-found path wait at least this long. */
export const TIMING_FLOOR_MS = 800;

export const ROOM_ACCESS_INVALID_EMAIL_LINE = "That does not look like an email.";
export const ROOM_ACCESS_SPENT_LINE = `This link has already been used, or ${ROOM_ACCESS_TTL_PHRASE} has passed, so it no longer opens a room.`;
export const ROOM_ACCESS_SEND_FAILED_LINE = "The link could not be sent. Try again.";
export const ROOM_ACCESS_NO_PUBLIC_URL_LINE =
  "A link cannot be sent from this deployment: the public address is not configured.";
export const ROOM_ACCESS_NO_DATABASE_LINE =
  "A link cannot be sent from this deployment: rooms are not stored in a database, so a link could not last an hour.";

const RESEND_URL = "https://api.resend.com/emails";

/* --------------------------------- hashing -------------------------------- */

let pepper: Buffer | null = null;
let memoryDurableForTests = false;
let hydrated = false;
let hydrateInFlight: Promise<void> | null = null;
let lastSendMs = TIMING_FLOOR_MS;

function hashPepper(): Buffer {
  if (pepper) return pepper;
  const configured = process.env.ROOM_HASH_PEPPER?.trim();
  if (configured) {
    pepper = Buffer.from(configured, "utf8");
    return pepper;
  }
  pepper = randomBytes(32);
  return pepper;
}

function digest(kind: "email" | "access", value: string): string {
  return createHash("sha256").update(hashPepper()).update("\0").update(kind).update("\0").update(value).digest("hex");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = normalizeEmail(value);
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return null;
  return email;
}

function hashEmail(email: string): string {
  return digest("email", normalizeEmail(email));
}

function hashAccessToken(token: string): string {
  return digest("access", token);
}

export function configuredPublicBaseUrl(): string | null {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* --------------------------------- records -------------------------------- */

export interface BoundRoomAddress {
  workspaceId: string;
  /** The room's own address. Server-side only — never put in the email. */
  workspaceToken: string;
}

interface IssuedLink {
  tokenHash: string;
  workspaceId: string;
  workspaceToken: string;
  emailHash: string;
  createdAt: number;
  expiresAt: number;
  spentAt: number | null;
}

const bindings = new Map<string, BoundRoomAddress[]>();
const links = new Map<string, IssuedLink>();
const sentAtByEmail = new Map<string, number>();
const sentAtByRoom = new Map<string, number>();

function durableConfigured(): boolean {
  return memoryDurableForTests || hasDb();
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
      const [bindingRows, linkRows] = await Promise.all([
        db.select().from(roomAddressBindings),
        db.select().from(roomAccessLinks),
      ]);
      for (const row of bindingRows) {
        rememberBinding(
          { workspaceId: row.workspaceId, workspaceToken: row.workspaceToken },
          row.emailHash,
        );
      }
      const now = Date.now();
      for (const row of linkRows) {
        const expiresAt = row.expiresAt.getTime();
        const spentAt = row.spentAt ? row.spentAt.getTime() : null;
        if (expiresAt <= now && spentAt === null) continue;
        links.set(row.tokenHash, {
          tokenHash: row.tokenHash,
          workspaceId: row.workspaceId,
          workspaceToken: row.workspaceToken,
          emailHash: row.emailHash,
          createdAt: row.createdAt.getTime(),
          expiresAt,
          spentAt,
        });
      }
    } catch (error) {
      console.error(
        "[room-access] room_address_bindings is not readable. A link cannot be kept for an hour until DATABASE_URL is set and `npm run db:push` creates the tables.",
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

export function resetRoomAccessForTests(): void {
  bindings.clear();
  links.clear();
  sentAtByEmail.clear();
  sentAtByRoom.clear();
  pepper = null;
  memoryDurableForTests = false;
  hydrated = false;
  hydrateInFlight = null;
  lastSendMs = TIMING_FLOOR_MS;
}

/** Tests of send/open keep rows in this process, which is what a database does in production. */
export function useMemoryRoomAccessForTests(): void {
  memoryDurableForTests = true;
}

/** Test seam: the stored rows, so cases can assert what is NOT on them. */
export function issuedLinksForTests(): IssuedLink[] {
  return [...links.values()];
}

export function bindingsForTests(email: string): BoundRoomAddress[] {
  return [...(bindings.get(hashEmail(email)) ?? [])];
}

/* --------------------------------- mail ----------------------------------- */

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.LEAD_EMAIL_FROM?.trim());
}

export function roomAccessAvailability(): RoomAccessAvailability {
  if (!durableConfigured()) {
    return { available: false, unavailableLine: ROOM_ACCESS_NO_DATABASE_LINE };
  }
  if (!configuredPublicBaseUrl()) {
    return { available: false, unavailableLine: ROOM_ACCESS_NO_PUBLIC_URL_LINE };
  }
  if (!mailConfigured()) {
    return { available: false, unavailableLine: ROOM_ACCESS_UNAVAILABLE_LINE };
  }
  return { available: true };
}

function roomAccessReady(): SendRoomAccessResult | null {
  const availability = roomAccessAvailability();
  if (availability.available) return null;
  return { ok: false, status: 503, error: availability.unavailableLine };
}

/**
 * The Resend call. Same host, key and From address notify.ts already uses for
 * lead mail. A deployment with no key must not reach this.
 */
async function sendViaResend(to: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  /* mailFrom and not the bare variable: a client handed only an address shows
     the local part as the sender, so this used to arrive from "contact". */
  const from = mailFrom();
  if (!key || !from) return false;

  const started = Date.now();
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "A link to your room",
        text,
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    lastSendMs = Math.max(TIMING_FLOOR_MS, Date.now() - started);
    return response.ok;
  } catch (error) {
    lastSendMs = Math.max(TIMING_FLOOR_MS, Date.now() - started);
    console.error("[room-access] sending the link failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

function accessUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/api/room-access/${token}`;
}

function emailBody(publicBaseUrl: string, tokens: string[]): string {
  const mailed = tokens.map((token) => accessUrl(publicBaseUrl, token));
  if (mailed.length === 1) {
    return [
      `This link opens the room once, and only for ${ROOM_ACCESS_TTL_PHRASE}:`,
      "",
      mailed[0],
      "",
      `After it has been used, or after ${ROOM_ACCESS_TTL_PHRASE}, it will not work. It is not the room's own address, so keeping this email does not keep a way into the room forever.`,
    ].join("\n");
  }
  return [
    `Each of these links opens one room once, and only for ${ROOM_ACCESS_TTL_PHRASE}:`,
    "",
    ...mailed,
    "",
    `After a link has been used, or after ${ROOM_ACCESS_TTL_PHRASE}, it will not work. These are not the rooms' own addresses, so keeping this email does not keep a way into the rooms forever.`,
  ].join("\n");
}

async function equalizeTiming(
  startedAt: number,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<void> {
  const wait = Math.max(TIMING_FLOOR_MS, lastSendMs) - (Date.now() - startedAt);
  if (wait > 0) await sleepImpl(wait);
}

/* -------------------------------- bindings -------------------------------- */

function rememberBinding(row: BoundRoomAddress, emailHash: string): void {
  const existing = bindings.get(emailHash) ?? [];
  if (existing.some((item) => item.workspaceId === row.workspaceId)) {
    bindings.set(
      emailHash,
      existing.map((item) => (item.workspaceId === row.workspaceId ? row : item)),
    );
    return;
  }
  bindings.set(emailHash, [...existing, row]);
}

async function persistBinding(row: BoundRoomAddress, emailHash: string): Promise<boolean> {
  rememberBinding(row, emailHash);
  if (!hasDb()) return memoryDurableForTests;
  const db = getDb();
  if (!db) return false;
  try {
    const existing = await db
      .select()
      .from(roomAddressBindings)
      .where(eq(roomAddressBindings.emailHash, emailHash));
    const same = existing.find((item) => item.workspaceId === row.workspaceId);
    if (same) {
      await db
        .update(roomAddressBindings)
        .set({ workspaceToken: row.workspaceToken, boundAt: new Date() })
        .where(
          and(eq(roomAddressBindings.emailHash, emailHash), eq(roomAddressBindings.workspaceId, row.workspaceId)),
        );
      return true;
    }
    await db.insert(roomAddressBindings).values({
      emailHash,
      workspaceId: row.workspaceId,
      workspaceToken: row.workspaceToken,
      boundAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error(
      "[room-access] could not persist an address binding. The row is in this process only.",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Record that this address belongs to this room. The address is hashed. The
 * room token is kept server-side so a later send can mint an access link
 * without putting that token in the mail.
 *
 * Callers must be real: a LinkedIn userinfo email, or an address a person
 * typed into a room they were already inside. workspaces.visitorEmail is not
 * a caller.
 */
export async function bindRoomAddress(input: {
  workspaceId: string;
  workspaceToken: string;
  email: string;
}): Promise<void> {
  await hydrateFromDb();
  const email = parseEmail(input.email);
  if (!email) return;
  const workspaceToken = input.workspaceToken.trim();
  const workspaceId = input.workspaceId.trim();
  if (!workspaceToken || !workspaceId) return;
  await persistBinding({ workspaceId, workspaceToken }, hashEmail(email));
}

/**
 * An address typed into a room the caller is already inside. The room token
 * is the credential; this is not a way to bind a stranger's address to a
 * room you do not have.
 */
export async function bindRoomAddressForToken(
  token: string,
  email: unknown,
): Promise<{ ok: true } | { ok: false; status: 400 | 404; error: string }> {
  const parsed = parseEmail(email);
  if (!parsed) return { ok: false, status: 400, error: ROOM_ACCESS_INVALID_EMAIL_LINE };
  const state = await storage.getWorkspaceByToken(token.trim());
  if (!state) return { ok: false, status: 404, error: "Workspace not found" };
  await bindRoomAddress({
    workspaceId: state.workspace.id,
    workspaceToken: state.workspace.token,
    email: parsed,
  });
  return { ok: true };
}

async function roomsForEmail(email: string): Promise<BoundRoomAddress[]> {
  await hydrateFromDb();
  return [...(bindings.get(hashEmail(email)) ?? [])];
}

/* ---------------------------------- send ---------------------------------- */

export type SendRoomAccessResult =
  | { ok: true; body: SendRoomAccessResponse }
  | { ok: false; status: 400 | 503; error: string };

function coolingDown(map: Map<string, number>, key: string, now: number): boolean {
  const last = map.get(key);
  return last !== undefined && now - last < SEND_COOLDOWN_MS;
}

function markSent(emailHash: string, workspaceId: string, now: number): void {
  sentAtByEmail.set(emailHash, now);
  sentAtByRoom.set(workspaceId, now);
}

function issueLink(room: BoundRoomAddress, emailHash: string, now: number): { token: string; row: IssuedLink } {
  const token = mintAccessToken();
  const row: IssuedLink = {
    tokenHash: hashAccessToken(token),
    workspaceId: room.workspaceId,
    workspaceToken: room.workspaceToken,
    emailHash,
    createdAt: now,
    expiresAt: now + ROOM_ACCESS_TTL_MS,
    spentAt: null,
  };
  links.set(row.tokenHash, row);
  return { token, row };
}

async function persistLink(row: IssuedLink): Promise<boolean> {
  if (!hasDb()) return memoryDurableForTests;
  const db = getDb();
  if (!db) return false;
  try {
    await db.insert(roomAccessLinks).values({
      tokenHash: row.tokenHash,
      workspaceId: row.workspaceId,
      workspaceToken: row.workspaceToken,
      emailHash: row.emailHash,
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
      spentAt: null,
    });
    return true;
  } catch (error) {
    console.error(
      "[room-access] could not persist an access link. Nothing was mailed.",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Mint single-use links for rooms this address is bound to, and send them.
 * Always returns the same visitor-facing line when the request is well-formed
 * and sending is configured, whether or not anything was found — except when
 * the mail provider rejects a send, which must not claim a link was sent.
 */
export async function sendRoomAccessLink(input: {
  email: unknown;
  /** Tests only. Production mails PUBLIC_BASE_URL and refuses when it is unset. */
  publicBaseUrl?: string;
  now?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SendRoomAccessResult> {
  const email = parseEmail(input.email);
  if (!email) {
    return { ok: false, status: 400, error: ROOM_ACCESS_INVALID_EMAIL_LINE };
  }
  const notReady = roomAccessReady();
  if (notReady) return notReady;

  const publicBaseUrl = configuredPublicBaseUrl() ?? input.publicBaseUrl?.replace(/\/+$/, "") ?? null;
  if (!publicBaseUrl) {
    return { ok: false, status: 503, error: ROOM_ACCESS_NO_PUBLIC_URL_LINE };
  }

  const now = input.now ?? Date.now();
  const startedAt = Date.now();
  const sleepImpl = input.sleep ?? sleep;
  const emailHash = hashEmail(email);
  const body: SendRoomAccessResponse = { line: ROOM_ACCESS_SENT_LINE };

  if (coolingDown(sentAtByEmail, emailHash, now)) {
    await equalizeTiming(startedAt, sleepImpl);
    return { ok: true, body };
  }

  const rooms = (await roomsForEmail(email)).filter((room) => !coolingDown(sentAtByRoom, room.workspaceId, now));
  if (rooms.length === 0) {
    await equalizeTiming(startedAt, sleepImpl);
    return { ok: true, body };
  }

  const issued = rooms.map((room) => issueLink(room, emailHash, now));
  for (const item of issued) {
    const kept = await persistLink(item.row);
    if (!kept) {
      links.delete(item.row.tokenHash);
      await equalizeTiming(startedAt, sleepImpl);
      return { ok: false, status: 503, error: ROOM_ACCESS_SEND_FAILED_LINE };
    }
  }

  const sent = await sendViaResend(
    email,
    emailBody(
      publicBaseUrl,
      issued.map((item) => item.token),
    ),
  );
  if (!sent) {
    await equalizeTiming(startedAt, sleepImpl);
    return { ok: false, status: 503, error: ROOM_ACCESS_SEND_FAILED_LINE };
  }

  for (const item of issued) markSent(emailHash, item.row.workspaceId, now);
  await equalizeTiming(startedAt, sleepImpl);
  return { ok: true, body };
}

/* ---------------------------------- open ---------------------------------- */

export type OpenRoomAccessResult =
  | { ok: true; workspaceToken: string }
  | { ok: false; line: string };

async function markLinkSpent(row: IssuedLink, now: number): Promise<void> {
  row.spentAt = now;
  links.set(row.tokenHash, row);
  if (!hasDb()) return;
  const db = getDb();
  if (!db) return;
  try {
    await db
      .update(roomAccessLinks)
      .set({ spentAt: new Date(now) })
      .where(eq(roomAccessLinks.tokenHash, row.tokenHash));
  } catch (error) {
    console.error(
      "[room-access] could not mark a link spent in the database.",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Spend a mailed token and return the room's own address. The mailed token is
 * not that address and is never returned.
 */
export async function openRoomAccess(token: string, now = Date.now()): Promise<OpenRoomAccessResult> {
  await hydrateFromDb();
  const trimmed = token.trim();
  if (!trimmed || trimmed.length !== ACCESS_TOKEN_LENGTH) {
    return { ok: false, line: ROOM_ACCESS_SPENT_LINE };
  }

  const row = links.get(hashAccessToken(trimmed));
  if (!row || row.spentAt !== null || row.expiresAt <= now) {
    return { ok: false, line: ROOM_ACCESS_SPENT_LINE };
  }

  await markLinkSpent(row, now);
  return { ok: true, workspaceToken: row.workspaceToken };
}

export function spentPage(line: string): string {
  const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>This link is no longer valid</title>
</head>
<body>
<p>${escaped}</p>
<p><a href="/">Back to the site</a></p>
</body></html>`;
}
