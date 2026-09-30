/**
 * Reply to book: a time inside an email is an address to write to.
 *
 * Gmail, sent without an add-on, changes nothing in a pasted block, so a link
 * in it cannot carry the address of whoever it was sent to. The one thing that
 * knows that address is the recipient's own mail app. So a time in the block
 * is a mailto: to an address that names the slot —
 *
 *   call-2026-09-30-1030@book.top-rated.team
 *
 * — the recipient presses Send, and the email that arrives is the booking:
 * server/booking/reply-to-book.ts reads the slot from the address it was sent
 * to and the person from the address it came from, and books it.
 *
 * The date and time are wall-clock in the calendar's own zone, as the slots
 * API writes them.
 */

const PREFIX = "call-";
const LOCAL_RE = /^call-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/i;

/** The address for one slot at the domain that receives the booking mail. */
export function replyAddress(domain: string, date: string, time: string): string {
  return `${PREFIX}${date}-${time.replace(":", "")}@${domain.trim().toLowerCase()}`;
}

/**
 * The slot an address names, or null when it is not one of ours: another
 * domain, another shape, a day that does not exist, a time off the half-hour
 * grid's clock. Accepts "Name <address>" too, as a To header lists it.
 */
export function parseReplyAddress(raw: string, domain: string): { date: string; time: string } | null {
  const address = (/<([^<>]+)>\s*$/.exec(raw.trim())?.[1] ?? raw).trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 0 || address.slice(at + 1) !== domain.trim().toLowerCase()) return null;
  const match = LOCAL_RE.exec(address.slice(0, at));
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (day.getUTCMonth() !== Number(m) - 1 || day.getUTCDate() !== Number(d)) return null;
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

/**
 * The mailto: a time in the block opens. The subject and body are written for
 * the person who presses Send, and say what sending does; the server reads
 * neither — only the address — so an edited subject still books.
 */
export function replyMailto(
  domain: string,
  input: { date: string; time: string; when: string; minutes: number; hostName: string },
): string {
  const subject = `Book the call: ${input.when}`;
  const body =
    `Sending this email books a ${input.minutes}-minute call with ${input.hostName} on ${input.when}. ` +
    "Google will send you the calendar invite.";
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${replyAddress(domain, input.date, input.time)}?${query}`;
}
