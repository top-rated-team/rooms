/**
 * The sentence a person reads, against the code that is actually there.
 *
 * EXCHANGE_DISCLOSURE ends with a promise — "no code in this product can
 * charge it, and if that ever changes, this sentence changes with it". A
 * promise nothing checks is decoration. This file is the check: it reads the
 * source of every file under server/billing and fails if a way to take money
 * has appeared while the sentence still says there is none.
 *
 * It fails LOUDLY and says what to do, because the failure is not a bug in the
 * new code — it is new code that has outgrown a sentence somebody is relying
 * on. Run it with:
 *
 *   npx tsx --test server/billing/disclosure.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { EXCHANGE_DISCLOSURE } from "./http";
import { NO_CARD_LINE, SPENT_LINE } from "./consent";

/* fileURLToPath, not `.pathname`: this repository's directory has a space in
   its name and a URL keeps it as %20. */
const HERE = fileURLToPath(new URL(".", import.meta.url));

/** Source with its comments removed. Comments are where these rules are
 *  explained, so a rule named in one is not evidence of the thing itself. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
    .join("\n");
}

function sources(): { name: string; text: string }[] {
  return readdirSync(HERE, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test."))
    .map((entry) => ({ name: entry.name, text: readFileSync(join(HERE, entry.name), "utf8") }));
}

/**
 * Stripe endpoints that move money, and the one parameter that turns a
 * Checkout Session into one. `setup_intents` is absent on purpose: attaching a
 * card is the whole point of this directory.
 */
const WAYS_TO_TAKE_MONEY = [
  "/charges",
  "/payment_intents",
  "/invoices",
  "/invoiceitems",
  "/subscriptions",
  "/subscription_items",
  "/payment_links",
  "/orders",
  "/quotes",
  "/billing_portal",
  "line_items",
  "amount",
];

describe("the disclosure is true of the code", () => {
  it("nothing under server/billing can take money", () => {
    const found: string[] = [];
    for (const file of sources()) {
      const code = codeOnly(file.text);
      for (const way of WAYS_TO_TAKE_MONEY) {
        if (code.includes(way)) found.push(`${file.name}: ${way}`);
      }
    }
    assert.deepEqual(
      found,
      [],
      `A way to take money has appeared under server/billing:\n  ${found.join("\n  ")}\n\n` +
        "EXCHANGE_DISCLOSURE in server/billing/http.ts tells people that nothing here " +
        "charges their card and that no code in this product can. That is now false. " +
        "Change the sentence — and the room's panel with it — before shipping this, " +
        "or move the charge out of server/billing and give it its own consent.",
    );
  });

  it("the Checkout session it opens is a setup, hard-coded, with nothing a caller can change", () => {
    const stripe = readFileSync(join(HERE, "stripe.ts"), "utf8");
    const session = stripe.slice(
      stripe.indexOf("export async function createCheckoutSetupSession"),
      stripe.indexOf("export async function getCheckoutSession"),
    );
    assert.ok(session.length > 0, "createCheckoutSetupSession has moved or been renamed");
    assert.ok(session.includes('mode: "setup"'), "the session no longer hard-codes setup mode");
    assert.ok(
      !/mode:\s*(input|opts|params)/.test(session),
      "the session's mode comes from a caller, so a caller could ask for one that charges",
    );
  });

  it("says a card is needed, and says it is not charged", () => {
    assert.match(EXCHANGE_DISCLOSURE, /card has to be on the room/i);
    // The owner asked for this specifically: warn that it is chargeable later
    // without the person present, which is what a card kept on file means.
    assert.match(EXCHANGE_DISCLOSURE, /without you present/i);
    assert.match(EXCHANGE_DISCLOSURE, /nothing here charges it today/i);
    assert.match(EXCHANGE_DISCLOSURE, /no code in this product can/i);
  });

  it("says the exchange ends by itself, because that is the part that bounds the cost", () => {
    assert.match(EXCHANGE_DISCLOSURE, /stops on its own after the number of turns/i);
    assert.match(SPENT_LINE, /used the turns this room agreed to/i);
  });

  it("does not promise a free card and then charge for attaching one", () => {
    assert.match(NO_CARD_LINE, /nothing is charged to attach one/i);
  });

  it("the room shows the person the same sentence the server holds", () => {
    const panel = readFileSync(
      join(HERE, "..", "..", "client", "src", "components", "workspace", "AgentExchangePanel.tsx"),
      "utf8",
    );
    /* The panel renders `exchange.disclosure` rather than a copy of its own.
       A second copy is a second thing to forget to change. */
    assert.ok(
      panel.includes("exchange.disclosure"),
      "the panel prints its own wording instead of the server's, so the two can drift apart",
    );
    assert.ok(
      !codeOnly(panel).includes("billed to"),
      "the panel has grown its own sentence about billing; there should be exactly one",
    );
  });
});
