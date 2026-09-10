/**
 * Starter-template setup files. The live product publishes the structure at
 * GET /api/templates/<slug>; the list endpoint omits it. That payload is not
 * AdGrantAccountStructure: sitelinks sit on the account, campaigns have a
 * status and no bid strategy, match types are display strings. This module
 * maps one to the other and only then calls structureToEditorCsv. The CSV
 * writer is not widened to accept the live shape, because it is the file
 * somebody imports into a live Google Ads account.
 *
 * Structures live under data/adgrant/structures, not in shared/adgrant.ts.
 * That module is imported by the landing page.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  AdGrantAccountStructure,
  AdGrantKeywordMatchType,
  AdGrantSitelink,
  AdGrantTemplateFile,
  AdGrantTemplateFilesError,
  AdGrantTemplateFilesResponse,
} from "@shared/api";
import { TEMPLATES } from "@shared/adgrant";
import { domainFromHost, EDITOR_LINE, PAUSED_LINE, structureToEditorCsv } from "./generate";

export const UPLOAD_LINE =
  "Nothing is written into a Google Ads account. A person sets up the manager-account link afterwards if the structure should go into the grant account.";

export const ASSETS_LINE =
  "Callouts and structured snippets from the published template, as a list. They are not in the Google Ads Editor file; that file's importer does not write those row types.";

export const EDITOR_FILE_LINE =
  "The file Google Ads Editor imports. Campaigns, ad groups, keywords, ads and sitelinks. Every campaign row is Paused.";

/**
 * Live templates have no bid strategy. Accounts created on or after 22 April
 * 2019 must use conversion-based Smart bidding, so the mapped structure uses
 * this rather than copying a status the CSV would then ignore.
 */
export const TEMPLATE_BID_STRATEGY = "MAXIMIZE_CONVERSIONS" as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface LiveTemplateKeyword {
  text: string;
  matchType: string;
}

export interface LiveTemplateAd {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1?: string;
  path2?: string;
}

export interface LiveTemplateAdGroup {
  name: string;
  keywords: LiveTemplateKeyword[];
  ads: LiveTemplateAd[];
}

export interface LiveTemplateCampaign {
  name: string;
  status?: string;
  dailyBudget: number;
  adGroups: LiveTemplateAdGroup[];
}

export interface LiveTemplateSitelink {
  text: string;
  finalUrl: string;
  description1?: string;
  description2?: string;
}

export interface LiveTemplateCallout {
  text: string;
}

export interface LiveTemplateSnippet {
  header: string;
  values: string[];
}

export interface LiveTemplateLocation {
  id: string;
  name: string;
  canonicalName?: string;
}

/** The live /api/templates/<slug> structure, as stored on disk. */
export interface LiveTemplateStructure {
  callouts: LiveTemplateCallout[];
  campaigns: LiveTemplateCampaign[];
  languageCodes: string;
  languageIds: string[];
  locationIds: string[];
  locationList: LiveTemplateLocation[];
  sitelinks: LiveTemplateSitelink[];
  structuredSnippets: LiveTemplateSnippet[];
  totalDailyBudget: number;
}

export interface StoredTemplate {
  slug: string;
  title: string;
  niche: string;
  structure: LiveTemplateStructure;
}

export type MapLiveResult =
  | { ok: true; structure: AdGrantAccountStructure; extras: { callouts: LiveTemplateCallout[]; snippets: LiveTemplateSnippet[] } }
  | { ok: false; error: string };

export interface TemplateFilesHttpResult {
  status: number;
  body: AdGrantTemplateFilesResponse | AdGrantTemplateFilesError;
}

export function resolveStructuresDir(): string {
  const start = process.cwd();
  let dir = start;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, "data", "adgrant", "structures");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(start, "data", "adgrant", "structures");
}

export function mapMatchType(raw: string): AdGrantKeywordMatchType | null {
  const folded = raw.trim().toLowerCase().replace(/_/g, " ");
  if (folded === "broad" || folded === "broad match") return "BROAD";
  if (folded === "phrase" || folded === "phrase match") return "PHRASE";
  if (folded === "exact" || folded === "exact match") return "EXACT";
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value;
}

/**
 * Shape-check the live payload. A silent cast here would let a truncated
 * fetch become a CSV that imports and does nothing useful.
 */
