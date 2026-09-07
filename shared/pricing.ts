/**
 * The ladder: one row per published price, and the only place in this
 * repository where a figure is written down.
 *
 * A price that exists in two places is a price that will disagree with itself,
 * and the disagreement is always discovered by the person who paid the higher
 * one. So the rule here is narrower than "don't repeat yourself": the figure
 * lives in `price` on one row, the page renders that row, the door pages render
 * their own row, and the agents are handed the same rows as text they may quote
 * and nothing else. Nobody retypes a number, so nobody can retype it wrong.
 *
 * Shape follows shared/doors.ts and shared/roster.ts: plain data, no logic, one
 * lookup map, read by the client and the server alike.
 *
 * THREE THINGS THE OWNER'S SPECIFICATION SAYS THAT THE CODE DID NOT, and each
 * one is a sentence here rather than a note in a document nobody opens. The
 * long version is the last section of docs/pricing-spec.md.
 *
 * 1. "Unlimited hours" is true, and it is about a person. A contractor's time
 *    on a $49 task is not metered. Agent conversation IS metered — server/spend.ts
 *    bounds every room — so the word "unlimited" belongs on the human row and
 *    nowhere near the agents. `task` says it; no other row does.
 * 2. "Never pay for AI tokens" is the opposite of what the free row means. It is
 *    free BECAUSE the client pays the model provider directly for every token.
 *    `ownKeys` says that, in those words.
 * 3. Nothing here may promise that a room is unmetered. Every room is bounded
 *    today, on every row, and there is no code path that accepts a client's own
 *    key — so `ownKeys` describes an arrangement made with a person, which is
 *    what it is, rather than a switch on this site, which it is not.
 */

/**
 * The rows, by name. `partner` is the one that is not in the owner's table, and
 * the reason it exists is the rule in docs/doors.md: whoever sets the price is
 * the seller of the work. "Custom for every other door" would have this site
 * quoting for a door another company contracts and invoices, which makes us the
 * seller of it in fact whatever the footer says — so that door gets a row
 * carrying no figure instead of being swept into `custom`.
 */
export type PriceTierId =
  | "task"
  | "support"
  | "setup"
  | "management"
  | "booster"
  | "ownKeys"
  | "custom"
  | "partner";

export interface PriceRow {
  id: PriceTierId;
  /**
   * The published term, exactly as a visitor reads it and exactly as an agent
   * may repeat it. The only place a figure is written. Not every row has one:
   * "free", "custom" and the partner row are terms rather than figures, and a
   * term is still a commercial promise.
   */
  price: string;
  /** What it buys, in the words the buyer would use. One sentence. */
  buys: string;
  /**
   * The condition that makes the row true rather than merely short. Where a
   * row would otherwise read as a promise the code does not keep, this is the
   * sentence that stops it — so it is not a footnote and the page prints it
   * beside the price, not under an asterisk.
   */
  condition?: string;
  /**
   * Whether Top-Rated Team sets this price. False on the partner row and only
   * there. Read by the page to decide whether it may print a figure at all,
   * which is the docs/doors.md rule expressed as data rather than as care.
   */
  ours: boolean;
}

/**
 * The ladder, in the order the owner's specification writes it. Order is a
 * presentation decision the owner already made; this file does not re-make it.
 */
