/**
 * Create our Unipile webhooks in code, not in a dashboard. The owner asked
 * for that by name.
 *
 * Two, and no third. Unipile's webhook types do not include a calendar, so
 * the calendar is polled. One webhook is source: messaging. The other is
 * source: account_status — the value on the Create a webhook OpenAPI under
 * the title "Account status webhook"
 * (https://developer.unipile.com/reference/webhookscontroller_createwebhook)
 * which is the registration contract for the Account status updates page
 * (https://developer.unipile.com/docs/account-lifecycle). That page describes
 * the payload and the statuses; it does not print the source literal. The
 * OpenAPI enum does: ["account_status"]. A wrong source is a webhook that
 * silently never fires.
 *
 * Both point at ${PUBLIC_BASE_URL}/api/unipile/inbound and carry the same
 * shared secret in a header we name. UNIPILE_WEBHOOK_SECRET is that secret,
 * not an address.
 *
 * Two silent failures if we skip the documented headers:
 *   1. A webhook created by API has no Content-Type by default, so
 *      express.json() leaves req.body empty unless we send
 *      {key: Content-Type, value: application/json}.
 *   2. There is no HMAC. Authentication is the secret in Unipile-Auth.
 *
 * Idempotent: list, find ours by request_url and source, create only when
 * absent, delete extras and anything pointing at a host we have retired.
 * Inert when Unipile, PUBLIC_BASE_URL or the secret is missing.
 */

import { available, unipileRequest, type UnipileResult } from "./client";

/** The header Unipile echoes back to us. Their own docs use this name. */
export const UNIPILE_WEBHOOK_AUTH_HEADER = "Unipile-Auth";

export const WEBHOOK_SOURCE_MESSAGING = "messaging";
/**
 * From the Create a webhook OpenAPI, title "Account status webhook",
 * source enum: ["account_status"].
 * https://developer.unipile.com/reference/webhookscontroller_createwebhook
 */
export const WEBHOOK_SOURCE_ACCOUNT_STATUS = "account_status";

export const WEBHOOK_SOURCES = [WEBHOOK_SOURCE_MESSAGING, WEBHOOK_SOURCE_ACCOUNT_STATUS] as const;
export type UnipileWebhookSource = (typeof WEBHOOK_SOURCES)[number];

const WEBHOOK_NAME_MESSAGING = "top-rated-team-messaging";
const WEBHOOK_NAME_ACCOUNT_STATUS = "top-rated-team-account-status";

const ACCOUNT_STATUS_EVENTS = [
  "credentials",
  "error",
  "stopped",
  "deleted",
  "ok",
  "reconnected",
  "permissions",
] as const;

export interface UnipileWebhook {
  id: string;
  requestUrl: string;
  source: UnipileWebhookSource | "unknown";
  name: string | null;
}

export type EnsureWebhooksResult =
  | { ok: true; skipped?: "unconfigured" | "no-address-or-secret"; webhooks?: UnipileWebhook[] }
  | { ok: false; line: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function webhookSecret(): string | null {
  const raw = process.env.UNIPILE_WEBHOOK_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** ${PUBLIC_BASE_URL}/api/unipile/inbound, or null when the base is unset. */
export function inboundRequestUrl(): string | null {
  const raw = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  return `${raw}/api/unipile/inbound`;
}

function nameForSource(source: UnipileWebhookSource): string {
  return source === WEBHOOK_SOURCE_MESSAGING ? WEBHOOK_NAME_MESSAGING : WEBHOOK_NAME_ACCOUNT_STATUS;
}

function inferSource(record: Record<string, unknown>): UnipileWebhook["source"] {
  const source = record.source;
  if (source === WEBHOOK_SOURCE_MESSAGING || source === WEBHOOK_SOURCE_ACCOUNT_STATUS) return source;
  const name = asString(record.name);
  if (name === WEBHOOK_NAME_MESSAGING) return WEBHOOK_SOURCE_MESSAGING;
  if (name === WEBHOOK_NAME_ACCOUNT_STATUS) return WEBHOOK_SOURCE_ACCOUNT_STATUS;
  const events = Array.isArray(record.events) ? record.events : [];
  if (events.includes("message_received")) return WEBHOOK_SOURCE_MESSAGING;
  if (events.some((event) => typeof event === "string" && ACCOUNT_STATUS_EVENTS.includes(event as (typeof ACCOUNT_STATUS_EVENTS)[number]))) {
    return WEBHOOK_SOURCE_ACCOUNT_STATUS;
  }
  return "unknown";
}

export function parseWebhook(value: unknown): UnipileWebhook | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const requestUrl = asString(record.request_url);
  if (!id || !requestUrl) return null;
  return { id, requestUrl, source: inferSource(record), name: asString(record.name) };
}

function listItems(body: unknown): unknown[] {
  const record = asRecord(body);
  if (!record) return [];
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  return [];
}

function sameUrl(left: string, right: string): boolean {
  return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
}

function isOurInboundPath(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+$/, "") === "/api/unipile/inbound";
  } catch {
    return false;
  }
}

