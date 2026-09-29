/**
 * The booking times, as a block to put inside an email.
 *
 * An email runs no script and most clients drop a <style> block, so this is
 * the popup's grid redrawn the way mail allows: tables for layout, every style
 * inline, and each day or time a plain link. The link is a /book link
 * (shared/booking-link.ts) with the day, the time and confirm=email on it, so
 * a click opens the popup on the site with that time already picked; the
 * booking is held there and confirmed from a link sent to the recipient.
 *
 * The times are the ones free when the block is made. An email is read hours
 * or days later, so a time may have gone by then — the popup says so and shows
 * what is still free, rather than this block pretending to be live.
 */

import type { BookingDay, BookingSlotsResponse } from "./api";
import { bookLinkUrl } from "./booking-link";

export type BookingWidgetShow = "times" | "days";

export interface BookingWidgetOptions {
  /** Where the links point: https://top-rated.team. */
  baseUrl: string;
  slots: BookingSlotsResponse;
  /** One link per time, or one per day that opens the popup on it. */
  show: BookingWidgetShow;
  /** How many days that have a free time to include. */
  days: number;
  /** At most this many times a day, spread across the day. */
  timesPerDay: number;
  /** An address, a mail tool's merge tag, or empty. */
  recipient?: string;
  /** Who the call is with, for the heading. */
  hostName: string;
}

export interface BookingWidget {
  html: string;
  text: string;
  /** What the block offers, for the page that shows it. */
  days: BookingDay[];
}

export const WIDGET_MAX_DAYS = 10;
export const WIDGET_MAX_TIMES_PER_DAY = 16;

/* The site's palette (client/src/index.css, light theme) as hex, because a
   mail client knows nothing of CSS variables. */
const INK = "#1B1713";
const MUTED = "#6B6256";
const RULE = "#D2C8B7";
const PAPER = "#F7F2E8";
const SLOT = "#FBF8F2";
const ACCENT = "#9C3E1C";
const SANS = "'Outfit','Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "'Newsreader',Georgia,'Times New Roman',serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** `count` of `times`, spread from the first to the last, in order. */
export function spreadTimes(times: string[], count: number): string[] {
  if (count >= times.length) return [...times];
  if (count <= 1) return times.slice(0, 1);
  const picked = new Set<number>();
  for (let i = 0; i < count; i += 1) picked.add(Math.round((i * (times.length - 1)) / (count - 1)));
  return [...picked].sort((a, b) => a - b).map((index) => times[index]!);
}

/** "Thu 2 Oct" — the civil date, not shifted by the reader's zone. */
export function widgetDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y!, m! - 1, d!, 12)),
  );
}

export function chooseWidgetDays(slots: BookingSlotsResponse, days: number, timesPerDay: number): BookingDay[] {
  const perDay = clamp(timesPerDay, 1, WIDGET_MAX_TIMES_PER_DAY);
  return slots.days
    .filter((day) => day.slots.length > 0)
    .slice(0, clamp(days, 1, WIDGET_MAX_DAYS))
    .map((day) => ({ date: day.date, slots: spreadTimes(day.slots, perDay) }));
}

function button(href: string, label: string): string {
  return (
    `<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;margin:0 6px 6px 0;padding:7px 12px;` +
    `border:1px solid ${RULE};border-radius:6px;background:${SLOT};color:${INK};font-family:${SANS};font-size:14px;` +
    `line-height:18px;text-decoration:none;white-space:nowrap;">${escapeHtml(label)}</a>`
  );
}

export function buildBookingWidget(options: BookingWidgetOptions): BookingWidget {
  const chosen = chooseWidgetDays(options.slots, options.days, options.timesPerDay);
  const link = (input: { date?: string; time?: string }) =>
    bookLinkUrl(options.baseUrl, { ...input, confirmByEmail: true, recipient: options.recipient });
  const minutes = options.slots.slotMinutes;
  const zone = options.slots.timezone;
  const heading = `Book a ${minutes}-minute call with ${options.hostName}`;
  const intro =
    options.show === "times"
      ? `Pick a time. Times are in ${zone}.`
      : `Pick a day, then a time on it. Times are in ${zone}.`;
  const confirmLine = "We email you a link to confirm it. Nothing is booked until you do.";
  const other = link({});

  const rows = chosen
    .map((day) => {
      const label = widgetDayLabel(day.date);
      if (options.show === "days") {
        const count = options.slots.days.find((row) => row.date === day.date)?.slots.length ?? day.slots.length;
        return `<tr><td style="padding:4px 0 0 0;">${button(link({ date: day.date }), `${label} · ${count} ${count === 1 ? "time" : "times"}`)}</td></tr>`;
      }
      const times = day.slots.map((time) => button(link({ date: day.date, time }), time)).join("");
      return (
        `<tr><td style="padding:10px 0 0 0;font-family:${SANS};font-size:12px;line-height:16px;letter-spacing:0.04em;` +
        `text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td></tr>` +
        `<tr><td style="padding:6px 0 0 0;">${times}</td></tr>`
      );
    })
    .join("");

  const empty =
    `<tr><td style="padding:10px 0 0 0;font-family:${SERIF};font-size:15px;line-height:22px;color:${INK};">` +
    `No free times in the next days. The link below shows the whole calendar.</td></tr>`;

  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;border-collapse:separate;">` +
    `<tr><td style="padding:20px 22px;background:${PAPER};border:1px solid ${RULE};border-radius:8px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
    `<tr><td style="font-family:${SANS};font-size:17px;line-height:22px;font-weight:600;color:${INK};">${escapeHtml(heading)}</td></tr>` +
    `<tr><td style="padding:6px 0 4px 0;font-family:${SERIF};font-size:15px;line-height:22px;color:${MUTED};">${escapeHtml(intro)}</td></tr>` +
    (chosen.length > 0 ? rows : empty) +
    `<tr><td style="padding:12px 0 0 0;font-family:${SERIF};font-size:14px;line-height:20px;color:${MUTED};">` +
    `${escapeHtml(confirmLine)} <a href="${escapeHtml(other)}" target="_blank" style="color:${ACCENT};text-decoration:underline;">Other times</a></td></tr>` +
    `</table></td></tr></table>`;

  const textRows = chosen.map((day) => {
    const label = widgetDayLabel(day.date);
    if (options.show === "days") return `${label}: ${link({ date: day.date })}`;
    return [label, ...day.slots.map((time) => `  ${time}  ${link({ date: day.date, time })}`)].join("\n");
  });
  const text = [
    heading,
    intro,
    "",
    ...(chosen.length > 0 ? textRows : ["No free times in the next days."]),
    "",
    `Other times: ${other}`,
    confirmLine,
  ].join("\n");

  return { html, text, days: chosen };
}
