/**
 * THE LEAD LEDGER — nothing a visitor asks a human for may be lost.
 *
 * Every way into this file is a person who stopped reading and asked for a
 * human: the form on the landing page, the "email me the link" strip, and the
 * hire sheet in the room. They all land here, in this order and never another:
 *
 *   1. `recordLeadRequest()` writes the request to disk, synchronously, before
 *      anything is delivered anywhere. It cannot throw. If the disk write
 *      fails, the request is kept in memory and the failure is shown in the
 *      inbox rather than swallowed.
 *   2. The route writes its own copy through `storage.createLead()`.
 *   3. `deliverLeadRequest()` tries the configured channels and records what
 *      each one did — the failures as carefully as the successes.
 *
 * The consequence that matters: a webhook that throws, a webhook that is not
 * configured at all, a database that is down, and a process that dies halfway
 * through all leave the request readable at /api/leads/inbox. Delivery sits on
 * top of a request that is already safe; it is not what makes it safe.
 *
 * ON THE ROOM ADDRESS. A workspace token is a bearer credential. It is still
 * kept out of the outbound webhook and out of stdout, exactly as before. It is
 * written into this ledger, because a request raised inside a room cannot be
 * answered if the owner cannot open that room — and there is no other way in.
 * That makes the ledger file a credential store: it is named `*.log` and so is
 * already git-ignored, and the inbox that reads it is behind LEAD_INBOX_KEY.
 */

import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { mailFrom } from "./mail-from";
import { timingSafeEqual } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { nanoid } from "nanoid";
import { DOOR_BY_ID } from "@shared/doors";

const WEBHOOK_TIMEOUT_MS = 6_000;
const EMAIL_TIMEOUT_MS = 8_000;
/** How much of the tail of the ledger the inbox reads. A week of leads is kilobytes. */
const MAX_LEDGER_READ_BYTES = 2 * 1024 * 1024;
/** How many requests stay in memory as the fallback for when the disk write fails. */
const MEMORY_LIMIT = 500;
const DEFAULT_LEDGER_FILE = join("data", "leads", "inbox.log");
/** Attribution keys kept per request. Everything past this is somebody testing us. */
const MAX_SOURCE_KEYS = 24;

/* ------------------------------- the record ------------------------------- */

export type LeadChannel = "database" | "webhook" | "email";

export interface LeadAttempt {
  at: string;
  channel: LeadChannel;
  ok: boolean;
  /** What happened, in one line the owner can act on. */
  detail: string;
}

export interface LeadRequest {
  /** Ours, minted here, quoted back to the visitor as their reference. */
  id: string;
  receivedAt: string;
  /** The door the visitor came through, and the company answerable for it. */
  doorId: string | null;
  doorName: string | null;
  legalName: string | null;
  intent: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
  website: string | null;
  message: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  /** The room's own address. Ledger and inbox only — never the webhook, never stdout. */
  roomUrl: string | null;
  source: Record<string, string>;
}

export interface LeadRequestInput {
  intent?: string | null;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  website?: string | null;
  message?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  roomUrl?: string | null;
  source?: Record<string, string> | null;
}

export interface LeadEntry {
  request: LeadRequest;
  attempts: LeadAttempt[];
  /** False when the disk write failed and this exists only in this process. */
  onDisk: boolean;
}

type LedgerEvent =
  | ({ v: 1; k: "request" } & LeadRequest)
  | ({ v: 1; k: "attempt"; id: string } & LeadAttempt);

/* -------------------------------- the file -------------------------------- */

let ledgerFault: string | null = null;
const memory = new Map<string, LeadEntry>();

/** Resolved per call: `.env` is loaded after this module is evaluated. */
export function ledgerPath(): string {
  const configured = process.env.LEAD_LOG_DIR?.trim();
  if (!configured) return join(process.cwd(), DEFAULT_LEDGER_FILE);
  const dir = isAbsolute(configured) ? configured : join(process.cwd(), configured);
  return join(dir, "inbox.log");
}

function writeEvent(event: LedgerEvent): boolean {
  const path = ledgerPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    // Synchronous on purpose. The request has to be on disk before this
    // function returns, because what comes after it is delivery, and delivery
    // is the part that is allowed to fail.
    appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
    ledgerFault = null;
    return true;
  } catch (error) {
    ledgerFault = error instanceof Error ? error.message : String(error);
    console.error(`[lead] the ledger at ${path} could not be written:`, error);
    return false;
  }
}

