/**
 * What one agent turn cost, in dollars.
 *
 * The tokens themselves come off the wire: `stream_options: { include_usage: true }`
 * makes the API send one extra final chunk carrying `prompt_tokens` and
 * `completion_tokens`, and server/ai/agentRuntime.ts forwards it to the caller as
 * `AgentStreamChunk.usage`. Nothing here estimates a token count — before that
 * chunk existed there was no honest number to log, and a cost log built from
 * `text.length / 4` would have been a number nobody could act on.
 *
 * The model id on that usage is the one the request was actually opened with, not
 * the configured one. They differ exactly when the configured model comes back 404
 * for this key and openStream() falls back to gpt-4o-mini, which is a sixth of the
 * price — the one case where reading the model from configuration would put a wrong
 * figure in the ledger.
 */

/** One turn's token counts, and the model that produced them. */
export interface TokenUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

interface ModelPrice {
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
}

/**
 * List prices in USD per million tokens, for the models this server can actually
 * open a stream with: the default (`gpt-5-mini`), the 404 fallback
 * (`gpt-4o-mini`), and the two full-size ids a deployment might reasonably set
 * `OPENAI_CHAT_MODEL` to.
 *
 * These are published prices copied by hand, so they are a statement about what
 * OpenAI charged when this was written and not something the code can verify.
 * They decide when a room is paused, and nothing else — no invoice is produced
 * from them. A price that has moved makes the pause arrive early or late, which
 * is why the budget is a backstop and the turn count and the clock are not
 * priced at all.
 */
const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

/**
 * What an id not in the table is charged at: the dearest input rate and the
 * dearest output rate we know of, taken separately.
 *
 * Deliberately not zero. An unpriced model billed at nothing would spend without
 * ever moving the budget, and a budget that cannot trip is the exact failure this
 * whole parcel exists to prevent. Over-charging an unknown model pauses a room
 * early, which is visible, argued about, and fixed by adding a row above.
 * Under-charging it is silent.
 */
const UNKNOWN_MODEL_PRICE: ModelPrice = {
  inputPerMillion: Math.max(...Object.values(MODEL_PRICES).map((price) => price.inputPerMillion)),
  outputPerMillion: Math.max(...Object.values(MODEL_PRICES).map((price) => price.outputPerMillion)),
};

/** One line per unpriced id per process, rather than one per turn. */
const warnedModels = new Set<string>();

/**
 * Exact id first, then the longest table key the id starts with, so a pinned
 * snapshot is priced as its family: `gpt-5-mini-2025-08-07` matches `gpt-5-mini`
 * rather than `gpt-5`, because the longer key wins.
 */
export function priceFor(model: string): ModelPrice {
  const id = model.trim().toLowerCase();
  const exact = MODEL_PRICES[id];
  if (exact) return exact;

  let bestKey = "";
  for (const key of Object.keys(MODEL_PRICES)) {
    if (id.startsWith(key) && key.length > bestKey.length) bestKey = key;
  }
  if (bestKey) return MODEL_PRICES[bestKey];

  if (!warnedModels.has(id)) {
    warnedModels.add(id);
    console.warn(
      `[spend] no published price for model "${model}" — charging it at the dearest rate in the table ` +
        `($${UNKNOWN_MODEL_PRICE.inputPerMillion}/$${UNKNOWN_MODEL_PRICE.outputPerMillion} per 1M in/out), ` +
        "so this room's budget will trip early. Add the real price to server/ai/usage.ts.",
    );
  }
  return UNKNOWN_MODEL_PRICE;
}

/** Clamps whatever the API sent to a countable number of tokens. */
function tokens(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** What this turn cost, in dollars. Not rounded: a turn is worth a fraction of a cent. */
export function costUsd(usage: TokenUsage): number {
  const price = priceFor(usage.model);
  return (
    (tokens(usage.promptTokens) * price.inputPerMillion) / 1_000_000 +
    (tokens(usage.completionTokens) * price.outputPerMillion) / 1_000_000
  );
}

/**
 * Six decimal places, because a turn on the default model costs about $0.003 and
 * two places would print every one of them as $0.00.
 */
export function formatUsd(amount: number): string {
  return amount.toFixed(6);
}
