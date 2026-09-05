/**
 * The single way the client talks to the REST API.
 *
 * Errors are normalised to `ApiError` so callers can branch on `status` (404 =
 * dead workspace token, 429 = rate limited) instead of string-matching. Note
 * that neither the thrown message nor anything logged here contains the request
 * path: workspace URLs carry a bearer token and must not end up in a console
 * trace, a bug report or an error-reporting service.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export class ApiError extends Error {
  readonly status: number;

  /** 0 means the request never reached the server (offline, DNS, CORS). */
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
}

export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal: options?.signal,
    });
  } catch (cause) {
    // An aborted request is the caller's own doing — let it propagate as-is so
    // TanStack Query and effect cleanups can recognise it.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0, { cause });
  }

  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res), res.status);
  }

  if (res.status === 204 || res.status === 205) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new ApiError("The server returned a response that was not JSON.", res.status, { cause });
  }
}

/** Server contract: every failure is `{ error: string }`. Anything else is a
 * proxy or a crash page, and its body is never shown to the visitor. */
async function readErrorMessage(res: Response): Promise<string> {
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    /* Body unreadable — fall back to the status line. */
  }

  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === "object") {
        const message = (parsed as { error?: unknown }).error;
        if (typeof message === "string" && message.trim()) return message.trim();
      }
    } catch {
      /* Not JSON. */
    }
  }

  if (res.status === 404) return "Not found.";
  if (res.status === 429) return "Too many requests. Give it a minute and try again.";
  return res.statusText ? `${res.statusText} (${res.status})` : `Request failed with status ${res.status}`;
}
