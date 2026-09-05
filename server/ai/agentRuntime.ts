/**
 * One agent turn, streamed.
 *
 * The promise this file has to keep: an answer about ChatGPT Ads is grounded in
 * the retrieved documentation and cites the page it used, or it says plainly that
 * it cannot answer. The platform's conversion features shipped in mid-2026, well
 * after any model's training data, so retrieval is not an optimisation here — it
 * is the only reason an answer can be trusted. With no key, or no knowledge base,
 * the honest message is the product.
 */

import type OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

import { AGENT_BY_ID, DEFAULT_AGENT_ID, type AgentDef } from "@shared/roster";
import type { Citation } from "@shared/schema";

import { retrieve, type RetrievedChunk } from "./kb";
import {
  CHAT_MODEL,
  FALLBACK_CHAT_MODEL,
  classifyLlmError,
  getClient,
  hasKey,
  isReasoningModel,
  type LlmFailure,
} from "./openai";

export interface AgentStreamChunk {
  delta?: string;
  citations?: Citation[];
  error?: string;
}

export interface AgentTurn {
  agentId: string;
  question: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

/** A hard stop, so a stalled upstream cannot hold a socket open indefinitely. */
const ANSWER_TIMEOUT_MS = 60_000;
/** Reasoning tokens are spent before the first visible character; below ~2000 the answer comes back empty. */
const MAX_COMPLETION_TOKENS = 2048;
const RETRIEVE_K = 8;
/** ~6000 tokens of prose. Precision falls off fast after the first few hits anyway. */
const MAX_CONTEXT_CHARS = 24_000;
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_CHARS = 4000;
const SNIPPET_CHARS = 180;

export function llmReady(): boolean {
  return hasKey();
}

export async function* streamAgentAnswer(opts: AgentTurn): AsyncGenerator<AgentStreamChunk> {
  const agent: AgentDef = AGENT_BY_ID[opts.agentId] ?? AGENT_BY_ID[DEFAULT_AGENT_ID];
  const question = opts.question.trim();

  if (!question) {
    yield { error: "Ask a question and this agent will answer it." };
    return;
  }

  const client = getClient();
  if (!client) {
    yield { error: NO_KEY_MESSAGE };
    return;
  }

  let excerpts: RetrievedChunk[] = [];
  if (agent.useKb) {
    try {
      // A retrieval failure must degrade the answer, never take it down: with no
      // excerpts the prompt tells the model to say what it cannot confirm.
      excerpts = fitToBudget(await retrieve(question, RETRIEVE_K));
    } catch {
      excerpts = [];
    }
  }

  const messages = buildMessages(agent, question, opts.history ?? [], excerpts);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ANSWER_TIMEOUT_MS);

