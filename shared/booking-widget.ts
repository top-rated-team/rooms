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
import { bookLinkUrl, widgetRecipient } from "./booking-link";
import { replyAddress, replyMailto } from "./booking-reply";
import { isTimeZone, offsetLabel, wallClockIn, wallClockToInstant, zoneAbbreviation, zonePhrase } from "./time-zones";

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
  /**
   * The site's signature over that address (server/booking/link-sign.ts).
   * With it a picked time is booked at once — the link reached that inbox —
   * instead of being confirmed from a link we email.
   */
  recipientSig?: string;
  /**
   * More people the owner wants on the call when the recipient books. They
   * ride in every link and the signature covers them, so only a signed
   * block invites them.
   */
  guests?: string[];
  /** Who the call is with, for the heading. */
  hostName: string;
  /**
   * Reply to book (shared/booking-reply.ts): each time is a mailto: to an
   * address at this domain, and the email the recipient sends books it. Only
   * when the deployment receives that mail; without it, times are web links
   * to the popup.
   */
  replyTo?: { domain: string };
  /**
   * Draw each time as an image from /api/booking/slot/<date>/<HHMM>.png
   * (server/booking/slot-image.ts): fetched when the email is opened, so a
   * time taken since the email was sent shows crossed out. Its alt text is
   * the time, for readers who see no images.
   */
  liveImages?: boolean;
  /**
   * The zone the recipient reads the times in (an IANA name). The days and
   * times are shown on their clock and the zone is named; every link still
   * carries the calendar's own date and time, which is what gets booked.
   * Defaults to the calendar's zone. "Days only" keeps the calendar's days:
   * the page that opens shows the times, and names its zone.
   */
  viewerZone?: string;
}

