import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AGENTS, HOUSE_STYLE_FOR_TESTS } from "@shared/roster";
import { buildMessages, NO_EXCERPTS_INSTRUCTION, UNGROUNDED_INSTRUCTION } from "./agentRuntime";

/**
 * WHY THIS FILE EXISTS.
 *
 * The LinkedIn Ads agent was asked, on the live site, "what targeting options
 * does LinkedIn Ads have, and what does your service cost?" It answered with a
 * four-tier price list — $1,200 setup, $1,500 / $3,500 / $7,500+ per month,
 * percentages of ad spend, included hours, a recommended minimum budget — under
 * the heading "Our service pricing (transparent)". None of those numbers exist.
 * Nothing on this site publishes a price at all. The door that agent belongs to
 * is not even open: its own row says `status: "coming"`.
 *
 * Two holes let it happen, and each is a separate assertion below.
 *
 * 1. `buildMessages` pushed a grounding message only `if (agent.useKb)`. Five of
 *    the nine agents have `useKb: false`, so they ran on a one-paragraph persona
 *    and the visitor's question, with no instruction about what they may assert.
 * 2. The house style shared by every agent forbade inventing "API fields,
 *    endpoints or event names" and said nothing whatever about money. An agent
 *    could not invent a parameter name but could invent a retainer.
 *
 * These are cheap tests over pure functions, and they are the only thing
 * standing between a tidy-up and a machine quoting prices in the company's name.
 */

const ASK = { question: "What does your service cost?", history: [] as never[] };

describe("no agent is ever sent a question without being told what it may not invent", () => {
  it("pushes a grounding system message for every agent in the roster", () => {
    for (const agent of AGENTS) {
      const messages = buildMessages(agent, ASK.question, ASK.history, []);
      const systems = messages.filter((m) => m.role === "system");
      assert.ok(
        systems.length >= 2,
        `${agent.id} was sent only ${systems.length} system message(s). Every agent gets its ` +
          `persona AND a grounding message; the second one is what forbids inventing a price. ` +
          `An agent with useKb: false used to get no grounding message at all.`,
      );
    }
  });

  it("gives an ungrounded agent the ungrounded instruction, not the retrieval one", () => {
    const ungrounded = AGENTS.filter((a) => !a.useKb);
    assert.ok(ungrounded.length > 0, "the roster has no ungrounded agent; this test has lost its subject");
    for (const agent of ungrounded) {
      const contents = buildMessages(agent, ASK.question, ASK.history, []).map((m) => String(m.content));
      assert.ok(
        contents.includes(UNGROUNDED_INSTRUCTION),
        `${agent.id} has no corpus but was not given UNGROUNDED_INSTRUCTION`,
      );
      assert.ok(
        !contents.includes(NO_EXCERPTS_INSTRUCTION),
        `${agent.id} was told its corpus returned nothing. It has no corpus — a different fact, ` +
          `and telling it the first implies a corpus exists that might answer next time.`,
      );
    }
  });

  it("tells a grounded agent with no excerpts that its corpus came back empty", () => {
    const grounded = AGENTS.filter((a) => a.useKb);
    assert.ok(grounded.length > 0);
    for (const agent of grounded) {
      const contents = buildMessages(agent, ASK.question, ASK.history, []).map((m) => String(m.content));
      assert.ok(contents.includes(NO_EXCERPTS_INSTRUCTION), `${agent.id} retrieved nothing and was not told so`);
    }
  });
});

describe("nothing in an agent's instructions permits it to quote money", () => {
  /**
   * Read off the roster rather than retyped, so rewording the rule cannot leave
   * this passing against a sentence that no longer says it.
   */
  const everyPrompt = AGENTS.map((a) => a.systemPrompt).concat(
    HOUSE_STYLE_FOR_TESTS,
    UNGROUNDED_INSTRUCTION,
    NO_EXCERPTS_INSTRUCTION,
  );

  it("carries the price prohibition into every agent's system prompt", () => {
    for (const agent of AGENTS) {
      const p = agent.systemPrompt.toLowerCase();
      assert.match(
        p,
        /never state|may never state/,
        `${agent.id}'s prompt does not carry the prohibition block from the house style`,
      );
      assert.ok(
        p.includes("price") && p.includes("percentage of ad spend"),
        `${agent.id}'s prompt does not forbid a price and a percentage of ad spend by name. ` +
          `"Never invent API fields" was the whole rule before, which is why a retainer got invented.`,
      );
      for (const word of ["timeline", "guarantee", "minimum"]) {
        assert.ok(p.includes(word), `${agent.id}'s prompt does not mention ${word}`);
      }
    }
  });

  it("names the specific things the live answer invented", () => {
    // Each of these appeared in the real answer. If a future rewrite drops one,
    // that is the door reopening.
    const joined = everyPrompt.join("\n").toLowerCase();
    for (const invented of ["retainer", "setup cost", "tier", "cost per lead", "deliverables"]) {
      assert.ok(joined.includes(invented), `no instruction mentions "${invented}", which the live answer produced`);
    }
  });

  it("contains no currency figure other than the one credential, pinned by string", () => {
    /*
     * An example price is a price: a model cannot tell an illustration from a
     * quote, and neither can the visitor reading the answer. So the rule is that
     * no prompt carries a figure — with exactly one allowed exception, written out
     * here in full so that ADDING a second one fails.
     *
     * The exception is a credential rather than a price. Separately from this
     * test, it is worth the owner's attention: the redesign deliberately removed
     * the four statistics from the site, and every agent still recites all five
     * of them to a visitor. That is a marketing decision, not a test's to make.
     */
    const ALLOWED = "$2M+ ad spend managed";
    for (const agent of AGENTS) {
      const withoutCredential = agent.systemPrompt.split(ALLOWED).join("");
      assert.doesNotMatch(
        withoutCredential,
        /[$€£]\s?\d/,
        `${agent.id}'s prompt contains a currency figure beyond "${ALLOWED}". Whatever it is, a ` +
          `model reading it may repeat it as what this costs.`,
      );
      // And the exception must still be the exception: if the credential is
      // reworded or dropped, this test should be revisited rather than silently
      // keep allowing a string nothing matches.
      assert.ok(
        agent.systemPrompt.includes(ALLOWED),
        `${agent.id}'s prompt no longer contains "${ALLOWED}". Delete the exception from this test.`,
      );
    }
  });
});
