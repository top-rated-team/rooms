/**
 * Generate an Ad Grant account structure from a nonprofit's website, check it,
 * and count it. Nothing here writes into a Google Ads account: there is no
 * Google Ads API client, no OAuth, no customer id, and the CSV is for Google
 * Ads Editor, which the nonprofit runs on their own machine.
 *
 * Identity is the layer that already exists — LinkedIn OIDC or the WhatsApp
 * click-to-chat proof in server/identity.ts. There is not a third way in.
 */

import { isIP } from "node:net";
import { adgrantGenerateSchema } from "@shared/schema-adgrant";
import type {
  AdGrantAccountStructure,
  AdGrantAdGroup,
  AdGrantCampaign,
  AdGrantGenerateError,
  AdGrantGenerateResponse,
  AdGrantKeyword,
  AdGrantQuotaView,
  AdGrantSitelink,
} from "@shared/api";
import { getBinding } from "../identity-store";
import { hydrateIdentityStore } from "../identity";
import { AD_GRANT_DAILY_BUDGET_USD, checkPolicy, policyHolds } from "./policy";
import {
  GENERATION_CAP_REASON,
  GENERATIONS_PER_PERSON,
  personKeyFor,
  quotaViewFor,
  quotaViewForPerson,
  recordGeneration,
  remainingForPerson,
} from "./quota";

export const EDITOR_LINE =
  "This CSV is for Google Ads Editor. Import it there. Nothing was written into a Google Ads account.";

export const PAUSED_LINE =
  "Every campaign in this file is Paused. Importing it does not start ads.";

export const UNBOUND_LINE =
  "A generation needs a room bound to you, through LinkedIn sign-in or a WhatsApp message to us. Those are the two identification routes that already exist; there is not a third.";

export const CAP_REACHED_LINE =
  "You have used the three generations this person is allowed. Three is capacity: a developer token is limited to 15,000 operations a day across every client, and one of these structures is about 150 of them if it were later written into an account.";

export const POLICY_REFUSED_LINE =
  "The generated structure failed Google's Ad Grants rules, so it was not shown and not counted. A structure Google would suspend is worse than no structure.";

const FETCH_TIMEOUT_MS = 12_000;
const FETCH_MAX_BYTES = 750_000;
const HEADLINE_MAX = 30;
const DESCRIPTION_MAX = 90;
const SITELINK_TEXT_MAX = 25;
const PATH_MAX = 15;

export interface SitePath {
  href: string;
  label: string;
}

export interface SiteSnapshot {
  organisationName: string;
  authorisedDomain: string;
  title: string;
  description: string;
  headings: string[];
  paths: SitePath[];
  origin: string;
}

export interface GenerateHttpResult {
  status: number;
  body: AdGrantGenerateResponse | AdGrantGenerateError | AdGrantQuotaView;
}

export function publicHttpsUrl(value: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "That is not a URL. Use the nonprofit's website, starting with https://" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https websites can be read." };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") {
    return { ok: false, error: "That address is not a public website." };
  }
  if (isIP(host) && isPrivateIp(host)) {
    return { ok: false, error: "That address is not a public website." };
  }
  return { ok: true, url: parsed };
}

function isPrivateIp(host: string): boolean {
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function domainFromHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeEntities(match[2] ?? match[3] ?? "") : null;
}

function metaContent(html: string, key: string): string {
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0];
  return tag ? (attr(tag, "content") ?? "").trim() : "";
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const sliced = text.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace >= 12 ? sliced.slice(0, lastSpace) : sliced).trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    const folded = key.toLowerCase();
    if (seen.has(folded)) continue;
    seen.add(folded);
    out.push(key);
  }
  return out;
}

