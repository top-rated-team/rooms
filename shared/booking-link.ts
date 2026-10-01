/**
 * /book — the old site's booking address, kept.
 *
 * top-rated.team/book was the link in signatures, replies and campaigns for
 * years. It answers with the front page and the booking popup open over it,
 * and a link may carry the visitor's own address so the popup starts with it
 * filled in. Both shapes are in circulation:
 *
 *   /book?email=someone@example.com   what a mail merge writes
 *   /book?someone@example.com         what a person types
 *
 * The booking times inside an email (shared/booking-widget.ts) are /book links
 * too, with the day and the time they stand for and a marker that the booking
 * is confirmed from the recipient's inbox rather than written at once:
 *
 *   /book?date=2026-10-02&time=09:00&confirm=email&email=someone@example.com
 *
 * The server hops /book to /#book&email=…&date=… (see server/routes.ts). All of
 * it goes in the fragment and not the query because a fragment is never sent
 * back to the server, and the page takes it off the address bar the moment it
 * has read it — so an address does not sit in history or in a copied URL.
 */

import type { BookingWidgetRecipient } from "./api";

export const BOOK_LINK_HASH = "book";

/** Deliberately permissive: a rejected typo costs a booking, not a lead. */
export const BOOKING_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/* The emailed confirmation link's token: base64url, long enough to be a secret. */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
/* The site's signature over the address a block was made for (server/booking/link-sign.ts). */
const SIG_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** What a /book link can ask of the popup. Every field is optional. */
export interface BookLink {
  email: string | null;
  /** A day in the calendar's own zone, as the slots API writes it. */
  date: string | null;
  /** A time on that day; never present without the day. */
  time: string | null;
  /** The booking is held and confirmed from a link sent to `email`. */
  confirmByEmail: boolean;
  /** The token from that confirmation link, when this is the way back from it. */
  confirmation: string | null;
  /**
   * This site's signature over `email`, made when the owner put the address
   * in the block. With it the booking needs no confirmation email: the link
   * was sent to that inbox, and nobody else could have made it.
   */
  sig: string | null;
  /**
   * Book `date` at `time` for `email` the moment the page opens — a time
   * clicked in a block the owner made for that address. Only ever acted on
   * with a signature; see BookingDialog.
   */
  instant: boolean;
  /**
   * More people to invite when `email` books, as the owner typed them on the
   * widget page. Covered by `sig` with the address, so a link edited to name
   * someone else invites nobody.
   */
  guests: string[];
}

/** At most this many more people on one call. */
export const MAX_BOOKING_GUESTS = 10;

/**
 * The extra guests in what was typed or carried: addresses split on commas,
 * semicolons or spaces, each cleaned like the recipient's, each once, in
 * the order given.
 */
export function bookingGuests(value: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(value) ? value : (value ?? "").split(/[\s,;]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const address = bookingLinkEmail(typeof part === "string" ? part : "");
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push(address);
    if (out.length >= MAX_BOOKING_GUESTS) break;
  }
  return out;
}

function guestsParam(guests: string[]): string {
  return `guests=${guests.map((guest) => encodeURIComponent(guest)).join(",")}`;
}

const EMPTY: BookLink = {
  email: null,
  date: null,
  time: null,
  confirmByEmail: false,
  confirmation: null,
  sig: null,
  instant: false,
  guests: [],
};

/**
 * The address, or null. A merge field that was never filled in ({{email}}),
 * a mailto: that came along with a copied address, the brackets someone
 * pasted with it, and the "Dan Burykin <dan@…>" a To field copies as are all
 * things a link or a form in the wild carries; none of them is worth losing
 * the address over, and nothing that fails the popup's own test is ever put
 * in the field.
 */
