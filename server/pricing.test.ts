import { relative } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_DOOR_ID, DOORS, DOOR_BY_ID } from "@shared/doors";
import {
  currencyFigures,
  PRICES,
  PRICE_BY_ID,
  priceForDoor,
  publishedPricesForPrompt,
  PUBLISHED_FIGURES,
} from "@shared/pricing";
import { AGENTS } from "@shared/roster";

/**
 * WHY THIS FILE EXISTS.
 *
 * Publishing a price is the first thing this site does that a person could hold
 * it to. Three things can go wrong with one, and none of them is a rendering
 * bug — each one ends with a visitor holding a figure the company did not mean
 * to give them:
 *
 * 1. **The same price written twice.** Two copies drift, and the drift is always
 *    discovered by whoever paid the higher one. So there is one copy, in
 *    shared/pricing.ts, and the sweep below fails on a figure anywhere else that
 *    is not either a published price or a documented non-price.
 *
 * 2. **An agent quoting a figure the page does not show.** This is not
 *    hypothetical here. The LinkedIn Ads agent invented a four-tier price list
 *    on the live site — $1,200 setup, $1,500 / $3,500 / $7,500+ a month,
 *    percentages of ad spend — under the heading "Our service pricing
 *    (transparent)", for a door that is not even open. The prohibition that
 *    followed is held down by server/ai/grounding.test.ts.
 *
 *    Now that prices are published, that prohibition becomes a different rule
 *    rather than a weaker one: an agent may state a published price verbatim and
 *    may never state any other number. The case below is that same guarantee
 *    aimed at the new rule — every currency figure in every prompt has to be a
 *    figure shared/pricing.ts publishes. It is strictly stronger than "no
 *    figures at all", because it also says which figures are allowed instead of
 *    trusting that nobody adds one.
 *
 * 3. **A door showing somebody else's price.** A door is sold on one row. Show a
 *    visitor the whole ladder on a door page and they will find themselves on
 *    the cheapest row; show them another company's door with our figure on it
 *    and we have made ourselves the seller of work we do not invoice.
 *
 * These are cheap tests over pure data. There is no client test runner in this
 * repository, so where a guarantee is about what a component renders it is
 * tested against the component's source and its inputs, in the same way
 * server/spend.test.ts tests where the spend guard sits.
 */

/* -------------------------------------------------------------------------- */
/* 1. Every price the site renders traces to a row                            */
/* -------------------------------------------------------------------------- */

/**
 * Currency figures that are not prices, each with the reason it is not one.
 *
 * This list is short and it is meant to stay short. Adding to it is a visible
 * act in a diff, which is the point: the alternative to an explicit exception
 * is a test that quietly matches nothing.
 *
 * Every entry is checked to be still present, so a figure cannot be removed
 * from the tree and go on being permitted here.
 */
const NOT_A_PRICE: Record<string, string> = {
  "$2M+":
    "the firm's record — budgets optimized for clients, not a charge. It is on the first screen and, as a credential, in every agent's prompt.",
  $3K: "a visitor's own monthly budget, inside a starter question they click.",
  $30K: "a visitor's own monthly spend, inside a starter question they click.",
  $200: "a visitor's own average contract value, inside a starter question they click.",
  $10k: "the size of a Google Ad Grant, which Google sets and we do not charge, inside a starter question.",
  $10K: "the same Google grant, capitalised differently on the agent's copy of the question.",
};

/** The trees a visitor's eyes can reach: the client, and the data the client reads. */
const SWEPT = ["../client/src", "../shared"];

