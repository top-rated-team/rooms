/**
 * A reserved slot with a planted WhatsApp code. Not a booking. Nothing is
 * written to the calendar here; confirm.ts does that when the inbound
 * matcher fires, and only then.
 *
 * The hold expires with the code — five minutes — because a slot held by
 * somebody who walked away is a slot nobody can book. The 409 path already
 * covers two people reaching for the same time.
 *
 * Confirmed bookings live in a second map, keyed by the same code, until the
 * call time passes or they are cancelled. That code is the credential for
 * coming back; a browser flag that merely points at it is not.
 *
 * The WhatsApp path is house-only. WHATSAPP_URL in shared/roster.ts is the
 * owner's own mobile; a fork inherits that constant verbatim, so handing it
 * out off a house host would send a visitor to a phone in Prague.
 */

import { randomBytes } from "node:crypto";

import type { ExistingBookingResponse, HoldBookingResponse } from "@shared/api";
import { isHouseHost } from "@shared/operator";
import { WHATSAPP_URL } from "@shared/roster";
import { bookings as bookingsTable, type BookingRow } from "@shared/schema-bookings";
import { getDb, hasDb } from "../db";
import { SLOT_MINUTES } from "./slots";
import { whatsappConfigured } from "../whatsapp";
import { waMeUrl } from "../waha";
import { bookingConfirmMessage, mintBookingCode, normalizeBookingCode } from "./code";

export const HOLD_TTL_MS = 5 * 60_000;

export const ADDRESS_REQUIRED_LINE =
  "An address is required. Type it, or sign in with LinkedIn when that is on. This page does not take a booking without one.";

export const HOST_LINKEDIN_LINE = "Dan Burykin: https://www.linkedin.com/in/burykin/";

export const BOOKING_GONE_LINE = "That booking is not here.";
export const BOOKING_MOVED_LINE = "The call has been moved.";
export const BOOKING_CANCELLED_LINE = "The call has been cancelled.";

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
  /** How long it holds the slot unproven: five minutes for WhatsApp, longer for email. */
  ttlMs: number;
  /**
   * How it is proved. A WhatsApp hold by the planted code arriving; an email
   * hold only by the link sent to `email` (confirm-email.ts) — never by a
   * WhatsApp message, because that would prove nothing about the address.
   */
  via: "whatsapp" | "email";
  email: string | null;
  /** The secret in the emailed link. Null on a WhatsApp hold. */
  confirmToken: string | null;
  chatId: string | null;
  eventId: string | null;
  meetUrl: string | null;
  confirmedAt: string | null;
}

/**
 * A booking that can be shown, changed or cancelled. Keyed by the planted
 * code, which is the credential. The browser's flag is only a pointer to
 * this key; looking it up here is what decides whether anything is shown.
 */
export interface StoredBooking {
  code: string;
  eventId: string;
  calendarId: string;
  date: string;
  time: string;
  startsAt: string;
  timezone: string;
  meetUrl: string | null;
  invited: boolean;
  /** Present only when they typed an address or LinkedIn handed one over. */
  email: string | null;
  /** The chat that proved a WhatsApp hold. Never a chat that did not. */
  chatId: string | null;
  name: string;
  topic: string;
  createdAt: number;
  cancelledAt: number | null;
}

/**
 * A HOLD lives in memory on purpose: five minutes, and a page that walked
 * away should not leave a row behind. A BOOKING must not — it outlives the
 * process, and it lived in this Map until a review pointed out that every
 * deploy silently voided every return link while the call still stood. The
 * Map is a cache in front of the table now, hydrated at boot.
 */
const holds = new Map<string, BookingHold>();
/* Email holds by their link's token, so a lookup is a hash lookup and not a
   walk that compares secrets one character at a time. */
const holdsByToken = new Map<string, string>();
const bookings = new Map<string, StoredBooking>();

/** Tests run without a database and still have to exercise the durable path. */
let memoryOnlyForTests = false;
export function setBookingMemoryOnlyForTests(on: boolean): void {
  memoryOnlyForTests = on;
}

function bookingRow(row: StoredBooking) {
  return {
    code: row.code,
    calendarId: row.calendarId,
    eventId: row.eventId,
    startsAt: new Date(row.startsAt),
    date: row.date,
    time: row.time,
    timezone: row.timezone,
    meetUrl: row.meetUrl,
    invited: row.invited,
    email: row.email,
    chatId: row.chatId,
    name: row.name,
    topic: row.topic,
    createdAt: new Date(row.createdAt),
    cancelledAt: row.cancelledAt == null ? null : new Date(row.cancelledAt),
  };
}

function fromRow(row: BookingRow): StoredBooking {
  return {
    code: row.code,
    calendarId: row.calendarId,
    eventId: row.eventId,
    startsAt: row.startsAt.toISOString(),
    date: row.date,
    time: row.time,
    timezone: row.timezone,
    meetUrl: row.meetUrl,
    invited: row.invited,
    email: row.email,
    chatId: row.chatId,
    name: row.name,
    topic: row.topic,
    createdAt: row.createdAt.getTime(),
    cancelledAt: row.cancelledAt == null ? null : row.cancelledAt.getTime(),
  };
}

