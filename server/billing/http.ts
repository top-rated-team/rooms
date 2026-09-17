/**
 * The four things a room can ask about money, and nothing more.
 *
 *   GET  what this room has            → billingView
 *   POST open the card page            → startCardSetup   (no charge, ever)
 *   POST the card came back            → finishCardSetup
 *   POST yes, agents may answer each   → setExchangeConsent
 *        other, up to the number I saw
 *
 * There is no endpoint here that takes money, because there is no function
 * under server/billing that can take money. See stripe.ts.
 *
 * Who may call these is decided in server/routes.ts by the same claim that
 * decides who may rename a room: a room with no owner has nobody who can
 * agree to anything on its behalf.
 */

import { z } from "zod";

import {
  DEFAULT_EXCHANGE_TURNS,
  billingFor,
  mayAgentsAnswerEachOther,
  recordExchangeConsent,
  rememberCard,
  rememberCustomer,
  withdrawExchangeConsent,
} from "./consent";
import {
  STRIPE_UNCONFIGURED_LINE,
  createCheckoutSetupSession,
  createCustomer,
  getCheckoutSession,
  getPaymentMethod,
  getSetupIntent,
  stripeConfigured,
} from "./stripe";

/** What the person is told before they agree — the whole of it, in one place. */
export const EXCHANGE_DISCLOSURE =
  "Agents answering each other costs money on every turn, and those turns happen " +
  "while nobody is watching. The card on this room is what that is billed to. " +
  "It stops on its own after the number of turns you agree to here.";

export const cardSetupSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  /* No return address here on purpose. A URL a caller can choose is a URL an
     attacker can choose, and this one is handed to a third party to redirect
     to. server/routes.ts builds it from the host the request arrived on,
     which is also what makes a room on adgrant.ai come back to adgrant.ai
     rather than to the other site this process serves. */
});

export const cardDoneSchema = z.object({
  checkoutSessionId: z.string().trim().min(8).max(200),
});

export const exchangeConsentSchema = z.object({
  agree: z.boolean(),
  /* What the browser had on screen. Sent back so the number a person saw is
     the number that binds, even if the default here changes tomorrow. */
  turnsShown: z.number().int().min(1).max(50).optional(),
});

export interface BillingView {
  /** False on a fork with no Stripe keys: the feature is not offered at all. */
  configured: boolean;
  card: { brand: string | null; last4: string | null; addedAt: string | null } | null;
  exchange: {
    allowed: boolean;
    /** Null until somebody agrees. Then it is the number they were shown. */
    turnsAgreed: number | null;
    turnsLeft: number;
    agreedBy: string | null;
    agreedAt: string | null;
    /** What the button would ask for if pressed now. */
    turnsOnOffer: number;
    disclosure: string;
    /** Why not, in a sentence, when it is not allowed. */
    line: string | null;
  };
}

export async function billingView(workspaceId: string): Promise<BillingView> {
  const row = await billingFor(workspaceId);
  const verdict = await mayAgentsAnswerEachOther(workspaceId);
  return {
    configured: stripeConfigured(),
    card: row.paymentMethodId
      ? { brand: row.cardBrand, last4: row.cardLast4, addedAt: row.cardAddedAt }
      : null,
    exchange: {
      allowed: verdict.allowed,
      turnsAgreed: row.agentExchangeTurns,
      turnsLeft: verdict.allowed ? verdict.turnsLeft : 0,
      agreedBy: row.agentExchangeConsentBy,
      agreedAt: row.agentExchangeConsentAt,
      turnsOnOffer: DEFAULT_EXCHANGE_TURNS,
      disclosure: EXCHANGE_DISCLOSURE,
      line: verdict.allowed ? null : verdict.line,
    },
  };
}

export type BillingResult<T> = { ok: true; body: T } | { ok: false; status: number; error: string };

/**
 * Opens the Stripe page where the card is typed in.
 *
 * NO CARD FIELD IS EVER RENDERED BY THIS APPLICATION. The person leaves for
 * Stripe's own domain and comes back with a session id, which is the whole of
 * what this process learns.
 */
