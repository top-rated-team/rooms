/**
 * Fetches adgrant.ai's public content API into data/adgrant, corrects six
 * statements that are wrong against Google's current documentation, and writes
 * shared/adgrant.ts.
 *
 *   npm run adgrant:build
 *   npx tsx scripts/build-adgrant.ts
 *   npx tsx scripts/build-adgrant.ts --from-disk
 *   npx tsx scripts/build-adgrant.ts --take-theirs
 *
 * The source of truth on disk is markdown: one file per page, metadata as
 * frontmatter, body as markdown, so a correction is a diff a person can read.
 * A later fetch that disagrees with a file on disk prints the disagreement
 * and leaves the disk copy, unless --take-theirs is set.
 *
 * Generated rather than written because these pages were one machine-generated
 * batch, and carrying them into a nicer typeface without fixing them would
 * mean more people believing them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "data/adgrant";
const OUT = "shared/adgrant.ts";
const API = "https://adgrant.ai";
const CATEGORIES = ["glossary", "case-studies", "tricks"] as const;

export type AdGrantCategory = (typeof CATEGORIES)[number];

export interface RelatedLink {
  href: string;
  title: string;
}

export interface AdGrantCorrection {
  what: string;
  against: string;
}

export interface AdGrantPage {
  slug: string;
  category: AdGrantCategory;
  title: string;
  topic: string | null;
  niche: string | null;
  excerpt: string | null;
  bodyMarkdown: string;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  heroImage: string | null;
  heroImageAlt: string | null;
  relatedLinks: RelatedLink[];
  publishedAt: string | null;
  corrections: AdGrantCorrection[];
}

export interface AdGrantStats {
  accountsProcessed: number;
  totals: { campaigns: number; adGroups: number; keywords: number; ads: number };
  campaignsPerAccount: { median: number; avg: number; min: number; max: number };
  adGroupsPerAccount: { median: number; avg: number };
  adGroupsPerCampaign: { median: number; avg: number };
  keywordsPerAdGroup: { median: number; avg: number };
  adsPerAdGroup: { median: number; avg: number };
  sitelinksPerAccount: { median: number; avg: number };
  calloutsPerAccount: { median: number; avg: number };
  generatedAt: string;
}

export interface AdGrantTemplate {
  slug: string;
  niche: string;
  title: string;
  summary: string;
  heroImage: string | null;
  heroImageAlt: string | null;
  stats: {
    ads: number;
    adGroups: number;
    callouts: number;
    keywords: number;
    campaigns: number;
    sitelinks: number;
    structuredSnippets: number;
  };
}

const GOOGLE = {
  ctr: "https://support.google.com/nonprofits/answer/117827?hl=en",
  structure: "https://support.google.com/nonprofits/answer/9314402",
  adRank: "https://support.google.com/google-ads/answer/1752122?hl=en",
  website: "https://support.google.com/nonprofits/answer/1657899",
  bidding: "https://support.google.com/nonprofits/answer/98870?hl=en",
  audiences: "https://support.google.com/google-ads/answer/7476585?hl=en",
} as const;

/** Phrases that were unsourced, repeated across the generated pages, and must not ship. */
export const STRIPPED_PHRASES = [
  "600+ accounts I've managed",
  "600+ accounts I’ve managed",
  "30-50% of incremental clicks",
  "15-25% higher CTR",
  "15-40% conversion lift",
] as const;

export const STRIPPED_PATTERNS: RegExp[] = [
  /600\+\s+(Google Ad Grant )?accounts/i,
  /managed over 600/i,
  /worked on 600\+/i,
  /over 600 (Google )?Ad Grant accounts/i,
  /over 600 accounts/i,
  /running 600\+/i,
  /managing over 600/i,
  /running over 600/i,
  /30-50%\s+of incremental clicks/i,
  /15-25%\s+higher/i,
  /15-40%/i,
];

/** Wrong wording that a refetch without the corrections would put back. */
export const WRONG_WORDING = {
  ctrOneMonth: /below 5% for even one month/i,
  clicks329: /329 clicks\/day/i,
  impressions6580: /6,580 impressions/i,
  twoAdsRequired: /Google requires at least 2(\s+active)?(\s+ads)?\)/i,
  remarketing500: /500\+\s+users \(the minimum Google requires\)/i,
  remarketing500list: /requires 500 users in a list/i,
  adRankFormula: /Ad Rank might be around 14 \(Bid \$2 x Quality Score 7\)/i,
  deadWebsitePolicy: /support\.google\.com\/grants\/answer\/2454026/i,
} as const;

export interface CorrectionRule {
  id: string;
  what: string;
  against: string;
}

