/**
 * Template setup files. Run with:
 *
 *   npx tsx --test server/adgrant/templates.test.ts
 *
 * The live structure is not ours. Mapping is the product: sitelinks move from
 * the account onto every campaign, bid strategy is Maximize conversions, and
 * campaign status is dropped because the CSV is always Paused.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TEMPLATES } from "@shared/adgrant";
import { policyHolds } from "./policy";
import { EDITOR_COLUMNS, EDITOR_LINE, PAUSED_LINE, structureToEditorCsv } from "./generate";
import {
  ASSETS_LINE,
  EDITOR_FILE_LINE,
  TEMPLATE_BID_STRATEGY,
  UPLOAD_LINE,
  destinationLineFor,
  liveTemplateToStructure,
  mapMatchType,
  parseStoredTemplate,
  resolveStructuresDir,
  templateSetupFiles,
  type StoredTemplate,
} from "./templates";

const FIXTURE: StoredTemplate = {
  slug: "youth-mentoring-ad-grant-template",
  title: "Youth Mentoring Starter Template",
  niche: "youth-mentoring",
  structure: {
    callouts: [{ text: "Trusted local program" }, { text: "Safe & supportive" }],
    campaigns: [
      {
        name: "Programs & Services",
        status: "Enabled",
        dailyBudget: 109.67,
        adGroups: [
          {
            name: "Youth Mentoring",
            keywords: [
              { text: "youth mentoring", matchType: "Broad match" },
              { text: "mentor a child", matchType: "Broad match" },
            ],
            ads: [
              {
                path1: "youth-mentoring",
                finalUrl: "https://www.example.org",
                headlines: [
                  "Youth Mentoring",
                  "Become a Youth Mentor Today",
                  "Support Local Youth Growth",
                  "Join Our Mentoring Program",
                  "Help Kids Reach Their Potentia",
                  "Enroll in After-School Care",
                  "Volunteer To Make a Difference",
                  "Donate for Scholarship Funds",
                  "Safe & Fun Summer Camps",
                  "Mentors Needed in Your Area",
                  "Empower Youth With Your Time",
                  "After-School Programs Open",
                ],
                descriptions: [
                  "Connect youth with caring adult mentors in your community.",
                  "Enroll children in safe after-school programs near you.",
                  "Support scholarships to help kids join enrichment camps.",
                  "Volunteer and make a lasting impact on young lives.",
                ],
              },
            ],
          },
          {
            name: "Mentor A Child",
            keywords: [{ text: "mentor a child near me", matchType: "Broad match" }],
            ads: [
              {
                path1: "mentor-a-child",
                finalUrl: "https://www.example.org",
                headlines: ["Mentor A Child", "Become a Youth Mentor Today"],
                descriptions: ["Connect youth with caring adult mentors in your community."],
              },
            ],
          },
        ],
      },
      {
        name: "Get Involved",
        status: "Enabled",
        dailyBudget: 109.67,
        adGroups: [
          {
            name: "Volunteer",
            keywords: [{ text: "volunteer for youth mentoring program", matchType: "Broad match" }],
            ads: [
              {
                path1: "volunteer",
                finalUrl: "https://www.example.org",
                headlines: ["Volunteer"],
                descriptions: ["Volunteer and make a lasting impact on young lives."],
              },
            ],
          },
          {
            name: "Donate",
            keywords: [{ text: "donate to youth mentoring program", matchType: "Broad match" }],
            ads: [
              {
                path1: "donate",
                finalUrl: "https://www.example.org",
                headlines: ["Donate"],
                descriptions: ["Support scholarships to help kids join enrichment camps."],
              },
            ],
          },
        ],
      },
    ],
    sitelinks: [
      {
        text: "Volunteer as Mentor",
        finalUrl: "https://www.example.org/volunteer",
        description1: "Learn how to become a mentor",
        description2: "Make a positive impact today",
      },
      {
        text: "After-School Programs",
        finalUrl: "https://www.example.org/after-school",
        description1: "Safe, supportive care options",
        description2: "Enroll your child now",
      },
    ],
    languageIds: ["1000"],
    locationIds: ["2840"],
    locationList: [{ id: "2840", name: "United States", canonicalName: "United States" }],
    languageCodes: "en",
    totalDailyBudget: 329,
    structuredSnippets: [
      { header: "Services", values: ["Mentor matching", "After-school care"] },
      { header: "Programs", values: ["Youth mentoring", "Academic tutoring"] },
    ],
  },
};

describe("mapMatchType", () => {
  it("maps the live display strings, and does not guess", () => {
    assert.equal(mapMatchType("Broad match"), "BROAD");
    assert.equal(mapMatchType("Phrase match"), "PHRASE");
    assert.equal(mapMatchType("Exact match"), "EXACT");
    assert.equal(mapMatchType("BROAD"), "BROAD");
    assert.equal(mapMatchType("something else"), null);
  });
});

describe("liveTemplateToStructure", () => {
  it("maps the live shape onto ours without copying Enabled or inventing a bid field on the live payload", () => {
    const mapped = liveTemplateToStructure(FIXTURE);
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(mapped.structure.organisationName, "Youth Mentoring");
    assert.equal(mapped.structure.authorisedDomain, "example.org");
    assert.equal(mapped.structure.dailyBudgetUsd, 329);
    assert.equal(mapped.structure.smartBiddingRequired, true);
    assert.equal(mapped.structure.campaigns.length, 2);
    for (const campaign of mapped.structure.campaigns) {
      assert.equal(campaign.bidStrategy, TEMPLATE_BID_STRATEGY);
      assert.deepEqual(campaign.locations, ["United States"]);
      assert.equal(campaign.language, "en");
      assert.equal(campaign.sitelinks.length, 2);
      assert.equal(campaign.sitelinks[0].text, "Volunteer as Mentor");
      assert.ok(campaign.adGroups.length >= 2);
    }
    assert.equal(mapped.structure.campaigns[0].adGroups[0].keywords[0].matchType, "BROAD");
    assert.equal(mapped.extras.callouts.length, 2);
    assert.equal(mapped.extras.snippets.length, 2);
    assert.equal(policyHolds(mapped.structure), true);
  });

  it("writes Paused into the Editor CSV even when the live campaign is Enabled", () => {
    const mapped = liveTemplateToStructure(FIXTURE);
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    const csv = structureToEditorCsv(mapped.structure);
    const campaignRows = csv.split("\n").filter((line) => line.startsWith("Campaign,"));
    assert.ok(campaignRows.length >= 2);
    for (const row of campaignRows) {
      assert.match(row, /Paused/);
      assert.equal(row.includes("Enabled"), false);
    }
    assert.match(csv, /Maximize conversions/);
    assert.match(csv, /United States/);
    assert.match(csv, /After-School Programs Open/);
    assert.match(csv, /Volunteer and make a lasting impact on young lives\./);
    assert.match(csv, /Volunteer as Mentor/);
    assert.equal(/upload/i.test(csv), false);
  });

  it("refuses a match type the CSV writer does not name", () => {
    const bad: StoredTemplate = structuredClone(FIXTURE);
    bad.structure.campaigns[0].adGroups[0].keywords[0].matchType = "Modified broad";
    const mapped = liveTemplateToStructure(bad);
    assert.equal(mapped.ok, false);
    if (mapped.ok) return;
    assert.match(mapped.error, /match type/);
  });
});

describe("templateSetupFiles", () => {
  it("hands over the Editor CSV and the assets list, and says paused before anyone would download", () => {
    const result = templateSetupFiles("youth-mentoring-ad-grant-template");
    assert.equal(result.status, 200);
    assert.ok("files" in result.body);
    const body = result.body;
    assert.equal(body.pausedLine, PAUSED_LINE);
    assert.equal(body.editorLine, EDITOR_LINE);
    assert.equal(body.uploadLine, UPLOAD_LINE);
    assert.equal(body.destinationLine, destinationLineFor("example.org"));
    assert.equal(body.files.length, 2);
    const editor = body.files.find((file) => file.kind === "editor");
    const assets = body.files.find((file) => file.kind === "assets");
    assert.ok(editor);
    assert.ok(assets);
    assert.equal(editor.line, EDITOR_FILE_LINE);
    assert.equal(assets.line, ASSETS_LINE);
    assert.match(editor.filename, /google-ads-editor\.csv$/);
    assert.match(editor.body, /^Row Type,Campaign,/);
    assert.match(editor.body, /Paused/);
    assert.equal(editor.body.includes("\nCampaign,") && /Enabled/.test(editor.body.split("\n").find((line) => line.startsWith("Campaign,")) ?? ""), false);
    assert.match(assets.body, /Trusted local program/);
    assert.match(assets.body, /Mentor matching/);
    assert.match(PAUSED_LINE, /Paused/);
    assert.equal(/upload/i.test(PAUSED_LINE), false);
    assert.match(UPLOAD_LINE, /Nothing is written into a Google Ads account/);
  });

  it("404s an unknown slug rather than inventing a structure", () => {
    const result = templateSetupFiles("not-a-template");
    assert.equal(result.status, 404);
    assert.ok("error" in result.body);
  });

  it("serves every published template from disk", () => {
    assert.equal(TEMPLATES.length, 12);
    for (const template of TEMPLATES) {
      const result = templateSetupFiles(template.slug);
      assert.equal(result.status, 200, template.slug);
      assert.ok("files" in result.body, template.slug);
      const editor = result.body.files.find((file) => file.kind === "editor");
      assert.ok(editor, template.slug);
      const campaignRows = editor.body.split("\n").filter((line) => line.startsWith("Campaign,"));
      assert.equal(campaignRows.length, template.stats.campaigns, template.slug);
      for (const row of campaignRows) {
        assert.match(row, /Paused/, template.slug);
      }
    }
  });
});

describe("parseStoredTemplate", () => {
  it("reads a published file from data/adgrant/structures", () => {
    const file = path.join(process.cwd(), "data", "adgrant", "structures", "youth-mentoring-ad-grant-template.json");
    const stored = parseStoredTemplate(JSON.parse(readFileSync(file, "utf8")));
    assert.ok(stored);
    assert.equal(stored.slug, "youth-mentoring-ad-grant-template");
    assert.equal(stored.structure.campaigns[0].status, "Enabled");
    const mapped = liveTemplateToStructure(stored);
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(policyHolds(mapped.structure), true);
    assert.equal(mapped.structure.campaigns[0].bidStrategy, "MAXIMIZE_CONVERSIONS");
  });
});

describe("the CSV, checked by content rather than by shape", () => {
  /* The review found every CSV assertion in this file was structural — a
     header prefix, a row count, a whole-file match for /Paused/. Deleting the
     quoting in generate.ts, or emptying every keyword list, left all 559
     tests green. These four are the mutations that survived. */

  function csvFor(slug: string): string {
    const result = templateSetupFiles(slug);
    assert.equal(result.status, 200, slug);
    const body = result.body;
    if (!("files" in body)) throw new Error(`${slug} returned an error, not files`);
    const editor = body.files.find((file) => file.kind === "editor");
    assert.ok(editor, `${slug} has no Editor file`);
    return editor.body;
  }

  const ALL = TEMPLATES.map((template) => template.slug);

  it("carries a keyword row for every keyword in every published template", () => {
    for (const slug of ALL) {
      const rows = csvFor(slug).split("\n").filter((line) => line.startsWith("Keyword,"));
      assert.ok(rows.length > 0, `${slug} produced a CSV with no keyword rows at all`);
      /* Nine per ad group is the median the product publishes; the assertion
         is only that the count is the structure's own, not a constant. */
      const stored = parseStoredTemplate(
        JSON.parse(readFileSync(path.join(resolveStructuresDir(), `${slug}.json`), "utf8")),
      );
      assert.ok(stored, slug);
      const expected = stored.structure.campaigns
        .flatMap((campaign) => campaign.adGroups)
        .reduce((total, group) => total + group.keywords.length, 0);
      assert.equal(rows.length, expected, slug);
    }
  });

  it("quotes a field containing a comma or a quote, so the columns cannot shift", () => {
    /* A single unquoted comma moves every later column by one, and the row
       still imports — into the wrong fields. */
    for (const slug of ALL) {
      for (const line of csvFor(slug).split("\n")) {
        if (!line) continue;
        let inQuotes = false;
        let columns = 1;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') i += 1;
            else inQuotes = !inQuotes;
          } else if (ch === "," && !inQuotes) columns += 1;
        }
        assert.equal(inQuotes, false, `${slug}: unbalanced quote in ${line.slice(0, 60)}`);
        assert.equal(columns, EDITOR_COLUMNS.length, `${slug}: ${columns} columns in ${line.slice(0, 60)}`);
      }
    }
  });

  it("pauses the ad groups too, not only the campaigns", () => {
    /* Every Paused assertion in this file filtered to Campaign rows. An ad
       group left Enabled under a paused campaign does not serve today and
       does the moment somebody unpauses the campaign, which is exactly when
       nobody is looking at the ad groups. */
    for (const slug of ALL) {
      const groups = csvFor(slug).split("\n").filter((line) => line.startsWith("Ad group,"));
      assert.ok(groups.length > 0, slug);
      for (const row of groups) assert.match(row, /Paused/, `${slug}: ${row.slice(0, 70)}`);
    }
  });

  it("holds the Ad Grant policy for all twelve, not only the two that were tested", () => {
    for (const slug of ALL) {
      const stored = parseStoredTemplate(
        JSON.parse(readFileSync(path.join(resolveStructuresDir(), `${slug}.json`), "utf8")),
      );
      assert.ok(stored, slug);
      const mapped = liveTemplateToStructure(stored);
      assert.equal(mapped.ok, true, slug);
      if (!mapped.ok) continue;
      assert.equal(policyHolds(mapped.structure), true, slug);
    }
  });
});