export function parseLiveStructure(value: unknown): LiveTemplateStructure | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.campaigns) || row.campaigns.length === 0) return null;
  const campaigns: LiveTemplateCampaign[] = [];
  for (const item of row.campaigns) {
    if (item === null || typeof item !== "object") return null;
    const campaign = item as Record<string, unknown>;
    const name = asString(campaign.name);
    const dailyBudget = asNumber(campaign.dailyBudget);
    if (!name || dailyBudget === null || dailyBudget <= 0) return null;
    if (!Array.isArray(campaign.adGroups) || campaign.adGroups.length === 0) return null;
    const adGroups: LiveTemplateAdGroup[] = [];
    for (const groupValue of campaign.adGroups) {
      if (groupValue === null || typeof groupValue !== "object") return null;
      const group = groupValue as Record<string, unknown>;
      const groupName = asString(group.name);
      if (!groupName || !Array.isArray(group.keywords) || !Array.isArray(group.ads)) return null;
      const keywords: LiveTemplateKeyword[] = [];
      for (const keywordValue of group.keywords) {
        if (keywordValue === null || typeof keywordValue !== "object") return null;
        const keyword = keywordValue as Record<string, unknown>;
        const text = asString(keyword.text);
        const matchType = asString(keyword.matchType);
        if (!text || !matchType) return null;
        keywords.push({ text, matchType });
      }
      const ads: LiveTemplateAd[] = [];
      for (const adValue of group.ads) {
        if (adValue === null || typeof adValue !== "object") return null;
        const ad = adValue as Record<string, unknown>;
        const headlines = asStringList(ad.headlines);
        const descriptions = asStringList(ad.descriptions);
        const finalUrl = asString(ad.finalUrl);
        if (!headlines || headlines.length === 0 || !descriptions || descriptions.length === 0 || !finalUrl) {
          return null;
        }
        ads.push({
          headlines,
          descriptions,
          finalUrl,
          path1: asString(ad.path1) ?? undefined,
          path2: asString(ad.path2) ?? undefined,
        });
      }
      adGroups.push({ name: groupName, keywords, ads });
    }
    campaigns.push({
      name,
      status: asString(campaign.status) ?? undefined,
      dailyBudget,
      adGroups,
    });
  }

  const sitelinks: LiveTemplateSitelink[] = [];
  if (!Array.isArray(row.sitelinks)) return null;
  for (const item of row.sitelinks) {
    if (item === null || typeof item !== "object") return null;
    const link = item as Record<string, unknown>;
    const text = asString(link.text);
    const finalUrl = asString(link.finalUrl);
    if (!text || !finalUrl) return null;
    sitelinks.push({
      text,
      finalUrl,
      description1: asString(link.description1) ?? undefined,
      description2: asString(link.description2) ?? undefined,
    });
  }

  const callouts: LiveTemplateCallout[] = [];
  if (!Array.isArray(row.callouts)) return null;
  for (const item of row.callouts) {
    if (item === null || typeof item !== "object") return null;
    const text = asString((item as Record<string, unknown>).text);
    if (!text) return null;
    callouts.push({ text });
  }

  const structuredSnippets: LiveTemplateSnippet[] = [];
  if (!Array.isArray(row.structuredSnippets)) return null;
  for (const item of row.structuredSnippets) {
    if (item === null || typeof item !== "object") return null;
    const snippet = item as Record<string, unknown>;
    const header = asString(snippet.header);
    const values = asStringList(snippet.values);
    if (!header || !values || values.length === 0) return null;
    structuredSnippets.push({ header, values });
  }

  const locationList: LiveTemplateLocation[] = [];
  if (!Array.isArray(row.locationList)) return null;
  for (const item of row.locationList) {
    if (item === null || typeof item !== "object") return null;
    const location = item as Record<string, unknown>;
    const id = asString(location.id);
    const name = asString(location.name);
    if (!id || !name) return null;
    locationList.push({
      id,
      name,
      canonicalName: asString(location.canonicalName) ?? undefined,
    });
  }

  const languageCodes = asString(row.languageCodes);
  const totalDailyBudget = asNumber(row.totalDailyBudget);
  const languageIds = asStringList(row.languageIds);
  const locationIds = asStringList(row.locationIds);
  if (!languageCodes || totalDailyBudget === null || !languageIds || !locationIds) return null;

  return {
    callouts,
    campaigns,
    languageCodes,
    languageIds,
    locationIds,
    locationList,
    sitelinks,
    structuredSnippets,
    totalDailyBudget,
  };
}

export function parseStoredTemplate(value: unknown): StoredTemplate | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const slug = asString(row.slug);
  const title = asString(row.title);
  const niche = asString(row.niche);
  const structure = parseLiveStructure(row.structure);
  if (!slug || !title || !niche || !structure) return null;
  return { slug, title, niche, structure };
}

function organisationNameFromTitle(title: string): string {
  return title.replace(/\s+starter template$/i, "").trim() || title;
}

