/**
 * The promo may only say what the site already says.
 *
 *   npx tsx --test scripts/promo/copy.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { STATS } from "../../shared/adgrant";
import { DOORS, VISIBLE_DOORS } from "../../shared/doors";
import { currencyFigures, PRICES, PUBLISHED_FIGURES } from "../../shared/pricing";

import {
  ACCOUNTS_PROCESSED,
  allOnScreenText,
  DISPLAY_NAME,
  DOOR_HEADLINES,
  DURATION_MS,
  PRICE_ROWS,
  ROOM_LINES,
  SCENES,
  wordsHtml,
} from "./copy";
import { siteHtml } from "./site-html";
import { showExpression } from "./timeline";
import { upworkHtml } from "./upwork-html";

test("words are wrapped so a collapsed space glyph cannot join them", () => {
  assert.equal(
    wordsHtml("Ask a question."),
    '<span class="w">Ask</span><span class="w">a</span><span class="w">question.</span>',
  );
});

test("the clock stays under the 60-second Catalog cap", () => {
  assert.ok(DURATION_MS <= 60_000);
  assert.ok(DURATION_MS >= 30_000);
});

test("every door on screen is a visible door, and no hidden door is named", () => {
  assert.deepEqual(
    DOOR_HEADLINES,
    VISIBLE_DOORS.map((door) => door.headline),
  );
  for (const door of DOORS.filter((row) => row.hidden)) {
    assert.ok(
      !DOOR_HEADLINES.includes(door.headline),
      `hidden door still on screen: ${door.headline}`,
    );
  }
});

test("every price on screen is a published row, word for word, with its condition", () => {
  assert.deepEqual(
    PRICE_ROWS,
    PRICES.map((row) => ({
      price: row.price,
      buys: row.buys,
      condition: row.condition ?? "",
    })),
  );
});

test("the room lines are the words the site already prints", () => {
  assert.equal(ROOM_LINES[0], "Ask a question.");
  assert.ok(ROOM_LINES[1].includes("cites the page it used"));
  assert.equal(ROOM_LINES[2], "Nothing is saved yet.");
});

test("both films contain every scene and start on the first", () => {
  for (const html of [siteHtml(), upworkHtml()]) {
    for (const scene of SCENES) {
      assert.ok(html.includes(`data-scene="${scene.id}"`), `missing scene ${scene.id}`);
    }
    assert.match(html, /data-scene="open" class="on"/);
    assert.ok(html.includes("window.__PROMO"));
    assert.ok(html.includes("show: function"));
  }
});

test("Node can name a beat without inventing a scene", () => {
  assert.equal(showExpression("open", "light"), 'window.__PROMO.show("open", "light")');
  assert.ok(SCENES[SCENES.length - 1]!.at * 1000 < DURATION_MS);
});

test("the measured Ad Grant count is STATS, not a typed figure", () => {
  assert.equal(ACCOUNTS_PROCESSED, STATS.accountsProcessed);
});

test("no currency figure appears that the ladder does not publish", () => {
  for (const figure of currencyFigures(allOnScreenText())) {
    assert.ok(PUBLISHED_FIGURES.includes(figure), `unpublished figure: ${figure}`);
  }
});

test("the copy has no exclamation mark and names us, not a client", () => {
  const text = allOnScreenText();
  assert.ok(!text.includes("!"));
  assert.ok(text.includes(DISPLAY_NAME));
});

test("the generated HTML prints the condition that makes a free row true", () => {
  const ownKeys = PRICES.find((row) => row.id === "ownKeys");
  assert.ok(ownKeys);
  assert.ok(ownKeys.condition);
  const rendered = wordsHtml(ownKeys.condition);
  for (const html of [siteHtml(), upworkHtml()]) {
    assert.ok(html.includes(rendered), "own-keys condition missing from HTML");
  }
});

test("generated HTML uses token names, never a hex colour", () => {
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  for (const [name, html] of [
    ["site", siteHtml()],
    ["upwork", upworkHtml()],
  ] as const) {
    assert.ok(!hex.test(html), `${name} HTML contains a hex colour`);
    assert.ok(html.includes("hsl(var(--background))") || html.includes("--green-700"));
  }
});
