/**
 * Every word the promo puts on screen, read from the same modules the site
 * reads. A price, a door name or a measured count that is typed here by hand
 * is a sentence that will go stale the day the row changes.
 *
 * Hidden doors stay out: VISIBLE_DOORS is the list a visitor is allowed to see
 * while the LinkedIn application is under review.
 */
import { STATS } from "../../shared/adgrant";
import { VISIBLE_DOORS } from "../../shared/doors";
import { PRICES } from "../../shared/pricing";

/** Home headline, same two lines as client/src/components/site/home/FirstScreen.tsx. */
export const HEADLINE_LINES = ["Hire a hybrid team", "for your business."] as const;

/** Home mechanism line, same words as FirstScreen (sentence case on "experts"). */
export const MECHANISM = "Digital experts + any AI agents in one room.";

export const DISPLAY_NAME = "Top-Rated Team";
export const ADDRESS = "top-rated.team";

export const DOOR_HEADLINES: readonly string[] = VISIBLE_DOORS.map((door) => door.headline);

export const PRICE_ROWS: readonly { price: string; buys: string; condition: string }[] = PRICES.map((row) => ({
  price: row.price,
  buys: row.buys,
  condition: row.condition ?? "",
}));

export const ACCOUNTS_PROCESSED = STATS.accountsProcessed;
export const ACCOUNTS_LABEL = "Ad Grant accounts processed";
export const ACCOUNTS_NOTE = "Measured from the accounts themselves.";

/**
 * What the room actually prints, in the words already on the door and in the
 * house ask. No reply-time, no result, no "and we upload it for you".
 */
export const ROOM_LINES = [
  "Ask a question.",
  "The answer cites the page it used.",
  "Nothing is saved yet.",
] as const;

export const WORK_LABEL = "The work";
export const PRICE_LABEL = "What it costs";

/** Six scenes, 45 seconds. Under the 60-second Catalog cap. */
export const DURATION_MS = 45_000;

export type SceneId = "open" | "doors" | "prices" | "stats" | "room" | "close";
export type SceneTheme = "light" | "dark";

export interface SceneBeat {
  id: SceneId;
  theme: SceneTheme;
  /** Seconds from the start. */
  at: number;
}

export const SCENES: readonly SceneBeat[] = [
  { id: "open", theme: "light", at: 0 },
  { id: "doors", theme: "light", at: 7 },
  { id: "prices", theme: "light", at: 15 },
  { id: "stats", theme: "dark", at: 27 },
  { id: "room", theme: "dark", at: 34 },
  { id: "close", theme: "dark", at: 40 },
];

/** Every character that appears on screen, for tests that police claims. */
export function allOnScreenText(): string {
  return [
    ...HEADLINE_LINES,
    MECHANISM,
    DISPLAY_NAME,
    ADDRESS,
    ...DOOR_HEADLINES,
    ...PRICE_ROWS.flatMap((row) => [row.price, row.buys, row.condition]),
    String(ACCOUNTS_PROCESSED),
    ACCOUNTS_LABEL,
    ACCOUNTS_NOTE,
    ...ROOM_LINES,
    WORK_LABEL,
    PRICE_LABEL,
  ].join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Headless Chrome plus some web fonts collapse the space glyph to nothing,
 * so a sentence reads as one word. Each word is its own inline-block with
 * a margin; the gap does not depend on the space character.
 */
export function wordsHtml(value: string): string {
  return escapeHtml(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `<span class="w">${word}</span>`)
    .join("");
}