export const CORRECTION_RULES: CorrectionRule[] = [
  {
    id: "ctr-two-months",
    what: "The 5% CTR rule deactivates the account after two consecutive months, not one.",
    against: GOOGLE.ctr,
  },
  {
    id: "clicks-166",
    what: "$10,000 ÷ $2 ÷ 30 days is 166.7 clicks a day, not 329. 329 is the daily dollar budget. The matching 5% CTR impressions figure is about 3,334 a day, not 6,580.",
    against: GOOGLE.ctr,
  },
  {
    id: "two-ad-groups",
    what: "The two-ads-per-ad-group rule stopped applying to grantees on 30 June 2022. Two ad groups per campaign is still required.",
    against: GOOGLE.structure,
  },
  {
    id: "remarketing-100",
    what: "The remarketing list minimum was never 500. It is 100 active users in the last 30 days on Search, Display and YouTube.",
    against: GOOGLE.audiences,
  },
  {
    id: "ad-rank-no-formula",
    what: "Google publishes no Ad Rank formula and does not name Quality Score as a factor.",
    against: GOOGLE.adRank,
  },
  {
    id: "website-policy-url",
    what: "The Ad Grant website policies link is support.google.com/nonprofits/answer/1657899, not the dead grants/answer/2454026.",
    against: GOOGLE.website,
  },
  {
    id: "smart-bidding-default",
    what: "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. The $2 cap still exists where manual CPC is in use; it is the exception, not the default.",
    against: GOOGLE.ctr,
  },
];

const APOSTROPHE = "['\u2019]";

function hit(body: string, pattern: RegExp, replacement: string): { body: string; applied: boolean } {
  const next = body.replace(pattern, replacement);
  return { body: next, applied: next !== body };
}

function applyMany(
  body: string,
  pairs: Array<[RegExp, string]>,
): { body: string; applied: boolean } {
  let applied = false;
  let next = body;
  for (const [pattern, replacement] of pairs) {
    const result = hit(next, pattern, replacement);
    next = result.body;
    if (result.applied) applied = true;
  }
  return { body: next, applied };
}

function note(id: string): AdGrantCorrection {
  const rule = CORRECTION_RULES.find((item) => item.id === id);
  if (!rule) throw new Error(`unknown correction id: ${id}`);
  return { what: rule.what, against: rule.against };
}

