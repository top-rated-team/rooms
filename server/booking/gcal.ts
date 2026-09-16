/**
 * Our booking calendar, through a Google service account.
 *
 * The owner shares GOOGLE_CALENDAR_ID with the account's address, with
 * permission to make changes. The account authenticates with its own key.
 * There is no OAuth consent screen, no refresh token, and no vendor.
 *
 * Availability is freeBusy.query: busy ranges, no titles, no guests. Event
 * fields are used only to create, move and cancel a booking, and to read a
 * Meet link back — summary, description, attendees, conferenceData,
 * hangoutLink and id. Nothing is written into anybody else's calendar.
 *
 * The visitor's own calendar is server/booking/freebusy.ts: a different app,
 * a different grant and a different person. This file does not touch it.
 */

import { createSign } from "node:crypto";
import { pathToFileURL } from "node:url";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_FREEBUSY_URL = `${GOOGLE_CALENDAR_API}/freeBusy`;
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export const GCAL_UNCONFIGURED_LINE = "Scheduling is not configured on this deployment.";
export const GCAL_UNREACHABLE_LINE = "That service could not be reached.";
export const GCAL_UNWRITABLE_LINE = "The calendar cannot be written to right now.";
export const GCAL_MISSING_LINE = "The calendar is not connected.";
export const GCAL_BUSY_LINE = "Too many requests just now. Try again in a moment.";

/**
 * JWT `sub` is GOOGLE_CALENDAR_ID, so the service account impersonates the
 * Workspace user the calendar belongs to.
 *
 * The chosen mechanism is a shared calendar and no impersonation. Google's
 * events.insert page says a service account cannot populate attendees without
 * domain-wide delegation, and Meet is the same kind of question — Google's
 * own guide does not say a shared calendar can create a conference, and it
 * does not say it cannot. docs/specs/calendar.md records which of the two
 * this deployment ended up needing. The probe at the bottom of this file is
 * how that page is filled in: create one event, look for a Meet link, delete
 * it. A fork runs the same probe rather than rediscovering the answer.
 *
 * THE PROBE HAS RUN, AGAINST THE REAL CALENDAR, AND THE ANSWER IS THAT
 * DELEGATION IS NOT OPTIONAL HERE. A service account on a merely-shared
 * calendar can create and delete a plain event — that part works — but:
 *
 *   conferenceData is silently IGNORED. The event is created, hangoutLink
 *   comes back absent and conferenceData null. No error, no Meet link.
 *
 *   attendees are REFUSED, in Google's own words: 403
 *   forbiddenForServiceAccounts, "Service accounts cannot invite attendees
 *   without Domain-Wide Delegation of Authority."
 *
 * Both of those are features this booking has today. So a deployment that
 * wants a Meet link and an invitation grants domain-wide delegation and turns
 * this on; one that wants neither can leave it off and still take bookings.
 *
 * It is an environment switch rather than a constant because granting the
 * delegation happens in the Workspace admin console, not in this repository,
 * and the person who grants it should not need a deploy to use it.
 */
export function impersonateCalendarOwner(): boolean {
  const raw = process.env.GOOGLE_CALENDAR_IMPERSONATE?.trim().toLowerCase();
  if (raw === undefined || raw === "") return IMPERSONATE_CALENDAR_OWNER;
  return raw === "1" || raw === "true" || raw === "yes";
}

/** The built-in default, used when GOOGLE_CALENDAR_IMPERSONATE says nothing. */
export const IMPERSONATE_CALENDAR_OWNER = false;

const TOKEN_LIFETIME_S = 3600;
const TOKEN_REFRESH_S = 60;
const REQUEST_MS = 15_000;
const DEFAULT_TIMEZONE = "Europe/Bratislava";

export interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

export interface OurCalendar {
  id: string;
  timezone: string;
}

export type OurCalendarResult = { ok: true; calendar: OurCalendar } | { ok: false; line: string };

export interface BusyRange {
  start: number;
  end: number;
}

export interface CreateGcalEventInput {
  title: string;
  description?: string;
  attendees: { email: string }[];
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  notify: boolean;
}

export type GcalWriteResult =
  | { ok: true; eventId: string; meetUrl: string | null }
  | { ok: false; error: string };

interface TokenRow {
  token: string;
  expiresAt: number;
  impersonate: boolean;
}