export async function startCardSetup(
  input: { workspaceId: string; name?: string; email?: string; returnUrl: string },
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<BillingResult<{ url: string }>> {
  if (!stripeConfigured()) return { ok: false, status: 501, error: STRIPE_UNCONFIGURED_LINE };
  const row = await billingFor(input.workspaceId);
  let customerId = row.customerId;
  if (!customerId) {
    const made = await createCustomer(
      { workspaceId: input.workspaceId, name: input.name ?? null, email: input.email ?? null },
      deps.fetchImpl ?? fetch,
    );
    if (!made.ok) return { ok: false, status: 502, error: made.line };
    customerId = made.body.id;
    await rememberCustomer(input.workspaceId, customerId);
  }
  const back = new URL(input.returnUrl);
  back.searchParams.set("card", "done");
  const cancel = new URL(input.returnUrl);
  cancel.searchParams.set("card", "cancelled");
  const session = await createCheckoutSetupSession(
    {
      customerId,
      /* Stripe substitutes the id into this placeholder, so it must not be
         encoded. URL.toString() leaves the braces alone. */
      successUrl: `${back.toString()}&session={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancel.toString(),
    },
    deps.fetchImpl ?? fetch,
  );
  if (!session.ok) return { ok: false, status: 502, error: session.line };
  if (!session.body.url) return { ok: false, status: 502, error: "The card page could not be opened." };
  return { ok: true, body: { url: session.body.url } };
}

/**
 * The browser comes back saying the card is attached; Stripe is asked whether
 * that is true.
 *
 * Three checks, all of which matter: the session has to be COMPLETE, it has to
 * be a SETUP session rather than anything that took money, and it has to belong
 * to THIS room's customer. Without the last, a session id from another room —
 * they travel in URLs and are not secret — would attach somebody else's card
 * here, and the room would then have a card its owner never put there.
 */
export async function finishCardSetup(
  input: { workspaceId: string; checkoutSessionId: string },
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<BillingResult<BillingView>> {
  if (!stripeConfigured()) return { ok: false, status: 501, error: STRIPE_UNCONFIGURED_LINE };
  const row = await billingFor(input.workspaceId);
  if (!row.customerId) {
    return { ok: false, status: 409, error: "This room has not started attaching a card." };
  }
  const session = await getCheckoutSession(input.checkoutSessionId, deps.fetchImpl ?? fetch);
  if (!session.ok) return { ok: false, status: 502, error: session.line };
  if (session.body.customer !== row.customerId) {
    return { ok: false, status: 403, error: "That card was not attached to this room." };
  }
  if (session.body.mode !== "setup" || session.body.status !== "complete") {
    return { ok: false, status: 409, error: "That card has not finished being attached." };
  }
  const setupIntentId = session.body.setup_intent;
  if (!setupIntentId) {
    return { ok: false, status: 409, error: "That card has not finished being attached." };
  }
  const intent = await getSetupIntent(setupIntentId, deps.fetchImpl ?? fetch);
  if (!intent.ok) return { ok: false, status: 502, error: intent.line };
  const paymentMethodId = intent.body.payment_method;
  if (intent.body.status !== "succeeded" || !paymentMethodId) {
    return { ok: false, status: 409, error: "That card has not finished being attached." };
  }
  const method = await getPaymentMethod(paymentMethodId, deps.fetchImpl ?? fetch);
  if (!method.ok) return { ok: false, status: 502, error: method.line };
  await rememberCard(input.workspaceId, {
    paymentMethodId,
    brand: method.body.card?.brand ?? null,
    last4: method.body.card?.last4 ?? null,
  });
  return { ok: true, body: await billingView(input.workspaceId) };
}

/**
 * Yes or no to agents answering each other.
 *
 * Saying no withdraws the consent and leaves the card alone: a person who
 * stops an exchange has not asked to have their card forgotten.
 */
export async function setExchangeConsent(
  input: { workspaceId: string; agree: boolean; turnsShown?: number; by: string },
): Promise<BillingResult<BillingView>> {
  if (!input.agree) {
    await withdrawExchangeConsent(input.workspaceId);
    return { ok: true, body: await billingView(input.workspaceId) };
  }
  const row = await billingFor(input.workspaceId);
  if (!row.paymentMethodId) {
    return {
      ok: false,
      status: 409,
      error: "There is no card on this room yet, so there is nothing to bill these turns to.",
    };
  }
  await recordExchangeConsent(input.workspaceId, {
    turnsShown: input.turnsShown ?? DEFAULT_EXCHANGE_TURNS,
    by: input.by,
  });
  return { ok: true, body: await billingView(input.workspaceId) };
}
