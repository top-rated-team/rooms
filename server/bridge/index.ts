/**
 * The room bridge: one WhatsApp number, one ChatWoot inbox, and the client's
 * own Slack channel or ClickUp list, connected to one room.
 *
 * Attribution is the whole of it. Plumbing lives in the files next to this
 * one. This file holds the connections, decides what may cross, claims a
 * spend turn before a bridged agent answers, and writes a delivery failure
 * onto the message that failed.
 *
 * WHERE THIS LIVES. In `room_bridges`, read into memory once and written
 * through on every change. It used to live only in this process, and this
 * service redeploys several times a day, so a connected group died silently
 * and often. Without a database it still works and still forgets; the panel
 * says which of the two is true.
 */

import { clearTimeout, setTimeout } from "node:timers";
import { z } from "zod";
import type { BridgeKind, RoomBridge } from "@shared/api";
import { AGENT_BY_ID, AGENTS, VISIBLE_AGENTS } from "@shared/roster";
import type { Member, MemberKind, Message, MessageMeta } from "@shared/schema";
import { roomBridgeSecrets, roomBridges } from "@shared/schema-bridges";
import { and, eq } from "drizzle-orm";
import { getDb, hasDb } from "../db";
import { llmReady, streamAgentAnswer } from "../ai/agentRuntime";
import { storage } from "../storage";
import { claimAgentTurn, recordTurnCost, type RoomRef } from "../spend";
import { broadcast } from "../ws";
import {
  DELIVERY_FAILED,
  MUST_NOT_CROSS,
  UNATTRIBUTED_AUTHOR_KEY,
  buildOutboundPayload,
  mapInboundSender,
  normalizeSender,
  payloadContainsToken,
  stripRoomToken,
  unattributedLine,
  type BridgeSource,
  type MemberRef,
} from "./attribution";
import { isChatwootEcho, parseChatwootInbound, sendChatwootText } from "./chatwoot";
import { ensureChatwootInboxConversation, sendChatwootInboxText } from "./inbox";
import { isWhatsAppGroup, parseWahaInbound, sendWahaText } from "./waha";
import { clickUpSignatureOk, secretsFrom, sharedWebhookSecretOk, slackSignatureOk } from "./signatures";

const SEND_MS = 5_000;

/* The bridge keeps its own copy of this map, so filtering the one in
   routes.ts left @mentions arriving over WhatsApp or ChatWoot able to summon
   a hidden agent into a room. */
const AGENT_KEYS: Record<string, string> = {};
for (const agent of VISIBLE_AGENTS) {
  AGENT_KEYS[agent.handle.toLowerCase()] = agent.id;
  AGENT_KEYS[agent.id.toLowerCase()] = agent.id;
}

const MENTION_PATTERN = /@([a-z0-9][a-z0-9-]*)/gi;

export const connectBridgeSchema = z.object({
  action: z.enum(["connect", "disconnect"]),
  kind: z.enum(["whatsapp", "chatwoot", "slack", "clickup"]),
  target: z.string().min(1).max(500).optional(),
  targetLabel: z.string().min(1).max(160).optional(),
  secret: z.string().min(1).max(2000).optional(),
  accountId: z.string().min(1).max(80).optional(),
  inboxId: z.string().min(1).max(80).optional(),
  inboxIdentifier: z.string().min(1).max(200).optional(),
  baseUrl: z.string().min(1).max(300).optional(),
  channelId: z.string().min(1).max(80).optional(),
  /** Slack and ClickUp only: the secret this room's own app or webhook signs with. */
  inboundSecret: z.string().min(1).max(500).optional(),
  senderMap: z
    .array(
      z.object({
        sender: z.string().min(1).max(80),
        memberKey: z.string().min(1).max(80),
      }),
    )
    .max(50)
    .optional(),
});

export type ConnectBridgeInput = z.infer<typeof connectBridgeSchema>;

interface StoredBridge {
  workspaceId: string;
  token: string;
  kind: BridgeKind;
  target: string;
  targetLabel: string;
  secret: string | null;
  accountId: string | null;
  inboxId: string | null;
  inboxIdentifier: string | null;
  contactIdentifier: string | null;
  baseUrl: string | null;
  channelId: string | null;
  senderMap: Map<string, string>;
  connectedAt: string;
  /** Slack or ClickUp: what inbound for this room is checked with, when the room brought its own. */
  inboundSecret: string | null;
}

const byWorkspace = new Map<string, Map<BridgeKind, StoredBridge>>();
const byWhatsAppChat = new Map<string, string>();
const byChatwootConversation = new Map<string, string>();
const bySlackTarget = new Map<string, string>();
const byClickUpTarget = new Map<string, string>();
const seenInbound = new Map<string, number>();

const SEEN_TTL_MS = 30 * 60_000;

/** A Slack channel id: what an Events API body names a channel by. */
const SLACK_CHANNEL_ID = /^[CG][A-Z0-9]{6,20}$/;

/* --------------------------- keeping them ---------------------------------
 *
 * The maps above are a cache. room_bridges is where a connection lives, so a
 * WhatsApp group connected this morning is still connected after this
 * afternoon's deploy. Same shape as server/identity-store.ts: hydrate once at
 * boot, write through on every change, and carry on in memory when the
 * database is unreachable rather than refusing to work.
 */

let hydrated = false;
let hydrateInFlight: Promise<void> | null = null;

function senderMapToJson(map: Map<string, string>): string | null {
  if (map.size === 0) return null;
  return JSON.stringify([...map.entries()]);
}

