/**
 * The policy gate. Pure functions over a generated Ad Grant account structure.
 * No network. A structure Google would suspend is worse than no structure, and
 * the nonprofit carries that risk rather than us.
 *
 * Each rule is its own named export, with the Google page it came from in a
 * comment on that function. checkPolicy runs all of them.
 */

import type {
  AdGrantAccountStructure,
  AdGrantAdGroup,
  AdGrantBidStrategy,
  AdGrantCampaign,
  AdGrantKeyword,
} from "@shared/api";

export const AD_GRANT_DAILY_BUDGET_USD = 329;
export const AD_GRANT_MANUAL_CPC_CAP_USD = 2;
export const AD_GRANT_MIN_AD_GROUPS_PER_CAMPAIGN = 2;
export const AD_GRANT_MIN_SITELINKS = 2;

/** https://support.google.com/nonprofits/answer/7587473?hl=en */
export const SINGLE_WORD_EXCEPTION_LIST = [
  "charity",
  "charities",
  "donate",
  "donation",
  "ngo",
  "ngos",
  "nonprofit",
  "nonprofits",
  "volunteer",
  "volunteering",
] as const;

/**
 * Recognized medical conditions, as a closed set of single words. Mission-based
 * policy excludes these from the single-word ban
 * (https://support.google.com/nonprofits/answer/4410314?hl=en). The generator
 * does not invent from this list; the gate needs it so a cancer charity's
 * brand-adjacent keyword is not rejected by mistake.
 */
export const MEDICAL_CONDITION_EXCEPTIONS = [
  "aids",
  "alzheimer",
  "alzheimers",
  "als",
  "anemia",
  "arthritis",
  "asthma",
  "autism",
  "blindness",
  "cancer",
  "cholera",
  "deafness",
  "dementia",
  "depression",
  "diabetes",
  "ebola",
  "epilepsy",
  "hepatitis",
  "hiv",
  "hypertension",
  "influenza",
  "leukemia",
  "malaria",
  "measles",
  "meningitis",
  "obesity",
  "osteoporosis",
  "parkinson",
  "parkinsons",
  "pneumonia",
  "ptsd",
  "schizophrenia",
  "sclerosis",
  "sepsis",
  "stroke",
  "tuberculosis",
] as const;

const EXCEPTION_SET = new Set<string>([
  ...SINGLE_WORD_EXCEPTION_LIST,
  ...MEDICAL_CONDITION_EXCEPTIONS,
]);

const SMART_BIDDING: ReadonlySet<AdGrantBidStrategy> = new Set([
  "MAXIMIZE_CONVERSIONS",
  "MAXIMIZE_CONVERSION_VALUE",
  "TARGET_CPA",
  "TARGET_ROAS",
]);

export interface PolicyIssue {
  rule: string;
  message: string;
  citation: string;
}

export function checkPolicy(structure: AdGrantAccountStructure): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const rules = [
    rejectSingleWordKeywords,
    rejectTooFewAdGroups,
    rejectTooFewSitelinks,
    rejectMissingGeoTarget,
    rejectInsecureOrUnauthorisedDestination,
    rejectDailyBudgetOverCap,
    rejectManualCpcWhenSmartBiddingRequired,
    rejectBidsOverTwoDollarsWhenManual,
  ];
  for (const rule of rules) {
    const issue = rule(structure);
    if (issue) issues.push(issue);
  }
  return issues;
}

export function policyHolds(structure: AdGrantAccountStructure): boolean {
  return checkPolicy(structure).length === 0;
}

/**
 * Strip match-type wrappers (`[exact]`, `"phrase"`) so the word count is the
 * keyword the person would see in the account.
 */
export function keywordCore(text: string): string {
  return text.trim().replace(/^\[/, "").replace(/\]$/, "").replace(/^"/, "").replace(/"$/, "").trim();
}

/**
 * A single-word keyword is a core with no space and none of the characters
 * Google treats as breaking the single-word rule (dashes, periods, other
 * punctuation). https://support.google.com/nonprofits/answer/7587473?hl=en
 */
