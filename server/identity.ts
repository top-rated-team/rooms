/**
 * Three levels of access to the agents, and the two ways a visitor can bind a
 * room to themselves once the room holds something of theirs.
 *
 *   1. Anonymous — a bounded allowance, nobody signed in. The room works.
 *   2. Signed in — more of that allowance. Binding is how they get here.
 *   3. They paste a link to something of their own — the only level that asks.
 *      The ask is for confidentiality: from that point the room contains their
 *      account, their site, their numbers. What is offered is a convenience,
 *      not a gate. They can leave the room unbound and it keeps the anonymous
 *      allowance.
 *
 * Two routes, and neither is allowed to be the only one:
 *
 *   - LinkedIn, through the official Sign In with LinkedIn (OpenID Connect)
 *     authorization screen. Nothing scraped, nothing session-based.
 *   - WhatsApp, through Unipile on our own number only: a wa.me link or a QR
 *     of that link opens WhatsApp with a pre-filled message carrying this
 *     room's address, sent to us. The visitor still taps a wa.me link. We
 *     do not connect their WhatsApp.
 *
 * WHAT IS STORED. The minimum that answers "is this the same person": an
 * opaque provider id and the display name they chose to give. The LinkedIn
 * access token is used once to read those two fields and then dropped. A
 * WhatsApp phone number is hashed before anything keeps it, and is never
 * logged. Failed or abandoned identification writes nothing. A number typed
 * by hand is a note, stored apart from a binding, and is not a proof.
 *
 * THE ADDRESS STAYS A BEARER CREDENTIAL. Binding adds a second fact about the
 * room. It does not start asking for a password, and it does not stop the
 * link from opening the room. robots.txt, noindex and the sitemap already
 * treat /w/ as a credential; this file does not undo that.
 *
 * WHERE THIS LIVES. server/identity-store.ts. In memory when there is no
 * database; in room_bindings when there is one and the table exists. The
 * first binding on a room is its owner.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { customAlphabet, nanoid } from "nanoid";
import type { RoomAccessLevel, RoomBindingState, RoomClaimState } from "@shared/api";
import { storage } from "./storage";
import { MAX_TURNS_PER_HOUR, monthlyBudgetUsd } from "./spend";
import {
  getBinding,
  getWhatsappNote,
  hydrateIdentityStore,
  putBinding,
  putWhatsappNote,
  resetIdentityStoreForTests,
  type StoredBinding,
} from "./identity-store";
export { hydrateIdentityStore };
import {
  registerInboundMatcher,
  type AcceptedInboundMessage,
} from "./unipile/inbound";
import {
  WAHA_UNAVAILABLE_LINE,
  probeWaha,
  qrSvg,
  waMeUrl,
  type WahaProbe,
} from "./waha";

const PENDING_MS = 15 * 60_000;

/** Same bound an unbound room already has in server/spend.ts. */
export const ANONYMOUS_TURNS_PER_HOUR = MAX_TURNS_PER_HOUR;
/** Signed-in rooms are allowed more. Spend has to read this; see the handoff. */
export const SIGNED_IN_TURNS_PER_HOUR = MAX_TURNS_PER_HOUR * 3;
export const SIGNED_IN_BUDGET_MULTIPLIER = 3;

export const LINKEDIN_UNCONFIGURED_LINE =
  "LinkedIn sign-in is not configured on this deployment, so WhatsApp is the way to bind this room.";

export const WHATSAPP_CHAT_WARNING =
  "Sending this puts the room address in a WhatsApp chat log. Anyone who can read that chat can open the room.";

const LINKEDIN_AUTH = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO = "https://api.linkedin.com/v2/userinfo";
/*
 * `email` is the third permission LinkedIn's own page names: "Required to
 * retrieve the member's email address." It only works once Sign In with
 * LinkedIn using OpenID Connect is provisioned on the app in LinkedIn's
 * developer portal. Even then, LinkedIn documents `email` and
 * `email_verified` as optional fields that may be absent from any response.
 * Room binding still stores only `sub` and a name. Booking reads the address
 * when it is there, and treats its absence as a booking with no address.
 */
