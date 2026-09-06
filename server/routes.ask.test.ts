/**
 * The one thing /api/ask has to be true of: the visitor sees something on the
 * wire before the server does any of the work they are waiting for. Run it with:
 *
 *   npx tsx --test --test-force-exit server/routes.ask.test.ts
 *
 * `--test-force-exit` is not cosmetic: a failing run leaves abandoned generators
 * holding server/ai/agentRuntime.ts's 60-second abort timer, and without it the
 * process sits for a minute after the failures are known.
 *
 * The upstream here is a stand-in for api.openai.com that answers nothing until
 * the test releases it, so "before the expensive work" is an ordering assertion
 * rather than a race against a stopwatch. If the handler ever goes back to
 * writing nothing until the first token exists, the first read below times out
 * and this fails.
 *
 * The second test is the regression that put this file here: `req.on("close")`
 * fires a couple of milliseconds into every healthy request (Node >= 16 emits it
 * when the request is complete, not when the connection drops), and using it as
 * the disconnect signal suppressed both the writes and `res.end()`. The response
 * has to actually terminate.
 */

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import express from "express";

/** A stalled upstream that answers only when the test says so. */
interface Upstream {
  origin: string;
  /** Every request that has arrived, in order. */
  calls: string[];
  /** Requests that have been answered — i.e. work the visitor was waiting on. */
  answered: number;
  /** Park every request from now on, so "before the work" is an ordering fact. */
  hold(): void;
  /** Let the parked requests — and any that arrive later — through. */
  release(): void;
  close(): Promise<void>;
}

function chatChunk(content: string | null, finish: "stop" | null): string {
  return `data: ${JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 0,
    model: "gpt-4o-mini",
    choices: [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }],
  })}\n\n`;
}