function senderMapFromJson(raw: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const row of parsed) {
      if (Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string") {
        map.set(row[0], row[1]);
      }
    }
  } catch {
    /* A row we cannot read is a sender map we do not have, not a dead room. */
  }
  return map;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function hydrateBridges(): Promise<void> {
  if (hydrated) return;
  if (!hasDb()) {
    hydrated = true;
    return;
  }
  if (hydrateInFlight) {
    await hydrateInFlight;
    return;
  }
  hydrateInFlight = (async () => {
    const db = getDb();
    if (!db) return;
    try {
      const rows = await db.select().from(roomBridges);
      for (const row of rows) {
        const stored: StoredBridge = {
          workspaceId: row.workspaceId,
          token: row.token,
          kind: row.kind,
          target: row.target,
          targetLabel: row.targetLabel,
          secret: row.secret,
          accountId: row.accountId,
          inboxId: row.inboxId,
          inboxIdentifier: row.inboxIdentifier,
          contactIdentifier: row.contactIdentifier,
          baseUrl: row.baseUrl,
          channelId: row.channelId,
          senderMap: senderMapFromJson(row.senderMap),
          connectedAt: iso(row.connectedAt),
          inboundSecret: null,
        };
        const map = bridgesOf(stored.workspaceId);
        if (!map.has(stored.kind)) {
          map.set(stored.kind, stored);
          rememberIndexes(stored);
        }
      }
      const unrouted = rows.filter((row) => row.kind === "slack" && !SLACK_CHANNEL_ID.test(row.target)).length;
      if (unrouted > 0) {
        console.warn(
          `[bridge] ${unrouted} Slack connection(s) were saved before the channel id was kept. They still send to Slack, but nothing from Slack reaches them until they are reconnected with the channel id.`,
        );
      }
      await hydrateInboundSecrets(db);
    } catch (error) {
      console.error(
        "[bridge] room_bridges is not readable. Connections stay in memory and vanish on restart until DATABASE_URL is set and `npm run db:push` creates the table.",
        error instanceof Error ? error.message : error,
      );
    } finally {
      hydrated = true;
    }
  })();
  try {
    await hydrateInFlight;
  } finally {
    hydrateInFlight = null;
  }
}

async function persistBridge(stored: StoredBridge): Promise<void> {
  if (!hasDb()) return;
  const db = getDb();
  if (!db) return;
  const values = {
    workspaceId: stored.workspaceId,
    kind: stored.kind,
    token: stored.token,
    target: stored.target,
    targetLabel: stored.targetLabel,
    secret: stored.secret,
    accountId: stored.accountId,
    inboxId: stored.inboxId,
    inboxIdentifier: stored.inboxIdentifier,
    contactIdentifier: stored.contactIdentifier,
    baseUrl: stored.baseUrl,
    channelId: stored.channelId,
    senderMap: senderMapToJson(stored.senderMap),
    connectedAt: new Date(stored.connectedAt),
  };
  try {
    await db
      .insert(roomBridges)
      .values(values)
      /* One row per room per kind, which is the rule the Map already kept:
         connecting a second Slack channel replaces the first. */
      .onConflictDoUpdate({ target: [roomBridges.workspaceId, roomBridges.kind], set: values });
  } catch (error) {
    console.error(
      "[bridge] could not persist a connection. It is in this process only.",
      error instanceof Error ? error.message : error,
    );
  }
}

/* A room's own inbound secret lives in room_bridge_secrets, apart from the
   connection, so that table being missing (before `npm run db:push`) or
   unreadable costs only these secrets and never a connection. Without its row
   a room is checked with the deployment's secret, as it was before. */

const INBOUND_SECRETS_UNREADABLE =
  "[bridge] room_bridge_secrets is not readable, so a room's own Slack or ClickUp secret is kept in this process only and inbound is checked with SLACK_SIGNING_SECRET and CLICKUP_WEBHOOK_SECRET until `npm run db:push` creates it.";

function carriesInboundSecret(kind: BridgeKind): kind is "slack" | "clickup" {
  return kind === "slack" || kind === "clickup";
}

async function hydrateInboundSecrets(db: NonNullable<ReturnType<typeof getDb>>): Promise<void> {
  try {
    const rows = await db.select().from(roomBridgeSecrets);
    for (const row of rows) {
      const stored = byWorkspace.get(row.workspaceId)?.get(row.kind);
      if (stored) stored.inboundSecret = row.inboundSecret;
    }
  } catch (error) {
    console.error(INBOUND_SECRETS_UNREADABLE, error instanceof Error ? error.message : error);
  }
}

async function persistInboundSecret(stored: StoredBridge): Promise<void> {
  if (!carriesInboundSecret(stored.kind) || !hasDb()) return;
  const db = getDb();
  if (!db) return;
  const key = and(eq(roomBridgeSecrets.workspaceId, stored.workspaceId), eq(roomBridgeSecrets.kind, stored.kind));
  try {
    if (!stored.inboundSecret) {
      /* Reconnected without one: the old secret must not keep checking. */
      await db.delete(roomBridgeSecrets).where(key);
      return;
    }
    const values = { workspaceId: stored.workspaceId, kind: stored.kind, inboundSecret: stored.inboundSecret };
    await db
      .insert(roomBridgeSecrets)
      .values(values)
      .onConflictDoUpdate({ target: [roomBridgeSecrets.workspaceId, roomBridgeSecrets.kind], set: values });
  } catch (error) {
    console.error(INBOUND_SECRETS_UNREADABLE, error instanceof Error ? error.message : error);
  }
}

async function forgetBridge(workspaceId: string, kind: BridgeKind): Promise<void> {
  if (!hasDb()) return;
  const db = getDb();
  if (!db) return;
  try {
    await db
      .delete(roomBridges)
      .where(and(eq(roomBridges.workspaceId, workspaceId), eq(roomBridges.kind, kind)));
  } catch (error) {
    console.error(
      "[bridge] could not delete a connection row.",
      error instanceof Error ? error.message : error,
    );
  }
  if (!carriesInboundSecret(kind)) return;
  try {
    await db
      .delete(roomBridgeSecrets)
      .where(and(eq(roomBridgeSecrets.workspaceId, workspaceId), eq(roomBridgeSecrets.kind, kind)));
  } catch (error) {
    console.error(INBOUND_SECRETS_UNREADABLE, error instanceof Error ? error.message : error);
  }
}

