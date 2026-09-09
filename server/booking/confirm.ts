/**
 * Plant a booking code, match the inbound WhatsApp that carries it, and
 * answer GET /api/booking/confirmed. The seven inbound checks belong to
 * server/unipile/inbound.ts; this file registers a matcher and does not
 * parse a webhook itself.
 *
 * The code expires in five minutes. A booking code from a different chat
 * than the one that first presented it is not a match.
 */

import type { BookingConfirmedResponse } from "@shared/api";
import { WHATSAPP_URL } from "@shared/roster";
import { waMeUrl } from "../waha";
import { registerInboundMatcher, type AcceptedInboundMessage } from "../unipile/inbound";
import { BOOKING_CODE_RE, bookingConfirmMessage, extractBookingCode, mintBookingCode } from "./code";

export const BOOKING_CODE_TTL_MS = 5 * 60_000;

interface PlantedCode {
  code: string;
  createdAt: number;
  confirmedAt: string | null;
  chatId: string | null;
}

const planted = new Map<string, PlantedCode>();
let matcherInstalled = false;

function sweep(now: number): void {
  for (const [code, row] of planted) {
    if (now - row.createdAt > BOOKING_CODE_TTL_MS * 3) planted.delete(code);
  }
}

function ourDigits(): string {
  const match = /wa\.me\/(\d+)/.exec(WHATSAPP_URL);
  return match?.[1] ?? "420774654822";
}

export function resetBookingCodesForTests(): void {
  planted.clear();
  matcherInstalled = false;
}

export function plantBookingCode(now = Date.now()): { code: string; url: string } {
  sweep(now);
  const code = mintBookingCode();
  planted.set(code, { code, createdAt: now, confirmedAt: null, chatId: null });
  const url = waMeUrl(ourDigits(), bookingConfirmMessage(code));
  return { code, url };
}

export function getBookingConfirmed(codeRaw: string, now = Date.now()): BookingConfirmedResponse {
  sweep(now);
  const code = codeRaw.trim().toUpperCase();
  const row = planted.get(code);
  if (!row || !row.confirmedAt) return { confirmed: false };
  return { confirmed: true, at: row.confirmedAt };
}

function onBookingMessage(message: AcceptedInboundMessage): void {
  const code = extractBookingCode(message.message);
  if (!code) return;
  const row = planted.get(code);
  if (!row) return;
  const now = Date.now();
  if (now - row.createdAt > BOOKING_CODE_TTL_MS) return;
  if (row.chatId && row.chatId !== message.chatId) return;
  row.chatId = message.chatId;
  if (!row.confirmedAt) row.confirmedAt = message.timestamp;
}

export function installBookingInbound(): void {
  if (matcherInstalled) return;
  matcherInstalled = true;
  registerInboundMatcher(onBookingMessage);
}

/** Test seam: the planted regex is the same object the matcher uses. */
export { BOOKING_CODE_RE };
