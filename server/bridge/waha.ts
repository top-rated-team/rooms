/**
 * The two-way WAHA client: send a text, and read an inbound webhook body.
 *
 * WAHA runs on another host. This file talks to it over its HTTP API with
 * `X-Api-Key`, the same env as server/waha.ts (the one-way identity probe).
 * When the host is down, unconfigured, or returns a non-2xx, send fails with
 * a sentence — the caller marks that on the message. Nothing is dropped on
 * the floor, and a phone number is not logged.
 */

import { clearTimeout, setTimeout } from "node:timers";

const SEND_MS = 5_000;

export const WAHA_SEND_UNCONFIGURED = "WhatsApp is not configured on this deployment.";
export const WAHA_SEND_FAILED = "WhatsApp could not be reached.";

export interface WahaSendInput {
  chatId: string;
  text: string;
}

export type WahaSendResult = { ok: true } | { ok: false; line: string };

export interface WahaInbound {
  chatId: string;
  /** The person who wrote it in a group; null in a 1:1 chat. */
  participant: string | null;
  body: string;
  fromMe: boolean;
  shared: boolean;
}

function wahaBaseUrl(): string | null {
  const raw = process.env.WAHA_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function wahaSession(): string {
  const raw = process.env.WAHA_SESSION?.trim();
  return raw && raw.length > 0 ? raw : "default";
}

function wahaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const key = process.env.WAHA_API_KEY?.trim();
  if (key) headers["X-Api-Key"] = key;
  return headers;
}

export function isWhatsAppGroup(chatId: string): boolean {
  return chatId.includes("@g.us") || chatId.includes("@g.id");
}

/**
 * POSTs one attributed text to a chat. The body must already have been through
 * `buildOutboundPayload` — this function does not add a name, and it does not
 * accept a room token field.
 */
export async function sendWahaText(
  input: WahaSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<WahaSendResult> {
  const base = wahaBaseUrl();
  if (!base) return { ok: false, line: WAHA_SEND_UNCONFIGURED };

  const url = `${base}/api/sendText`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SEND_MS);
  const payload = {
    session: wahaSession(),
    chatId: input.chatId,
    text: input.text,
  };

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: wahaHeaders(),
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, line: WAHA_SEND_FAILED };
    return { ok: true };
  } catch {
    return { ok: false, line: WAHA_SEND_FAILED };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Pulls the fields we are allowed to look at off a WAHA webhook body and
 * drops the rest. `fromMe` is how we refuse to echo our own outbound. A
 * group is `shared`. The participant, not the push name, is the sender.
 */
export function parseWahaInbound(raw: unknown): WahaInbound | null {
  const root = asRecord(raw);
  if (!root) return null;
  const payload = asRecord(root.payload) ?? root;
  const chatId = stringField(payload, "from") ?? stringField(payload, "chatId");
  if (!chatId) return null;
  const body = stringField(payload, "body") ?? stringField(payload, "text") ?? "";
  const fromMe = payload.fromMe === true;
  const participant = stringField(payload, "participant");
  const shared = isWhatsAppGroup(chatId);
  return {
    chatId,
    participant: shared ? participant : null,
    body,
    fromMe,
    shared,
  };
}
