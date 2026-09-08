/**
 * Somebody else's agent, admitted to one thread.
 *
 * The member rail already draws this: watch by default, a company name, a
 * join date, an expiry, a calls-per-day budget, revoke with a reason, and four
 * sentences about what the agent can never do. This file is the server half
 * that comment said did not exist.
 *
 * THE CREDENTIAL IS NOT THE ROOM LINK. `/w/:token` is a state handle for the
 * room. Anyone who has it can open the room. An admitted agent gets its own
 * secret, hashed here, bound to a named person on our roster. Presenting the
 * room token as that secret must fail. Owner actions (admit, revoke, list,
 * change mode) still take the room token, because those are a person in the
 * room talking about the room — not the agent authenticating as itself.
 *
 * THE COUNTER IS NOT AN IP. server/rateLimit.ts keys on the caller's address.
 * A server-initiated agent turn has none, so a seat carries its own daily
 * count. Two seats do not share one bucket.
 *
 * AGENT TO AGENT. An agent replies to an agent only when a person named both
 * in one message. That rule lives in `mayAgentReplyToAgent`, not on a policy
 * page. The message route still hard-codes the author as the visitor, so the
 * loop cannot start today without a caller; the function is what a caller has
 * to go through if that ever changes.
 *
 * WHERE THIS LIVES. In memory, in this process — the same constraint
 * server/identity.ts has, because this parcel does not own shared/schema.ts.
 * A restart forgets every seat and every credential. Nothing a visitor reads
 * claims otherwise.
 */

import { createHash } from "node:crypto";
import { customAlphabet, nanoid } from "nanoid";
import { z } from "zod";
import type { Seat, SeatMode, SeatRevocation } from "@shared/api";
import { AGENTS, EXPERT_BY_KEY, type ExpertDef } from "@shared/roster";
import type { Member, MemberKind, Message } from "@shared/schema";
import { storage } from "./storage";
import { broadcast } from "./ws";

/* --------------------------------- bounds -------------------------------- */

export const DEFAULT_CALLS_PER_DAY = 20;
export const MAX_CALLS_PER_DAY = 100;
export const DEFAULT_EXPIRES_DAYS = 7;
export const MAX_EXPIRES_DAYS = 90;

export const SEAT_MODES: SeatMode[] = ["watch", "suggest", "act"];

const CREDENTIAL_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CREDENTIAL_LENGTH = 32;
const mintSecret = customAlphabet(CREDENTIAL_ALPHABET, CREDENTIAL_LENGTH);
const CREDENTIAL_PREFIX = "seat_";

/* --------------------------------- copy ---------------------------------- */
/* Interpolated from the constants above, so raising a bound cannot leave a
 * sentence describing the old one. No resume date the in-memory map cannot
 * keep. No exclamation marks. */

export const WATCH_CANNOT_POST =
  "This agent is watching this thread. It cannot post.";

export const ROOM_TOKEN_IS_NOT_A_SEAT =
  "The room link is a handle for the room. It is not a credential for this agent.";

/** Scheme for the agent's own secret: `Authorization: Seat <credential>`. Not Bearer, so a room token cannot be smuggled in by accident. */
export const SEAT_AUTHORIZATION_SCHEME = "Seat";

function budgetSpentLine(callsPerDay: number): string {
  return `Budget spent — ${callsPerDay} calls today. It stopped, and said so in the thread.`;
}

function expiredLine(expiresOn: string): string {
  return `This admission expired ${dayLabel(expiresOn)}. It has to be re-added.`;
}

function revokedLine(revoked: SeatRevocation): string {
  return `Revoked ${dayLabel(revoked.on)} by ${revoked.by} — reason: ${revoked.reason}`;
}

function admitBody(seat: Seat): string {
  return [
    `Admitted ${seat.displayName} (${seat.company}) to #${seat.thread}, watching.`,
    `Bound to ${seat.boundParty} on our side.`,
    `${seat.callsPerDay} calls a day. Expires ${dayLabel(seat.expiresOn)}.`,
    ROOM_TOKEN_IS_NOT_A_SEAT,
    "This admission is remembered in this process. A restart forgets the credential.",
  ].join(" ");
}