describe("parseLiveStructure refuses what it cannot trust", () => {
  /* It was only ever fed good files, so a hundred and twenty lines of
     validation had no test at all — and its own comment says a silent cast
     would let a truncated payload through. */
  function good(): unknown {
    return JSON.parse(
      readFileSync(path.join(resolveStructuresDir(), "youth-mentoring-ad-grant-template.json"), "utf8"),
    );
  }

  it("takes the published file", () => {
    assert.ok(parseStoredTemplate(good()));
  });

  it("refuses a payload with no campaigns, an empty ad group, or a missing keyword field", () => {
    const cases: { name: string; damage: (row: any) => void }[] = [
      { name: "no campaigns", damage: (row) => { row.structure.campaigns = []; } },
      { name: "campaigns not an array", damage: (row) => { row.structure.campaigns = {}; } },
      { name: "ad group with no keywords", damage: (row) => { delete row.structure.campaigns[0].adGroups[0].keywords; } },
      { name: "keyword with no text", damage: (row) => { delete row.structure.campaigns[0].adGroups[0].keywords[0].text; } },
      { name: "structure absent", damage: (row) => { delete row.structure; } },
    ];
    for (const { name, damage } of cases) {
      const row = good() as any;
      damage(row);
      assert.equal(parseStoredTemplate(row), null, `accepted a payload with ${name}`);
    }
  });
});

describe("shared/adgrant.ts", () => {
  it("does not ship the twelve structures in the module the landing page imports", () => {
    const source = readFileSync(new URL("../../shared/adgrant.ts", import.meta.url), "utf8");
    const start = source.indexOf("export const TEMPLATES");
    const end = source.indexOf("export const PAGES");
    assert.ok(start >= 0 && end > start);
    const templatesBlock = source.slice(start, end);
    assert.equal(templatesBlock.includes("locationList"), false);
    assert.equal(templatesBlock.includes("totalDailyBudget"), false);
    assert.equal(templatesBlock.includes("finalUrl"), false);
    assert.equal(templatesBlock.includes('"callouts":['), false);
    for (const template of TEMPLATES) {
      assert.equal("structure" in template, false, template.slug);
    }
  });
});