function webhookHeaders(secret: string): { key: string; value: string }[] {
  return [
    { key: "Content-Type", value: "application/json" },
    { key: UNIPILE_WEBHOOK_AUTH_HEADER, value: secret },
  ];
}

function createBody(source: UnipileWebhookSource, requestUrl: string, secret: string): Record<string, unknown> {
  const base = {
    request_url: requestUrl,
    source,
    name: nameForSource(source),
    format: "json",
    headers: webhookHeaders(secret),
  };
  if (source === WEBHOOK_SOURCE_MESSAGING) {
    return { ...base, events: ["message_received"] };
  }
  return { ...base, events: [...ACCOUNT_STATUS_EVENTS] };
}

export async function listWebhooks(fetchImpl: typeof fetch = fetch): Promise<UnipileResult<UnipileWebhook[]>> {
  const result = await unipileRequest<unknown>({ method: "GET", path: "/webhooks" }, fetchImpl);
  if (!result.ok) return result;
  const webhooks = listItems(result.body)
    .map(parseWebhook)
    .filter((row): row is UnipileWebhook => row !== null);
  return { ok: true, status: result.status, body: webhooks };
}

export async function deleteWebhook(id: string, fetchImpl: typeof fetch = fetch): Promise<UnipileResult<null>> {
  const result = await unipileRequest<unknown>(
    { method: "DELETE", path: `/webhooks/${encodeURIComponent(id)}` },
    fetchImpl,
  );
  if (!result.ok) return result;
  return { ok: true, status: result.status, body: null };
}

export async function createWebhook(
  source: UnipileWebhookSource,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<UnipileWebhook | null>> {
  const requestUrl = inboundRequestUrl();
  const secret = webhookSecret();
  if (!requestUrl || !secret) {
    return { ok: false, error: { type: "unknown", status: 0 }, line: "Unipile is not configured on this deployment." };
  }
  const result = await unipileRequest<unknown>(
    { method: "POST", path: "/webhooks", json: createBody(source, requestUrl, secret) },
    fetchImpl,
  );
  if (!result.ok) return result;
  return { ok: true, status: result.status, body: parseWebhook(result.body) };
}

/**
 * List, keep exactly one messaging and one account_status webhook on our
 * current address, create a missing one, delete retired hosts and duplicates.
 * Never a third source. Called from route registration.
 */
export async function ensureUnipileWebhooks(fetchImpl: typeof fetch = fetch): Promise<EnsureWebhooksResult> {
  if (!available()) return { ok: true, skipped: "unconfigured" };
  const requestUrl = inboundRequestUrl();
  const secret = webhookSecret();
  if (!requestUrl || !secret) return { ok: true, skipped: "no-address-or-secret" };

  const listed = await listWebhooks(fetchImpl);
  if (!listed.ok) return { ok: false, line: listed.line };

  const kept: UnipileWebhook[] = [];
  for (const hook of listed.body) {
    if (isOurInboundPath(hook.requestUrl) && !sameUrl(hook.requestUrl, requestUrl)) {
      const removed = await deleteWebhook(hook.id, fetchImpl);
      if (!removed.ok) return { ok: false, line: removed.line };
      continue;
    }
    kept.push(hook);
  }

  const ours = kept.filter((hook) => sameUrl(hook.requestUrl, requestUrl));
  for (const source of WEBHOOK_SOURCES) {
    const matches = ours.filter((hook) => hook.source === source);
    if (matches.length === 0) {
      const created = await createWebhook(source, fetchImpl);
      if (!created.ok) return { ok: false, line: created.line };
      if (created.body) ours.push(created.body);
      continue;
    }
    for (const extra of matches.slice(1)) {
      const removed = await deleteWebhook(extra.id, fetchImpl);
      if (!removed.ok) return { ok: false, line: removed.line };
    }
  }

  return { ok: true, webhooks: ours.filter((hook) => hook.source !== "unknown" || sameUrl(hook.requestUrl, requestUrl)) };
}
