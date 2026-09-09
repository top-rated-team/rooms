/**
 * Sign in with LinkedIn from the booking popup. A third way to hand over an
 * address, beside typing one and giving none.
 *
 * This is a second entry into the same OIDC exchange as room identity, with
 * `state` keyed to the booking draft instead of a room token. What it produces
 * is not a room claim and is never written into room_bindings.
 *
 * THE ADDRESS MAY NOT ARRIVE. LinkedIn documents email as optional. Signed in
 * with no address lands where no address at all lands: a hold from hold.ts, a
 * wa.me code, and no calendar write until the message proves it. It is not an
 * error. Off a house host that path is refused, as POST /api/booking refuses it.
 *
 * THE DRAFT SURVIVES THE ROUND TRIP. OAuth takes the page away. The pending
 * row keeps the day and time they already picked; the callback re-checks the
 * slot is still free before writing. Losing the slot to a sign-in is worse
 * than making them type the address.
 *
 * NEVER A LINKEDIN MESSAGE. Signing in hands over an address. It is not a
 * channel to write on.
 */

import { nanoid } from "nanoid";
import {
  BOOKING_LINKEDIN_SESSION_QUERY,
  type BookingConflictResponse,
  type BookingLinkedInAvailability,
  type BookingLinkedInBooker,
  type BookingLinkedInSession,
  type CreateBookingResponse,
  type HoldBookingResponse,
} from "@shared/api";
import {
  bookingLinkedInRedirectUri,
  exchangeLinkedInCode,
  linkedinAuthorizationUrl,
  linkedinConfigured,
  linkedinCredentials,
} from "../identity";
import { createBookingEvent, SLOT_TAKEN_LINE } from "./calendar";
import {
  ADDRESS_REQUIRED_LINE,
  holdToResponse,
  placeHold,
  slotIsHeld,
  whatsappGateAllowed,
} from "./hold";
import {
  SLOT_MINUTES,
  getBookingSlots,
  invalidateSlotsCache,
  isCalendarDate,
  isWallClockTime,
  slotIsFree,
  wallClockToUtc,
} from "./slots";
import { getPrimaryCalendar } from "../unipile/calendar";
import { available, unavailableLine } from "../unipile/client";

const PENDING_MS = 15 * 60_000;
const RETURN_ORIGIN = "https://booking.invalid";

/**
 * One sentence, and the six things whose absence makes this fail. Shown on
 * the disabled button and next to LINKEDIN_CLIENT_ID. Not a tutorial.
 */
export const BOOKING_LINKEDIN_UNCONFIGURED_LINE =
  "Sign in with LinkedIn is not configured on this deployment: create an app at linkedin.com/developers against a LinkedIn Page you administer, request the Sign In with LinkedIn using OpenID Connect product, add the openid, profile and email scopes, register the redirect URI as PUBLIC_BASE_URL plus /api/booking/linkedin/callback, and put LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in the environment.";

export interface BookingDraft {
  date: string;
  time: string;
  name: string;
  topic: string;
}

interface PendingBookingLinkedIn {
  draft: BookingDraft;
  returnPath: string;
  redirectUri: string;
  host: string | undefined;
  createdAt: number;
}

interface StoredSession {
  createdAt: number;
  session: BookingLinkedInSession;
}

const pending = new Map<string, PendingBookingLinkedIn>();
const sessions = new Map<string, StoredSession>();

function sweep(now = Date.now()): void {
  for (const [state, row] of pending) {
    if (now - row.createdAt > PENDING_MS) pending.delete(state);
  }
  for (const [id, row] of sessions) {
    if (now - row.createdAt > PENDING_MS) sessions.delete(id);
  }
}

export function resetBookingLinkedInForTests(): void {
  pending.clear();
  sessions.clear();
}

export function bookingLinkedInAvailability(): BookingLinkedInAvailability {
  if (linkedinConfigured()) return { available: true };
  return { available: false, unavailableLine: BOOKING_LINKEDIN_UNCONFIGURED_LINE };
}

/**
 * Relative path back to the page the popup was on. Protocol-relative and
 * off-site values become `/`, including a path that only becomes
 * protocol-relative after URL normalisation, so the OAuth return cannot be
 * used as an open redirect.
 */
export function sanitizeBookingReturnPath(raw: string | undefined): string {
  const value = (raw ?? "/").trim() || "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("://")) return "/";
  if (value.includes("\\")) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
      return "/";
    }
    const url = new URL(value, RETURN_ORIGIN);
    if (url.origin !== RETURN_ORIGIN) return "/";
    if (url.username || url.password) return "/";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

