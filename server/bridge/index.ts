/**
 * The room bridge: one WhatsApp number, one ChatWoot inbox, and the client's
 * own Slack channel or ClickUp list, connected to one room.
 *
 * Attribution is the whole of it. Plumbing lives in the files next to this
 * one. This file holds the connections, decides what may cross, claims a
 * spend turn before a bridged agent answers, and writes a delivery failure
 * onto the message that failed.
 *
 * WHERE THIS LIVES. In memory, in this process — the same constraint
 * server/identity.ts has, because this parcel does not own shared/schema.ts.
 * A restart forgets every bridge. The panel says so.
 */

import { timingSafeEqual } from "node:crypto";
import { clearTimeout, setTimeout } from "node:timers";
import { z } from "zod";
import type { BridgeKind, RoomBridge } from "@shared/api";
import { AGENT_BY_ID, AGENTS } from "@shared/roster";
import type { Member, MemberKind, Message, MessageMeta } from "@shared/schema";
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

const SEND_MS = 5_000;

const AGENT_KEYS: Record<string, string> = {};
for (const agent of AGENTS) {
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
}

const byWorkspace = new Map<string, Map<BridgeKind, StoredBridge>>();
const byWhatsAppChat = new Map<string, string>();
const byChatwootConversation = new Map<string, string>();
const bySlackTarget = new Map<string, string>();
const byClickUpTarget = new Map<string, string>();
const seenInbound = new Map<string, number>();

const SEEN_TTL_MS = 30 * 60_000;

export function resetBridgeForTests(): void {
  byWorkspace.clear();
  byWhatsAppChat.clear();
  byChatwootConversation.clear();
  bySlackTarget.clear();
  byClickUpTarget.clear();
  seenInbound.clear();
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
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return { ok: false, error: "Workspace not found", status: 404 };

  const map = bridgesOf(state.workspace.id);

  if (input.action === "disconnect") {
    const existing = map.get(input.kind);
    if (existing) {
      forgetIndexes(existing);
      map.delete(input.kind);
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
  if (input.kind === "clickup" && (!input.target?.trim() || !input.secret?.trim())) {
    return {
      ok: false,
      error: "ClickUp needs one task id on one list, and an API token. The whole workspace is not accepted.",
      status: 400,
    };
  }

  let target =
    input.kind === "slack"
      ? "channel"
      : (input.target ?? "").trim();
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
  };

  map.set(input.kind, stored);
  if (stored.kind === "whatsapp") byWhatsAppChat.set(stored.target, stored.workspaceId);
  if (stored.kind === "chatwoot") {
    byChatwootConversation.set(`${stored.accountId ?? ""}:${stored.target}`, stored.workspaceId);
  }
  if (stored.kind === "slack") bySlackTarget.set(stored.target, stored.workspaceId);
  if (stored.kind === "clickup") byClickUpTarget.set(stored.target, stored.workspaceId);

  return { ok: true, bridges: [...map.values()].map(toPublic) };
}

function webhookSecretOk(provided: string | undefined): boolean {
  const expected =
    process.env.BRIDGE_WEBHOOK_SECRET?.trim() ||
    process.env.WAHA_WEBHOOK_SECRET?.trim() ||
    process.env.CHATWOOT_WEBHOOK_SECRET?.trim() ||
    "";
  if (!expected) return false;
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type InboundResult =
  | { accepted: false; reason: "unauthorized" }
  | { accepted: true; handled: boolean };

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
 */
export async function acceptBridgeInbound(
  raw: unknown,
  webhookSecret: string | undefined,
  deps: BridgeAgentDeps = {},
): Promise<InboundResult> {
  if (!webhookSecretOk(webhookSecret)) return { accepted: false, reason: "unauthorized" };

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

  const slack = parseSlackInbound(raw);
  if (slack) {
    const slackId = inboundIdFromRaw(raw);
    if (alreadySeen(inboundKey("slack", [slack.channel, slack.user ?? "", slackId ?? slack.body]))) {
      return { accepted: true, handled: false };
    }
    const workspaceId = bySlackTarget.get(slack.channel) ?? bySlackTarget.get("channel");
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

  const clickup = parseClickUpInbound(raw);
  if (clickup) {
    const clickupId = inboundIdFromRaw(raw);
    if (alreadySeen(inboundKey("clickup", [clickup.taskId, clickup.user ?? "", clickupId ?? clickup.body]))) {
      return { accepted: true, handled: false };
    }
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

  return { accepted: true, handled: false };
}

function parseSlackInbound(raw: unknown): { channel: string; user: string | null; body: string } | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const event = root.event !== null && typeof root.event === "object" ? (root.event as Record<string, unknown>) : root;
  if (event.bot_id) return null;
  const channel = typeof event.channel === "string" ? event.channel : typeof root.channel_id === "string" ? root.channel_id : null;
  const text = typeof event.text === "string" ? event.text : typeof root.text === "string" ? root.text : null;
  if (!channel || text === null) return null;
  if (root.type === "url_verification") return null;
  const user = typeof event.user === "string" ? event.user : typeof root.user_id === "string" ? root.user_id : null;
  return { channel, user, body: text };
}

function parseClickUpInbound(raw: unknown): { taskId: string; user: string | null; body: string } | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const payload = root.payload !== null && typeof root.payload === "object" ? (root.payload as Record<string, unknown>) : root;
  const taskId =
    (typeof payload.id === "string" && payload.id) ||
    (typeof root.task_id === "string" && root.task_id) ||
    null;
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
  return { taskId, user, body };
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
    if (!res.ok) return { ok: false, line: DELIVERY_FAILED.clickup };
    return { ok: true };
  } catch {
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