export function isSingleWordKeyword(text: string): boolean {
  const core = keywordCore(text);
  if (!core) return false;
  if (/[\s.\-_/&+'()]/.test(core)) return false;
  return !core.includes(" ");
}

function brandWords(organisationName: string): Set<string> {
  const stop = new Set([
    "the",
    "of",
    "and",
    "for",
    "a",
    "an",
    "inc",
    "llc",
    "ltd",
    "foundation",
    "foundations",
    "trust",
    "association",
    "society",
    "org",
    "organization",
    "organisation",
    "international",
    "national",
  ]);
  const words = organisationName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stop.has(word));
  const set = new Set(words);
  const collapsed = words.join("");
  if (collapsed.length > 1) set.add(collapsed);
  return set;
}

function isAllowedSingleWord(text: string, organisationName: string): boolean {
  const core = keywordCore(text).toLowerCase();
  if (EXCEPTION_SET.has(core)) return true;
  if (brandWords(organisationName).has(core)) return true;
  return false;
}

function eachKeyword(
  structure: AdGrantAccountStructure,
  visit: (keyword: AdGrantKeyword, adGroup: AdGrantAdGroup, campaign: AdGrantCampaign) => void,
): void {
  for (const campaign of structure.campaigns) {
    for (const adGroup of campaign.adGroups) {
      for (const keyword of adGroup.keywords) visit(keyword, adGroup, campaign);
    }
  }
}

function eachFinalUrl(structure: AdGrantAccountStructure, visit: (url: string, where: string) => void): void {
  for (const campaign of structure.campaigns) {
    for (const sitelink of campaign.sitelinks) {
      visit(sitelink.finalUrl, `sitelink "${sitelink.text}" in ${campaign.name}`);
    }
    for (const adGroup of campaign.adGroups) {
      for (const ad of adGroup.ads) {
        visit(ad.finalUrl, `ad in ${campaign.name} / ${adGroup.name}`);
      }
    }
  }
}

/**
 * Single-word keywords are banned, except owned brand terms, recognized medical
 * conditions, and the published exception list.
 * https://support.google.com/nonprofits/answer/7587473?hl=en
 * https://support.google.com/nonprofits/answer/9314402?hl=en
 * https://support.google.com/nonprofits/answer/4410314?hl=en
 */
export function rejectSingleWordKeywords(structure: AdGrantAccountStructure): PolicyIssue | null {
  const banned: string[] = [];
  eachKeyword(structure, (keyword) => {
    if (isSingleWordKeyword(keyword.text) && !isAllowedSingleWord(keyword.text, structure.organisationName)) {
      banned.push(keywordCore(keyword.text));
    }
  });
  if (banned.length === 0) return null;
  return {
    rule: "rejectSingleWordKeywords",
    message: `Single-word keyword outside Google's exception list: ${banned.join(", ")}.`,
    citation: "https://support.google.com/nonprofits/answer/7587473?hl=en",
  };
}

/**
 * At least two ad groups per campaign.
 * https://support.google.com/nonprofits/answer/9314402?hl=en
 */
export function rejectTooFewAdGroups(structure: AdGrantAccountStructure): PolicyIssue | null {
  const thin = structure.campaigns.filter(
    (campaign) => campaign.adGroups.length < AD_GRANT_MIN_AD_GROUPS_PER_CAMPAIGN,
  );
  if (thin.length === 0) return null;
  return {
    rule: "rejectTooFewAdGroups",
    message: `Campaigns need at least ${AD_GRANT_MIN_AD_GROUPS_PER_CAMPAIGN} ad groups: ${thin.map((c) => c.name).join(", ")}.`,
    citation: "https://support.google.com/nonprofits/answer/9314402?hl=en",
  };
}

/**
 * At least two sitelink assets. Counted on the account as a whole, and each
 * campaign must carry them so a campaign without sitelinks cannot hide behind
 * a neighbour.
 * https://support.google.com/nonprofits/answer/9314402?hl=en
 */
export function rejectTooFewSitelinks(structure: AdGrantAccountStructure): PolicyIssue | null {
  const texts = new Set<string>();
  for (const campaign of structure.campaigns) {
    for (const sitelink of campaign.sitelinks) {
      const key = sitelink.text.trim().toLowerCase();
      if (key) texts.add(key);
    }
    if (campaign.sitelinks.length < AD_GRANT_MIN_SITELINKS) {
      return {
        rule: "rejectTooFewSitelinks",
        message: `Campaign "${campaign.name}" has ${campaign.sitelinks.length} sitelink(s); Google requires at least ${AD_GRANT_MIN_SITELINKS}.`,
        citation: "https://support.google.com/nonprofits/answer/9314402?hl=en",
      };
    }
  }
  if (texts.size < AD_GRANT_MIN_SITELINKS) {
    return {
      rule: "rejectTooFewSitelinks",
      message: `The account has ${texts.size} unique sitelink(s); Google requires at least ${AD_GRANT_MIN_SITELINKS}.`,
      citation: "https://support.google.com/nonprofits/answer/9314402?hl=en",
    };
  }
  return null;
}

/**
 * Specific geo-targeting must be present on every campaign.
 * https://support.google.com/nonprofits/answer/117827?hl=en
 */
export function rejectMissingGeoTarget(structure: AdGrantAccountStructure): PolicyIssue | null {
  const worldwide = /^(all|worldwide|global|everywhere)$/i;
  const missing = structure.campaigns.filter((campaign) => {
    const locations = campaign.locations.map((item) => item.trim()).filter(Boolean);
    return locations.length === 0 || locations.every((item) => worldwide.test(item));
  });
  if (missing.length === 0) return null;
  return {
    rule: "rejectMissingGeoTarget",
    message: `Campaigns need a specific geo-target: ${missing.map((c) => c.name).join(", ")}.`,
    citation: "https://support.google.com/nonprofits/answer/117827?hl=en",
  };
}

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function authorisedHost(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
}

/**
 * Every destination must be https on an authorised domain the nonprofit owns.
 * https://support.google.com/nonprofits/answer/1657899?hl=en
 */
export function rejectInsecureOrUnauthorisedDestination(structure: AdGrantAccountStructure): PolicyIssue | null {
  const allowed = authorisedHost(structure.authorisedDomain);
  if (!allowed) {
    return {
      rule: "rejectInsecureOrUnauthorisedDestination",
      message: "The authorised domain is missing, so no destination can be checked.",
      citation: "https://support.google.com/nonprofits/answer/1657899?hl=en",
    };
  }
  let failed: string | null = null;
  eachFinalUrl(structure, (url, where) => {
    if (failed) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      failed = `${where} has a destination that is not a URL.`;
      return;
    }
    if (parsed.protocol !== "https:") {
      failed = `${where} lands on ${parsed.protocol}// — Ad Grants requires https.`;
      return;
    }
    const host = hostOf(url);
    if (!host || host !== allowed) {
      failed = `${where} lands on ${host ?? url}, which is not the authorised domain ${allowed}.`;
    }
  });
  if (!failed) return null;
  return {
    rule: "rejectInsecureOrUnauthorisedDestination",
    message: failed,
    citation: "https://support.google.com/nonprofits/answer/1657899?hl=en",
  };
}

