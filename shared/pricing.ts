import { LINKEDIN_REVIEW_OPEN } from "./linkedin-review";

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
 * long version is the last section of private/pricing-spec.md.
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
 * The rows, by name — except `partner`, WHICH NAMES NO ROW.
 *
 * The rule from private/doors.md still holds: whoever sets the price is the seller
 * of the work, so this site cannot publish a figure for a door another company
 * contracts and invoices. What changed is how that is honoured. It used to be a
 * row carrying no figure, which said out loud that we take no share and publish
 * nothing — and the owner cut it: "вот єту строку я бі тоже вообще убрал".
 *
 * He is right, and the version without it is the stronger one. That row was a
 * pre-emptive answer to an accusation nobody had made, on a page a visitor
 * reaches before they have seen anything. The offer it sat next to is another
 * company's; a buyer who wants its price asks that company, the way they would
 * anywhere else. Explaining the absence drew a line under it.
 *
 * So `partner` stays in this union — the door is really sold on a tier, and
 * typing it as one keeps doors.ts honest about which — and PRICE_BY_ID simply
 * has no entry for it. `priceForDoor` returns null there and the door page
 * renders no price section at all. That is a structural guarantee rather than a
 * sentence: there is no figure to leak because there is no row to hold one.
 */
export type PriceTierId =
  | "audit"
  | "task"
  | "support"
  | "setup"
  | "management"
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
   * which is the private/doors.md rule expressed as data rather than as care.
   */
  ours: boolean;
}

/**
 * The ladder, in the order the owner's specification writes it. Order is a
 * presentation decision the owner already made; this file does not re-make it.
 */
/*
 * TWO ROWS WERE CUT ON THE OWNER'S INSTRUCTION, and both cuts made the ladder
 * say more rather than less.
 *
 * "+$49 / month" was an add-on for boosters on top-voice.ai or warmlike.com,
 * and it could not be bought alone — the plus sign said so and the condition
 * line said so again. A rung nobody can stand on is not a rung. "from $49 per
 * task" already tells a reader what the cheapest real commitment here is, which
 * is the only job the row was doing. Its tier is gone from PriceTierId too: no
 * door was ever sold on it.
 *
 * The partner row is the other one, and the note on PriceTierId has that story.
 *
 * What is left is seven rows a buyer can actually be on.
 */
export const PRICES: PriceRow[] = [
  {
    /*
     * FIRST, AND FREE, AND IT IS THE ONE THAT LEADS.
     *
     * Advertisers switched their accounts over to the platforms' own automation
     * and to agents they added themselves, and are now living with what those
     * did. Fixing that is what the whole market is doing this year, us included,
     * and it is the most honest front door we have: it starts by looking rather
     * than by selling, and what it finds is either a problem we can name or a
     * clean account, which is worth knowing either way.
     *
     * Free with no condition attached and no card, because a condition on a free
     * audit is what makes people distrust free audits.
     */
    id: "audit",
    price: "free",
    buys: "An expert read of your paid ads accounts, by a person.",
    condition: "No card, no signup, and no obligation after it. You get what we found, whether or not you want us to fix it.",
    ours: true,
  },
  {
    id: "ownKeys",
    price: "free",
    /* "LinkedIn content autopilot" names the withheld work; the AI agents
       are the half of this row that is not about LinkedIn at all. */
    buys: LINKEDIN_REVIEW_OPEN ? "The AI agents." : "LinkedIn content autopilot, and the AI agents.",
    /*
     * SECOND ON THE LADDER, beside the other free row, on the owner's
     * instruction. Two rows that cost nothing standing together is the
     * strongest thing this table says, and having them at opposite ends of it
     * made a reader work for the fact.
     *
     * "LinkedIn CONTENT AUTOPILOT" is the corrected wording, and the word
     * matters more than it looks. Publishing a post on behalf of a member is an
     * OPEN permission on LinkedIn's own API — `w_member_social`, "required to
     * create a LinkedIn post on behalf of the authenticated member", and
     * LinkedIn's access page says open permissions are the only ones available
     * to all developers without special approval. So this row is white, on the
     * official API, with the member's own OAuth consent, exactly as every
     * scheduling tool works.
     *
     * WHERE THE GREY BEGINS IS ENGAGEMENT, NOT PUBLISHING: reactions,
     * invitations, messages and profile views are restricted permissions behind
     * a partner programme. That is the whole reason the reaction engine sits on
     * the partner's row and this does not, and it is why the two must never be
     * described in one sentence.
     *
     * Every clause below is doing work, and dropping any of them makes the row
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
    buys: LINKEDIN_REVIEW_OPEN
      ? "Content-generation support."
      : "Content-generation support, or boosting support for top-voice.ai or warmlike.com.",
    condition: "Run by us, on our own accounts.",
    ours: true,
  },
  {
    id: "setup",
    price: "$99",
    buys: "One conversion-tracking setup, or one month of managing one Google Ad Grant account.",
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
    id: "custom",
    price: "custom",
    buys: "Everything else.",
    condition: "A figure comes from a person after the call.",
    ours: true,
  },
];

/** Partial on purpose: `partner` has no row. See the note on PriceTierId. */
export const PRICE_BY_ID: Partial<Record<PriceTierId, PriceRow>> = Object.fromEntries(
  PRICES.map((row) => [row.id, row]),
) as Partial<Record<PriceTierId, PriceRow>>;

/**
 * The row a door shows, and it shows this one only.
 *
 * Typed structurally rather than against DoorDef on purpose: shared/doors.ts
 * imports this module for its `priceTier` column, so importing DoorDef back
 * would make the two files circular. It also means this function is the whole
 * of "a door shows its own tier" — a door page that calls it cannot render a
 * neighbour's row, because it never has more than one row in its hands.
 */
export function priceForDoor(door: { priceTier: PriceTierId }): PriceRow | null {
  return PRICE_BY_ID[door.priceTier] ?? null;
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