let tokenCache: TokenRow | null = null;
let calendarCache: OurCalendar | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function withTimeout(): { signal: AbortSignal } | Record<string, never> {
  if (typeof AbortSignal?.timeout !== "function") return {};
  return { signal: AbortSignal.timeout(REQUEST_MS) };
}

export function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() ?? "";
}

export function available(): boolean {
  return Boolean(calendarId() && process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim());
}

export function unavailableLine(): string {
  return GCAL_UNCONFIGURED_LINE;
}

export function resetGcalForTests(): void {
  tokenCache = null;
  calendarCache = null;
}

/**
 * Parse the whole service-account JSON from one environment value.
 * private_key carries escaped newlines; JSON.parse restores them.
 */
export function parseServiceAccountJson(raw: string | undefined | null): ServiceAccount | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const record = asRecord(parsed);
  if (!record) return null;
  const clientEmail = asString(record.client_email);
  let privateKey = asString(record.private_key);
  if (!clientEmail || !privateKey) return null;
  /* A value pasted with literal \n sequences still left in the string. */
  if (!privateKey.includes("\n") && privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }
  if (!privateKey.includes("BEGIN")) return null;
  return { clientEmail, privateKey };
}

function serviceAccount(): ServiceAccount | null {
  return parseServiceAccountJson(process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON);
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * RS256 JWT for Google's token endpoint. `sub` is set only when impersonating
 * the Workspace user at GOOGLE_CALENDAR_ID.
 */
export function serviceAccountJwt(
  account: ServiceAccount,
  opts: { now?: number; impersonate?: boolean } = {},
): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: account.clientEmail,
    scope: GOOGLE_CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + TOKEN_LIFETIME_S,
  };
  if (opts.impersonate) {
    const sub = calendarId();
    if (sub) payload.sub = sub;
  }
  const unsigned = `${base64urlJson({ alg: "RS256", typ: "JWT" })}.${base64urlJson(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(account.privateKey);
  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    return asRecord(JSON.parse(Buffer.from(part, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

function visitorLineForStatus(status: number): string {
  if (status === 404) return GCAL_MISSING_LINE;
  if (status === 429) return GCAL_BUSY_LINE;
  if (status === 401 || status === 403) return GCAL_UNWRITABLE_LINE;
  return GCAL_UNREACHABLE_LINE;
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

async function getAccessToken(
  fetchImpl: typeof fetch,
  impersonate: boolean,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const now = Date.now();
  if (
    tokenCache &&
    tokenCache.impersonate === impersonate &&
    tokenCache.expiresAt - TOKEN_REFRESH_S * 1000 > now
  ) {
    return { ok: true, token: tokenCache.token };
  }

  const account = serviceAccount();
  if (!account) {
    console.error("[gcal] GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON is not valid JSON");
    return { ok: false, error: GCAL_UNCONFIGURED_LINE };
  }

  const assertion = serviceAccountJwt(account, { impersonate });
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      ...withTimeout(),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
  } catch {
    return { ok: false, error: GCAL_UNREACHABLE_LINE };
  }

  const body = await readJson(res);
  if (!res.ok) {
    console.error(`[gcal] token ${res.status}`);
    return { ok: false, error: visitorLineForStatus(res.status) };
  }
  const record = asRecord(body);
  const token = asString(record?.access_token);
  if (!token) return { ok: false, error: GCAL_UNWRITABLE_LINE };
  const expiresIn = typeof record?.expires_in === "number" ? record.expires_in : TOKEN_LIFETIME_S;
  tokenCache = { token, impersonate, expiresAt: now + Math.max(60, expiresIn) * 1000 };
  return { ok: true, token };
}

async function gcalFetch(
  input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    url: string;
    json?: unknown;
    impersonate?: boolean;
  },
  fetchImpl: typeof fetch,
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; error: string; status: number }> {
  if (!available()) return { ok: false, status: 0, error: GCAL_UNCONFIGURED_LINE };
  const impersonate = input.impersonate ?? impersonateCalendarOwner();
  const authed = await getAccessToken(fetchImpl, impersonate);
  if (!authed.ok) return { ok: false, status: 0, error: authed.error };

  let res: Response;
  try {
    res = await fetchImpl(input.url, {
      ...withTimeout(),
      method: input.method,
      headers: {
        Authorization: `Bearer ${authed.token}`,
        Accept: "application/json",
        ...(input.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: input.json !== undefined ? JSON.stringify(input.json) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: GCAL_UNREACHABLE_LINE };
  }

  const body = await readJson(res);
  if (res.status === 204) return { ok: true, status: 204, body: null };
  if (!res.ok) {
    console.error(`[gcal] ${input.method} ${res.status}`);
    return { ok: false, status: res.status, error: visitorLineForStatus(res.status) };
  }
  return { ok: true, status: res.status, body };
}

function eventsUrl(eventId?: string, query?: Record<string, string>): string {
  const id = encodeURIComponent(calendarId());
  const path = eventId
    ? `${GOOGLE_CALENDAR_API}/calendars/${id}/events/${encodeURIComponent(eventId)}`
    : `${GOOGLE_CALENDAR_API}/calendars/${id}/events`;
  const url = new URL(path);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
  return url.toString();
}

function calendarGetUrl(): string {
  return `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}`;
}

export async function getOurCalendar(fetchImpl: typeof fetch = fetch): Promise<OurCalendarResult> {
  if (calendarCache) return { ok: true, calendar: calendarCache };
  const id = calendarId();
  if (!available() || !id) return { ok: false, line: GCAL_UNCONFIGURED_LINE };

  const result = await gcalFetch({ method: "GET", url: calendarGetUrl() }, fetchImpl);
  if (!result.ok) return { ok: false, line: result.error };
  const record = asRecord(result.body);
  const timezone = asString(record?.timeZone) || DEFAULT_TIMEZONE;
  calendarCache = { id, timezone };
  return { ok: true, calendar: calendarCache };
}

/**
 * Busy ranges on OUR calendar. The items list is always GOOGLE_CALENDAR_ID,
 * never `primary` (that would be the service account's own empty calendar)
 * and never a visitor's address.
 */
export async function queryFreeBusy(
  input: { start: string; end: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; busy: BusyRange[] } | { ok: false; error: string }> {
  const id = calendarId();
  if (!available() || !id) return { ok: false, error: GCAL_UNCONFIGURED_LINE };

  const result = await gcalFetch(
    {
      method: "POST",
      url: GOOGLE_FREEBUSY_URL,
      json: {
        timeMin: input.start,
        timeMax: input.end,
        items: [{ id }],
      },
    },
    fetchImpl,
  );
  if (!result.ok) return { ok: false, error: result.error };

  const record = asRecord(result.body);
  const calendars = asRecord(record?.calendars);
  const ours = asRecord(calendars?.[id]);
  if (!ours) return { ok: false, error: GCAL_MISSING_LINE };
  if (Array.isArray(ours.errors) && ours.errors.length > 0) {
    return { ok: false, error: GCAL_UNWRITABLE_LINE };
  }
  const busy = ours.busy;
  if (!Array.isArray(busy)) return { ok: true, busy: [] };
  const ranges: BusyRange[] = [];
  for (const entry of busy) {
    const row = asRecord(entry);
    if (!row || typeof row.start !== "string" || typeof row.end !== "string") continue;
    const start = new Date(row.start);
    const end = new Date(row.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
    if (end.getTime() <= start.getTime()) continue;
    ranges.push({ start: start.getTime(), end: end.getTime() });
  }
  return { ok: true, busy: ranges };
}

export function meetUrlFromEvent(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  const hangout = asString(record.hangoutLink);
  if (hangout && hangout.startsWith("https://meet.google.com/")) return hangout;
  const conference = asRecord(record.conferenceData) ?? asRecord(record.conference);
  if (!conference) return null;
  const url = asString(conference.url);
  if (url && url.startsWith("https://meet.google.com/")) return url;
  const entries = conference.entryPoints;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const row = asRecord(entry);
    const uri = asString(row?.uri);
    if (uri && uri.startsWith("https://meet.google.com/")) return uri;
  }
  return null;
}

function eventIdFromBody(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  return asString(record.id) ?? asString(record.event_id);
}

export async function createEvent(
  input: CreateGcalEventInput,
  fetchImpl: typeof fetch = fetch,
): Promise<GcalWriteResult> {
  const id = calendarId();
  if (!available() || !id) return { ok: false, error: GCAL_UNCONFIGURED_LINE };

  const url = eventsUrl(undefined, {
    conferenceDataVersion: "1",
    sendUpdates: input.notify ? "all" : "none",
  });
  const result = await gcalFetch(
    {
      method: "POST",
      url,
      json: {
        summary: input.title,
        description: input.description,
        attendees: input.attendees,
        start: { dateTime: input.start.dateTime, timeZone: input.start.timeZone },
        end: { dateTime: input.end.dateTime, timeZone: input.end.timeZone },
        transparency: "opaque",
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    },
    fetchImpl,
  );
  if (!result.ok) return { ok: false, error: result.error };

  const eventId = eventIdFromBody(result.body);
  if (!eventId) return { ok: false, error: GCAL_UNWRITABLE_LINE };

  let meetUrl = meetUrlFromEvent(result.body);
  if (!meetUrl) {
    const fetched = await gcalFetch({ method: "GET", url: eventsUrl(eventId) }, fetchImpl);
    if (fetched.ok) meetUrl = meetUrlFromEvent(fetched.body);
  }
  return { ok: true, eventId, meetUrl };
}

export async function deleteEvent(
  eventId: string,
  opts: { notify: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = calendarId();
  if (!available() || !id) return { ok: false, error: GCAL_UNCONFIGURED_LINE };
  if (!eventId.trim()) return { ok: true };

  const result = await gcalFetch(
    {
      method: "DELETE",
      url: eventsUrl(eventId, { sendUpdates: opts.notify ? "all" : "none" }),
    },
    fetchImpl,
  );
  if (!result.ok && result.status !== 404) return { ok: false, error: result.error };
  return { ok: true };
}

export interface MeetProbeResult {
  sharedCalendarMeet: boolean;
  impersonatedMeet: boolean;
  needed: "shared-calendar" | "domain-wide-delegation" | "neither";
  error?: string;
}

/**
 * The smallest live check: one event with conferenceData and
 * conferenceDataVersion=1, look at whether a Meet link comes back, delete it.
 * Tries the shared calendar first; if there is no link, tries impersonating
 * GOOGLE_CALENDAR_ID (domain-wide delegation).
 */
export async function probeMeetLink(fetchImpl: typeof fetch = fetch): Promise<MeetProbeResult> {
  if (!available()) {
    return {
      sharedCalendarMeet: false,
      impersonatedMeet: false,
      needed: "neither",
      error: GCAL_UNCONFIGURED_LINE,
    };
  }

  async function oneAttempt(impersonate: boolean): Promise<{ meet: boolean; error?: string }> {
    tokenCache = null;
    const start = new Date(Date.now() + 60 * 60_000);
    const end = new Date(start.getTime() + 15 * 60_000);
    const created = await gcalFetch(
      {
        method: "POST",
        url: eventsUrl(undefined, { conferenceDataVersion: "1", sendUpdates: "none" }),
        impersonate,
        json: {
          summary: "Meet probe — delete me",
          start: { dateTime: start.toISOString(), timeZone: "UTC" },
          end: { dateTime: end.toISOString(), timeZone: "UTC" },
          transparency: "opaque",
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        },
      },
      fetchImpl,
    );
    if (!created.ok) return { meet: false, error: created.error };
    const eventId = eventIdFromBody(created.body);
    let meet = Boolean(meetUrlFromEvent(created.body));
    if (!meet && eventId) {
      const fetched = await gcalFetch(
        { method: "GET", url: eventsUrl(eventId), impersonate },
        fetchImpl,
      );
      if (fetched.ok) meet = Boolean(meetUrlFromEvent(fetched.body));
    }
    if (eventId) {
      await gcalFetch(
        {
          method: "DELETE",
          url: eventsUrl(eventId, { sendUpdates: "none" }),
          impersonate,
        },
        fetchImpl,
      );
    }
    return { meet };
  }

  const shared = await oneAttempt(false);
  if (shared.meet) {
    return { sharedCalendarMeet: true, impersonatedMeet: false, needed: "shared-calendar" };
  }
  const impersonated = await oneAttempt(true);
  if (impersonated.meet) {
    return { sharedCalendarMeet: false, impersonatedMeet: true, needed: "domain-wide-delegation" };
  }
  return {
    sharedCalendarMeet: false,
    impersonatedMeet: false,
    needed: "neither",
    error: impersonated.error ?? shared.error ?? "No Meet link came back on either path.",
  };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    /* Ambient environment is the whole configuration. */
  }
  const result = await probeMeetLink();
  const lines = [
    `shared calendar Meet: ${result.sharedCalendarMeet ? "yes" : "no"}`,
    `domain-wide delegation Meet: ${result.impersonatedMeet ? "yes" : "no"}`,
    `needed: ${result.needed}`,
  ];
  if (result.error) lines.push(`error: ${result.error}`);
  console.log(lines.join("\n"));
  if (result.needed === "neither") process.exitCode = 1;
}

if (isMainModule()) {
  void main();
}
