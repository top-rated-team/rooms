/**
 * The visitor's own Google Calendar, for the length of a pick.
 *
 * THE SCOPE IS calendar.freebusy AND NOTHING ELSE.
 *
 * Google's freeBusy.query returns busy intervals — no titles, no guests, no
 * locations, no descriptions. That is why this scope is non-sensitive and why
 * the consent screen is a light one rather than a Google security review.
 * Asking for one field more (events, a calendar list) turns that review on.
 *
 * The owner's Cloud app currently has four non-sensitive scopes registered:
 * calendar.freebusy, calendar.events.freebusy, calendar.calendarlist.readonly
 * and calendar.events.public.readonly. Registering a scope is not requesting
 * it. This file requests one. The other three can be deleted from the app so
 * the consent screen lists only what is used.
 *
 * include_granted_scopes is sent as false so a previous grant of a wider
 * scope on this app cannot ride along.
 *
 * WHY NOT THROUGH THE SCHEDULING CONNECTOR. the hosted connector has no free/busy
 * endpoint. Availability there is computed by listing events, which would
 * hand us titles, guests and locations to answer a question whose whole
 * content is "busy or not". Direct is the narrow path. It is also the only
 * shape that can be temporary: a token held for the pick and never written
 * down. A connector account is a row in a tenant until somebody deletes it.
 *
 * TWO APPS. Ours (the connector) stays. This is the visitor's Google, through
 * GOOGLE_FREEBUSY_CLIENT_ID / GOOGLE_FREEBUSY_CLIENT_SECRET. A fork has no
 * such app; without those variables this module is inert and the picker is
 * told offered: false.
 *
 * THE TOKEN IS NEVER WRITTEN DOWN. Not to the database, not to a log, not to
 * a session store that outlives the pick. The Map below is this process's
 * memory. The cookie on the response is a nonce that points at a row, not
 * the Google token. The row dies when they confirm or after five minutes.
 *
 * DISCONNECT REMOVES THAT VISITOR'S OWN GOOGLE ACCOUNT AND NOTHING ELSE.
 * Never dan@top-rated.team, never any LinkedIn or WhatsApp account. Drop
 * revokes the visitor's token at Google and deletes the row. It does not
 * call the hosted connector.
 */

import { nanoid } from "nanoid";
import { BOOKING_VISITOR_CALENDAR_QUERY, type VisitorCalendarView } from "@shared/api";

export const VISITOR_CALENDAR_TTL_MS = 5 * 60_000;
export const VISITOR_CALENDAR_COOKIE = "booking_visitor_cal";

/**
 * The state is also a cookie, and a return whose cookie does not carry it is
 * refused.
 *
 * Without it the callback can be completed by any browser, not the one that
 * started the flow: somebody finishes the Google consent themselves, keeps
 * the callback address and sends it to a visitor, and that visitor's picker
 * is then filtered by a stranger's calendar with a stranger's token behind
 * the cookie. The wave before this one had the same hole in the LinkedIn
 * flow, where it was worth an account; here it is worth a confused picker,
 * which is reason enough and the fix is four lines. See
 * ROOM_LOGIN_STATE_COOKIE in server/room-login.ts — same shape, on purpose.
 */
export const VISITOR_CALENDAR_STATE_COOKIE = "booking_visitor_cal_state";

/**
 * The one scope this asks Google for. The short name in the privacy page
 * and the full URI Google wants on the authorize URL are the same permission.
 */
export const VISITOR_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

/**
 * The whole request: free/busy, and who the calendar belongs to.
 *
 * `openid email` is there so the booking form can fill in the address of the
 * calendar that was just connected, instead of asking a person to type the
 * address of the account they authorised thirty seconds ago. Both are
 * non-sensitive — they are the two scopes almost every "sign in with Google"
 * asks for — so the consent screen stays a light one and no review is opened.
 *
 * IT CHANGES WHAT THE CONSENT SCREEN SAYS, and so it changes what /privacy has
 * to say: we now receive the address as well as the busy ranges. Still no
 * titles, no guests, no locations; still held in memory for the length of the
 * pick and never written down.
 */
export const VISITOR_CALENDAR_SCOPES = ["openid", "email", VISITOR_CALENDAR_SCOPE];

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const GOOGLE_FREEBUSY = "https://www.googleapis.com/calendar/v3/freeBusy";
/**
 * Nothing Google does may hold /api/booking/slots open. That route is the
 * booking popup's first paint for every visitor, connected or not, and one
 * hung socket would stall all of them behind an optional overlay.
 */