function remember(entry: LeadEntry): void {
  memory.set(entry.request.id, entry);
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next();
    if (oldest.done) break;
    memory.delete(oldest.value);
  }
}

/* ------------------------------- recording -------------------------------- */

function trim(value: string | null | undefined, max: number): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * `source` arrives from the visitor's own page and is written straight to the
 * ledger, so it is bounded here rather than trusted. Nothing is rejected — a
 * request is never refused over its attribution — it is only trimmed.
 */
function sanitiseSource(source: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!source) return out;
  for (const [key, value] of Object.entries(source)) {
    if (Object.keys(out).length >= MAX_SOURCE_KEYS) break;
    if (typeof value !== "string") continue;
    out[key.slice(0, 64)] = value.slice(0, 300);
  }
  return out;
}

/**
 * Writes the request down. Synchronous, never throws, and returns before any
 * delivery is attempted. The one call in this file that must not be skipped,
 * reordered or made conditional.
 */
export function recordLeadRequest(input: LeadRequestInput): LeadRequest {
  const source = sanitiseSource(input.source);
  const doorId = trim(source.door, 64);
  const door = doorId ? DOOR_BY_ID[doorId] : undefined;

  const request: LeadRequest = {
    id: `lr_${nanoid(12)}`,
    receivedAt: new Date().toISOString(),
    doorId,
    doorName: door?.headline ?? null,
    legalName: door?.contract.legalName ?? null,
    intent: trim(input.intent, 120),
    name: trim(input.name, 160),
    email: trim(input.email, 200),
    company: trim(input.company, 200),
    website: trim(input.website, 300),
    message: trim(input.message, 8_000),
    workspaceId: trim(input.workspaceId, 64),
    workspaceName: trim(input.workspaceName, 160),
    roomUrl: trim(input.roomUrl, 400),
    source,
  };

  const onDisk = writeEvent({ v: 1, k: "request", ...request });
  remember({ request, attempts: [], onDisk });
  if (!onDisk) {
    console.error(
      `[lead] ${request.id} is in memory only and will not survive a restart. Fix the ledger path and copy it out of /api/leads/inbox now.`,
    );
  }
  return request;
}

/** Records what a channel did with a request. Never throws. */
export function recordLeadAttempt(id: string, attempt: LeadAttempt): void {
  const entry = memory.get(id);
  if (entry) entry.attempts.push(attempt);
  writeEvent({ v: 1, k: "attempt", id, ...attempt });
}

function attemptRecord(channel: LeadChannel, ok: boolean, detail: string): LeadAttempt {
  return { at: new Date().toISOString(), channel, ok, detail };
}

/* -------------------------------- delivery -------------------------------- */

interface WebhookPayload {
  id: string;
  createdAt: string;
  door: string | null;
  doorLegalName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
  website: string | null;
  intent: string | null;
  message: string | null;
  source: Record<string, string>;
}

/**
 * The workspace token is deliberately absent: it is a bearer credential that
 * would hand anyone who can read the webhook full access to the visitor's room.
 * The workspace id and name are enough to find it from our side.
 */
function webhookPayload(request: LeadRequest): WebhookPayload {
  return {
    id: request.id,
    createdAt: request.receivedAt,
    door: request.doorId,
    doorLegalName: request.legalName,
    workspaceId: request.workspaceId,
    workspaceName: request.workspaceName,
    name: request.name,
    email: request.email,
    company: request.company,
    website: request.website,
    intent: request.intent,
    message: request.message,
    source: request.source,
  };
}

async function attemptWebhook(request: LeadRequest): Promise<LeadAttempt | null> {
  const url = process.env.LEAD_WEBHOOK_URL?.trim();
  if (!url) return null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(webhookPayload(request)),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      return attemptRecord("webhook", false, `POST returned ${response.status} ${response.statusText}`);
    }
    return attemptRecord("webhook", true, `POST returned ${response.status}`);
  } catch (error) {
    return attemptRecord("webhook", false, error instanceof Error ? error.message : String(error));
  }
}

