import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { postMessageSchema } from "@shared/schema";

import { costUsd, priceFor } from "./ai/usage";
import {
  IDLE_RESET_MINUTES,
  MAX_ACTIVE_MINUTES,
  MAX_TURNS_PER_HOUR,
  claimAgentTurn,
  guardAgentTurn,
  recordTurnCost,
  resetSpendLedgerForTests,
  type RoomRef,
} from "./spend";
import { storage } from "./storage";

/**
 * Three bounds on what a room can spend, and the reason there are three: each
 * one fails differently, so a loop that slips under one is still caught by
 * another. What is being defended against is not a spike but an absence — two
 * agents answering each other cost about four dollars an hour, which is not a
 * number anybody notices until it has been running for a week.
 *
 * Every case here drives the real functions server/routes.ts calls. `claimAgentTurn`
 * takes `now` as an argument rather than reading the clock, so a twenty-minute
 * conversation is a twenty-minute conversation and not a twenty-minute test.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** A fixed point mid-month, so nothing here sits on a month boundary by accident. */
const T0 = Date.UTC(2026, 8, 7, 11, 0, 0);

const ROOM = "ws_spend_test";

function closeTo(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected about ${expected}, got ${actual}`);
}

/** A turn's worth of tokens on the default model, priced so a test can spend a known amount. */
function usage(model: string, promptTokens: number, completionTokens: number) {
  return { model, promptTokens, completionTokens };
}

beforeEach(() => {
  resetSpendLedgerForTests();
  delete process.env.ROOM_MONTHLY_BUDGET_USD;
});

describe("the count of turns per room", () => {
  it("lets a room take its hour's worth and stops the next one", () => {
    for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) {
      assert.equal(claimAgentTurn(ROOM, T0 + i).ok, true, `turn ${i + 1} should have been allowed`);
    }

    const refused = claimAgentTurn(ROOM, T0 + MAX_TURNS_PER_HOUR);
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.stop, "turn_rate");
  });

  it("counts per room, so one room's loop cannot silence another", () => {
    for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) claimAgentTurn("ws_noisy", T0 + i);

    assert.equal(claimAgentTurn("ws_noisy", T0 + HOUR / 2).ok, false);
    assert.equal(claimAgentTurn("ws_quiet", T0 + HOUR / 2).ok, true);
  });

  it("is a rolling hour, so the room recovers without anyone intervening", () => {
    for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) claimAgentTurn(ROOM, T0 + i);

    assert.equal(claimAgentTurn(ROOM, T0 + HOUR - MINUTE).ok, false);
    assert.equal(claimAgentTurn(ROOM, T0 + HOUR + MINUTE).ok, true);
  });

  it("tells the room how long the wait actually is, not a round number", () => {
    for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) claimAgentTurn(ROOM, T0);

    // Ten minutes in, the oldest turn in the window is fifty minutes from ageing out.
    const refused = claimAgentTurn(ROOM, T0 + 10 * MINUTE);
    assert.equal(refused.ok, false);
    assert.match(refused.ok === false ? refused.message : "", /about 50 minutes/);
  });
});

describe("the clock, for the loop that paces itself under the count", () => {
  /** Well inside the hourly count, and never quiet long enough to reset. */
  const EVERY = 5 * MINUTE;

  it("stops an agent that has been answering without a break", () => {
    let taken = 0;
    for (let at = 0; at <= MAX_ACTIVE_MINUTES * MINUTE; at += EVERY) {
      assert.equal(claimAgentTurn(ROOM, T0 + at).ok, true, `the turn at ${at / MINUTE} minutes should have been allowed`);
      taken += 1;
    }

    // The bound that stopped it has to be the clock: this is nowhere near the
    // hourly count, which is the whole reason the clock exists.
    assert.ok(taken < MAX_TURNS_PER_HOUR, "this case is supposed to stay under the turn count");

    const refused = claimAgentTurn(ROOM, T0 + MAX_ACTIVE_MINUTES * MINUTE + EVERY);
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.stop, "active_too_long");
  });

  it("starts over once the room goes quiet, so a conversation resumed later is not punished", () => {
    for (let at = 0; at <= MAX_ACTIVE_MINUTES * MINUTE; at += EVERY) claimAgentTurn(ROOM, T0 + at);

    const stopped = T0 + MAX_ACTIVE_MINUTES * MINUTE + EVERY;
    assert.equal(claimAgentTurn(ROOM, stopped).ok, false);

    // The message tells the room to leave it quiet for IDLE_RESET_MINUTES. That
    // has to be true measured from when they were told, not from some earlier
    // instant they cannot see.
    const afterWaiting = stopped + IDLE_RESET_MINUTES * MINUTE + 1;
    assert.equal(claimAgentTurn(ROOM, afterWaiting).ok, true);
  });

  it("does not let a refused turn keep the room busy, which would make the wait unescapable", () => {
    for (let at = 0; at <= MAX_ACTIVE_MINUTES * MINUTE; at += EVERY) claimAgentTurn(ROOM, T0 + at);

    const stopped = T0 + MAX_ACTIVE_MINUTES * MINUTE + EVERY;
    // Someone keeps trying every minute through the whole quiet period. If a
    // refusal counted as activity, the room could never recover.
    for (let at = 0; at < IDLE_RESET_MINUTES * MINUTE; at += MINUTE) claimAgentTurn(ROOM, stopped + at);

    assert.equal(claimAgentTurn(ROOM, stopped + IDLE_RESET_MINUTES * MINUTE + 1).ok, true);
  });
});

describe("the budget, for the turn that is expensive rather than frequent", () => {
  it("pauses the room once the month's dollars are spent", () => {
    process.env.ROOM_MONTHLY_BUDGET_USD = "1";

    assert.equal(claimAgentTurn(ROOM, T0).ok, true);
    // One turn, four million input tokens on the default model: a dollar exactly.
    recordTurnCost(ROOM, "chatgpt-ads", usage("gpt-5-mini", 4_000_000, 0), T0);

    const refused = claimAgentTurn(ROOM, T0 + MINUTE);
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.stop, "monthly_budget");
  });

  it("is the stop the room is told about, because it is the one that lasts longest", () => {
    process.env.ROOM_MONTHLY_BUDGET_USD = "1";

    // Both the hourly count and the budget are exhausted at the same instant.
    for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) claimAgentTurn(ROOM, T0 + i);
    recordTurnCost(ROOM, "chatgpt-ads", usage("gpt-5-mini", 4_000_000, 0), T0);

    const refused = claimAgentTurn(ROOM, T0 + MAX_TURNS_PER_HOUR);
    // Telling a room paused for the month that it merely asked too fast this
    // hour would send the visitor back in five minutes to read it again.
    assert.equal(refused.ok === false && refused.stop, "monthly_budget");
  });

  it("resets when the month does", () => {
    process.env.ROOM_MONTHLY_BUDGET_USD = "1";

    recordTurnCost(ROOM, "chatgpt-ads", usage("gpt-5-mini", 4_000_000, 0), T0);
    assert.equal(claimAgentTurn(ROOM, T0 + MINUTE).ok, false);

    assert.equal(claimAgentTurn(ROOM, Date.UTC(2026, 9, 1)).ok, true, "October is a new allowance");
  });

  it("ignores a budget that is not a positive number rather than pausing every room", () => {
    process.env.ROOM_MONTHLY_BUDGET_USD = "five dollars";

    // A typo in the environment must not read as zero. Zero would pause every
    // room on the deployment and look exactly like an outage.
    recordTurnCost(ROOM, "chatgpt-ads", usage("gpt-5-mini", 4_000_000, 0), T0);
    assert.equal(claimAgentTurn(ROOM, T0 + MINUTE).ok, true);
  });
});

describe("two messages arriving together", () => {
  it("cannot both pass a bound with room for one, because the claim never awaits", () => {
    process.env.ROOM_MONTHLY_BUDGET_USD = "1";
    recordTurnCost(ROOM, "chatgpt-ads", usage("gpt-5-mini", 3_999_999, 0), T0);

    // Everything below runs in one tick, which is what "arriving together" means
    // on a single-threaded server: nothing can interleave between the read and
    // the write inside claimAgentTurn.
    const results = Array.from({ length: 5 }, () => claimAgentTurn(ROOM, T0));
    assert.equal(results.filter((claim) => claim.ok).length, 5, "the budget still has room for all of these");

    for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) claimAgentTurn("ws_burst", T0);
    const burst = Array.from({ length: 20 }, () => claimAgentTurn("ws_burst", T0));
    assert.equal(burst.filter((claim) => claim.ok).length, 0, "the hour was already full when all twenty arrived");
  });

  it("holds through guardAgentTurn, which is what the route actually calls", async () => {
    const created = await storage.createWorkspace({ name: "Spend limits" });
    const room: RoomRef = {
      token: created.token,
      workspaceId: created.workspace.id,
      channelId: created.channels[0].id,
      agentId: "chatgpt-ads",
    };

    // Fired in one tick with no `await` between them, exactly as two messages
    // landing in the same tick would reach runAgentReply.
    const attempts = MAX_TURNS_PER_HOUR + 12;
    const allowed = await Promise.all(Array.from({ length: attempts }, () => guardAgentTurn(room)));

    assert.equal(allowed.filter(Boolean).length, MAX_TURNS_PER_HOUR);

    // Every refused turn leaves the room a message saying so, rather than
    // silence the visitor would read as a broken agent.
    const state = await storage.getWorkspaceByToken(created.token);
    const stopped = (state?.messages ?? []).filter((message) => message.meta?.stopped === "turn_rate");
    assert.equal(stopped.length, attempts - MAX_TURNS_PER_HOUR);
  });
});

describe("what a turn costs", () => {
  it("prices a million tokens at the published rate", () => {
    closeTo(costUsd(usage("gpt-5-mini", 1_000_000, 0)), 0.25, "gpt-5-mini input");
    closeTo(costUsd(usage("gpt-5-mini", 0, 1_000_000)), 2, "gpt-5-mini output");
    closeTo(costUsd(usage("gpt-4o-mini", 1_000_000, 0)), 0.15, "gpt-4o-mini input");
  });

  it("puts a real agent turn at about a quarter of a cent, which is the number this parcel exists for", () => {
    // A full retrieval context (~6000 tokens against the 24k-character budget in
    // agentRuntime.ts) and a normal answer.
    const turn = costUsd(usage("gpt-5-mini", 6_000, 500));
    assert.ok(turn > 0.001 && turn < 0.01, `a turn should cost a fraction of a cent, got ${turn}`);
  });

  it("prices a pinned snapshot as its own family and not as its shorter neighbour", () => {
    // "gpt-5" is a prefix of "gpt-5-mini-2025-08-07" too, and it is five times
    // the price. The longer key has to win.
    closeTo(costUsd(usage("gpt-5-mini-2025-08-07", 1_000_000, 0)), 0.25, "pinned gpt-5-mini");
    closeTo(costUsd(usage("gpt-5-2025-08-07", 1_000_000, 0)), 1.25, "pinned gpt-5");
  });

  it("charges an unpriced model the dearest rate it knows, never nothing", () => {
    // A model billed at zero would spend without ever moving the budget, and a
    // budget that cannot trip is the failure this whole file exists to prevent.
    const unknown = costUsd(usage("gpt-6-turbo-imaginary", 1_000_000, 1_000_000));
    const dearest = costUsd(usage("gpt-4o", 1_000_000, 0)) + costUsd(usage("gpt-5", 0, 1_000_000));
    closeTo(unknown, dearest, "unknown model");
    assert.ok(unknown > 0);
  });

  it("prices the 404 fallback below the default, which is why the model is read off the open stream", () => {
    // server/ai/agentRuntime.ts takes the model from `opened.model`, not from
    // CHAT_MODEL: when the configured id comes back 404 the request silently
    // becomes gpt-4o-mini, and these two numbers are how wrong the ledger would be.
    const tokens = usage("gpt-5-mini", 6_000, 500);
    const fell_back = usage("gpt-4o-mini", 6_000, 500);
    assert.ok(costUsd(fell_back) < costUsd(tokens));
  });

  it("counts nothing it cannot count, rather than producing a negative or a NaN", () => {
    assert.equal(costUsd(usage("gpt-5-mini", -100, -100)), 0);
    assert.equal(costUsd(usage("gpt-5-mini", Number.NaN, Number.POSITIVE_INFINITY)), 0);
  });

  it("knows a price for both models this server can actually open a stream with", () => {
    // The default and the 404 fallback, from server/ai/openai.ts.
    const dearest = priceFor("nothing-like-a-real-id");
    assert.notDeepEqual(priceFor("gpt-5-mini"), dearest);
    assert.notDeepEqual(priceFor("gpt-4o-mini"), dearest);
  });
});

describe("what the room is told when a turn is stopped", () => {
  function messageFor(stop: "turn_rate" | "monthly_budget" | "active_too_long"): string {
    resetSpendLedgerForTests();
    if (stop === "turn_rate") {
      for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) claimAgentTurn(ROOM, T0);
      const refused = claimAgentTurn(ROOM, T0);
      return refused.ok === false ? refused.message : "";
    }
    if (stop === "monthly_budget") {
      process.env.ROOM_MONTHLY_BUDGET_USD = "1";
      recordTurnCost(ROOM, "chatgpt-ads", usage("gpt-5-mini", 4_000_000, 0), T0);
      const refused = claimAgentTurn(ROOM, T0);
      return refused.ok === false ? refused.message : "";
    }
    for (let at = 0; at <= MAX_ACTIVE_MINUTES * MINUTE; at += 5 * MINUTE) claimAgentTurn(ROOM, T0 + at);
    const refused = claimAgentTurn(ROOM, T0 + MAX_ACTIVE_MINUTES * MINUTE + 5 * MINUTE);
    return refused.ok === false ? refused.message : "";
  }

  const all = (["turn_rate", "monthly_budget", "active_too_long"] as const).map(messageFor);

  it("says what happened and offers the route that does not queue", () => {
    for (const message of all) {
      assert.ok(message.length > 0);
      assert.match(message, /not sent to the model|it has stopped/);
      assert.match(message, /someone from the team/);
    }
  });

  it("keeps the house voice: no exclamation marks, no shouting", () => {
    for (const message of all) {
      assert.ok(!message.includes("!"), `an exclamation mark got into: ${message}`);
      assert.ok(!/[A-Z]{4,}/.test(message), `something is shouting in: ${message}`);
    }
  });

  it("promises no resume time the in-memory ledger cannot keep", () => {
    // The ledger lives in this process. A restart lifts every bound here, so a
    // sentence saying "not before next month" would be a sentence the code can
    // contradict. The wait the turn count quotes is arithmetic off its own
    // window and is allowed; a date is not.
    const budget = all[1];
    assert.ok(!/next month|tomorrow|in \d+ days?/i.test(budget), `the budget message promises a date: ${budget}`);
  });

  it("reads the bounds off the constants, so raising one cannot leave a sentence lying", () => {
    assert.match(all[0], new RegExp(`${MAX_TURNS_PER_HOUR} questions`));
    assert.match(all[2], new RegExp(`${MAX_ACTIVE_MINUTES} minutes`));
    assert.match(all[2], new RegExp(`${IDLE_RESET_MINUTES} minutes`));
  });
});

/**
 * The invariant the brief asked about, checked before it was tested.
 *
 * "An agent cannot trigger another agent's reply" holds here BY CONSTRUCTION,
 * not by a rule. There is no check anywhere that inspects an author and declines:
 * `resolveAgent` is called from exactly one place, POST
 * /api/workspaces/:token/messages, and that route hard-codes the author as the
 * visitor. Agent messages are written straight to storage by runAgentReply and
 * never travel back through the route that decides who answers. So there is no
 * path from a server-authored message to a reply, and nothing to enforce.
 *
 * These cases therefore test the construction rather than a rule that does not
 * exist. If one of them goes red, the invariant has not been broken by itself —
 * it has stopped being structural, and the bounds above become the only thing
 * standing between two agents and a four-dollar hour.
 */
describe("an agent cannot start another agent's reply", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

  it("gives an API caller no way to author a message as anything but a visitor", () => {
    // Runtime, not a text match: zod strips what it does not declare, so this is
    // the contract itself refusing rather than a convention.
    const parsed = postMessageSchema.parse({
      channelId: "c1",
      body: "@google-ads what do you think?",
      authorKind: "agent",
      authorKey: "agent:chatgpt-ads",
    });

    assert.ok(!("authorKind" in parsed));
    assert.ok(!("authorKey" in parsed));
  });

  it("decides who answers without being told who asked", () => {
    const signature = /function resolveAgent\(([^)]*)\)/.exec(routes)?.[1] ?? "";
    assert.ok(signature.length > 0, "resolveAgent has moved or been renamed — re-read this file's header");
    assert.ok(
      !/author/i.test(signature),
      `resolveAgent now takes an author (${signature.trim()}), so the invariant is no longer structural`,
    );
  });

  it("posts an agent's answer straight to storage, never back through the route that picks an agent", () => {
    const reply = routes.slice(routes.indexOf("async function runAgentReply"), routes.indexOf("function kickOffAgentReply"));
    assert.ok(reply.length > 0, "runAgentReply has moved or been renamed");
    assert.ok(!reply.includes("resolveAgent"), "an agent's own reply now reaches the code that picks an agent to answer");
  });
});

describe("where the guard sits", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const reply = routes.slice(routes.indexOf("async function runAgentReply"), routes.indexOf("function kickOffAgentReply"));

  it("takes the turn before the model is called, not after", () => {
    const guard = reply.indexOf("guardAgentTurn");
    const model = reply.indexOf("streamAgentAnswer(");
    assert.ok(guard >= 0, "the spend guard is not in runAgentReply");
    assert.ok(model >= 0, "the model call is not in runAgentReply");
    // Counting after the call would bill the turn that was supposed to be refused.
    assert.ok(guard < model, "the spend guard runs after the model call, so the count cannot stop anything");
  });

  it("counts a turn only where a key exists to spend against", () => {
    // The no-key branch returns before the guard: a deployment with no
    // OPENAI_API_KEY answers honestly and spends nothing, so it must not burn a
    // room's hour doing it.
    assert.ok(reply.indexOf("llmReady()") < reply.indexOf("guardAgentTurn"));
  });
});
