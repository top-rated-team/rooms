/**
 * data/builds/*.json  →  shared/builds.ts
 *
 *   npx tsx scripts/build-builds.ts
 *
 * WHAT THESE ARE, and why they are not case studies. shared/cases.ts holds 22
 * results for named clients, each with metrics taken from that client's own
 * account. These are the things WE built: this application, AdGrant.AI, Top
 * Voice, WarmLike, an Upwork proposal agent, and a custom GPT. There is no
 * client, no engagement and no metric, and giving them one would be inventing
 * the only part that matters.
 *
 * So they are a portfolio, and the honest rendering of a portfolio is: what it
 * is, what we built in it, and a link to go and look. The owner asked for them
 * "as this service case studies", and this is that ask answered in the one way
 * that does not require making numbers up.
 *
 * GENERATED, for the same reason cases.ts is: every line of source was fetched
 * from the live product and then attacked by a second agent whose whole job was
 * to find claims the page does not support. `unverifiedClaims` is what survived
 * that — it is not decoration, and a renderer may use it to decide what NOT to
 * print. Editing the output by hand throws all of that away silently.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "data/builds";
const OUT = "shared/builds.ts";

/** The order they are shown in, and it is an argument rather than a sort. */
const ORDER = [
  "top-rated-team",       // the one the reader is standing in
  "adgrant-ai",           // a tool that runs by itself, with its own door
  "top-voice",            // the partner's engine, and ours to have built
  "warmlike",
  "upwork-auto-apply",    // an agent that does a job, not a site
  "being-existential-coach",
];

interface RawBuild {
  slug: string;
  name: string;
  url: string | null;
  oneLine: string;
  what: string;
  built: string[] | string;
  status?: string;
  notes?: string;
  forPartner?: string;
  descriptionSourceUrl?: string;
  brandTypography?: string;
  unverifiedClaims?: string[];
}

const files = readdirSync(SOURCE).filter((f) => f.endsWith(".json"));
const raw = new Map<string, RawBuild>();
for (const file of files) {
  const parsed = JSON.parse(readFileSync(join(SOURCE, file), "utf8")) as RawBuild;
  raw.set(parsed.slug, parsed);
}

const unknown = [...raw.keys()].filter((slug) => !ORDER.includes(slug));
if (unknown.length > 0) {
  console.error(`Not in ORDER, so nothing decides where they go: ${unknown.join(", ")}`);
  process.exit(1);
}

const builds = ORDER.map((slug) => {
  const b = raw.get(slug);
  if (!b) {
    console.error(`ORDER names "${slug}" and ${SOURCE} has no file for it`);
    process.exit(1);
  }
  return {
    slug: b.slug,
    name: b.name,
    url: b.url ?? null,
    oneLine: b.oneLine,
    what: b.what,
    built: Array.isArray(b.built) ? b.built : [b.built],
    forPartner: b.forPartner ?? null,
    unverifiedClaims: b.unverifiedClaims ?? [],
  };
});

const body = `/**
 * GENERATED — do not edit. Run \`npx tsx scripts/build-builds.ts\`.
 *
 * The things this company has built, as data. Not case studies: there is no
 * client and no metric here, because these are ours. Read the header of
 * scripts/build-builds.ts for why that distinction is kept.
 *
 * \`unverifiedClaims\` carries what a second agent could not confirm against the
 * live product. A renderer is free to use it to decide what not to print; what
 * it may not do is print a claim listed there as though it were checked.
 */

export interface Build {
  slug: string;
  name: string;
  /** Where to go and look. Null for the two with no public page. */
  url: string | null;
  /** Under 90 characters. What it is. */
  oneLine: string;
  what: string;
  /** The parts worth naming, in the product's own terms. */
  built: string[];
  /** Written for the partner door, where two of these are what is being sold. */
  forPartner: string | null;
  /** What could not be confirmed against the live product. */
  unverifiedClaims: string[];
}

export const BUILDS: Build[] = ${JSON.stringify(builds, null, 2)};

export const BUILD_BY_SLUG: Record<string, Build> = Object.fromEntries(
  BUILDS.map((build) => [build.slug, build]),
);

/** The two the partner door describes, in the order that door shows them. */
export const PARTNER_BUILDS: Build[] = BUILDS.filter((build) => build.forPartner !== null);
`;

writeFileSync(OUT, body);
console.log(`${OUT}: ${builds.length} builds, ${builds.filter((b) => b.forPartner).length} of them the partner's`);