export function bookingLinkEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const angled = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value.trim());
  const cleaned = (angled ? angled[1]! : value)
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[\s{<"']+|[\s}>"']+$/g, "");
  return BOOKING_EMAIL_RE.test(cleaned) ? cleaned : null;
}

/**
 * A mail tool's placeholder for the recipient's address: {{email}},
 * {{ contact.EMAIL }}, *|EMAIL|*, %email%, [email], {EMAIL}. The tool swaps it
 * for the address when it sends, so it goes into a link exactly as typed —
 * encoded, the tool would no longer recognise it.
 */
export function isMergeTag(value: string): boolean {
  return /^(\{\{[^{}<>"'&]{1,60}\}\}|\{[^{}<>"'&\s]{1,60}\}|\*\|[A-Za-z0-9_:.]{1,60}\|\*|%[A-Za-z0-9_.]{1,60}%|\[[A-Za-z0-9_.]{1,60}\])$/.test(
    value.trim(),
  );
}

function calendarDate(value: string | null): string | null {
  const match = value ? DATE_RE.exec(value.trim()) : null;
  if (!match) return null;
  const [, y, m, d] = match;
  const at = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  /* 2026-02-31 matches the pattern and is not a day. */
  return at.getUTCMonth() === Number(m) - 1 ? match[0] : null;
}

function wallClock(value: string | null): string | null {
  return value && TIME_RE.test(value.trim()) ? value.trim() : null;
}

/* Not URLSearchParams: it reads "+" as a space, and "+" is common in the
   part of an address before the @ (dan+ads@…). An address never contains a
   space, so a literal "+" is kept as one. */
function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function split(part: string): { key: string; value: string; bare: boolean } {
  const eq = part.indexOf("=");
  return eq < 0
    ? { key: decode(part).trim().toLowerCase(), value: "", bare: true }
    : { key: decode(part.slice(0, eq)).trim().toLowerCase(), value: part.slice(eq + 1), bare: false };
}

/**
 * The fragment for a link, or just the popup opening. Order is fixed so the
 * same link always makes the same address.
 */
export function formatBookLinkHash(link: Partial<BookLink>): string {
  const parts = [BOOK_LINK_HASH];
  const email = bookingLinkEmail(link.email);
  const date = calendarDate(link.date ?? null);
  const time = date ? wallClock(link.time ?? null) : null;
  if (email) parts.push(`email=${encodeURIComponent(email)}`);
  const guests = email ? bookingGuests(link.guests ?? []) : [];
  if (guests.length > 0) parts.push(guestsParam(guests));
  if (email && link.sig && SIG_RE.test(link.sig)) parts.push(`sig=${link.sig}`);
  if (date) parts.push(`date=${date}`);
  if (time) parts.push(`time=${time}`);
  if (link.confirmByEmail) parts.push("confirm=email");
  if (link.instant && time) parts.push("instant=1");
  if (link.confirmation && TOKEN_RE.test(link.confirmation)) parts.push(`confirmation=${link.confirmation}`);
  return parts.join("&");
}

/**
 * Where /book sends the visitor: the front page, with every query parameter
 * that is not one of ours passed on untouched (utm_* and the like), and ours
 * in the fragment.
 *
 * Always a path on this site: it starts with "/?" or "/#", so nothing in the
 * query can turn it into an address somewhere else.
 */
export function bookLinkTarget(rawQuery: string): string {
  const link: BookLink = { ...EMPTY };
  const rest: string[] = [];
  for (const part of rawQuery.replace(/^\?/, "").split("&")) {
    if (!part) continue;
    const { key, value, bare } = split(part);
    if (key === "email") {
      link.email ??= bookingLinkEmail(decode(value));
      continue;
    }
    if (key === "date") {
      link.date ??= calendarDate(decode(value));
      continue;
    }
    if (key === "time") {
      link.time ??= wallClock(decode(value));
      continue;
    }
    if (key === "instant") {
      link.instant = decode(value).trim() === "1";
      continue;
    }
    if (key === "guests") {
      link.guests = bookingGuests(decode(value));
      continue;
    }
    if (key === "sig") {
      const sig = decode(value).trim();
      if (SIG_RE.test(sig)) link.sig ??= sig;
      continue;
    }
    if (key === "confirm") {
      if (decode(value).trim().toLowerCase() === "email") link.confirmByEmail = true;
      continue;
    }
    if (value === "" || bare) {
      const address = bookingLinkEmail(decode(part.replace(/=$/, "")));
      if (address) {
        link.email ??= address;
        continue;
      }
    }
    rest.push(part);
  }
  const query = rest.length > 0 ? `?${rest.join("&")}` : "";
  return `/${query}#${formatBookLinkHash(link)}`;
}

/**
 * Reads the fragment /book left. Null when it is not ours. Everything is
 * checked again here, because anybody can type a fragment and the server's
 * checks do not travel with it.
 *
 * `#book=<address>` is the first shape this fragment had and is still read.
 */
export function parseBookLinkHash(hash: string): BookLink | null {
  const parts = hash.replace(/^#/, "").split("&");
  const head = split(parts[0] ?? "");
  if (head.key !== BOOK_LINK_HASH) return null;
  const link: BookLink = { ...EMPTY, email: head.bare ? null : bookingLinkEmail(decode(head.value)) };
  for (const part of parts.slice(1)) {
    const { key, value } = split(part);
    const text = decode(value);
    if (key === "email") link.email ??= bookingLinkEmail(text);
    else if (key === "date") link.date ??= calendarDate(text);
    else if (key === "time") link.time ??= wallClock(text);
    else if (key === "confirm") link.confirmByEmail ||= text.trim().toLowerCase() === "email";
    else if (key === "confirmation" && TOKEN_RE.test(text)) link.confirmation ??= text;
    else if (key === "sig" && SIG_RE.test(text)) link.sig ??= text;
    else if (key === "instant") link.instant = text.trim() === "1";
    else if (key === "guests") link.guests = bookingGuests(text);
  }
  if (!link.date) link.time = null;
  if (!link.email) {
    link.sig = null;
    link.guests = [];
  }
  if (!link.time) link.instant = false;
  return link;
}

/**
 * What a recipient typed on the widget page becomes in the links: an address,
 * a merge tag left for the mail tool, or nothing. The page, the server and the
 * links all read it through this, so what the page says the links carry is
 * what they carry.
 */
export function widgetRecipient(value: string | null | undefined): BookingWidgetRecipient {
  const trimmed = value?.trim() ?? "";
  if (trimmed && isMergeTag(trimmed)) return { kind: "tag", value: trimmed };
  const address = bookingLinkEmail(trimmed);
  return address ? { kind: "address", value: address } : { kind: "none" };
}

/**
 * A /book link for the booking times inside an email. `recipient` is an
 * address, a mail tool's merge tag, or empty for a link that asks for the
 * address in the popup.
 *
 * The address goes last so a merge tag that the tool fails to fill in is at
 * least not in the middle of the link, and the rest stay readable in a status
 * bar: /book?date=2026-10-02&time=09:00&confirm=email&email=…
 */
export function bookLinkUrl(
  base: string,
  input: {
    recipient?: string;
    date?: string;
    time?: string;
    confirmByEmail?: boolean;
    sig?: string;
    instant?: boolean;
    /** More people to invite, signed with the address; only with an address. */
    guests?: string[];
  },
): string {
  const params: string[] = [];
  const date = calendarDate(input.date ?? null);
  if (date) params.push(`date=${date}`);
  const time = date ? wallClock(input.time ?? null) : null;
  if (time) params.push(`time=${time}`);
  if (input.confirmByEmail) params.push("confirm=email");
  if (input.instant && time) params.push("instant=1");
  const recipient = widgetRecipient(input.recipient);
  if (recipient.kind === "tag") params.push(`email=${recipient.value}`);
  else if (recipient.kind === "address") {
    params.push(`email=${encodeURIComponent(recipient.value)}`);
    const guests = bookingGuests(input.guests ?? []);
    if (guests.length > 0) params.push(guestsParam(guests));
    if (input.sig && SIG_RE.test(input.sig)) params.push(`sig=${input.sig}`);
  }
  return `${base.replace(/\/+$/, "")}/book${params.length > 0 ? `?${params.join("&")}` : ""}`;
}
