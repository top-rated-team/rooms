/**
 * LOGIN: given this person, which rooms are theirs.
 *
 * identity-store can only answer getBinding(workspaceId) — a forward lookup.
 * This file is the reverse index over the same hashed identifiers those
 * bindings already store. Nothing new and personal is written: a LinkedIn
 * `sub` and the peppered WhatsApp chat hash are already what identity keeps.
 *
 * WhatsApp is house-only. WHATSAPP_URL is the owner's personal mobile and
 * this repository is public; a fork must not be offered that number. That
 * decision lives in HOUSE_HOSTS / isHouseHost, which a fork cannot reach around.
 */

import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";
import { customAlphabet, nanoid } from "nanoid";
import {
  type RoomLoginAvailability,
  type RoomLoginWhatsAppConfirmed,
  type RoomLoginWhatsAppOffer,
} from "@shared/api";
import { isHouseHost } from "@shared/operator";
import { workspaces } from "@shared/schema";
import { getDb, hasDb } from "./db";
import {
  exchangeLinkedInCode,
  linkedinAuthorizationUrl,
  linkedinConfigured,
  linkedinCredentials,
} from "./identity";
import { listBindingsByPerson, type StoredBinding } from "./identity-store";
import {
  bindRoomAddress,
  configuredPublicBaseUrl,
  ROOM_ACCESS_NO_PUBLIC_URL_LINE,
  roomAccessAvailability,
} from "./room-access";
import { registerInboundMatcher, type AcceptedInboundMessage } from "./unipile/inbound";
import { probeWaha, qrSvg, waMeUrl, type WahaProbe } from "./waha";

const PENDING_MS = 15 * 60_000;
const LOGIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LOGIN_CODE_LENGTH = 12;
const mintLoginCode = customAlphabet(LOGIN_CODE_ALPHABET, LOGIN_CODE_LENGTH);

/** Shared by the inbound matcher and the test. Do not copy this pattern. */
export const LOGIN_CODE_RE = new RegExp(
  `\\bRoom-login ([${LOGIN_CODE_ALPHABET}]{${LOGIN_CODE_LENGTH}})\\b`,
);

export const ROOM_LOGIN_LINKEDIN_UNCONFIGURED_LINE =
  "LinkedIn sign-in is not configured on this deployment.";

export const ROOM_LOGIN_WHATSAPP_WARNING =
  "Sending this puts a login code in a WhatsApp chat. We use it to find rooms already bound to this chat. It is not a room address.";

export const ROOM_LOGIN_NONE_LINE = "No room is bound to this account.";