const GOOGLE_MS = 8_000;

function withTimeout(): { signal: AbortSignal } | Record<string, never> {
  if (typeof AbortSignal?.timeout !== "function") return {};
  return { signal: AbortSignal.timeout(GOOGLE_MS) };
}
const RETURN_ORIGIN = "https://booking.invalid";
/** How long a started connection may take to come back. The state cookie's life. */
export const PENDING_VISITOR_CALENDAR_MS = 15 * 60_000;
const PENDING_MS = PENDING_VISITOR_CALENDAR_MS;

export interface BusyInterval {
  start: number;
  end: number;
}

interface PendingConnect {
  returnPath: string;
  redirectUri: string;
  createdAt: number;
}

interface StoredVisitorCalendar {
  accessToken: string;
  /** The address of the account that authorised, when Google told us. Memory only. */
  email: string | null;
  createdAt: number;
  expiresAt: number;
}

const pending = new Map<string, PendingConnect>();
const connections = new Map<string, StoredVisitorCalendar>();

function clientId(): string {
  return process.env.GOOGLE_FREEBUSY_CLIENT_ID?.trim() ?? "";
}

function clientSecret(): string {
  return process.env.GOOGLE_FREEBUSY_CLIENT_SECRET?.trim() ?? "";
}

export function visitorCalendarConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

/**
 * Expiry REVOKES, it does not merely forget.
 *
 * /privacy says the connection ends when you confirm or after five minutes.
 * Deleting our row ends it on our side and leaves the grant sitting in the
 * visitor's Google account, which is not what that sentence promises and not
 * what anybody wants who pressed a button on a booking form. Best effort and
 * never awaited: a revoke that cannot reach Google must not hold up a sweep
 * that runs inside every read.
 */
function revokeInBackground(accessToken: string): void {
  try {
    void fetch(GOOGLE_REVOKE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: accessToken }),
    }).catch(() => undefined);
  } catch {
    /* No fetch in this environment. The token dies on its own at Google. */
  }
}

function sweep(now = Date.now()): void {
  for (const [state, row] of pending) {
    if (now - row.createdAt > PENDING_MS) pending.delete(state);
  }
  for (const [handle, row] of connections) {
    if (now >= row.expiresAt) {
      connections.delete(handle);
      revokeInBackground(row.accessToken);
    }
  }
}

export function resetVisitorCalendarForTests(): void {
  pending.clear();
  connections.clear();
}

/** Tests only. Plants a row the way the callback would, without talking to Google. */
export function putVisitorCalendarForTests(input: {
  handle: string;
  accessToken: string;
  email?: string | null;
  now?: number;
  ttlMs?: number;
}): void {
  const now = input.now ?? Date.now();
  connections.set(input.handle, {
    accessToken: input.accessToken,
    email: input.email ?? null,
    createdAt: now,
    expiresAt: now + (input.ttlMs ?? VISITOR_CALENDAR_TTL_MS),
  });
}