async function startUpstream(): Promise<Upstream> {
  let holding = false;
  let open = (): void => {};
  let gate = Promise.resolve();
  const state = { calls: [] as string[], answered: 0 };

  const server = createServer((req, res) => {
    state.calls.push(`${req.method} ${req.url}`);
    // Captured on arrival: a request that turns up after release must not be
    // parked on a gate a later test armed, and one parked forever would hold the
    // generator's 60-second abort timer (ANSWER_TIMEOUT_MS) open for the whole run.
    const parked = holding ? gate : Promise.resolve();
    req.resume();
    req.on("end", () => {
      void parked.then(() => {
        state.answered += 1;
        if ((req.url ?? "").startsWith("/v1/embeddings")) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              data: [{ index: 0, embedding: new Array(1536).fill(0.01) }],
              usage: { total_tokens: 1 },
            }),
          );
          return;
        }
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(chatChunk("Deduplication is covered in the excerpts [1].", null));
        res.write(chatChunk(null, "stop"));
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    get calls() {
      return state.calls;
    },
    get answered() {
      return state.answered;
    },
    hold: () => {
      holding = true;
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    release: () => {
      holding = false;
      open();
    },
    close: () =>
      new Promise<void>((resolve) => {
        open(); // never leave a socket parked on the gate
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** The real app, minus the client and the WebSocket. */
async function startApp(): Promise<{ origin: string; close(): Promise<void> }> {
  const { registerRoutes } = await import("./routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  registerRoutes(app);

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        // A regression that never terminates a response leaves this socket open
        // forever, and `server.close()` alone would wait for it — turning a clear
        // failure into a hung test run with no output at all.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

interface Frame {
  comment: boolean;
  event: { type: string; [key: string]: unknown } | null;
}

/** Reads SSE frames one at a time, so a test can assert on what arrived *first*. */
function frames(body: ReadableStream<Uint8Array>): {
  next(timeoutMs: number): Promise<Frame>;
  ended(timeoutMs: number): Promise<boolean>;
  cancel(): Promise<void>;
} {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  async function pump(timeoutMs: number): Promise<boolean> {
    const read = reader.read();
    const timer = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
    const step = await Promise.race([read, timer]);
    if (step === "timeout") throw new Error(`nothing arrived on the stream within ${timeoutMs}ms`);
    if (step.done) {
      done = true;
      return false;
    }
    buffer += decoder.decode(step.value, { stream: true });
    return true;
  }

  function take(): Frame | null {
    const at = buffer.indexOf("\n\n");
    if (at === -1) return null;
    const raw = buffer.slice(0, at);
    buffer = buffer.slice(at + 2);
    if (raw.startsWith(":")) return { comment: true, event: null };
    const payload = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!payload) return { comment: true, event: null };
    return { comment: false, event: JSON.parse(payload) as Frame["event"] };
  }

  return {
    async next(timeoutMs: number): Promise<Frame> {
      for (;;) {
        const frame = take();
        if (frame) return frame;
        if (done || !(await pump(timeoutMs))) throw new Error("stream ended before the next frame");
      }
    },
    async ended(timeoutMs: number): Promise<boolean> {
      for (;;) {
        if (done) return true;
        if (take()) continue;
        if (!(await pump(timeoutMs))) return true;
      }
    },
    cancel: () => reader.cancel().catch(() => undefined),
  };
}

let upstream: Upstream;
let app: { origin: string; close(): Promise<void> };

before(async () => {
  upstream = await startUpstream();
  // Set before the first request: server/ai/openai.ts constructs the SDK lazily
  // and reads both of these at construction time.
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  process.env.OPENAI_BASE_URL = `${upstream.origin}/v1`;
  process.env.OPENAI_CHAT_MODEL = "gpt-4o-mini";
  app = await startApp();
  upstream.hold();
});

after(async () => {
  await app?.close();
  await upstream?.close();
});

async function ask(origin: string): Promise<Response> {
  const res = await fetch(`${origin}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "How does deduplication work?", agentId: "chatgpt-ads" }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.ok(res.body, "no response body");
  return res;
}

test("bytes reach the visitor before retrieval or the model has answered anything", { timeout: 20_000 }, async () => {
  upstream.hold();
  const res = await ask(app.origin);
  const stream = frames(res.body as ReadableStream<Uint8Array>);

  // The upstream is still parked on the gate: nothing the visitor is waiting for
  // has produced a result yet. Anything that arrives now was written first on
  // purpose. A two-second budget is ~100x the write and still fails loudly if the
  // handler goes back to waiting for a token.
  const first = await stream.next(2000);
  assert.equal(first.comment, true, "the first frame should be the padding preamble, which no client renders");

  const status = await stream.next(2000);
  assert.equal(status.event?.type, "status", "a status event must arrive before any work has finished");
  assert.equal(status.event?.stage, "retrieving");
  assert.equal(typeof status.event?.message, "string");
  assert.ok((status.event?.message as string).length > 0, "the status must say something a panel can print");

  // `answered`, not `calls.length`: the dispatch of the upstream request and the
  // client's read of the first bytes are a millisecond apart either way, so
  // asserting nothing had been *sent* would be a race. Asserting nothing has come
  // *back* is deterministic — the gate guarantees it — and it is the property that
  // matters: the panel was told what was happening before any of the work paid off.
  assert.equal(upstream.answered, 0, "the upstream answered before the panel was told anything");

  // Let the parked call finish rather than abandoning it: an abandoned generator
  // holds its own 60-second abort timer open and nothing else in the file needs
  // that minute.
  upstream.release();
  await stream.ended(5000);
});

test("the response terminates: a done event, then the socket closes", { timeout: 20_000 }, async () => {
  upstream.hold();
  const res = await ask(app.origin);
  const stream = frames(res.body as ReadableStream<Uint8Array>);

  await stream.next(2000); // preamble
  const status = await stream.next(2000);
  assert.equal(status.event?.type, "status");

  upstream.release();

  const seen: string[] = [];
  for (;;) {
    const frame = await stream.next(5000);
    if (frame.comment) continue;
    seen.push(String(frame.event?.type));
    if (frame.event?.type === "done") break;
  }

  assert.ok(seen.includes("delta"), `expected the answer to stream; saw ${seen.join(", ")}`);
  assert.ok(
    await stream.ended(5000),
    "the stream never ended — res.end() did not run, which is the bug that left the panel spinning",
  );
});
