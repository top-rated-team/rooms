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
  type RoomSessionOutcome,
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
import {
  SESSION_TICKET_PREFIX,
  isSessionTicketLine,
  putLinkedInTicket,
  sessionTicketFromLine,
  type LinkedInTicketFinish,
} from "./room-account";
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

/**
 * KEPT, AND NOW ONLY FOR A DEPLOYMENT WITH NOWHERE TO RETURN TO. It was the
 * line for "this address is not the one the app returns to", which both of our
 * houses now are — one app, both callbacks registered. It survives because a
 * deployment with no PUBLIC_BASE_URL and a host we do not own still has to say
 * something true, and because naming the other product inside a sign-in panel,
 * which the first version of this line did, is the mistake not to repeat.
 */
export const ROOM_LOGIN_LINKEDIN_ELSEWHERE_LINE =
  "LinkedIn sign-in is not one of the ways in on this address.";

/**
 * LinkedIn returns to ONE address — the redirect registered on the app, built
 * from PUBLIC_BASE_URL — so it can only be offered on that address.
 *
 * Offered anywhere else it looks like a working button and is not one: the
 * flow starts on the site the visitor is reading and finishes on the other
 * one, planting the session cookie on a domain they never asked about, and
 * since the state is now bound to the browser's cookie it fails outright.
 * A second deployment that wants LinkedIn wants its own app and its own
 * PUBLIC_BASE_URL, which is a fork's business, not a branch here.
 */
function bareHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Which address LinkedIn comes back to for the visitor who is leaving.
 *
 * ONE APP, SEVERAL HOUSE ADDRESSES. LinkedIn will only return to a URI
 * registered on the app, and the owner has registered this callback for both
 * of ours — so a visitor who starts on adgrant.ai finishes on adgrant.ai, with
 * their session cookie on the site they were actually reading, instead of
 * being handed to the other product half way through signing in.
 *
 * THE HOST IS NOT TAKEN ON TRUST. `isHouseHost` is an allow-list in
 * shared/operator.ts; anything not on it falls back to PUBLIC_BASE_URL. A
 * redirect_uri built from whatever Host header arrived is how an OAuth flow
 * ends up pointing at somebody else's server — and LinkedIn would reject it
 * anyway, which would be the second-best outcome rather than the first.
 */
export function linkedinRedirectBase(host: string, publicBaseUrl: string | null): string | null {
  if (host && isHouseHost(host)) return `https://${bareHost(host)}`;
  return publicBaseUrl;
}

/** True when a LinkedIn return can land back on the address being read. */
export function linkedinReturnsHere(host: string, publicBaseUrl: string | null): boolean {
  return linkedinRedirectBase(host, publicBaseUrl) !== null;
}

export const ROOM_LOGIN_WHATSAPP_WARNING =
  "Sending this puts a sign-in code in a WhatsApp chat. We use it to find rooms already bound to this chat. It is not a room address.";

export const ROOM_LOGIN_NONE_LINE = "No room is bound to this account.";

/**
 * THE STATE IS ALSO A COOKIE, and the callback refuses a return whose cookie
 * does not carry it.
 *
 * Without it the callback was a state-changing GET that anybody could aim at
 * anybody: an attacker finishes LinkedIn themselves, keeps the ticket the
 * callback hands back, and sends that address to somebody who is signed in.
 * Their browser attaches the attacker's LinkedIn identity to the victim's
 * account — SameSite=Lax sends the session cookie on a top-level navigation,
 * which is exactly what clicking a link is — and the attacker then signs in
 * with their own LinkedIn and lands in the victim's rooms, whose addresses
 * are themselves the credential.
 *
 * The cookie is written when the flow starts and read when it returns, so a
 * return can only be completed by the browser that began it.
 */
export const ROOM_LOGIN_STATE_COOKIE = "room_signin_state";
export const ROOM_LOGIN_STATE_MAX_AGE_MS = PENDING_MS;

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
  providerId: string;
  displayName: string | null;
}

const pendingLinkedIn = new Map<string, PendingLinkedIn>();
const pendingWhatsApp = new Map<string, PendingWhatsApp>();
const whatsappResults = new Map<string, WhatsAppLoginResult>();
const testTokens = new Map<string, string>();

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
  uninstallMatcher?.();
  uninstallMatcher = null;
}

export function registerRoomTokenForTests(workspaceId: string, token: string): void {
  testTokens.set(workspaceId, token);
}