function nameFromHost(host: string): string {
  const domain = domainFromHost(host);
  const stem = domain.split(".")[0] ?? domain;
  return stem.replace(/[-_]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function parseSiteHtml(html: string, finalUrl: URL, organisationName?: string): SiteSnapshot {
  const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
  const description =
    metaContent(html, "description") ||
    metaContent(html, "og:description") ||
    stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").trim());
  const ogTitle = metaContent(html, "og:title");
  const headings = unique(
    [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => clip(stripTags(match[2] ?? ""), 80)).filter(
      (text) => text.length >= 3,
    ),
  ).slice(0, 12);

  const origin = `${finalUrl.protocol}//${finalUrl.host}`;
  const authorisedDomain = domainFromHost(finalUrl.hostname);
  const paths: SitePath[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[1] ?? "", "href");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("mailto:") || href.toLowerCase().startsWith("javascript:")) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(href, finalUrl);
    } catch {
      continue;
    }
    if (domainFromHost(resolved.hostname) !== authorisedDomain) continue;
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    const path = resolved.pathname.replace(/\/+$/, "") || "/";
    if (seen.has(path)) continue;
    seen.add(path);
    const label = clip(stripTags(match[2] ?? ""), SITELINK_TEXT_MAX) || clip(path.replace(/\//g, " "), SITELINK_TEXT_MAX);
    if (!label) continue;
    paths.push({ href: `https://${authorisedDomain}${path === "/" ? "/" : path}`, label });
    if (paths.length >= 16) break;
  }

  const fromPage = organisationName?.trim() || ogTitle || title || nameFromHost(finalUrl.hostname);
  return {
    organisationName: clip(fromPage.replace(/\s*[|\-–—].*$/, ""), 60) || nameFromHost(finalUrl.hostname),
    authorisedDomain,
    title: title || fromPage,
    description: clip(description, 180),
    headings,
    paths,
    origin: `https://${authorisedDomain}`,
  };
}

export async function fetchSiteSnapshot(
  websiteUrl: string,
  organisationName?: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; site: SiteSnapshot } | { ok: false; error: string }> {
  const parsed = publicHttpsUrl(websiteUrl);
  if (!parsed.ok) return parsed;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(parsed.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
    });
    if (!response.ok) {
      return { ok: false, error: `The website responded ${response.status}, so nothing was generated.` };
    }
    const finalUrl = new URL(response.url || parsed.url.toString());
    const publicFinal = publicHttpsUrl(finalUrl.toString());
    if (!publicFinal.ok) return { ok: false, error: "The website redirected somewhere that is not a public page." };
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > FETCH_MAX_BYTES) {
      return { ok: false, error: "The website is too large to read in one go." };
    }
    const html = await response.text();
    if (html.length > FETCH_MAX_BYTES) {
      return { ok: false, error: "The website is too large to read in one go." };
    }
    return { ok: true, site: parseSiteHtml(html, publicFinal.url, organisationName) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "The website did not answer in time, so nothing was generated." };
    }
    return { ok: false, error: "The website could not be read, so nothing was generated." };
  } finally {
    clearTimeout(timer);
  }
}

function pageUrl(site: SiteSnapshot, ...needles: string[]): string {
  const found = site.paths.find((path) => {
    const hay = `${path.href} ${path.label}`.toLowerCase();
    return needles.some((needle) => hay.includes(needle));
  });
  return found?.href ?? `${site.origin}/`;
}

