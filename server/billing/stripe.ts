/**
 * The card, and nothing else.
 *
 * This file can do exactly three things: find or make a Stripe Customer for a
 * room, open a Stripe-hosted page where a card is attached WITHOUT being
 * charged, and read back which card was attached. It cannot charge. Charging
 * is a separate decision with its own consent, and a file that can only save a
 * card cannot accidentally take money.
 *
 * NO CARD NUMBER EVER REACHES THIS PROCESS. The browser talks to Stripe
 * directly with the publishable key; what comes back here is an id, a brand
 * and four digits.
 *
 * Inert without STRIPE_SECRET_KEY, which is how a fork behaves: no card, no
 * consent, and therefore no exchange between agents — the feature is simply
 * not offered rather than half-offered.
 */

const API = "https://api.stripe.com/v1";
const REQUEST_MS = 12_000;

export const STRIPE_UNCONFIGURED_LINE =
  "Card payments are not set up on this deployment.";

/**
 * What a person is told when the key is wrong or lacks a permission.
 *
 * NOT Stripe's own sentence, which is the one exception to the rule below it:
 * on a 401 or 403 Stripe names the key in the message — "The provided key
 * 'rk_live_51UG…' does not have the required permissions" — and that message
 * was going straight into a browser. It is also useless to the person reading
 * it, who cannot fix a deployment's key. The detail is logged for us instead.
 */
export const STRIPE_NOT_PERMITTED_LINE =
  "Cards are not set up correctly on this deployment, so that could not be done. Nothing was charged.";

/** Any Stripe key, in any mode, restricted or not. */
const KEY_SHAPED = /\b[a-z]{2}_(live|test)_[A-Za-z0-9]+/;

export function stripeSecretKey(): string | null {
  const raw = process.env.STRIPE_SECRET_KEY?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function stripePublishableKey(): string | null {
  const raw = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function stripeConfigured(): boolean {
  return Boolean(stripeSecretKey() && stripePublishableKey());
}

export type StripeResult<T> = { ok: true; body: T } | { ok: false; line: string; status: number };

function form(params: Record<string, string | undefined>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") body.set(key, value);
  }
  return body.toString();
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: string },
  fetchImpl: typeof fetch,
): Promise<StripeResult<T>> {
  const key = stripeSecretKey();
  if (!key) return { ok: false, line: STRIPE_UNCONFIGURED_LINE, status: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_MS);
  try {
    const res = await fetchImpl(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: init.body,
      signal: controller.signal,
    });
    const text = await res.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const record = parsed as { error?: { message?: string } } | null;
      const message = record?.error?.message ?? "";
      /* A key problem is ours, not the reader's: they cannot act on it, and
         Stripe's sentence for it carries the key. Log it where we will see it
         and hand back one that is safe to print. */
      if (res.status === 401 || res.status === 403 || KEY_SHAPED.test(message)) {
        console.error(`[stripe] ${res.status} on ${path}: ${message.replace(KEY_SHAPED, "<key>")}`);
        return { ok: false, line: STRIPE_NOT_PERMITTED_LINE, status: res.status };
      }
      /* Otherwise Stripe's own sentence, which says what is wrong far better
         than a generic one — a declined card, an expired session. */
      return { ok: false, line: message || "The card service refused that.", status: res.status };
    }
    return { ok: true, body: parsed as T };
  } catch {
    return { ok: false, line: "The card service could not be reached.", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export interface StripeCustomer {
  id: string;
}

/** A customer for this room. `metadata.workspace_id` is how it is found again. */
export async function createCustomer(
  input: { workspaceId: string; email?: string | null; name?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<StripeResult<StripeCustomer>> {
  return call<StripeCustomer>(
    "/customers",
    {
      method: "POST",
      body: form({
        email: input.email ?? undefined,
        name: input.name ?? undefined,
        "metadata[workspace_id]": input.workspaceId,
      }),
    },
    fetchImpl,
  );
}

export interface StripeSetupIntent {
  id: string;
  client_secret: string;
  status: string;
  payment_method?: string | null;
  /* Read back on purpose: a SetupIntent id handed in by a browser is only
     this room's if it belongs to this room's customer. */
  customer?: string | null;
}

export async function getSetupIntent(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StripeResult<StripeSetupIntent>> {
  return call<StripeSetupIntent>(`/setup_intents/${encodeURIComponent(id)}`, { method: "GET" }, fetchImpl);
}

export interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  mode?: string;
  status?: string;
  customer?: string | null;
  setup_intent?: string | null;
}

/**
 * A page on Stripe's own domain where a card is typed in.
 *
 * `mode=setup` is hard-coded and there is no parameter that could make it
 * anything else. A setup session has no line items and no amount; it cannot
 * take money even if somebody calls this with the wrong intent. It is also
 * why there are no card fields anywhere in this repository.
 */
export async function createCheckoutSetupSession(
  input: { customerId: string; successUrl: string; cancelUrl: string },
  fetchImpl: typeof fetch = fetch,
): Promise<StripeResult<StripeCheckoutSession>> {
  return call<StripeCheckoutSession>(
    "/checkout/sessions",
    {
      method: "POST",
      body: form({
        mode: "setup",
        customer: input.customerId,
        "payment_method_types[0]": "card",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }),
    },
    fetchImpl,
  );
}

export async function getCheckoutSession(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StripeResult<StripeCheckoutSession>> {
  return call<StripeCheckoutSession>(`/checkout/sessions/${encodeURIComponent(id)}`, { method: "GET" }, fetchImpl);
}

export interface StripePaymentMethod {
  id: string;
  card?: { brand?: string; last4?: string };
}

export async function getPaymentMethod(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StripeResult<StripePaymentMethod>> {
  return call<StripePaymentMethod>(`/payment_methods/${encodeURIComponent(id)}`, { method: "GET" }, fetchImpl);
}
