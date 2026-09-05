# OpenAI Node SDK v4 — the exact surface this server uses

Verified against `openai@4.77.0` source (`src/index.ts`, `src/error.ts`,
`src/resources/chat/completions.ts`) and the current OpenAI API docs, September 2026.
`package.json` pins `"openai": "^4.77.0"`, so the installed version is somewhere in the
**4.x** line. Everything below is v4 API. Do not copy v5/v6 examples from the current
GitHub README — the client shape changed after v4.

## 1. Client construction

```ts
import OpenAI from "openai";

// The constructor reads OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_ORG_ID /
// OPENAI_PROJECT_ID from process.env itself; passing apiKey is optional.
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,        // SDK default
  timeout: 600_000,     // SDK default: 10 minutes
});
```

**Degradation invariant.** When `apiKey` is `undefined` the constructor throws
*synchronously* — before any HTTP call — with:

> The OPENAI_API_KEY environment variable is missing or empty; either provide it, or
> instantiate the OpenAI client with an apiKey option, like `new OpenAI({ apiKey: 'My API Key' })`.

The thrown class is `OpenAIError`, not `APIError`. So the runtime must **not** construct
the client at module load. Gate it:

```ts
let client: OpenAI | null = null;

export function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;          // llmReady = false; agents say so, never fake an answer
  client = new OpenAI({ apiKey });
  return client;
}

export const llmReady = (): boolean => Boolean(process.env.OPENAI_API_KEY);
```

## 2. Streaming chat completions

`create()` with `stream: true` returns `Stream<ChatCompletionChunk>`, an async iterable.
The SDK parses SSE and swallows the `data: [DONE]` sentinel — **loop exit is completion**.
There is no terminator chunk to match on.

Each chunk: `{ id, object: "chat.completion.chunk", created, model, choices: Choice[], usage? }`.
`Choice` is `{ index, delta: { role?, content?, tool_calls?, refusal? }, finish_reason }`,
where `finish_reason` is `'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null`.
The text delta is `chunk.choices[0]?.delta?.content` — optional at every level, because the
usage chunk carries `choices: []`.

```ts
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

export interface StreamResult {
  text: string;
  finishReason: ChatCompletionChunk.Choice["finish_reason"];
  promptTokens: number;
  completionTokens: number;
}

/**
 * Streams one assistant turn, pushing each delta to `onDelta` as it arrives.
 * Resolves when the stream ends; rejects on transport or API failure.
 */
export async function streamChat(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const stream = await client.chat.completions.create(
    {
      model,
      messages,
      stream: true,
      // Usage arrives on ONE extra final chunk whose `choices` array is empty.
      stream_options: { include_usage: true },
      // `max_tokens` is deprecated and is rejected outright by gpt-5*.
      max_completion_tokens: 2048,
    },
    { signal },
  );

  let text = "";
  let finishReason: ChatCompletionChunk.Choice["finish_reason"] = null;
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    const delta = choice?.delta?.content;
    if (delta) {
      text += delta;
      onDelta(delta);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens;
      completionTokens = chunk.usage.completion_tokens;
    }
  }

  // Falling out of the loop IS the completion signal. `finish_reason === "length"`
  // means the answer was truncated — say so rather than shipping a half sentence.
  return { text, finishReason, promptTokens, completionTokens };
}
```

Notes that bite:

- **Cancellation.** `stream.controller.abort()` (the `Stream` owns an `AbortController`), or
  pass `{ signal }` as above, or simply `break` out of the `for await` — the SDK aborts the
  underlying request when the iterator is closed early. An aborted request throws
  `APIUserAbortError`; treat it as "client went away", not as an error to report.
- **Retries do not cover mid-stream failures.** The SDK's automatic retries apply only to
  establishing the request. Once bytes are flowing, a dropped connection throws out of the
  `for await`. If deltas were already emitted over the WebSocket/SSE, finish the message with
  `message_done` carrying `error`, do not restart the answer from scratch.
- **`for await` over a rejected promise.** `await client.chat.completions.create(...)` can
  itself reject (401, 404, 429) before you ever enter the loop — wrap both the call and the
  loop in the same try.
- `client.beta.chat.completions.stream()` exists in v4 as a higher-level helper with
  `.on("content", …)` events. It is not needed here; plain `create({ stream: true })` is the
  stable, fully typed path.