export const PRICES: PriceRow[] = [
  {
    id: "task",
    price: "from $49 per task",
    buys: "A contractor dedicated to one task.",
    // The one place "not metered" is true, and it is true of a person's hours.
    // Deliberately not the word "unlimited": it is the word that got attached
    // to agent conversation, which is bounded in every room by server/spend.ts.
    condition: "Their hours on that task are not counted against you. The price is the task, not the time.",
    ours: true,
  },
  {
    id: "support",
    price: "$49 / month",
    buys: "Content-generation support, or boosting support for top-voice.ai or warmlike.com.",
    condition: "Run by us, on our own accounts.",
    ours: true,
  },
  {
    id: "setup",
    price: "$99",
    buys: "One conversion-tracking setup, or one month of managing one Google Ad Grants account.",
    // The dual meaning is the owner's, and it is the row most likely to be
    // misread, so the page says which of the two applies rather than leaving a
    // visitor to guess from a slash.
    condition: "One setup, once — or one month of one grant account. The door you came through says which.",
    ours: true,
  },
  {
    id: "management",
    price: "from $499 / month",
    buys: "Managing a paid advertising account.",
    condition: "From, because the work follows the account. The figure for yours comes from a person.",
    ours: true,
  },
  {
    id: "booster",
    price: "+$49 / month",
    buys: "Boosters for top-voice.ai or warmlike.com running on your own account or Pages.",
    // The plus sign is load-bearing: this is not a row somebody can buy alone.
    condition: "Added to one of the rows above rather than bought on its own.",
    ours: true,
  },
  {
    id: "ownKeys",
    price: "free",
    buys: "Content campaigns, autopilot and the AI agents.",
    /*
     * Every clause here is doing work, and dropping any of them makes the row
     * untrue:
     *
     * - "on your own keys" is the condition the whole row rests on. Free is not
     *   a gift; it is the model bill moving from us to the client.
     * - "we take no margin" is the true version of "never pay for AI tokens",
     *   which said the opposite of what this row means.
     * - the last sentence is there because there is NO code in this repository
     *   that accepts somebody else's key, and every room is metered by
     *   server/spend.ts regardless of the row. Saying the conversation is
     *   unmetered here would be the one sentence on this page that the code
     *   contradicts outright.
     */
    condition:
      "Free on your own Anthropic or OpenAI keys: you pay the model provider directly for every token and we take no margin on them. Rooms on this site are metered while that is being set up, and the keys are arranged with a person rather than on this page.",
    ours: true,
  },
  {
    id: "custom",
    price: "custom",
    buys: "Everything else.",
    condition: "A figure comes from a person after the call.",
    ours: true,
  },
  {
    id: "partner",
    // Not a figure, and not "custom" either — see the note on PriceTierId.
    price: "set by the company that invoices it",
    buys: "The work another company contracts, delivers and invoices.",
    condition:
      "Whoever sets the price is the seller. On this row that is not us, so this site publishes no figure for it and takes no share of it.",
    ours: false,
  },
];

export const PRICE_BY_ID: Record<PriceTierId, PriceRow> = Object.fromEntries(
  PRICES.map((row) => [row.id, row]),
) as Record<PriceTierId, PriceRow>;

/**
 * The row a door shows, and it shows this one only.
 *
 * Typed structurally rather than against DoorDef on purpose: shared/doors.ts
 * imports this module for its `priceTier` column, so importing DoorDef back
 * would make the two files circular. It also means this function is the whole
 * of "a door shows its own tier" — a door page that calls it cannot render a
 * neighbour's row, because it never has more than one row in its hands.
 */
export function priceForDoor(door: { priceTier: PriceTierId }): PriceRow {
  return PRICE_BY_ID[door.priceTier];
}

/* -------------------------------------------------------------------------- */
/* Figures, and the one guarantee that matters about them                     */
/* -------------------------------------------------------------------------- */

/**
 * A currency figure, as a pattern.
 *
 * This is the same shape server/ai/grounding.test.ts has always matched on —
 * a currency symbol followed by a number — widened to capture the whole figure
 * rather than only its first digit, so a test can compare what it found against
 * what is published instead of merely proving something was there.
 *
 * Trailing punctuation is deliberately excluded: "$49." is the figure $49 at the
 * end of a sentence, and a matcher that captured the full stop would report a
 * figure that appears nowhere.
 */
const CURRENCY_FIGURE = /[$€£]\s?\d+(?:[.,]\d+)*(?:\s?[kKmMbB])?\+?/g;

/** Every currency figure in a piece of text, in the order it appears. */
export function currencyFigures(text: string): string[] {
  return text.match(CURRENCY_FIGURE) ?? [];
}

/**
 * Every figure this site publishes, derived from the rows rather than listed
 * again. Deriving it is the point: a row whose price changes changes this set
 * with it, and a set typed by hand would be the second place a price lives.
 */
export const PUBLISHED_FIGURES: readonly string[] = Array.from(
  new Set(PRICES.flatMap((row) => currencyFigures(row.price))),
);

/**
 * The ladder as the agents receive it.
 *
 * The prices reach an agent's instructions from here and from nowhere else,
 * which is what makes the rule enforceable rather than merely stated: an agent
 * cannot quote a figure the page does not show, because the only figures in
 * front of it are the ones the page renders from these same rows.
 *
 * The rule itself belongs with the rest of the house style in shared/roster.ts.
 * This function supplies the list it operates on, and nothing else.
 */
export function publishedPricesForPrompt(): string {
  const lines = PRICES.map((row) => {
    const condition = row.condition ? ` ${row.condition}` : "";
    return `- ${row.price} — ${row.buys}${condition}`;
  });
  return `The published prices, which are the only prices that exist:\n${lines.join("\n")}`;
}
