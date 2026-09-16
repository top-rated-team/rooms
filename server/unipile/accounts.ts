/**
 * The two Unipile accounts this deployment operates: the Google calendar and
 * our own WhatsApp. A connected account can rot — `sources[].status` is how
 * we learn it did.
 *
 * GET /api/v1/accounts and GET /api/v1/accounts/{id} only. Calendar, messaging
 * and webhook calls live in other files that import the HTTP client.
 *
 * `connection_params` is dropped. On WhatsApp it carries a phone number, and
 * a phone number is never stored and never logged.
 */

import { unipileRequest, type UnipileResult } from "./client";
import { visitorLine, type UnipileError } from "./errors";

/**
 * NO DEFAULTS. The two account ids used to be written here, so a repository
 * that is going public and is the fork target named our own Unipile accounts
 * in its source, and a fork that set its own UNIPILE_API_KEY and forgot these
 * two addressed ids that do not exist in its tenant — a confusing silence
 * instead of a clear refusal.
 *
 * They were never credentials: the key is UNIPILE_API_KEY and has always been
 * environment only. But an id is still ours, and a default that points a
 * stranger's deployment at it is a default that is wrong for everyone except
 * the one machine it was written for.
 */
export const ACCOUNT_UNSET_LINE =
  "This deployment has no Unipile account configured for that. Set UNIPILE_CALENDAR_ACCOUNT_ID and UNIPILE_WHATSAPP_ACCOUNT_ID.";

export const SOURCE_STATUSES = [
  "OK",
  "STOPPED",
  "ERROR",
  "CREDENTIALS",
  "PERMISSIONS",
  "CONNECTING",
] as const;

export type AccountSourceStatus = (typeof SOURCE_STATUSES)[number];

export interface AccountSource {
  id: string;
  status: AccountSourceStatus | "unknown";
}

export interface UnipileAccount {
  id: string;
  type: string;
  sources: AccountSource[];
}

export type AccountRole = "calendar" | "whatsapp";

export interface OurAccount {
  role: AccountRole;
  accountId: string;
  /** True when Unipile returned the account. Sources then say whether it has rotted. */
  connected: boolean;
  type: string | null;
  sources: AccountSource[];
}

export type OurAccountsResult =
  | { ok: true; accounts: OurAccount[] }
  | { ok: false; line: string; error?: UnipileError };

const SOURCE_SET = new Set<string>(SOURCE_STATUSES);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/** The configured id, or "" when this deployment has none. */
export function calendarAccountId(): string {
  return process.env.UNIPILE_CALENDAR_ACCOUNT_ID?.trim() ?? "";
}

export function whatsappAccountId(): string {
  return process.env.UNIPILE_WHATSAPP_ACCOUNT_ID?.trim() ?? "";
}

function parseSource(value: unknown): AccountSource | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || record.id.length === 0) return null;
  const raw = typeof record.status === "string" ? record.status : "";
  const status: AccountSource["status"] = SOURCE_SET.has(raw) ? (raw as AccountSourceStatus) : "unknown";
  return { id: record.id, status };
}

export function parseAccount(value: unknown): UnipileAccount | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.id !== "string" || record.id.length === 0) return null;
  if (typeof record.type !== "string" || record.type.length === 0) return null;
  const rawSources = Array.isArray(record.sources) ? record.sources : [];
  const sources = rawSources.map(parseSource).filter((source): source is AccountSource => source !== null);
  return { id: record.id, type: record.type, sources };
}

export async function listAccounts(
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<UnipileAccount[]>> {
  const result = await unipileRequest<{ items?: unknown; data?: unknown }>(
    { method: "GET", path: "/accounts" },
    fetchImpl,
  );
  if (!result.ok) return result;
  /* Unipile is not consistent about its list envelope: chats come back as
     `{object, items, cursor}` and calendars as `{data, next_cursor}`. Which
     one the accounts list uses is not in any spec we could read, and guessing
     wrong here is not an error — it is an empty array and a page that says
     nothing is connected. So accept either. */
  const raw = result.body;
  const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.data) ? raw.data : [];
  const accounts = items.map(parseAccount).filter((account): account is UnipileAccount => account !== null);
  return { ok: true, status: result.status, body: accounts };
}

export async function getAccount(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<UnipileAccount | null>> {
  const result = await unipileRequest<unknown>(
    { method: "GET", path: `/accounts/${encodeURIComponent(id)}` },
    fetchImpl,
  );
  if (!result.ok) {
    if (result.error.status === 404) {
      return { ok: true, status: 404, body: null };
    }
    return result;
  }
  const account = parseAccount(result.body);
  if (!account) {
    return {
      ok: false,
      error: { type: "unknown", status: result.status },
      line: visitorLine({ type: "unknown", status: result.status }),
    };
  }
  return { ok: true, status: result.status, body: account };
}

function toOurAccount(role: AccountRole, accountId: string, account: UnipileAccount | null): OurAccount {
  if (!account) {
    return { role, accountId, connected: false, type: null, sources: [] };
  }
  return {
    role,
    accountId,
    connected: true,
    type: account.type,
    sources: account.sources,
  };
}

/**
 * The calendar account and the WhatsApp account named in the brief, each with
 * whether it is still connected and what its sources say.
 */
export async function ourAccounts(fetchImpl: typeof fetch = fetch): Promise<OurAccountsResult> {
  const calendarId = calendarAccountId();
  const whatsappId = whatsappAccountId();
  /* An unset id is not a lookup. Asking Unipile for the account called "" is
     a 404 that reads as "your calendar has been disconnected", which is a
     different problem from "nobody told this deployment which calendar". */
  if (!calendarId || !whatsappId) {
    return { ok: false, line: ACCOUNT_UNSET_LINE };
  }
  const [calendar, whatsapp] = await Promise.all([
    getAccount(calendarId, fetchImpl),
    getAccount(whatsappId, fetchImpl),
  ]);

  if (!calendar.ok) {
    return { ok: false, line: calendar.line, error: calendar.error };
  }
  if (!whatsapp.ok) {
    return { ok: false, line: whatsapp.line, error: whatsapp.error };
  }

  return {
    ok: true,
    accounts: [
      toOurAccount("calendar", calendarId, calendar.body),
      toOurAccount("whatsapp", whatsappId, whatsapp.body),
    ],
  };
}