/**
 * One file is exempt, and the exemption is tied to the property that makes it
 * safe rather than to a promise.
 *
 * shared/cases.ts is every case study published on top-rated.team, as data. It
 * is full of currency figures — a client's daily ad budget, a cost per
 * conversion — and not one of them is a price of ours. Listing them in
 * NOT_A_PRICE below would be twenty lines of noise that a twenty-third case
 * would break.
 *
 * What makes exempting a whole file defensible is that nobody writes in it:
 * scripts/build-cases.ts generates it from data/cases-source.json, so a price
 * of ours cannot be typed in by hand. The test below asserts that generated
 * banner is still there — if somebody ever edits the file directly and drops
 * it, the exemption stops applying and the sweep covers it again.
 */
/*
 * shared/builds.ts is exempt on the same terms and for a sharper reason. It
 * holds the six things this company has built, and two of them — top-voice.ai
 * and warmlike.com — publish their own price lists on their own sites. Those
 * figures ($329, $199, $49 a booster) are quoted from those pages because the
 * partner door and the custom-AI door describe those products, and they are
 * PRICES OF OTHER PAGES, not rows of this site's ladder. Putting them in
 * PRICES would have this site selling them; putting them in NOT_A_PRICE would
 * be a list that goes stale the first time top-voice.ai changes a plan.
 *
 * The same thing makes it safe: scripts/build-builds.ts generates the file from
 * data/builds/*.json, so a price of ours cannot be typed into it by hand, and
 * the banner assertion below withdraws the exemption the moment somebody edits
 * it directly.
 */
/*
 * shared/blog.ts is the third, and its figures are the clearest case: they sit
 * inside the text of five posts published on top-rated.team — "$5k a month",
 * "$2,500 cost per opportunity" — written as examples in an argument about
 * bidding. They are nobody's price, least of all ours. Same protection as the
 * other two: generated by scripts/build-blog.ts, banner asserted below.
 *
 * WORTH RECORDING HOW THIS LINE ARRIVED. It was added by the page-blog parcel's
 * agent, and this file is not its to edit — its brief names what it owns and
 * says to hand back anything else. The sweep went red the moment shared/blog.ts
 * appeared, its brief also required a passing verify, and the two instructions
 * met. It made the smallest right change instead of stopping, which is the good
 * half; it made it in somebody else's file, which is the half the manifest
 * exists to prevent. Kept because it is correct and was about to be made from
 * this side anyway.
 */
const GENERATED_EXEMPT = ["shared/cases.ts", "shared/builds.ts", "shared/blog.ts"];

function sourceFiles(dir: URL): URL[] {
  return readdirSync(dir).flatMap((entry) => {
    const child = new URL(`${dir.pathname.endsWith("/") ? dir.pathname : `${dir.pathname}/`}${entry}`, dir);
    if (statSync(child).isDirectory()) return sourceFiles(new URL(`${child.pathname}/`, child));
    return /\.(ts|tsx)$/.test(entry) ? [child] : [];
  });
}

/** The repository root, from this file: server/ is one level down. */
const REPO_ROOT = new URL("..", import.meta.url).pathname;