function authorisedDomainFrom(structure: LiveTemplateStructure): string | null {
  for (const campaign of structure.campaigns) {
    for (const group of campaign.adGroups) {
      for (const ad of group.ads) {
        try {
          return domainFromHost(new URL(ad.finalUrl).hostname);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function mapSitelinks(links: LiveTemplateSitelink[]): AdGrantSitelink[] {
  return links.map((link) => ({
    text: link.text,
    finalUrl: link.finalUrl,
    description1: link.description1,
    description2: link.description2,
  }));
}

/**
 * Live → ours. Status is dropped: the CSV writer always writes Paused.
 * Account sitelinks are copied onto every campaign, because our shape has
 * no account-level assets. Bid strategy is Maximize conversions, not a
 * field the live payload has.
 */
export function liveTemplateToStructure(stored: StoredTemplate): MapLiveResult {
  const live = stored.structure;
  const authorisedDomain = authorisedDomainFrom(live);
  if (!authorisedDomain) {
    return { ok: false, error: "This template has no https destination to authorise." };
  }
  const locations = live.locationList.map((item) => item.name).filter(Boolean);
  if (locations.length === 0) {
    return { ok: false, error: "This template has no geo-target." };
  }
  const sitelinks = mapSitelinks(live.sitelinks);
  const campaigns: AdGrantAccountStructure["campaigns"] = [];
  for (const campaign of live.campaigns) {
    const adGroups: AdGrantAccountStructure["campaigns"][number]["adGroups"] = [];
    for (const group of campaign.adGroups) {
      const keywords: AdGrantAccountStructure["campaigns"][number]["adGroups"][number]["keywords"] = [];
      for (const keyword of group.keywords) {
        const matchType = mapMatchType(keyword.matchType);
        if (!matchType) {
          return { ok: false, error: `This template uses a match type the CSV writer does not name: ${keyword.matchType}.` };
        }
        keywords.push({ text: keyword.text, matchType });
      }
      adGroups.push({
        name: group.name,
        keywords,
        ads: group.ads.map((ad) => ({
          headlines: ad.headlines,
          descriptions: ad.descriptions,
          finalUrl: ad.finalUrl,
          path1: ad.path1,
          path2: ad.path2,
        })),
      });
    }
    campaigns.push({
      name: campaign.name,
      dailyBudgetUsd: campaign.dailyBudget,
      bidStrategy: TEMPLATE_BID_STRATEGY,
      locations: [...locations],
      language: live.languageCodes,
      adGroups,
      sitelinks,
    });
  }
  return {
    ok: true,
    structure: {
      organisationName: organisationNameFromTitle(stored.title),
      authorisedDomain,
      dailyBudgetUsd: live.totalDailyBudget,
      smartBiddingRequired: true,
      campaigns,
    },
    extras: { callouts: live.callouts, snippets: live.structuredSnippets },
  };
}

function assetsText(extras: { callouts: LiveTemplateCallout[]; snippets: LiveTemplateSnippet[] }): string {
  const lines: string[] = ["Callouts", ""];
  for (const callout of extras.callouts) lines.push(callout.text);
  lines.push("", "Structured snippets", "");
  for (const snippet of extras.snippets) {
    lines.push(snippet.header);
    for (const value of snippet.values) lines.push(`  ${value}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function destinationLineFor(domain: string): string {
  return `Final URLs land on ${domain}, which is a placeholder in the published template. Replace them with the nonprofit's own https pages before anything runs.`;
}

function loadStored(slug: string): StoredTemplate | null {
  if (!SLUG.test(slug)) return null;
  const file = path.join(resolveStructuresDir(), `${slug}.json`);
  if (!existsSync(file)) return null;
  try {
    return parseStoredTemplate(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function templateSetupFiles(slug: string): TemplateFilesHttpResult {
  const known = TEMPLATES.some((template) => template.slug === slug);
  if (!known || !SLUG.test(slug)) {
    return { status: 404, body: { error: "That template is not in the library." } };
  }
  const stored = loadStored(slug);
  if (!stored) {
    return { status: 404, body: { error: "This template's setup files are not on this server." } };
  }
  const mapped = liveTemplateToStructure(stored);
  if (!mapped.ok) {
    return { status: 500, body: { error: mapped.error } };
  }
  const stem = slug.replace(/-ad-grant-template$/, "") || slug;
  const files: AdGrantTemplateFile[] = [
    {
      kind: "editor",
      filename: `${stem}-google-ads-editor.csv`,
      mime: "text/csv;charset=utf-8",
      body: structureToEditorCsv(mapped.structure),
      line: EDITOR_FILE_LINE,
    },
    {
      kind: "assets",
      filename: `${stem}-callouts-and-snippets.txt`,
      mime: "text/plain;charset=utf-8",
      body: assetsText(mapped.extras),
      line: ASSETS_LINE,
    },
  ];
  return {
    status: 200,
    body: {
      slug,
      files,
      pausedLine: PAUSED_LINE,
      editorLine: EDITOR_LINE,
      uploadLine: UPLOAD_LINE,
      destinationLine: destinationLineFor(mapped.structure.authorisedDomain),
    },
  };
}
