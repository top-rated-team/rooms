/**
 * A generic hosted-API adapter for WhatsApp. It names no vendor.
 *
 * This file is honestly a generic adapter: base URL, auth header, account
 * ids and webhook secret all come from the environment. They are values on
 * a deployment, not strings in this repository. Where a request or response
 * shape is specific to the service a house host happens to use, the shape
 * is described here and the vendor-specific transcript lives in
 * private/hosted-whatsapp-api.md for whoever maintains that tenant.
 *
 * Environment (read at call time, because server/index.ts loads .env after
 * modules are evaluated):
 *
 *   HOSTED_WHATSAPP_BASE_URL     full origin plus API prefix, e.g. https://host:port/api/v1
 *   HOSTED_WHATSAPP_AUTH_HEADER  header name for the key; default X-API-KEY, no Bearer
 *   HOSTED_WHATSAPP_API_KEY      the key; never sent to the browser
 *   HOSTED_WHATSAPP_ACCOUNT_ID   the WhatsApp account this deployment operates
 *   HOSTED_WHATSAPP_WEBHOOK_SECRET
 *   HOSTED_WHATSAPP_WEBHOOK_HEADER  header the webhook echoes the secret in
 *
 * Every house host is configured under these names. There are no aliases and
 * no second contract: a deployment either has them or has no hosted
 * transport, and the vendor-specific transcript lives in
 * private/hosted-whatsapp-api.md for whoever maintains that tenant.
 */

import { clearTimeout, setTimeout } from "node:timers";

import type { AliveResult, ProbeResult, SendResult } from "./types";
import { digitsFromMeId } from "./waha";

const REQUEST_MS = 20_000;
const BACKOFF_MS = [400, 1_200] as const;
const RETRY_STATUSES = new Set([503, 504]);

export const HOSTED_UNCONFIGURED_LINE =
  "WhatsApp is not configured on this deployment, so LinkedIn is the way to bind this room.";
const UNAVAILABLE_LINE =
  "WhatsApp is not reachable from this page right now, so LinkedIn is the way to bind this room.";
const DISCONNECTED_LINE =
  "WhatsApp is not connected right now, so LinkedIn is the way to bind this room.";