export function resetBridgeForTests(): void {
  byWorkspace.clear();
  byWhatsAppChat.clear();
  byChatwootConversation.clear();
  bySlackTarget.clear();
  byClickUpTarget.clear();
  seenInbound.clear();
  clickUpSent.length = 0;
  hydrated = false;
  hydrateInFlight = null;
}

export { MUST_NOT_CROSS };

function bridgesOf(workspaceId: string): Map<BridgeKind, StoredBridge> {
  let map = byWorkspace.get(workspaceId);
  if (!map) {
    map = new Map();
    byWorkspace.set(workspaceId, map);
  }
  return map;
}

function rememberIndexes(stored: StoredBridge): void {
  if (stored.kind === "whatsapp") byWhatsAppChat.set(stored.target, stored.workspaceId);
  if (stored.kind === "chatwoot") {
    byChatwootConversation.set(`${stored.accountId ?? ""}:${stored.target}`, stored.workspaceId);
  }
  if (stored.kind === "slack") bySlackTarget.set(stored.target, stored.workspaceId);
  if (stored.kind === "clickup") byClickUpTarget.set(stored.target, stored.workspaceId);
}

function forgetIndexes(stored: StoredBridge): void {
  if (stored.kind === "whatsapp") byWhatsAppChat.delete(stored.target);
  if (stored.kind === "chatwoot") {
    byChatwootConversation.delete(`${stored.accountId ?? ""}:${stored.target}`);
  }
  if (stored.kind === "slack") bySlackTarget.delete(stored.target);
  if (stored.kind === "clickup") byClickUpTarget.delete(stored.target);
}

function toPublic(stored: StoredBridge): RoomBridge {
  return {
    kind: stored.kind,
    connected: true,
    targetLabel: stored.targetLabel,
    connectedAt: stored.connectedAt,
  };
}

export async function listBridgesForToken(token: string): Promise<RoomBridge[] | null> {
  await hydrateBridges();
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;
  const stored = byWorkspace.get(state.workspace.id);
  if (!stored) return [];
  return [...stored.values()].map(toPublic);
}

export type ConnectResult =
  | { ok: true; bridges: RoomBridge[] }
  | { ok: false; error: string; status: 400 | 404 };

