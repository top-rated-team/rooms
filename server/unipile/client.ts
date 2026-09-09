/**
 * The one HTTP client for Unipile. Four other parcels import this; none of
 * them should grow a second mapper, a second retry policy, or a second
 * opinion about where the key lives.
 *
 * Base URL is `https://${UNIPILE_DSN}/api/v1/...`. The DSN is host and a
 * non-standard port, and it differs per tenant, so it is read from the
 * environment at call time. Authentication is one header, `X-API-KEY`, with
 * no Bearer prefix. That key authorises the whole Unipile workspace, not one
 * account, which is why this directory must never be imported from client
 * code.
 *
 * Env is read as a function, not a module constant: `server/index.ts` loads
 * `.env` in its body, after imported modules have already been evaluated —
 * the same reason `server/db.ts` does this.
 *
 * Retry only 503 and 504. Unipile documents no Retry-After and no numeric
 * quota, so a 429 is not retried, and a 401 is an operator alert rather than
 * another attempt.
 */

import { clearTimeout, setTimeout } from "node:timers";

import { OPERATOR_ALERT_TYPES, parseUnipileError, visitorLine, type UnipileError } from "./errors";

const REQUEST_MS = 10_000;
/** Two pauses, then stop. There is no Retry-After to honour. */
const BACKOFF_MS = [400, 1_200] as const;
const RETRY_STATUSES = new Set([503, 504]);

export const UNIPILE_UNCONFIGURED_LINE =
  "Unipile is not configured on this deployment.";

export const UNIPILE_UNREACHABLE_LINE = "Unipile could not be reached.";

export type UnipileMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface UnipileRequest {
  method?: UnipileMethod;
  /** Path under `/api/v1`, for example `/accounts` or `/accounts/{id}`. */
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** JSON body. Messaging that needs multipart passes `body` instead. */
  json?: unknown;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  /** Injected by tests so retries do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

export type UnipileResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; error: UnipileError; line: string };

function dsnHostPort(): string | null {
  const raw = process.env.UNIPILE_DSN?.trim();
  if (!raw) return null;
  const hostPort = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return hostPort.length > 0 ? hostPort : null;
}

function apiKey(): string | null {
  const raw = process.env.UNIPILE_API_KEY?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function apiRoot(): string | null {
  const hostPort = dsnHostPort();
  if (!hostPort) return null;
  return `https://${hostPort}/api/v1`;
}

/** True when both Unipile env vars are present. Read at call time. */
export function available(): boolean {
  return Boolean(dsnHostPort() && apiKey());
}

/**
 * The sentence a caller puts on screen when Unipile cannot be used. Missing
 * env vars are this line, not a crash and not a dead button.
 */
export function unavailableLine(): string {
  return UNIPILE_UNCONFIGURED_LINE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function joinUrl(root: string, path: string, query: UnipileRequest["query"]): string {
  const stripped = path.replace(/^\/+/, "").replace(/^api\/v1\/?/i, "");
  const url = new URL(`${root}/${stripped}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Called for the three types that mean a person has to fix something, at
 * whatever status they arrive under — the scope trap comes as 401 or 403.
 */
function operatorAlert(error: UnipileError): void {
  const reason =
    error.type === "errors/disconnected_account"
      ? "the linked device fell off and needs re-pairing"
      : error.type === "errors/expired_credentials"
        ? "the provider refresh token died and needs reconnect"
        : error.type === "errors/insufficient_privileges"
          ? "a required scope is missing; calendar scopes are off by default in Unipile"
          : "not retrying";
  console.error(`[unipile] ${error.status} ${error.type} — ${reason}`);
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

function fail(error: UnipileError): UnipileResult<never> {
  return { ok: false, error, line: visitorLine(error) };
}

function unreachable(): UnipileResult<never> {
  return { ok: false, error: { type: "unknown", status: 0 }, line: UNIPILE_UNREACHABLE_LINE };
}

/**
 * One Unipile call. Calendar, messaging and webhook parcels pass the path
 * they own; this file does not know those routes.
 *
 * `fetchImpl` is injected the way `server/bridge/chatwoot.ts` injects it, so
 * the suite never opens a socket.
 */
export async function unipileRequest<T>(
  input: UnipileRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<UnipileResult<T>> {
  const root = apiRoot();
  const key = apiKey();
  if (!root || !key) {
    return { ok: false, error: { type: "unknown", status: 0 }, line: unavailableLine() };
  }

  const method = input.method ?? "GET";
  const url = joinUrl(root, input.path, input.query);
  const headers: Record<string, string> = {
    accept: "application/json",
    ...input.headers,
  };
  delete headers.Authorization;
  delete headers.authorization;
  headers["X-API-KEY"] = key;

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "DELETE") {
    if (input.body != null) {
      body = input.body;
    } else if (input.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(input.json);
    }
  }

  const wait = input.sleep ?? sleep;
  let last: Response | null = null;

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_MS);
    try {
      last = await fetchImpl(url, { method, headers, body, signal: ac.signal });
    } catch {
      return unreachable();
    } finally {
      clearTimeout(timer);
    }

    if (last.status === 401) {
      const parsed = parseUnipileError(last.status, await readBody(last));
      operatorAlert(parsed);
      return fail(parsed);
    }

    if (!RETRY_STATUSES.has(last.status) || attempt === BACKOFF_MS.length) break;
    await wait(BACKOFF_MS[attempt]);
  }

  if (!last) return unreachable();

  const parsedBody = await readBody(last);
  if (last.ok) {
    return { ok: true, status: last.status, body: parsedBody as T };
  }
  const parsed = parseUnipileError(last.status, parsedBody);
  /* Not only on 401: a missing scope arrives as 403 as readily, and it is the
     same job for the same person in the same dashboard. */
  if (OPERATOR_ALERT_TYPES.has(parsed.type)) operatorAlert(parsed);
  return fail(parsed);
}
