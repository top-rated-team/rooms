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
 * The server hops /book to /#book=<address> (see server/routes.ts). The
 * address goes in the fragment and not the query because a fragment is never
 * sent back to the server, and the page takes it off the address bar the
 * moment it has read it — so it does not sit in history or in a copied URL.
 */

export const BOOK_LINK_HASH = "book";

/** Deliberately permissive: a rejected typo costs a booking, not a lead. */
export const BOOKING_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The address, or null. A merge field that was never filled in ({{email}}),
 * a mailto: that came along with a copied address, and the brackets someone
 * pasted with it are all things a link in the wild carries; none of them is
 * worth losing the address over, and nothing that fails the popup's own test
 * is ever put in the field.
 */
export function bookingLinkEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[\s{<"']+|[\s}>"']+$/g, "");
  return BOOKING_EMAIL_RE.test(cleaned) ? cleaned : null;
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

/**
 * Where /book sends the visitor: the front page, with every query parameter
 * that is not the address passed on untouched (utm_* and the like), and the
 * address, if the link carried a usable one, in the fragment.
 *
 * Always a path on this site: it starts with "/?" or "/#", so nothing in the
 * query can turn it into an address somewhere else.
 */
export function bookLinkTarget(rawQuery: string): string {
  let email: string | null = null;
  const rest: string[] = [];
  for (const part of rawQuery.replace(/^\?/, "").split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? "" : part.slice(eq + 1);
    if (decode(key).trim().toLowerCase() === "email") {
      email ??= bookingLinkEmail(decode(value));
      continue;
    }
    if (value === "") {
      const bare = bookingLinkEmail(decode(key));
      if (bare) {
        email ??= bare;
        continue;
      }
    }
    rest.push(part);
  }
  const query = rest.length > 0 ? `?${rest.join("&")}` : "";
  const hash = email ? `${BOOK_LINK_HASH}=${encodeURIComponent(email)}` : BOOK_LINK_HASH;
  return `/${query}#${hash}`;
}

/**
 * Reads the fragment /book left. Null when it is not ours; otherwise the
 * address it carries, which is checked again here because anybody can type a
 * fragment and the server's check does not travel with it.
 */
export function parseBookLinkHash(hash: string): { email: string | null } | null {
  const raw = hash.replace(/^#/, "");
  const eq = raw.indexOf("=");
  const name = eq < 0 ? raw : raw.slice(0, eq);
  if (name.toLowerCase() !== BOOK_LINK_HASH) return null;
  return { email: eq < 0 ? null : bookingLinkEmail(decode(raw.slice(eq + 1))) };
}