export async function connectOrDisconnectBridge(
  token: string,
  input: ConnectBridgeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectResult> {
  await hydrateBridges();
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return { ok: false, error: "Workspace not found", status: 404 };

  const map = bridgesOf(state.workspace.id);

  if (input.action === "disconnect") {
    const existing = map.get(input.kind);
    if (existing) {
      forgetIndexes(existing);
      map.delete(input.kind);
      await forgetBridge(state.workspace.id, input.kind);
    }
    return { ok: true, bridges: [...map.values()].map(toPublic) };
  }

  if (input.kind === "whatsapp" && !input.target?.trim()) {
    return { ok: false, error: "A WhatsApp chat id is required to connect.", status: 400 };
  }

  const chatwootInboxIdentifier =
    input.inboxIdentifier?.trim() || process.env.CHATWOOT_INBOX_IDENTIFIER?.trim() || "";
  const chatwootAccountId = input.accountId?.trim() || process.env.CHATWOOT_ACCOUNT_ID?.trim() || "";
  const chatwootBaseUrl = input.baseUrl?.trim() || process.env.CHATWOOT_BASE_URL?.trim() || "";
  const chatwootAgentMode =
    input.kind === "chatwoot" &&
    Boolean(input.target?.trim() && input.secret?.trim() && chatwootAccountId);
  const chatwootInboxMode = input.kind === "chatwoot" && Boolean(chatwootInboxIdentifier) && !chatwootAgentMode;

  if (input.kind === "chatwoot" && !chatwootInboxMode && !chatwootAgentMode) {
    return {
      ok: false,
      error:
        "ChatWoot needs an inbox identifier and an account id, so this room can create its own contact and conversation. To speak as an agent into a conversation that already exists, give that conversation's id, the account id, and an API token.",
      status: 400,
    };
  }
  if (chatwootInboxMode && !chatwootAccountId) {
    return {
      ok: false,
      error: "ChatWoot needs an account id so inbound messages can be matched to this room.",
      status: 400,
    };
  }
  if (chatwootInboxMode && !chatwootBaseUrl) {
    return {
      ok: false,
      error: "ChatWoot needs the inbox host (the ChatWoot URL) so this room can open a conversation.",
      status: 400,
    };
  }
  if (input.kind === "slack" && !input.secret?.trim()) {
    return {
      ok: false,
      error: "Slack needs the incoming-webhook URL for one channel. A workspace-wide bot is not accepted.",
      status: 400,
    };
  }
  const slackChannel = input.kind === "slack" ? (input.target ?? "").trim().toUpperCase() : "";
  if (input.kind === "slack" && !SLACK_CHANNEL_ID.test(slackChannel)) {
    return {
      ok: false,
      error:
        "Slack needs the id of that one channel, which starts with C, for example C0123ABCDEF. In Slack it is at the bottom of the channel's details. A channel name is not enough: what Slack sends back names the channel by its id.",
      status: 400,
    };
  }
  if (input.kind === "clickup" && (!input.target?.trim() || !input.secret?.trim())) {
    return {
      ok: false,
      error: "ClickUp needs one task id on one list, and an API token. The whole workspace is not accepted.",
      status: 400,
    };
  }

  let target = input.kind === "slack" ? slackChannel : (input.target ?? "").trim();
  let inboxIdentifier: string | null = chatwootInboxMode ? chatwootInboxIdentifier : null;
  let contactIdentifier: string | null = null;
  let inboxId = input.inboxId?.trim() ?? null;
  const accountId = input.kind === "chatwoot" ? chatwootAccountId : input.accountId?.trim() ?? null;
  const baseUrl = input.kind === "chatwoot" ? chatwootBaseUrl || null : input.baseUrl?.trim() ?? process.env.CHATWOOT_BASE_URL?.trim() ?? null;

  if (chatwootInboxMode) {
    const opened = await ensureChatwootInboxConversation(
      {
        baseUrl: chatwootBaseUrl,
        inboxIdentifier: chatwootInboxIdentifier,
        workspaceId: state.workspace.id,
        workspaceName: state.workspace.name,
        token: state.workspace.token,
        hmacToken: process.env.CHATWOOT_HMAC_TOKEN?.trim() || null,
      },
      fetchImpl,
    );
    if (!opened.ok) {
      return { ok: false, error: opened.line, status: 400 };
    }
    target = opened.conversationId;
    contactIdentifier = opened.contactIdentifier;
    if (opened.inboxId) inboxId = opened.inboxId;
  }

  const targetLabel =
    input.targetLabel?.trim() ||
    (input.kind === "whatsapp"
      ? isWhatsAppGroup(target)
        ? "WhatsApp group"
        : "WhatsApp chat"
      : input.kind === "chatwoot"
        ? chatwootInboxMode
          ? "ChatWoot inbox"
          : "ChatWoot conversation"
        : input.kind === "slack"
          ? "Slack channel"
          : "ClickUp list");

  const existing = map.get(input.kind);
  if (existing) forgetIndexes(existing);

  const senderMap = new Map<string, string>();
  for (const row of input.senderMap ?? []) {
    const sender = normalizeSender(row.sender);
    if (sender) senderMap.set(sender, row.memberKey);
  }

  const stored: StoredBridge = {
    workspaceId: state.workspace.id,
    token: state.workspace.token,
    kind: input.kind,
    target,
    targetLabel,
    secret: input.secret?.trim() ?? null,
    accountId,
    inboxId,
    inboxIdentifier,
    contactIdentifier,
    baseUrl,
    channelId: input.channelId?.trim() ?? null,
    senderMap,
    connectedAt: new Date().toISOString(),
    inboundSecret: carriesInboundSecret(input.kind) ? input.inboundSecret?.trim() || null : null,
  };

  map.set(input.kind, stored);
  rememberIndexes(stored);
  await persistBridge(stored);
  await persistInboundSecret(stored);

  return { ok: true, bridges: [...map.values()].map(toPublic) };
}

/**
 * What an inbound request carried to prove where it came from. WAHA and
 * ChatWoot echo a shared secret; Slack and ClickUp sign the raw body and can
 * send no header of ours. See ./signatures.ts.
 */
export interface BridgeInboundAuth {
  /** `X-Webhook-Secret`. */
  webhookSecret?: string;
  /** The exact bytes of the request body, which is what Slack and ClickUp sign. */
  rawBody?: Buffer | string;
  /** `X-Slack-Signature`. */
  slackSignature?: string;
  /** `X-Slack-Request-Timestamp`. */
  slackTimestamp?: string;
  /** ClickUp's `X-Signature`. */
  clickUpSignature?: string;
}

export type InboundResult =
  | { accepted: false; reason: "unauthorized" }
  /** `challenge` is Slack's url_verification handshake, to be echoed back. */
  | { accepted: true; handled: boolean; challenge?: string };

function inboundKey(source: string, parts: string[]): string {
  return `${source}:${parts.join(":")}`;
}

function pickId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * A provider's own message id, when the payload has one. Used as the dedupe
 * key so two genuine identical bodies (two "thanks") are not collapsed.
 */
function inboundIdFromRaw(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const payload =
    root.payload !== null && typeof root.payload === "object" ? (root.payload as Record<string, unknown>) : null;
  const event =
    root.event !== null && typeof root.event === "object" ? (root.event as Record<string, unknown>) : null;
  return (
    pickId(root.id) ??
    pickId(root.message_id) ??
    pickId(payload?.id) ??
    pickId(payload?.message_id) ??
    pickId(event?.ts) ??
    pickId(event?.event_ts) ??
    pickId(root.event_ts) ??
    pickId(root.ts)
  );
}

function alreadySeen(key: string): boolean {
  const now = Date.now();
  for (const [id, at] of seenInbound) {
    if (now - at > SEEN_TTL_MS) seenInbound.delete(id);
  }
  if (seenInbound.has(key)) return true;
  seenInbound.set(key, now);
  return false;
}

function visitorKey(members: Member[]): string | null {
  const visitor = members.find((row) => row.kind === "visitor");
  return visitor?.memberKey ?? null;
}

function memberRef(members: Member[], memberKey: string): MemberRef | null {
  const row = members.find((member) => member.memberKey === memberKey);
  if (!row) return null;
  return { memberKey: row.memberKey, kind: row.kind, displayName: row.displayName };
}

function homeChannelId(state: { channels: { id: string; slug: string; kind: string }[] }, preferred: string | null): string {
  if (preferred && state.channels.some((channel) => channel.id === preferred)) return preferred;
  const project = state.channels.find((channel) => channel.kind === "project");
  return project?.id ?? state.channels[0]?.id ?? "";
}

function agentsNamedIn(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const id = AGENT_KEYS[match[1].toLowerCase()];
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}

export interface BridgeAgentDeps {
  llmReady?: () => boolean;
  claimAgentTurn?: typeof claimAgentTurn;
  streamAgentAnswer?: typeof streamAgentAnswer;
  fetchImpl?: typeof fetch;
}

/**
 * One inbound webhook from WAHA, ChatWoot, Slack or ClickUp. Writes into the
 * room with an author taken from the member record, or marked unattributed.
 * An @mention of an agent claims through server/spend.ts before anything is
 * sent to the model.
 *
 * Each provider is believed only on its own proof: a Slack body only with a
 * valid Slack signature, a ClickUp body only with a valid ClickUp signature,
 * and WAHA and ChatWoot only with the shared secret. The shared secret does
 * not let a body be read as Slack or ClickUp.
 *
 * `auth` may be the bare `X-Webhook-Secret` value, which is all WAHA and
 * ChatWoot send.
 */
export async function acceptBridgeInbound(
  raw: unknown,
  auth: BridgeInboundAuth | string | undefined,
  deps: BridgeAgentDeps = {},
): Promise<InboundResult> {
  await hydrateBridges();
  const proof: BridgeInboundAuth = typeof auth === "object" && auth !== null ? auth : { webhookSecret: auth };

  if (proof.slackSignature !== undefined) {
    const ok = slackSignatureOk({
      rawBody: proof.rawBody,
      timestamp: proof.slackTimestamp,
      signature: proof.slackSignature,
      secrets: slackSecretsFor(raw),
    });
    if (!ok) return { accepted: false, reason: "unauthorized" };
    return acceptSlackInbound(raw, deps);
  }

  if (sharedWebhookSecretOk(proof.webhookSecret)) return acceptSharedSecretInbound(raw, deps);

  if (proof.clickUpSignature !== undefined) {
    const ok = clickUpSignatureOk({
      rawBody: proof.rawBody,
      signature: proof.clickUpSignature,
      secrets: clickUpSecretsFor(raw),
    });
    if (!ok) return { accepted: false, reason: "unauthorized" };
    return acceptClickUpInbound(raw, deps);
  }

  return { accepted: false, reason: "unauthorized" };
}

/*
 * Which secrets may sign this body. The body is read before it is trusted, but
 * only to choose the key: a room that brought its own secret is checked with
 * that one and nothing else, so neither the deployment's secret nor another
 * room's can write into it. Any other body is checked with the deployment's.
 *
 * Slack's handshake names no channel, and arrives when somebody points their
 * own app at us, so any secret we hold may answer it. It writes nothing.
 */
function ownInboundSecret(kind: "slack" | "clickup", workspaceId: string | undefined): string | null {
  return workspaceId ? byWorkspace.get(workspaceId)?.get(kind)?.inboundSecret ?? null : null;
}

function slackSecretsFor(raw: unknown): string[] {
  const deployment = secretsFrom(process.env.SLACK_SIGNING_SECRET);
  if (slackChallenge(raw) !== null) {
    const rooms = [...byWorkspace.values()].map((map) => map.get("slack")?.inboundSecret).filter((value): value is string => Boolean(value));
    return [...deployment, ...rooms];
  }
  const channel = parseSlackInbound(raw, { all: true })?.channel;
  const own = ownInboundSecret("slack", channel ? bySlackTarget.get(channel) : undefined);
  return own ? [own] : deployment;
}

function clickUpSecretsFor(raw: unknown): string[] {
  const taskId = clickUpTaskId(raw);
  const own = ownInboundSecret("clickup", taskId ? byClickUpTarget.get(taskId) : undefined);
  return own ? [own] : secretsFrom(process.env.CLICKUP_WEBHOOK_SECRET);
}

async function acceptSharedSecretInbound(raw: unknown, deps: BridgeAgentDeps): Promise<InboundResult> {
  const waha = parseWahaInbound(raw);
  if (waha) {
    if (waha.fromMe) return { accepted: true, handled: false };
    const wahaId = inboundIdFromRaw(raw);
    if (alreadySeen(inboundKey("whatsapp", [waha.chatId, wahaId ?? waha.body]))) {
      return { accepted: true, handled: false };
    }
    const workspaceId = byWhatsAppChat.get(waha.chatId);
    if (!workspaceId) return { accepted: true, handled: false };
    await ingestInbound({
      workspaceId,
      source: "whatsapp",
      target: waha.chatId,
      senderId: waha.shared ? waha.participant : waha.chatId,
      shared: waha.shared,
      body: waha.body,
      deps,
    });
    return { accepted: true, handled: true };
  }

  const chatwoot = parseChatwootInbound(raw);
  if (chatwoot) {
    const workspaceId = byChatwootConversation.get(`${chatwoot.accountId}:${chatwoot.conversationId}`);
    if (!workspaceId) return { accepted: true, handled: false };
    const stored = byWorkspace.get(workspaceId)?.get("chatwoot");
    const mode = stored?.inboxIdentifier ? "inbox" : "agent";
    if (isChatwootEcho(chatwoot, mode)) return { accepted: true, handled: false };
    const chatwootId = chatwoot.messageId ?? inboundIdFromRaw(raw);
    if (alreadySeen(inboundKey("chatwoot", [chatwoot.accountId, chatwoot.conversationId, chatwootId ?? chatwoot.body]))) {
      return { accepted: true, handled: false };
    }
    await ingestInbound({
      workspaceId,
      source: "chatwoot",
      target: chatwoot.conversationId,
      senderId: chatwoot.senderId,
      shared: chatwoot.senderType !== "contact",
      body: chatwoot.body,
      deps,
    });
    return { accepted: true, handled: true };
  }

  return { accepted: true, handled: false };
}

async function acceptSlackInbound(raw: unknown, deps: BridgeAgentDeps): Promise<InboundResult> {
  /* Slack will not enable an Events URL until it has seen its challenge come
     back. The request is signed like any other, so it is checked first. */
  const challenge = slackChallenge(raw);
  if (challenge !== null) return { accepted: true, handled: false, challenge };

  const slack = parseSlackInbound(raw);
  if (!slack) return { accepted: true, handled: false };
  const slackId = inboundIdFromRaw(raw);
  if (alreadySeen(inboundKey("slack", [slack.channel, slack.user ?? "", slackId ?? slack.body]))) {
    return { accepted: true, handled: false };
  }
  /* The channel id Slack names, and nothing else. There used to be a fallback
     here that sent every Slack event to whichever room connected Slack last. */
  const workspaceId = bySlackTarget.get(slack.channel);
  if (!workspaceId) return { accepted: true, handled: false };
  await ingestInbound({
    workspaceId,
    source: "slack",
    target: slack.channel,
    senderId: slack.user,
    shared: true,
    body: slack.body,
    deps,
  });
  return { accepted: true, handled: true };
}

async function acceptClickUpInbound(raw: unknown, deps: BridgeAgentDeps): Promise<InboundResult> {
  const clickup = parseClickUpInbound(raw);
  if (!clickup) return { accepted: true, handled: false };
  const clickupId = clickup.commentId ?? inboundIdFromRaw(raw);
  /* Seen first, so a retried delivery of our own comment is still dropped
     after the echo below has used up its record. */
  if (alreadySeen(inboundKey("clickup", [clickup.taskId, clickup.user ?? "", clickupId ?? clickup.body]))) {
    return { accepted: true, handled: false };
  }
  if (isClickUpEcho(clickup)) return { accepted: true, handled: false };
  const workspaceId = byClickUpTarget.get(clickup.taskId);
  if (!workspaceId) return { accepted: true, handled: false };
  await ingestInbound({
    workspaceId,
    source: "clickup",
    target: clickup.taskId,
    senderId: clickup.user,
    shared: true,
    body: clickup.body,
    deps,
  });
  return { accepted: true, handled: true };
}

function slackChallenge(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  if (root.type !== "url_verification") return null;
  return typeof root.challenge === "string" ? root.challenge : null;
}

/* A message subtype a person wrote. Every other subtype is Slack talking
   (somebody joined, a topic changed, a message was edited or deleted) or a
   bot, and none of it is a message for the room. */
const SLACK_PERSON_SUBTYPES = new Set(["thread_broadcast", "file_share", "me_message"]);

/** `all` reads the channel of any event, bot or notice, to pick its key. */
function parseSlackInbound(
  raw: unknown,
  { all = false }: { all?: boolean } = {},
): { channel: string; user: string | null; body: string } | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const event = root.event !== null && typeof root.event === "object" ? (root.event as Record<string, unknown>) : root;
  const channel = typeof event.channel === "string" ? event.channel : typeof root.channel_id === "string" ? root.channel_id : null;
  const text = typeof event.text === "string" ? event.text : typeof root.text === "string" ? root.text : null;
  if (all) return channel ? { channel, user: null, body: text ?? "" } : null;
  if (event.bot_id) return null;
  if (typeof event.subtype === "string" && !SLACK_PERSON_SUBTYPES.has(event.subtype)) return null;
  if (!channel || text === null) return null;
  const user = typeof event.user === "string" ? event.user : typeof root.user_id === "string" ? root.user_id : null;
  return { channel, user, body: text };
}