/** Strip the repeating unsourced percentages and replace the 600+ claim with 4,539. */
export function stripUnsourced(body: string): string {
  let next = body;

  next = next.replace(
    /600\+\s+(?:Google Ad Grant |Ad Grant |nonprofit )?accounts/gi,
    "4,539 processed Ad Grant accounts",
  );
  next = next.replace(
    /over 600(?:\+)?(?: nonprofit)?(?: Google)?(?: Ad Grant)? accounts/gi,
    "4,539 processed Ad Grant accounts",
  );
  next = next.replace(/running over 600,/gi, "4,539 processed Ad Grant accounts,");
  next = next.replace(
    new RegExp(`who${APOSTROPHE}s managed 4,539 processed Ad Grant accounts`, "gi"),
    "drawn from 4,539 processed Ad Grant accounts",
  );

  // Some pages already named the measured figure next to the 600+ claim. After
  // the replacement that pairing is the same number twice.
  next = next.replace(
    /, and especially from analyzing over 4,500 real accounts/gi,
    "",
  );
  next = next.replace(
    /, and analyzing a broader set of 4,539 real Ad Grant accounts/gi,
    "",
  );
  next = next.replace(/, and analyzing 4,539 real accounts/gi, "");
  next = next.replace(
    /Based on our analysis of 4,539 real Ad Grant accounts and experience 4,539 processed Ad Grant accounts/gi,
    "From 4,539 processed Ad Grant accounts",
  );

  next = next.replace(
    /\*\*broad match keywords\*\* consistently drive 30-50% of incremental clicks when paired with smart account management/gi,
    "**broad match keywords** can add clicks when paired with careful account management",
  );
  next = next.replace(
    /consistently drive 30-50% of incremental clicks when paired with smart account management/gi,
    "can add clicks when paired with careful account management",
  );
  next = next.replace(
    /ads with sitelinks consistently see \*\*15-25% higher click-through rates \(CTR\)\*\* compared to ads without them/gi,
    "ads with sitelinks consistently see higher click-through rates compared to ads without them",
  );
  next = next.replace(
    /conversion rates improved by 15-40% due to higher intent/gi,
    "conversion rates improved, from higher intent",
  );
  next = next.replace(
    /Conversion rates can improve 2-3x because/gi,
    "Conversion rates can improve because",
  );
  next = next.replace(
    new RegExp(`I${APOSTROPHE}ve managed 4,539 processed Ad Grant accounts and seen`, "gi"),
    "From 4,539 processed Ad Grant accounts, we have seen",
  );
  next = next.replace(
    /In the \*\*4,539 processed Ad Grant accounts we['\u2019]ve managed,/g,
    "Across 4,539 processed Ad Grant accounts,",
  );

  return next;
}

function correctCtr(body: string): { body: string; applied: boolean } {
  return applyMany(body, [
    [
      /If your CTR drops below 5% for even one month, Google may suspend the account, and recovery can be a long, frustrating process/g,
      "If the CTR requirement is not met for two consecutive months, Google temporarily deactivates the account. Recovery is a request after the account is brought back into compliance",
    ],
    [
      /Google requires every Ad Grant account to maintain at least a 5% CTR each month\. Miss it, and your account risks suspension — no exceptions\./g,
      "Google requires every Ad Grant account to maintain at least a 5% CTR each month. If that is missed for two consecutive months, the account is temporarily deactivated.",
    ],
    [
      /Google requires nonprofit Ad Grant accounts to maintain at least this 5% monthly average or risk suspension\./g,
      "Google requires nonprofit Ad Grant accounts to maintain at least this 5% monthly average. If that is missed for two consecutive months, the account is temporarily deactivated.",
    ],
  ]);
}

function correctClicks(body: string): { body: string; applied: boolean } {
  return applyMany(body, [
    [
      /That['\u2019]s about 329 clicks\/day \(\$10,000 ÷ \$2 max CPC ÷ 30 days\)\. To maintain 5% CTR, you need these numbers to make sense:/g,
      "The daily dollar budget is about $329 ($10,000 ÷ 30 days). At a $2 CPC that is about 166.7 clicks a day ($10,000 ÷ $2 ÷ 30). To maintain 5% CTR, you need these numbers to make sense:",
    ],
    [
      /\*\*Daily Impressions\*\*: You need at least 6,580 impressions daily \(because 329 clicks ÷ 6,580 impressions = 5%\)/g,
      "**Daily Impressions**: You need about 3,334 impressions daily (because 166.7 clicks ÷ 3,334 impressions = 5%)",
    ],
    [
      /\*\*Clicks\*\*: A minimum of 329 clicks to hit the 5% CTR/g,
      "**Clicks**: About 166.7 clicks a day if the $2 cap is in force",
    ],
    [
      /If your ads show 6,580 times a day but only get 100 clicks, your CTR is 1\.5%—way below 5%\./g,
      "If your ads show 3,334 times a day but only get 50 clicks, your CTR is 1.5% — well below 5%.",
    ],
  ]);
}

function correctTwoAds(body: string): { body: string; applied: boolean } {
  return applyMany(body, [
    [
      /Test multiple ads per ad group \(Google requires at least 2\) to see what drives more clicks\./g,
      "The two-ads-per-ad-group rule stopped applying to grantees on 30 June 2022, when responsive search ads became required. Two ad groups per campaign is still required. One responsive search ad per ad group meets the current ad rule.",
    ],
    [
      /Divide campaigns into tightly themed ad groups with 2\+ ads each\. Each ad group targets a narrow set of keywords\./g,
      "Divide campaigns into at least two tightly themed ad groups. Each ad group targets a narrow set of keywords. One responsive search ad per ad group is enough.",
    ],
    [
      /Running 2\+ ads per ad group and rotating them helps find winners\./g,
      "Testing more than one responsive search ad per ad group can help find winners, but Google no longer requires two ads per ad group.",
    ],
    [
      /- Ensure each ad group has at least 2 active ads\./g,
      "- Ensure each campaign has at least two ad groups. One responsive search ad per ad group meets the current ad rule; the two-ads-per-ad-group requirement ended on 30 June 2022.",
    ],
    [
      /You need at least 2 ads per ad group to test messaging and maximize/g,
      "Two ad groups per campaign are required. One responsive search ad per ad group meets the ad rule that replaced two ads per ad group on 30 June 2022. Extra ads can still help test messaging and maximize",
    ],
    [
      /\*\*2\. Create at Least 2 Ads per Ad Group\*\*/g,
      "**2. Create at least two ad groups per campaign**",
    ],
  ]);
}

function correctRemarketing(body: string): { body: string; applied: boolean } {
  return applyMany(body, [
    [
      /Once your audiences have 500\+ users \(the minimum Google requires\)/g,
      "Once your audiences have 100 active users in the last 30 days (the minimum Google requires on Search, Display and YouTube)",
    ],
    [
      /Google requires 500 users in a list before you can use it for targeting/g,
      "Google requires 100 active users in the last 30 days before a list can serve. The minimum was never 500 — historically 1,000 on Search and 100 on Display, then 100 across networks from late 2025",
    ],
  ]);
}

function correctAdRank(body: string): { body: string; applied: boolean } {
  return applyMany(body, [
    [
      /Ad Rank isn['\u2019]t just about your bid \(how much you['\u2019]re willing to pay per click\)\. It combines:\n\n1\. \*\*Your maximum bid\*\* \(up to \$2 CPC for standard Grant accounts, unless you use Smart Bidding\)\n2\. \*\*Ad Quality Score\*\* \(based on relevance, landing page experience, and expected click-through rate \[CTR\]\)\n3\. \*\*The expected impact of ad extensions and formats\*\*/g,
      "Google publishes no Ad Rank formula, and does not name Quality Score as a factor in it. Ad Rank is calculated from several things including bid amount, the quality of the ads and landing page, Ad Rank thresholds, the competitiveness of the auction, the context of the search, and the expected impact of assets and other ad formats. Quality Score is a diagnostic on keywords; it is not a published input to Ad Rank.",
    ],
    [
      /- You bid \$2 per click \(max allowed\)\n- Your ad quality \(relevance, landing page, CTR history\) gives you a Quality Score of 7 out of 10 \(pretty solid\)\n- Your Ad Rank might be around 14 \(Bid \$2 x Quality Score 7\)\n\nNow imagine a competitor with a \$3 bid and a Quality Score of 5 \(Ad Rank = 15\) — they['\u2019]ll outrank you because even though their ad is lower quality, their higher bid pushes them up\./g,
      "- You bid $2 per click where manual CPC is still in use (the program-level ceiling)\n- Ad quality — expected click-through rate, ad relevance, landing page experience — still decides whether the ad is eligible and where it sits\n- There is no published number for that. A competitor with a higher bid can still lose to a more relevant ad, and the reverse is also true; Google does not publish the weights",
    ],
    [
      /Your Ad Rank might be around 14 \(Bid \$2 x Quality Score 7\)/g,
      "Google publishes no number for Ad Rank, and Bid × Quality Score is not a formula Google documents",
    ],
  ]);
}

function correctWebsitePolicyLink(body: string): { body: string; applied: boolean } {
  return hit(
    body,
    /https:\/\/support\.google\.com\/grants\/answer\/2454026/g,
    "https://support.google.com/nonprofits/answer/1657899",
  );
}

function rewriteCapFraming(body: string): { body: string; applied: boolean } {
  return applyMany(body, [
    [
      /It lets you ditch the default \$2 cost-per-click \(CPC\) limit and instead lets Google use machine learning/g,
      "For accounts created on or after 22 April 2019 it is the required bidding strategy, not a workaround: those accounts must use conversion-based Smart bidding, and Google can set bids above the $2 program-level ceiling when performance merits it. It lets Google use machine learning",
    ],
    [
      /By default, Google Ad Grants limit your CPC to \$2\. This bottleneck caps your ability/g,
      "Where manual CPC is still in use, Google Ad Grants limit CPC to $2. That ceiling caps the ability",
    ],
    [
      /Google['\u2019]s default \$2 max CPC cap hurts performance unless you switch to Smart Bidding, but that requires conversion tracking\./g,
      "Accounts created on or after 22 April 2019 must already use conversion-based Smart bidding. Where an older account is still on manual CPC, the $2 program-level ceiling applies, and switching to Smart bidding needs conversion tracking.",
    ],
    [
      /The catch: with manual bidding, your max cost-per-click is capped at \$2\. This means Google restricts your bids so you never pay more than \$2 per click\./g,
      "The $2 program-level ceiling applies to manual CPC. Accounts created on or after 22 April 2019 must use conversion-based Smart bidding instead, so for those accounts there is no cap to bypass.",
    ],
    [
      /The \$2 CPC cap applies \*only\* if you use manual or enhanced CPC bidding strategies\. But if you set your campaigns to use Smart Bidding, like \*\*Maximize Conversions\*\*, that cap disappears\.\n\nThis is a game changer\./g,
      "The $2 CPC cap applies only where manual or enhanced CPC bidding is in use. Accounts created on or after 22 April 2019 must use conversion-based Smart bidding — Maximize conversions, Maximize conversion value, Target CPA, or Target ROAS — for every campaign. For those accounts the cap is not the default, and Google can bid above $2 when the account's performance merits it. The cap and the exception are both still real.",
    ],
    [
      /I still hear nonprofit marketers say, [“"]We['\u2019]re stuck with a \$2 max CPC on Google Ad Grants\.[”"] That['\u2019]s not quite true anymore—and sticking to that belief can seriously limit your impact\./g,
      "The $2 max CPC is still a program-level ceiling on manual bidding. It has not been the default for accounts created on or after 22 April 2019.",
    ],
    [
      /Since the default \$2 max CPC cap applies unless using Smart Bidding \(which requires conversion tracking\), start with manual CPC to maintain control\./g,
      "Accounts created on or after 22 April 2019 must use conversion-based Smart bidding. Where an older account is still on manual CPC, the $2 ceiling applies.",
    ],
    [
      /The default \$2 max cost-per-click \(CPC\) cap and rigid keyword rules often limit how much budget/g,
      "Where manual CPC is still in use, the $2 max cost-per-click (CPC) ceiling and the keyword rules often limit how much budget",
    ],
    [
      /Using Smart Bidding strategies can help bypass the \$2 CPC cap/g,
      "Conversion-based Smart bidding, required for accounts created on or after 22 April 2019, is how bids go above the $2 CPC ceiling",
    ],
    [
      /Use Smart Bidding \(like Maximize Conversions\) to bypass the \$2 CPC cap/g,
      "Use Smart Bidding (like Maximize Conversions), which is required for accounts created on or after 22 April 2019 and can bid above the $2 CPC ceiling",
    ],
    [
      /Smart Bidding can help bypass the \$2 CPC cap and optimize for conversions/g,
      "Smart bidding, required for accounts created on or after 22 April 2019, can bid above the $2 CPC ceiling and optimize for conversions",
    ],
    [
      /it removes the \$2 CPC cap and can improve both CTR and results/g,
      "it can bid above the $2 CPC ceiling (and is required for accounts created on or after 22 April 2019) and can improve both CTR and results",
    ],
    [
      /like Maximize Conversions to remove the \$2 CPC cap—but only if you have conversion tracking set up\./g,
      "like Maximize Conversions, required for accounts created on or after 22 April 2019, which can bid above the $2 CPC ceiling when conversion tracking is set up.",
    ],
    [
      /Since the Grant limits your max CPC to \$2 \(unless you use Maximize Conversions bidding\)/g,
      "Where manual CPC is still in use the Grant limits max CPC to $2 (Maximize conversions, required for accounts created on or after 22 April 2019, can bid above it)",
    ],
    [
      /Quick Checklist to Bypass the \$2 CPC Cap/g,
      "Checklist for conversion-based Smart bidding (required since 22 April 2019)",
    ],
    [
      /This isn['\u2019]t magic\. It['\u2019]s smart strategy that turns a \$2 per click limit into a dynamic system focused on outcomes instead of just clicks\./g,
      "The $2 ceiling is still real on manual CPC. For almost every account created since 22 April 2019, conversion-based Smart bidding is already the required strategy, and the work is conversion tracking and goals rather than a bypass.",
    ],
  ]);
}

export function applyCorrections(body: string): { body: string; corrections: AdGrantCorrection[] } {
  const corrections: AdGrantCorrection[] = [];
  let next = body;

  const steps: Array<[string, (value: string) => { body: string; applied: boolean }]> = [
    ["ctr-two-months", correctCtr],
    ["clicks-166", correctClicks],
    ["two-ad-groups", correctTwoAds],
    ["remarketing-100", correctRemarketing],
    ["ad-rank-no-formula", correctAdRank],
    ["website-policy-url", correctWebsitePolicyLink],
    ["smart-bidding-default", rewriteCapFraming],
  ];

  for (const [id, fn] of steps) {
    const result = fn(next);
    next = result.body;
    if (result.applied) corrections.push(note(id));
  }

  next = stripUnsourced(next);
  return { body: next, corrections };
}

/* -------------------------------------------------------------------------- */
/* YAML                                                                       */
/* -------------------------------------------------------------------------- */

function unquote(value: string): string {
  if (value.length >= 2) {
    const start = value[0];
    const end = value[value.length - 1];
    if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
      try {
        if (start === '"') return JSON.parse(value) as string;
      } catch {
        /* fall through */
      }
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseScalar(raw: string): string | null | number | boolean {
  const value = raw.trim();
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return unquote(value);
}

function parseYaml(yaml: string, file: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const field = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
    if (!field) {
      throw new Error(`${file}: cannot read frontmatter line: ${line}`);
    }
    const key = field[1];
    const rest = field[2];
    if (rest !== "") {
      if (rest.startsWith("[") || rest.startsWith("{")) {
        out[key] = JSON.parse(rest) as unknown;
      } else {
        out[key] = parseScalar(rest);
      }
      i += 1;
      continue;
    }
    i += 1;
    if (i >= lines.length || !/^\s+-/.test(lines[i] ?? "")) {
      out[key] = [];
      continue;
    }
    if (/^\s+-\s+[A-Za-z][A-Za-z0-9]*\s*:/.test(lines[i])) {
      const items: Record<string, unknown>[] = [];
      while (i < lines.length) {
        const start = lines[i].match(/^(\s+)-\s+([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
        if (!start) break;
        const obj: Record<string, unknown> = {};
        obj[start[2]] = start[3] === "" ? "" : parseScalar(start[3]);
        const dashIndent = start[1].length;
        i += 1;
        while (i < lines.length) {
          if (/^\s+-/.test(lines[i])) break;
          const cont = lines[i].match(/^(\s+)([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
          if (!cont || cont[1].length <= dashIndent) break;
          obj[cont[2]] = cont[3] === "" ? "" : parseScalar(cont[3]);
          i += 1;
        }
        items.push(obj);
      }
      out[key] = items;
      continue;
    }
    const items: string[] = [];
    while (i < lines.length) {
      const item = lines[i].match(/^\s+-\s+(.*)$/);
      if (!item) break;
      items.push(unquote(item[1].trim()));
      i += 1;
    }
    out[key] = items;
  }
  return out;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function writeFrontmatter(page: AdGrantPage): string {
  const lines: string[] = ["---"];
  lines.push(`slug: ${yamlString(page.slug)}`);
  lines.push(`category: ${yamlString(page.category)}`);
  lines.push(`title: ${yamlString(page.title)}`);
  lines.push(`topic: ${page.topic === null ? "null" : yamlString(page.topic)}`);
  lines.push(`niche: ${page.niche === null ? "null" : yamlString(page.niche)}`);
  lines.push(`excerpt: ${page.excerpt === null ? "null" : yamlString(page.excerpt)}`);
  lines.push(`metaTitle: ${page.metaTitle === null ? "null" : yamlString(page.metaTitle)}`);
  lines.push(
    `metaDescription: ${page.metaDescription === null ? "null" : yamlString(page.metaDescription)}`,
  );
  if (page.keywords.length === 0) {
    lines.push("keywords: []");
  } else {
    lines.push("keywords:");
    for (const word of page.keywords) lines.push(`  - ${yamlString(word)}`);
  }
  lines.push(`heroImage: ${page.heroImage === null ? "null" : yamlString(page.heroImage)}`);
  lines.push(
    `heroImageAlt: ${page.heroImageAlt === null ? "null" : yamlString(page.heroImageAlt)}`,
  );
  if (page.relatedLinks.length === 0) {
    lines.push("relatedLinks: []");
  } else {
    lines.push("relatedLinks:");
    for (const link of page.relatedLinks) {
      lines.push(`  - href: ${yamlString(link.href)}`);
      lines.push(`    title: ${yamlString(link.title)}`);
    }
  }
  lines.push(`publishedAt: ${page.publishedAt === null ? "null" : yamlString(page.publishedAt)}`);
  if (page.corrections.length === 0) {
    lines.push("corrections: []");
  } else {
    lines.push("corrections:");
    for (const item of page.corrections) {
      lines.push(`  - what: ${yamlString(item.what)}`);
      lines.push(`    against: ${yamlString(item.against)}`);
    }
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

function splitDocument(raw: string, file: string): { yaml: string; body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    throw new Error(`${file}: missing opening frontmatter`);
  }
  const rest = raw.replace(/^---\r?\n/, "");
  const close = rest.search(/\r?\n---\r?\n/);
  if (close === -1) {
    throw new Error(`${file}: frontmatter is not closed`);
  }
  return {
    yaml: rest.slice(0, close),
    body: rest.slice(close).replace(/^\r?\n---\r?\n/, ""),
  };
}

function asString(value: unknown, field: string, file: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${file}: ${field} must be a non-empty string`);
  }
  return value;
}

function asNullableString(value: unknown, field: string, file: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`${file}: ${field} must be a string or null`);
  }
  return value;
}

function asStringList(value: unknown, field: string, file: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${file}: ${field} must be a list of strings`);
  }
  return value;
}

function asCategory(value: unknown, file: string): AdGrantCategory {
  const category = asString(value, "category", file);
  if ((CATEGORIES as readonly string[]).includes(category)) return category as AdGrantCategory;
  throw new Error(`${file}: category must be one of ${CATEGORIES.join(", ")}`);
}

function asRelatedLinks(value: unknown, file: string): RelatedLink[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${file}: relatedLinks must be a list`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`${file}: relatedLinks[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    return {
      href: asString(row.href, `relatedLinks[${index}].href`, file),
      title: asString(row.title, `relatedLinks[${index}].title`, file),
    };
  });
}

function asCorrections(value: unknown, file: string): AdGrantCorrection[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${file}: corrections must be a list`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`${file}: corrections[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    return {
      what: asString(row.what, `corrections[${index}].what`, file),
      against: asString(row.against, `corrections[${index}].against`, file),
    };
  });
}

export function readPageFile(file: string): AdGrantPage {
  const raw = fs.readFileSync(file, "utf8");
  const { yaml, body } = splitDocument(raw, file);
  const fields = parseYaml(yaml, file);
  return {
    slug: asString(fields.slug, "slug", file),
    category: asCategory(fields.category, file),
    title: asString(fields.title, "title", file),
    topic: asNullableString(fields.topic, "topic", file),
    niche: asNullableString(fields.niche, "niche", file),
    excerpt: asNullableString(fields.excerpt, "excerpt", file),
    bodyMarkdown: body.replace(/^\n/, ""),
    metaTitle: asNullableString(fields.metaTitle, "metaTitle", file),
    metaDescription: asNullableString(fields.metaDescription, "metaDescription", file),
    keywords: asStringList(fields.keywords, "keywords", file),
    heroImage: asNullableString(fields.heroImage, "heroImage", file),
    heroImageAlt: asNullableString(fields.heroImageAlt, "heroImageAlt", file),
    relatedLinks: asRelatedLinks(fields.relatedLinks, file),
    publishedAt: asNullableString(fields.publishedAt, "publishedAt", file),
    corrections: asCorrections(fields.corrections, file),
  };
}

function writePageFile(page: AdGrantPage): string {
  const dir = path.join(SOURCE, page.category);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${page.slug}.md`);
  const body = page.bodyMarkdown.startsWith("\n") ? page.bodyMarkdown : `\n${page.bodyMarkdown}`;
  const trailing = body.endsWith("\n") ? body : `${body}\n`;
  fs.writeFileSync(file, `${writeFrontmatter(page)}${trailing}`);
  return file;
}

/* -------------------------------------------------------------------------- */
/* Fetch                                                                      */
/* -------------------------------------------------------------------------- */

interface IndexItem {
  slug: string;
  category: string;
  title: string;
}

interface PagePayload {
  slug: string;
  category: string;
  title: string;
  topic?: string | null;
  niche?: string | null;
  excerpt?: string | null;
  bodyMarkdown?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[] | null;
  heroImage?: string | null;
  heroImageAlt?: string | null;
  relatedLinks?: Array<{ href?: string; title?: string }> | null;
  publishedAt?: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${url} → ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function pageFromPayload(payload: PagePayload): AdGrantPage {
  const category = asCategory(payload.category, payload.slug);
  const rawBody = payload.bodyMarkdown ?? "";
  const { body, corrections } = applyCorrections(rawBody);
  return {
    slug: payload.slug,
    category,
    title: stripUnsourced(payload.title),
    topic: payload.topic ? stripUnsourced(payload.topic) : null,
    niche: payload.niche ?? null,
    excerpt: payload.excerpt ? stripUnsourced(payload.excerpt) : null,
    bodyMarkdown: body,
    metaTitle: payload.metaTitle ? stripUnsourced(payload.metaTitle) : null,
    metaDescription: payload.metaDescription ? stripUnsourced(payload.metaDescription) : null,
    keywords: payload.keywords ?? [],
    heroImage: payload.heroImage ?? null,
    heroImageAlt: payload.heroImageAlt ?? null,
    relatedLinks: (payload.relatedLinks ?? [])
      .filter((link): link is { href: string; title: string } => Boolean(link.href && link.title))
      .map((link) => ({ href: link.href, title: link.title })),
    publishedAt: payload.publishedAt ?? null,
    corrections,
  };
}

function sameBody(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();
}

async function fetchLibrary(takeTheirs: boolean): Promise<void> {
  for (const category of CATEGORIES) {
    const index = await fetchJson<{ items: IndexItem[] }>(
      `${API}/api/content/pages?category=${category}&pageSize=100`,
    );
    console.log(`${category}: ${index.items.length} pages`);
    for (const item of index.items) {
      const payload = await fetchJson<PagePayload>(
        `${API}/api/content/page/${category}/${item.slug}`,
      );
      const incoming = pageFromPayload(payload);
      const dest = path.join(SOURCE, incoming.category, `${incoming.slug}.md`);
      if (fs.existsSync(dest) && !takeTheirs) {
        const existing = readPageFile(dest);
        if (!sameBody(existing.bodyMarkdown, incoming.bodyMarkdown)) {
          console.log(
            `  kept ${incoming.category}/${incoming.slug}.md — fetched body differs; pass --take-theirs to replace it`,
          );
          continue;
        }
      }
      writePageFile(incoming);
      const marks = incoming.corrections.length
        ? ` (${incoming.corrections.length} correction${incoming.corrections.length === 1 ? "" : "s"})`
        : "";
      console.log(`  wrote ${incoming.category}/${incoming.slug}.md${marks}`);
    }
  }

  const templates = await fetchJson<AdGrantTemplate[]>(`${API}/api/templates`);
  const stats = await fetchJson<AdGrantStats>(`${API}/api/templates/stats`);
  writeJsonGuarded(path.join(SOURCE, "templates.json"), templates, takeTheirs);
  writeJsonGuarded(path.join(SOURCE, "stats.json"), stats, takeTheirs);
}

function writeJsonGuarded(file: string, value: unknown, takeTheirs: boolean): void {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(file) && !takeTheirs) {
    const existing = fs.readFileSync(file, "utf8");
    if (existing !== next) {
      console.log(`  kept ${file} — fetched copy differs; pass --take-theirs to replace it`);
      return;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  console.log(`  wrote ${file}`);
}

/* -------------------------------------------------------------------------- */
/* Generate                                                                   */
/* -------------------------------------------------------------------------- */

function loadPagesFromDisk(): AdGrantPage[] {
  const pages: AdGrantPage[] = [];
  for (const category of CATEGORIES) {
    const dir = path.join(SOURCE, category);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
    for (const name of files) {
      pages.push(readPageFile(path.join(dir, name)));
    }
  }
  pages.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.slug.localeCompare(b.slug);
  });
  return pages;
}

export function assertLibrary(pages: AdGrantPage[], stats: AdGrantStats, templates: AdGrantTemplate[]): void {
  if (pages.length === 0) {
    throw new Error(`${SOURCE} has no page markdown — run without --from-disk to fetch it`);
  }
  const seen = new Set<string>();
  for (const page of pages) {
    if (!page.slug) throw new Error("a page is missing its slug");
    if (!page.bodyMarkdown.trim()) throw new Error(`${page.category}/${page.slug} has no body`);
    const key = `${page.category}/${page.slug}`;
    if (seen.has(key)) throw new Error(`duplicate page: ${key}`);
    seen.add(key);
    const haystack = `${page.title}\n${page.topic ?? ""}\n${page.excerpt ?? ""}\n${page.metaTitle ?? ""}\n${page.metaDescription ?? ""}\n${page.bodyMarkdown}`;
    for (const pattern of STRIPPED_PATTERNS) {
      if (pattern.test(haystack)) {
        throw new Error(`${key} still contains stripped wording matching ${pattern}`);
      }
    }
    for (const wrong of Object.values(WRONG_WORDING)) {
      if (wrong.test(haystack)) {
        throw new Error(`${key} still contains uncorrected wording matching ${wrong}`);
      }
    }
  }
  if (stats.accountsProcessed !== 4539) {
    throw new Error(`stats.accountsProcessed is ${stats.accountsProcessed}, expected 4539 from the live API`);
  }
  if (templates.length === 0) {
    throw new Error("no starter templates on disk");
  }
}

function generate(pages: AdGrantPage[], stats: AdGrantStats, templates: AdGrantTemplate[]): void {
  const header = `/**
 * GENERATED — do not edit. Run \`npx tsx scripts/build-adgrant.ts\`.
 *
 * adgrant.ai's public content library, fetched through its JSON API, written
 * as markdown under data/adgrant, and corrected against Google's current
 * Ad Grants documentation. A page edited by hand in data/adgrant is kept on
 * the next fetch unless the script is run with --take-theirs.
 *
 * STATS is the measured figure from GET /api/templates/stats. It is the
 * number this library may quote. The unsourced percentages that used to
 * stand in front of it are not in these pages.
 */

export interface RelatedLink {
  href: string;
  title: string;
}

export interface AdGrantCorrection {
  what: string;
  against: string;
}

export type AdGrantCategory = "glossary" | "case-studies" | "tricks";

export interface AdGrantPage {
  slug: string;
  category: AdGrantCategory;
  title: string;
  topic: string | null;
  niche: string | null;
  excerpt: string | null;
  bodyMarkdown: string;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  heroImage: string | null;
  heroImageAlt: string | null;
  relatedLinks: RelatedLink[];
  publishedAt: string | null;
  corrections: AdGrantCorrection[];
}

export interface AdGrantStats {
  accountsProcessed: number;
  totals: { campaigns: number; adGroups: number; keywords: number; ads: number };
  campaignsPerAccount: { median: number; avg: number; min: number; max: number };
  adGroupsPerAccount: { median: number; avg: number };
  adGroupsPerCampaign: { median: number; avg: number };
  keywordsPerAdGroup: { median: number; avg: number };
  adsPerAdGroup: { median: number; avg: number };
  sitelinksPerAccount: { median: number; avg: number };
  calloutsPerAccount: { median: number; avg: number };
  generatedAt: string;
}

export interface AdGrantTemplate {
  slug: string;
  niche: string;
  title: string;
  summary: string;
  heroImage: string | null;
  heroImageAlt: string | null;
  stats: {
    ads: number;
    adGroups: number;
    callouts: number;
    keywords: number;
    campaigns: number;
    sitelinks: number;
    structuredSnippets: number;
  };
}

export const STATS: AdGrantStats = ${JSON.stringify(stats, null, 2)};

export const TEMPLATES: AdGrantTemplate[] = ${JSON.stringify(templates, null, 2)};

export const PAGES: AdGrantPage[] = ${JSON.stringify(pages, null, 2)};

export const PAGE_BY_SLUG: Record<string, AdGrantPage> = Object.fromEntries(
  PAGES.map((page) => [page.slug, page]),
);

export function pagesIn(category: AdGrantCategory): AdGrantPage[] {
  return PAGES.filter((page) => page.category === category);
}
`;

  fs.writeFileSync(OUT, header);
  console.log(
    `${OUT} — ${pages.length} pages, ${templates.length} templates, ${stats.accountsProcessed.toLocaleString("en-US")} accounts processed`,
  );
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const fromDisk = args.has("--from-disk");
  const takeTheirs = args.has("--take-theirs");
  if (fromDisk && takeTheirs) {
    throw new Error("use --from-disk or --take-theirs, not both");
  }

  fs.mkdirSync(SOURCE, { recursive: true });

  if (!fromDisk) {
    await fetchLibrary(takeTheirs);
  } else {
    console.log("skipping fetch (--from-disk)");
  }

  const pages = loadPagesFromDisk();
  const statsPath = path.join(SOURCE, "stats.json");
  const templatesPath = path.join(SOURCE, "templates.json");
  if (!fs.existsSync(statsPath) || !fs.existsSync(templatesPath)) {
    throw new Error("stats.json or templates.json missing — run without --from-disk to fetch them");
  }
  const stats = JSON.parse(fs.readFileSync(statsPath, "utf8")) as AdGrantStats;
  const templates = JSON.parse(fs.readFileSync(templatesPath, "utf8")) as AdGrantTemplate[];
  assertLibrary(pages, stats, templates);
  generate(pages, stats, templates);
}

function runningAsMain(): boolean {
  const self = fileURLToPath(import.meta.url);
  const entry = process.argv[1];
  if (!entry) return false;
  return self === path.resolve(entry);
}

if (runningAsMain()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