/**
 * Daily budget at or under $329 USD (the $10,000 monthly grant).
 * https://support.google.com/nonprofits/answer/1332166?hl=en
 */
export function rejectDailyBudgetOverCap(structure: AdGrantAccountStructure): PolicyIssue | null {
  if (structure.dailyBudgetUsd > AD_GRANT_DAILY_BUDGET_USD) {
    return {
      rule: "rejectDailyBudgetOverCap",
      message: `Account daily budget is $${structure.dailyBudgetUsd}, over the $${AD_GRANT_DAILY_BUDGET_USD} grant cap.`,
      citation: "https://support.google.com/nonprofits/answer/1332166?hl=en",
    };
  }
  const over = structure.campaigns.filter((campaign) => campaign.dailyBudgetUsd > AD_GRANT_DAILY_BUDGET_USD);
  if (over.length === 0) return null;
  return {
    rule: "rejectDailyBudgetOverCap",
    message: `Campaign daily budget over $${AD_GRANT_DAILY_BUDGET_USD}: ${over.map((c) => `${c.name} ($${c.dailyBudgetUsd})`).join(", ")}.`,
    citation: "https://support.google.com/nonprofits/answer/1332166?hl=en",
  };
}

/**
 * Accounts created on or after 22 April 2019 must use conversion-based Smart
 * bidding (Maximize conversions, Maximize conversion values, Target CPA, or
 * Target ROAS) for all campaigns. Manual CPC is the thing this rejects.
 * https://support.google.com/nonprofits/answer/117827?hl=en
 */
export function rejectManualCpcWhenSmartBiddingRequired(structure: AdGrantAccountStructure): PolicyIssue | null {
  if (!structure.smartBiddingRequired) return null;
  const wrong = structure.campaigns.filter((campaign) => !SMART_BIDDING.has(campaign.bidStrategy));
  if (wrong.length === 0) return null;
  return {
    rule: "rejectManualCpcWhenSmartBiddingRequired",
    message: `Campaigns on ${wrong.map((c) => `${c.name} (${c.bidStrategy})`).join(", ")} must use conversion-based Smart bidding.`,
    citation: "https://support.google.com/nonprofits/answer/117827?hl=en",
  };
}

/**
 * Where manual bidding is still in play, the program-level max CPC is $2 USD.
 * Smart bidding may bid above that; this rule does not apply to it.
 * https://support.google.com/nonprofits/answer/98870?hl=en
 */
export function rejectBidsOverTwoDollarsWhenManual(structure: AdGrantAccountStructure): PolicyIssue | null {
  const over: string[] = [];
  for (const campaign of structure.campaigns) {
    if (campaign.bidStrategy !== "MANUAL_CPC") continue;
    for (const adGroup of campaign.adGroups) {
      if (adGroup.maxCpcUsd != null && adGroup.maxCpcUsd > AD_GRANT_MANUAL_CPC_CAP_USD) {
        over.push(`${campaign.name} / ${adGroup.name} at $${adGroup.maxCpcUsd}`);
      }
    }
  }
  if (over.length === 0) return null;
  return {
    rule: "rejectBidsOverTwoDollarsWhenManual",
    message: `Manual CPC above the $${AD_GRANT_MANUAL_CPC_CAP_USD} program cap: ${over.join(", ")}.`,
    citation: "https://support.google.com/nonprofits/answer/98870?hl=en",
  };
}
