import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";
import type { Express, Request, RequestHandler, Response } from "express";
import type { ZodError } from "zod";
import {
  askSchema,
  createChannelSchema,
  createTaskSchema,
  createWorkspaceSchema,
  insertLeadSchema,
  inviteMemberSchema,
  postMessageSchema,
  updateTaskSchema,
  type Channel,
  type Citation,
  type Lead,
  type Message,
  type MessageMeta,
} from "@shared/schema";
import type { AskEvent, CreateWorkspaceResponse, WorkspaceState } from "@shared/api";
import { signAnswer, verifyAnswer } from "./answer-receipt";
import { AGENTS, AGENT_BY_ID, BOOK_A_CALL_URL, DEFAULT_AGENT_ID, EXPERTS, EXPERT_BY_KEY } from "@shared/roster";
import { storage } from "./storage";
import { broadcast } from "./ws";
import {
  deliverLeadRequest,
  inboxHealth,
  inboxKeyConfigured,
  inboxKeyMatches,
  leadInbox,
  recordLeadAttempt,
  recordLeadRequest,
  renderLeadInbox,
  type LeadRequest,
  type LeadRequestInput,
} from "./notify";
import { rateLimit } from "./rateLimit";
import { llmReady, streamAgentAnswer } from "./ai/agentRuntime";
import { kbStatus } from "./ai/kb";
import { ASK_LEDGER_KEY, askBudgetUsd, askLedgerKey, claimAgentTurn, guardAgentTurn, recordTurnCost } from "./spend";

type Turn = { role: "user" | "assistant"; content: string };

/** How much of a channel's history an agent is given for context. */
const MAX_HISTORY_TURNS = 10;

/* ------------------------- /api/ask stream shape -------------------------- */
/* Everything below belongs to the SSE stream at /api/ask. The numbers are the
 * ones a person waiting on a blank panel actually feels, so each says what it
 * is measured against rather than being a round number somebody liked. */

/**
 * Idle gap the stream never exceeds. Ten seconds sits under the shortest
 * connection idle timeout anything in this path enforces, and the visitor is
 * told something real at 8s anyway (ASK_SLOW_NOTICE_MS), so this only carries
 * the quiet stretch between that notice and the first token.
 */
const SSE_HEARTBEAT_MS = 10_000;

/**
 * Padding written once, immediately after the headers, before any work starts.
 *
 * A proxy that waits for a full buffer before forwarding anything will hold a
 * 17-byte comment indefinitely; 4 KiB is one memory page, which is nginx's
 * default `proxy_buffer_size` and larger than any buffer we can name in this
 * path. It is a comment frame, so every SSE client — ours and the browser's
 * own EventSource — drops it without rendering anything.
 *
 * It works together with `no-transform`, not instead of it: 4 KiB of spaces
 * gzips down to a few bytes, so an edge that compresses the stream would
 * squeeze the padding back out of it. `Cache-Control: no-transform` is what
 * stops that, and the header below is why this is 4 KiB rather than 40.
 *
 * Cost: 4 KiB per question, once, against an answer that runs to several KiB.
 */
const SSE_PREAMBLE_BYTES = 4096;
const SSE_PREAMBLE =
  ": padding, so a proxy that waits for a full buffer forwards this response now\n" +
  `:${" ".repeat(SSE_PREAMBLE_BYTES)}\n\n`;

/**
 * When the visitor is told the answer is slow. A reasoning model spends its
 * reasoning tokens before the first visible character, and on a 24k-character
 * context that is routinely 3-8 seconds of nothing — so anything shorter than
 * this cries wolf on a perfectly healthy answer. Past about ten seconds of
 * silence a visitor stops reading the spinner and decides the page is broken.
 */
const ASK_SLOW_NOTICE_MS = 8_000;

/**
 * When we stop waiting for the first chunk and say so.
 *
 * This is a first-chunk deadline only: once tokens are arriving we never cut a
 * good answer off mid-sentence, and `ANSWER_TIMEOUT_MS` in server/ai/agentRuntime.ts
 * (60s) remains the guard against a stalled socket. Thirty seconds is well past
 * any healthy first token and short enough that the visitor is handed a route to
 * a person while they still want one.
 */