  try {
    const opened = await openStream(client, messages, controller.signal);
    if (!opened.ok) {
      logFailure(opened.failure);
      yield { error: visitorMessage(opened.failure, timedOut) };
      return;
    }

    let answer = "";
    let finishReason: ChatCompletionChunk.Choice["finish_reason"] = null;

    try {
      for await (const chunk of opened.stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta?.content;
        if (delta) {
          answer += delta;
          yield { delta };
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
    } catch (err) {
      const failure = classifyLlmError(err, opened.model);
      logFailure(failure);
      if (answer.length > 0) {
        // Those deltas are already on the visitor's screen. Close the message
        // honestly rather than replacing a part-written answer with an error.
        yield { delta: `\n\n_${interruptedNote(failure, timedOut)}_` };
        const partial = buildCitations(answer, excerpts);
        if (partial.length > 0) yield { citations: partial };
        return;
      }
      yield { error: visitorMessage(failure, timedOut) };
      return;
    }

    if (answer.trim().length === 0) {
      yield { error: emptyAnswerMessage(finishReason) };
      return;
    }

    if (finishReason === "length") {
      yield { delta: "\n\n_Cut off at the model's output limit. Ask for one part of this and you will get the rest._" };
    }

    const citations = buildCitations(answer, excerpts);
    if (citations.length > 0) yield { citations };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ the request ------------------------------- */

type OpenResult =
  | { ok: true; stream: Stream<ChatCompletionChunk>; model: string }
  | { ok: false; failure: LlmFailure };

async function openStream(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  signal: AbortSignal,
): Promise<OpenResult> {
  try {
    return { ok: true, stream: await create(client, CHAT_MODEL, messages, signal), model: CHAT_MODEL };
  } catch (err) {
    const failure = classifyLlmError(err, CHAT_MODEL);
    // A key without access to a model gets 404. One retry on a plain chat model
    // that every tier can reach; if that fails too, the deployment is misconfigured.
    if (failure.kind !== "unknown_model" || CHAT_MODEL === FALLBACK_CHAT_MODEL) {
      return { ok: false, failure };
    }
    console.warn(`[ai] model "${CHAT_MODEL}" is not available to this key — falling back to ${FALLBACK_CHAT_MODEL}`);
    try {
      return {
        ok: true,
        stream: await create(client, FALLBACK_CHAT_MODEL, messages, signal),
        model: FALLBACK_CHAT_MODEL,
      };
    } catch (fallbackErr) {
      return { ok: false, failure: classifyLlmError(fallbackErr, FALLBACK_CHAT_MODEL) };
    }
  }
}

function create(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  signal: AbortSignal,
): Promise<Stream<ChatCompletionChunk>> {
  const body: ChatCompletionCreateParamsStreaming = {
    model,
    messages,
    stream: true,
    // `max_tokens` is deprecated and gpt-5* rejects it outright.
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  };
  // Reasoning models reject any non-default temperature with a 400.
  if (!isReasoningModel(model)) body.temperature = 0.2;

  // A person is waiting: fail fast rather than serving two backed-off retries
  // behind a spinner while the human CTAs sit unused.
  return client.chat.completions.create(body, { signal, maxRetries: 1, timeout: ANSWER_TIMEOUT_MS });
}

/* ------------------------------- the prompt ------------------------------- */

function buildMessages(
  agent: AgentDef,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  excerpts: RetrievedChunk[],
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: agent.systemPrompt }];

  if (agent.useKb) {
    messages.push({ role: "system", content: excerpts.length > 0 ? contextBlock(excerpts) : NO_EXCERPTS_INSTRUCTION });
  }

  for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
    const content = turn.content.trim().slice(0, MAX_HISTORY_CHARS);
    if (content) messages.push({ role: turn.role, content });
  }

  messages.push({ role: "user", content: question });
  return messages;
}

function contextBlock(excerpts: RetrievedChunk[]): string {
  const sources = excerpts
    .map((chunk, i) => {
      const heading = chunk.heading ? `\nSection: ${chunk.heading}` : "";
      return `[${i + 1}] ${chunk.title} — ${chunk.url}${heading}\n${chunk.text}`;
    })
    .join("\n\n---\n\n");

  return [
    "Excerpts retrieved from the official ChatGPT Ads developer documentation, best match first.",
    "",
    "Cite them inline with the bracketed numbers below — [1], [3] — placed where you use them.",
    "The visitor sees a source list assembled from the markers you write, so a marker with no",
    "excerpt behind it is a broken link. Cite only what you actually used. Never invent a number,",
    "and never cite a page for a claim it does not make.",
    "",
    "If these excerpts do not answer the question, say which part is missing and offer a human.",
    "Do not fill the gap from memory: this platform postdates your training data.",
    "",
    sources,
  ].join("\n");
}

const NO_EXCERPTS_INSTRUCTION = [
  "No documentation excerpts were retrieved for this question — the knowledge base is either",
  "unbuilt or has nothing matching.",
  "",
  "Do not answer ChatGPT Ads specifics from memory. The platform's conversion features shipped",
  "in mid-2026, after your training data, and half-remembered field names are worse than an",
  "honest gap. Say plainly what you cannot confirm, answer only the part that is genuinely",
  "stack-independent, and offer to bring in a human.",
].join("\n");

/**
 * Whole chunks only. A half-quoted API parameter is worse than a missing one, and
 * `retrieve()` already ordered these best-first, so the lowest-scoring are the ones
 * that get dropped.
 */
function fitToBudget(excerpts: RetrievedChunk[]): RetrievedChunk[] {
  const kept: RetrievedChunk[] = [];
  let used = 0;
  for (const chunk of excerpts) {
    const cost = chunk.text.length + chunk.title.length + chunk.url.length + chunk.heading.length + 40;
    if (used + cost > MAX_CONTEXT_CHARS) continue;
    kept.push(chunk);
    used += cost;
  }
  return kept;
}

/* ------------------------------- citations -------------------------------- */

function buildCitations(answer: string, excerpts: RetrievedChunk[]): Citation[] {
  if (excerpts.length === 0) return [];

  const cited: RetrievedChunk[] = [];
  const seen = new Set<number>();
  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1 || n > excerpts.length || seen.has(n)) continue;
    seen.add(n);
    cited.push(excerpts[n - 1]);
  }

  // An answer without markers is usually a summary, not a sourceless claim.
  // Showing what it read beats implying it read nothing.
  const chosen = cited.length > 0 ? cited : excerpts.slice(0, 3);

  const byUrl = new Map<string, Citation>();
  for (const chunk of chosen) {
    if (byUrl.has(chunk.url)) continue;
    byUrl.set(chunk.url, { title: chunk.title, url: chunk.url, snippet: snippetOf(chunk.text) });
  }
  return [...byUrl.values()];
}