export interface BookingWidget {
  html: string;
  text: string;
  /** What the block offers, on the reader's clock, for the page that shows it. */
  days: BookingDay[];
  /** The zone the block shows its times in. */
  zone: string;
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
export function spreadTimes<T>(times: T[], count: number): T[] {
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

/** One time in the block: what the reader sees, and the calendar slot it books. */
interface WidgetTime {
  /** On the reader's clock: "10:30". */
  label: string;
  /** The calendar's own date and time, which the link and the picture carry. */
  at: { date: string; time: string };
  ms: number;
}

interface WidgetDay {
  /** The reader's date. */
  date: string;
  times: WidgetTime[];
  /** Free times that day, before spreading. */
  total: number;
}

/** The free times regrouped by the reader's own days, in order. */
function readerDays(slots: BookingSlotsResponse, zone: string): WidgetDay[] {
  const out: WidgetDay[] = [];
  for (const day of slots.days) {
    for (const time of day.slots) {
      const ms = wallClockToInstant(day.date, time, slots.timezone);
      if (ms == null) continue;
      const local = wallClockIn(zone, ms);
      const entry = { label: local.time, at: { date: day.date, time }, ms };
      const last = out[out.length - 1];
      if (last && last.date === local.date) {
        last.times.push(entry);
        last.total += 1;
      } else {
        out.push({ date: local.date, times: [entry], total: 1 });
      }
    }
  }
  return out;
}

function chooseReaderDays(slots: BookingSlotsResponse, days: number, timesPerDay: number, zone: string): WidgetDay[] {
  const perDay = clamp(timesPerDay, 1, WIDGET_MAX_TIMES_PER_DAY);
  return readerDays(slots, zone)
    .slice(0, clamp(days, 1, WIDGET_MAX_DAYS))
    .map((day) => ({ ...day, times: spreadTimes(day.times, perDay) }));
}

/** The days and times a block offers, on the clock of `zone` (the calendar's by default). */
export function chooseWidgetDays(
  slots: BookingSlotsResponse,
  days: number,
  timesPerDay: number,
  zone: string = slots.timezone,
): BookingDay[] {
  return chooseReaderDays(slots, days, timesPerDay, zone).map((day) => ({
    date: day.date,
    slots: day.times.map((time) => time.label),
  }));
}

/* Pictures exist for every half-hour (scripts/build-slot-images.mjs). */
function hasPicture(time: string): boolean {
  return /^([01]\d|2[0-3]):(00|30)$/.test(time);
}

function imageButton(href: string, src: string, time: string): string {
  const target = href.startsWith("mailto:") ? "" : ` target="_blank"`;
  return (
    `<a href="${escapeHtml(href)}"${target} style="display:inline-block;margin:0 6px 6px 0;text-decoration:none;">` +
    `<img src="${escapeHtml(src)}" width="64" height="34" alt="${escapeHtml(time)}" ` +
    `style="display:block;width:64px;height:34px;border:0;outline:none;font-family:${SANS};font-size:14px;color:${INK};"></a>`
  );
}

function button(href: string, label: string): string {
  /* A mailto: opens the mail app, not a tab. */
  const target = href.startsWith("mailto:") ? "" : ` target="_blank"`;
  return (
    `<a href="${escapeHtml(href)}"${target} style="display:inline-block;margin:0 6px 6px 0;padding:7px 12px;` +
    `border:1px solid ${RULE};border-radius:6px;background:${SLOT};color:${INK};font-family:${SANS};font-size:14px;` +
    `line-height:18px;text-decoration:none;white-space:nowrap;">${escapeHtml(label)}</a>`
  );
}

export function buildBookingWidget(options: BookingWidgetOptions): BookingWidget {
  const calendarZone = options.slots.timezone;
  /* Days only keeps the calendar's days: the page that opens lists the times. */
  const zone =
    options.show === "times" && options.viewerZone && isTimeZone(options.viewerZone) ? options.viewerZone : calendarZone;
  const chosen = chooseReaderDays(options.slots, options.days, options.timesPerDay, zone);
  const recipient = widgetRecipient(options.recipient);
  const signedFor = options.recipientSig && recipient.kind === "address" ? recipient.value : null;
  const signed = signedFor !== null;
  /* A time in a signed block is one click: the page books it as it opens. A
     day, and Other times, open the picker. */
  const link = (input: { date?: string; time?: string }) =>
    bookLinkUrl(options.baseUrl, {
      ...input,
      confirmByEmail: true,
      recipient: options.recipient,
      sig: options.recipientSig,
      instant: signed && Boolean(input.time),
      ...(signed && options.guests?.length ? { guests: options.guests } : {}),
    });
  const minutes = options.slots.slotMinutes;
  const heading = `Book a ${minutes}-minute call with ${options.hostName}`;
  const live = options.show === "times" && options.liveImages === true;
  /* THE ZONE IS ALWAYS NAMED. Where the block spans a change of clocks, each
     day says its own offset rather than the intro stating one that is wrong
     for some of them. */
  const shown = chosen.flatMap((day) => day.times.map((time) => time.ms));
  const oneOffset = new Set(shown.map((ms) => offsetLabel(zone, ms))).size <= 1;
  const zoneText = oneOffset ? zonePhrase(zone, shown[0] ?? Date.now()) : zonePhrase(zone);
  const introLead = options.show === "times" ? "Pick a time. Times are " : "Pick a day, then a time on it. Times are ";
  const introTail = live ? ". A time crossed out has been taken since this email was sent." : ".";
  const intro = `${introLead}${zoneText}${introTail}`;
  const introHtml = `${escapeHtml(introLead)}<strong style="color:${INK};font-weight:600;">${escapeHtml(zoneText)}</strong>${escapeHtml(introTail)}`;
  const dayLabel = (day: WidgetDay) =>
    `${widgetDayLabel(day.date)}${oneOffset || !day.times[0] ? "" : ` · ${zoneAbbreviation(zone, day.times[0].ms)}`}`;
  const imageSrc = (time: WidgetTime) => {
    const hhmm = (value: string) => value.replace(":", "");
    const base = `${options.baseUrl.replace(/\/+$/, "")}/api/booking/slot/${time.at.date}/${hhmm(time.at.time)}.png`;
    /* The picture is of the reader's time; its state is the calendar slot's. */
    return time.label === time.at.time ? base : `${base}?label=${hhmm(time.label)}`;
  };
  const replyTo = options.show === "times" ? options.replyTo : undefined;
  /* A signed block says nothing under the times: it goes to that one person,
     and a click books, with Google's invite. */
  const confirmLine = replyTo
    ? "Picking a time opens an email to us. Send it, and the call is booked; Google sends you the invite."
    : signed
      ? ""
      : "We email you a link to confirm it. Nothing is booked until you do.";
  const other = link({});
  const when = (day: WidgetDay, time: WidgetTime) => `${widgetDayLabel(day.date)}, ${time.label} (${zone})`;
  const timeHref = (day: WidgetDay, time: WidgetTime) =>
    replyTo
      ? replyMailto(replyTo.domain, { date: time.at.date, time: time.at.time, when: when(day, time), minutes, hostName: options.hostName })
      : link({ date: time.at.date, time: time.at.time });

  const rows = chosen
    .map((day) => {
      if (options.show === "days") {
        const label = widgetDayLabel(day.date);
        return `<tr><td style="padding:4px 0 0 0;">${button(link({ date: day.date }), `${label} · ${day.total} ${day.total === 1 ? "time" : "times"}`)}</td></tr>`;
      }
      const times = day.times
        .map((time) =>
          live && hasPicture(time.label) ? imageButton(timeHref(day, time), imageSrc(time), time.label) : button(timeHref(day, time), time.label),
        )
        .join("");
      return (
        `<tr><td style="padding:10px 0 0 0;font-family:${SANS};font-size:12px;line-height:16px;letter-spacing:0.04em;` +
        `text-transform:uppercase;color:${MUTED};">${escapeHtml(dayLabel(day))}</td></tr>` +
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
    `<tr><td style="padding:6px 0 4px 0;font-family:${SERIF};font-size:15px;line-height:22px;color:${MUTED};">${introHtml}</td></tr>` +
    (chosen.length > 0 ? rows : empty) +
    `<tr><td style="padding:12px 0 0 0;font-family:${SERIF};font-size:14px;line-height:20px;color:${MUTED};">` +
    `${confirmLine ? `${escapeHtml(confirmLine)} ` : ""}<a href="${escapeHtml(other)}" target="_blank" style="color:${ACCENT};text-decoration:underline;">Other times</a></td></tr>` +
    `</table></td></tr></table>`;

  const textRows = chosen.map((day) => {
    if (options.show === "days") return `${widgetDayLabel(day.date)}: ${link({ date: day.date })}`;
    return [
      dayLabel(day),
      ...day.times.map((time) =>
        replyTo
          ? `  ${time.label}  email ${replyAddress(replyTo.domain, time.at.date, time.at.time)}`
          : `  ${time.label}  ${link({ date: time.at.date, time: time.at.time })}`,
      ),
    ].join("\n");
  });
  const text = [
    heading,
    intro,
    "",
    ...(chosen.length > 0 ? textRows : ["No free times in the next days."]),
    "",
    `Other times: ${other}`,
    ...(confirmLine ? [confirmLine] : []),
  ].join("\n");

  return {
    html,
    text,
    days: chosen.map((day) => ({ date: day.date, slots: day.times.map((time) => time.label) })),
    zone,
  };
}