export function roomLoginLinkedInRedirectUri(publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/api/room-login/linkedin/callback`;
}

function loginMessage(code: string): string {
  return `Room-login ${code}`;
}

export function extractLoginCode(text: string): string | null {
  const match = LOGIN_CODE_RE.exec(text);
  return match?.[1] ?? null;
}

/**
 * Same formula identity.ts uses for a WhatsApp providerId: sha256(pepper ‖ 0x00 ‖ chatId).
 * Reads ROOM_HASH_PEPPER at call time so a test can set it. Without the pepper
 * the hash will not match a binding written by identity.ts after a restart.
 */
export function whatsappProviderId(chatId: string): string {
  const configured = process.env.ROOM_HASH_PEPPER?.trim();
  const pepper = configured ? Buffer.from(configured, "utf8") : Buffer.alloc(0);
  const hash = createHash("sha256").update(pepper).update("\0").update(chatId).digest("hex");
  return `whatsapp:${hash}`;
}

interface PendingLinkedIn {
  redirectUri: string;
  createdAt: number;
}

interface PendingWhatsApp {
  code: string;
  createdAt: number;
}

interface WhatsAppLoginResult {
  createdAt: number;
  rooms: { token: string }[];
}

const pendingLinkedIn = new Map<string, PendingLinkedIn>();
const pendingWhatsApp = new Map<string, PendingWhatsApp>();
const whatsappResults = new Map<string, WhatsAppLoginResult>();
const testTokens = new Map<string, string>();
let matcherInstalled = false;

function sweep(now = Date.now()): void {
  for (const [state, row] of pendingLinkedIn) {
    if (now - row.createdAt > PENDING_MS) pendingLinkedIn.delete(state);
  }
  for (const [code, row] of pendingWhatsApp) {
    if (now - row.createdAt > PENDING_MS) pendingWhatsApp.delete(code);
  }
  for (const [code, row] of whatsappResults) {
    if (now - row.createdAt > PENDING_MS) whatsappResults.delete(code);
  }
}

export function resetRoomLoginForTests(): void {
  pendingLinkedIn.clear();
  pendingWhatsApp.clear();
  whatsappResults.clear();
  testTokens.clear();
}

export function registerRoomTokenForTests(workspaceId: string, token: string): void {
  testTokens.set(workspaceId, token);
}

export async function roomLoginAvailability(input: {
  host: string;
  probe?: () => Promise<WahaProbe>;
}): Promise<RoomLoginAvailability> {
  const publicUrl = configuredPublicBaseUrl();
  const linkedin =
    linkedinConfigured() && publicUrl
      ? { available: true as const }
      : {
          available: false as const,
          unavailableLine: linkedinConfigured()
            ? ROOM_ACCESS_NO_PUBLIC_URL_LINE
            : ROOM_LOGIN_LINKEDIN_UNCONFIGURED_LINE,
        };

  const house = isHouseHost(input.host);
  let whatsapp: RoomLoginAvailability["whatsapp"] = { available: false };
  if (house) {
    const probe = await (input.probe ?? probeWaha)();
    if (probe.ok) whatsapp = { available: true };
  }

  return {
    linkedin,
    whatsapp,
    email: roomAccessAvailability(),
  };
}

async function tokensFor(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const id of ids) {
    const test = testTokens.get(id);
    if (test) result.set(id, test);
  }
  if (ids.length === 0 || !hasDb()) return result;
  const db = getDb();
  if (!db) return result;
  try {
    const rows = await db
      .select({ id: workspaces.id, token: workspaces.token })
      .from(workspaces)
      .where(inArray(workspaces.id, ids));
    for (const row of rows) result.set(row.id, row.token);
  } catch (error) {
    console.error(
      "[room-login] could not read room addresses for a login.",
      error instanceof Error ? error.message : error,
    );
  }
  return result;
}

async function roomsFromBindings(rows: StoredBinding[]): Promise<{ token: string }[]> {
  const tokens = await tokensFor(rows.map((row) => row.workspaceId));
  const rooms: { token: string }[] = [];
  for (const row of rows) {
    const token = tokens.get(row.workspaceId);
    if (token) rooms.push({ token });
  }
  return rooms;
}

export type RoomLoginLinkedInStart = { ok: true; url: string } | { ok: false; line: string };

export function startRoomLoginLinkedIn(): RoomLoginLinkedInStart {
  const creds = linkedinCredentials();
  const publicBaseUrl = configuredPublicBaseUrl();
  if (!creds) return { ok: false, line: ROOM_LOGIN_LINKEDIN_UNCONFIGURED_LINE };
  if (!publicBaseUrl) return { ok: false, line: ROOM_ACCESS_NO_PUBLIC_URL_LINE };

  sweep();
  const state = nanoid(24);
  const redirectUri = roomLoginLinkedInRedirectUri(publicBaseUrl);
  pendingLinkedIn.set(state, { redirectUri, createdAt: Date.now() });
  return {
    ok: true,
    url: linkedinAuthorizationUrl({ clientId: creds.clientId, redirectUri, state }),
  };
}

export type RoomLoginLinkedInComplete =
  | { ok: true; rooms: { token: string }[] }
  | { ok: false; line: string };

export async function completeRoomLoginLinkedIn(input: {
  code?: string;
  state?: string;
  error?: string;
  fetchImpl?: typeof fetch;
}): Promise<RoomLoginLinkedInComplete> {
  sweep();
  const state = input.state?.trim();
  if (!state) return { ok: false, line: ROOM_LOGIN_NONE_LINE };
  const pending = pendingLinkedIn.get(state);
  pendingLinkedIn.delete(state);
  if (!pending) return { ok: false, line: ROOM_LOGIN_NONE_LINE };
  if (input.error || !input.code?.trim()) return { ok: false, line: ROOM_LOGIN_NONE_LINE };

  const exchanged = await exchangeLinkedInCode({
    code: input.code.trim(),
    redirectUri: pending.redirectUri,
    fetchImpl: input.fetchImpl,
  });
  if (!exchanged.ok) return { ok: false, line: ROOM_LOGIN_NONE_LINE };

  const bindings = await listBindingsByPerson("linkedin", `linkedin:${exchanged.member.sub}`);
  const tokens = await tokensFor(bindings.map((row) => row.workspaceId));
  const rooms: { token: string }[] = [];
  for (const row of bindings) {
    const token = tokens.get(row.workspaceId);
    if (!token) continue;
    rooms.push({ token });
    if (exchanged.member.email) {
      await bindRoomAddress({
        workspaceId: row.workspaceId,
        workspaceToken: token,
        email: exchanged.member.email,
      });
    }
  }

  return { ok: true, rooms };
}

export function loginNonePage(line: string): string {
  const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>No room</title>
</head>
<body>
<p>${escaped}</p>
<p><a href="/">Back to the site</a></p>
</body></html>`;
}