interface ClickUpInbound {
  taskId: string;
  commentId: string | null;
  user: string | null;
  body: string;
}

function clickUpTaskId(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const payload = root.payload !== null && typeof root.payload === "object" ? (root.payload as Record<string, unknown>) : root;
  return (
    (typeof payload.id === "string" && payload.id) ||
    (typeof root.task_id === "string" && root.task_id) ||
    null
  );
}

function parseClickUpInbound(raw: unknown): ClickUpInbound | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  /* An edited comment arrives as its own event with the same history shape,
     and would land in the room a second time. Only a new comment crosses. */
  if (typeof root.event === "string" && root.event !== "taskCommentPosted") return null;
  const payload = root.payload !== null && typeof root.payload === "object" ? (root.payload as Record<string, unknown>) : root;
  const taskId = clickUpTaskId(raw);
  const history = Array.isArray(payload.history_items) ? payload.history_items : Array.isArray(root.history_items) ? root.history_items : [];
  const comment = history.find((item) => {
    if (item === null || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    return rec.comment && typeof rec.comment === "object";
  }) as Record<string, unknown> | undefined;
  const commentObj = comment?.comment !== null && typeof comment?.comment === "object" ? (comment.comment as Record<string, unknown>) : null;
  const body =
    (typeof commentObj?.text_content === "string" && commentObj.text_content) ||
    (typeof payload.comment === "string" && payload.comment) ||
    null;
  if (!taskId || body === null) return null;
  const userObj = comment?.user !== null && typeof comment?.user === "object" ? (comment.user as Record<string, unknown>) : null;
  const user = typeof userObj?.id === "number" || typeof userObj?.id === "string" ? String(userObj.id) : null;
  return { taskId, commentId: pickId(commentObj?.id), user, body };
}

