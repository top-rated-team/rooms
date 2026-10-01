/**
 * THE BLOCK THAT IS WORKED OUT WHEN THE EMAIL IS OPENED ("Nearest when
 * opened" on the widget page). Its rows are not dates but places in a queue:
 * row 0 is the nearest day that has a free time among the block's own times,
 * row 1 the next, and so on, counted again every time a picture is asked for.
 * So an email read a week after it was sent still offers the nearest free
 * days, not last week's.
 *
 * Every part of the block that changes is a picture, because a picture is the
 * one thing a mail client fetches again: each heading is a weekday and a
 * "1 OCT" (client/public/booking-days, scripts/build-day-images.mjs), each
 * time the free or taken picture of the time on the reader's clock
 * (client/public/booking-slots).
 *
 * WHY A CLICK DOES NOT BOOK AT ONCE HERE. The link under a picture was fixed
 * when the email was sent, so it can only say "row 1, 10:00", and the row is
 * worked out again when it is clicked. A mail client may have fetched the
 * pictures days earlier — Apple Mail fetches them on arrival, and keeps them —
 * so the day the reader saw and the day the click lands on can differ. A
 * click therefore opens the popup on that time, address filled in, and the
 * reader presses Book on the real date. "Fixed dates" keeps the one click:
 * there every link names its date.
 */

import fs from "node:fs";
import path from "node:path";

import { isTimeZone, wallClockIn, wallClockToInstant } from "@shared/time-zones";

import { liveSlotState, slotImage } from "./slot-image";
import { getBookingSlots, isWallClockTime, workingTimes } from "./slots";

export const LIVE_MAX_ROWS = 10;

/** "1000,1130" → ["10:00", "11:30"]: only times of the working day, in order, each once. */
export function liveColumns(raw: string): string[] {
  const grid = new Set(workingTimes());
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const m = /^(\d{2})(\d{2})$/.exec(part.trim());
    const time = m ? `${m[1]}:${m[2]}` : "";
    if (isWallClockTime(time) && grid.has(time) && !out.includes(time)) out.push(time);
  }
  return out.sort();
}

export function columnsParam(columns: string[]): string {
  return columns.map((time) => time.replace(":", "")).join(",");
}

/**
 * The date `row` stands for now: the row-th upcoming day with a free time
 * among `columns`. Null when the calendar cannot be read or there are not that
 * many such days in the next two weeks.
 */
export async function liveDay(
  row: number,
  columns: string[],
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<string | null> {
  if (!Number.isInteger(row) || row < 0 || row >= LIVE_MAX_ROWS || columns.length === 0) return null;
  const window = await getBookingSlots("", 14, opts);
  if (!window.ok) return null;
  const days = window.body.days.filter((day) => day.slots.some((time) => columns.includes(time)));
  return days[row]?.date ?? null;
}

/** The reader's date and time for a calendar date and time. */
export function readerClock(date: string, time: string, calendarZone: string, readerZone: string): { date: string; time: string } | null {
  const ms = wallClockToInstant(date, time, calendarZone);
  if (ms == null) return null;
  return wallClockIn(isTimeZone(readerZone) ? readerZone : calendarZone, ms);
}

function pictureDirs(): string[] {
  return [
    path.resolve(import.meta.dirname, "public", "booking-days"),
    path.resolve(process.cwd(), "dist", "public", "booking-days"),
    path.resolve(process.cwd(), "client", "public", "booking-days"),
  ];
}

const pictures = new Map<string, Buffer | null>();

function dayPicture(file: string): Buffer | null {
  if (pictures.has(file)) return pictures.get(file) ?? null;
  let found: Buffer | null = null;
  for (const dir of pictureDirs()) {
    try {
      found = fs.readFileSync(path.join(dir, file));
      break;
    } catch {
      /* The next place. */
    }
  }
  pictures.set(file, found);
  return found;
}

/* An empty heading, for a row with no day behind it: one transparent pixel. */
const BLANK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * One picture of the block as it stands now: the row's weekday, its date, or
 * one of its times. `label` is the time as the block was made, drawn when the
 * row has no day behind it.
 */
export async function livePicture(input: {
  row: number;
  file: string;
  columns: string[];
  readerZone: string;
  label?: string;
  opts?: { fetchImpl?: typeof fetch; now?: Date };
}): Promise<Buffer | null> {
  const date = await liveDay(input.row, input.columns, input.opts);
  const window = await getBookingSlots("", 14, input.opts);
  const calendarZone = window.ok ? window.body.timezone : "Europe/Prague";
  if (input.file === "weekday.png" || input.file === "date.png") {
    if (!date) return BLANK;
    /* The reader's date at the block's first time: their day, not ours. */
    const local = readerClock(date, input.columns[0]!, calendarZone, input.readerZone);
    if (!local) return BLANK;
    const [y, m, d] = local.date.split("-").map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
    return dayPicture(input.file === "weekday.png" ? `wd-${weekday}.png` : `dm-${d}-${m}.png`) ?? BLANK;
  }
  const hit = /^(\d{2})(\d{2})\.png$/.exec(input.file);
  const time = hit ? `${hit[1]}:${hit[2]}` : "";
  if (!input.columns.includes(time)) return null;
  if (!date) {
    const fallback = input.label && isWallClockTime(input.label) ? input.label : time;
    return slotImage(fallback, "taken");
  }
  const local = readerClock(date, time, calendarZone, input.readerZone);
  const state = await liveSlotState(date, time, input.opts);
  return slotImage(local?.time ?? time, state) ?? slotImage(time, state);
}

/**
 * Where a click on a live time goes: the popup on that day's time, address
 * filled in, waiting for Book — or that day's times when the time has gone
 * since, or the whole picker when the calendar cannot be read.
 */
export async function liveTarget(input: {
  row: number;
  time: string;
  columns: string[];
  opts?: { fetchImpl?: typeof fetch; now?: Date };
}): Promise<{ date?: string; time?: string }> {
  const date = await liveDay(input.row, input.columns, input.opts);
  if (!date) return {};
  if (!input.columns.includes(input.time)) return { date };
  const state = await liveSlotState(date, input.time, input.opts);
  return state === "free" ? { date, time: input.time } : { date };
}
