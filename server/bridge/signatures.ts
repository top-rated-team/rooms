/**
 * Who may write into a room from outside, per provider.
 *
 * WAHA and ChatWoot can be told to send a header of our choosing, so they echo
 * a shared secret in `X-Webhook-Secret`. Slack and ClickUp cannot: each signs
 * the request body with a secret of its own, and that signature is the only
 * thing that proves the request came from them. A body that arrives without
 * the right proof for its provider is refused, and so is every body when the
 * secret that would check it is not set. Nothing here falls back to "open".
 *
 * Both signatures are over the exact bytes that were sent, so the JSON body
 * parser keeps a copy of them for the bridge path (`keepBridgeRawBody`).
 * Re-serialising the parsed object is not the same bytes.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const BRIDGE_INBOUND_PATH = "/api/bridge/inbound";

/** Slack's own advice: a signed request older than five minutes is a replay. */
export const SLACK_MAX_SKEW_SECONDS = 5 * 60;

export interface RawBodyRequest extends IncomingMessage {
  rawBody?: Buffer;
}

/**
 * The `verify` hook for `express.json`. Keeps the bytes of a bridge webhook,
 * and of nothing else, so a signature can be checked against what was sent.
 */
export function keepBridgeRawBody(req: IncomingMessage, _res: unknown, buf: Buffer): void {
  if (req.url?.startsWith(BRIDGE_INBOUND_PATH)) (req as RawBodyRequest).rawBody = buf;
}

/**
 * A secret variable may hold several, comma-separated: one per Slack app or
 * one per ClickUp webhook. Each ClickUp webhook is created with its own secret.
 */
export function secretsFrom(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sameText(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hmacHex(secret: string, payload: Buffer | string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** The shared `X-Webhook-Secret` that WAHA and ChatWoot are configured to send. */
export function sharedWebhookSecretOk(provided: string | undefined): boolean {
  const expected =
    process.env.BRIDGE_WEBHOOK_SECRET?.trim() ||
    process.env.WAHA_WEBHOOK_SECRET?.trim() ||
    process.env.CHATWOOT_WEBHOOK_SECRET?.trim() ||
    "";
  if (!expected || !provided) return false;
  return sameText(expected, provided);
}

/**
 * Slack: `v0=` and the hex HMAC-SHA256 of `v0:<timestamp>:<raw body>`, keyed
 * with the app's signing secret, in `X-Slack-Signature`; the timestamp in
 * `X-Slack-Request-Timestamp`, in seconds.
 */
export function slackSignatureOk(input: {
  rawBody: Buffer | string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  secrets?: string[];
  nowSeconds?: number;
}): boolean {
  const secrets = input.secrets ?? secretsFrom(process.env.SLACK_SIGNING_SECRET);
  if (secrets.length === 0 || input.rawBody === undefined || !input.timestamp || !input.signature) return false;
  if (!/^\d{1,12}$/.test(input.timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(input.timestamp)) > SLACK_MAX_SKEW_SECONDS) return false;
  const base = Buffer.concat([Buffer.from(`v0:${input.timestamp}:`), Buffer.from(input.rawBody)]);
  return secrets.some((secret) => sameText(`v0=${hmacHex(secret, base)}`, input.signature!));
}

/**
 * ClickUp: the hex HMAC-SHA256 of the raw body, keyed with the secret ClickUp
 * returned when the webhook was created, in `X-Signature`.
 */
export function clickUpSignatureOk(input: {
  rawBody: Buffer | string | undefined;
  signature: string | undefined;
  secrets?: string[];
}): boolean {
  const secrets = input.secrets ?? secretsFrom(process.env.CLICKUP_WEBHOOK_SECRET);
  if (secrets.length === 0 || input.rawBody === undefined || !input.signature) return false;
  const provided = input.signature.trim().toLowerCase();
  return secrets.some((secret) => sameText(hmacHex(secret, input.rawBody!), provided));
}
