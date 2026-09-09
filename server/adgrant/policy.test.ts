/**
 * Policy gate. Run it with:
 *
 *   npx tsx --test server/adgrant/policy.test.ts
 *
 * Every rule in docs/specs/adgrant-and-dev-agents.md section 2 has its own
 * test. The functions under test take a structure and return; they do not
 * fetch anything.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { AdGrantAccountStructure, AdGrantCampaign } from "@shared/api";
import {
  AD_GRANT_DAILY_BUDGET_USD,
  AD_GRANT_MANUAL_CPC_CAP_USD,
  checkPolicy,
  isSingleWordKeyword,
  policyHolds,
  rejectBidsOverTwoDollarsWhenManual,
  rejectDailyBudgetOverCap,
  rejectInsecureOrUnauthorisedDestination,
  rejectManualCpcWhenSmartBiddingRequired,
  rejectMissingGeoTarget,
  rejectSingleWordKeywords,
  rejectTooFewAdGroups,
  rejectTooFewSitelinks,
} from "./policy";

function campaign(over: Partial<AdGrantCampaign> = {}): AdGrantCampaign {
  return {
    name: "Brand",
    dailyBudgetUsd: 164,
    bidStrategy: "MAXIMIZE_CONVERSIONS",
    locations: ["United States"],
    language: "en",
    adGroups: [
      {
        name: "Brand terms",
        keywords: [
          { text: "hope shelter nonprofit", matchType: "PHRASE" },
          { text: "about hope shelter", matchType: "PHRASE" },
        ],
        ads: [
          {
            headlines: ["Hope Shelter", "Homeless shelter help", "Find a bed tonight"],
            descriptions: ["Shelter, meals and casework in one place.", "See hours, locations and how to get help."],
            finalUrl: "https://hopeshelter.org/",
          },
        ],
      },
      {
        name: "Donate",
        keywords: [
          { text: "donate to hope shelter", matchType: "PHRASE" },
          { text: "hope shelter donation", matchType: "PHRASE" },
        ],
        ads: [
          {
            headlines: ["Donate to Hope Shelter", "Support a local shelter", "Give a bed for a night"],
            descriptions: ["Your gift pays for beds, meals and casework.", "Donate on the shelter's own site."],
            finalUrl: "https://hopeshelter.org/donate",
          },
        ],
      },
    ],
    sitelinks: [
      { text: "Donate", finalUrl: "https://hopeshelter.org/donate" },
      { text: "About us", finalUrl: "https://hopeshelter.org/about" },
    ],
    ...over,
  };
}

function valid(over: Partial<AdGrantAccountStructure> = {}): AdGrantAccountStructure {
  const first = campaign();
  const second: AdGrantCampaign = {
    ...campaign({ name: "Volunteer" }),
    dailyBudgetUsd: 165,
    adGroups: [
      {
        name: "Volunteer",
        keywords: [
          { text: "volunteer at hope shelter", matchType: "PHRASE" },
          { text: "hope shelter volunteering", matchType: "PHRASE" },
        ],
        ads: [
          {
            headlines: ["Volunteer at Hope Shelter", "Give an evening", "Help in the kitchen"],
            descriptions: ["Shifts for meals, front desk and overnight.", "Read what a shift involves, then sign up."],
            finalUrl: "https://hopeshelter.org/volunteer",
          },
        ],
      },
      {
        name: "Programs",
        keywords: [
          { text: "hope shelter programs", matchType: "PHRASE" },
          { text: "emergency shelter near me", matchType: "PHRASE" },
        ],
        ads: [
          {
            headlines: ["Programs at Hope Shelter", "Emergency beds", "Casework and meals"],
            descriptions: ["Emergency shelter, meals and a path out.", "See who we serve and how to arrive."],
            finalUrl: "https://hopeshelter.org/programs",
          },
        ],
      },
    ],
    sitelinks: [
      { text: "Volunteer", finalUrl: "https://hopeshelter.org/volunteer" },
      { text: "Programs", finalUrl: "https://hopeshelter.org/programs" },
    ],
  };
  return {
    organisationName: "Hope Shelter",
    authorisedDomain: "hopeshelter.org",
    dailyBudgetUsd: AD_GRANT_DAILY_BUDGET_USD,
    smartBiddingRequired: true,
    campaigns: [first, second],
    ...over,
  };
}

describe("a structure that follows the rules", () => {
  it("passes every named check", () => {
    const structure = valid();
    assert.equal(policyHolds(structure), true);
    assert.deepEqual(checkPolicy(structure), []);
  });
});

describe("rejectSingleWordKeywords", () => {
  it("rejects a single-word keyword outside Google's exception list", () => {
    const structure = valid();
    structure.campaigns[0].adGroups[0].keywords.push({ text: "dog", matchType: "BROAD" });
    const issue = rejectSingleWordKeywords(structure);
    assert.ok(issue);
    assert.equal(issue.rule, "rejectSingleWordKeywords");
    assert.match(issue.message, /dog/);
    assert.equal(issue.citation, "https://support.google.com/nonprofits/answer/7587473?hl=en");
  });

  it("allows a published exception, a medical condition, a brand word, and a dashed term", () => {
    const structure = valid();
    structure.campaigns[0].adGroups[0].keywords.push(
      { text: "donate", matchType: "PHRASE" },
      { text: "cancer", matchType: "PHRASE" },
      { text: "Hope", matchType: "PHRASE" },
      { text: "dog-adoption", matchType: "PHRASE" },
    );
    assert.equal(rejectSingleWordKeywords(structure), null);
    assert.equal(isSingleWordKeyword("dog-adoption"), false);
    assert.equal(isSingleWordKeyword("dog"), true);
  });
});

describe("rejectTooFewAdGroups", () => {
  it("rejects a campaign with fewer than two ad groups", () => {
    const structure = valid();
    structure.campaigns[0].adGroups = [structure.campaigns[0].adGroups[0]];
    const issue = rejectTooFewAdGroups(structure);
    assert.ok(issue);
    assert.equal(issue.rule, "rejectTooFewAdGroups");
    assert.equal(issue.citation, "https://support.google.com/nonprofits/answer/9314402?hl=en");
  });
});

describe("rejectTooFewSitelinks", () => {
  it("rejects a campaign with fewer than two sitelinks", () => {
    const structure = valid();
    structure.campaigns[0].sitelinks = [structure.campaigns[0].sitelinks[0]];
    const issue = rejectTooFewSitelinks(structure);
    assert.ok(issue);
    assert.equal(issue.rule, "rejectTooFewSitelinks");
    assert.equal(issue.citation, "https://support.google.com/nonprofits/answer/9314402?hl=en");
  });
});

describe("rejectMissingGeoTarget", () => {
  it("rejects a campaign with no geo-target", () => {
    const structure = valid();
    structure.campaigns[0].locations = [];
    const issue = rejectMissingGeoTarget(structure);
    assert.ok(issue);
    assert.equal(issue.rule, "rejectMissingGeoTarget");
    assert.equal(issue.citation, "https://support.google.com/nonprofits/answer/117827?hl=en");
  });

  it("rejects a worldwide placeholder as if there were no target", () => {
    const structure = valid();
    structure.campaigns[1].locations = ["Worldwide"];
    assert.ok(rejectMissingGeoTarget(structure));
  });
});

describe("rejectInsecureOrUnauthorisedDestination", () => {
  it("rejects a destination that is not https on the authorised domain", () => {
    const http = valid();
    http.campaigns[0].adGroups[0].ads[0].finalUrl = "http://hopeshelter.org/donate";
    const httpIssue = rejectInsecureOrUnauthorisedDestination(http);
    assert.ok(httpIssue);
    assert.match(httpIssue.message, /https/i);
    assert.equal(httpIssue.citation, "https://support.google.com/nonprofits/answer/1657899?hl=en");

    const other = valid();
    other.campaigns[0].sitelinks[0].finalUrl = "https://example.net/donate";
    const otherIssue = rejectInsecureOrUnauthorisedDestination(other);
    assert.ok(otherIssue);
    assert.match(otherIssue.message, /example\.net/);
  });

  it("accepts https on www of the authorised domain", () => {
    const structure = valid();
    structure.campaigns[0].adGroups[0].ads[0].finalUrl = "https://www.hopeshelter.org/";
    assert.equal(rejectInsecureOrUnauthorisedDestination(structure), null);
  });
});

describe("rejectDailyBudgetOverCap", () => {
  it("rejects a daily budget over $329", () => {
    const structure = valid();
    structure.dailyBudgetUsd = 330;
    const issue = rejectDailyBudgetOverCap(structure);
    assert.ok(issue);
    assert.equal(issue.rule, "rejectDailyBudgetOverCap");
    assert.equal(issue.citation, "https://support.google.com/nonprofits/answer/1332166?hl=en");
  });

  it("accepts $329", () => {
    assert.equal(rejectDailyBudgetOverCap(valid()), null);
  });
});

describe("rejectManualCpcWhenSmartBiddingRequired", () => {
  it("rejects manual CPC where Smart bidding is required", () => {
    const structure = valid();
    structure.campaigns[0].bidStrategy = "MANUAL_CPC";
    structure.campaigns[0].adGroups[0].maxCpcUsd = 1.5;
    const issue = rejectManualCpcWhenSmartBiddingRequired(structure);
    assert.ok(issue);
    assert.equal(issue.rule, "rejectManualCpcWhenSmartBiddingRequired");
    assert.equal(issue.citation, "https://support.google.com/nonprofits/answer/117827?hl=en");
  });
});

describe("rejectBidsOverTwoDollarsWhenManual", () => {
  it("rejects a manual CPC bid over the $2 program cap", () => {
    const structure = valid();
    structure.smartBiddingRequired = false;
    structure.campaigns[0].bidStrategy = "MANUAL_CPC";
    structure.campaigns[0].adGroups[0].maxCpcUsd = AD_GRANT_MANUAL_CPC_CAP_USD + 0.01;
    const issue = rejectBidsOverTwoDollarsWhenManual(structure);
    assert.ok(issue);
    assert.equal(issue.rule, "rejectBidsOverTwoDollarsWhenManual");
    assert.equal(issue.citation, "https://support.google.com/nonprofits/answer/98870?hl=en");
    assert.equal(rejectManualCpcWhenSmartBiddingRequired(structure), null);
  });

  it("does not apply the $2 cap to Smart bidding", () => {
    const structure = valid();
    structure.campaigns[0].adGroups[0].maxCpcUsd = 12;
    assert.equal(rejectBidsOverTwoDollarsWhenManual(structure), null);
  });
});
