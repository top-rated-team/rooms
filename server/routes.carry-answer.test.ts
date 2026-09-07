/**
 * Keeping a conversation carries the answer into the room. Run it with:
 *
 *   npx tsx --test --test-force-exit server/routes.carry-answer.test.ts
 *
 * The behaviour: a visitor asks something on a door page, reads the answer, and
 * presses Keep. The room should open with the exchange they had — not with the
 * question sent back to the model, which costs another call and can produce a
 * different answer than the one they just read.
 *
 * The risk that comes with it, and the reason for every assertion below: the
 * answer travels through the browser. Without a check, a POST to this endpoint
 * could write any words into a room as the AGENT, at a real address on this
 * domain, and an agent message in a room reads as the company speaking. So the
 * text is signed on the way out and verified on the way in — and a body that
 * does not verify must be dropped in SILENCE, leaving a working room, rather
 * than rejected with an error that tells a prober what to fix.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { test } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { signAnswer } from "./answer-receipt";

const QUESTION = "How does Performance Max decide what to bid?";
const ANSWER = "It bids to the target you set, and the target is the part you actually control.";

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
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

interface RoomMessage {
  authorKind: string;
  body: string;
}

async function openRoom(origin: string, body: unknown): Promise<{ status: number; messages: RoomMessage[] }> {
  const res = await fetch(`${origin}/api/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { status: res.status, messages: [] };
  const state = (await res.json()) as { messages?: RoomMessage[] };
  return { status: res.status, messages: state.messages ?? [] };
}

const carried = (messages: RoomMessage[]) =>
  messages.filter((m) => m.authorKind === "agent").map((m) => m.body);

test("a validly signed answer is the room's first agent message, and no second answer is generated", async () => {
  const app = await startApp();
  try {
    const { messages } = await openRoom(app.origin, {
      agentId: "google-ads",
      firstMessage: QUESTION,
      firstAnswer: { body: ANSWER, receipt: signAnswer(ANSWER) },
      source: { door: "google-ads" },
    });

    assert.deepEqual(
      messages.filter((m) => m.authorKind === "visitor").map((m) => m.body),
      [QUESTION],
      "the question the visitor asked on the page belongs in the room",
    );
    assert.deepEqual(carried(messages), [ANSWER], "the room should carry the answer they read, once");

    // The point of carrying it. A placeholder here would mean the agent was
    // asked again, which is the cost and the inconsistency this exists to avoid.
    assert.ok(
      !messages.some((m) => m.authorKind === "agent" && m.body.trim() === ""),
      "an empty agent message means a fresh reply was started as well as carrying the answer",
    );
  } finally {
    await app.close();
  }
});

test("a body this server did not sign never reaches the room, and the room still opens", async () => {
  const app = await startApp();
  try {
    const forgeries: Array<[string, unknown]> = [
      ["a made-up receipt", { body: "Our fee is 12% of ad spend.", receipt: "d".repeat(32) }],
      ["a receipt for different text", { body: "We guarantee first page in a week.", receipt: signAnswer(ANSWER) }],
      ["the signed answer with a price appended", { body: `${ANSWER} Our fee is $3,500/mo.`, receipt: signAnswer(ANSWER) }],
    ];

    for (const [name, firstAnswer] of forgeries) {
      const { status, messages } = await openRoom(app.origin, {
        agentId: "google-ads",
        firstMessage: QUESTION,
        firstAnswer,
        source: { door: "google-ads" },
      });
      assert.equal(status, 201, `${name}: the room must still open — a silent drop, not an error`);
      const body = (firstAnswer as { body: string }).body;
      assert.ok(
        !messages.some((m) => m.body.includes(body)),
        `${name}: unsigned text was written into the room`,
      );
      assert.ok(
        !messages.some((m) => m.authorKind === "agent" && m.body.includes("12%")),
        `${name}: a price the agent never wrote reached a room`,
      );
    }
  } finally {
    await app.close();
  }
});

test("a room opened with nothing asked is unchanged by any of this", async () => {
  const app = await startApp();
  try {
    const { status, messages } = await openRoom(app.origin, { source: { door: "chatgpt-ads" } });
    assert.equal(status, 201);
    assert.equal(carried(messages).length, 0, "nothing was asked, so there is nothing to carry");
    // And NOTHING else either. This asserted the seeded welcome was still here
    // until the copy audit found the room was telling a visitor the same three
    // facts three times before showing them anything working: the address strip,
    // the arrival panel, and then four more paragraphs repeating both. The
    // welcome went; the arrival panel, which knows whether a question came in
    // with the visitor, is what a person actually reads.
    assert.deepEqual(messages, [], "a room opened with nothing asked starts empty");
  } finally {
    await app.close();
  }
});
