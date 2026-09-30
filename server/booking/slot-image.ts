/**
 * GET /api/booking/slot/<date>/<HHMM>.png — one time button of the email
 * booking block, drawn as the calendar stands when it is asked for.
 *
 * A block in an email is frozen when it is sent, and read hours or days
 * later, when some of its times have gone to other people. The part of an
 * email a mail client fetches again when it is opened is an image, so each
 * time is a link around this image: free, or crossed out as taken. The
 * pictures themselves are drawn once (scripts/build-slot-images.mjs); this
 * only decides which of the two to send.
 *
 * What it can and cannot do, stated so nobody relies on more:
 *   - Gmail fetches images through its proxy when the message is opened,
 *     which is what countdown-timer emails depend on. Apple Mail may fetch
 *     them once, on arrival. Outlook on the desktop shows no images until the
 *     reader allows them, and then the plain time (the alt text) stands in.
 *   - It cannot take a time out of the email, only mark it. The click is
 *     checked again either way: the popup, the confirmation and reply to
 *     book each ask the calendar before anything is written.
 *
 * It says "free" whenever it cannot tell — the calendar unreachable, say —
 * because a time wrongly crossed out loses a booking, and one wrongly shown
 * free is caught at the click.
 *
 * No personal data is in the address: a date and a time, the same for every
 * recipient, so the image tells nobody who opened what.
 */

import fs from "node:fs";
import path from "node:path";

import { getBookingSlots, isCalendarDate, isWallClockTime, slotIsFree } from "./slots";

export type SlotImageState = "free" | "taken";

const cache = new Map<string, Buffer | null>();

function imageDirs(): string[] {
  return [
    /* The bundle, dist/index.js, sits next to dist/public. */
    path.resolve(import.meta.dirname, "public", "booking-slots"),
    path.resolve(process.cwd(), "dist", "public", "booking-slots"),
    /* Development and tests, before a build. */
    path.resolve(process.cwd(), "client", "public", "booking-slots"),
  ];
}

/** The picture for a time, or null when there is none drawn for it. */
export function slotImage(time: string, state: SlotImageState): Buffer | null {
  const key = `${time.replace(":", "")}-${state}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let found: Buffer | null = null;
  for (const dir of imageDirs()) {
    try {
      found = fs.readFileSync(path.join(dir, `${key}.png`));
      break;
    } catch {
      /* Try the next place. */
    }
  }
  cache.set(key, found);
  return found;
}

export function resetSlotImagesForTests(): void {
  cache.clear();
}

/** Whether a time is still free, from the same answer the popup gets. */
export async function liveSlotState(
  date: string,
  time: string,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<SlotImageState> {
  /* The two-week window from today is one cached answer shared by every
     image of every open email and by the popup — not a calendar read per
     image. */
  const window = await getBookingSlots("", 14, opts);
  if (!window.ok) return "free";
  const days = window.body.days;
  if (days.some((day) => day.date === date)) return slotIsFree(window.body, date, time) ? "free" : "taken";
  /* Before the window is before today: gone. */
  if (days[0] && date < days[0].date) return "taken";
  const later = await getBookingSlots(date, 1, opts);
  if (!later.ok) return "free";
  return slotIsFree(later.body, date, time) ? "free" : "taken";
}

/** Reads "1030.png" as "10:30", or null for anything that is not a time's picture. */
export function slotImageTime(file: string): string | null {
  const match = /^(\d{2})(\d{2})\.png$/.exec(file);
  if (!match) return null;
  const time = `${match[1]}:${match[2]}`;
  return isWallClockTime(time) ? time : null;
}

export { isCalendarDate };
