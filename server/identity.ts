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
 *   - WhatsApp, through WAHA on another host: a wa.me link or a QR of that
 *     link opens WhatsApp with a pre-filled message carrying this room's
 *     address, sent to us.
 *
 * WHAT IS STORED. The minimum that answers "is this the same person": an
 * opaque provider id and the display name they chose to give. The LinkedIn
 * access token is used once to read those two fields and then dropped. A
 * WhatsApp phone number is hashed before anything keeps it, and is never
 * logged. Failed or abandoned identification writes nothing.
 *
 * THE ADDRESS STAYS A BEARER CREDENTIAL. Binding adds a second fact about the
 * room. It does not start asking for a password, and it does not stop the
 * link from opening the room. robots.txt, noindex and the sitemap already
 * treat /w/ as a credential; this file does not undo that.
 *
 * WHERE THIS LIVES. In memory, in this process — the same constraint
 * server/spend.ts has, because this parcel does not own shared/schema.ts.
 * Bindings vanish on restart. Nothing a visitor reads claims otherwise.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import type { RoomAccessLevel, RoomBindingProvider, RoomBindingState } from "@shared/api";
import { storage } from "./storage";
import { MAX_TURNS_PER_HOUR, monthlyBudgetUsd } from "./spend";
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
const LINKEDIN_SCOPE = "openid profile";

const OWN_MATERIAL_MIN_LENGTH = 200;
const URL_PATTERN = /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S+/i;
const CODE_PATTERNS: RegExp[] = [
  /```/,
  /<\/?[a-z][^>]*>/i,
  /=>|\bfunction\s*[\w$]*\s*\(/,
  /\{\s*"[^"]*"\s*:/,
  /^\s*(?:curl|GET|POST|PUT)\b/m,
];

const BIND_CODE_RE = /\bRoom-bind ([0-9A-Za-z]{16})\b/;

/** Per-process pepper so a stored WhatsApp id is not a reversible phone number. */
const HASH_PEPPER = randomBytes(32);

/* --------------------------------- records -------------------------------- */

interface StoredBinding {
  workspaceId: string;
  provider: RoomBindingProvider;
  /** Opaque. LinkedIn `sub`, or a hash of a WhatsApp chat id. Never a phone, never a token. */
  providerId: string;
  displayName: string;
  boundAt: string;
}

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

const bindings = new Map<string, StoredBinding>();
const pendingLinkedIn = new Map<string, PendingLinkedIn>();
const pendingWhatsApp = new Map<string, PendingWhatsApp>();
const pendingWhatsAppByNonce = new Map<string, string>();

export function resetIdentityForTests(): void {
  bindings.clear();
  pendingLinkedIn.clear();
  pendingWhatsApp.clear();
  pendingWhatsAppByNonce.clear();
}

/** Test seam: the stored row, so cases can assert what is NOT on it. */
export function storedBindingForTests(workspaceId: string): StoredBinding | undefined {
  return bindings.get(workspaceId);
}

/* -------------------------------- allowance ------------------------------- */

export function accessLevelFor(workspaceId: string): RoomAccessLevel {
  return bindings.has(workspaceId) ? "signed-in" : "anonymous";
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
  const url = new URL(LINKEDIN_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPE);
  return { ok: true, url: url.toString() };
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
}

function displayNameFromUserInfo(info: UserInfo): string | null {
  if (typeof info.name === "string" && info.name.trim()) return info.name.trim();
  const given = typeof info.given_name === "string" ? info.given_name.trim() : "";
  const family = typeof info.family_name === "string" ? info.family_name.trim() : "";
  const joined = `${given} ${family}`.trim();
  return joined.length > 0 ? joined : null;
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

  const clientId = linkedinClientId();
  const clientSecret = linkedinClientSecret();
  if (!clientId || !clientSecret) return { token: pending.token, bound: false };

  const fetchImpl = input.fetchImpl ?? fetch;
  let accessToken: string | null = null;
  try {
    const tokenRes = await fetchImpl(LINKEDIN_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code.trim(),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: pending.redirectUri,
      }),
    });
    if (!tokenRes.ok) return { token: pending.token, bound: false };
    const tokenBody = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
      return { token: pending.token, bound: false };
    }
    accessToken = tokenBody.access_token;

    const infoRes = await fetchImpl(LINKEDIN_USERINFO, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    accessToken = null;
    if (!infoRes.ok) return { token: pending.token, bound: false };
    const info = (await infoRes.json()) as UserInfo;
    const sub = typeof info.sub === "string" ? info.sub.trim() : "";
    const displayName = displayNameFromUserInfo(info);
    if (!sub || !displayName) return { token: pending.token, bound: false };

    bindings.set(pending.workspaceId, {
      workspaceId: pending.workspaceId,
      provider: "linkedin",
      providerId: `linkedin:${sub}`,
      displayName,
      boundAt: new Date().toISOString(),
    });
    return { token: pending.token, bound: true };
  } catch {
    accessToken = null;
    return { token: pending.token, bound: false };
  }
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

  const nonce = nanoid(16);
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

/**
 * A message arrived at our number. If it carries a live bind code AND a
 * display name the sender chose, the matching room is bound. Otherwise the
 * room is left exactly as it was. The chat id is hashed; the raw payload is
 * not logged.
 */
export function acceptWhatsAppInbound(
  raw: unknown,
  webhookSecret: string | undefined,
): WhatsAppInboundResult {
  if (!webhookSecretOk(webhookSecret)) return { accepted: false, reason: "unauthorized" };
  sweepPending();
  const fields = extractWhatsAppInbound(raw);
  if (!fields) return { accepted: true, bound: false };
  const match = BIND_CODE_RE.exec(fields.body);
  if (!match) return { accepted: true, bound: false };
  const nonce = match[1];
  const workspaceId = pendingWhatsAppByNonce.get(nonce);
  if (!workspaceId) return { accepted: true, bound: false };
  const pending = pendingWhatsApp.get(workspaceId);
  pendingWhatsApp.delete(workspaceId);
  pendingWhatsAppByNonce.delete(nonce);
  if (!pending || pending.nonce !== nonce) return { accepted: true, bound: false };
  const displayName = fields.pushName.trim();
  if (!displayName) return { accepted: true, bound: false };

  bindings.set(workspaceId, {
    workspaceId,
    provider: "whatsapp",
    providerId: `whatsapp:${opaqueWhatsAppId(fields.chatId)}`,
    displayName,
    boundAt: new Date().toISOString(),
  });
  return { accepted: true, bound: true };
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
  const stored = bindings.get(workspaceId);
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
  const own = visitorPastedOwnMaterial(
    state.messages.filter((message) => message.authorKind === "visitor").map((message) => message.body),
  );
  return toPublicState(state.workspace.id, own && !bindings.has(state.workspace.id), await probe());
}

export async function bindingStateForWorkspace(
  workspaceId: string,
  visitorBodies: string[],
  probe: () => Promise<WahaProbe> = probeWaha,
): Promise<RoomBindingState> {
  const own = visitorPastedOwnMaterial(visitorBodies);
  return toPublicState(workspaceId, own && !bindings.has(workspaceId), await probe());
}
