/**
 * Generator. Run it with:
 *
 *   npx tsx --test server/adgrant/generate.test.ts
 *
 * A structure is produced from a website, checked, then counted. An unbound
 * room, a failed fetch and a policy failure are not counts. The CSV is for
 * Google Ads Editor; nothing is written into a Google Ads account.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { putBinding, resetIdentityStoreForTests } from "../identity-store";
import { policyHolds } from "./policy";
import { remainingForPerson, resetAdgrantQuotaForTests, personKeyFor } from "./quota";
import {
  CAP_REACHED_LINE,
  EDITOR_LINE,
  UNBOUND_LINE,
  buildStructureFromSite,
  generateAdGrantStructure,
  getAdGrantGenerationQuota,
  parseSiteHtml,
  structureToEditorCsv,
} from "./generate";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Hope Shelter | Beds, meals and casework</title>
  <meta name="description" content="Emergency shelter, meals and a path out of homelessness in Portland.">
</head>
<body>
  <h1>Hope Shelter</h1>
  <h2>Emergency beds tonight</h2>
  <h2>Meals and casework</h2>
  <nav>
    <a href="/about">About us</a>
    <a href="/donate">Donate</a>
    <a href="/volunteer">Volunteer</a>
    <a href="/programs">Programs</a>
    <a href="/contact">Contact</a>
  </nav>
</body>
</html>`;

const SITE_URL = "https://hopeshelter.org/";
const WORKSPACE = "ws_adgrant_generate";

function htmlResponse(html = HTML): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function bindLinkedIn(): Promise<void> {
  await putBinding({
    workspaceId: WORKSPACE,
    provider: "linkedin",
    providerId: "sub-ada-adgrant",
    displayName: "Ada",
    boundAt: "2026-09-09T10:00:00.000Z",
  });
}

beforeEach(() => {
  resetIdentityStoreForTests();
  resetAdgrantQuotaForTests();
});

describe("buildStructureFromSite", () => {
  it("produces a structure Google's rules would not suspend", () => {
    const site = parseSiteHtml(HTML, new URL(SITE_URL));
    const structure = buildStructureFromSite(site, "United States");
    assert.equal(policyHolds(structure), true);
    assert.equal(structure.smartBiddingRequired, true);
    assert.ok(structure.campaigns.length >= 2);
    for (const campaign of structure.campaigns) {
      assert.ok(campaign.adGroups.length >= 2, campaign.name);
      assert.ok(campaign.sitelinks.length >= 2, campaign.name);
      assert.deepEqual(campaign.locations, ["United States"]);
      assert.equal(campaign.bidStrategy, "MAXIMIZE_CONVERSIONS");
    }
    assert.equal(structure.authorisedDomain, "hopeshelter.org");
    assert.ok(structure.dailyBudgetUsd <= 329);
  });
});

describe("structureToEditorCsv", () => {
  it("is a Google Ads Editor file, and does not claim an upload", () => {
    const site = parseSiteHtml(HTML, new URL(SITE_URL));
    const csv = structureToEditorCsv(buildStructureFromSite(site, "Oregon"));
    assert.match(csv, /^Row Type,Campaign,/);
    assert.match(csv, /Search/);
    assert.match(csv, /Maximize conversions/);
    assert.match(csv, /Paused/);
    assert.match(csv, /Oregon/);
    assert.match(csv, /Responsive search ad/);
    assert.equal(/upload/i.test(csv), false);
    assert.equal(/customer id/i.test(csv), false);
    assert.equal(/oauth/i.test(csv), false);
    assert.match(EDITOR_LINE, /Google Ads Editor/);
    assert.equal(/upload/i.test(EDITOR_LINE), false);
  });
});

describe("generateAdGrantStructure", () => {
  it("refuses an unbound room and does not count", async () => {
    const result = await generateAdGrantStructure({
      workspaceId: WORKSPACE,
      body: { websiteUrl: SITE_URL, location: "Oregon" },
      fetcher: async () => htmlResponse(),
    });
    assert.equal(result.status, 403);
    assert.equal("error" in result.body && result.body.error, UNBOUND_LINE);
  });

  it("counts only when a structure is produced, and says how many remain", async () => {
    await bindLinkedIn();
    const fetcher: typeof fetch = async () => htmlResponse();
    const first = await generateAdGrantStructure({
      workspaceId: WORKSPACE,
      body: { websiteUrl: SITE_URL, location: "Oregon" },
      fetcher,
    });
    assert.equal(first.status, 200);
    assert.ok("structure" in first.body);
    assert.equal(first.body.remaining, 2);
    assert.equal(first.body.cap, 3);
    assert.equal(first.body.editorLine, EDITOR_LINE);
    assert.equal(policyHolds(first.body.structure), true);
    assert.match(first.body.csv, /Hope Shelter/);
    assert.match(first.body.capReason, /15,000/);

    const failed = await generateAdGrantStructure({
      workspaceId: WORKSPACE,
      body: { websiteUrl: "not-a-url", location: "Oregon" },
      fetcher,
    });
    assert.equal(failed.status, 400);
    assert.ok("remaining" in failed.body);
    assert.equal(failed.body.remaining, 2);

    const second = await generateAdGrantStructure({
      workspaceId: WORKSPACE,
      body: { websiteUrl: SITE_URL, location: "Oregon" },
      fetcher,
    });
    const third = await generateAdGrantStructure({
      workspaceId: WORKSPACE,
      body: { websiteUrl: SITE_URL, location: "Oregon" },
      fetcher,
    });
    assert.equal(second.status, 200);
    assert.equal(third.status, 200);
    assert.ok("remaining" in third.body);
    assert.equal(third.body.remaining, 0);

    const fourth = await generateAdGrantStructure({
      workspaceId: WORKSPACE,
      body: { websiteUrl: SITE_URL, location: "Oregon" },
      fetcher,
    });
    assert.equal(fourth.status, 429);
    assert.ok("error" in fourth.body);
    assert.equal(fourth.body.error, CAP_REACHED_LINE);
    assert.equal(fourth.body.remaining, 0);

    const quota = await getAdGrantGenerationQuota(WORKSPACE);
    assert.equal(quota.status, 200);
    assert.ok("remaining" in quota.body);
    assert.equal(quota.body.remaining, 0);
    assert.equal(
      await remainingForPerson(personKeyFor({ provider: "linkedin", providerId: "sub-ada-adgrant" })),
      0,
    );
  });

  it("does not count a website that cannot be read", async () => {
    await bindLinkedIn();
    const result = await generateAdGrantStructure({
      workspaceId: WORKSPACE,
      body: { websiteUrl: SITE_URL, location: "Oregon" },
      fetcher: async () => new Response("nope", { status: 503 }),
    });
    assert.equal(result.status, 502);
    assert.ok("remaining" in result.body);
    assert.equal(result.body.remaining, 3);
  });
});

describe("getAdGrantGenerationQuota", () => {
  it("says remaining before anyone generates, once the room is bound", async () => {
    const unbound = await getAdGrantGenerationQuota(WORKSPACE);
    assert.equal(unbound.status, 403);
    await bindLinkedIn();
    const bound = await getAdGrantGenerationQuota(WORKSPACE);
    assert.equal(bound.status, 200);
    assert.ok("remaining" in bound.body);
    assert.equal(bound.body.remaining, 3);
    assert.equal(bound.body.cap, 3);
  });
});
