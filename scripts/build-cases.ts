/**
 * Turns data/cases-source.json into shared/cases.ts.
 *
 *   npx tsx scripts/build-cases.ts
 *
 * The source is every case study published on top-rated.team, extracted from
 * the rendered page: twenty-two of them, each with the challenge, the objective,
 * the work as it was listed, and the result metrics with their percentage
 * changes. Nothing here is written by hand and nothing is invented — a case
 * study is a claim about somebody else's account, and the only defensible
 * version of it is the one already published.
 *
 * WHICH DOOR A CASE BELONGS TO IS DERIVED, not assigned. The rules below read
 * the case's own text, so a case cannot end up under a door it says nothing
 * about, and re-running this after the source changes re-derives it.
 *
 * There are no screenshots. The source page carries four images: the logo
 * twice and two tracking pixels. Making account screenshots for these would
 * mean manufacturing evidence for a claim, which is the one thing a case study
 * must not do. The metrics are the visual.
 */
import fs from "node:fs";

interface SourceCase {
  client: string;
  industry: string | null;
  badges: string[];
  challenge: string | null;
  objective: string | null;
  work: string[];
  metrics: Array<{ label: string; value: string; change: string }>;
}

const source: SourceCase[] = JSON.parse(fs.readFileSync("data/cases-source.json", "utf8"));

/** A stable id from the client name, so a link to a case survives a reword. */
function slugOf(client: string): string {
  return client
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * Read the door out of the case. A case belongs to Ad Grants if it says Ad
 * Grant, to the measurement door if the work was conversion tracking, to the
 * audit door if the work began with an audit — and to Google Ads management
 * otherwise, which is what nearly all of them are.
 */
function doorsFor(c: SourceCase): string[] {
  const text = `${c.challenge ?? ""} ${c.objective ?? ""} ${c.work.join(" ")} ${c.client}`.toLowerCase();
  const doors: string[] = [];
  const grant = /ad grant/.test(text);
  if (grant) doors.push("ad-grants");
  if (/conversion tracking|offline conversion/.test(text)) doors.push("chatgpt-ads");
  if (/\baudit\b/.test(text)) doors.push("paid-ads-audit");
  if (!grant) doors.push("google-ads");
  return doors;
}

/** The region and the budget, which arrive as badges in whatever order. */
function placeAndBudget(badges: string[]): { place: string | null; budget: string | null } {
  const money = badges.find((b) => /[$€£]|grants/i.test(b)) ?? null;
  const place = badges.find((b) => b !== money) ?? null;
  return { place, budget: money };
}

const cases = source.map((c) => {
  const { place, budget } = placeAndBudget(c.badges);
  return {
    slug: slugOf(c.client),
    client: c.client,
    industry: c.industry,
    place,
    budget,
    challenge: c.challenge,
    objective: c.objective,
    work: c.work,
    metrics: c.metrics,
    doors: doorsFor(c),
  };
});

const header = `/**
 * GENERATED — do not edit. Run \`npx tsx scripts/build-cases.ts\`.
 *
 * Every case study published on top-rated.team, as data: the challenge, the
 * objective, the work as it was listed, and the result metrics with their
 * percentage changes. ${cases.length} of them.
 *
 * Generated rather than written because a case study is a claim about somebody
 * else's account. Editing one by hand is how a number drifts from the account
 * it came out of, and a case study with a drifted number is worse than none.
 *
 * \`doors\` is derived from each case's own text by scripts/build-cases.ts, so a
 * case cannot sit under a door it says nothing about. Five doors have no case:
 * linkedin-ads, linkedin-automation, ai-builds, white-label and the partner's
 * row. They render no case section — an absence says nothing, where a note
 * about the absence would draw attention to it.
 */

export interface CaseMetric {
  label: string;
  value: string;
  change: string;
}

export interface CaseStudy {
  slug: string;
  client: string;
  industry: string | null;
  /** Region, as published. */
  place: string | null;
  /** Spend, as published — a daily figure for some, a monthly one for others. */
  budget: string | null;
  challenge: string | null;
  objective: string | null;
  work: string[];
  metrics: CaseMetric[];
  /** Door ids this case is evidence for. Derived, never assigned. */
  doors: string[];
}

export const CASES: CaseStudy[] = ${JSON.stringify(cases, null, 2)};

export function casesForDoor(doorId: string): CaseStudy[] {
  return CASES.filter((entry) => entry.doors.includes(doorId));
}

export const CASE_BY_SLUG: Record<string, CaseStudy> = Object.fromEntries(CASES.map((c) => [c.slug, c]));
`;

fs.writeFileSync("shared/cases.ts", header);
const byDoor = new Map<string, number>();
for (const c of cases) for (const d of c.doors) byDoor.set(d, (byDoor.get(d) ?? 0) + 1);
console.log(`shared/cases.ts — ${cases.length} cases`);
for (const [door, n] of [...byDoor].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${door}`);
