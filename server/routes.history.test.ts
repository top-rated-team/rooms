/**
 * Who said what, in the history an agent is handed. Run it with:
 *
 *   npx tsx --test server/routes.history.test.ts
 *
 * The bug this exists for: `authorKind === "agent"` used to mean `assistant`
 * for ANY agent, so an agent reading a room another agent had spoken in saw
 * those words as its own earlier turns. One agent per room hid it. Two agents
 * in one room — which is the whole point of them working together — is where
 * it produces an agent contradicting "itself" in somebody else's voice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHistoryForTests } from "./routes";

const MEMBERS = [
  { memberKey: "agent:google-ads", displayName: "Google Ads Agent" },
  { memberKey: "visitor:1", displayName: "Ada" },
] as never[];

const MESSAGES = [
  { channelId: "c1", authorKey: "visitor:1", authorKind: "visitor", body: "what about budgets?" },
  { channelId: "c1", authorKey: "agent:google-ads", authorKind: "agent", body: "start with one." },
  { channelId: "c1", authorKey: "agent:ad-grants", authorKind: "agent", body: "grants differ." },
] as never[];

test("only the agent's own lines are assistant, and every other speaker is named", () => {
  const forGoogle = buildHistoryForTests(MESSAGES, "c1", "agent:google-ads", MEMBERS);
  assert.deepEqual(
    forGoogle.map((turn) => [turn.role, turn.speaker ?? null]),
    [
      ["user", "Ada"],
      ["assistant", null],
      ["user", "Ad Grants Agent"],
    ],
  );
});

test("the same history read by the other agent moves which line is its own", () => {
  const forGrants = buildHistoryForTests(MESSAGES, "c1", "agent:ad-grants", MEMBERS);
  assert.deepEqual(
    forGrants.map((turn) => turn.role),
    ["user", "user", "assistant"],
  );
  /* And the line it did not say now carries a name rather than arriving
     anonymously, which is what let an agent mistake it for itself. */
  assert.equal(forGrants[1]?.speaker, "Google Ads Agent");
});

test("a speaker the member list does not carry still gets a name, never a raw key", () => {
  const forNobody = buildHistoryForTests(MESSAGES, "c1", "agent:none", []);
  assert.deepEqual(
    forNobody.map((turn) => turn.speaker),
    ["The visitor", "Google Ads Agent", "Ad Grants Agent"],
  );
  for (const turn of forNobody) {
    assert.equal(turn.speaker?.includes(":"), false, "a member key reached the model");
  }
});