export const LINKEDIN_SCOPE = "openid profile email";
const MEMBER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OWN_MATERIAL_MIN_LENGTH = 200;
const URL_PATTERN = /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S+/i;
const CODE_PATTERNS: RegExp[] = [
  /```/,
  /<\/?[a-z][^>]*>/i,
  /=>|\bfunction\s*[\w$]*\s*\(/,
  /\{\s*"[^"]*"\s*:/,
  /^\s*(?:curl|GET|POST|PUT)\b/m,
];

/*
 * THE BIND CODE, and the alphabet is the whole of the fix.
 *
 * This was `nanoid(16)` matched against /Room-bind ([0-9A-Za-z]{16})/. nanoid's
 * default alphabet includes `-` and `_`, so roughly two in five codes contained
 * a character the pattern rejected — and the failure was silent on both sides:
 * the visitor sent the message, the webhook found no match, and the room simply
 * never bound. The parcel's own test caught it 40% of the time, which is worse
 * than never: a test that fails two runs in five gets deleted rather than read.
 *
 * So the code is generated from an alphabet that has no `-`, no `_`, and none
 * of I, O, 0 or 1 — because this string travels through a chat app and a person
 * may retype it, and a code that cannot be dictated over the phone is a code
 * that generates support messages. 32^12 is about 2^60, which is more than
 * enough for something that expires in minutes.
 *
 * The generator and the pattern are declared next to each other on purpose:
 * they are one decision, and separating them is how they drifted apart.
 */
const BIND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BIND_CODE_LENGTH = 12;
const bindCode = customAlphabet(BIND_CODE_ALPHABET, BIND_CODE_LENGTH);
/** Exported so the test reads the pattern the webhook uses, never a copy of it. */
export const BIND_CODE_RE = new RegExp(`\\bRoom-bind ([${BIND_CODE_ALPHABET}]{${BIND_CODE_LENGTH}})\\b`);

/**
 * Pepper, so a stored WhatsApp id is not a reversible phone number.
 *
 * It used to be `randomBytes(32)` per process, which was right while bindings
 * lived in a Map and died with the process. They are a table now, so the same
 * chat hashes to a different value after every restart. Nothing reads it back
 * today — no query filters on providerId — but `room_bindings` carries an index
 * on (provider, providerId), and the first person to write "which other rooms
 * does this person own" would get a query that works for LinkedIn, whose `sub`
 * is stable, and silently misses every WhatsApp row.
 *
 * So: set ROOM_HASH_PEPPER and the value is durable. Leave it unset and the
 * per-process fallback stands, which is safe but not comparable across a
 * restart — and the boot log says so rather than leaving it to be discovered.
 */
const HASH_PEPPER = (() => {
  const configured = process.env.ROOM_HASH_PEPPER?.trim();
  if (configured) return Buffer.from(configured, "utf8");
  console.log(
    "[identity] no ROOM_HASH_PEPPER — WhatsApp identifiers are per-process and do not compare across a restart",
  );
  return randomBytes(32);
})();

/* --------------------------------- records -------------------------------- */

interface PendingLinkedIn {
  workspaceId: string;
  token: string;
  redirectUri: string;
  createdAt: number;
}

interface PendingWhatsApp {
  workspaceId: string;
  token: string;
  nonce: string;
  createdAt: number;
}

const pendingLinkedIn = new Map<string, PendingLinkedIn>();
const pendingWhatsApp = new Map<string, PendingWhatsApp>();
const pendingWhatsAppByNonce = new Map<string, string>();
let inboundMatcherInstalled = false;
let uninstallInbound: (() => void) | null = null;

export function resetIdentityForTests(): void {
  resetIdentityStoreForTests();
  pendingLinkedIn.clear();
  pendingWhatsApp.clear();
  pendingWhatsAppByNonce.clear();
  uninstallInbound?.();
  uninstallInbound = null;
  inboundMatcherInstalled = false;
}

/** Test seam: the stored row, so cases can assert what is NOT on it. */
export function storedBindingForTests(workspaceId: string): StoredBinding | undefined {
  return getBinding(workspaceId);
}

/* -------------------------------- allowance ------------------------------- */

export function accessLevelFor(workspaceId: string): RoomAccessLevel {
  return getBinding(workspaceId) ? "signed-in" : "anonymous";
}

export function turnsPerHourFor(level: RoomAccessLevel): number {
  return level === "signed-in" ? SIGNED_IN_TURNS_PER_HOUR : ANONYMOUS_TURNS_PER_HOUR;
}

export function monthlyBudgetUsdFor(level: RoomAccessLevel): number {
  const base = monthlyBudgetUsd();
  return level === "signed-in" ? base * SIGNED_IN_BUDGET_MULTIPLIER : base;
}

/**
 * An unbound room keeps the anonymous allowance. Identifying is not a gate:
 * a room that was never bound, or whose identification failed, still works.
 */
export function allowanceForWorkspace(workspaceId: string): {
  level: RoomAccessLevel;
  turnsPerHour: number;
  monthlyBudgetUsd: number;
} {
  const level = accessLevelFor(workspaceId);
  return {
    level,
    turnsPerHour: turnsPerHourFor(level),
    monthlyBudgetUsd: monthlyBudgetUsdFor(level),
  };
}

/* ---------------------------- own-material detector --------------------------- */

/**
 * The same judgment the door panel uses to decide that a message carries
 * something of theirs rather than only a question. Kept here so the room can
 * ask at the moment the door would have promoted, without importing the panel.
 */
export function looksLikeOwnMaterial(text: string): boolean {
  if (text.length >= OWN_MATERIAL_MIN_LENGTH) return true;
  if (URL_PATTERN.test(text)) return true;
  return CODE_PATTERNS.some((pattern) => pattern.test(text));
}

function visitorPastedOwnMaterial(bodies: string[]): boolean {
  return bodies.some((body) => looksLikeOwnMaterial(body));
}

/* --------------------------------- LinkedIn -------------------------------- */

function linkedinClientId(): string | null {
  const raw = process.env.LINKEDIN_CLIENT_ID?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function linkedinClientSecret(): string | null {
  const raw = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function linkedinConfigured(): boolean {
  return Boolean(linkedinClientId() && linkedinClientSecret());
}

/** Client id and secret together, or nothing. Never logged. */
export function linkedinCredentials(): { clientId: string; secret: string } | null {
  const clientId = linkedinClientId();
  const secret = linkedinClientSecret();
  if (!clientId || !secret) return null;
  return { clientId, secret };
}

function sweepPending(now: number = Date.now()): void {
  for (const [state, row] of pendingLinkedIn) {
    if (now - row.createdAt > PENDING_MS) pendingLinkedIn.delete(state);
  }
  for (const [workspaceId, row] of pendingWhatsApp) {
    if (now - row.createdAt > PENDING_MS) {
      pendingWhatsApp.delete(workspaceId);
      pendingWhatsAppByNonce.delete(row.nonce);
    }
  }
}

export function linkedinRedirectUri(publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/api/identity/linkedin/callback`;
}

