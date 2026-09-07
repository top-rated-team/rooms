/**
 * The public panel is bounded. Run it with:
 *
 *   npx tsx --test --test-force-exit server/routes.ask-spend.test.ts
 *
 * WHY THIS EXISTS, and it is not a hypothetical.
 *
 * server/spend.ts shipped guarding the ROOM path — runAgentReply — which is
 * where an agent loop was imagined. It missed /api/ask, which is the endpoint
 * that actually faces the internet: it is on every door page, it needs no
 * token, and anyone can call it. The only thing in front of it was a
 * 20-per-minute rate limit per address, which permits 28,800 answers a day from
 * a single IP and imposes no ceiling whatever across many.
 *
 * Then a stale polling loop of mine sat on that endpoint for about five hours,
 * one call every twenty-five seconds, and nothing noticed. Roughly seven
 * hundred model answers, generated for no reader. That is precisely the failure
 * the spend module was written to prevent, on the surface it did not cover.
 *
 * So the assertions below are about the bound existing at all, and about it
 * being TWO bounds — per address and per endpoint — because those fail
 * differently: one caller hammering it, and a thousand callers each behaving.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ASK_LEDGER_KEY,
  MAX_TURNS_PER_HOUR,
  askBudgetUsd,
  askLedgerKey,
  claimAgentTurn,
  monthlyBudgetUsd,
  recordTurnCost,
  resetSpendLedgerForTests,
} from "./spend";

const USAGE = { model: "gpt-5-mini", promptTokens: 4000, completionTokens: 800 };

test("one address cannot take more than its hour's worth of answers", () => {
  resetSpendLedgerForTests();
  const key = askLedgerKey("203.0.113.7");
  for (let i = 0; i < MAX_TURNS_PER_HOUR; i++) {
    assert.equal(claimAgentTurn(key).ok, true, `claim ${i + 1} should pass`);
  }
  const refused = claimAgentTurn(key);
  assert.equal(refused.ok, false, "the address got its allowance and the next one must stop");
  if (!refused.ok) assert.equal(refused.stop, "turn_rate");
});

test("one address's allowance is its own, so a caller cannot silence the site", () => {
  resetSpendLedgerForTests();
  const loud = askLedgerKey("203.0.113.7");
  for (let i = 0; i < MAX_TURNS_PER_HOUR; i++) claimAgentTurn(loud);
  assert.equal(claimAgentTurn(loud).ok, false);
  assert.equal(claimAgentTurn(askLedgerKey("198.51.100.4")).ok, true, "a different visitor is unaffected");
});

test("the endpoint has a ceiling of its own, which is what many addresses run into", () => {
  resetSpendLedgerForTests();
  // The per-address bound cannot catch a thousand callers each behaving
  // politely. This is the bound that can, and it is the one my polling loop
  // proved was missing.
  const budget = askBudgetUsd();
  assert.ok(budget > 0, "the public panel must have a budget, not an absence of one");
  recordTurnCost(ASK_LEDGER_KEY, "google-ads", { ...USAGE, completionTokens: 40_000_000 });
  const refused = claimAgentTurn(ASK_LEDGER_KEY, Date.now(), budget);
  assert.equal(refused.ok, false, "the endpoint's own budget must stop it");
  if (!refused.ok) assert.equal(refused.stop, "monthly_budget");
});

test("the panel's budget is separate from a room's, and larger", () => {
  // A room belongs to somebody who asked for it; the panel belongs to the
  // internet. Sharing one number would mean either a stingy panel or a
  // room with a marketing-sized ceiling.
  assert.notEqual(askBudgetUsd(), monthlyBudgetUsd());
  assert.ok(askBudgetUsd() > monthlyBudgetUsd());
});

test("a bad budget value is ignored rather than removing the ceiling", () => {
  const was = process.env.ASK_MONTHLY_BUDGET_USD;
  try {
    for (const bad of ["0", "-5", "free", ""]) {
      process.env.ASK_MONTHLY_BUDGET_USD = bad;
      assert.ok(askBudgetUsd() > 0, `"${bad}" must not uncap the panel`);
    }
    process.env.ASK_MONTHLY_BUDGET_USD = "40";
    assert.equal(askBudgetUsd(), 40, "a real number is honoured");
  } finally {
    if (was === undefined) delete process.env.ASK_MONTHLY_BUDGET_USD;
    else process.env.ASK_MONTHLY_BUDGET_USD = was;
  }
});
