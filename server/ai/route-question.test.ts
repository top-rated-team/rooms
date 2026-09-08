/**
 * The home-page router has to be true of four things. Run it with:
 *
 *   npx tsx --test server/ai/route-question.test.ts
 *
 * Why this file exists. The home page is not a door, and each agent reads one
 * corpus with no fallback. A general question sent to a default agent cites
 * the wrong documentation with working links. The assertions below are the
 * four cases that make that failure impossible: an unmistakable subject goes
 * to that door; a thin question goes to nothing and returns choices; price and
 * contact go to the page; and a coming door is never returned.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DOOR_BY_ID, DOORS } from "@shared/doors";

import { routeQuestion, type RouteQuestionResult } from "./route-question";

function doorIds(result: RouteQuestionResult): string[] {
  if (result.kind === "door") return [result.doorId];
  if (result.kind === "choices") return result.choices.map((choice) => choice.doorId);
  return [];
}

function assertOnlyLive(result: RouteQuestionResult, label: string): void {
  for (const id of doorIds(result)) {
    const door = DOOR_BY_ID[id];
    assert.ok(door, `${label}: ${id} is not a door`);
    assert.equal(door.status, "live", `${label}: router returned ${id}, whose status is ${door.status}`);
  }
  assert.ok(!doorIds(result).includes("white-label"), `${label}: white-label is coming`);
  assert.ok(!doorIds(result).includes("linkedin-growth"), `${label}: linkedin-growth is coming`);
}

test("a question with an unmistakable subject routes to that door", () => {
  const cases: Array<{ question: string; doorId: string }> = [
    {
      question: "How do I install the ChatGPT Ads pixel on Shopify without breaking checkout?",
      doorId: "chatgpt-ads",
    },
    {
      question: "What is the difference between oppref and obref, and do I need both?",
      doorId: "chatgpt-ads",
    },
    {
      question: "Should we split PMax from Search, or let PMax absorb everything?",
      doorId: "google-ads",
    },
    {
      question: "Google suspended our grant account over the 5% click-through rule. Can you rebuild it?",
      doorId: "ad-grants",
    },
    {
      question: "How do we get LinkedIn spend and CRM pipeline into one report?",
      doorId: "linkedin-ads",
    },
    {
      question: "Can this be built against the official LinkedIn API instead of a browser session?",
      doorId: "linkedin-automation",
    },
    {
      question: "Can you build an agent that answers from our own documentation and cites it?",
      doorId: "ai-builds",
    },
  ];

  for (const { question, doorId } of cases) {
    const result = routeQuestion(question);
    assertOnlyLive(result, question);
    assert.equal(result.kind, "door", `"${question}" should route to a door, got ${result.kind}`);
    if (result.kind !== "door") continue;
    assert.equal(result.doorId, doorId, `"${question}" routed to ${result.doorId}`);
    assert.equal(result.agentId, DOOR_BY_ID[doorId].firstAgentId);
    assert.ok(result.reason.length > 0, "the visitor has to be told why");
    assert.ok(!result.reason.includes("!"), result.reason);
  }
});

test("a thin question routes to nothing and returns choices", () => {
  for (const question of ["how does tracking work", "help", "what can you do", "hi"]) {
    const result = routeQuestion(question);
    assertOnlyLive(result, question);
    assert.equal(result.kind, "choices", `"${question}" must not guess a door, got ${JSON.stringify(result)}`);
    if (result.kind !== "choices") continue;
    assert.ok(result.choices.length >= 2 && result.choices.length <= 3);
    assert.equal(new Set(result.choices.map((c) => c.doorId)).size, result.choices.length);
    for (const choice of result.choices) {
      assert.equal(choice.label, DOOR_BY_ID[choice.doorId].headline);
    }
  }
});

test("a question about price or contact routes to the page rather than to an agent", () => {
  for (const question of ["what does this cost", "how much do you charge", "pricing"]) {
    const result = routeQuestion(question);
    assertOnlyLive(result, question);
    assert.equal(result.kind, "page", `"${question}" should go to the page, got ${result.kind}`);
    if (result.kind !== "page") continue;
    assert.equal(result.page, "pricing");
    assert.equal(result.href, "/pricing");
    assert.equal(result.reason.includes("agent"), true);
  }

  for (const question of ["who are you", "can I talk to somebody", "book a call"]) {
    const result = routeQuestion(question);
    assertOnlyLive(result, question);
    assert.equal(result.kind, "page", `"${question}" should go to a person, got ${result.kind}`);
    if (result.kind !== "page") continue;
    assert.equal(result.page, "contact");
  }
});

test("the router never returns a door whose status is not live", () => {
  const coming = DOORS.filter((door) => door.status !== "live");
  assert.ok(coming.length > 0, "the table still has coming doors; this test has lost its subject");

  const questions = [
    "Maksymenko LinkedIn Growth invoices you directly",
    "Who exactly is the company doing this LinkedIn growth work, and where is it registered?",
    "Can you deliver Google Ads work under our brand, without our client knowing you exist?",
    "Could we run this platform as our own, with our own set of services?",
    "white label our work under your name",
    ...coming.flatMap((door) => door.starters.slice(0, 2)),
    "how does tracking work",
    "what does this cost",
    "who are you",
    "How do I install the ChatGPT Ads pixel on Shopify without breaking checkout?",
  ];

  for (const question of questions) {
    const result = routeQuestion(question);
    assertOnlyLive(result, question);
    for (const id of doorIds(result)) {
      assert.notEqual(DOOR_BY_ID[id].status, "coming", `${id} leaked for "${question}"`);
    }
  }

  // Honouring a pick still refuses a coming door rather than routing to it.
  const refused = routeQuestion("anything", "linkedin-growth");
  assertOnlyLive(refused, "picked coming door");
  assert.notEqual(refused.kind === "door" ? refused.doorId : "", "linkedin-growth");

  const honoured = routeQuestion("anything", "google-ads");
  assert.equal(honoured.kind, "door");
  if (honoured.kind === "door") {
    assert.equal(honoured.doorId, "google-ads");
    assert.equal(DOOR_BY_ID[honoured.doorId].status, "live");
  }
});

test("a phrase only counts when the question contains it as words", () => {
  /*
   * THE BUG THIS PINS DOWN was live and it sent the wrong people to the wrong
   * door. Phrases were matched with q.includes(phrase), a raw substring test.
   * The Ad Grants headline — "Google Ad Grant AI setup through the official
   * Google Ads API" — yields both "google ad" and "google ads" as n-grams, and
   * "google ad" is a substring of "google ads". So a business asking to have
   * its Google Ads managed paid the charity door twice and landed on a page
   * about grants for nonprofits.
   *
   * Three plain management questions all routed to ad-grants before the fix.
   * They are here verbatim rather than as one representative case, because
   * that is what was actually measured going wrong.
   */
  for (const question of [
    "Can you manage our Google Ads?",
    "We need help managing our Google Ads account",
    "Who runs Google Ads campaigns?",
  ]) {
    const result = routeQuestion(question);
    const landed = result.kind === "door" ? result.doorId : null;
    assert.notEqual(
      landed,
      "ad-grants",
      `"${question}" routed to the nonprofit grant door. The phrase match has lost its word boundary.`,
    );
  }

  /* And the fix must not cost Ad Grants the questions that ARE its own. */
  for (const question of [
    "Can you set up a Google Ad Grant for our charity?",
    "Our nonprofit needs Google Ad Grants help",
  ]) {
    const result = routeQuestion(question);
    assert.equal(
      result.kind === "door" ? result.doorId : null,
      "ad-grants",
      `"${question}" no longer reaches the Ad Grants door`,
    );
  }
});
