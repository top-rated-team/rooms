/**
 * One WhatsApp interface, two transports.
 *
 * Callers above this directory — room sign-in, the booking proof, the
 * confirmation reply, the QR probe — talk to this module and to nothing else.
 *
 *   send a message to a chat
 *   parse an inbound body
 *   tell me our own number
 *   tell me whether the account is alive
 *
 * WAHA is the default and the only transport a fork is told to run. The other
 * transport is a generic hosted-API adapter. Selecting between them is reading
 * the environment, not a migration: the same number, the same account and the
 * same peppered chat-id hashes, so every existing binding still resolves.
 *
 * If both are configured, the hosted one wins on a house host and WAHA
 * everywhere else. That rule is also in docs/specs/whatsapp.md.
 */

import { isHouseHost } from "@shared/operator";

import {
  hostedConfigured,
  hostedIsAlive,
  hostedWebhookHeader,
  probeHosted,
  sendHosted,
} from "./hosted";
import { resetInboundForTests } from "./inbound";
import type { AliveResult, ProbeResult, SendResult, TransportName } from "./types";
import { probeWahaTransport, sendWaha, wahaConfigured, wahaIsAlive } from "./waha";

export type { AcceptedInboundMessage, AccountStatusInbound, SenderProviderId } from "./types";
export type { AliveResult, ProbeResult, SendResult, TransportName } from "./types";
export type {
  AccountStatusMatcher,
  InboundDrop,
  InboundDropReason,
  InboundMatcher,
  InboundResult,
} from "./inbound";
export {
  INBOUND_MAX_AGE_MS,
  acceptInbound,
  accountIdIsOurs,
  chatIdIsExpected,
  dispatchInbound,
  echoFlag,
  eventIsMessageReceived,
  inboundDrops,
  isNotGroup,
  isNotOurEcho,
  messageIdIsNew,
  parseSenderProviderId,
  registerAccountStatusMatcher,
  registerInboundMatcher,
  rememberMessageId,
  resetInboundForTests,
  secretMatches,
  selfIdKnown,
  senderIsKnown,
  timestampIsRecent,
} from "./inbound";
export { digitsFromAccountBody, hostedAccountId, hostedConfigured, hostedWebhookHeader } from "./hosted";
export { digitsFromMeId, isWhatsAppGroup, parseWahaInbound, wahaConfigured } from "./waha";

/**
 * Which transport answers. If both are configured, hosted wins on a house
 * host (top-rated.team, adgrant.ai, localhost) and WAHA everywhere else.
 * A missing host falls back to PUBLIC_BASE_URL.
 */
export function selectTransport(host?: string): TransportName | null {
  const hosted = hostedConfigured();
  const waha = wahaConfigured();
  if (hosted && waha) {
    const probe = host?.trim() || process.env.PUBLIC_BASE_URL?.trim() || "";
    return isHouseHost(probe) ? "hosted" : "waha";
  }
  if (hosted) return "hosted";
  if (waha) return "waha";
  return null;
}

export function whatsappConfigured(host?: string): boolean {
  return selectTransport(host) !== null;
}

export async function sendMessage(
  input: { chatId: string; text: string },
  fetchImpl: typeof fetch = fetch,
  host?: string,
): Promise<SendResult> {
  const transport = selectTransport(host);
  if (transport === "hosted") return sendHosted(input, fetchImpl);
  if (transport === "waha") return sendWaha(input, fetchImpl);
  return { ok: false, line: "WhatsApp is not configured on this deployment." };
}

export async function probeWhatsApp(fetchImpl: typeof fetch = fetch, host?: string): Promise<ProbeResult> {
  const transport = selectTransport(host);
  if (transport === "hosted") return probeHosted(fetchImpl);
  if (transport === "waha") return probeWahaTransport(fetchImpl);
  return {
    ok: false,
    line: "WhatsApp is not configured on this deployment, so LinkedIn is the way to bind this room.",
  };
}

export async function accountIsAlive(fetchImpl: typeof fetch = fetch, host?: string): Promise<AliveResult> {
  const transport = selectTransport(host);
  if (transport === "hosted") return hostedIsAlive(fetchImpl);
  if (transport === "waha") return wahaIsAlive(fetchImpl);
  return {
    ok: false,
    line: "WhatsApp is not configured on this deployment, so LinkedIn is the way to bind this room.",
  };
}

export { hostedWebhookHeader as inboundSecretHeader };

/** Current inbound webhook path used by both transports. */
export const WHATSAPP_INBOUND_PATH = "/api/hooks/inbound";

/** Test seam: clear inbound state. */
export function resetWhatsAppForTests(): void {
  resetInboundForTests();
}