export function visitorCalendarRedirectUri(publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/api/booking/calendar/callback`;
}

/**
 * Relative path back to the page the popup was on. Protocol-relative and
 * off-site values become `/`, so the OAuth return cannot be used as an
 * open redirect.
 */
export function sanitizeVisitorCalendarReturnPath(raw: string | undefined): string {
  const value = (raw ?? "/").trim() || "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("://")) return "/";
  if (value.includes("\\")) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
      return "/";
    }
    const url = new URL(value, RETURN_ORIGIN);
    if (url.origin !== RETURN_ORIGIN) return "/";
    if (url.username || url.password) return "/";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

/**
 * The address the visitor lands back on, carrying whether it worked.
 *
 * Denied consent, an expired code and a refusal from Google used to return
 * the identical address as success, so the popup reopened looking exactly as
 * it does when a calendar IS connected and said nothing at all. A person who
 * has just been asked for a Google permission and is told nothing assumes the
 * permission is the thing that failed.
 */
function withReturnQuery(returnPath: string, ok: boolean): string {
  const value = ok ? "1" : "failed";
  const safe = sanitizeVisitorCalendarReturnPath(returnPath);
  const url = new URL(safe, RETURN_ORIGIN);
  if (url.origin !== RETURN_ORIGIN || url.pathname.startsWith("//")) {
    const fallback = new URL("/", RETURN_ORIGIN);
    fallback.searchParams.set(BOOKING_VISITOR_CALENDAR_QUERY, value);
    return `${fallback.pathname}${fallback.search}`;
  }
  url.searchParams.set(BOOKING_VISITOR_CALENDAR_QUERY, value);
  const out = `${url.pathname}${url.search}${url.hash}`;
  if (out.startsWith("//") || url.pathname.startsWith("//")) {
    const fallback = new URL("/", RETURN_ORIGIN);
    fallback.searchParams.set(BOOKING_VISITOR_CALENDAR_QUERY, value);
    return `${fallback.pathname}${fallback.search}`;
  }
  return out;
}

export function visitorCalendarView(handle: string | undefined, now = Date.now()): VisitorCalendarView {
  if (!visitorCalendarConfigured()) return { offered: false };
  sweep(now);
  const key = handle?.trim() ?? "";
  if (!key) return { offered: true, connected: false };
  const row = connections.get(key);
  if (!row || now >= row.expiresAt) {
    if (row) {
      connections.delete(key);
      revokeInBackground(row.accessToken);
    }
    return { offered: true, connected: false };
  }
  return {
    offered: true,
    connected: true,
    expiresAt: new Date(row.expiresAt).toISOString(),
    ...(row.email ? { email: row.email } : {}),
  };
}

export type VisitorCalendarStart = { ok: true; url: string; state: string } | { ok: false };

/**
 * Builds Google's authorization URL. Asks for calendar.freebusy and nothing
 * else. Closing the consent screen leaves our calendar, LinkedIn and WhatsApp
 * as they were.
 */
export function startVisitorCalendarConnect(input: {
  returnPath?: string;
  publicBaseUrl: string;
}): VisitorCalendarStart {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) return { ok: false };

  sweep();
  const state = nanoid(24);
  const redirectUri = visitorCalendarRedirectUri(input.publicBaseUrl);
  pending.set(state, {
    returnPath: sanitizeVisitorCalendarReturnPath(input.returnPath),
    redirectUri,
    createdAt: Date.now(),
  });

  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", VISITOR_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "online");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("prompt", "consent");
  return { ok: true, url: url.toString(), state };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export type VisitorCalendarComplete = {
  handle: string | null;
  redirectTo: string;
  /** False when the visitor pressed the button and did not end up connected. */
  ok: boolean;
};

/**
 * Exchanges the code for an access token and holds that token in memory.
 * A refresh token, if Google sent one anyway, is dropped on the floor —
 * this connection is not meant to outlive the pick.
 */
export async function completeVisitorCalendarConnect(
  input: {
    code?: string;
    state?: string;
    error?: string;
    /** The value of VISITOR_CALENDAR_STATE_COOKIE on the browser that came back. */
    cookieState?: string;
    now?: Date;
    fetchImpl?: typeof fetch;
  },
): Promise<VisitorCalendarComplete> {
  sweep(input.now?.getTime());
  const state = input.state?.trim() ?? "";
  const row = state ? pending.get(state) : undefined;
  if (row) pending.delete(state);
  const redirectTo = withReturnQuery(row?.returnPath ?? "/", false);
  /* The pending row is already gone, so a return that fails this check cannot
     be retried by a browser that would pass it. */
  if (!row || input.cookieState?.trim() !== state) {
    return { handle: null, redirectTo, ok: false };
  }
  if (input.error || !input.code?.trim() || !visitorCalendarConfigured()) {
    return { handle: null, redirectTo: withReturnQuery(row.returnPath, false), ok: false };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    code: input.code.trim(),
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: row.redirectUri,
    grant_type: "authorization_code",
  });
  let tokenBody: unknown = null;
  try {
    const res = await fetchImpl(GOOGLE_TOKEN, {
      ...withTimeout(),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    tokenBody = await readJson(res);
    if (!res.ok) return { handle: null, redirectTo, ok: false };
  } catch {
    return { handle: null, redirectTo, ok: false };
  }

  const record = asRecord(tokenBody);
  const accessToken = typeof record?.access_token === "string" ? record.access_token.trim() : "";
  if (!accessToken) return { handle: null, redirectTo, ok: false };
  const email = emailFromIdToken(record?.id_token);

  const now = input.now?.getTime() ?? Date.now();
  const handle = nanoid(24);
  connections.set(handle, {
    accessToken,
    email,
    createdAt: now,
    expiresAt: now + VISITOR_CALENDAR_TTL_MS,
  });
  return { handle, redirectTo: withReturnQuery(row.returnPath, true), ok: true };
}

function takeConnection(handle: string | undefined, now: number): StoredVisitorCalendar | null {
  sweep(now);
  const key = handle?.trim() ?? "";
  if (!key) return null;
  const row = connections.get(key);
  if (!row || now >= row.expiresAt) {
    if (row) {
      connections.delete(key);
      revokeInBackground(row.accessToken);
    }
    return null;
  }
  return row;
}

/**
 * Drop this visitor's Google token and nothing else. Revokes it at Google so
 * the grant leaves their account. Does not call the hosted connector, does not name
 * dan@top-rated.team, and does not touch a LinkedIn or WhatsApp row.
 */
export async function dropVisitorCalendar(
  handle: string | undefined,
  opts: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<VisitorCalendarView> {
  const now = opts.now?.getTime() ?? Date.now();
  if (!visitorCalendarConfigured()) return { offered: false };

  const key = handle?.trim() ?? "";
  const row = key ? connections.get(key) : undefined;
  if (row) connections.delete(key);

  if (row?.accessToken) {
    const fetchImpl = opts.fetchImpl ?? fetch;
    try {
      await fetchImpl(GOOGLE_REVOKE, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: row.accessToken }),
      });
    } catch {
      /* The row is already gone. A revoke that cannot reach Google is still
         a disconnect on our side; they can finish it at myaccount.google.com. */
    }
  }

  sweep(now);
  return { offered: true, connected: false };
}

/**
 * Busy intervals from freeBusy.query. Returns null when there is no live
 * connection or Google refused the token — the slot list then stays the
 * owner's, with no visitor overlay.
 */
export async function queryVisitorFreeBusy(input: {
  handle: string | undefined;
  start: string;
  end: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<BusyInterval[] | null> {
  const now = input.now?.getTime() ?? Date.now();
  const row = takeConnection(input.handle, now);
  if (!row) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  let body: unknown = null;
  try {
    const res = await fetchImpl(GOOGLE_FREEBUSY, {
      ...withTimeout(),
      method: "POST",
      headers: {
        Authorization: `Bearer ${row.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        timeMin: input.start,
        timeMax: input.end,
        items: [{ id: "primary" }],
      }),
    });
    body = await readJson(res);
    if (res.status === 401 || res.status === 403) {
      connections.delete(input.handle?.trim() ?? "");
      return null;
    }
    if (!res.ok) return null;
  } catch {
    return null;
  }

  return parseFreeBusy(body);
}

