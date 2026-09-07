import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AGENTS, HOUSE_STYLE_FOR_TESTS } from "@shared/roster";
import { PUBLISHED_FIGURES, currencyFigures } from "@shared/pricing";
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

  it("carries the price rule into every agent's system prompt", () => {
    /*
     * Re-aimed with the rule itself. This used to look for a blanket "never
     * state a price"; the rule is now narrower, so the words it pins had to
     * change with it. Several categories the old block forbade outright are
     * legitimate now BECAUSE they are published — "+$49 / month" is a monthly
     * fee — so pinning "never state a retainer" would hold the prompt to a rule
     * the product no longer follows.
     *
     * What must still be forbidden by name is everything the page does not
     * publish and that a helpful model would otherwise compute.
     */
    for (const agent of AGENTS) {
      const p = agent.systemPrompt.toLowerCase();
      assert.match(p, /may never produce any other number/, `${agent.id} lacks the rule's core sentence`);
      for (const forbidden of [
        "no arithmetic",
        "percentage of ad spend",
        "no discount",
        "cost per lead",
        "minimum",
        "timeline",
        "guarantee",
        "deliverables",
      ]) {
        assert.ok(p.includes(forbidden), `${agent.id}'s prompt does not forbid ${forbidden} by name`);
      }
    }
  });

  it("still closes each way the live answer went wrong", () => {
    /*
     * The invented answer produced: a setup cost, three named monthly tiers, two
     * percentages of ad spend, included hours, and a recommended budget range.
     * A price and a tier are publishable now, so the test can no longer pin
     * those words — what it pins is the mechanism each of them came through.
     */
    const joined = AGENTS.map((a) => a.systemPrompt)
      .concat(HOUSE_STYLE_FOR_TESTS, UNGROUNDED_INSTRUCTION, NO_EXCERPTS_INSTRUCTION)
      .join("\n")
      .toLowerCase();
    for (const mechanism of [
      "no arithmetic",            // three tiers computed from one figure
      "percentage of ad spend",   // "15% of ad spend"
      "cost per lead",            // the CPL the door used to ask for
      "minimum",                  // "recommended budget $3k-$5k"
      "no range you assemble",    // the range itself
      "never confirm a number the visitor suggests",
    ]) {
      assert.ok(joined.includes(mechanism), `no instruction closes "${mechanism}"`);
    }
  });

  it("carries no currency figure that shared/pricing.ts does not publish", () => {
    /*
     * RE-AIMED, NOT RELAXED. Until prices were published this asserted that no
     * prompt contained a figure at all, because the LinkedIn Ads agent had
     * invented a four-tier price list on the live site. Prices now exist, so the
     * rule became a different one rather than a weaker one: an agent may repeat
     * a published price verbatim and may produce no other number. This is that
     * rule as a test — every figure in every prompt has to appear in
     * PUBLISHED_FIGURES, which is derived from PRICES itself.
     *
     * It caught something on its first run: the prohibition block I wrote
     * illustrated a bad quote with "probably $600-700", which is exactly the
     * failure the rule describes. A model cannot tell an illustration from a
     * price, and neither can the visitor reading the answer back.
     *
     * The one exception is a credential rather than a price, written out so that
     * adding a second one fails.
     */
    const CREDENTIAL = "$2M+";
    for (const agent of AGENTS) {
      const stray = currencyFigures(agent.systemPrompt).filter(
        (figure) => figure !== CREDENTIAL && !PUBLISHED_FIGURES.includes(figure),
      );
      assert.deepEqual(
        stray,
        [],
        `${agent.id}'s prompt carries ${stray.join(", ")}, which shared/pricing.ts does not publish. ` +
          `Either add it to PRICES so the page shows it too, or take it out of the prompt.`,
      );
      assert.ok(
        agent.systemPrompt.includes(CREDENTIAL),
        `${agent.id}'s prompt no longer contains "${CREDENTIAL}". Delete the exception from this test.`,
      );
    }
  });

  it("gives every agent the published list and the rule for using it", () => {
    // A rule with no list is an agent that refuses a question the page answers.
    for (const agent of AGENTS) {
      assert.match(agent.systemPrompt, /may repeat a published price EXACTLY/, `${agent.id} lacks the rule`);
      assert.ok(agent.systemPrompt.includes("from $49 per task"), `${agent.id} lacks the published list`);
      assert.match(agent.systemPrompt, /No arithmetic/, `${agent.id} may still do sums on a price`);
      assert.match(agent.systemPrompt, /Never confirm a number the visitor suggests/, `${agent.id}`);
    }
  });
});