function notifyAddresses(): string[] {
  return (process.env.LEAD_NOTIFY_EMAIL ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function emailBody(request: LeadRequest): string {
  return [
    `Reference ${request.id}`,
    `Received  ${request.receivedAt}`,
    `Door      ${request.doorName ?? request.doorId ?? "unknown"}`,
    `Wants     ${request.intent ?? "not stated"}`,
    `Name      ${request.name ?? "not given"}`,
    `Email     ${request.email ?? "not given"}`,
    `Company   ${request.company ?? "not given"}`,
    `Website   ${request.website ?? "not given"}`,
    request.roomUrl ? `Room      ${request.roomUrl}` : "Room      none — this came from a page, not a room",
    "",
    request.message ?? "(no message)",
  ].join("\n");
}

/**
 * Email over plain HTTPS, so no dependency and no SMTP client. Off unless
 * RESEND_API_KEY is set; the webhook stays the path that needs no account.
 */
async function attemptEmail(request: LeadRequest): Promise<LeadAttempt | null> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;

  const to = notifyAddresses();
  if (to.length === 0) {
    return attemptRecord("email", false, "RESEND_API_KEY is set but LEAD_NOTIFY_EMAIL is empty, so there is nobody to send to");
  }
  const from = mailFrom();
  if (!from) {
    return attemptRecord("email", false, "RESEND_API_KEY is set but LEAD_EMAIL_FROM is empty; it must be an address on a verified domain");
  }

  const who = request.name ?? request.email ?? "someone";
  const subject = `Asked for a person: ${who} — ${request.intent ?? request.doorName ?? "no intent given"}`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: emailBody(request), reply_to: request.email ?? undefined }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return attemptRecord("email", false, `Resend returned ${response.status} ${detail.slice(0, 200)}`.trim());
    }
    return attemptRecord("email", true, `sent to ${to.join(", ")}`);
  } catch (error) {
    return attemptRecord("email", false, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Tries every configured channel and writes down what each one did. Never
 * throws and never rejects: the request is already safe by the time this runs,
 * so the worst outcome here is an undelivered row in the inbox — which is the
 * truth, and which is visible.
 */
export async function deliverLeadRequest(request: LeadRequest): Promise<void> {
  let delivered = false;

  try {
    const webhook = await attemptWebhook(request);
    if (webhook) {
      recordLeadAttempt(request.id, webhook);
      delivered = delivered || webhook.ok;
    }

    const email = await attemptEmail(request);
    if (email) {
      recordLeadAttempt(request.id, email);
      delivered = delivered || email.ok;
    }
  } catch (error) {
    // Belt and braces: the attempt helpers are not supposed to throw, and if
    // one ever does it must still not take the request down with it.
    console.error("[lead] delivery raised:", error);
    recordLeadAttempt(request.id, attemptRecord("webhook", false, error instanceof Error ? error.message : String(error)));
  }

  if (!delivered) printLead(request);
}

/** The last resort, and the one that works on an empty `.env`: print it. */
function printLead(request: LeadRequest): void {
  const rows: Array<[string, string]> = [
    ["door", request.doorName ?? request.doorId ?? "-"],
    ["wants", request.intent ?? "-"],
    ["name", request.name ?? "-"],
    ["email", request.email ?? "-"],
    ["company", request.company ?? "-"],
    ["website", request.website ?? "-"],
    // No room URL here: stdout is collected by the host and is not a place for
    // a credential.
    ["room", request.workspaceName ? `${request.workspaceName} (${request.workspaceId ?? "-"})` : request.workspaceId ?? "-"],
    ["source", Object.keys(request.source).length ? JSON.stringify(request.source) : "-"],
    ["message", request.message ?? "-"],
  ];

  console.log(
    [
      `---- ASKED FOR A PERSON ${request.id} (not delivered to any channel) ----`,
      `  received  : ${request.receivedAt}`,
      ...rows.map(([label, value]) => `  ${label.padEnd(10)}: ${value}`),
      "  It is kept at /api/leads/inbox. Set LEAD_WEBHOOK_URL to stop reading these in the log.",
      "-".repeat(56),
    ].join("\n"),
  );
}

/* --------------------------------- inbox ---------------------------------- */

function readLedgerTail(): string {
  const path = ledgerPath();
  let handle: number | null = null;
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - MAX_LEDGER_READ_BYTES);
    const length = size - start;
    if (length <= 0) return "";
    const buffer = Buffer.alloc(length);
    handle = openSync(path, "r");
    readSync(handle, buffer, 0, length, start);
    const text = buffer.toString("utf8");
    // A tail read can begin mid-line; that line is unparseable, so drop it.
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // No file yet is the normal state before the first request arrives.
    if (code !== "ENOENT") ledgerFault = error instanceof Error ? error.message : String(error);
    return "";
  } finally {
    if (handle !== null) closeSync(handle);
  }
}

