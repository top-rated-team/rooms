/**
 * What the endpoints under /api/workspaces/:token/billing refuse. Run it with:
 *
 *   npx tsx --test server/billing/http.test.ts
 *
 * Stripe is a fake `fetch` here on purpose: these tests are about the checks
 * this repository makes, not about Stripe's behaviour.
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { billingFor, rememberCard, rememberCustomer, resetBillingForTests } from "./consent";
import { billingView, finishCardSetup, setExchangeConsent, startCardSetup } from "./http";

const WS = "ws_http_test";
const BACK = "https://top-rated.team/w/tok_1";

function fakeStripe(routes: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.replace("https://api.stripe.com/v1", "");
    const key = Object.keys(routes).find((candidate) => path.startsWith(candidate));
    if (!key) return new Response(JSON.stringify({ error: { message: `no fake for ${path}` } }), { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  resetBillingForTests();
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_fake";
});

afterEach(() => {
  resetBillingForTests();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
});

describe("attaching a card", () => {
  it("does not offer the feature at all when this deployment has no keys", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const view = await billingView(WS);
    assert.equal(view.configured, false);
    const started = await startCardSetup({ workspaceId: WS, returnUrl: BACK });
    assert.equal(started.ok, false);
    assert.equal(started.ok === false && started.status, 501);
  });

  it("makes one customer for the room and keeps it", async () => {
    let customersMade = 0;
    const stripe = fakeStripe({
      "/customers": { id: "cus_1" },
      "/checkout/sessions": { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", mode: "setup", status: "open" },
    });
    const counting: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (input.toString().includes("/customers")) customersMade += 1;
      return stripe(input as never, init as never);
    }) as unknown as typeof fetch;

    const first = await startCardSetup({ workspaceId: WS, returnUrl: BACK }, { fetchImpl: counting });
    assert.equal(first.ok, true);
    assert.match(first.ok === true ? first.body.url : "", /^https:\/\/checkout\.stripe\.com\//);
    await startCardSetup({ workspaceId: WS, returnUrl: BACK }, { fetchImpl: counting });
    assert.equal(customersMade, 1, "a second attempt made a second customer for the same room");
  });

  it("refuses a SetupIntent that belongs to another room's customer", async () => {
    await startCardSetup(
      { workspaceId: WS, returnUrl: BACK },
      {
        fetchImpl: fakeStripe({
          "/customers": { id: "cus_mine" },
          "/checkout/sessions": { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", mode: "setup", status: "open" },
        }),
      },
    );
    const done = await finishCardSetup(
      { workspaceId: WS, checkoutSessionId: "cs_somebody_else" },
      {
        fetchImpl: fakeStripe({
          "/checkout/sessions/": { id: "cs_somebody_else", mode: "setup", status: "complete", customer: "cus_theirs", setup_intent: "seti_theirs" },
        }),
      },
    );
    assert.equal(done.ok, false);
    assert.equal(done.ok === false && done.status, 403);
    const row = await billingFor(WS);
    assert.equal(row.paymentMethodId, null, "another room's card was attached here");
  });

  it("refuses a card page the person never finished", async () => {
    await startCardSetup(
      { workspaceId: WS, returnUrl: BACK },
      {
        fetchImpl: fakeStripe({
          "/customers": { id: "cus_mine" },
          "/checkout/sessions": { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", mode: "setup", status: "open" },
        }),
      },
    );
    const done = await finishCardSetup(
      { workspaceId: WS, checkoutSessionId: "cs_1" },
      {
        fetchImpl: fakeStripe({
          "/checkout/sessions/": { id: "cs_1", mode: "setup", status: "open", customer: "cus_mine", setup_intent: null },
        }),
      },
    );
    assert.equal(done.ok, false);
    assert.equal((await billingFor(WS)).paymentMethodId, null);
  });

  it("keeps the brand and last four when the card is really attached", async () => {
    await startCardSetup(
      { workspaceId: WS, returnUrl: BACK },
      {
        fetchImpl: fakeStripe({
          "/customers": { id: "cus_mine" },
          "/checkout/sessions": { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", mode: "setup", status: "open" },
        }),
      },
    );
    const done = await finishCardSetup(
      { workspaceId: WS, checkoutSessionId: "cs_1" },
      {
        fetchImpl: fakeStripe({
          "/checkout/sessions/": { id: "cs_1", mode: "setup", status: "complete", customer: "cus_mine", setup_intent: "seti_1" },
          "/setup_intents/": { id: "seti_1", client_secret: "s", status: "succeeded", customer: "cus_mine", payment_method: "pm_1" },
          "/payment_methods/": { id: "pm_1", card: { brand: "visa", last4: "4242" } },
        }),
      },
    );
    assert.equal(done.ok, true);
    assert.equal(done.ok === true && done.body.card?.last4, "4242");
    assert.equal(done.ok === true && done.body.card?.brand, "visa");
  });
});

describe("agreeing to an exchange", () => {
  it("cannot be agreed to before there is a card to bill it to", async () => {
    const result = await setExchangeConsent({ workspaceId: WS, agree: true, turnsShown: 6, by: "Dan" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 409);
  });

  it("binds the number that was on screen, not the default", async () => {
    await rememberCard(WS, { paymentMethodId: "pm_1", brand: "visa", last4: "4242" });
    const result = await setExchangeConsent({ workspaceId: WS, agree: true, turnsShown: 3, by: "Dan" });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.body.exchange.turnsAgreed, 3);
    assert.equal(result.ok === true && result.body.exchange.turnsLeft, 3);
    assert.equal(result.ok === true && result.body.exchange.agreedBy, "Dan");
  });

  it("saying no leaves the card where it is", async () => {
    await rememberCard(WS, { paymentMethodId: "pm_1", brand: "visa", last4: "4242" });
    await setExchangeConsent({ workspaceId: WS, agree: true, turnsShown: 6, by: "Dan" });
    const off = await setExchangeConsent({ workspaceId: WS, agree: false, by: "Dan" });
    assert.equal(off.ok, true);
    assert.equal(off.ok === true && off.body.exchange.allowed, false);
    assert.equal(off.ok === true && off.body.card?.last4, "4242");
  });

  it("tells the room what it is agreeing to before it agrees", async () => {
    const view = await billingView(WS);
    assert.match(view.exchange.disclosure, /card/i);
    assert.match(view.exchange.disclosure, /nobody is watching|stops on its own/i);
    assert.equal(typeof view.exchange.turnsOnOffer, "number");
  });
});

describe("where the hand-off sits", () => {
  const routes = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
  const handOff = routes.slice(
    routes.indexOf("async function handOnToNamedAgent"),
    routes.indexOf("/** Fire-and-forget"),
  );

  it("exists", () => {
    assert.ok(handOff.length > 0, "handOnToNamedAgent has moved or been renamed");
  });

  it("asks permission before it spends a turn, and spends one before it starts another agent", () => {
    const asks = handOff.indexOf("mayAgentsAnswerEachOther");
    const counts = handOff.indexOf("countExchangeTurn");
    const starts = handOff.indexOf("kickOffAgentReply");
    assert.ok(asks >= 0 && counts >= 0 && starts >= 0);
    assert.ok(asks < counts, "a turn is counted before anyone asks whether it may happen");
    // Counting after the next agent starts is a ceiling that never comes down.
    assert.ok(counts < starts, "the next agent starts before the turn is counted against the ceiling");
  });

  it("hands on only to an agent somebody named, never to the channel's own agent", () => {
    assert.ok(handOff.includes("mentionedAgent("), "the hand-off no longer reads an explicit mention");
    assert.ok(
      !handOff.includes("resolveAgent("),
      "the hand-off fell back to the channel's agent, which is an agent answering itself",
    );
  });

  it("will not hand a turn to the agent that just spoke", () => {
    assert.match(handOff, /next === reply\.agentId/);
  });
});

describe("the loop rule and the money rule are both asked", () => {
  const routes = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
  const handOff = routes.slice(
    routes.indexOf("async function handOnToNamedAgent"),
    routes.indexOf("/** Fire-and-forget"),
  );

  it("asks whether a person named both agents before it asks about money", () => {
    const scope = handOff.indexOf("mayAgentReplyToAgent");
    const money = handOff.indexOf("mayAgentsAnswerEachOther");
    assert.ok(scope >= 0, "the hand-off no longer applies the loop rule in server/seats.ts");
    assert.ok(money >= 0);
    // Money is the second question. An agent nobody asked for must not cost
    // a turn off the ceiling just to be refused.
    assert.ok(scope < money, "the ceiling is read before anyone checks the agent was even asked for");
  });

  it("carries what the person named down every hand-off", () => {
    assert.match(handOff, /namedByPerson: reply\.namedByPerson/);
    const posts = routes.slice(routes.indexOf('"/api/workspaces/:token/messages"'));
    assert.ok(
      posts.includes("agentsNamedIn(body, mentions"),
      "the message route no longer reads which agents the person named",
    );
  });
});

describe("a key problem never reaches the person reading the room", () => {
  const stripeError = (status: number, message: string): typeof fetch =>
    (async () =>
      new Response(JSON.stringify({ error: { message } }), { status })) as unknown as typeof fetch;

  /*
   * A key-shaped string, ASSEMBLED AT RUNTIME so no key-shaped literal is ever
   * in this repository. The first draft of this test pasted the real live key
   * in as a fixture and GitHub's push protection refused the push, which was
   * right: a live key does not belong in source, not even as an example of
   * what not to print.
   */
  const FAKE_KEY = ["rk", "live", `51${"E".repeat(30)}`].join("_");

  /* The real shape of Stripe's message when a restricted key lacks a scope. */
  const PERMISSIONS = `The provided key '${FAKE_KEY}' does not have the required permissions for this endpoint.`;

  it("does not print the key when Stripe names it", async () => {
    const started = await startCardSetup(
      { workspaceId: WS, returnUrl: BACK },
      { fetchImpl: stripeError(403, PERMISSIONS) },
    );
    assert.equal(started.ok, false);
    const line = started.ok === false ? started.error : "";
    assert.ok(!line.includes(FAKE_KEY), `the key reached the browser: ${line}`);
    assert.ok(!/\b[a-z]{2}_(live|test)_/.test(line), `something key-shaped reached the browser: ${line}`);
    assert.match(line, /not set up correctly/i);
    assert.match(line, /nothing was charged/i);
  });

  it("treats a 401 the same way, whatever it says", async () => {
    const started = await startCardSetup(
      { workspaceId: WS, returnUrl: BACK },
      { fetchImpl: stripeError(401, `Invalid API Key provided: ${FAKE_KEY.slice(0, 16)}************5u6W`) },
    );
    assert.equal(started.ok, false);
    const line = started.ok === false ? started.error : "";
    assert.ok(!/\b[a-z]{2}_(live|test)_/.test(line), `something key-shaped reached the browser: ${line}`);
  });

  it("still passes on a sentence that is about the card and not about the key", async () => {
    await rememberCustomer(WS, "cus_mine");
    const done = await finishCardSetup(
      { workspaceId: WS, checkoutSessionId: "cs_1" },
      { fetchImpl: stripeError(402, "Your card was declined.") },
    );
    assert.equal(done.ok, false);
    assert.match(done.ok === false ? done.error : "", /card was declined/i);
  });
});