function revokeBody(seat: Seat, revoked: SeatRevocation): string {
  return `${revokedLine(revoked)}. ${seat.displayName} can no longer read #${seat.thread} with that credential.`;
}

function draftBody(body: string): string {
  return `Draft, waiting for a person to approve.\n\n${body}`;
}

/* --------------------------------- records -------------------------------- */

interface StoredSeat {
  id: string;
  workspaceId: string;
  /** Workspace token, used only to broadcast into the right room. Never a seat credential. */
  roomToken: string;
  memberKey: string;
  handle: string;
  displayName: string;
  company: string;
  mode: SeatMode;
  thread: string;
  channelId: string;
  joinedOn: string;
  expiresOn: string;
  callsUsed: number;
  callsPerDay: number;
  /** UTC day `callsUsed` belongs to, YYYY-MM-DD. */
  day: string;
  boundParty: string;
  boundPartyKey: string;
  credentialHash: string;
  revoked?: SeatRevocation;
  /** Day a budget-spent line was already written, so a burst cannot spam the thread. */
  budgetNoticeDay?: string;
}

const seats = new Map<string, StoredSeat>();
const seatsByHash = new Map<string, string>();

export function resetSeatsForTests(): void {
  seats.clear();
  seatsByHash.clear();
}

export const admitSeatSchema = z.object({
  company: z.string().min(1).max(160),
  displayName: z.string().min(1).max(120),
  channelId: z.string().min(1),
  boundPartyKey: z.string().min(1).max(80),
  callsPerDay: z.number().int().positive().max(MAX_CALLS_PER_DAY).optional(),
  expiresOn: z.string().min(1).max(40),
});

export type AdmitSeatInput = z.infer<typeof admitSeatSchema>;

export const revokeSeatSchema = z.object({
  seatId: z.string().min(1),
  by: z.string().min(1).max(120),
  reason: z.string().min(1).max(300),
});

export type RevokeSeatInput = z.infer<typeof revokeSeatSchema>;

export type SeatResult<T> = { ok: true } & T | { ok: false; error: string };

/* --------------------------------- helpers -------------------------------- */

/**
 * Pull the agent's own secret out of an Authorization header. The Seat scheme
 * is the only one that carries this secret, so a Bearer room token returns
 * null rather than being tried as the agent.
 */
export function credentialFromAuthorization(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = header.match(/^(\S+)\s+(\S+)$/);
  if (!match) return null;
  const [, scheme, value] = match;
  if (scheme.toLowerCase() !== SEAT_AUTHORIZATION_SCHEME.toLowerCase()) return null;
  return value;
}

function hashCredential(credential: string): string {
  return createHash("sha256").update(credential).digest("hex");
}

function mintCredential(): string {
  return `${CREDENTIAL_PREFIX}${mintSecret()}`;
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function dayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AG";
  const first = parts[0].slice(0, 1);
  const second = parts.length > 1 ? parts[parts.length - 1].slice(0, 1) : parts[0].slice(1, 2);
  return (first + second).toUpperCase() || "AG";
}

function slugHandle(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "outside-agent";
}

function parseExpiry(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const at = Date.parse(`${trimmed}T23:59:59.000Z`);
    return Number.isFinite(at) ? at : null;
  }
  const at = Date.parse(trimmed);
  return Number.isFinite(at) ? at : null;
}

function expiryAllowed(at: number, now: number): boolean {
  if (at <= now) return false;
  const max = now + MAX_EXPIRES_DAYS * 24 * 60 * 60_000;
  return at <= max;
}

function isExpired(seat: StoredSeat, now: number): boolean {
  const at = Date.parse(seat.expiresOn);
  return Number.isFinite(at) && at < now;
}

function expertOf(key: string): ExpertDef | undefined {
  return EXPERT_BY_KEY[key] ?? Object.values(EXPERT_BY_KEY).find((row) => row.id === key);
}

function toPublic(seat: StoredSeat): Seat {
  const publicSeat: Seat = {
    id: seat.id,
    memberKey: seat.memberKey,
    handle: seat.handle,
    displayName: seat.displayName,
    company: seat.company,
    mode: seat.mode,
    thread: seat.thread,
    channelId: seat.channelId,
    joinedOn: seat.joinedOn,
    expiresOn: seat.expiresOn,
    callsUsed: seat.callsUsed,
    callsPerDay: seat.callsPerDay,
    boundParty: seat.boundParty,
    boundPartyKey: seat.boundPartyKey,
  };
  if (seat.revoked) publicSeat.revoked = { ...seat.revoked };
  return publicSeat;
}