const ASK_FIRST_CHUNK_DEADLINE_MS = 30_000;

/** First status event: true of what the agent is about to do, not a guess at progress. */
const ASK_STATUS_RETRIEVING = "Looking through the documentation.";
const ASK_STATUS_THINKING = "Putting the answer together.";
const ASK_STATUS_SLOW =
  "Still going. The model has not sent back any of the answer yet.";
/** Reads the number off the constant, so raising the deadline cannot leave this sentence lying about it. */
const ASK_DEADLINE_MESSAGE =
  `Nothing came back from the model within ${Math.round(ASK_FIRST_CHUNK_DEADLINE_MS / 1000)} seconds, so this stopped ` +
  "rather than leaving you watching a spinner. Ask again, or put the question to a person — that route does not queue.";

/**
 * What /api/ask writes on the wire. `status` is deliberately not in
 * `AskEvent` yet: shared/api.ts is another agent's file this week, and a client
 * that does not know the variant ignores the frame, so the server can lead. The
 * handoff asks for it to be moved into the shared contract.
 */
type AskStatusStage = "retrieving" | "slow";
type AskStreamEvent = AskEvent | { type: "status"; stage: AskStatusStage; message: string };

const LLM_UNAVAILABLE_CHAT = `Live answers are not configured on this deployment: there is no \`OPENAI_API_KEY\` set, so I cannot read the ChatGPT Ads documentation, and I will not guess at an answer about a platform this new.

Everything else here still works. The checklist beside this channel is the real conversion-tracking engagement, step by step, and you can pull a human from the team into this workspace to do it. There is no magic: just expertise, dedicated hours, and a systematic approach.`;

const LLM_UNAVAILABLE_ASK =
  "Live answers are not configured on this deployment — no OPENAI_API_KEY is set, so nothing here will be answered from guesswork. A human on the team can answer the same question today: book a call or ask for the conversion tracking setup.";

const STREAM_INTERRUPTED = "The answer stopped part-way through. Ask again, or bring in a human.";

/* ------------------------------- utilities -------------------------------- */

/**
 * Express 4 does not catch rejected promises from a handler, and an unhandled
 * rejection here would leave the request hanging forever.
 */
function route(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function describe(error: ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${where}${issue.message}`;
  });
  return issues.length > 0 ? issues.join("; ") : "Invalid request body";
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: message });
}

function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? `localhost:${process.env.PORT ?? 5000}`}`;
}

async function requireWorkspace(req: Request, res: Response): Promise<WorkspaceState | null> {
  // Express 5 types a route param as string | string[]; only the first is ours.
  const raw = req.params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const state = token ? await storage.getWorkspaceByToken(token) : null;
  if (!state) {
    notFound(res, "Workspace not found");
    return null;
  }
  return state;
}

/* -------------------------------- agents ---------------------------------- */

/** Both `@tracking` (the handle) and `conversion-tracking` (the id) resolve. */
const AGENT_KEYS: Record<string, string> = {};
for (const agent of AGENTS) {
  AGENT_KEYS[agent.handle.toLowerCase()] = agent.id;
  AGENT_KEYS[agent.id.toLowerCase()] = agent.id;
}

const MENTION_PATTERN = /@([a-z0-9][a-z0-9-]*)/gi;

function agentFromKey(value: string): string | null {
  return AGENT_KEYS[value.replace(/^@/, "").replace(/^agent:/, "").toLowerCase()] ?? null;
}

/**
 * Who, if anyone, answers this message. An explicit mention wins over the
 * channel it was posted in, so `@google-ads` in the docs channel reaches the
 * agent the visitor actually named.
 */
function resolveAgent(channel: Channel, body: string, mentions?: string[]): string | null {
  for (const mention of mentions ?? []) {
    const id = agentFromKey(mention);
    if (id) return id;
  }
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const id = agentFromKey(match[1]);
    if (id) return id;
  }
  if (channel.kind === "agent" && channel.counterpartKey) return agentFromKey(channel.counterpartKey);
  return null;
}

function buildHistory(messages: Message[], channelId: string): Turn[] {
  return messages
    .filter((message) => message.channelId === channelId && message.authorKind !== "system" && message.body.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({
      role: message.authorKind === "agent" ? ("assistant" as const) : ("user" as const),
      content: message.body,
    }));
}

