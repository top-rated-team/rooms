/**
 * The site's signature over the address a booking block was made for.
 *
 * A time in the block is a /book link, and when the owner put the
 * recipient's address in it, the link went to that inbox and nowhere else —
 * so opening it already proves what a confirmation email would prove, and
 * asking for one as well is a detour. What the address in a URL does not
 * prove on its own is that it was put there by us: anyone can type
 * /book?email=someone-else@…. So the widget page signs the address, and a
 * booking whose address carries this signature is written at once, with
 * Google's invite; one without it is still confirmed by email
 * (confirm-email.ts).
 *
 * THE KEY OUTLIVES A DEPLOY on purpose, unlike answer-receipt.ts's: an email
 * is read days after it is sent. It is derived, under a label of its own,
 * from a secret the deployment already has — BOOKING_LINK_SECRET if set,
 * else LEAD_INBOX_KEY (which render.yaml generates), else ROOM_HASH_PEPPER —
 * so there is nothing new to configure and the signature cannot be mistaken
 * for any other use of that secret. With none of them, nothing is signed and
 * every block keeps the confirmation email. Changing the secret only sends
 * older links back to that same email step.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const LABEL = "top-rated booking link v1";
const SIG_CHARS = 22;

function secret(): string | null {
  for (const name of ["BOOKING_LINK_SECRET", "LEAD_INBOX_KEY", "ROOM_HASH_PEPPER"] as const) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function linkSigningOn(): boolean {
  return secret() !== null;
}

/** The signature for an address, or null when this deployment has nothing to sign with. */
export function signAddress(email: string): string | null {
  const key = secret();
  const address = email.trim().toLowerCase();
  if (!key || !address) return null;
  const derived = createHmac("sha256", key).update(LABEL).digest();
  return createHmac("sha256", derived).update(address, "utf8").digest("base64url").slice(0, SIG_CHARS);
}

/** Constant-time, and false for anything malformed rather than throwing. */
export function addressSigned(email: string | undefined, sig: unknown): boolean {
  if (!email || typeof sig !== "string" || sig.length !== SIG_CHARS) return false;
  const expected = signAddress(email);
  if (!expected) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