/* ------------------------- ClickUp's echo -----------------------------------
 *
 * WAHA marks our own message fromMe, ChatWoot says who sent it, and Slack puts
 * a bot_id on what an incoming webhook posted. ClickUp does none of these: the
 * comment we post is written by the person whose API token we hold, and the
 * webhook hands it straight back. Without this it lands in the room a second
 * time and is sent on to every other bridge.
 *
 * So every comment is remembered as it goes out, by its text before the send
 * (the webhook can beat the reply) and by the id ClickUp gives it after. A
 * comment that comes back matching either is ours. In memory on purpose: an
 * echo arrives within seconds, and this is not state the room depends on.
 */

const CLICKUP_ECHO_TTL_MS = 10 * 60_000;

interface ClickUpSent {
  taskId: string;
  text: string;
  commentId: string | null;
  at: number;
}

const clickUpSent: ClickUpSent[] = [];

function clickUpText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function pruneClickUpSent(now: number): void {
  for (let i = clickUpSent.length - 1; i >= 0; i -= 1) {
    if (now - clickUpSent[i].at > CLICKUP_ECHO_TTL_MS) clickUpSent.splice(i, 1);
  }
}

function rememberClickUpSend(taskId: string, text: string): ClickUpSent {
  const now = Date.now();
  pruneClickUpSent(now);
  const sent: ClickUpSent = { taskId, text: clickUpText(text), commentId: null, at: now };
  clickUpSent.push(sent);
  return sent;
}