/**
 * Read the live bookings back at boot. Failure is logged and not thrown: a
 * database that is briefly away must not stop the site answering, and the
 * next write will try again.
 */
export async function hydrateBookings(): Promise<void> {
  if (memoryOnlyForTests || !hasDb()) return;
  const db = getDb();
  if (!db) return;
  try {
    for (const row of await db.select().from(bookingsTable)) {
      const stored = fromRow(row);
      if (stored.cancelledAt == null) bookings.set(stored.code, stored);
    }
  } catch (error) {
    console.error("[booking] could not read the bookings table at boot", error);
  }
}

/** Write-behind: the cache is already correct, the table catches up. */
function persistBooking(row: StoredBooking): void {
  if (memoryOnlyForTests || !hasDb()) return;
  const db = getDb();
  if (!db) return;
  void db
    .insert(bookingsTable)
    .values(bookingRow(row))
    .onConflictDoUpdate({ target: bookingsTable.code, set: bookingRow(row) })
    .catch((error: unknown) => console.error(`[booking] could not persist ${row.code}`, error));
}

function startsAtMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function bookingIsLive(row: StoredBooking, now: number): boolean {
  if (row.cancelledAt != null) return false;
  /* Live until the call ENDS, not until it starts. Measuring from the start
     declared the booking gone the moment it began and took the Meet link
     away with it — from the person sitting in the call, looking for the
     link. */
  return startsAtMs(row.startsAt) + SLOT_MINUTES * 60_000 > now;
}

/** An unproven hold whose time is up. A proved one never expires; it is swept. */
export function holdExpired(row: BookingHold, now = Date.now()): boolean {
  return !row.eventId && now - row.createdAt > row.ttlMs;
}

function dropHold(code: string): void {
  const row = holds.get(code);
  if (row?.confirmToken) holdsByToken.delete(row.confirmToken);
  holds.delete(code);
}

function sweep(now: number): void {
  for (const [code, row] of holds) {
    if (now - row.createdAt > row.ttlMs * 3) dropHold(code);
  }
  for (const [code, row] of bookings) {
    if (!bookingIsLive(row, now)) bookings.delete(code);
  }
}

function ourDigits(): string {
  const match = /wa\.me\/(\d+)/.exec(WHATSAPP_URL);
  return match?.[1] ?? "420774654822";
}

/**
 * True only on a house host with a WhatsApp transport configured. Off a house
 * host there is no gate and no no-address path — a fork must never be offered
 * this number.
 *
 * It used to ask whether the CONNECTOR was configured, which was the same
 * question while one vendor carried both the calendar and WhatsApp. They are
 * two things now, and this gate is about WhatsApp: a deployment with a
 * calendar and no messaging must not offer a WhatsApp booking.
 */
export function whatsappGateAllowed(hostOrUrl?: string): boolean {
  const probeHost = hostOrUrl?.trim() || process.env.PUBLIC_BASE_URL?.trim() || "http://localhost";
  if (!whatsappConfigured(probeHost)) return false;
  return isHouseHost(probeHost);
}

export function resetHoldsForTests(): void {
  holds.clear();
  holdsByToken.clear();
  bookings.clear();
}

export function getHold(codeRaw: string): BookingHold | undefined {
  return holds.get(codeRaw.trim().toUpperCase());
}

export function getHoldByToken(token: string, now = Date.now()): BookingHold | undefined {
  sweep(now);
  const code = holdsByToken.get(token);
  return code ? holds.get(code) : undefined;
}

/** Give an unproven hold's slot back, e.g. when its confirmation could not be sent. */
export function releaseHold(codeRaw: string): void {
  const row = getHold(codeRaw);
  if (row && !row.eventId) dropHold(row.code);
}

/** Live unproven holds, plus proved ones still inside the sweep window, plus live bookings. */
export function activeHeldSlots(now = Date.now()): { date: string; time: string }[] {
  sweep(now);
  const out: { date: string; time: string }[] = [];
  for (const row of holds.values()) {
    if (row.eventId) {
      out.push({ date: row.date, time: row.time });
      continue;
    }
    if (holdExpired(row, now)) continue;
    out.push({ date: row.date, time: row.time });
  }
  for (const row of bookings.values()) {
    if (!bookingIsLive(row, now)) continue;
    if (out.some((slot) => slot.date === row.date && slot.time === row.time)) continue;
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
    expiresAt: new Date(hold.createdAt + hold.ttlMs).toISOString(),
  };
}