## 3. Embeddings

```ts
import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536; // native output width of this model

/**
 * Per-request API limits: 2048 array elements, 300,000 tokens summed across all
 * inputs, 8192 tokens per individual input. 96 keeps each request comfortably
 * inside the token cap for ~600-token chunks and keeps a retry cheap.
 */
const BATCH_SIZE = 96;

export async function embedAll(client: OpenAI, inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,              // one request, one vector per array element
      encoding_format: "float",  // "base64" returns a string the v4 types still call number[]
    });

    // `index` is the authoritative position, not array order — sort before appending.
    for (const item of [...response.data].sort((a, b) => a.index - b.index)) {
      vectors.push(item.embedding);
    }
  }

  return vectors;
}
```

Request: `{ model, input, encoding_format?, dimensions?, user? }` where `input` is a string,
a string array, a token array, or an array of token arrays.

Response (`CreateEmbeddingResponse`):

```jsonc
{
  "object": "list",
  "data": [{ "object": "embedding", "index": 0, "embedding": [0.0023, -0.009, /* 1536 floats */] }],
  "model": "text-embedding-3-small",
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

- **`text-embedding-3-small` → 1536 dimensions**, 8192 max input tokens, $0.02 / 1M tokens.
  (`text-embedding-3-large` → 3072.)
- The optional `dimensions` parameter truncates the vector (Matryoshka training) for 3-series
  models only. Do not pass it: 1536 floats per chunk is cheap for a corpus this size, and the
  stored vectors and the query vector must use identical settings forever.
- Empty strings are rejected. Filter blank chunks before batching.
- A batch is atomic — one bad input fails all 96. Validate chunk length before sending.

## 4. Errors

Every error the SDK throws derives from `OpenAIError`:

```
Error
└── OpenAIError                      ← thrown by the constructor when the key is missing
    ├── APIError                     ← status, headers, code, param, type, request_id
    │   ├── BadRequestError            400
    │   ├── AuthenticationError        401
    │   ├── PermissionDeniedError      403
    │   ├── NotFoundError              404
    │   ├── ConflictError              409
    │   ├── UnprocessableEntityError   422
    │   ├── RateLimitError             429
    │   └── InternalServerError        >= 500
    ├── APIUserAbortError            ← request aborted by us
    ├── APIConnectionError           ← DNS/socket/TLS failure
    │   └── APIConnectionTimeoutError
    ├── LengthFinishReasonError
    └── ContentFilterFinishReasonError
```

Classification helper. Order matters: `APIError` and the abort/connection classes all extend
`OpenAIError`, so the bare `OpenAIError` check must come last.

```ts
import {
  APIError,
  APIConnectionError,
  APIUserAbortError,
  OpenAIError,
} from "openai";

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