export async function roomLoginAvailability(input: {
  host: string;
  probe?: () => Promise<WahaProbe>;
}): Promise<RoomLoginAvailability> {
  const publicUrl = configuredPublicBaseUrl();
  const here = linkedinReturnsHere(input.host, publicUrl);
  const linkedin =
    linkedinConfigured() && publicUrl && here
      ? { available: true as const }
      : {
          available: false as const,
          unavailableLine: !linkedinConfigured()
            ? ROOM_LOGIN_LINKEDIN_UNCONFIGURED_LINE
            : !publicUrl
              ? ROOM_ACCESS_NO_PUBLIC_URL_LINE
              : ROOM_LOGIN_LINKEDIN_ELSEWHERE_LINE,
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

export async function tokensForAccountRooms(ids: string[]): Promise<{ token: string }[]> {
  const tokens = await tokensFor(ids);
  const rooms: { token: string }[] = [];
  for (const id of ids) {
    const token = tokens.get(id);
    if (token) rooms.push({ token });
  }
  return rooms;
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

export type RoomLoginLinkedInStart =
  | { ok: true; url: string; state: string }
  | { ok: false; line: string };

export function startRoomLoginLinkedIn(host = ""): RoomLoginLinkedInStart {
  const creds = linkedinCredentials();
  const base = linkedinRedirectBase(host, configuredPublicBaseUrl());
  if (!creds) return { ok: false, line: ROOM_LOGIN_LINKEDIN_UNCONFIGURED_LINE };
  if (!base) return { ok: false, line: ROOM_ACCESS_NO_PUBLIC_URL_LINE };

  sweep();
  const state = nanoid(24);
  const redirectUri = roomLoginLinkedInRedirectUri(base);
  pendingLinkedIn.set(state, { redirectUri, createdAt: Date.now() });
  return {
    ok: true,
    state,
    url: linkedinAuthorizationUrl({ clientId: creds.clientId, redirectUri, state }),
  };
}

/* One shape. The callback no longer renders rooms itself — it hands back a
   ticket and the site opens the panel — so an `ok: true` arm here would be a
   branch nothing can reach and a page nobody would notice was wrong. */
export type RoomLoginLinkedInComplete = { ok: false; line: string };

function failFinish(
  outcome: Extract<
    RoomSessionOutcome,
    "missing-state" | "wrong-browser" | "missing-pending" | "linkedin-error" | "token-failed"
  >,
): LinkedInTicketFinish {
  return { ok: false, outcome };
}

/**
 * The real LinkedIn outcome, with a distinct reason for each of the five
 * ways the callback used to say "No room is bound to this LinkedIn account".
 */
export async function resolveRoomLoginLinkedIn(input: {
  code?: string;
  state?: string;
  error?: string;
  /** The value of ROOM_LOGIN_STATE_COOKIE on the browser that came back. */
  cookieState?: string;
  fetchImpl?: typeof fetch;
}): Promise<LinkedInTicketFinish> {
  sweep();
  const state = input.state?.trim();
  if (!state) return failFinish("missing-state");
  const pending = pendingLinkedIn.get(state);
  pendingLinkedIn.delete(state);
  if (!pending) return failFinish("missing-pending");
  /* The pending row is already gone, so a return that fails this check cannot
     be retried with a browser that would pass it. */
  if (input.cookieState?.trim() !== state) return failFinish("wrong-browser");
  if (input.error) return failFinish("linkedin-error");
  if (!input.code?.trim()) return failFinish("linkedin-error");

  const exchanged = await exchangeLinkedInCode({
    code: input.code.trim(),
    redirectUri: pending.redirectUri,
    fetchImpl: input.fetchImpl,
  });
  if (!exchanged.ok) return failFinish("token-failed");

  const providerId = `linkedin:${exchanged.member.sub}`;
  const bindings = await listBindingsByPerson("linkedin", providerId);
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

  return {
    ok: true,
    outcome: rooms.length === 0 ? "no-room" : "signed-in",
    rooms,
    identity: {
      provider: "linkedin",
      providerId,
      displayName: exchanged.member.displayName,
    },
  };
}

/**
 * What the existing callback route calls. Every outcome becomes a one-time
 * ticket so loginNonePage can send the visitor back to the site. Four of the
 * five old "no room" pages were failures of the sign-in itself.
 */
export async function completeRoomLoginLinkedIn(input: {
  code?: string;
  state?: string;
  error?: string;
  cookieState?: string;
  fetchImpl?: typeof fetch;
}): Promise<RoomLoginLinkedInComplete> {
  const finish = await resolveRoomLoginLinkedIn(input);
  const ticket = putLinkedInTicket(finish);
  return { ok: false, line: `${SESSION_TICKET_PREFIX}${ticket}` };
}

function redirectPage(href: string, line: string): string {
  const escapedHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta http-equiv="refresh" content="0;url=${escapedHref}">
<title>Coming back</title>
</head>
<body>
<p>${escaped}</p>
<p><a href="${escapedHref}">Back to the site</a></p>
</body></html>`;
}

export function loginNonePage(line: string): string {
  const ticket = sessionTicketFromLine(line);
  if (ticket) {
    return redirectPage(`/api/session/linkedin?ticket=${encodeURIComponent(ticket)}`, "Coming back to the site.");
  }
  if (isSessionTicketLine(line)) {
    return redirectPage("/", "Coming back to the site.");
  }
  return redirectPage(line.startsWith("/") ? line : "/", line);
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

  const providerId = whatsappProviderId(message.chatId);
  const bindings = await listBindingsByPerson("whatsapp", providerId);
  const rooms = await roomsFromBindings(bindings);
  whatsappResults.set(code, {
    createdAt: Date.now(),
    rooms,
    providerId,
    displayName: message.sender.attendeeName,
  });
}

/**
 * SPEND the confirmed code. It is spent, not read, because what it buys is a
 * ten-year session: a code that survives being used is a code that can be
 * used again by anybody who has seen it, and this one has been on the
 * visitor's screen, inside a QR and inside a WhatsApp chat.
 *
 * The poll that watches for confirmation does not come through here, so it
 * can keep being polled until the browser claims.
 */
export function takeWhatsAppLoginResult(
  codeRaw: string,
  now = Date.now(),
): { providerId: string; displayName: string | null; rooms: { token: string }[] } | null {
  sweep(now);
  const code = codeRaw.trim().toUpperCase();
  if (!code) return null;
  const result = whatsappResults.get(code);
  if (!result) return null;
  whatsappResults.delete(code);
  return { providerId: result.providerId, displayName: result.displayName, rooms: result.rooms };
}

function onLoginMessage(message: AcceptedInboundMessage): void {
  void proveRoomLoginWhatsApp(message);
}

let uninstallMatcher: (() => void) | null = null;

export function installRoomLoginInbound(): void {
  if (uninstallMatcher) return;
  uninstallMatcher = registerInboundMatcher(onLoginMessage);
}