function sameAttempt(a: LeadAttempt, b: LeadAttempt): boolean {
  return a.at === b.at && a.channel === b.channel && a.ok === b.ok && a.detail === b.detail;
}

/**
 * Everything that came in, newest first. Read off the disk and then unioned
 * with this process's memory, so a request whose disk write failed is still
 * listed rather than quietly missing.
 */
export function leadInbox(limit = 200): LeadEntry[] {
  const entries = new Map<string, LeadEntry>();

  for (const line of readLedgerTail().split("\n")) {
    if (!line.trim()) continue;
    let event: LedgerEvent;
    try {
      event = JSON.parse(line) as LedgerEvent;
    } catch {
      // One corrupt line — a half-written append after a hard kill — must not
      // hide the rest of the file.
      continue;
    }

    if (event.k === "request") {
      const { k: _k, v: _v, ...request } = event;
      const existing = entries.get(request.id);
      entries.set(request.id, { request, attempts: existing?.attempts ?? [], onDisk: true });
    } else if (event.k === "attempt") {
      const { k: _k, v: _v, id, ...rest } = event;
      entries.get(id)?.attempts.push(rest);
    }
  }

  for (const [id, entry] of memory) {
    const found = entries.get(id);
    if (!found) {
      entries.set(id, entry);
      continue;
    }
    for (const candidate of entry.attempts) {
      if (!found.attempts.some((existing) => sameAttempt(existing, candidate))) found.attempts.push(candidate);
    }
  }

  return [...entries.values()]
    .sort((a, b) => b.request.receivedAt.localeCompare(a.request.receivedAt))
    .slice(0, limit);
}

/** A database write is a second copy, not a delivery — it does not count here. */
export function wasDelivered(entry: LeadEntry): boolean {
  return entry.attempts.some((row) => row.ok && row.channel !== "database");
}

export interface InboxHealth {
  ledgerPath: string;
  ledgerFault: string | null;
  webhook: string | null;
  email: string | null;
}

export function inboxHealth(): InboxHealth {
  const addresses = notifyAddresses();
  const emailConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
  return {
    ledgerPath: ledgerPath(),
    ledgerFault,
    webhook: process.env.LEAD_WEBHOOK_URL?.trim() ? null : "LEAD_WEBHOOK_URL is not set, so nothing is POSTed anywhere.",
    email: emailConfigured
      ? addresses.length === 0
        ? "RESEND_API_KEY is set but LEAD_NOTIFY_EMAIL is empty, so no email has anywhere to go."
        : null
      : "RESEND_API_KEY is not set, so no email is sent.",
  };
}

/* --------------------------------- the key -------------------------------- */

export function inboxKeyConfigured(): boolean {
  return (process.env.LEAD_INBOX_KEY ?? "").trim().length > 0;
}