describe("every price the site renders traces to a row in shared/pricing.ts", () => {
  const files = SWEPT.flatMap((tree) => sourceFiles(new URL(`${tree}/`, import.meta.url)));

  it("has files to read, so a passing sweep means something", () => {
    assert.ok(files.length > 20, `swept ${files.length} files, which is too few — the walker has lost its trees`);
  });

  it("finds no currency figure that is neither a published price nor a documented non-price", () => {
    const published = new Set(PUBLISHED_FIGURES);
    const unexplained: string[] = [];

    for (const file of files) {
      if (GENERATED_EXEMPT.some((name) => file.pathname.endsWith(name))) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        /* A "$1" on a replace() line is a capture-group backreference, not
         * money. client/src/pages/workspace.tsx has four of them. */
        if (line.includes(".replace(")) return;
        for (const figure of currencyFigures(line)) {
          if (published.has(figure) || figure in NOT_A_PRICE) continue;
          /* Relative to the repository root, worked out from this file's own
             location rather than from the checkout's folder name. The folder is
             about to be renamed and the name was hard-coded here. */
          unexplained.push(`${relative(REPO_ROOT, file.pathname)}:${index + 1} — ${figure}`);
        }
      });
    }

    assert.deepEqual(
      unexplained,
      [],
      `A currency figure appears in the tree that shared/pricing.ts does not publish. Either it is a ` +
        `price and belongs in PRICES, or it is not one and belongs in NOT_A_PRICE above with the reason:\n  ` +
        unexplained.join("\n  "),
    );
  });

  it("only exempts a file that is generated, so a price cannot be hand-written into it", () => {
    /*
     * The exemption above skips whole files. It is only defensible while nothing
     * writes in them by hand, so this asserts the two things that make that
     * true, for each one: the banner that says so, and the generator that puts
     * it there. Edit an exempt file directly and drop the banner, and this
     * fails rather than letting an unpublished price of ours ride in on a case
     * study or a portfolio entry.
     */
    for (const name of GENERATED_EXEMPT) {
      const exempt = files.find((file) => file.pathname.endsWith(name));
      assert.ok(exempt, `${name} is exempt from the sweep and does not exist`);

      const text = readFileSync(exempt, "utf8");
      assert.match(text, /GENERATED — do not edit/, `${name} is exempt but is not marked generated`);

      /* The banner names its own generator; this reads that name out of the
         file rather than being told it, so a third exempt file needs no edit
         here and cannot arrive without a generator behind it. */
      const named = /Run `npx tsx (scripts\/[\w-]+\.ts)`/.exec(text);
      assert.ok(named, `${name} is exempt but its banner does not name the script that writes it`);
      assert.ok(
        existsSync(new URL(`../${named[1]}`, import.meta.url)),
        `${name} names ${named[1]}, which does not exist — the file is now hand-maintained`,
      );
    }
  });

  it("still finds every figure NOT_A_PRICE claims to explain", () => {
    const everything = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const [figure, reason] of Object.entries(NOT_A_PRICE)) {
      assert.ok(
        everything.includes(figure),
        `NOT_A_PRICE still permits "${figure}" (${reason}) and nothing in the tree contains it. ` +
          `Delete the entry rather than leaving a standing exception for a figure nobody uses.`,
      );
    }
  });

  it("writes no figure into the component that renders them", () => {
    const ladder = readFileSync(new URL("../client/src/components/site/Ladder.tsx", import.meta.url), "utf8");
    assert.deepEqual(
      currencyFigures(ladder),
      [],
      "Ladder.tsx contains a currency figure. It renders shared/pricing.ts; a figure typed into it is the " +
        "second copy of a price, which is the thing this file exists to prevent.",
    );
  });

  it("keeps every figure in a row inside the row's own price, where it can be quoted verbatim", () => {
    const published = new Set(PUBLISHED_FIGURES);
    for (const row of PRICES) {
      for (const figure of currencyFigures(`${row.buys} ${row.condition ?? ""}`)) {
        assert.ok(
          published.has(figure),
          `the "${row.id}" row mentions ${figure} in its prose, and no row publishes that figure. A price ` +
            `belongs in \`price\`, where the page prints it and an agent may repeat it.`,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The re-aimed grounding case                                             */
/* -------------------------------------------------------------------------- */

/**
 * The replacement for "no agent prompt contains a currency figure".
 *
 * That case did its job under the old rule, which was that nothing on this site
 * published a price, so any figure in a prompt was invented by definition. The
 * rule is now narrower and the guarantee is the same one re-aimed: a figure in a
 * prompt has to be a figure the page shows.
 *
 * It passes today, before the prices are interpolated into HOUSE_STYLE, and it
 * goes on passing afterwards — which is exactly what makes that change safe to
 * make. It is not a softer test: "no figures" permits nothing and says nothing
 * about what a permitted figure would be, while this says which figures may
 * appear and fails on every other one.
 */
describe("every currency figure an agent is given is a price this site publishes", () => {
  /*
   * The one exception, and it is a credential rather than a price: what has been
   * spent on behalf of clients, not what anything costs. Written out in full so
   * that adding a SECOND exception fails, and asserted to still exist so it
   * cannot rot into an allowance for a string nothing matches. Carried over from
   * server/ai/grounding.test.ts verbatim, because it is the same exception.
   */
  const ALLOWED_CREDENTIAL = "$2M+ in budgets optimized";

  /** The whole of the rule, in one function, so the case below and the control under it test the same thing. */
  function unpublishedFiguresIn(text: string): string[] {
    const published = new Set(PUBLISHED_FIGURES);
    return currencyFigures(text.split(ALLOWED_CREDENTIAL).join("")).filter((figure) => !published.has(figure));
  }

  it("publishes some figures, so this test has a subject", () => {
    assert.ok(PUBLISHED_FIGURES.length > 0, "shared/pricing.ts publishes no figure at all");
  });

  it("lets no agent's prompt carry a figure that is not a published price", () => {
    for (const agent of AGENTS) {
      assert.deepEqual(
        unpublishedFiguresIn(agent.systemPrompt),
        [],
        `${agent.id}'s prompt contains a figure shared/pricing.ts does not publish. A model reading it may ` +
          `repeat it as what this costs, and a visitor who reads that has been quoted a price that exists ` +
          `nowhere. Published figures are: ${PUBLISHED_FIGURES.join(", ")}.`,
      );
    }
  });

  it("would have caught the price list the live agent actually invented", () => {
    /*
     * The negative control, and it is not decoration. Until the prices are
     * interpolated into HOUSE_STYLE, no prompt contains a figure at all, so the
     * case above passes over an empty list — and a guarantee that has never
     * rejected anything is a guarantee nobody has tested.
     *
     * These four figures are the ones the LinkedIn Ads agent put on the live
     * site. Each has to come back as unpublished, and none may drift into
     * PRICES: if a future ladder ever publishes one of these, this control stops
     * proving anything and needs rewriting against a figure that is still wrong.
     */
    const invented = "Our service pricing (transparent): $1,200 setup, then $1,500 / $3,500 / $7,500+ per month.";
    assert.deepEqual(unpublishedFiguresIn(invented), ["$1,200", "$1,500", "$3,500", "$7,500+"]);

    // And the rule has to let the real ones through, or it is the old blanket ban wearing a new name.
    for (const figure of PUBLISHED_FIGURES) {
      assert.deepEqual(unpublishedFiguresIn(`A published price: ${figure}.`), []);
    }
  });

  it("keeps the credential exception real", () => {
    for (const agent of AGENTS) {
      assert.ok(
        agent.systemPrompt.includes(ALLOWED_CREDENTIAL),
        `${agent.id}'s prompt no longer contains "${ALLOWED_CREDENTIAL}". Delete the exception from this ` +
          `file rather than leaving it permitting a string that appears nowhere.`,
      );
    }
  });

  it("hands the agents the published rows and nothing else numeric", () => {
    const block = publishedPricesForPrompt();
    const published = new Set(PUBLISHED_FIGURES);

    for (const figure of currencyFigures(block)) {
      assert.ok(
        published.has(figure),
        `the block the agents are given contains ${figure}, which no row publishes. This function is the ` +
          `only route a figure may take into a prompt, so a stray one here is a price an agent can quote ` +
          `that the page does not show.`,
      );
    }

    // And it must actually carry them, or the rule "quote it verbatim" is a rule
    // about a list the agent was never given.
    for (const figure of PUBLISHED_FIGURES) {
      assert.ok(block.includes(figure), `the block the agents are given omits the published figure ${figure}`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. No door shows a tier that is not its own                                */
/* -------------------------------------------------------------------------- */

describe("a door is sold on one row of the ladder, and it is its own", () => {
  it("gives every door of ours a row that exists, and the partner door none", () => {
    for (const door of DOORS) {
      assert.ok(door.priceTier, `the ${door.id} door has no priceTier, so nothing decides what its page shows`);

      if (door.priceTier === "partner") {
        /*
         * The one tier with no row. Asserted rather than skipped, because "the
         * partner door shows no price" is the guarantee and an accidental row
         * for it would restore exactly the sentence the owner cut.
         */
        assert.equal(
          PRICE_BY_ID.partner,
          undefined,
          `shared/pricing.ts has grown a "partner" row again, so the ${door.id} door will print a price section ` +
            `for work another company invoices`,
        );
        continue;
      }

      assert.ok(
        PRICE_BY_ID[door.priceTier],
        `the ${door.id} door points at the "${door.priceTier}" row, which shared/pricing.ts does not have`,
      );
    }
  });

  it("resolves a door to the one row the door names, and never to a second", () => {
    for (const door of DOORS) {
      const row = priceForDoor(door);
      if (!row) {
        assert.equal(
          door.priceTier,
          "partner",
          `the ${door.id} door resolved to no price row at all, and "partner" is the only tier allowed to`,
        );
        continue;
      }
      assert.equal(row.id, door.priceTier, `the ${door.id} door resolved to the "${row.id}" row`);
      assert.equal(
        PRICES.filter((candidate) => candidate.id === row.id).length,
        1,
        `"${row.id}" appears more than once in PRICES, so a door page could print two prices for one door`,
      );
    }
  });

  it("asks shared/pricing.ts for one row rather than filtering the whole ladder", () => {
    /*
     * The structural half of the guarantee, tested the way server/spend.test.ts
     * tests where the guard sits: DoorPrice is handed a door and asks for its
     * row, so it never holds more than one and cannot print a neighbour's. If
     * this goes red, "a door shows its own tier" has stopped being structural
     * and a filter somebody has to keep correct has taken its place.
     */
    const ladder = readFileSync(new URL("../client/src/components/site/Ladder.tsx", import.meta.url), "utf8");
    const doorPrice = ladder.slice(ladder.indexOf("export function DoorPrice"));

    assert.ok(doorPrice.length > 0, "DoorPrice has moved or been renamed — re-read this file's header");
    assert.ok(doorPrice.includes("priceForDoor(door)"), "DoorPrice no longer resolves its row from the door it was given");
    assert.ok(
      !doorPrice.includes("PRICES"),
      "DoorPrice now reaches for the whole ladder. A door page showing every row lets a visitor pick the " +
        "cheapest one and call it their price.",
    );
  });

  it("publishes no figure of ours for work another company invoices", () => {
    /*
     * docs/doors.md, and it costs money to get wrong: "whoever sets the price is
     * the seller of that work. On a door that is not Top-Rated Team's own,
     * publishing a price makes Top-Rated Team the seller in fact, whatever the
     * footer says."
     *
     * This used to assert that such a door sat on a row with no figure in it.
     * It now asserts something stronger and simpler: such a door resolves to NO
     * ROW, so there is nothing for a page to print and nothing for a later edit
     * to start printing. The row that used to carry the disclosure was removed
     * on the owner's instruction, and the guarantee survived the removal by
     * becoming structural instead of textual.
     */
    const ourLegalName = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

    for (const door of DOORS) {
      const row = priceForDoor(door);
      const ours = door.contract.legalName === ourLegalName;

      if (!ours) {
        assert.equal(
          row,
          null,
          `the ${door.id} door is invoiced by ${door.contract.legalName}, and this site resolves a price row ` +
            `for it. Publishing anything of ours for work we do not invoice makes us the seller of it.`,
        );
        continue;
      }

      assert.ok(row, `the ${door.id} door is ours and resolves to no price row, so its page shows no price`);
      assert.equal(
        row.ours,
        true,
        `the ${door.id} door is invoiced by us but sits on the "${row.id}" row, which is not priced by us`,
      );
    }
  });
});
