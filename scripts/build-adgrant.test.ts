/**
 * Holds the generated AdGrant library to the six corrections and the strip
 * of unsourced percentages. A refetch that puts the original wording back
 * turns these red.
 *
 *   npx tsx --test scripts/build-adgrant.test.ts
 *
 * `npm test` globs server test files. This file lives next to the script
 * that writes the library, which this parcel owns; adding it to that glob is
 * a one-line change in package.json and is a handoff, not this parcel's.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { PAGE_BY_SLUG, PAGES, STATS, TEMPLATES } from "@shared/adgrant";
import {
  applyCorrections,
  STRIPPED_PATTERNS,
  STRIPPED_PHRASES,
  WRONG_WORDING,
} from "./build-adgrant.ts";

test("the generated module parses, and every page has a slug and a body", () => {
  assert.ok(Array.isArray(PAGES), "PAGES is missing");
  assert.equal(PAGES.length, 23);
  for (const page of PAGES) {
    assert.ok(page.slug, "a page is missing its slug");
    assert.ok(page.bodyMarkdown.trim(), `${page.slug} has no body`);
    assert.ok(PAGE_BY_SLUG[page.slug], `${page.slug} is not in PAGE_BY_SLUG`);
  }
});

test("STATS is the measured figure from /api/templates/stats, and the templates are there", () => {
  assert.equal(STATS.accountsProcessed, 4539);
  assert.equal(STATS.totals.campaigns, 16575);
  assert.equal(STATS.totals.keywords, 3142469);
  assert.equal(STATS.campaignsPerAccount.median, 1);
  assert.equal(STATS.adGroupsPerCampaign.median, 3);
  assert.equal(STATS.keywordsPerAdGroup.median, 9);
  assert.equal(TEMPLATES.length, 12);
});

test("no page contains any of the stripped phrases", () => {
  for (const page of PAGES) {
    const haystack = `${page.title}\n${page.excerpt ?? ""}\n${page.metaDescription ?? ""}\n${page.bodyMarkdown}`;
    for (const phrase of STRIPPED_PHRASES) {
      assert.ok(
        !haystack.includes(phrase),
        `${page.category}/${page.slug} still contains "${phrase}"`,
      );
    }
    for (const pattern of STRIPPED_PATTERNS) {
      assert.ok(
        !pattern.test(haystack),
        `${page.category}/${page.slug} still matches ${pattern}`,
      );
    }
  }
});

test("1. CTR deactivation is after two consecutive months, not one", () => {
  const page = PAGE_BY_SLUG["avoid-account-suspension-google-ad-grant-5-percent-ctr-rule"];
  assert.ok(page, "the 5% CTR tricks page is missing");
  assert.ok(
    !WRONG_WORDING.ctrOneMonth.test(page.bodyMarkdown),
    "the one-month deactivation wording came back",
  );
  assert.match(page.bodyMarkdown, /two consecutive months/);
  assert.ok(
    page.corrections.some((item) => item.against.includes("answer/117827")),
    "the CTR correction does not name the Google page that contradicts it",
  );
});

test("2. $10,000 ÷ $2 ÷ 30 is 166.7 clicks a day, not 329", () => {
  const page = PAGE_BY_SLUG["avoid-account-suspension-google-ad-grant-5-percent-ctr-rule"];
  assert.ok(page);
  assert.ok(!WRONG_WORDING.clicks329.test(page.bodyMarkdown), "329 clicks/day came back");
  assert.ok(!WRONG_WORDING.impressions6580.test(page.bodyMarkdown), "6,580 impressions came back");
  assert.match(page.bodyMarkdown, /166\.7 clicks a day/);
  assert.match(page.bodyMarkdown, /3,334 impressions daily/);
  assert.match(page.bodyMarkdown, /daily dollar budget is about \$329/);
});

test("3. two ads per ad group ended 30 June 2022; two ad groups per campaign remain", () => {
  const avoid = PAGE_BY_SLUG["avoid-account-suspension-google-ad-grant-5-percent-ctr-rule"];
  const recover = PAGE_BY_SLUG["recover-suspended-google-ad-grant-account"];
  assert.ok(avoid && recover);
  for (const page of [avoid, recover]) {
    assert.ok(
      !WRONG_WORDING.twoAdsRequired.test(page.bodyMarkdown),
      `${page.slug} still says Google requires at least 2 ads`,
    );
    assert.match(page.bodyMarkdown, /30 June 2022/);
    assert.match(page.bodyMarkdown, /two ad groups/i);
  }
});

test("4. the remarketing list minimum was never 500", () => {
  const page = PAGE_BY_SLUG["collect-remarketing-audiences-google-ad-grant"];
  assert.ok(page);
  assert.ok(!WRONG_WORDING.remarketing500.test(page.bodyMarkdown), "500+ users minimum came back");
  assert.ok(!WRONG_WORDING.remarketing500list.test(page.bodyMarkdown), "requires 500 users came back");
  assert.match(page.bodyMarkdown, /100 active users in the last 30 days/);
  assert.match(page.bodyMarkdown, /never 500/);
  assert.ok(page.corrections.some((item) => item.against.includes("answer/7476585")));
});

test("5. Ad Rank has no published formula and does not name Quality Score", () => {
  const page = PAGE_BY_SLUG["ad-rank-google-ad-grant"];
  assert.ok(page);
  assert.ok(!WRONG_WORDING.adRankFormula.test(page.bodyMarkdown), "Bid $2 x Quality Score 7 came back");
  assert.match(page.bodyMarkdown, /no Ad Rank formula/);
  assert.match(page.bodyMarkdown, /does not name Quality Score as a factor/);
  assert.ok(page.corrections.some((item) => item.against.includes("answer/1752122")));
});

test("6. the website policies link is nonprofits/answer/1657899", () => {
  const page = PAGE_BY_SLUG["add-verify-additional-domains-google-ad-grant"];
  assert.ok(page);
  assert.ok(
    !WRONG_WORDING.deadWebsitePolicy.test(page.bodyMarkdown),
    "the dead grants/answer/2454026 link came back",
  );
  assert.match(page.bodyMarkdown, /support\.google\.com\/nonprofits\/answer\/1657899/);
});

test("a refetch of the original wrong wording is corrected before it can ship", () => {
  const original = [
    "If your CTR drops below 5% for even one month, Google may suspend the account, and recovery can be a long, frustrating process",
    "That's about 329 clicks/day ($10,000 ÷ $2 max CPC ÷ 30 days). To maintain 5% CTR, you need these numbers to make sense:",
    "**Daily Impressions**: You need at least 6,580 impressions daily (because 329 clicks ÷ 6,580 impressions = 5%)",
    "Test multiple ads per ad group (Google requires at least 2) to see what drives more clicks.",
    "Once your audiences have 500+ users (the minimum Google requires)",
    "Your Ad Rank might be around 14 (Bid $2 x Quality Score 7)",
    "https://support.google.com/grants/answer/2454026",
    "I've managed over 600 accounts and seen how fast",
    "broad match keywords consistently drive 30-50% of incremental clicks when paired with smart account management",
  ].join("\n");

  const { body, corrections } = applyCorrections(original);
  for (const wrong of Object.values(WRONG_WORDING)) {
    assert.ok(!wrong.test(body), `correction missed ${wrong}`);
  }
  for (const pattern of STRIPPED_PATTERNS) {
    assert.ok(!pattern.test(body), `strip missed ${pattern}`);
  }
  assert.match(body, /two consecutive months/);
  assert.match(body, /166\.7 clicks a day/);
  assert.match(body, /3,334 impressions daily/);
  assert.match(body, /30 June 2022/);
  assert.match(body, /100 active users/);
  assert.match(body, /support\.google\.com\/nonprofits\/answer\/1657899/);
  assert.ok(corrections.length >= 6, `expected six corrections, got ${corrections.length}`);
});