function withSessionQuery(returnPath: string, sessionId: string): string {
  const safe = sanitizeBookingReturnPath(returnPath);
  const url = new URL(safe, RETURN_ORIGIN);
  if (url.origin !== RETURN_ORIGIN || url.pathname.startsWith("//")) {
    const fallback = new URL("/", RETURN_ORIGIN);
    fallback.searchParams.set(BOOKING_LINKEDIN_SESSION_QUERY, sessionId);
    return `${fallback.pathname}${fallback.search}`;
  }
  url.searchParams.set(BOOKING_LINKEDIN_SESSION_QUERY, sessionId);
  const out = `${url.pathname}${url.search}${url.hash}`;
  if (out.startsWith("//") || url.pathname.startsWith("//")) {
    const fallback = new URL("/", RETURN_ORIGIN);
    fallback.searchParams.set(BOOKING_LINKEDIN_SESSION_QUERY, sessionId);
    return `${fallback.pathname}${fallback.search}`;
  }
  return out;
}

/**
 * The session is a bearer token for a name, an address and a LinkedIn
 * profile. Spend it on first read so a referrer, a shared link or history
 * cannot read it again.
 */
export function getBookingLinkedInSession(idRaw: string): BookingLinkedInSession | null {
  sweep();
  const id = idRaw.trim();
  if (!id) return null;
  const row = sessions.get(id);
  if (!row) return null;
  sessions.delete(id);
  return row.session;
}

export type BookingLinkedInStart = { ok: true; url: string } | { ok: false; line: string };

/**
 * Builds LinkedIn's authorization URL with the draft in `state`. Nothing is
 * written yet. Closing the consent screen leaves the calendar as it was.
 */
export function startBookingLinkedIn(input: {
  date: string;
  time: string;
  name?: string;
  topic?: string;
  returnPath?: string;
  publicBaseUrl: string;
  host?: string;
}): BookingLinkedInStart {
  const creds = linkedinCredentials();
  if (!creds) return { ok: false, line: BOOKING_LINKEDIN_UNCONFIGURED_LINE };

  const date = input.date.trim();
  const time = input.time.trim();
  if (!isCalendarDate(date) || !isWallClockTime(time)) {
    return { ok: false, line: "Need a day and a time to keep while you sign in." };
  }

  sweep();
  const state = nanoid(24);
  const redirectUri = bookingLinkedInRedirectUri(input.publicBaseUrl);
  pending.set(state, {
    draft: {
      date,
      time,
      name: input.name?.trim() || "Visitor",
      topic: input.topic?.trim() || "call",
    },
    returnPath: sanitizeBookingReturnPath(input.returnPath),
    redirectUri,
    host: input.host?.trim() || undefined,
    createdAt: Date.now(),
  });
  return {
    ok: true,
    url: linkedinAuthorizationUrl({ clientId: creds.clientId, redirectUri, state }),
  };
}

function emptyBooker(): BookingLinkedInBooker {
  return { name: null, email: null, profileUrl: null };
}

function putSession(session: BookingLinkedInSession, now = Date.now()): string {
  const id = nanoid(24);
  sessions.set(id, { createdAt: now, session });
  return id;
}

function visitorProfileOf(
  booker: BookingLinkedInBooker,
): { name: string; url: string } | undefined {
  if (!booker.profileUrl || !booker.name) return undefined;
  return { name: booker.name, url: booker.profileUrl };
}

async function writeSignedInBooking(
  draft: BookingDraft,
  booker: BookingLinkedInBooker,
  fetchImpl: typeof fetch,
  now: Date,
  host: string | undefined,
): Promise<
  | { ok: true; body: CreateBookingResponse }
  | { ok: true; hold: HoldBookingResponse }
  | { ok: false; status: 409; body: BookingConflictResponse }
  | { ok: false; status: 503; error: string }