/** Second redirect URI. A booking is not a room, so it cannot share the room callback. */
export function bookingLinkedInRedirectUri(publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/api/booking/linkedin/callback`;
}

export function linkedinAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(LINKEDIN_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", LINKEDIN_SCOPE);
  return url.toString();
}

export interface LinkedInStart {
  ok: true;
  url: string;
}

export interface LinkedInStartFail {
  ok: false;
  line: string;
}

/**
 * Builds LinkedIn's own authorization URL. The room token travels in `state`,
 * which we minted, not in LinkedIn's registered redirect URI. Nothing is bound
 * yet: a visitor who closes the consent screen leaves the room as it was.
 */
export function startLinkedIn(input: {
  workspaceId: string;
  token: string;
  publicBaseUrl: string;
}): LinkedInStart | LinkedInStartFail {
  const clientId = linkedinClientId();
  if (!clientId || !linkedinClientSecret()) {
    return { ok: false, line: LINKEDIN_UNCONFIGURED_LINE };
  }
  sweepPending();
  const state = nanoid(24);
  const redirectUri = linkedinRedirectUri(input.publicBaseUrl);
  pendingLinkedIn.set(state, {
    workspaceId: input.workspaceId,
    token: input.token,
    redirectUri,
    createdAt: Date.now(),
  });
  return {
    ok: true,
    url: linkedinAuthorizationUrl({ clientId, redirectUri, state }),
  };
}

export interface LinkedInComplete {
  /** The room token, when we still know which room this was for. */
  token: string | null;
  bound: boolean;
}

interface UserInfo {
  sub?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  email?: unknown;
  email_verified?: unknown;
  profile?: unknown;
  picture?: unknown;
}

export interface LinkedInMember {
  sub: string;
  displayName: string | null;
  /** Null when LinkedIn omitted the optional email claim, or it was not an address. */
  email: string | null;
  /**
   * A LinkedIn profile page URL when userinfo actually carried one. Null when
   * it did not. Never built from a name, from `sub`, or from `picture`.
   */
  profileUrl: string | null;
}

function displayNameFromUserInfo(info: UserInfo): string | null {
  if (typeof info.name === "string" && info.name.trim()) return info.name.trim();
  const given = typeof info.given_name === "string" ? info.given_name.trim() : "";
  const family = typeof info.family_name === "string" ? info.family_name.trim() : "";
  const joined = `${given} ${family}`.trim();
  return joined.length > 0 ? joined : null;
}

function emailFromUserInfo(info: UserInfo): string | null {
  if (typeof info.email !== "string") return null;
  const email = info.email.trim();
  if (!email || !MEMBER_EMAIL_RE.test(email)) return null;
  return email;
}

function profileUrlFromUserInfo(info: UserInfo): string | null {
  if (typeof info.profile !== "string") return null;
  const raw = info.profile.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "linkedin.com") return null;
    if (!url.pathname.startsWith("/in/") && !url.pathname.startsWith("/pub/")) return null;
    if (url.pathname === "/in/" || url.pathname === "/in" || url.pathname === "/pub/" || url.pathname === "/pub") {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * Reads the member off LinkedIn's userinfo body. `sub` is required. Name,
 * email and profile URL are each optional and independent — a missing email
 * is not a failed sign-in.
 */
export function memberFromUserInfo(info: unknown): LinkedInMember | null {
  if (info === null || typeof info !== "object") return null;
  const record = info as UserInfo;
  const sub = typeof record.sub === "string" ? record.sub.trim() : "";
  if (!sub) return null;
  return {
    sub,
    displayName: displayNameFromUserInfo(record),
    email: emailFromUserInfo(record),
    profileUrl: profileUrlFromUserInfo(record),
  };
}

/**
 * Exchanges the authorization code and reads userinfo. The access token is a
 * local variable and is dropped before this returns. Does not write a room
 * binding — callers that are a booking must not, and room binding is
 * completeLinkedIn's job.
 */
export async function exchangeLinkedInCode(input: {
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; member: LinkedInMember } | { ok: false }> {
  const creds = linkedinCredentials();
  if (!creds) return { ok: false };
  const fetchImpl = input.fetchImpl ?? fetch;
  let accessToken: string | null = null;
  try {
    const tokenRes = await fetchImpl(LINKEDIN_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code.trim(),
        client_id: creds.clientId,
        client_secret: creds.secret,
        redirect_uri: input.redirectUri,
      }),
    });
    if (!tokenRes.ok) return { ok: false };
    const tokenBody = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
      return { ok: false };
    }
    accessToken = tokenBody.access_token;

    const infoRes = await fetchImpl(LINKEDIN_USERINFO, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    accessToken = null;
    if (!infoRes.ok) return { ok: false };
    const member = memberFromUserInfo(await infoRes.json());
    if (!member) return { ok: false };
    return { ok: true, member };
  } catch {
    accessToken = null;
    return { ok: false };
  }
}

function dropPendingLinkedIn(state: string): PendingLinkedIn | undefined {
  const pending = pendingLinkedIn.get(state);
  pendingLinkedIn.delete(state);
  return pending;
}

/**
 * Finishes Sign In with LinkedIn. The access token is a local variable and is
 * not written anywhere. Any failure — denied consent, a dead token endpoint,
 * userinfo without a name — drops the pending row and leaves the room unbound.
 */
export async function completeLinkedIn(input: {
  code?: string;
  state?: string;
  error?: string;
  fetchImpl?: typeof fetch;
}): Promise<LinkedInComplete> {
  sweepPending();
  const state = input.state?.trim();
  if (!state) return { token: null, bound: false };

  const pending = dropPendingLinkedIn(state);
  if (!pending) return { token: null, bound: false };
  if (input.error || !input.code?.trim()) return { token: pending.token, bound: false };

  const exchanged = await exchangeLinkedInCode({
    code: input.code.trim(),
    redirectUri: pending.redirectUri,
    fetchImpl: input.fetchImpl,
  });
  if (!exchanged.ok || !exchanged.member.displayName) {
    return { token: pending.token, bound: false };
  }

  await putBinding({
    workspaceId: pending.workspaceId,
    provider: "linkedin",
    providerId: `linkedin:${exchanged.member.sub}`,
    displayName: exchanged.member.displayName,
    boundAt: new Date().toISOString(),
  });
  return { token: pending.token, bound: true };
}

/* --------------------------------- WhatsApp -------------------------------- */

export interface WhatsAppOffer {
  url: string;
  qrSvg: string | null;
  warning: string;
}

export interface WhatsAppStartFail {
  ok: false;
  line: string;
}

export type WhatsAppStart = { ok: true; offer: WhatsAppOffer } | WhatsAppStartFail;

function bindMessage(roomUrl: string, nonce: string): string {
  return `This is the address of my room: ${roomUrl}\n\nRoom-bind ${nonce}`;
}

function opaqueWhatsAppId(chatId: string): string {
  return createHash("sha256").update(HASH_PEPPER).update("\0").update(chatId).digest("hex");
}

/**
 * Mints a one-time code and a wa.me URL. The room is not bound until that
 * message actually arrives. Closing the tab, never sending, or sending
 * something else leaves the room as it was.
 */
export async function startWhatsApp(input: {
  workspaceId: string;
  token: string;
  roomUrl: string;
  probe?: () => Promise<WahaProbe>;
}): Promise<WhatsAppStart> {
  sweepPending();
  const probe = input.probe ?? probeWaha;
  const status = await probe();
  if (!status.ok) return { ok: false, line: status.line };

  const existing = pendingWhatsApp.get(input.workspaceId);
  if (existing) {
    pendingWhatsAppByNonce.delete(existing.nonce);
    pendingWhatsApp.delete(input.workspaceId);
  }

  const nonce = bindCode();
  pendingWhatsApp.set(input.workspaceId, {
    workspaceId: input.workspaceId,
    token: input.token,
    nonce,
    createdAt: Date.now(),
  });
  pendingWhatsAppByNonce.set(nonce, input.workspaceId);

  const text = bindMessage(input.roomUrl, nonce);
  const url = waMeUrl(status.digits, text);
  return {
    ok: true,
    offer: {
      url,
      qrSvg: qrSvg(url),
      warning: WHATSAPP_CHAT_WARNING,
    },
  };
}

interface InboundFields {
  chatId: string;
  pushName: string;
  body: string;
}

/**
 * Pulls the three fields we are allowed to look at off a WAHA webhook body
 * and drops the rest, so a phone number cannot linger on a closed-over object
 * and cannot reach a log line.
 */
export function extractWhatsAppInbound(raw: unknown): InboundFields | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const payload =
    root.payload !== null && typeof root.payload === "object"
      ? (root.payload as Record<string, unknown>)
      : root;
  const from = payload.from;
  if (typeof from !== "string" || !from.trim()) return null;
  const body = payload.body ?? payload.text;
  if (typeof body !== "string") return null;
  const push =
    (typeof payload.pushName === "string" && payload.pushName.trim()) ||
    (payload._data !== null &&
      typeof payload._data === "object" &&
      typeof (payload._data as { notifyName?: unknown }).notifyName === "string" &&
      (payload._data as { notifyName: string }).notifyName.trim()) ||
    "";
  return { chatId: from.trim(), pushName: push, body };
}

function webhookSecretOk(provided: string | undefined): boolean {
  const expected = process.env.WAHA_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type WhatsAppInboundResult =
  | { accepted: true; bound: boolean }
  | { accepted: false; reason: "unauthorized" };

async function bindFromWhatsAppFields(fields: InboundFields): Promise<boolean> {
  sweepPending();
  const match = BIND_CODE_RE.exec(fields.body);
  if (!match) return false;
  const nonce = match[1];
  const workspaceId = pendingWhatsAppByNonce.get(nonce);
  if (!workspaceId) return false;
  const pending = pendingWhatsApp.get(workspaceId);
  pendingWhatsApp.delete(workspaceId);
  pendingWhatsAppByNonce.delete(nonce);
  if (!pending || pending.nonce !== nonce) return false;
  const displayName = fields.pushName.trim();
  if (!displayName) return false;

  await putBinding({
    workspaceId,
    provider: "whatsapp",
    providerId: `whatsapp:${opaqueWhatsAppId(fields.chatId)}`,
    displayName,
    boundAt: new Date().toISOString(),
  });
  return true;
}

/**
 * A message arrived at our number. If it carries a live bind code AND a
 * display name the sender chose, the matching room is bound. Otherwise the
 * room is left exactly as it was. The chat id is hashed; the raw payload is
 * not logged.
 *
 * Kept for the WAHA-shaped webhook that is still registered. Unipile inbound
 * goes through installIdentityInbound() and hashes Unipile's chat_id the same way.
 */
export async function acceptWhatsAppInbound(
  raw: unknown,
  webhookSecret: string | undefined,
): Promise<WhatsAppInboundResult> {
  if (!webhookSecretOk(webhookSecret)) return { accepted: false, reason: "unauthorized" };
  const fields = extractWhatsAppInbound(raw);
  if (!fields) return { accepted: true, bound: false };
  const bound = await bindFromWhatsAppFields(fields);
  return { accepted: true, bound };
}

function onUnipileIdentityMessage(message: AcceptedInboundMessage): void {
  const pushName = message.sender.attendeeName?.trim() ?? "";
  void bindFromWhatsAppFields({
    chatId: message.chatId,
    pushName,
    body: message.message,
  });
}

/** Register once with Unipile's inbound dispatcher. Idempotent. */
export function installIdentityInbound(): void {
  if (inboundMatcherInstalled) return;
  inboundMatcherInstalled = true;
  uninstallInbound = registerInboundMatcher(onUnipileIdentityMessage);
}

export async function saveWhatsAppNote(workspaceId: string, number: string): Promise<RoomClaimState> {
  await hydrateIdentityStore();
  const trimmed = number.trim();
  if (trimmed) {
    await putWhatsappNote({
      workspaceId,
      number: trimmed,
      addedAt: new Date().toISOString(),
    });
  }
  return claimStateForWorkspace(workspaceId);
}

export async function claimStateForToken(token: string): Promise<RoomClaimState | null> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;
  await hydrateIdentityStore();
  return claimStateForWorkspace(state.workspace.id);
}

export function claimStateForWorkspace(workspaceId: string): RoomClaimState {
  const stored = getBinding(workspaceId);
  const note = getWhatsappNote(workspaceId);
  if (!stored) {
    return {
      bound: false,
      canRename: false,
      owner: null,
      whatsappNote: note?.number ?? null,
    };
  }
  return {
    bound: true,
    canRename: true,
    owner: { provider: stored.provider, displayName: stored.displayName },
    whatsappNote: note?.number ?? null,
  };
}

/* --------------------------------- the offer -------------------------------- */

export function identifyActions(state: RoomBindingState): {
  linkedin: boolean;
  whatsapp: boolean;
  whatsappUnavailableLine: string | null;
} {
  return {
    linkedin: state.linkedin.available,
    whatsapp: state.whatsapp.available,
    whatsappUnavailableLine: state.whatsapp.available ? null : (state.whatsapp.unavailableLine ?? WAHA_UNAVAILABLE_LINE),
  };
}

function routeAvailability(probe: WahaProbe): Pick<RoomBindingState, "linkedin" | "whatsapp"> {
  const linkedinOn = linkedinConfigured();
  const whatsappOn = probe.ok;
  return {
    linkedin: linkedinOn
      ? { available: true }
      : { available: false, unavailableLine: LINKEDIN_UNCONFIGURED_LINE },
    whatsapp: whatsappOn
      ? { available: true }
      : { available: false, unavailableLine: probe.ok ? WAHA_UNAVAILABLE_LINE : probe.line },
  };
}

function toPublicState(
  workspaceId: string,
  needsIdentify: boolean,
  probe: WahaProbe,
): RoomBindingState {
  const stored = getBinding(workspaceId);
  const routes = routeAvailability(probe);
  if (!stored) {
    return {
      level: "anonymous",
      bound: false,
      needsIdentify,
      provider: null,
      displayName: null,
      ...routes,
    };
  }
  return {
    level: "signed-in",
    bound: true,
    needsIdentify: false,
    provider: stored.provider,
    displayName: stored.displayName,
    ...routes,
  };
}

export async function bindingStateForToken(
  token: string,
  probe: () => Promise<WahaProbe> = probeWaha,
): Promise<RoomBindingState | null> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;
  await hydrateIdentityStore();
  const own = visitorPastedOwnMaterial(
    state.messages.filter((message) => message.authorKind === "visitor").map((message) => message.body),
  );
  return toPublicState(state.workspace.id, own && !getBinding(state.workspace.id), await probe());
}

export async function bindingStateForWorkspace(
  workspaceId: string,
  visitorBodies: string[],
  probe: () => Promise<WahaProbe> = probeWaha,
): Promise<RoomBindingState> {
  await hydrateIdentityStore();
  const own = visitorPastedOwnMaterial(visitorBodies);
  return toPublicState(workspaceId, own && !getBinding(workspaceId), await probe());
}
