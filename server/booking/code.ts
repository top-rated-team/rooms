/**
 * The planted WhatsApp code that ties a booking to the inbound message that
 * confirms it. Same alphabet as server/identity.ts:98-102 — no dash, no
 * underscore, no I, O, 0 or 1 — because this string is dictated, and a nanoid
 * with dashes once broke about 40% of binds. The generator and the regex sit
 * next to each other so they cannot drift.
 */

import { customAlphabet } from "nanoid";

/** Copied from server/identity.ts:98. That file does not export the alphabet. */
export const BOOKING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const BOOKING_CODE_LENGTH = 6;

const mint = customAlphabet(BOOKING_CODE_ALPHABET, BOOKING_CODE_LENGTH);

/** Shared by the inbound matcher and the test. Do not copy this pattern. */
export const BOOKING_CODE_RE = new RegExp(
  `\\bBook-confirm ([${BOOKING_CODE_ALPHABET}]{${BOOKING_CODE_LENGTH}})\\b`,
);

export function mintBookingCode(): string {
  return mint();
}

export function bookingConfirmMessage(code: string): string {
  return `Book-confirm ${code}`;
}

export function extractBookingCode(text: string): string | null {
  const match = BOOKING_CODE_RE.exec(text);
  return match?.[1] ?? null;
}

/**
 * A return address is `https://top-rated.team/<code>`. The code is six
 * characters from the dictatable alphabet. None of the site's first-level
 * routes is six characters, so a bare /<code> cannot collide with /team,
 * /blog, /setup, /terms or anything else that exists today. A path with a
 * dot, a hyphen or a slash is never a code.
 */
export const BOOKING_RETURN_CODE_RE = new RegExp(
  `^[${BOOKING_CODE_ALPHABET}]{${BOOKING_CODE_LENGTH}}$`,
  "i",
);

export function isBookingReturnCode(value: string): boolean {
  return BOOKING_RETURN_CODE_RE.test(value.trim());
}

export function normalizeBookingCode(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return isBookingReturnCode(trimmed) ? trimmed : null;
}