function snippetOf(text: string): string {
  const flat = text.replace(/```[a-z]*/gi, " ").replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS).trimEnd()}…` : flat;
}

/* --------------------------------- errors --------------------------------- */

const NO_KEY_MESSAGE =
  "Live answers are switched off on this deployment — there is no OpenAI API key configured, and " +
  "nothing here will invent an answer to cover for that. A human on the team can answer this " +
  "properly: use \"Talk to a human\", or book a call.";

/** Never surfaces `err.message`: SDK messages can carry the request body and the org id. */
function visitorMessage(failure: LlmFailure, timedOut: boolean): string {
  switch (failure.kind) {
    case "no_key":
      return NO_KEY_MESSAGE;
    case "bad_key":
      return "The OpenAI key on this deployment was rejected, so there are no live answers until someone fixes it. A human on the team can still answer this — use \"Talk to a human\", or book a call.";
    case "rate_limited":
      return "The model is rate-limited right now. Wait a minute and ask again, or talk to a human — that route does not queue.";
    case "context_too_long":
      return "This conversation is now longer than the model can take in one go. Start a fresh question with just the detail that matters, or talk to a human.";
    case "unknown_model":
      return "The model configured for this deployment is not available to it, so there is no answer to give. A human on the team can help — use \"Talk to a human\", or book a call.";
    case "aborted":
      return timedOut
        ? "That answer took longer than 60 seconds and was stopped. Ask a narrower question, or talk to a human."
        : "That request was cancelled before an answer came back. Ask again if you still need it.";
    case "network":
      return "Could not reach the model just now. Try again in a moment, or talk to a human.";
    case "server":
      return "The model service is having problems on its side. Try again shortly, or talk to a human.";
    default:
      return "Something went wrong generating this answer. Try again, or talk to a human — that route always works.";
  }
}

function interruptedNote(failure: LlmFailure, timedOut: boolean): string {
  if (failure.kind === "aborted" && timedOut) return "Stopped at the 60-second limit — the answer above is incomplete.";
  if (failure.kind === "rate_limited") return "The model hit its rate limit part-way through — the answer above is incomplete.";
  return "The connection to the model dropped part-way through — the answer above is incomplete.";
}

function emptyAnswerMessage(finishReason: ChatCompletionChunk.Choice["finish_reason"]): string {
  if (finishReason === "content_filter") {
    return "The model declined to answer this one. Rephrase it, or talk to a human.";
  }
  if (finishReason === "length") {
    // Reasoning tokens count against the output cap and are spent before the first
    // visible character, so an empty answer here means the cap was reached invisibly.
    return "The model ran out of output budget before writing anything. Ask a narrower question, or talk to a human.";
  }
  return "The model returned nothing. Ask again, or talk to a human.";
}

/** Server-side only. The visitor-facing copy never carries an SDK message. */
function logFailure(failure: LlmFailure): void {
  let detail = "";
  if (failure.kind === "other") detail = `: ${failure.message}`;
  if (failure.kind === "rate_limited" && failure.retryAfterMs !== null) detail = `: retry after ${failure.retryAfterMs}ms`;
  console.warn(`[ai] chat failed (${failure.kind})${detail}`);
}
