/**
 * Our booking popup, opened from the same anchors that used to click Google's
 * hidden button.
 *
 * WHY THE HOOK STILL RETURNS THREE PROPS. Seventeen call sites spread
 * `{...booking}`. Changing the return shape is a seventeen-file collision.
 * This module changes what a click does: open our dialog, not Google's overlay.
 *
 * WHY THE HREF IS STILL ON EVERY ANCHOR. With no JavaScript the click is a
 * real navigation. With JavaScript a plain left click preventDefault's and the
 * popup opens; a cmd-click is left alone so it still opens a tab.
 *
 * WHY WARMING IS A SLOTS FETCH. Unipile has no free/busy endpoint. Slots are
 * computed on our server and cached briefly. Fetching them on the first
 * pointer, key or scroll anywhere on the page means a tap on a phone is not
 * racing the network — there is no hover, and touchstart is only about 50 ms
 * ahead of click.
 */

import type {
  BookingDay,
  BookingSlotsResponse,
  CreateBookingRequest,
  CreateBookingResponse,
  ExistingBookingResponse,
} from "@shared/api";
import { BOOKING_LINKEDIN_SESSION_QUERY } from "@shared/api";
import { DOORS } from "@shared/doors";

export const SLOT_DAYS = 14;
export const CONFIRMED_POLL_MS = 2_500;
export const CONFIRMED_TIMEOUT_MS = 5 * 60 * 1_000;
const CACHE_MS = 30_000;
/** Same alphabet as server/booking/code.ts — no dash, underscore, I, O, 0 or 1. */
const RETURN_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/i;
const POINTER_KEY = "booking-pointer";
const RETURN_COOKIE = "booking_return";

export type SlotDay = BookingDay;
export type SlotsPayload = BookingSlotsResponse;
export type BookedPayload = CreateBookingResponse;

export type BookResult =
  | { ok: true; booked: BookedPayload }
  | { ok: false; conflict: true; error: string; days: SlotDay[] }
  | { ok: false; conflict: false; error: string; status: number };

export interface ConfirmedPayload {
  confirmed: boolean;
  at?: string;
}

type HostFn = () => void;
type OpenListener = (open: boolean) => void;

let hostFn: HostFn | null = null;
let requestedOpen = false;
const listeners = new Set<OpenListener>();

let cached: { payload: SlotsPayload; at: number } | null = null;
let inflight: Promise<SlotsPayload> | null = null;

export function resetBookingForTests(): void {
  hostFn = null;
  requestedOpen = false;
  listeners.clear();
  cached = null;
  inflight = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(POINTER_KEY);
    } catch {
      /* private mode */
    }
  }
}

export function registerBookingHost(fn: HostFn): void {
  hostFn = fn;
  if (shouldAutoOpenBooking()) {
    requestedOpen = true;
    fn();
    for (const listener of listeners) listener(true);
  }
}

export function isBookingOpen(): boolean {
  return requestedOpen;
}

export function subscribeBookingOpen(listener: OpenListener): () => void {
  listeners.add(listener);
  listener(requestedOpen);
  return () => {
    listeners.delete(listener);
  };
}

export function setBookingOpen(open: boolean): void {
  requestedOpen = open;
  for (const listener of listeners) listener(open);
}

/**
 * Open the popup with no click to fall through. The room's `/call` slash
 * command is the caller this exists for. Returns false when no host has
 * registered, so that command's window.open fallback still runs.
 */
export function openBooking(): boolean {
  if (hostFn == null) return false;
  requestedOpen = true;
  hostFn();
  for (const listener of listeners) listener(true);
  return true;
}

export function slotsUrl(from: string, days: number = SLOT_DAYS): string {
  const params = new URLSearchParams({ from, days: String(days) });
  return `/api/booking/slots?${params.toString()}`;
}

export function confirmedUrl(code: string): string {
  const params = new URLSearchParams({ code });
  return `/api/booking/confirmed?${params.toString()}`;
}

export function existingBookingUrl(code: string): string {
  const params = new URLSearchParams({ code });
  return `/api/booking?${params.toString()}`;
}

export function isBookingReturnCode(value: string): boolean {
  return RETURN_CODE_RE.test(value.trim());
}

