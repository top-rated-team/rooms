/**
 * A reserved slot with a planted WhatsApp code. Not a booking. Nothing is
 * written to the calendar here; confirm.ts does that when the inbound
 * matcher fires, and only then.
 *
 * The hold expires with the code — five minutes — because a slot held by
 * somebody who walked away is a slot nobody can book. The 409 path already
 * covers two people reaching for the same time.
 *
 * The WhatsApp path is house-only. WHATSAPP_URL in shared/roster.ts is the
 * owner's own mobile; a fork inherits that constant verbatim, so handing it
 * out off a house host would send a visitor to a phone in Prague.
 */

import type { HoldBookingResponse } from "@shared/api";
import { isHouseHost } from "@shared/operator";
import { WHATSAPP_URL } from "@shared/roster";
import { available } from "../unipile/client";
import { waMeUrl } from "../waha";
import { bookingConfirmMessage, mintBookingCode } from "./code";

export const HOLD_TTL_MS = 5 * 60_000;

export const ADDRESS_REQUIRED_LINE =
  "An address is required. Type it, or sign in with LinkedIn when that is on. This page does not take a booking without one.";

export const HOST_LINKEDIN_LINE = "Dan Burykin: https://www.linkedin.com/in/burykin/";

export interface HoldDraft {
  date: string;
  time: string;
  name: string;
  topic: string;
  timezone: string;
  startsAt: string;
}

export interface BookingHold extends HoldDraft {
  code: string;
  createdAt: number;
  chatId: string | null;
  eventId: string | null;
  meetUrl: string | null;
  confirmedAt: string | null;
}

const holds = new Map<string, BookingHold>();

function sweep(now: number): void {
  for (const [code, row] of holds) {
    if (row.eventId) {
      if (now - row.createdAt > HOLD_TTL_MS * 3) holds.delete(code);
      continue;
    }
    if (now - row.createdAt > HOLD_TTL_MS * 3) holds.delete(code);
  }
}

function ourDigits(): string {
  const match = /wa\.me\/(\d+)/.exec(WHATSAPP_URL);
  return match?.[1] ?? "420774654822";
}

/**
 * True only on a house host with Unipile configured. Off a house host there
 * is no gate and no no-address path — a fork must never be offered this number.
 */
export function whatsappGateAllowed(hostOrUrl?: string): boolean {
  if (!available()) return false;
  const probe = hostOrUrl?.trim() || process.env.PUBLIC_BASE_URL?.trim() || "http://localhost";
  return isHouseHost(probe);
}

export function resetHoldsForTests(): void {
  holds.clear();
}

export function getHold(codeRaw: string): BookingHold | undefined {
  return holds.get(codeRaw.trim().toUpperCase());
}

/** Live unproven holds, plus proved ones still inside the sweep window. */
export function activeHeldSlots(now = Date.now()): { date: string; time: string }[] {
  sweep(now);
  const out: { date: string; time: string }[] = [];
  for (const row of holds.values()) {
    if (row.eventId) {
      out.push({ date: row.date, time: row.time });
      continue;
    }
    if (now - row.createdAt > HOLD_TTL_MS) continue;
    out.push({ date: row.date, time: row.time });
  }
  return out;
}

export function slotIsHeld(date: string, time: string, now = Date.now()): boolean {
  return activeHeldSlots(now).some((row) => row.date === date && row.time === time);
}

export function holdToResponse(hold: BookingHold): HoldBookingResponse {
  return {
    booked: false,
    held: true,
    startsAt: hold.startsAt,
    timezone: hold.timezone,
    meetUrl: null,
    invited: false,
    whatsapp: {
      url: waMeUrl(ourDigits(), bookingConfirmMessage(hold.code)),
      code: hold.code,
    },
    expiresAt: new Date(hold.createdAt + HOLD_TTL_MS).toISOString(),
  };
}

export function placeHold(draft: HoldDraft, now = Date.now()): BookingHold | { taken: true } {
  sweep(now);
  if (slotIsHeld(draft.date, draft.time, now)) return { taken: true };
  const code = mintBookingCode();
  const hold: BookingHold = {
    ...draft,
    code,
    createdAt: now,
    chatId: null,
    eventId: null,
    meetUrl: null,
    confirmedAt: null,
  };
  holds.set(code, hold);
  return hold;
}

export function bindHoldChat(code: string, chatId: string, now = Date.now()): BookingHold | null {
  const row = getHold(code);
  if (!row) return null;
  if (!row.eventId && now - row.createdAt > HOLD_TTL_MS) return null;
  if (row.chatId && row.chatId !== chatId) return null;
  row.chatId = chatId;
  return row;
}

export function markHoldBooked(
  code: string,
  input: { eventId: string; meetUrl: string | null; at: string },
): BookingHold | null {
  const row = getHold(code);
  if (!row) return null;
  row.eventId = input.eventId;
  row.meetUrl = input.meetUrl;
  row.confirmedAt = input.at;
  return row;
}

/**
 * Who is on the call, with LinkedIn profiles where we have them. The host
 * line is a constant. A visitor line is added only when Sign in with LinkedIn
 * actually handed a profile over — never inferred from a name.
 */
export function bookingEventDescription(input: {
  topic: string;
  visitorProfile?: { name: string; url: string };
}): string {
  const lines = [HOST_LINKEDIN_LINE];
  if (input.visitorProfile) {
    lines.push(`${input.visitorProfile.name}: ${input.visitorProfile.url}`);
  }
  if (input.topic.trim()) {
    lines.push("", input.topic.trim());
  }
  return lines.join("\n");
}