/**
 * Busy intervals, or null when Google answered but could not read the
 * calendar.
 *
 * freeBusy.query returns HTTP 200 with a per-calendar `errors` array for
 * notFound, and for a calendar the grant does not cover. Reading that as an
 * empty busy list says "you are free all week" to somebody whose calendar was
 * never read — the worst of both, because the picker goes on saying the
 * calendar is connected. An unreadable calendar is no overlay, not an empty
 * one.
 */
/**
 * The address out of the id_token Google returns beside the access token.
 *
 * NOT VERIFIED, AND IT DOES NOT NEED TO BE: this token came back over TLS from
 * Google's own token endpoint in a request we made, not from the browser, so
 * there is nothing for a signature to add. It is never a credential here —
 * only a default in a form the person can overwrite.
 */
export function emailFromIdToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const payload = value.split(".")[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = asRecord(JSON.parse(json) as unknown);
    const email = typeof claims?.email === "string" ? claims.email.trim() : "";
    if (!email || !email.includes("@")) return null;
    /* An address Google has not confirmed is a default we do not want to put
       in a field a person will press Book on without reading. */
    if (claims?.email_verified === false) return null;
    return email;
  } catch {
    return null;
  }
}

export function parseFreeBusy(body: unknown): BusyInterval[] | null {
  const record = asRecord(body);
  const calendars = asRecord(record?.calendars);
  const primary = asRecord(calendars?.primary);
  if (!primary) return null;
  if (Array.isArray(primary.errors) && primary.errors.length > 0) return null;
  const busy = primary.busy;
  if (!Array.isArray(busy)) return [];
  const intervals: BusyInterval[] = [];
  for (const entry of busy) {
    const row = asRecord(entry);
    if (!row || typeof row.start !== "string" || typeof row.end !== "string") continue;
    const start = new Date(row.start);
    const end = new Date(row.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
    if (end.getTime() <= start.getTime()) continue;
    intervals.push({ start: start.getTime(), end: end.getTime() });
  }
  return intervals;
}

export function visitorCalendarCookieOptions(): {
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
    maxAge: VISITOR_CALENDAR_TTL_MS,
  };
}
