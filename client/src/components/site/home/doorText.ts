import { DOORS, type DoorDef } from "@shared/doors";

/* ---------------------------------------------------------------------------
 * The small amount of text handling the home page needs, in one place so no
 * component writes a door's name, blurb or count out by hand. Every string
 * below is derived from shared/doors.ts by cutting, never by retyping: rename a
 * row and the home page renames itself.
 * ------------------------------------------------------------------------- */

/**
 * The name inside a headline: everything before the first comma or dash.
 * "LinkedIn automation — with a written legal assessment" is a heading, and
 * "LinkedIn automation" is what you call it in a list.
 */
export function shortName(headline: string): string {
  return headline.split(/\s+[—–-]\s+|,\s+/)[0];
}

/**
 * The first sentence of a blurb. A blurb is written to be read under a
 * headline; an index row is read in a column of seven, and the first sentence
 * is the one that says what the work is.
 */
export function firstSentence(text: string): string {
  const end = text.indexOf(". ");
  return end === -1 ? text : text.slice(0, end + 1);
}

/** Counts written out, so a sentence about how many offers there are cannot go stale. */
export function countWord(count: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  return words[count] ?? String(count);
}

/** The doors whose panel answers today: an agent of ours, and a page that is open. */
export const ANSWERING_DOORS: DoorDef[] = DOORS.filter((door) => door.status === "live" && door.firstAgentId);

const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "oppref"];

/**
 * What a room opened from this page is stamped with.
 *
 * `door` is the key that matters and the reason this is not left to a default:
 * the room reads it back to decide whose legal name, terms and invoice line to
 * print in its footer. The home page is not a door, so the door here is
 * whichever one the visitor chose in the panel — the company whose agent
 * actually answered.
 *
 * The campaign keys are the same seven that LeadDialog.collectSource() reads.
 * They are repeated rather than imported so the landing page does not pull a
 * dialog and its Radix tree into the chunk paid traffic downloads first; the
 * handoff to move that helper into client/src/lib is in the report.
 */
export function roomSource(doorId: string): Record<string, string> {
  if (typeof window === "undefined") return { door: doorId };
  const out: Record<string, string> = {};
  const params = new URLSearchParams(window.location.search);
  for (const key of SOURCE_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 200);
  }
  out.landing = window.location.pathname;
  out.door = doorId;
  if (document.referrer) out.referrer = document.referrer.slice(0, 300);
  return out;
}