interface AgentReply {
  token: string;
  workspaceId: string;
  channelId: string;
  agentId: string;
  question: string;
  history: Turn[];
}

/**
 * Posts the agent's answer into the channel and streams it over the WebSocket.
 * Runs after the visitor's HTTP request has already been answered, so nothing
 * in here may throw into the request lifecycle.
 */
async function runAgentReply(reply: AgentReply): Promise<void> {
  const authorKey = `agent:${reply.agentId}`;

  if (!llmReady()) {
    const honest = await storage.addMessage(reply.workspaceId, {
      channelId: reply.channelId,
      authorKey,
      authorKind: "agent",
      body: LLM_UNAVAILABLE_CHAT,
      meta: { error: "llm_not_configured" },
    });
    broadcast(reply.token, { type: "message", message: honest });
    return;
  }

  if (!(await guardAgentTurn(reply))) return;

  const placeholder = await storage.addMessage(reply.workspaceId, {
    channelId: reply.channelId,
    authorKey,
    authorKind: "agent",
    body: "",
    meta: { streaming: true },
  });
  broadcast(reply.token, { type: "message", message: placeholder });

  let body = "";
  let citations: Citation[] | undefined;
  let error: string | undefined;

  try {
    for await (const chunk of streamAgentAnswer({ agentId: reply.agentId, question: reply.question, history: reply.history })) {
      if (chunk.error) {
        error = chunk.error;
        continue;
      }
      if (chunk.citations && chunk.citations.length > 0) citations = chunk.citations;
      if (chunk.delta) {
        body += chunk.delta;
        broadcast(reply.token, { type: "message_delta", id: placeholder.id, channelId: reply.channelId, delta: chunk.delta });
      }
      if (chunk.usage) recordTurnCost(reply.workspaceId, reply.agentId, chunk.usage);
    }
  } catch (streamError) {
    console.error("[agent] stream failed:", streamError);
    error = STREAM_INTERRUPTED;
  }

  const finalBody = body.trim().length > 0 ? body : error ?? STREAM_INTERRUPTED;
  const meta: MessageMeta = { streaming: false };
  if (citations && citations.length > 0) meta.citations = citations;
  if (error) meta.error = error;

  await storage.updateMessage(placeholder.id, { body: finalBody, meta });
  broadcast(reply.token, {
    type: "message_done",
    id: placeholder.id,
    channelId: reply.channelId,
    body: finalBody,
    citations,
    error,
  });
}

/** Fire-and-forget: one failed answer must never take the process down. */
function kickOffAgentReply(reply: AgentReply): void {
  void runAgentReply(reply).catch((error: unknown) => {
    console.error("[agent] reply failed:", error);
  });
}

async function ensureAgentSurface(state: WorkspaceState, agentId: string): Promise<Channel> {
  const counterpartKey = `agent:${agentId}`;
  const agent = AGENT_BY_ID[agentId];

  if (!state.members.some((member) => member.memberKey === counterpartKey)) {
    await storage.addMember(state.workspace.id, {
      memberKey: counterpartKey,
      kind: "agent",
      displayName: agent.name,
      role: agent.title,
      initials: agent.initials,
      presence: "online",
    });
  }

  const existing = state.channels.find((channel) => channel.kind === "agent" && channel.counterpartKey === counterpartKey);
  if (existing) return existing;

  return storage.addChannel(state.workspace.id, {
    name: agent.handle,
    slug: agent.handle,
    purpose: agent.title,
    kind: "agent",
    counterpartKey,
    orderIndex: state.channels.length,
  });
}

/* -------------------------- asking for a human ---------------------------- */

/**
 * THE ONE PATH every request for a human takes — the form on the landing page,
 * the "email me the link" strip and the room's hire sheet alike — so the owner
 * reads one inbox and not three.
 *
 * The order is the whole point:
 *
 *   1. the ledger, synchronously, before anything else can fail;
 *   2. the database copy, whose failure costs the second copy and nothing more;
 *   3. delivery, in the background, because a webhook that hangs for six
 *      seconds must not hold the visitor's request open.
 *
 * By the time this function returns, the request cannot be lost. Everything
 * after step one is a copy of something already safe.
 */
