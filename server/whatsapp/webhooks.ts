/**
 * The inbound webhook, reconciled in code rather than in a dashboard.
 *
 * A hosted WhatsApp API delivers inbound messages by POSTing to an address we
 * give it. This keeps that address correct: it lists what the tenant has,
 * deletes any of ours that point at a path we no longer serve, creates what is
 * missing, and removes duplicates. That is what makes moving the inbound path
 * a one-line change rather than a dashboard errand.
 *
 * It names no vendor. Base URL, key, account and secret all come from the
 * environment — see server/whatsapp/hosted.ts. WAHA configures its webhook at
 * its own end, so this does nothing there.
 */

import {
  HOSTED_UNCONFIGURED_LINE,
  hostedConfigured,
  hostedRequest,
  hostedWebhookHeader,
  hostedWebhookSecret,
  type HostedResult,
} from "./hosted";

/**
 * Where the webhooks post. No vendor in it: this repository is public and
 * forkable, a fork's provider may not be the one we use, and an address is
 * the one part of a deployment a stranger reads before anything else.
 */
export const INBOUND_PATH = "/api/hooks/inbound";

/**
 * Addresses we used to answer on, so the reconciler can recognise its own old
 * webhooks and delete them rather than leave them posting into a path that no
 * longer exists.
 *
 * EMPTY, AND CHECKED RATHER THAN ASSUMED. On 17 September 2026 the live
 * tenant's webhook list was read: the only two rows belonging to this
 * deployment are messaging and account_status, both already on INBOUND_PATH.
 * The one retired address this list used to carry named a vendor, and nothing
 * pointed at it any more. Add an entry here the day an address changes, not
 * before.
 */
export const RETIRED_INBOUND_PATHS: readonly string[] = [];

/** The header the hosted transport echoes back to us. Their own docs use this name. */
export const INBOUND_AUTH_HEADER = hostedWebhookHeader();

export const WEBHOOK_SOURCE_MESSAGING = "messaging";
/**
 * From the Create a webhook OpenAPI, title "Account status webhook",
 * source enum: ["account_status"].
 * https://developer.the hosted transport.com/reference/webhookscontroller_createwebhook
 */
export const WEBHOOK_SOURCE_ACCOUNT_STATUS = "account_status";

export const WEBHOOK_SOURCES = [WEBHOOK_SOURCE_MESSAGING, WEBHOOK_SOURCE_ACCOUNT_STATUS] as const;
export type InboundWebhookSource = (typeof WEBHOOK_SOURCES)[number];

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

export interface InboundWebhook {
  id: string;
  requestUrl: string;
  source: InboundWebhookSource | "unknown";
  name: string | null;
}

export type EnsureWebhooksResult =
  | { ok: true; skipped?: "unconfigured" | "no-address-or-secret"; webhooks?: InboundWebhook[] }
  | { ok: false; line: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}


/** ${PUBLIC_BASE_URL}${INBOUND_PATH}, or null when the base is unset. */
export function inboundRequestUrl(): string | null {
  const raw = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  return `${raw}${INBOUND_PATH}`;
}

function nameForSource(source: InboundWebhookSource): string {
  return source === WEBHOOK_SOURCE_MESSAGING ? WEBHOOK_NAME_MESSAGING : WEBHOOK_NAME_ACCOUNT_STATUS;
}

function inferSource(record: Record<string, unknown>): InboundWebhook["source"] {
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

export function parseWebhook(value: unknown): InboundWebhook | null {
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

/**
 * The retired list is empty today, so the second argument is what keeps the
 * migration mechanism honest: a test hands it a retired address and proves the
 * reconciler still recognises, deletes and remakes its own webhooks. Without
 * that seam the day an address moves is the day the mechanism is first
 * exercised, on a live tenant.
 */
export function isOurInboundPath(
  url: string,
  retired: readonly string[] = RETIRED_INBOUND_PATHS,
): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path === INBOUND_PATH || retired.includes(path);
  } catch {
    return false;
  }
}

function webhookHeaders(secret: string): { key: string; value: string }[] {
  return [
    { key: "Content-Type", value: "application/json" },
    { key: INBOUND_AUTH_HEADER, value: secret },
  ];
}

function createBody(source: InboundWebhookSource, requestUrl: string, secret: string): Record<string, unknown> {
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

export async function listWebhooks(fetchImpl: typeof fetch = fetch): Promise<HostedResult<InboundWebhook[]>> {
  const result = await hostedRequest<unknown>({ method: "GET", path: "/webhooks" }, fetchImpl);
  if (!result.ok) return result;
  const webhooks = listItems(result.body)
    .map(parseWebhook)
    .filter((row): row is InboundWebhook => row !== null);
  return { ok: true, status: result.status, body: webhooks };
}

export async function deleteWebhook(id: string, fetchImpl: typeof fetch = fetch): Promise<HostedResult<null>> {
  const result = await hostedRequest<unknown>(
    { method: "DELETE", path: `/webhooks/${encodeURIComponent(id)}` },
    fetchImpl,
  );
  if (!result.ok) return result;
  return { ok: true, status: result.status, body: null };
}

export async function createWebhook(
  source: InboundWebhookSource,
  fetchImpl: typeof fetch = fetch,
): Promise<HostedResult<InboundWebhook | null>> {
  const requestUrl = inboundRequestUrl();
  const secret = hostedWebhookSecret();
  if (!requestUrl || !secret) {
    return { ok: false, status: 0, line: HOSTED_UNCONFIGURED_LINE };
  }
  const result = await hostedRequest<unknown>(
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
export async function ensureInboundWebhooks(
  fetchImpl: typeof fetch = fetch,
  /* Same seam as isOurInboundPath, and for the same reason: the production
     list is empty, so without it the migration path is never exercised until
     it runs for real. */
  retired: readonly string[] = RETIRED_INBOUND_PATHS,
): Promise<EnsureWebhooksResult> {
  if (!hostedConfigured()) return { ok: true, skipped: "unconfigured" };
  const requestUrl = inboundRequestUrl();
  const secret = hostedWebhookSecret();
  if (!requestUrl || !secret) return { ok: true, skipped: "no-address-or-secret" };

  const listed = await listWebhooks(fetchImpl);
  if (!listed.ok) return { ok: false, line: listed.line };

  const kept: InboundWebhook[] = [];
  for (const hook of listed.body) {
    if (isOurInboundPath(hook.requestUrl, retired) && !sameUrl(hook.requestUrl, requestUrl)) {
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
