/**
 * The three conditions, and that missing one is a refusal rather than a
 * smaller allowance. Run it with:
 *
 *   npx tsx --test server/billing/consent.test.ts
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EXCHANGE_TURNS,
  NO_CARD_LINE,
  NO_CONSENT_LINE,
  SPENT_LINE,
  billingFor,
  countExchangeTurn,
  mayAgentsAnswerEachOther,
  recordExchangeConsent,
  rememberCard,
  resetBillingForTests,
  withdrawExchangeConsent,
} from "./consent";

const WS = "ws_test";

beforeEach(() => resetBillingForTests());
afterEach(() => resetBillingForTests());

describe("agents may answer each other only when all three hold", () => {
  it("refuses with no card, even after somebody consents", async () => {
    const none = await mayAgentsAnswerEachOther(WS);
    assert.deepEqual(none, { allowed: false, reason: "no-card", line: NO_CARD_LINE });

    await recordExchangeConsent(WS, { turnsShown: DEFAULT_EXCHANGE_TURNS, by: "visitor:1" });
    const stillNoCard = await mayAgentsAnswerEachOther(WS);
    assert.equal(stillNoCard.allowed, false);
    if (stillNoCard.allowed) return;
    assert.equal(stillNoCard.reason, "no-card", "consent without a card is not enough");
  });

  it("refuses with a card and no consent, which is the accident this prevents", async () => {
    await rememberCard(WS, { paymentMethodId: "pm_1", brand: "visa", last4: "4242" });
    const verdict = await mayAgentsAnswerEachOther(WS);
    assert.deepEqual(verdict, { allowed: false, reason: "no-consent", line: NO_CONSENT_LINE });
  });

  it("allows only up to the number the person was shown, then stops", async () => {
    await rememberCard(WS, { paymentMethodId: "pm_1", brand: "visa", last4: "4242" });
    await recordExchangeConsent(WS, { turnsShown: 2, by: "visitor:1" });

    const first = await mayAgentsAnswerEachOther(WS);
    assert.deepEqual(first, { allowed: true, turnsLeft: 2 });
    await countExchangeTurn(WS);
    assert.deepEqual(await mayAgentsAnswerEachOther(WS), { allowed: true, turnsLeft: 1 });
    await countExchangeTurn(WS);

    const spent = await mayAgentsAnswerEachOther(WS);
    assert.deepEqual(spent, { allowed: false, reason: "spent", line: SPENT_LINE });
  });

  it("stores the ceiling that was shown, so raising the default cannot raise it", async () => {
    /* Somebody agreed to three turns. If the default later becomes twenty,
       their room is still allowed three, because the number is on their row
       rather than read from a constant when it is used. */
    await rememberCard(WS, { paymentMethodId: "pm_1", brand: "visa", last4: "4242" });
    await recordExchangeConsent(WS, { turnsShown: 3, by: "visitor:1" });
    const row = await billingFor(WS);
    assert.equal(row.agentExchangeTurns, 3);
    assert.notEqual(row.agentExchangeTurns, DEFAULT_EXCHANGE_TURNS);
    assert.equal(row.agentExchangeConsentBy, "visitor:1");
    assert.equal(typeof row.agentExchangeConsentAt, "string");
  });

  it("takes the permission back without touching the card", async () => {
    await rememberCard(WS, { paymentMethodId: "pm_1", brand: "visa", last4: "4242" });
    await recordExchangeConsent(WS, { turnsShown: 5, by: "visitor:1" });
    await withdrawExchangeConsent(WS);

    const verdict = await mayAgentsAnswerEachOther(WS);
    assert.equal(verdict.allowed, false);
    if (verdict.allowed) return;
    assert.equal(verdict.reason, "no-consent");
    const row = await billingFor(WS);
    assert.equal(row.paymentMethodId, "pm_1", "withdrawing consent must not remove the card");
    assert.equal(row.cardLast4, "4242");
  });

  it("never stores anything that could be used as a card", async () => {
    await rememberCard(WS, { paymentMethodId: "pm_1", brand: "visa", last4: "4242" });
    const row = await billingFor(WS);
    const text = JSON.stringify(row);
    assert.equal(/\d{12,}/.test(text), false, "something long enough to be a card number is on the row");
    assert.equal(text.includes("cvc"), false);
  });
});
