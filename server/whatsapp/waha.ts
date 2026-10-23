/**
 * The WAHA transport. Send and inbound parse come from server/bridge/waha.ts
 * — that file already does both, and this one does not grow a second client.
 *
 * Our own number and whether the session is alive are asked of
 * GET /api/sessions/{session}. WAHA puts our id on `me.id` (digits, or
 * digits@c.us). A session that is not WORKING is not a route.
 */

import { clearTimeout, setTimeout } from "node:timers";

import { isWhatsAppGroup, parseWahaInbound, sendWahaText } from "../bridge/waha";
import type { AliveResult, ProbeResult, SendResult } from "./types";

const REQUEST_MS = 5_000;

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
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.WAHA_API_KEY?.trim();
  if (key) headers["X-Api-Key"] = key;
  return headers;
}

export function wahaConfigured(): boolean {
  return Boolean(wahaBaseUrl());
}

export function wahaWebhookSecret(): string | null {
  const raw = process.env.WAHA_WEBHOOK_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export { isWhatsAppGroup, parseWahaInbound };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Digits only, which is what wa.me wants. A LID or a short fragment is not a number. */
export function digitsFromMeId(id: string): string | null {
  const trimmed = id.trim();
  const beforeAt = trimmed.includes("@") ? trimmed.slice(0, trimmed.indexOf("@")) : trimmed;
  const digits = beforeAt.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function digitsFromSessionBody(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  const me = asRecord(record.me);
  if (me) {
    for (const key of ["id", "wid", "jid", "phone"] as const) {
      const value = me[key];
      if (typeof value === "string") {
        const digits = digitsFromMeId(value);
        if (digits) return digits;
      }
    }
  }
  if (typeof record.id === "string") {
    const digits = digitsFromMeId(record.id);
    if (digits) return digits;
  }
  return null;
}

function sessionIsWorking(body: unknown): boolean {
  const record = asRecord(body);
  if (!record) return false;
  const status = asString(record.status);
  if (!status) return false;
  return status === "WORKING" || status === "WORKING_STATUS";
}

async function readSession(fetchImpl: typeof fetch): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
  const base = wahaBaseUrl();
  if (!base) return { ok: false, status: 0 };
  const url = `${base}/api/sessions/${encodeURIComponent(wahaSession())}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_MS);
  try {
    const res = await fetchImpl(url, { method: "GET", headers: wahaHeaders(), signal: ac.signal });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendWaha(
  input: { chatId: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  return sendWahaText(input, fetchImpl);
}

export async function probeWahaTransport(fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  if (!wahaConfigured()) {
    return { ok: false, line: "WhatsApp is not configured on this deployment, so LinkedIn is the way to bind this room." };
  }
  const result = await readSession(fetchImpl);
  if (!result.ok) {
    if (result.status === 404) {
      return { ok: false, line: "WhatsApp is not connected right now, so LinkedIn is the way to bind this room." };
    }
    return { ok: false, line: "WhatsApp is not reachable from this page right now, so LinkedIn is the way to bind this room." };
  }
  if (!sessionIsWorking(result.body)) {
    return { ok: false, line: "WhatsApp is not connected right now, so LinkedIn is the way to bind this room." };
  }
  const digits = digitsFromSessionBody(result.body);
  if (!digits) {
    return { ok: false, line: "WhatsApp is not connected right now, so LinkedIn is the way to bind this room." };
  }
  return { ok: true, digits };
}

export async function wahaIsAlive(fetchImpl: typeof fetch = fetch): Promise<AliveResult> {
  const probe = await probeWahaTransport(fetchImpl);
  return probe.ok ? { ok: true } : { ok: false, line: probe.line };
}

export function wahaSessionName(): string {
  return wahaSession();
}