async function captureLead(input: LeadRequestInput): Promise<{ request: LeadRequest; lead: Lead }> {
  const request = recordLeadRequest(input);

  let lead: Lead;
  try {
    lead = await storage.createLead({
      workspaceId: request.workspaceId,
      name: request.name,
      email: request.email,
      company: request.company,
      website: request.website,
      intent: request.intent,
      message: request.message,
      source: request.source,
    });
    recordLeadAttempt(request.id, {
      at: new Date().toISOString(),
      channel: "database",
      ok: true,
      detail: `stored as ${lead.id}`,
    });
  } catch (error) {
    // Already on disk, so a database outage must not become a 500 for a
    // visitor whose request we have in fact got.
    console.error("[lead] the database copy failed:", error);
    recordLeadAttempt(request.id, {
      at: new Date().toISOString(),
      channel: "database",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    lead = {
      id: request.id,
      workspaceId: request.workspaceId,
      name: request.name,
      email: request.email,
      company: request.company,
      website: request.website,
      intent: request.intent,
      message: request.message,
      source: request.source,
      createdAt: new Date(request.receivedAt),
      notifiedAt: null,
    };
  }

  void deliverLeadRequest(request).catch((error: unknown) => {
    console.error("[lead] delivery raised after the request was kept:", error);
  });

  return { request, lead };
}

/** The inbox key may also arrive as `Authorization: Bearer <key>`. */
function bearerKey(req: Request): string | undefined {
  const header = req.get("authorization");
  if (!header) return undefined;
  return /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
}

function homeChannel(state: WorkspaceState): Channel {
  return state.channels.find((channel) => channel.slug === "conversion-tracking") ?? state.channels[0];
}

/* -------------------------------- routes ---------------------------------- */

export function registerRoutes(app: Express): void {
  /*
   * The doors moved from /work to /use-case on 7 September 2026. These two
   * redirects exist because the old addresses were published: they were in
   * sitemap.xml, which crawlers had already fetched, and any link somebody
   * saved or sent points at them.
   *
   * A 301 and not a client-side redirect. Everything that is not an API route
   * is served the SPA shell, so /work/google-ads would answer 200 with the
   * whole app and then move the visitor — which works for a person and is a
   * duplicate page for a crawler. A 301 here is the only place the old address
   * can be told, once, that it has permanently become the new one.
   *
   * Registered before anything else so no later handler can claim /work first.
   */
  app.get("/work", (_req, res) => res.redirect(301, "/use-case"));
  app.get("/work/:slug", (req, res) => res.redirect(301, `/use-case/${encodeURIComponent(req.params.slug)}`));

  const createWorkspaceLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, message: "Too many workspaces from this address. Try again later, or book a call." });
  const leadLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, message: "Too many requests from this address. Try again later." });
  // Inviting people also raises a lead, so it gets its own budget rather than
  // eating the contact form's.
  const inviteLimit = rateLimit({ windowMs: 60 * 60_000, max: 20, message: "Too many requests from this address. Try again later." });
  // Slows a guess at LEAD_INBOX_KEY to something not worth attempting, while
  // leaving the owner enough refreshes to work from.
  const inboxLimit = rateLimit({ windowMs: 60_000, max: 30, message: "Too many requests. Wait a moment." });
  const askLimit = rateLimit({ windowMs: 60_000, max: 20, message: "Too many questions at once. Wait a few seconds and ask again." });
  const messageLimit = rateLimit({ windowMs: 60_000, max: 60, message: "Slow down a moment — too many messages." });

  /* --------------------------- workspaces --------------------------- */

  app.post(
    "/api/workspaces",
    createWorkspaceLimit,
    route(async (req, res) => {
      const parsed = createWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const input = parsed.data;
      if (input.agentId && !AGENT_BY_ID[input.agentId]) return badRequest(res, `Unknown agent: ${input.agentId}`);
      const agentId = input.agentId ?? DEFAULT_AGENT_ID;

      const created = await storage.createWorkspace({
        name: input.name,
        visitorName: input.visitorName,
        visitorEmail: input.visitorEmail,
        visitorCompany: input.visitorCompany,
        visitorWebsite: input.visitorWebsite,
        source: input.source,
      });

      const firstMessage = input.firstMessage?.trim();

      /*
       * An answer the visitor already read on the door page. Carried so the room
       * opens with the exchange they had rather than the agent answering the same
       * question a second time, differently, at our expense.
       *
       * The receipt is the whole reason this is allowed. Without it, a POST to
       * this endpoint could put any words in an agent's mouth in a room at a real
       * address on this domain — and an agent message in a room reads as the
       * company speaking. An unsigned or stale body is dropped in silence and the
       * agent answers as before, which is a working room rather than an error.
       */
      const carried = input.firstAnswer;
      const carriedBody = carried && verifyAnswer(carried.body, carried.receipt) ? carried.body.trim() : null;

      let state: WorkspaceState = created;
      let reply: AgentReply | null = null;

      if (firstMessage) {
        // The opening question goes to the agent's own channel so it gets an
        // answer; the project channel keeps the welcome and the checklist.
        const channel = await ensureAgentSurface(created, agentId);
        const history = buildHistory(created.messages, channel.id);
        await storage.addMessage(created.workspace.id, {
          channelId: channel.id,
          authorKey: "visitor",
          authorKind: "visitor",
          body: firstMessage,
        });
        if (carriedBody) {
          // The answer they already have. Written as the agent, because the agent
          // wrote it — the receipt is what proves that — and no reply is started.
          await storage.addMessage(created.workspace.id, {
            channelId: channel.id,
            authorKey: `agent:${agentId}`,
            authorKind: "agent",
            body: carriedBody,
          });
        }

        state = (await storage.getWorkspaceByToken(created.token)) ?? created;

        if (!carriedBody) {
          reply = {
            token: created.token,
            workspaceId: created.workspace.id,
            channelId: channel.id,
            agentId,
            question: firstMessage,
            history,
          };
        }
      }

      const response: CreateWorkspaceResponse = { ...state, url: `${publicBaseUrl(req)}/w/${created.token}` };
      res.status(201).json(response);

      if (reply) kickOffAgentReply(reply);
    }),
  );

  app.get(
    "/api/workspaces/:token",
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;
      res.json(state);
    }),
  );

  /* ---------------------------- messages ---------------------------- */

  app.post(
    "/api/workspaces/:token/messages",
    messageLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;

      const parsed = postMessageSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const { channelId, body, parentId, mentions } = parsed.data;
      const channel = state.channels.find((candidate) => candidate.id === channelId);
      if (!channel) return badRequest(res, "Unknown channel for this workspace");

      const message = await storage.addMessage(state.workspace.id, {
        channelId,
        authorKey: "visitor",
        authorKind: "visitor",
        body,
        parentId: parentId ?? null,
      });

      broadcast(state.workspace.token, { type: "message", message });
      void storage.touchWorkspace(state.workspace.id).catch((error: unknown) => {
        console.error("[workspace] touch failed:", error);
      });

      // The visitor's message is theirs the moment it lands; the agent's answer
      // arrives over the WebSocket whenever it is ready.
      res.status(201).json(message);

      const agentId = resolveAgent(channel, body, mentions);
      if (agentId) {
        kickOffAgentReply({
          token: state.workspace.token,
          workspaceId: state.workspace.id,
          channelId,
          agentId,
          question: body,
          history: buildHistory(state.messages, channelId),
        });
      }
    }),
  );

  /* ---------------------------- channels ---------------------------- */

  app.post(
    "/api/workspaces/:token/channels",
    messageLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;

      const parsed = createChannelSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const channel = await storage.addChannel(state.workspace.id, {
        name: parsed.data.name,
        purpose: parsed.data.purpose ?? null,
        kind: parsed.data.kind,
        counterpartKey: parsed.data.counterpartKey ?? null,
        orderIndex: state.channels.length,
      });

      broadcast(state.workspace.token, { type: "channel", channel });
      res.status(201).json(channel);
    }),
  );

  /* ------------------------------ tasks ----------------------------- */

  app.post(
    "/api/workspaces/:token/tasks",
    messageLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;

      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const task = await storage.addTask(state.workspace.id, {
        title: parsed.data.title,
        detail: parsed.data.detail ?? null,
        status: parsed.data.status,
        assigneeKey: parsed.data.assigneeKey ?? null,
        orderIndex: state.tasks.length,
      });

      broadcast(state.workspace.token, { type: "task", task });
      res.status(201).json(task);
    }),
  );

  app.patch(
    "/api/workspaces/:token/tasks/:id",
    messageLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;

      const existing = state.tasks.find((task) => task.id === req.params.id);
      if (!existing) return notFound(res, "Task not found");

      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const task = await storage.updateTask(existing.id, parsed.data);
      if (!task) return notFound(res, "Task not found");

      broadcast(state.workspace.token, { type: "task", task });
      res.json(task);
    }),
  );

  /* ----------------------------- invite ----------------------------- */

  app.post(
    "/api/workspaces/:token/invite",
    inviteLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;

      const parsed = inviteMemberSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const key = parsed.data.memberKey;
      const expert = EXPERT_BY_KEY[key] ?? EXPERTS.find((candidate) => candidate.id === key);
      if (!expert) return badRequest(res, `Unknown expert: ${key}`);

      const alreadyHere = state.members.find((member) => member.memberKey === expert.memberKey);
      const member =
        alreadyHere ??
        (await storage.addMember(state.workspace.id, {
          memberKey: expert.memberKey,
          kind: "expert",
          displayName: expert.name,
          role: expert.title,
          initials: expert.initials,
          presence: "online",
        }));

      // The hire sheet goes through captureLead, exactly like the landing
      // form, so there is one inbox. The room's own address travels with it:
      // a request raised inside a room is unanswerable without it, and the
      // token is not in the webhook payload — see server/notify.ts.
      const { lead } = await captureLead({
        workspaceId: state.workspace.id,
        workspaceName: state.workspace.name,
        roomUrl: `${publicBaseUrl(req)}/w/${state.workspace.token}`,
        name: parsed.data.name ?? state.workspace.visitorName,
        email: parsed.data.email ?? state.workspace.visitorEmail,
        company: state.workspace.visitorCompany,
        website: state.workspace.visitorWebsite,
        intent: expert.leadsConversionTracking ? "conversion-tracking" : "expert-request",
        message: parsed.data.note ?? `Asked for ${expert.name} (${expert.title}) in the workspace.`,
        // The door came in with the visitor and is already on the workspace;
        // it decides which company the request belongs to.
        source: { ...(state.workspace.source ?? {}), expert: expert.memberKey, workspace: state.workspace.name },
      });

      const systemMessage = await storage.addMessage(state.workspace.id, {
        channelId: homeChannel(state).id,
        authorKey: "system",
        authorKind: "system",
        body: `**${expert.name}** has been asked to join this workspace — ${expert.title}.\n\nThe request is written down and ${expert.name} answers in this channel, usually within one working day. This page is the address: keep the link and come back to it. If it cannot wait, [book a call](${BOOK_A_CALL_URL}).`,
        meta: { event: "expert_requested", memberKey: expert.memberKey },
      });

      broadcast(state.workspace.token, { type: "member", member });
      broadcast(state.workspace.token, { type: "presence", memberKey: member.memberKey, presence: "online" });
      broadcast(state.workspace.token, { type: "message", message: systemMessage });

      res.status(201).json({ member, lead });
    }),
  );

  /* ------------------------------ leads ----------------------------- */

  app.post(
    "/api/leads",
    leadLimit,
    route(async (req, res) => {
      const parsed = insertLeadSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const { request } = await captureLead({
        workspaceId: parsed.data.workspaceId,
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company,
        website: parsed.data.website,
        intent: parsed.data.intent,
        message: parsed.data.message,
        source: parsed.data.source,
      });

      // The reference is the visitor's proof that this exists on our side, and
      // the string the owner searches the inbox for.
      res.status(201).json({ ok: true, reference: request.id });
    }),
  );

  /* --------------------------- the owner's inbox --------------------------- */

  /**
   * Everything that ever came in, newest first, behind LEAD_INBOX_KEY. Plain
   * server-rendered HTML rather than a page in the client bundle: the owner
   * opens it on his phone, and this site has no login to put a page behind.
   *
   * Open it as /api/leads/inbox?key=<LEAD_INBOX_KEY>, or send the same value
   * as `Authorization: Bearer <key>`.
   */
  app.get(
    "/api/leads/inbox",
    inboxLimit,
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      // The page links to room addresses, and a room address is a credential.
      res.setHeader("Referrer-Policy", "no-referrer");

      if (!inboxKeyConfigured()) {
        res
          .status(503)
          .type("text/plain; charset=utf-8")
          .send(
            "The lead inbox is closed: LEAD_INBOX_KEY is not set on this deployment.\nSet it to a long random string, restart, and open this page with ?key=<that string>.\nNothing has been lost in the meantime — requests are kept either way.",
          );
        return;
      }

      const supplied = typeof req.query.key === "string" ? req.query.key : bearerKey(req);
      if (!inboxKeyMatches(supplied)) {
        // Says nothing about whether the route exists.
        res.status(404).type("text/plain; charset=utf-8").send("Not found");
        return;
      }

      res.status(200).type("text/html; charset=utf-8").send(renderLeadInbox(leadInbox(), inboxHealth()));
    },
  );

  /* ------------------------------- ask ------------------------------ */

  app.post(
    "/api/ask",
    askLimit,
    route(async (req, res) => {
      const parsed = askSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const agentId = parsed.data.agentId ?? DEFAULT_AGENT_ID;
      const agent = AGENT_BY_ID[agentId];
      if (!agent) return badRequest(res, `Unknown agent: ${agentId}`);

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      // Asks nginx not to buffer. Cloudflare strips it before the browser sees
      // it, so it is a request to whatever is directly in front of this process
      // and never something to rely on — hence SSE_PREAMBLE below.
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      /**
       * Two flags, not one, and the distinction is the whole bug this endpoint
       * used to have: `ended` means we finished writing, `disconnected` means
       * the visitor went away. A single flag set from a disconnect handler also
       * suppressed `res.end()`, so the response was never terminated.
       */
      let ended = false;
      let disconnected = false;

      let heartbeat: NodeJS.Timeout | undefined;
      let slowNotice: NodeJS.Timeout | undefined;
      let deadline: NodeJS.Timeout | undefined;

      const stopTimers = (): void => {
        if (heartbeat) clearInterval(heartbeat);
        if (slowNotice) clearTimeout(slowNotice);
        if (deadline) clearTimeout(deadline);
      };

      const write = (frame: string): void => {
        if (ended || disconnected) return;
        res.write(frame);
      };

      const send = (event: AskStreamEvent): void => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const finish = (): void => {
        if (ended) return;
        ended = true;
        stopTimers();
        if (!disconnected) res.end();
      };

      /*
       * `res`, not `req`. Since Node 16 an IncomingMessage emits "close" as soon
       * as the request is complete — which, behind express.json(), is a couple of
       * milliseconds into the handler — so a disconnect handler on `req` fires on
       * every healthy request and silences the stream it is supposed to be
       * protecting. The response is the thing that closes when the visitor
       * leaves. server/routes.ask.test.ts holds this down.
       */
      res.on("close", () => {
        if (!ended) disconnected = true;
        stopTimers();
      });

      // Before anything expensive: fill whatever buffer is between this process
      // and the browser. A comment nobody sees is not a sign of life to a
      // visitor, but it is what makes the frames after it arrive.
      write(SSE_PREAMBLE);

      // Ahead of the status, not after it: a deployment with no key is not about
      // to read anything, and saying it is would be the first lie of the session.
      if (!llmReady()) {
        send({ type: "error", message: LLM_UNAVAILABLE_ASK });
        finish();
        return;
      }

      /*
       * THE PUBLIC PANEL HAS TO BE BOUNDED TOO, and until now it was not.
       *
       * server/spend.ts went in guarding the ROOM path, which is where an agent
       * loop was imagined. It missed the endpoint that actually faces the
       * internet: /api/ask is on every door, needs no token, and anyone can call
       * it. The only thing here was a 20-per-minute rate limit per address,
       * which permits 28,800 answers a day from one IP and has no ceiling at all
       * across many.
       *
       * This was not theoretical. A stale polling loop of my own sat on this
       * endpoint for about five hours, one call every twenty-five seconds, and
       * nothing anywhere noticed or stopped it. That is the exact failure the
       * spend module was written for, on the surface it did not cover.
       *
       * Two claims, because they fail differently: one for this address, so a
       * single caller cannot spend the whole ceiling, and one for the endpoint as
       * a whole, because the real exposure is many addresses rather than one.
       */
      const askIp = typeof req.ip === "string" && req.ip ? req.ip : "unknown";
      const mine = claimAgentTurn(askLedgerKey(askIp));
      const everyone = mine.ok ? claimAgentTurn(ASK_LEDGER_KEY, Date.now(), askBudgetUsd()) : mine;
      if (!everyone.ok) {
        send({ type: "error", message: everyone.message });
        send({ type: "done" });
        finish();
        return;
      }

      send({
        type: "status",
        stage: "retrieving",
        message: agent.useKb ? ASK_STATUS_RETRIEVING : ASK_STATUS_THINKING,
      });

      heartbeat = setInterval(() => write(": keep-alive\n\n"), SSE_HEARTBEAT_MS);

      // Retrieval and the model call both happen inside the generator's first
      // step, so the first chunk is the first thing worth reporting and the only
      // thing worth putting a deadline on. Once tokens are flowing, a slow
      // answer is still an answer.
      const answers = streamAgentAnswer({
        agentId,
        question: parsed.data.question,
        history: parsed.data.history,
      });

      let expired = false;
      const expiry = new Promise<"expired">((resolve) => {
        deadline = setTimeout(() => {
          expired = true;
          resolve("expired");
        }, ASK_FIRST_CHUNK_DEADLINE_MS);
      });

      slowNotice = setTimeout(() => {
        send({ type: "status", stage: "slow", message: ASK_STATUS_SLOW });
      }, ASK_SLOW_NOTICE_MS);

      try {
        let citations: Citation[] | undefined;
        let answer = "";
        let waitingForFirst = true;

        for (;;) {
          const next = answers.next();
          // The losing side of the race is still a live promise: give it a
          // handler now so a later rejection is caught here rather than by the
          // process-wide unhandledRejection hook.
          next.catch(() => undefined);
          const step = waitingForFirst ? await Promise.race([next, expiry]) : await next;

          if (step === "expired") {
            send({ type: "error", message: ASK_DEADLINE_MESSAGE });
            send({ type: "done" });
            // Best effort: a generator suspended mid-await resumes and stops at
            // its next yield. Cancelling the OpenAI call itself needs an
            // AbortSignal on streamAgentAnswer — see the handoff.
            void answers.return(undefined).catch(() => undefined);
            break;
          }

          if (waitingForFirst) {
            waitingForFirst = false;
            if (slowNotice) clearTimeout(slowNotice);
            if (deadline) clearTimeout(deadline);
          }

          if (step.done) break;
          if (disconnected) break;

          const chunk = step.value;
          if (chunk.error) {
            send({ type: "error", message: chunk.error });
            continue;
          }
          if (chunk.citations && chunk.citations.length > 0) citations = chunk.citations;
          if (chunk.usage) {
            // Both ledgers the claim above read, or the ceilings never move.
            recordTurnCost(askLedgerKey(askIp), agentId, chunk.usage);
            recordTurnCost(ASK_LEDGER_KEY, agentId, chunk.usage);
          }
          if (chunk.delta) {
            // Kept so the finished answer can be signed. The visitor may hand it
            // back when keeping the conversation, and the receipt is what lets the
            // room trust it — see server/answer-receipt.ts.
            answer += chunk.delta;
            send({ type: "delta", delta: chunk.delta });
          }
        }

        if (!expired) send({ type: "done", citations, receipt: answer ? signAnswer(answer) : undefined });
      } catch (error) {
        console.error("[ask] stream failed:", error);
        send({ type: "error", message: STREAM_INTERRUPTED });
        send({ type: "done" });
      } finally {
        finish();
      }
    }),
  );

  /* ---------------------------- kb status --------------------------- */

  app.get("/api/kb/status", (_req, res) => {
    res.json({ ...kbStatus(), llmReady: llmReady() });
  });

  // Anything else under /api is a missing endpoint, not a client route: without
  // this it would fall through to the SPA and answer HTML to a fetch().
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}