export function placeHold(
  draft: HoldDraft,
  now = Date.now(),
  proof: { via: "email"; email: string; ttlMs: number } | { via: "whatsapp" } = { via: "whatsapp" },
): BookingHold | { taken: true } {
  sweep(now);
  if (slotIsHeld(draft.date, draft.time, now)) return { taken: true };
  const code = mintBookingCode();
  const hold: BookingHold = {
    ...draft,
    code,
    createdAt: now,
    ttlMs: proof.via === "email" ? proof.ttlMs : HOLD_TTL_MS,
    via: proof.via,
    email: proof.via === "email" ? proof.email : null,
    /* 256 bits: the whole credential for writing this booking. */
    confirmToken: proof.via === "email" ? randomBytes(32).toString("base64url") : null,
    chatId: null,
    eventId: null,
    meetUrl: null,
    confirmedAt: null,
  };
  holds.set(code, hold);
  if (hold.confirmToken) holdsByToken.set(hold.confirmToken, code);
  return hold;
}

export function bindHoldChat(code: string, chatId: string, now = Date.now()): BookingHold | null {
  const row = getHold(code);
  if (!row) return null;
  if (row.via !== "whatsapp") return null;
  if (holdExpired(row, now)) return null;
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

export function recordBooking(row: StoredBooking): StoredBooking {
  const code = normalizeBookingCode(row.code);
  if (!code) return row;
  const stored = { ...row, code };
  bookings.set(code, stored);
  persistBooking(stored);
  return stored;
}

/** Whether a live booking points at this calendar event. */
export function liveBookingsHaveEvent(eventId: string, now = Date.now()): boolean {
  sweep(now);
  for (const row of bookings.values()) {
    if (row.eventId === eventId && bookingIsLive(row, now)) return true;
  }
  return false;
}

/**
 * The soonest call an address has that has not yet ended — to come, or under
 * way. Until it ENDS, as bookingIsLive has it: a slot is offered until its
 * end, so a call that began ten minutes ago is still the one a second click
 * on the same email must be shown.
 */
export function upcomingBookingFor(email: string, now = Date.now()): StoredBooking | undefined {
  sweep(now);
  const address = email.trim().toLowerCase();
  let soonest: StoredBooking | undefined;
  for (const row of bookings.values()) {
    if (row.cancelledAt != null || row.email?.toLowerCase() !== address) continue;
    if (!bookingIsLive(row, now)) continue;
    if (!soonest || startsAtMs(row.startsAt) < startsAtMs(soonest.startsAt)) soonest = row;
  }
  return soonest;
}

export function getStoredBooking(codeRaw: string, now = Date.now()): StoredBooking | undefined {
  sweep(now);
  const code = normalizeBookingCode(codeRaw);
  if (!code) return undefined;
  const row = bookings.get(code);
  if (!row || !bookingIsLive(row, now)) return undefined;
  return row;
}

/**
 * What this process currently holds, including cancelled and past rows that
 * have not been swept. Does not sweep: the people page has to see a booking
 * that no longer stands.
 */
export function listStoredBookings(): StoredBooking[] {
  return [...bookings.values()];
}

/**
 * What the popup may be told. No name, no address: those stay on the server
 * because the pointer that asked is copyable.
 */
export function existingBookingResponse(codeRaw: string, now = Date.now()): ExistingBookingResponse {
  const row = getStoredBooking(codeRaw, now);
  if (!row) return { found: false };
  return {
    found: true,
    startsAt: row.startsAt,
    timezone: row.timezone,
    meetUrl: row.meetUrl,
    invited: row.invited,
    viaWhatsApp: Boolean(row.chatId),
  };
}

export function updateStoredBooking(
  codeRaw: string,
  patch: Partial<Omit<StoredBooking, "code">>,
  now = Date.now(),
): StoredBooking | undefined {
  const row = getStoredBooking(codeRaw, now);
  if (!row) return undefined;
  const next = { ...row, ...patch, code: row.code };
  bookings.set(row.code, next);
  persistBooking(next);
  return next;
}

export function markBookingCancelled(codeRaw: string, now = Date.now()): StoredBooking | undefined {
  const code = normalizeBookingCode(codeRaw);
  if (!code) return undefined;
  const row = bookings.get(code);
  if (!row || row.cancelledAt != null) return undefined;
  if (!bookingIsLive(row, now) && row.cancelledAt == null) {
    /* Already past: treat as gone rather than cancellable. */
    bookings.delete(code);
    return undefined;
  }
  row.cancelledAt = now;
  bookings.delete(code);
  /* The hold that proved this booking is still in `holds` and still counts
     as an active slot, so without this the freed time stayed invisible in
     the picker and 409'd for the rest of the sweep window — a slot nobody
     could book and nobody could see was taken. */
  for (const [heldCode, held] of holds) {
    if (held.eventId && held.eventId === row.eventId) dropHold(heldCode);
  }
  /* Written before it is dropped from the cache, so a restart cannot bring a
     cancelled booking back to life. */
  persistBooking(row);
  return row;
}

/** The short address the owner writes: PUBLIC_BASE_URL plus /<code>. */
export function bookingReturnPath(code: string): string {
  return `/${code}`;
}

export function bookingReturnUrl(code: string): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${bookingReturnPath(code)}`;
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