> {
  if (!available()) return { ok: false, status: 503, error: unavailableLine() };

  const primary = await getPrimaryCalendar(fetchImpl);
  if (!primary.ok) return { ok: false, status: 503, error: primary.line };

  const starts = wallClockToUtc(draft.date, draft.time, primary.calendar.timezone);
  if (!starts) return { ok: false, status: 503, error: "Need a date, a time, a name and a topic." };
  const ends = new Date(starts.getTime() + SLOT_MINUTES * 60_000);

  invalidateSlotsCache();
  const slots = await getBookingSlots(draft.date, 1, { fetchImpl, now });
  if (!slots.ok) return { ok: false, status: 503, error: slots.error };
  if (!slotIsFree(slots.body, draft.date, draft.time) || slotIsHeld(draft.date, draft.time, now.getTime())) {
    const wider = await getBookingSlots(draft.date, 14, { fetchImpl, now });
    const days = wider.ok ? wider.body.days : slots.body.days;
    return { ok: false, status: 409, body: { error: SLOT_TAKEN_LINE, days } };
  }

  const email = booker.email ?? undefined;
  if (!email) {
    if (!whatsappGateAllowed(host)) {
      return { ok: false, status: 503, error: ADDRESS_REQUIRED_LINE };
    }
    const held = placeHold(
      {
        date: draft.date,
        time: draft.time,
        name: booker.name || draft.name,
        topic: draft.topic,
        timezone: primary.calendar.timezone,
        startsAt: starts.toISOString(),
      },
      now.getTime(),
    );
    if ("taken" in held) {
      const wider = await getBookingSlots(draft.date, 14, { fetchImpl, now });
      const days = wider.ok ? wider.body.days : slots.body.days;
      return { ok: false, status: 409, body: { error: SLOT_TAKEN_LINE, days } };
    }
    invalidateSlotsCache();
    return { ok: true, hold: holdToResponse(held) };
  }

  const created = await createBookingEvent(
    {
      calendarId: primary.calendar.id,
      timezone: primary.calendar.timezone,
      starts,
      ends,
      name: booker.name || draft.name,
      topic: draft.topic,
      email,
      visitorProfile: visitorProfileOf(booker),
    },
    fetchImpl,
  );
  if (!created.ok) return { ok: false, status: 503, error: created.error };

  invalidateSlotsCache();
  return {
    ok: true,
    body: {
      booked: true,
      startsAt: starts.toISOString(),
      timezone: primary.calendar.timezone,
      meetUrl: created.meetUrl,
      invited: created.invited,
      whatsapp: { url: "", code: "" },
    },
  };
}

export interface BookingLinkedInComplete {
  redirectTo: string;
  sessionId: string | null;
}

/**
 * Finishes the booking OIDC exchange. Never calls putBinding. Re-checks the
 * slot before writing. A missing email is a hold, not a calendar event.
 */
export async function completeBookingLinkedIn(input: {
  code?: string;
  state?: string;
  error?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  host?: string;
}): Promise<BookingLinkedInComplete> {
  const now = input.now ?? new Date();
  sweep(now.getTime());
  const state = input.state?.trim();
  if (!state) return { redirectTo: "/", sessionId: null };

  const row = pending.get(state);
  pending.delete(state);
  if (!row) return { redirectTo: "/", sessionId: null };

  const fetchImpl = input.fetchImpl ?? fetch;
  const host = input.host?.trim() || row.host;

  if (input.error || !input.code?.trim()) {
    const sessionId = putSession({
      draft: row.draft,
      booker: emptyBooker(),
      result: { booked: false, invited: false },
    });
    return { redirectTo: withSessionQuery(row.returnPath, sessionId), sessionId };
  }

  const exchanged = await exchangeLinkedInCode({
    code: input.code.trim(),
    redirectUri: row.redirectUri,
    fetchImpl,
  });
  if (!exchanged.ok) {
    const sessionId = putSession({
      draft: row.draft,
      booker: emptyBooker(),
      result: {
        booked: false,
        invited: false,
        error: "LinkedIn sign-in did not finish. The time you picked is still here.",
      },
    });
    return { redirectTo: withSessionQuery(row.returnPath, sessionId), sessionId };
  }

  const booker: BookingLinkedInBooker = {
    name: exchanged.member.displayName,
    email: exchanged.member.email,
    profileUrl: exchanged.member.profileUrl,
  };

  const written = await writeSignedInBooking(row.draft, booker, fetchImpl, now, host);
  if (written.ok && "hold" in written) {
    const sessionId = putSession({
      draft: row.draft,
      booker,
      result: written.hold,
    });
    return { redirectTo: withSessionQuery(row.returnPath, sessionId), sessionId };
  }
  if (written.ok) {
    const sessionId = putSession({
      draft: row.draft,
      booker,
      result: {
        booked: true,
        startsAt: written.body.startsAt,
        timezone: written.body.timezone,
        meetUrl: written.body.meetUrl,
        invited: written.body.invited,
      },
    });
    return { redirectTo: withSessionQuery(row.returnPath, sessionId), sessionId };
  }

  if (written.status === 409) {
    const sessionId = putSession({
      draft: row.draft,
      booker,
      result: {
        booked: false,
        invited: false,
        error: written.body.error,
        days: written.body.days,
      },
    });
    return { redirectTo: withSessionQuery(row.returnPath, sessionId), sessionId };
  }

  const sessionId = putSession({
    draft: row.draft,
    booker,
    result: { booked: false, invited: false, error: written.error },
  });
  return { redirectTo: withSessionQuery(row.returnPath, sessionId), sessionId };
}