function forgetClickUpSend(sent: ClickUpSent): void {
  const index = clickUpSent.indexOf(sent);
  if (index >= 0) clickUpSent.splice(index, 1);
}

function isClickUpEcho(inbound: ClickUpInbound): boolean {
  pruneClickUpSent(Date.now());
  const text = clickUpText(inbound.body);
  const index = clickUpSent.findIndex(
    (sent) =>
      (inbound.commentId !== null && sent.commentId === inbound.commentId) ||
      (sent.taskId === inbound.taskId && sent.text === text),
  );
  if (index < 0) return false;
  clickUpSent.splice(index, 1);
  return true;
}

async function ingestInbound(args: {
  workspaceId: string;
  source: BridgeSource;
  target: string;
  senderId: string | null;
  shared: boolean;
  body: string;
  deps: BridgeAgentDeps;
}): Promise<void> {
  const storedMap = byWorkspace.get(args.workspaceId);
  const stored = storedMap ? [...storedMap.values()].find((row) => row.kind === args.source) : undefined;
  if (!stored) return;

  const state = await storage.getWorkspaceByToken(stored.token);
  if (!state) return;

  const mapped = mapInboundSender(
    {
      source: args.source,
      senderId: args.senderId,
      shared: args.shared,
      target: args.target,
    },
    state.members,
    stored.senderMap,
    args.shared ? null : visitorKey(state.members),
  );

  const channelId = homeChannelId(state, stored.channelId);
  if (!channelId) return;

  let authorKey: string;
  let authorKind: MemberKind;
  let body: string;
  const meta: MessageMeta = { bridgeInbound: args.source };

  if (mapped.kind === "mapped" && mapped.memberKey) {
    const member = state.members.find((row) => row.memberKey === mapped.memberKey);
    authorKey = mapped.memberKey;
    authorKind = member?.kind ?? "visitor";
    body = args.body.trim();
  } else {
    authorKey = UNATTRIBUTED_AUTHOR_KEY;
    authorKind = "system";
    meta.unattributed = true;
    const notice = unattributedLine(args.source);
    body = args.body.trim() ? `${notice}\n\n${args.body.trim()}` : notice;
  }

  if (!body) return;

  const message = await storage.addMessage(state.workspace.id, {
    channelId,
    authorKey,
    authorKind,
    body,
    meta,
  });
  broadcast(state.workspace.token, { type: "message", message });
  await fanOutMessage(state.workspace.token, message, args.deps.fetchImpl ?? fetch, args.source);

  const mentioned = agentsNamedIn(args.body);
  for (const agentId of mentioned) {
    await runBridgedAgentTurn(
      {
        token: state.workspace.token,
        workspaceId: state.workspace.id,
        channelId,
        agentId,
        question: args.body,
      },
      depsWith(args.deps),
    );
  }
}

function depsWith(deps: BridgeAgentDeps): Required<Pick<BridgeAgentDeps, "llmReady" | "claimAgentTurn" | "streamAgentAnswer">> & {
  fetchImpl: typeof fetch;
} {
  return {
    llmReady: deps.llmReady ?? llmReady,
    claimAgentTurn: deps.claimAgentTurn ?? claimAgentTurn,
    streamAgentAnswer: deps.streamAgentAnswer ?? streamAgentAnswer,
    fetchImpl: deps.fetchImpl ?? fetch,
  };
}

const LLM_UNAVAILABLE_BRIDGE = `Live answers are not configured on this deployment: there is no \`OPENAI_API_KEY\` set, so this question was not sent to the model.

A person on the team can answer the same question, and that route does not run through the model.`;

export async function runBridgedAgentTurn(
  room: RoomRef & { question: string },
  deps: BridgeAgentDeps = {},
): Promise<Message | null> {
  const resolved = depsWith(deps);
  const authorKey = `agent:${room.agentId}`;
  const agent = AGENT_BY_ID[room.agentId];
  const state = await storage.getWorkspaceByToken(room.token);
  if (!state) return null;

  if (!resolved.llmReady()) {
    const honest = await storage.addMessage(room.workspaceId, {
      channelId: room.channelId,
      authorKey,
      authorKind: "agent",
      body: LLM_UNAVAILABLE_BRIDGE,
      meta: { error: "llm_not_configured" },
    });
    broadcast(room.token, { type: "message", message: honest });
    await fanOutMessage(state.workspace.token, honest, resolved.fetchImpl);
    return honest;
  }

  const claim = resolved.claimAgentTurn(room.workspaceId);
  if (!claim.ok) {
    const stopped = await storage.addMessage(room.workspaceId, {
      channelId: room.channelId,
      authorKey,
      authorKind: "agent",
      body: claim.message,
      meta: { stopped: claim.stop },
    });
    broadcast(room.token, { type: "message", message: stopped });
    await fanOutMessage(state.workspace.token, stopped, resolved.fetchImpl);
    return stopped;
  }

  let body = "";
  try {
    for await (const chunk of resolved.streamAgentAnswer({
      agentId: room.agentId,
      question: room.question,
    })) {
      if (chunk.error) {
        body = chunk.error;
        break;
      }
      if (chunk.delta) body += chunk.delta;
      if (chunk.usage) recordTurnCost(room.workspaceId, room.agentId, chunk.usage);
    }
  } catch {
    body = "The answer stopped part-way through. Ask again, or bring in a person.";
  }

  const finalBody = body.trim() || "The answer stopped part-way through. Ask again, or bring in a person.";
  const posted = await storage.addMessage(room.workspaceId, {
    channelId: room.channelId,
    authorKey,
    authorKind: "agent",
    body: finalBody,
    meta: { agentName: agent?.name },
  });
  broadcast(room.token, { type: "message", message: posted });
  await fanOutMessage(state.workspace.token, posted, resolved.fetchImpl);
  return posted;
}