export function classifyLlmError(err: unknown, model: string): LlmFailure {
  if (err instanceof APIUserAbortError) return { kind: "aborted" };
  if (err instanceof APIConnectionError) return { kind: "network" }; // incl. timeouts

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
```

Distinguishing the three cases the spec cares about:

| Case | Signal |
|---|---|
| Missing key | `OpenAIError` from `new OpenAI()`, no HTTP request made. Never reached if `getClient()` gates on the env var. |
| Invalid/revoked key | `AuthenticationError`, `status === 401`, `code === "invalid_api_key"`. |
| Rate limit / quota | `RateLimitError`, `status === 429`. Quota exhaustion is also 429 with `code === "insufficient_quota"` — that one is **not** worth retrying. |
| Context too long | `BadRequestError`, `status === 400`, `code === "context_length_exceeded"`, message names the token counts. |

Never surface `err.message` verbatim to a visitor — it can contain the request body and the
org id. Map to a `LlmFailure` and render our own copy.

## 5. Retry policy

The SDK already retries **twice** with exponential backoff, honouring `retry-after` and
`retry-after-ms` response headers, on: connection errors, 408, 409, 429, and >= 500. Rate-limit
headers worth logging when a 429 arrives: `x-ratelimit-remaining-requests`,
`x-ratelimit-remaining-tokens`, `x-ratelimit-reset-tokens`, `retry-after`.

What to configure per call site:

- **Interactive chat / `/api/ask`** — a person is waiting. `maxRetries: 1`,
  `timeout: 60_000`. Two backed-off retries on a 429 is a 30-second stare at a spinner;
  better to fail fast and say the service is busy, with the human CTA still on screen.
- **`scripts/build-kb.ts` embeddings** — nobody is waiting. `maxRetries: 4`,
  `timeout: 120_000`, plus a serial loop between batches so we do not self-inflict a 429.
- **Never retry** 400, 401, 403, 404 or `insufficient_quota`. They are deterministic; a retry
  just doubles the latency before the same failure.
- Set per-request overrides rather than a second client:
  `client.chat.completions.create(body, { maxRetries: 1, timeout: 60_000, signal })`.

## 6. Context budgeting for retrieval

| Model | Context window | Max output |
|---|---|---|
| `gpt-5`, `gpt-5-mini` | 400,000 | 128,000 |
| `gpt-5-chat-latest` | 128,000 | 16,384 |
| `gpt-4o-mini`, `gpt-4o` | 128,000 | 16,384 |
| `text-embedding-3-small` | 8,192 input | — |

The window is not the budget. Practical rules for stuffing retrieved chunks:

- **Chunk at 400–800 tokens with ~15% overlap.** Well under the 8192 embedding limit, and small
  enough that a citation points at something a reader can verify.
- **Cap retrieved context at ~8,000 tokens (roughly 32,000 characters), top 5–8 chunks.**
  Precision falls off fast after the first few hits, and prompt size drives both latency and
  cost. Truncate whole chunks, never mid-chunk — a half-quoted API parameter is worse than a
  missing one.
- **No tokeniser is available.** `tiktoken` is not in `package.json` and must not be added.
  Estimate conservatively: `Math.ceil(text.length / 4)` for English prose, `/ 3` for code and
  JSON. Budget with headroom rather than aiming at the limit.
- **Reasoning tokens count against `max_completion_tokens`.** On `gpt-5*` the model spends
  invisible reasoning tokens first; a cap that is too low returns `content: ""` with
  `finish_reason: "length"` and looks like a bug. Allow at least 2000.
- The `gpt-5` knowledge cutoff is 30 September 2024, and the ChatGPT Ads platform postdates it.
  Retrieval is not an optimisation here — it is the only reason an answer about this platform
  can be trusted. With an empty knowledge base, agents must say what they lack.

## 7. Model ids — verified

- **`gpt-5` and `gpt-5-mini` are both valid, current API model ids, and both list
  `v1/chat/completions` as Supported.** Pinned snapshots: `gpt-5-2025-08-07`,
  `gpt-5-mini-2025-08-07`. Use `gpt-5-mini` as the default for this product: 400k context,
  fast, cheap, sufficient for grounded documentation answers.
- **They are reasoning models, and the parameter rules differ.** `temperature`, `top_p` and the
  penalty parameters are **not supported** — any non-default `temperature` returns 400
  `Unsupported value: 'temperature' does not support … Only the default (1) value is supported`.
  `max_tokens` is rejected; use `max_completion_tokens`. Write the request builder so
  temperature is omitted for any `gpt-5*` model rather than passed and hoped for.
- **`reasoning_effort` is typed `'low' | 'medium' | 'high'` in v4.77.0.** The `'minimal'` value
  that GPT-5 added later is not in that union and will not typecheck. Omit the parameter.
- The `model` field is typed `(string & {}) | ChatModel`, so **any** model id string typechecks
  under v4 — the SDK's `ChatModel` union predates GPT-5 and will not stop a typo. Validate the
  id at runtime, not at compile time.
- **Fallback on an unknown-model error: `gpt-4o-mini`.** It is still listed as a current model,
  it is the most widely available id across account tiers, and it is a plain chat model — it
  accepts `temperature` and `max_tokens`, so the fallback path cannot trip the reasoning-model
  parameter rules. Fall back once, on `status === 404` or `code === "model_not_found"` only,
  log the substitution, and do not retry the fallback if it also fails.
- `gpt-5-chat-latest` is a valid non-reasoning chat id (128k / 16k) but is an unpinned alias
  that OpenAI re-points over time. Not suitable as a stable default or fallback.

Environment knob, so the model is not a code change:

```ts
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-5-mini";
const FALLBACK_CHAT_MODEL = "gpt-4o-mini";
const REASONING_MODEL = /^(gpt-5|o[134])/.test(CHAT_MODEL); // omit temperature for these
```