export function loginPickerPage(rooms: { token: string }[]): string {
  const items = rooms
    .map(
      (room, index) =>
        `<li><a href="/w/${encodeURIComponent(room.token)}">Open room ${index + 1}</a></li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Your rooms</title>
</head>
<body>
<p>These rooms are bound to this LinkedIn account.</p>
<ul>${items}</ul>
<p><a href="/">Back to the site</a></p>
</body></html>`;
}

export type RoomLoginWhatsAppStart =
  | { ok: true; offer: RoomLoginWhatsAppOffer }
  | { ok: false; line: string };

export async function startRoomLoginWhatsApp(input: {
  host: string;
  probe?: () => Promise<WahaProbe>;
}): Promise<RoomLoginWhatsAppStart> {
  const availability = await roomLoginAvailability({ host: input.host, probe: input.probe });
  if (!availability.whatsapp.available) {
    return { ok: false, line: "WhatsApp is not a way into a room from this page." };
  }
  const probe = await (input.probe ?? probeWaha)();
  if (!probe.ok) return { ok: false, line: probe.line };

  sweep();
  const code = mintLoginCode();
  pendingWhatsApp.set(code, { code, createdAt: Date.now() });
  const url = waMeUrl(probe.digits, loginMessage(code));
  return {
    ok: true,
    offer: {
      url,
      qrSvg: qrSvg(url),
      warning: ROOM_LOGIN_WHATSAPP_WARNING,
      code,
    },
  };
}

export function getRoomLoginWhatsAppConfirmed(codeRaw: string, now = Date.now()): RoomLoginWhatsAppConfirmed {
  sweep(now);
  const code = codeRaw.trim().toUpperCase();
  if (!code) return { confirmed: false };
  const result = whatsappResults.get(code);
  if (result) return { confirmed: true, rooms: result.rooms };
  const pending = pendingWhatsApp.get(code);
  if (!pending) return { confirmed: false, expired: true };
  if (now - pending.createdAt > PENDING_MS) return { confirmed: false, expired: true };
  return { confirmed: false };
}

export async function proveRoomLoginWhatsApp(message: AcceptedInboundMessage): Promise<void> {
  const code = extractLoginCode(message.message);
  if (!code) return;
  sweep();
  const pending = pendingWhatsApp.get(code);
  if (!pending) return;
  pendingWhatsApp.delete(code);

  const bindings = await listBindingsByPerson("whatsapp", whatsappProviderId(message.chatId));
  const rooms = await roomsFromBindings(bindings);
  whatsappResults.set(code, { createdAt: Date.now(), rooms });
}

function onLoginMessage(message: AcceptedInboundMessage): void {
  void proveRoomLoginWhatsApp(message);
}

export function installRoomLoginInbound(): void {
  if (matcherInstalled) return;
  matcherInstalled = true;
  registerInboundMatcher(onLoginMessage);
}