function shouldFanOut(message: Message): boolean {
  if (message.meta?.event) return false;
  if (message.meta?.bridgeDelivery === "failed") return false;
  return true;
}

/**
 * Takes a message already in the room and, if a bridge is connected, sends it
 * with attribution derived from the member record. Delivery failure is written
 * onto that message. The room token is stripped and is never a field on the
 * outbound payload. `skipKind` is the bridge this message arrived on, so it
 * is not echoed back to the place it came from.
 */
export async function fanOutIfBridged(
  token: string,
  message: Message,
  fetchImpl: typeof fetch = fetch,
  skipKind?: BridgeKind,
): Promise<Message | null> {
  await hydrateBridges();
  return fanOutMessage(token, message, fetchImpl, skipKind);
}

async function fanOutMessage(
  token: string,
  message: Message,
  fetchImpl: typeof fetch,
  skipKind?: BridgeKind,
): Promise<Message | null> {
  if (!shouldFanOut(message)) return message;
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return message;
  const stored = byWorkspace.get(state.workspace.id);
  if (!stored || stored.size === 0) return message;

  const member =
    memberRef(state.members, message.authorKey) ??
    ({
      memberKey: message.authorKey,
      kind: message.authorKind,
      displayName:
        message.authorKind === "agent"
          ? "Agent"
          : message.authorKey === UNATTRIBUTED_AUTHOR_KEY
            ? "Unattributed"
            : "Someone",
    } satisfies MemberRef);

  // Defence in depth: an agent record is attributed as Agent even if the
  // stored kind were ever wrong.
  const speaker: MemberRef =
    message.authorKind === "agent" || message.authorKey.startsWith("agent:")
      ? { ...member, kind: "agent", memberKey: member.memberKey.startsWith("agent:") ? member.memberKey : `agent:${member.memberKey}` }
      : member;

  const failures: string[] = [];

  for (const bridge of stored.values()) {
    if (skipKind && bridge.kind === skipKind) continue;
    /* A one-to-one WhatsApp chat is the visitor (mapInboundSender reads it that
       way), so the visitor's own words are not sent back to them. */
    if (bridge.kind === "whatsapp" && !isWhatsAppGroup(bridge.target) && speaker.kind === "visitor") continue;
    const payload = buildOutboundPayload(speaker, message.body, state.workspace.token, bridge.target);
    if (payloadContainsToken(payload, state.workspace.token)) {
      failures.push(DELIVERY_FAILED[bridge.kind]);
      continue;
    }
    const sent = await sendOnBridge(bridge, payload, fetchImpl);
    if (!sent.ok) failures.push(DELIVERY_FAILED[bridge.kind]);
  }

  if (failures.length === 0) return message;

  const notice = [...new Set(failures)].join(" ");
  const meta: MessageMeta = { ...(message.meta ?? {}), error: notice, bridgeDelivery: "failed" };
  const updated = await storage.updateMessage(message.id, { meta });
  if (updated) broadcast(state.workspace.token, { type: "message", message: updated });
  return updated ?? message;
}

async function sendOnBridge(
  bridge: StoredBridge,
  payload: { text: string; to: string },
  fetchImpl: typeof fetch,
): Promise<{ ok: true } | { ok: false; line: string }> {
  if (bridge.kind === "whatsapp") {
    return sendWahaText({ chatId: bridge.target, text: payload.text }, fetchImpl);
  }
  if (bridge.kind === "chatwoot") {
    if (bridge.inboxIdentifier && bridge.contactIdentifier) {
      return sendChatwootInboxText(
        {
          baseUrl: bridge.baseUrl ?? "",
          inboxIdentifier: bridge.inboxIdentifier,
          contactIdentifier: bridge.contactIdentifier,
          conversationId: bridge.target,
          text: payload.text,
        },
        fetchImpl,
      );
    }
    return sendChatwootText(
      {
        baseUrl: bridge.baseUrl ?? "",
        accountId: bridge.accountId ?? "",
        conversationId: bridge.target,
        token: bridge.secret ?? "",
        text: payload.text,
      },
      fetchImpl,
    );
  }
  if (bridge.kind === "slack") {
    return sendSlack(bridge.secret ?? "", payload.text, fetchImpl);
  }
  return sendClickUp(bridge.secret ?? "", bridge.target, payload.text, fetchImpl);
}

async function sendSlack(
  webhookUrl: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true } | { ok: false; line: string }> {
  if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) {
    return { ok: false, line: DELIVERY_FAILED.slack };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SEND_MS);
  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text }),
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, line: DELIVERY_FAILED.slack };
    return { ok: true };
  } catch {
    return { ok: false, line: DELIVERY_FAILED.slack };
  } finally {
    clearTimeout(timer);
  }
}

async function sendClickUp(
  apiToken: string,
  taskId: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true } | { ok: false; line: string }> {
  if (!apiToken || !taskId) return { ok: false, line: DELIVERY_FAILED.clickup };
  const sent = rememberClickUpSend(taskId, text);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SEND_MS);
  try {
    const res = await fetchImpl(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/comment`, {
      method: "POST",
      headers: {
        Authorization: apiToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ comment_text: text }),
      signal: ac.signal,
    });
    if (!res.ok) {
      forgetClickUpSend(sent);
      return { ok: false, line: DELIVERY_FAILED.clickup };
    }
    sent.commentId = pickId(((await res.json().catch(() => null)) as { id?: unknown } | null)?.id);
    return { ok: true };
  } catch {
    forgetClickUpSend(sent);
    return { ok: false, line: DELIVERY_FAILED.clickup };
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: the stored row, so cases can assert the token is there and not in an outbound payload. */
export function storedBridgeForTests(workspaceId: string, kind: BridgeKind): StoredBridge | undefined {
  return byWorkspace.get(workspaceId)?.get(kind);
}

export { buildOutboundPayload, payloadContainsToken, stripRoomToken };