function rollDay(seat: StoredSeat, now: number): void {
  const day = dayKey(now);
  if (seat.day === day) return;
  seat.day = day;
  seat.callsUsed = 0;
}

function uniqueHandle(workspaceId: string, displayName: string): string {
  const base = slugHandle(displayName);
  const taken = new Set(
    [...seats.values()]
      .filter((row) => row.workspaceId === workspaceId && !row.revoked)
      .map((row) => row.handle),
  );
  if (!taken.has(base) && !AGENTS.some((agent) => agent.handle === base || agent.id === base)) return base;
  return `${base}-${nanoid(6).toLowerCase()}`;
}

function describeParse(error: z.ZodError): string {
  const first = error.issues[0];
  return first ? `${first.path.join(".") || "body"}: ${first.message}` : "That is not an admission this room can hold.";
}

/* -------------------------- agent named in a message -------------------------- */

export interface NamedHandle {
  handle: string;
  id: string;
}

/**
 * Agent ids a person named in one message: explicit mentions plus @handles.
 * Roster agents resolve to their roster id. Seats resolve to `seat:<id>`.
 */
export function agentsNamedIn(
  body: string,
  mentions: string[] | undefined = [],
  extra: NamedHandle[] = [],
): string[] {
  const known = new Map<string, string>();
  const remember = (key: string, id: string): void => {
    known.set(key.replace(/^@/, "").toLowerCase(), id);
  };
  for (const agent of AGENTS) {
    remember(agent.handle, agent.id);
    remember(agent.id, agent.id);
    remember(`agent:${agent.id}`, agent.id);
  }
  for (const row of extra) {
    remember(row.handle, row.id);
    remember(row.id, row.id);
    remember(`agent:${row.id}`, row.id);
  }

  const found = new Set<string>();
  const mentionPattern = /@([a-z0-9][a-z0-9-]*)/gi;
  const consider = (raw: string): void => {
    const key = raw.replace(/^@/, "").toLowerCase();
    const id = known.get(key) ?? known.get(key.replace(/^agent:/, ""));
    if (id) found.add(id);
  };
  for (const mention of mentions) consider(mention);
  for (const match of body.matchAll(mentionPattern)) consider(match[1] ?? "");
  return [...found];
}

export function normalizeAgentRef(value: string): string {
  return value.replace(/^@/, "").replace(/^agent:/, "").toLowerCase();
}

export function seatHandlesFor(workspaceId: string): NamedHandle[] {
  return [...seats.values()]
    .filter((row) => row.workspaceId === workspaceId && !row.revoked)
    .map((row) => ({ handle: row.handle, id: `seat:${row.id}` }));
}

/**
 * An agent replies to an agent only when a person named both in one message.
 *
 * A person (visitor or expert) may always summon an agent. A system line never
 * does. An agent's own message may start another agent's reply only when
 * `namedByPerson` contains both the author and the target — the person named
 * both, in one message. That is the whole of the loop rule.
 */
export function mayAgentReplyToAgent(input: {
  authorKind: MemberKind;
  authorKey: string;
  targetAgentId: string;
  namedByPerson: string[];
}): { ok: true } | { ok: false; reason: string } {
  if (input.authorKind === "visitor" || input.authorKind === "expert") return { ok: true };
  if (input.authorKind === "system") {
    return { ok: false, reason: "A system line cannot start an agent reply." };
  }

  const author = normalizeAgentRef(input.authorKey);
  const target = normalizeAgentRef(input.targetAgentId);
  if (author === target) {
    return { ok: false, reason: "An agent does not reply to itself." };
  }

  const named = new Set(input.namedByPerson.map(normalizeAgentRef));
  if (named.has(author) && named.has(target)) return { ok: true };

  return {
    ok: false,
    reason: "An agent replies to an agent only when a person named both in one message.",
  };
}

