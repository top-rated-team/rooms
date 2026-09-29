/**
 * The letter that confirms a time picked inside an email.
 *
 * A time in the email widget (shared/booking-widget.ts) is not written to the
 * calendar when it is picked. The slot is held — for half an hour, because
 * the person has to go back to their inbox — and this letter goes to the
 * address it was picked for, with a link that confirms it. The calendar event,
 * and with it Google's invite, is written only when that link is used
 * (confirm.ts, confirmEmailHold). A hold nobody confirms simply runs out.
 *
 * The link does not confirm on its own: it opens the popup, which asks once
 * more. Mail scanners — Outlook's Safe Links, corporate gateways — open every
 * link in a letter before a person does, and a link that booked on GET would
 * have been booked by them.
 *
 * Same Resend account and From address as the lead mail (notify.ts) and the
 * room links (room-access.ts).
 */

import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import { mailFrom } from "../mail-from";
import type { BookingHold } from "./hold";

export const EMAIL_HOLD_TTL_MS = 30 * 60_000;
export const EMAIL_HOLD_TTL_PHRASE = "30 minutes";

const RESEND_URL = "https://api.resend.com/emails";
const EMAIL_TIMEOUT_MS = 10_000;

export const EMAIL_CONFIRM_NO_MAIL_LINE =
  "Email confirmation is off: RESEND_API_KEY and LEAD_EMAIL_FROM are not both set on this deployment. Until they are, a time picked from the email is booked at once and Google's invite goes out instead.";
export const EMAIL_CONFIRM_NO_BASE_LINE =
  "Email confirmation is off: PUBLIC_BASE_URL is not set, so the confirmation link would have no address. Until it is, a time picked from the email is booked at once and Google's invite goes out instead.";
export const EMAIL_CONFIRM_ADDRESS_LINE = "Enter your email address. The link that confirms the call is sent there.";
export const EMAIL_CONFIRM_SEND_FAILED_LINE = "The confirmation email could not be sent just now. Try again in a moment.";

function publicBaseUrl(): string | null {
  return process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || null;
}

/** Whether a picked time can be confirmed by email here, and if not, why. */
export function emailConfirmation(): { on: true } | { on: false; line: string } {
  if (!process.env.RESEND_API_KEY?.trim() || !mailFrom()) return { on: false, line: EMAIL_CONFIRM_NO_MAIL_LINE };
  if (!publicBaseUrl()) return { on: false, line: EMAIL_CONFIRM_NO_BASE_LINE };
  return { on: true };
}

/** /book/confirm/<token>, which server/routes.ts hops into the popup. */
export function confirmationUrl(token: string): string | null {
  const base = publicBaseUrl();
  return base ? `${base}/book/confirm/${token}` : null;
}

function hostName(): string {
  const contract = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;
  return (contract.displayName ?? contract.legalName).trim();
}

function when(hold: Pick<BookingHold, "startsAt" | "timezone">, style: "long" | "short"): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: style,
    day: "numeric",
    month: style,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: hold.timezone,
    timeZoneName: "short",
  }).format(new Date(hold.startsAt));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function confirmationLetter(
  hold: Pick<BookingHold, "startsAt" | "timezone">,
  url: string,
  minutes: number,
): { subject: string; text: string; html: string } {
  const host = hostName();
  const at = when(hold, "long");
  const picked = `You picked a ${minutes}-minute call with ${host} on ${at}.`;
  const held = `The time is held for you for ${EMAIL_HOLD_TTL_PHRASE}. If it is not confirmed by then, nothing is booked and the time is free again.`;
  const notYou = "If you did not pick this time, ignore this email.";
  const text = [picked, "", "Confirm it here:", url, "", held, "", notYou].join("\n");
  const serif = "'Newsreader',Georgia,'Times New Roman',serif";
  const sans = "'Outfit','Segoe UI',Helvetica,Arial,sans-serif";
  const html =
    `<div style="font-family:${serif};font-size:16px;line-height:24px;color:#1B1713;max-width:520px;">` +
    `<p style="margin:0 0 16px 0;">${escapeHtml(picked)}</p>` +
    `<p style="margin:0 0 16px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;` +
    `border-radius:6px;background:#9C3E1C;color:#F7F2E8;font-family:${sans};font-size:15px;text-decoration:none;">Confirm the call</a></p>` +
    `<p style="margin:0 0 16px 0;color:#6B6256;">${escapeHtml(held)}</p>` +
    `<p style="margin:0;color:#6B6256;">${escapeHtml(notYou)}</p></div>`;
  return { subject: `Confirm your call: ${when(hold, "short")}`, text, html };
}

/** False when nothing was sent, so the caller can give the slot back and say so. */
export async function sendConfirmationLetter(
  hold: Pick<BookingHold, "startsAt" | "timezone" | "email" | "confirmToken">,
  minutes: number,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = mailFrom();
  const url = hold.confirmToken ? confirmationUrl(hold.confirmToken) : null;
  if (!key || !from || !url || !hold.email) return false;
  const letter = confirmationLetter(hold, url, minutes);
  try {
    const response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [hold.email], subject: letter.subject, text: letter.text, html: letter.html }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!response.ok) console.error(`[booking] the confirmation email was refused: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error("[booking] sending the confirmation email failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