/** Constant-time, so the key cannot be guessed a character at a time. */
export function inboxKeyMatches(supplied: string | undefined): boolean {
  const expected = (process.env.LEAD_INBOX_KEY ?? "").trim();
  if (!expected) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from((supplied ?? "").trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------- the page --------------------------------- */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ago(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function field(label: string, value: string | null): string {
  if (!value) return "";
  return `<div class="f"><span class="l">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></div>`;
}

function link(label: string, href: string, text: string): string {
  return `<div class="f"><span class="l">${escapeHtml(label)}</span><span class="v"><a href="${escapeHtml(href)}">${escapeHtml(text)}</a></span></div>`;
}

function attemptHtml(row: LeadAttempt): string {
  return `<li class="${row.ok ? "ok" : "no"}"><b>${escapeHtml(row.channel)}</b> ${escapeHtml(row.detail)} <time>${escapeHtml(row.at)}</time></li>`;
}

function entryHtml(entry: LeadEntry): string {
  const { request } = entry;
  const delivered = wasDelivered(entry);

  const warnings: string[] = [];
  if (!delivered) warnings.push("Not delivered to any channel. It is only here.");
  if (!entry.onDisk) warnings.push("In memory only — the ledger file could not be written. Copy this out now.");

  return `<article class="card${delivered ? "" : " undelivered"}">
  <header>
    <span class="when">${escapeHtml(request.receivedAt.replace("T", " ").replace(/\..*$/, " UTC"))} · ${escapeHtml(ago(request.receivedAt))}</span>
    <code>${escapeHtml(request.id)}</code>
  </header>
  ${warnings.map((line) => `<p class="warn">${escapeHtml(line)}</p>`).join("")}
  ${field("Door", request.doorName ?? request.doorId)}
  ${field("Invoices as", request.legalName)}
  ${field("Wants", request.intent)}
  ${field("Name", request.name)}
  ${request.email ? link("Email", `mailto:${request.email}`, request.email) : ""}
  ${field("Company", request.company)}
  ${field("Website", request.website)}
  ${field("Room", request.workspaceName ?? request.workspaceId)}
  ${request.roomUrl ? link("Open the room", request.roomUrl, request.roomUrl) : ""}
  ${request.message ? `<pre>${escapeHtml(request.message)}</pre>` : '<p class="quiet">No message was typed.</p>'}
  <ul class="attempts">${entry.attempts.map(attemptHtml).join("") || '<li class="no">No delivery was attempted — no channel is configured.</li>'}</ul>
</article>`;
}

/** Plain server-rendered HTML: one page, no bundle, readable on a phone. */
export function renderLeadInbox(entries: LeadEntry[], health: InboxHealth): string {
  const undelivered = entries.filter((entry) => !wasDelivered(entry)).length;
  const notices = [
    health.ledgerFault ? `The ledger file could not be written: ${health.ledgerFault}` : null,
    health.webhook,
    health.email,
  ]
    .filter((line): line is string => Boolean(line))
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Asked for a person</title>
<style>
  :root { color-scheme: light dark; --bg:#fbfbfa; --fg:#1a1a19; --muted:#6b6b68; --line:#e2e2df;
          --card:#fff; --warn:#8a3312; --warnbg:#fdf1ea; --ok:#1a6b3c; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#141413; --fg:#f0efec; --muted:#9b9a95; --line:#2c2c2a;
            --card:#1c1c1a; --warn:#f0a68a; --warnbg:#2a1a14; --ok:#7fc79c; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:1.5rem 1rem 4rem; background:var(--bg); color:var(--fg);
         font:14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:46rem; margin:0 auto; }
  h1 { font-size:1.25rem; margin:0 0 .25rem; letter-spacing:-.01em; }
  .sub { color:var(--muted); margin:0 0 1.25rem; }
  .notices { margin:0 0 1.25rem; padding:.75rem .9rem .75rem 2rem; border:1px solid var(--line);
             border-left:3px solid var(--warn); border-radius:6px; background:var(--warnbg); color:var(--warn); }
  .notices li { margin:.15rem 0; }
  .card { border:1px solid var(--line); border-radius:8px; background:var(--card); padding:.9rem 1rem; margin:0 0 .85rem; }
  .card.undelivered { border-left:3px solid var(--warn); }
  .card header { display:flex; flex-wrap:wrap; gap:.5rem; justify-content:space-between; align-items:baseline; margin-bottom:.5rem; }
  .when { font-weight:600; }
  code, pre, time { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  code { font-size:11px; color:var(--muted); }
  .warn { color:var(--warn); margin:.25rem 0; font-weight:600; }
  .f { display:flex; gap:.6rem; padding:.1rem 0; }
  .l { flex:0 0 7.5rem; color:var(--muted); }
  .v { min-width:0; overflow-wrap:anywhere; }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; background:var(--bg); border:1px solid var(--line);
        border-radius:6px; padding:.6rem .7rem; margin:.6rem 0 0; font-size:13px; }
  .quiet { color:var(--muted); margin:.6rem 0 0; }
  .attempts { list-style:none; margin:.6rem 0 0; padding:0; font-size:12px; }
  .attempts li { padding:.1rem 0; color:var(--muted); }
  .attempts li.ok b { color:var(--ok); }
  .attempts li.no b { color:var(--warn); }
  .attempts time { margin-left:.35rem; font-size:11px; }
  a { color:inherit; }
  footer { color:var(--muted); margin-top:2rem; font-size:12px; overflow-wrap:anywhere; }
</style>
</head><body><main>
<h1>Asked for a person</h1>
<p class="sub">${entries.length} request${entries.length === 1 ? "" : "s"}, newest first${undelivered > 0 ? ` · ${undelivered} not delivered anywhere` : ""}.</p>
${notices ? `<ul class="notices">${notices}</ul>` : ""}
${entries.map(entryHtml).join("") || '<p class="quiet">Nothing has come in yet.</p>'}
<footer>Kept at ${escapeHtml(health.ledgerPath)}. This page is the record; a webhook or an email is only a copy.</footer>
</main></body></html>`;
}
