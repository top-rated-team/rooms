import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { signAnswer, verifyAnswer } from "./answer-receipt";
import { carriedAnswerSchema, createWorkspaceSchema } from "@shared/schema";

/**
 * The room can be opened carrying an answer the visitor already read, so that
 * they see the exchange they had rather than the agent answering again. The
 * receipt is the only thing standing between that convenience and a forgery:
 * without it, a POST to /api/workspaces could put any words in an agent's mouth
 * in a room at a real address on this domain, and an agent message in a room
 * reads as the company speaking.
 *
 * So these are not tests of a hash function. They are the tests of that gate.
 */
describe("an answer carried into a room has to be one this server wrote", () => {
  const ANSWER = "Performance Max bids to a target, and the target is what you actually control.";

  it("accepts the exact text it signed", () => {
    assert.equal(verifyAnswer(ANSWER, signAnswer(ANSWER)), true);
  });

  it("rejects text altered by a single character", () => {
    const receipt = signAnswer(ANSWER);
    // The realistic attack is not random noise: it is the real answer with one
    // clause changed — a price added, a "not" removed.
    assert.equal(verifyAnswer(ANSWER + " Our fee is 12% of spend.", receipt), false);
    assert.equal(verifyAnswer(ANSWER.replace("bids to", "does not bid to"), receipt), false);
    assert.equal(verifyAnswer(ANSWER.slice(0, -1), receipt), false);
  });

  it("rejects a receipt lifted from a different answer", () => {
    assert.equal(verifyAnswer(ANSWER, signAnswer("Ad Grants caps you at two dollars a click.")), false);
  });

  it("rejects everything malformed without throwing", () => {
    for (const bad of [undefined, null, "", "x", 12, {}, [], "z".repeat(32), signAnswer(ANSWER) + "0"]) {
      assert.equal(verifyAnswer(ANSWER, bad as unknown), false, `accepted ${JSON.stringify(bad)}`);
    }
  });

  it("signs to a fixed width, so a receipt cannot reveal the answer's length", () => {
    const short = signAnswer("a");
    const long = signAnswer("a".repeat(20000));
    assert.equal(short.length, 32);
    assert.equal(long.length, 32);
    assert.notEqual(short, long);
  });
});

describe("the create-workspace contract cannot be talked out of the receipt", () => {
  it("requires a receipt beside the body", () => {
    assert.equal(carriedAnswerSchema.safeParse({ body: "hello" }).success, false);
    assert.equal(carriedAnswerSchema.safeParse({ body: "hello", receipt: "" }).success, false);
    assert.equal(carriedAnswerSchema.safeParse({ body: "", receipt: signAnswer("hello") }).success, false);
    assert.equal(carriedAnswerSchema.safeParse({ body: "hello", receipt: signAnswer("hello") }).success, true);
  });

  it("keeps firstAnswer optional, so a room opened with nothing asked still works", () => {
    assert.equal(createWorkspaceSchema.safeParse({}).success, true);
    assert.equal(createWorkspaceSchema.safeParse({ firstMessage: "hi" }).success, true);
  });

  it("caps the body, because it is written into a room as the company speaking", () => {
    const receipt = signAnswer("x");
    assert.equal(carriedAnswerSchema.safeParse({ body: "x".repeat(20000), receipt }).success, true);
    assert.equal(carriedAnswerSchema.safeParse({ body: "x".repeat(20001), receipt }).success, false);
  });
});