const SEND_UNCONFIGURED = "WhatsApp is not configured on this deployment.";
const SEND_FAILED = "WhatsApp could not be reached.";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function env(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/*
 * THE ALIASES ARE GONE. This file carried a `legacy()` switch reading the
 * names an older dashboard used, so the house could keep its number and its
 * chat-id hashes without a migration — which was the right call while those
 * were the only names set. They are set under the HOSTED_WHATSAPP_ names now,
 * so the aliases bought nothing and cost the one thing this file exists to
 * avoid: a vendor's name in a tracked file. One of them was wrong as well —
 * it named an auth header this API does not use, and nothing ever called it.
 */

export function hostedBaseUrl(): string | null {
  const generic = env("HOSTED_WHATSAPP_BASE_URL");
  return generic ? generic.replace(/\/+$/, "") : null;
}

function hostedApiKey(): string | null {
  return env("HOSTED_WHATSAPP_API_KEY");
}

function hostedAuthHeaderName(): string {
  return env("HOSTED_WHATSAPP_AUTH_HEADER") ?? "X-API-KEY";
}

export function hostedAccountId(): string {
  return env("HOSTED_WHATSAPP_ACCOUNT_ID") ?? "";
}

export function hostedWebhookSecret(): string | null {
  return env("HOSTED_WHATSAPP_WEBHOOK_SECRET");
}

export function hostedWebhookHeader(): string {
  return env("HOSTED_WHATSAPP_WEBHOOK_HEADER") ?? "X-Webhook-Secret";
}

export function hostedConfigured(): boolean {
  return Boolean(hostedBaseUrl() && hostedApiKey());
}

function joinUrl(root: string, path: string, query?: Record<string, string | undefined>): string {
  const stripped = path.replace(/^\/+/, "").replace(/^api\/v1\/?/i, "");
  const url = new URL(`${root.replace(/\/+$/, "")}/${stripped}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export type HostedResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; line: string };

export async function hostedRequest<T>(
  input: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    query?: Record<string, string | undefined>;
    json?: unknown;
    body?: BodyInit | null;
  },
  fetchImpl: typeof fetch,
): Promise<HostedResult<T>> {
  const root = hostedBaseUrl();
  const key = hostedApiKey();
  if (!root || !key) return { ok: false, status: 0, line: HOSTED_UNCONFIGURED_LINE };

  const method = input.method ?? "GET";
  const url = joinUrl(root, input.path, input.query);
  const headers: Record<string, string> = { accept: "application/json" };
  headers[hostedAuthHeaderName()] = key;

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "DELETE") {
    if (input.body != null) body = input.body;
    else if (input.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(input.json);
    }
  }

  let last: Response | null = null;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_MS);
    try {
      last = await fetchImpl(url, { method, headers, body, signal: ac.signal });
    } catch {
      return { ok: false, status: 0, line: UNAVAILABLE_LINE };
    } finally {
      clearTimeout(timer);
    }
    if (!RETRY_STATUSES.has(last.status) || attempt === BACKOFF_MS.length) break;
    await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt]));
  }
  if (!last) return { ok: false, status: 0, line: UNAVAILABLE_LINE };
  const parsed = await readBody(last);
  if (last.ok) return { ok: true, status: last.status, body: parsed as T };
  return { ok: false, status: last.status, line: last.status === 404 ? DISCONNECTED_LINE : UNAVAILABLE_LINE };
}

/**
 * Pull digits off an account body without keeping the body. Phone numbers
 * live under connection_params.im.phone_number on the hosted account shape;
 * the rest of the body is dropped. A LID-shaped id is not a number.
 */
export function digitsFromAccountBody(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;

  const params = asRecord(record.connection_params);
  if (params) {
    const im = asRecord(params.im);
    const fromIm = im && typeof im.phone_number === "string" ? digitsFromMeId(im.phone_number) : null;
    if (fromIm) return fromIm;
    if (typeof params.phone_number === "string") {
      const fromParams = digitsFromMeId(params.phone_number);
      if (fromParams) return fromParams;
    }
  }

  if (typeof record.id === "string") {
    const fromId = digitsFromMeId(record.id);
    if (fromId) return fromId;
  }
  return null;
}

function sourceIsOk(body: unknown): boolean {
  const record = asRecord(body);
  if (!record) return false;
  const sources = Array.isArray(record.sources) ? record.sources : [];
  return sources.some((source) => {
    const row = asRecord(source);
    return row?.status === "OK";
  });
}

export async function sendHosted(
  input: { chatId: string; text: string; accountId?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  if (!hostedConfigured()) return { ok: false, line: SEND_UNCONFIGURED };
  const form = new FormData();
  form.append("text", input.text);
  const accountId = input.accountId?.trim() || hostedAccountId();
  if (accountId) form.append("account_id", accountId);

  const result = await hostedRequest<{ message_id?: unknown }>(
    {
      method: "POST",
      path: `/chats/${encodeURIComponent(input.chatId)}/messages`,
      body: form,
    },
    fetchImpl,
  );
  if (!result.ok) return { ok: false, line: result.status === 0 ? SEND_UNCONFIGURED : SEND_FAILED };
  const messageId = asString(result.body?.message_id);
  if (!messageId) return { ok: false, line: SEND_FAILED };
  return { ok: true };
}

export async function probeHosted(fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  if (!hostedConfigured()) return { ok: false, line: HOSTED_UNCONFIGURED_LINE };
  const accountId = hostedAccountId();
  if (!accountId) {
    /* Base URL and key are set but no account id — the host is reachable in
       principle and the visitor sentence is the unreachable one, not the
       unconfigured one. */
    return { ok: false, line: UNAVAILABLE_LINE };
  }
  try {
    const result = await hostedRequest<unknown>(
      { method: "GET", path: `/accounts/${encodeURIComponent(accountId)}` },
      fetchImpl,
    );
    if (!result.ok) {
      if (result.status === 404) return { ok: false, line: DISCONNECTED_LINE };
      return { ok: false, line: UNAVAILABLE_LINE };
    }
    if (!sourceIsOk(result.body)) return { ok: false, line: DISCONNECTED_LINE };
    const digits = digitsFromAccountBody(result.body);
    if (!digits) return { ok: false, line: DISCONNECTED_LINE };
    return { ok: true, digits };
  } catch {
    return { ok: false, line: UNAVAILABLE_LINE };
  }
}

export async function hostedIsAlive(fetchImpl: typeof fetch = fetch): Promise<AliveResult> {
  const probe = await probeHosted(fetchImpl);
  return probe.ok ? { ok: true } : { ok: false, line: probe.line };
}