/**
 * The form the message route should call: name the agents in this one body,
 * then apply the loop rule. A visitor still always gets through.
 */
export function mayKickOffFromMessage(input: {
  authorKind: MemberKind;
  authorKey: string;
  body: string;
  mentions?: string[];
  targetAgentId: string;
  workspaceId: string;
}): { ok: true } | { ok: false; reason: string } {
  return mayAgentReplyToAgent({
    authorKind: input.authorKind,
    authorKey: input.authorKey,
    targetAgentId: input.targetAgentId,
    namedByPerson: agentsNamedIn(input.body, input.mentions, seatHandlesFor(input.workspaceId)),
  });
}

/* ------------------------------- owner actions ------------------------------- */

export async function admitSeat(
  token: string,
  input: AdmitSeatInput,
  now: number = Date.now(),
): Promise<SeatResult<{ seat: Seat; credential: string; member: Member; message: Message }>> {
  const parsed = admitSeatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeParse(parsed.error) };

  const state = await storage.getWorkspaceByToken(token);
  if (!state) return { ok: false, error: "Workspace not found" };

  const data = parsed.data;
  const company = data.company.trim();
  const displayName = data.displayName.trim();
  if (!company) return { ok: false, error: "Whose tool this is has to be named." };
  if (!displayName) return { ok: false, error: "The agent has to have a name." };

  const channel = state.channels.find((candidate) => candidate.id === data.channelId);
  if (!channel) return { ok: false, error: "Unknown thread for this room." };

  const expert = expertOf(data.boundPartyKey);
  if (!expert) {
    return {
      ok: false,
      error: "An admission has to be bound to a named person on our side. That key is not on the roster.",
    };
  }

  const expiryAt = parseExpiry(data.expiresOn);
  if (expiryAt === null) return { ok: false, error: "Expiry has to be a real date." };
  if (!expiryAllowed(expiryAt, now)) {
    return {
      ok: false,
      error: `Expiry has to be in the future, and not more than ${MAX_EXPIRES_DAYS} days away. An admission that never ends is a key.`,
    };
  }

  const callsPerDay = data.callsPerDay ?? DEFAULT_CALLS_PER_DAY;
  const id = nanoid();
  const credential = mintCredential();
  const stored: StoredSeat = {
    id,
    workspaceId: state.workspace.id,
    roomToken: token,
    memberKey: `agent:seat:${id}`,
    handle: uniqueHandle(state.workspace.id, displayName),
    displayName,
    company,
    mode: "watch",
    thread: channel.slug,
    channelId: channel.id,
    joinedOn: new Date(now).toISOString(),
    expiresOn: new Date(expiryAt).toISOString(),
    callsUsed: 0,
    callsPerDay,
    day: dayKey(now),
    boundParty: expert.name,
    boundPartyKey: expert.memberKey,
    credentialHash: hashCredential(credential),
  };

  seats.set(stored.id, stored);
  seatsByHash.set(stored.credentialHash, stored.id);

  let member: Member;
  try {
    member = await storage.addMember(state.workspace.id, {
      memberKey: stored.memberKey,
      kind: "agent",
      displayName: stored.displayName,
      role: `${stored.company} — bound to ${stored.boundParty}`,
      initials: initialsFrom(stored.displayName),
      presence: "away",
    });
  } catch (error) {
    seats.delete(stored.id);
    seatsByHash.delete(stored.credentialHash);
    throw error;
  }

  const publicSeat = toPublic(stored);
  const message = await storage.addMessage(state.workspace.id, {
    channelId: stored.channelId,
    authorKey: "system",
    authorKind: "system",
    body: admitBody(publicSeat),
    meta: { seat: "admitted", seatId: stored.id },
  });

  broadcast(token, { type: "member", member });
  broadcast(token, { type: "message", message });

  return { ok: true, seat: publicSeat, credential, member, message };
}