function phrase(...parts: string[]): string {
  return parts
    .join(" ")
    .replace(/[^a-zA-Z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function keyword(text: string): AdGrantKeyword | null {
  const cleaned = phrase(text);
  if (!cleaned) return null;
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length < 2) return null;
  if (cleaned.length > 80) return null;
  return { text: cleaned, matchType: "PHRASE" };
}

function keywords(texts: string[]): AdGrantKeyword[] {
  const out: AdGrantKeyword[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    const item = keyword(text);
    if (!item) continue;
    if (seen.has(item.text)) continue;
    seen.add(item.text);
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}

function ad(input: {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1?: string;
  path2?: string;
}): AdGrantAdGroup["ads"][number] {
  return {
    headlines: unique(input.headlines.map((line) => clip(line, HEADLINE_MAX))).slice(0, 8),
    descriptions: unique(input.descriptions.map((line) => clip(line, DESCRIPTION_MAX))).slice(0, 4),
    finalUrl: input.finalUrl,
    path1: input.path1 ? clip(input.path1.replace(/\s+/g, ""), PATH_MAX) : undefined,
    path2: input.path2 ? clip(input.path2.replace(/\s+/g, ""), PATH_MAX) : undefined,
  };
}

function sitelink(text: string, finalUrl: string, description1?: string, description2?: string): AdGrantSitelink {
  return {
    text: clip(text, SITELINK_TEXT_MAX),
    finalUrl,
    description1: description1 ? clip(description1, 35) : undefined,
    description2: description2 ? clip(description2, 35) : undefined,
  };
}

function splitBudget(count: number): number[] {
  const parts = Array.from({ length: count }, () => Math.floor(AD_GRANT_DAILY_BUDGET_USD / count));
  let rest = AD_GRANT_DAILY_BUDGET_USD - parts.reduce((sum, n) => sum + n, 0);
  for (let i = parts.length - 1; i >= 0 && rest > 0; i -= 1) {
    parts[i] += 1;
    rest -= 1;
  }
  return parts;
}

function headingPhrases(site: SiteSnapshot): string[] {
  return site.headings
    .map((heading) => phrase(heading))
    .filter((heading) => heading.split(" ").length >= 2)
    .slice(0, 6);
}

export function buildStructureFromSite(site: SiteSnapshot, location: string): AdGrantAccountStructure {
  const org = site.organisationName;
  const home = `${site.origin}/`;
  const donateUrl = pageUrl(site, "donate", "give", "support", "gift");
  const volunteerUrl = pageUrl(site, "volunteer", "help", "involve");
  const aboutUrl = pageUrl(site, "about", "mission", "who we", "our story");
  const programsUrl = pageUrl(site, "program", "service", "what we", "work");
  const contactUrl = pageUrl(site, "contact", "reach", "location");
  const causes = headingPhrases(site);
  const cause = causes[0] ?? phrase(org, "programs");
  const secondCause = causes[1] ?? phrase(org, "services");
  const budgets = splitBudget(2);

  const sitelinks = uniqueByUrl([
    sitelink("Donate", donateUrl, "Give on the nonprofit's site", "Open the donation page"),
    sitelink("About us", aboutUrl, "Mission and who we serve", "Read the organisation"),
    sitelink("Programs", programsUrl, "What the work looks like", "See current programs"),
    sitelink("Volunteer", volunteerUrl, "Give time, not only money", "See how to help"),
    sitelink("Contact", contactUrl, "Write or visit", "Hours and address"),
  ]).slice(0, 4);

  if (sitelinks.length < 2) {
    sitelinks.push(sitelink("Home", home, "The nonprofit's own site", "Start here"));
  }
  while (sitelinks.length < 2) {
    sitelinks.push(sitelink("Visit the site", home));
  }

  const brandGroup: AdGrantAdGroup = {
    name: `${org} — brand`,
    keywords: keywords([
      `${org} nonprofit`,
      `${org} official`,
      `about ${org}`,
      `${org} organisation`,
      `${org} website`,
    ]),
    ads: [
      ad({
        headlines: [org, `About ${org}`, `${org} nonprofit`, "Mission and programs", "Help from the source"],
        descriptions: [
          site.description || `${org} is a nonprofit. Read the mission, programs and how to help on their own site.`,
          `This ad lands on ${site.authorisedDomain}, the organisation's own website.`,
        ],
        finalUrl: home,
        path1: "about",
      }),
    ],
  };

  const programsGroup: AdGrantAdGroup = {
    name: `${org} — programs`,
    keywords: keywords([
      cause,
      secondCause,
      `${org} programs`,
      `${org} services`,
      `${cause} help`,
      `${org} ${cause}`,
    ]),
    ads: [
      ad({
        headlines: [
          clip(causes[0] || `${org} programs`, HEADLINE_MAX),
          `${org} programs`,
          "See how the work runs",
          clip(causes[1] || "Services and support", HEADLINE_MAX),
        ],
        descriptions: [
          `Programs run by ${org}. Read who they serve and how to get help or give it.`,
          "Open a program page on the nonprofit's own website.",
        ],
        finalUrl: programsUrl,
        path1: "programs",
      }),
    ],
  };

  const donateGroup: AdGrantAdGroup = {
    name: `${org} — donate`,
    keywords: keywords([
      `donate to ${org}`,
      `${org} donation`,
      `support ${org}`,
      `${org} donate`,
      `give to ${org}`,
    ]),
    ads: [
      ad({
        headlines: [`Donate to ${org}`, `Support ${org}`, "Give on their site", "Help fund the work"],
        descriptions: [
          `Donate to ${org} on their own website. The page is https.`,
          "Gifts support the programs described on the site, not a third-party landing page.",
        ],
        finalUrl: donateUrl,
        path1: "donate",
      }),
    ],
  };

  const volunteerGroup: AdGrantAdGroup = {
    name: `${org} — volunteer`,
    keywords: keywords([
      `volunteer with ${org}`,
      `${org} volunteering`,
      `volunteer at ${org}`,
      `help ${org}`,
      `${org} volunteer`,
    ]),
    ads: [
      ad({
        headlines: [`Volunteer with ${org}`, `Help at ${org}`, "Give time", "See open shifts"],
        descriptions: [
          `Volunteer with ${org}. Read what a shift involves, then sign up on their site.`,
          "Time as well as money: the volunteer page is on the nonprofit's own domain.",
        ],
        finalUrl: volunteerUrl,
        path1: "volunteer",
      }),
    ],
  };

  const campaignSitelinks = sitelinks.slice(0, 4);
  const campaigns: AdGrantCampaign[] = [
    {
      name: `${org} — brand and programs`,
      dailyBudgetUsd: budgets[0],
      bidStrategy: "MAXIMIZE_CONVERSIONS",
      locations: [location.trim()],
      language: "en",
      adGroups: [brandGroup, programsGroup],
      sitelinks: campaignSitelinks,
    },
    {
      name: `${org} — donate and volunteer`,
      dailyBudgetUsd: budgets[1],
      bidStrategy: "MAXIMIZE_CONVERSIONS",
      locations: [location.trim()],
      language: "en",
      adGroups: [donateGroup, volunteerGroup],
      sitelinks: campaignSitelinks,
    },
  ];

  return {
    organisationName: org,
    authorisedDomain: site.authorisedDomain,
    dailyBudgetUsd: AD_GRANT_DAILY_BUDGET_USD,
    smartBiddingRequired: true,
    campaigns,
  };
}

function uniqueByUrl(items: AdGrantSitelink[]): AdGrantSitelink[] {
  const seen = new Set<string>();
  const out: AdGrantSitelink[] = [];
  for (const item of items) {
    const key = `${item.text.toLowerCase()}|${item.finalUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function csvCell(value: string | number | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const EDITOR_HEADLINES = 15;
const EDITOR_DESCRIPTIONS = 4;

const EDITOR_COLUMNS = [
  "Row Type",
  "Campaign",
  "Campaign type",
  "Campaign state",
  "Budget",
  "Budget type",
  "Bid strategy type",
  "Location",
  "Languages",
  "Ad group",
  "Ad group state",
  "Keyword",
  "Match type",
  "Ad type",
  ...Array.from({ length: EDITOR_HEADLINES }, (_, i) => `Headline ${i + 1}`),
  ...Array.from({ length: EDITOR_DESCRIPTIONS }, (_, i) => `Description ${i + 1}`),
  "Path 1",
  "Path 2",
  "Final URL",
  "Link text",
  "Description line 1",
  "Description line 2",
  "Sitelink final URL",
] as const;

type EditorRow = Partial<Record<(typeof EDITOR_COLUMNS)[number], string | number>>;

function bidLabel(strategy: AdGrantCampaign["bidStrategy"]): string {
  switch (strategy) {
    case "MAXIMIZE_CONVERSIONS":
      return "Maximize conversions";
    case "MAXIMIZE_CONVERSION_VALUE":
      return "Maximize conversion value";
    case "TARGET_CPA":
      return "Target CPA";
    case "TARGET_ROAS":
      return "Target ROAS";
    case "MAXIMIZE_CLICKS":
      return "Maximize clicks";
    case "MANUAL_CPC":
      return "Manual CPC";
  }
}

/**
 * CSV Google Ads Editor can import (Account → Import). This is a file the
 * nonprofit downloads. It is not a write into their account from here.
 */
export function structureToEditorCsv(structure: AdGrantAccountStructure): string {
  const rows: EditorRow[] = [];
  for (const campaign of structure.campaigns) {
    rows.push({
      "Row Type": "Campaign",
      Campaign: campaign.name,
      "Campaign type": "Search",
      "Campaign state": "Paused",
      Budget: campaign.dailyBudgetUsd,
      "Budget type": "Daily",
      "Bid strategy type": bidLabel(campaign.bidStrategy),
      Location: campaign.locations.join("; "),
      Languages: campaign.language,
    });
    for (const sitelink of campaign.sitelinks) {
      rows.push({
        "Row Type": "Sitelink",
        Campaign: campaign.name,
        "Link text": sitelink.text,
        "Description line 1": sitelink.description1 ?? "",
        "Description line 2": sitelink.description2 ?? "",
        "Sitelink final URL": sitelink.finalUrl,
      });
    }
    for (const adGroup of campaign.adGroups) {
      rows.push({
        "Row Type": "Ad group",
        Campaign: campaign.name,
        "Ad group": adGroup.name,
        "Ad group state": "Paused",
      });
      for (const keyword of adGroup.keywords) {
        rows.push({
          "Row Type": "Keyword",
          Campaign: campaign.name,
          "Ad group": adGroup.name,
          Keyword: keyword.text,
          "Match type": keyword.matchType === "EXACT" ? "Exact" : keyword.matchType === "BROAD" ? "Broad" : "Phrase",
        });
      }
      for (const rsa of adGroup.ads) {
        const adRow: EditorRow = {
          "Row Type": "Ad",
          Campaign: campaign.name,
          "Ad group": adGroup.name,
          "Ad type": "Responsive search ad",
          "Path 1": rsa.path1 ?? "",
          "Path 2": rsa.path2 ?? "",
          "Final URL": rsa.finalUrl,
        };
        for (let i = 0; i < EDITOR_HEADLINES; i += 1) {
          adRow[`Headline ${i + 1}`] = rsa.headlines[i] ?? "";
        }
        for (let i = 0; i < EDITOR_DESCRIPTIONS; i += 1) {
          adRow[`Description ${i + 1}`] = rsa.descriptions[i] ?? "";
        }
        rows.push(adRow);
      }
    }
  }
  const header = EDITOR_COLUMNS.join(",");
  const lines = rows.map((row) => EDITOR_COLUMNS.map((column) => csvCell(row[column])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

function withQuota<T extends AdGrantGenerateError>(personKey: string | null, body: T): T {
  if (!personKey) return body;
  return { ...body, ...quotaViewFor(personKey) };
}

export async function getAdGrantGenerationQuota(workspaceId: string): Promise<GenerateHttpResult> {
  await hydrateIdentityStore();
  const binding = getBinding(workspaceId);
  if (!binding) {
    return { status: 403, body: { error: UNBOUND_LINE } };
  }
  const view = await quotaViewForPerson(personKeyFor(binding));
  return { status: 200, body: view };
}

export async function generateAdGrantStructure(input: {
  workspaceId: string;
  body: unknown;
  fetcher?: typeof fetch;
}): Promise<GenerateHttpResult> {
  await hydrateIdentityStore();
  const binding = getBinding(input.workspaceId);
  if (!binding) {
    return { status: 403, body: { error: UNBOUND_LINE } };
  }
  const personKey = personKeyFor(binding);
  const remaining = await remainingForPerson(personKey);
  if (remaining <= 0) {
    return {
      status: 429,
      body: withQuota(personKey, { error: CAP_REACHED_LINE }),
    };
  }

  const parsed = adgrantGenerateSchema.safeParse(input.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return {
      status: 400,
      body: withQuota(personKey, {
        error: first ? `${where}${first.message}` : "The request is missing the website and the location.",
      }),
    };
  }

  const website = publicHttpsUrl(parsed.data.websiteUrl);
  if (!website.ok) {
    return { status: 400, body: withQuota(personKey, { error: website.error }) };
  }

  const fetched = await fetchSiteSnapshot(parsed.data.websiteUrl, parsed.data.organisationName, input.fetcher);
  if (!fetched.ok) {
    const clientMistake =
      fetched.error.includes("not a URL") ||
      fetched.error.includes("not a public website") ||
      fetched.error.includes("Only http");
    return { status: clientMistake ? 400 : 502, body: withQuota(personKey, { error: fetched.error }) };
  }

  const structure = buildStructureFromSite(fetched.site, parsed.data.location);
  const issues = checkPolicy(structure);
  if (issues.length > 0 || !policyHolds(structure)) {
    return {
      status: 500,
      body: withQuota(personKey, {
        error: `${POLICY_REFUSED_LINE} ${issues.map((issue) => issue.message).join(" ")}`.trim(),
      }),
    };
  }

  const recorded = await recordGeneration({ personKey, workspaceId: input.workspaceId });
  if (!recorded.recorded) {
    return {
      status: 429,
      body: withQuota(personKey, { error: CAP_REACHED_LINE }),
    };
  }

  const view = quotaViewFor(personKey);
  const body: AdGrantGenerateResponse = {
    ...view,
    remaining: recorded.remaining,
    structure,
    csv: structureToEditorCsv(structure),
    editorLine: EDITOR_LINE,
    pausedLine: PAUSED_LINE,
  };
  return { status: 200, body };
}

export { GENERATION_CAP_REASON, GENERATIONS_PER_PERSON };
