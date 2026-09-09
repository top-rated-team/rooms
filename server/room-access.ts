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
 * person is a customer here.
 *
 * Bindings of address → room live in this module, hashed. Identity does not
 * store an email today; callers that learn one (LinkedIn userinfo, a typed
 * visitorEmail) should call bindRoomAddress. Until they do, this path can only
 * find rooms it was told about, or — with a database — a workspace that already
 * carries that visitorEmail.
 */

import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import {
  ROOM_ACCESS_SENT_LINE,
  ROOM_ACCESS_TTL_MS,
  ROOM_ACCESS_TTL_PHRASE,
  ROOM_ACCESS_UNAVAILABLE_LINE,
  type RoomAccessAvailability,
  type SendRoomAccessResponse,
} from "@shared/api";
import { workspaces } from "@shared/schema";
import { getDb, hasDb } from "./db";

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

export const ROOM_ACCESS_INVALID_EMAIL_LINE = "That does not look like an address.";
export const ROOM_ACCESS_SPENT_LINE = `This link has already been used, or ${ROOM_ACCESS_TTL_PHRASE} has passed, so it no longer opens a room.`;

const RESEND_URL = "https://api.resend.com/emails";

/* --------------------------------- hashing -------------------------------- */

let pepper: Buffer | null = null;

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

export function resetRoomAccessForTests(): void {
  bindings.clear();
  links.clear();
  sentAtByEmail.clear();
  sentAtByRoom.clear();
  pepper = null;
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
  if (mailConfigured()) return { available: true };
  return { available: false, unavailableLine: ROOM_ACCESS_UNAVAILABLE_LINE };
}

/**
 * The Resend call. Same host, key and From address notify.ts already uses for
 * lead mail. A deployment with no key must not reach this.
 */
async function sendViaResend(to: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.LEAD_EMAIL_FROM?.trim();
  if (!key || !from) return false;

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
    return response.ok;
  } catch (error) {
    console.error("[room-access] sending the link failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

function accessUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/api/room-access/${token}`;
}

function emailBody(publicBaseUrl: string, tokens: string[]): string {
  const links = tokens.map((token) => accessUrl(publicBaseUrl, token));
  if (links.length === 1) {
    return [
      `This link opens the room once, and only for ${ROOM_ACCESS_TTL_PHRASE}:`,
      "",
      links[0],
      "",
      `After it has been used, or after ${ROOM_ACCESS_TTL_PHRASE}, it will not work. It is not the room's own address, so keeping this email does not keep a way into the room forever.`,
    ].join("\n");
  }
  return [
    `Each of these links opens one room once, and only for ${ROOM_ACCESS_TTL_PHRASE}:`,
    "",
    ...links,
    "",
    `After a link has been used, or after ${ROOM_ACCESS_TTL_PHRASE}, it will not work. These are not the rooms' own addresses, so keeping this email does not keep a way into the rooms forever.`,
  ].join("\n");
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

/**
 * Record that this address belongs to this room. The address is hashed. The
 * room token is kept server-side so a later send can mint an access link
 * without putting that token in the mail.
 */
export function bindRoomAddress(input: { workspaceId: string; workspaceToken: string; email: string }): void {
  const email = parseEmail(input.email);
  if (!email) return;
  const workspaceToken = input.workspaceToken.trim();
  const workspaceId = input.workspaceId.trim();
  if (!workspaceToken || !workspaceId) return;
  rememberBinding({ workspaceId, workspaceToken }, hashEmail(email));
}

async function roomsFromVisitorEmail(email: string): Promise<BoundRoomAddress[]> {
  if (!hasDb()) return [];
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        workspaceId: workspaces.id,
        workspaceToken: workspaces.token,
        visitorEmail: workspaces.visitorEmail,
      })
      .from(workspaces)
      .where(sql`lower(${workspaces.visitorEmail}) = ${email}`);
    return rows
      .filter((row) => row.workspaceToken)
      .map((row) => ({ workspaceId: row.workspaceId, workspaceToken: row.workspaceToken }));
  } catch (error) {
    console.error(
      "[room-access] could not read visitorEmail off workspaces. Address lookup stays with the bindings this process was told about.",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

async function roomsForEmail(email: string): Promise<BoundRoomAddress[]> {
  const fromBind = bindings.get(hashEmail(email)) ?? [];
  const fromWorkspaces = await roomsFromVisitorEmail(email);
  const byId = new Map<string, BoundRoomAddress>();
  for (const row of [...fromBind, ...fromWorkspaces]) {
    if (!byId.has(row.workspaceId)) byId.set(row.workspaceId, row);
  }
  return [...byId.values()];
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

/**
 * Mint single-use links for rooms this address is bound to, and send them.
 * Always returns the same visitor-facing line when the request is well-formed
 * and mail is configured, whether or not anything was found.
 */
export async function sendRoomAccessLink(input: {
  email: unknown;
  publicBaseUrl: string;
  now?: number;
}): Promise<SendRoomAccessResult> {
  const email = parseEmail(input.email);
  if (!email) {
    return { ok: false, status: 400, error: ROOM_ACCESS_INVALID_EMAIL_LINE };
  }
  if (!mailConfigured()) {
    return { ok: false, status: 503, error: ROOM_ACCESS_UNAVAILABLE_LINE };
  }

  const now = input.now ?? Date.now();
  const emailHash = hashEmail(email);
  const body: SendRoomAccessResponse = { line: ROOM_ACCESS_SENT_LINE };

  if (coolingDown(sentAtByEmail, emailHash, now)) {
    return { ok: true, body };
  }

  const rooms = (await roomsForEmail(email)).filter((room) => !coolingDown(sentAtByRoom, room.workspaceId, now));
  if (rooms.length === 0) {
    return { ok: true, body };
  }

  const issued = rooms.map((room) => issueLink(room, emailHash, now));
  const sent = await sendViaResend(
    email,
    emailBody(
      input.publicBaseUrl,
      issued.map((item) => item.token),
    ),
  );
  if (sent) {
    for (const item of issued) markSent(emailHash, item.row.workspaceId, now);
  }
  return { ok: true, body };
}

/* ---------------------------------- open ---------------------------------- */

export type OpenRoomAccessResult =
  | { ok: true; workspaceToken: string }
  | { ok: false; line: string };

/**
 * Spend a mailed token and return the room's own address. The mailed token is
 * not that address and is never returned.
 */
export function openRoomAccess(token: string, now = Date.now()): OpenRoomAccessResult {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length !== ACCESS_TOKEN_LENGTH) {
    return { ok: false, line: ROOM_ACCESS_SPENT_LINE };
  }

  const row = links.get(hashAccessToken(trimmed));
  if (!row || row.spentAt !== null || row.expiresAt <= now) {
    return { ok: false, line: ROOM_ACCESS_SPENT_LINE };
  }

  row.spentAt = now;
  links.set(row.tokenHash, row);
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