export async function revokeSeat(
  token: string,
  input: RevokeSeatInput,
  now: number = Date.now(),
): Promise<SeatResult<{ seat: Seat; message: Message }>> {
  const parsed = revokeSeatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeParse(parsed.error) };

  const state = await storage.getWorkspaceByToken(token);
  if (!state) return { ok: false, error: "Workspace not found" };

  const stored = seats.get(parsed.data.seatId);
  if (!stored || stored.workspaceId !== state.workspace.id) {
    return { ok: false, error: "Unknown admission in this room." };
  }
  if (stored.revoked) return { ok: false, error: revokedLine(stored.revoked) };

  const reason = parsed.data.reason.trim();
  const by = parsed.data.by.trim();
  if (!reason) return { ok: false, error: "Revoking has to name a reason. A timestamp alone cannot say why access ended." };
  if (!by) return { ok: false, error: "Revoking has to name who did it." };

  if (!stored.revoked) {
    stored.revoked = {
      on: new Date(now).toISOString(),
      by,
      reason,
    };
    seats.set(stored.id, stored);
  }

  const publicSeat = toPublic(stored);
  const revoked = stored.revoked;
  const message = await storage.addMessage(state.workspace.id, {
    channelId: stored.channelId,
    authorKey: "system",
    authorKind: "system",
    body: revokeBody(publicSeat, revoked),
    meta: { seat: "revoked", seatId: stored.id, reason: revoked.reason, by: revoked.by },
  });
  broadcast(token, { type: "message", message });
  return { ok: true, seat: publicSeat, message };
}

export async function setSeatMode(
  token: string,
  seatId: string,
  mode: SeatMode,
  now: number = Date.now(),
): Promise<SeatResult<{ seat: Seat }>> {
  if (!SEAT_MODES.includes(mode)) return { ok: false, error: "Unknown mode." };

  const state = await storage.getWorkspaceByToken(token);
  if (!state) return { ok: false, error: "Workspace not found" };

  const stored = seats.get(seatId);
  if (!stored || stored.workspaceId !== state.workspace.id) {
    return { ok: false, error: "Unknown admission in this room." };
  }
  if (stored.revoked) return { ok: false, error: revokedLine(stored.revoked) };
  if (isExpired(stored, now)) return { ok: false, error: expiredLine(stored.expiresOn) };

  stored.mode = mode;
  seats.set(stored.id, stored);
  return { ok: true, seat: toPublic(stored) };
}

export async function listSeats(token: string, now: number = Date.now()): Promise<Seat[] | null> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;
  return [...seats.values()]
    .filter((row) => row.workspaceId === state.workspace.id)
    .map((row) => {
      rollDay(row, now);
      return toPublic(row);
    });
}

/** The rail's revoke control has a memberKey, not a seat id. */
export async function seatForMemberInRoom(
  token: string,
  memberKey: string,
  now: number = Date.now(),
): Promise<Seat | null> {
  const listed = await listSeats(token, now);
  if (!listed) return null;
  return listed.find((row) => row.memberKey === memberKey) ?? null;
}

/* ----------------------------- agent actions ----------------------------- */
/* These take the seat credential. They never take the room token. */

export type SeatAuth =
  | { ok: true; seat: Seat }
  | { ok: false; error: string };

/**
 * Look up a seat by its own secret. A workspace token, a member key, or any
 * other string that is not the secret minted at admission, fails.
 */
export function authenticateSeat(credential: string, now: number = Date.now()): SeatAuth {
  const secret = credential.trim();
  if (!secret.startsWith(CREDENTIAL_PREFIX) || secret.length !== CREDENTIAL_PREFIX.length + CREDENTIAL_LENGTH) {
    return { ok: false, error: ROOM_TOKEN_IS_NOT_A_SEAT };
  }

  const id = seatsByHash.get(hashCredential(secret));
  if (!id) return { ok: false, error: ROOM_TOKEN_IS_NOT_A_SEAT };

  const stored = seats.get(id);
  if (!stored) return { ok: false, error: ROOM_TOKEN_IS_NOT_A_SEAT };
  if (stored.revoked) return { ok: false, error: revokedLine(stored.revoked) };
  if (isExpired(stored, now)) return { ok: false, error: expiredLine(stored.expiresOn) };

  rollDay(stored, now);
  return { ok: true, seat: toPublic(stored) };
}

export type SeatClaim =
  | { ok: true; seat: Seat }
  | { ok: false; stop: "unknown" | "revoked" | "expired" | "budget"; error: string; seat?: Seat };