export function normalizeBookingCode(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return isBookingReturnCode(trimmed) ? trimmed : null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return decodeURIComponent(trimmed.slice(name.length + 1));
  }
  return null;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; path=/`;
}

/**
 * The flag in this browser's session. A pointer, not a credential: the
 * popup always asks the server with the code, and the server's answer
 * decides what is shown.
 */
export function rememberBookingPointer(codeRaw: string): void {
  const code = normalizeBookingCode(codeRaw);
  if (!code || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(POINTER_KEY, code);
  } catch {
    /* private mode */
  }
}

export function bookingPointer(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(POINTER_KEY);
    return stored ? normalizeBookingCode(stored) : null;
  } catch {
    return null;
  }
}

export function clearBookingPointer(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(POINTER_KEY);
  } catch {
    /* private mode */
  }
  clearCookie(RETURN_COOKIE);
}

/**
 * Credential for this visit: the return cookie from /<code>, or a six-character
 * path, or the session pointer. The cookie is consumed so a copied later
 * request does not keep using it.
 */
export function takeBookingCredential(): string | null {
  /* NOTHING IS REMEMBERED HERE. This only reads what arrived; the caller
     stores it once the SERVER has said it names a booking. Writing first
     meant a mistyped six-character address overwrote the pointer to a real
     booking made in this browser, and the dialog then cleared that pointer
     when the server said the typo was unknown — the only way back to an
     email booking, gone to a typo. */
  const fromCookie = normalizeBookingCode(readCookie(RETURN_COOKIE) ?? "");
  if (fromCookie) {
    clearCookie(RETURN_COOKIE);
    return fromCookie;
  }
  if (typeof window !== "undefined") {
    const segment = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const fromPath = normalizeBookingCode(segment);
    if (fromPath && !window.location.pathname.slice(1).includes("/")) {
      return fromPath;
    }
  }
  return bookingPointer();
}

function shouldAutoOpenBooking(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get(BOOKING_LINKEDIN_SESSION_QUERY)?.trim()) {
    return true;
  }
  return hasBookingReturnHop();
}

export function hasBookingReturnHop(): boolean {
  if (typeof window === "undefined") return false;
  if (readCookie(RETURN_COOKIE)) return true;
  const segment = window.location.pathname.replace(/^\/+|\/+$/g, "");
  return Boolean(normalizeBookingCode(segment) && !window.location.pathname.slice(1).includes("/"));
}

/** YYYY-MM-DD in the given IANA zone, or in the browser's local zone. */
export function todayStamp(timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isPhoneBooking(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/**
 * booking-server requires `name` and `topic` on POST. They are not on the
 * form — email is the only extra field — so these are filled from what we
 * actually know: the local part of the address they typed, or "Visitor", and
 * the door this page is, or "call".
 */
export function bookingTopic(): string {
  if (typeof window === "undefined") return "call";
  return DOORS.find((door) => door.path === window.location.pathname)?.id ?? "call";
}

function nameFromEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const local = email.split("@")[0]?.trim();
  return local || undefined;
}

export function buildBookBody(input: { date: string; time: string; email?: string; name?: string; topic?: string }): CreateBookingRequest {
  const email = input.email?.trim();
  const body: CreateBookingRequest = {
    date: input.date,
    time: input.time,
    name: input.name?.trim() || nameFromEmail(email) || "Visitor",
    topic: input.topic?.trim() || bookingTopic(),
  };
  if (email) body.email = email;
  return body;
}

export function parseSlotsPayload(value: unknown): SlotsPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("The server returned a response that was not JSON.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.timezone !== "string" || record.timezone.trim() === "") {
    throw new Error("The server returned times with no timezone.");
  }
  if (typeof record.slotMinutes !== "number" || !Number.isFinite(record.slotMinutes) || record.slotMinutes <= 0) {
    throw new Error("The server returned times with no slot length.");
  }
  const days = parseDays(record.days);
  if (!days) throw new Error("The server returned times in a shape we cannot read.");
  return { timezone: record.timezone, slotMinutes: record.slotMinutes, days };
}

export function parseDays(value: unknown): SlotDay[] | null {
  if (!Array.isArray(value)) return null;
  const days: SlotDay[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.date !== "string" || record.date.trim() === "") return null;
    if (!Array.isArray(record.slots)) return null;
    const slots: string[] = [];
    for (const slot of record.slots) {
      if (typeof slot !== "string") return null;
      slots.push(slot);
    }
    days.push({ date: record.date, slots });
  }
  return days;
}

export function parseBookedPayload(value: unknown): BookedPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("The server returned a response that was not JSON.");
  }
  const record = value as Record<string, unknown>;
  if (record.booked !== true) throw new Error("The server did not confirm the booking.");
  if (typeof record.startsAt !== "string" || record.startsAt.trim() === "") {
    throw new Error("The server confirmed a booking with no start time.");
  }
  if (typeof record.timezone !== "string" || record.timezone.trim() === "") {
    throw new Error("The server confirmed a booking with no timezone.");
  }
  const meetUrl = record.meetUrl === null || record.meetUrl === undefined ? null : record.meetUrl;
  if (meetUrl !== null && typeof meetUrl !== "string") {
    throw new Error("The server returned a meeting link we cannot read.");
  }
  if (typeof record.invited !== "boolean") {
    throw new Error("The server did not say whether an invite was sent.");
  }
  if (typeof record.whatsapp !== "object" || record.whatsapp === null) {
    throw new Error("The server confirmed a booking with no WhatsApp path.");
  }
  const whatsapp = record.whatsapp as Record<string, unknown>;
  if (typeof whatsapp.url !== "string" || typeof whatsapp.code !== "string") {
    throw new Error("The server confirmed a booking with no WhatsApp path.");
  }
  return {
    booked: true,
    code: typeof record.code === "string" ? record.code : "",
    startsAt: record.startsAt,
    timezone: record.timezone,
    meetUrl,
    invited: record.invited,
    whatsapp: { url: whatsapp.url, code: whatsapp.code },
  };
}

export function parseConfirmedPayload(value: unknown): ConfirmedPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("The server returned a response that was not JSON.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.confirmed !== "boolean") {
    throw new Error("The server did not say whether the booking was confirmed.");
  }
  const at = record.at;
  if (at === undefined) return { confirmed: record.confirmed };
  if (typeof at !== "string") throw new Error("The server returned a confirmation time we cannot read.");
  return { confirmed: record.confirmed, at };
}

export function errorFromBody(value: unknown, fallback: string): string {
  if (typeof value === "object" && value !== null) {
    const message = (value as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

function weekdayHeading(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(utc);
}

export function formatSlotDay(date: string): string {
  return weekdayHeading(date);
}

export function formatBookedWhen(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(new Date(startsAt));
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The server returned a response that was not JSON.");
  }
}

export function cachedSlots(): SlotsPayload | null {
  if (!cached) return null;
  if (Date.now() - cached.at > CACHE_MS) return null;
  return cached.payload;
}

export function replaceCachedDays(days: SlotDay[]): void {
  if (!cached) return;
  cached = { payload: { ...cached.payload, days }, at: Date.now() };
}

export async function loadSlots(options?: { force?: boolean }): Promise<SlotsPayload> {
  if (!options?.force) {
    const hit = cachedSlots();
    if (hit) return hit;
  }
  if (inflight) return inflight;

  const request = (async () => {
    let res: Response;
    try {
      res = await fetch(slotsUrl(todayStamp()), {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
    } catch {
      throw new Error("Could not reach the server. Check your connection and try again.");
    }
    let body: unknown = null;
    try {
      body = await readJson(res);
    } catch (error) {
      if (res.ok) throw error;
    }
    if (!res.ok) {
      throw new Error(errorFromBody(body, "Times could not be loaded just now."));
    }
    const payload = parseSlotsPayload(body);
    cached = { payload, at: Date.now() };
    return payload;
  })();

  inflight = request;
  try {
    return await request;
  } finally {
    if (inflight === request) inflight = null;
  }
}

/**
 * Fetch slots and resolve false rather than throwing. The first interaction
 * warmer uses this: a failed warm is ordinary, and the dialog will try again.
 */
export function prepareBooking(): Promise<boolean> {
  return loadSlots()
    .then(() => true)
    .catch(() => false);
}

export async function bookSlot(input: { date: string; time: string; email?: string }): Promise<BookResult> {
  let res: Response;
  try {
    res = await fetch("/api/booking", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(buildBookBody(input)),
    });
  } catch {
    return {
      ok: false,
      conflict: false,
      error: "Could not reach the server. Check your connection and try again.",
      status: 0,
    };
  }

  const body = await readJson(res).catch(() => null);

  if (res.status === 409) {
    const days = parseDays(body && typeof body === "object" ? (body as { days?: unknown }).days : undefined);
    if (days) replaceCachedDays(days);
    return {
      ok: false,
      conflict: true,
      error: errorFromBody(body, "That time has just been taken. Here is what is still free."),
      days: days ?? cached?.payload.days ?? [],
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      conflict: false,
      error: errorFromBody(body, "That time could not be booked."),
      status: res.status,
    };
  }

  try {
    const booked = parseBookedPayload(body);
    if (booked.whatsapp.code) rememberBookingPointer(booked.whatsapp.code);
    return { ok: true, booked };
  } catch (error) {
    return {
      ok: false,
      conflict: false,
      error: error instanceof Error ? error.message : "That time could not be booked.",
      status: res.status,
    };
  }
}

export function parseExistingBooking(value: unknown): ExistingBookingResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.found === false) return { found: false };
  if (record.found !== true) return null;
  if (typeof record.startsAt !== "string" || typeof record.timezone !== "string") return null;
  const meetUrl = record.meetUrl === null || record.meetUrl === undefined ? null : record.meetUrl;
  if (meetUrl !== null && typeof meetUrl !== "string") return null;
  if (typeof record.invited !== "boolean" || typeof record.viaWhatsApp !== "boolean") return null;
  return {
    found: true,
    startsAt: record.startsAt,
    timezone: record.timezone,
    meetUrl,
    invited: record.invited,
    viaWhatsApp: record.viaWhatsApp,
  };
}

export async function fetchExistingBooking(
  code: string,
  signal?: AbortSignal,
): Promise<ExistingBookingResponse> {
  const res = await fetch(existingBookingUrl(code), {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(errorFromBody(body, "That booking could not be loaded."));
  }
  const parsed = parseExistingBooking(body);
  if (!parsed) throw new Error("The server returned a booking we cannot read.");
  return parsed;
}

export type ChangeResult =
  | { ok: true; booking: Extract<ExistingBookingResponse, { found: true }> }
  | { ok: false; conflict: true; error: string; days: SlotDay[] }
  | { ok: false; conflict: false; error: string };

export async function changeBookingSlot(input: {
  code: string;
  date: string;
  time: string;
}): Promise<ChangeResult> {
  let res: Response;
  try {
    res = await fetch("/api/booking/change", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code: input.code, date: input.date, time: input.time }),
    });
  } catch {
    return {
      ok: false,
      conflict: false,
      error: "Could not reach the server. Check your connection and try again.",
    };
  }
  const body = await readJson(res).catch(() => null);
  if (res.status === 409) {
    const days = parseDays(body && typeof body === "object" ? (body as { days?: unknown }).days : undefined);
    if (days) replaceCachedDays(days);
    return {
      ok: false,
      conflict: true,
      error: errorFromBody(body, "That time has just been taken. Here is what is still free."),
      days: days ?? cached?.payload.days ?? [],
    };
  }
  if (!res.ok) {
    return { ok: false, conflict: false, error: errorFromBody(body, "That booking could not be moved.") };
  }
  const parsed = parseExistingBooking(body);
  if (!parsed || !parsed.found) {
    return { ok: false, conflict: false, error: "That booking is not here." };
  }
  rememberBookingPointer(input.code);
  return { ok: true, booking: parsed };
}

export async function cancelExistingBooking(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string; gone: boolean }> {
  let res: Response;
  try {
    res = await fetch("/api/booking/cancel", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code }),
    });
  } catch {
    return { ok: false, gone: false, error: "Could not reach the server. Check your connection and try again." };
  }
  const body = await readJson(res).catch(() => null);
  if (!res.ok) {
    /* 404 is the server saying the booking is not there, which is a
       different thing from a cancel that failed — the caller must stop
       showing the booking rather than show an error over it. */
    return { ok: false, gone: res.status === 404, error: errorFromBody(body, "That booking could not be cancelled.") };
  }
  clearBookingPointer();
  return { ok: true };
}

export async function fetchConfirmed(code: string, signal?: AbortSignal): Promise<ConfirmedPayload> {
  const res = await fetch(confirmedUrl(code), {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(errorFromBody(body, "The confirmation could not be checked."));
  }
  return parseConfirmedPayload(body);
}

export async function pollBookingConfirmed(
  code: string,
  options: { signal: AbortSignal; intervalMs?: number; timeoutMs?: number },
): Promise<{ confirmed: true; at: string } | { confirmed: false }> {
  const intervalMs = options.intervalMs ?? CONFIRMED_POLL_MS;
  const timeoutMs = options.timeoutMs ?? CONFIRMED_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (!options.signal.aborted) {
    try {
      const result = await fetchConfirmed(code, options.signal);
      if (result.confirmed) {
        return { confirmed: true, at: result.at ?? new Date().toISOString() };
      }
    } catch (error) {
      if (options.signal.aborted) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      /* A single failed poll is not the answer. Keep going until the code expires. */
    }
    if (Date.now() >= deadline) return { confirmed: false };
    await sleep(intervalMs, options.signal);
  }
  throw new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
