/**
 * The only place the OpenAI SDK is constructed, and the only place its errors are
 * interpreted. Everything here has to survive an empty .env: the server boots with
 * no key, `/api/kb/status` reports `llmReady: false`, and the agents say so rather
 * than inventing an answer.
 */

import OpenAI, { APIConnectionError, APIError, APIUserAbortError, OpenAIError } from "openai";

/** Reasoning model, 400k context. Overridable so a model swap is not a deploy of new code. */
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-5-mini";

/**
 * Plain chat model with the widest availability across account tiers. Used once,
 * and only when the configured id comes back unknown for this key.
 */
export const FALLBACK_CHAT_MODEL = "gpt-4o-mini";

/**
 * Stored vectors and query vectors must come from the same model forever — a
 * cosine between two different embedding spaces is a random number, not a score.
 * `server/ai/kb.ts` therefore refuses an embeddings file built with another model.
 */
export const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL?.trim() || "text-embedding-3-small";

/**
 * Per-request embedding limits are 2048 array elements, 300,000 tokens across all
 * inputs and 8192 tokens per input. 96 keeps a batch of ~1200-character chunks well
 * inside the token cap and keeps a retry cheap.
 */
export const EMBED_BATCH_SIZE = 96;

let client: OpenAI | null = null;
let clientKey: string | null = null;

export function hasKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Lazy on purpose: `new OpenAI()` throws synchronously when the key is absent, so
 * constructing at module load would take the whole server down with it.
 */
export function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (client && clientKey === apiKey) return client;
  client = new OpenAI({ apiKey });
  clientKey = apiKey;
  return client;
}

/** These reject `temperature`, `top_p` and the penalties outright, and require `max_completion_tokens`. */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[134])/i.test(model);
}

export type LlmFailure =
  | { kind: "no_key" }
  | { kind: "bad_key" }
  | { kind: "rate_limited"; retryAfterMs: number | null }
  | { kind: "context_too_long" }
  | { kind: "unknown_model"; model: string }
  | { kind: "aborted" }
  | { kind: "network" }
  | { kind: "server" }
  | { kind: "other"; message: string };

/**
 * Order matters: in the v4 SDK the abort and connection classes both extend
 * `APIError`, and `APIError` extends `OpenAIError`, so the specific checks have to
 * come first and the bare `OpenAIError` check has to come last.
 */
export function classifyLlmError(err: unknown, model: string): LlmFailure {
  if (err instanceof APIUserAbortError) return { kind: "aborted" };
  if (err instanceof APIConnectionError) return { kind: "network" }; // includes connection timeouts

  if (err instanceof APIError) {
    const code = typeof err.code === "string" ? err.code : "";
    if (err.status === 401) return { kind: "bad_key" };
    if (err.status === 429) return { kind: "rate_limited", retryAfterMs: readRetryAfter(err) };
    // A key without access to a model gets 404, not 403 — documented API behaviour.
    if (err.status === 404 || code === "model_not_found") return { kind: "unknown_model", model };
    if (code === "context_length_exceeded" || code === "string_above_max_length") {
      return { kind: "context_too_long" };
    }
    if (typeof err.status === "number" && err.status >= 500) return { kind: "server" };
    return { kind: "other", message: err.message };
  }

  if (err instanceof OpenAIError) return { kind: "no_key" };
  return { kind: "other", message: err instanceof Error ? err.message : "Unknown error" };
}

function readRetryAfter(err: APIError): number | null {
  const header = err.headers?.["retry-after"];
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export interface EmbedResult {
  /** One vector per input, in input order. */
  vectors: number[][];
  /** Summed across batches; 0 when the API returned no usage. */
  totalTokens: number;
}

export interface EmbedOptions {
  maxRetries?: number;
  timeoutMs?: number;
  /** Called after every batch with (embedded so far, total). */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Shared by the build script (many batches, nobody waiting) and by runtime query
 * embedding (one input, a person waiting) so the two can never drift apart on
 * model or encoding.
 */
export async function embedTexts(
  openai: OpenAI,
  inputs: string[],
  options: EmbedOptions = {},
): Promise<EmbedResult> {
  const vectors: number[][] = [];
  let totalTokens = 0;

  for (let i = 0; i < inputs.length; i += EMBED_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBED_BATCH_SIZE);
    const response = await openai.embeddings.create(
      {
        model: EMBED_MODEL,
        input: batch,
        // "base64" returns a string that the v4 types still describe as number[].
        encoding_format: "float",
      },
      { maxRetries: options.maxRetries ?? 2, timeout: options.timeoutMs ?? 60_000 },
    );

    // `index` is the authoritative position; array order is not promised.
    for (const item of [...response.data].sort((a, b) => a.index - b.index)) {
      vectors.push(item.embedding);
    }
    totalTokens += response.usage.total_tokens;
    options.onProgress?.(Math.min(i + batch.length, inputs.length), inputs.length);
  }

  return { vectors, totalTokens };
}