/**
 * Takes this seat's next call for the UTC day, or refuses it.
 *
 * Synchronous on purpose, same argument as server/spend.ts: a function with no
 * `await` runs to completion before anything else on this thread, so two posts
 * arriving together cannot both take the last call.
 */
export function claimSeatCall(credential: string, now: number = Date.now()): SeatClaim {
  const auth = authenticateSeat(credential, now);
  if (!auth.ok) {
    const expired = /expired/i.test(auth.error);
    const revoked = /^Revoked /.test(auth.error);
    return {
      ok: false,
      stop: revoked ? "revoked" : expired ? "expired" : "unknown",
      error: auth.error,
    };
  }

  const stored = seats.get(auth.seat.id);
  if (!stored) return { ok: false, stop: "unknown", error: ROOM_TOKEN_IS_NOT_A_SEAT };

  rollDay(stored, now);
  if (stored.callsUsed >= stored.callsPerDay) {
    return { ok: false, stop: "budget", error: budgetSpentLine(stored.callsPerDay), seat: toPublic(stored) };
  }

  stored.callsUsed += 1;
  seats.set(stored.id, stored);
  return { ok: true, seat: toPublic(stored) };
}

export async function readSeatThread(
  credential: string,
  now: number = Date.now(),
): Promise<SeatResult<{ seat: Seat; channelId: string; thread: string; messages: Message[] }>> {
  const auth = authenticateSeat(credential, now);
  if (!auth.ok) return { ok: false, error: auth.error };

  const state = await storage.getWorkspaceByToken(seats.get(auth.seat.id)?.roomToken ?? "");
  if (!state) return { ok: false, error: "Workspace not found" };

  const messages = state.messages.filter((message) => message.channelId === auth.seat.channelId);
  return {
    ok: true,
    seat: auth.seat,
    channelId: auth.seat.channelId,
    thread: auth.seat.thread,
    messages,
  };
}

export async function postFromSeat(
  credential: string,
  body: string,
  now: number = Date.now(),
): Promise<SeatResult<{ seat: Seat; message: Message }>> {
  const text = body.trim();
  if (!text) return { ok: false, error: "A post has to have a body." };
  if (text.length > 8000) return { ok: false, error: "That post is too long." };

  const auth = authenticateSeat(credential, now);
  if (!auth.ok) return { ok: false, error: auth.error };

  const stored = seats.get(auth.seat.id);
  if (!stored) return { ok: false, error: ROOM_TOKEN_IS_NOT_A_SEAT };

  if (stored.mode === "watch") return { ok: false, error: WATCH_CANNOT_POST };

  const claim = claimSeatCall(credential, now);
  if (!claim.ok) {
    if (claim.stop === "budget") await postBudgetNotice(stored, now);
    return { ok: false, error: claim.error };
  }

  const posted = stored.mode === "suggest" ? draftBody(text) : text;
  const message = await storage.addMessage(stored.workspaceId, {
    channelId: stored.channelId,
    authorKey: stored.memberKey,
    authorKind: "agent",
    body: posted,
    meta: stored.mode === "suggest" ? { draft: true, seatId: stored.id } : { seatId: stored.id },
  });
  broadcast(stored.roomToken, { type: "message", message });
  return { ok: true, seat: toPublic(stored), message };
}

async function postBudgetNotice(stored: StoredSeat, now: number): Promise<void> {
  const day = dayKey(now);
  if (stored.budgetNoticeDay === day) return;
  stored.budgetNoticeDay = day;
  seats.set(stored.id, stored);
  try {
    const message = await storage.addMessage(stored.workspaceId, {
      channelId: stored.channelId,
      authorKey: stored.memberKey,
      authorKind: "agent",
      body: budgetSpentLine(stored.callsPerDay),
      meta: { seat: "budget", seatId: stored.id },
    });
    broadcast(stored.roomToken, { type: "message", message });
  } catch (error) {
    console.error("[seats] could not post the budget-spent notice:", error);
  }
}

/* ----------------------------- test seams ----------------------------- */

/** The stored hash, so cases can assert the secret is not on the public seat. */
export function storedSeatForTests(id: string): { credentialHash: string } | undefined {
  const row = seats.get(id);
  if (!row) return undefined;
  return { credentialHash: row.credentialHash };
}
