/**
 * Writes the two files an arriving agent reads: client/public/llms.txt and
 * client/public/llms-full.txt.
 *
 *   npm run build          # writes both first, through the prebuild hook
 *   npx tsx scripts/build-llms.ts
 *
 * Both are generated, for the reason sitemap.xml gives for itself: a
 * hand-written description of seven offers goes stale the first time somebody
 * corrects a row. Every offer on this site is a row in shared/doors.ts and
 * every door page renders that row, so these two files render the same rows
 * into text. Correct a headline, a blurb, an invoice line or a legal name there
 * and both files say the new thing on the next build. Nothing is typed twice.
 *
 * WHY THERE ARE TWO, AND WHY THE FIRST IS SHORT.
 *
 * connectsafely.ai publishes this pair at 227 KB and 235 KB, opening on the
 * same three paragraphs, the second being the first with more of the same
 * behind it. An index the size of the thing it indexes is not an index: an
 * agent that has to read 227 KB to learn what a site sells may as well have
 * crawled the site. So llms.txt here is a few kilobytes — what this is, one
 * line per offer with its address, and what is deliberately absent — and
 * llms-full.txt is the long one, carrying everything each door page prints.
 *
 * WHAT IS LEFT OUT, AND WHY.
 *
 * - Rooms. A room's address is /w/<token>, and that token is a bearer
 *   credential living in the URL, so writing one down publishes it. robots.txt
 *   disallows /w/ and those pages carry noindex; a text file at the root is
 *   exactly as public as robots.txt, so it gets the same treatment.
 * - The offers a stranger is not shown. /services names some of them only after
 *   an email step, they are absent from sitemap.xml, and their pages are
 *   noindex. Naming them in a file at the root would publish precisely what
 *   that step withholds, so PUBLIC_TIERS below is the rule the pages use.
 * - Prices, budgets, timelines and promised results. The site publishes none,
 *   and neither does this.
 *
 * There is no "last updated" line. The output is a pure function of the rows,
 * so two builds of one tree produce byte-identical files and a real change is
 * the only thing that ever appears in a diff.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ChatGptAdsBody from "../client/src/components/site/doors/ChatGptAdsBody";
import {
  DEFAULT_DOOR_ID,
  DOORS,
  DOOR_BY_ID,
  DOOR_TIERS,
  doorAgent,
  type DoorDef,
  type DoorTier,
} from "../shared/doors";

/* --------------------------------- where ---------------------------------- */

/**
 * The canonical origin, spelled the way robots.txt, sitemap.xml and
 * render.yaml's PUBLIC_BASE_URL spell it. Deliberately not read from the
 * environment: these files are committed, and a build host carrying a different
 * value would rewrite every address in them.
 */
const ORIGIN = "https://ai.top-rated.team";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "..", "client", "public");

const url = (pathname: string): string => `${ORIGIN}${pathname}`;

/* ------------------------------ which offers ------------------------------ */

/**
 * The tiers a stranger reads without telling us anything.
 *
 * The rule itself lives in client/src/components/site/GatedOffers.tsx, which is
 * where the split is decided and the only place the pages read it from. A build
 * script cannot import that module without pulling wouter, React and half the
 * client tree into the build, so the rule is spelled again here — the same
 * compromise, and the same warning, sitemap.xml already carries. Change
 * PUBLIC_TIERS there and change it here. The handoff asking for that list to
 * move into shared/doors.ts, so both can import one copy, is in the report.
 */
const PUBLIC_TIERS: DoorTier[] = ["white", "light-grey"];

const PUBLIC_DOORS: DoorDef[] = DOORS.filter((door) => PUBLIC_TIERS.includes(door.tier));

/** Whether a door has a panel a visitor can use — the test door.tsx applies before rendering one. */
const answers = (door: DoorDef): boolean => door.status === "live" && doorAgent(door) !== undefined;

const ANSWERING = PUBLIC_DOORS.filter(answers);
const SHUT = PUBLIC_DOORS.filter((door) => !answers(door));

/** Counts written out, the way every sentence on the site that counts offers writes them. */
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (count: number): string => COUNT_WORDS[count] ?? String(count);
const countWordCapital = (count: number): string => countWord(count).replace(/^./, (c) => c.toUpperCase());

/** The company that runs the site, read off the door that pays for it rather than typed again. */
const OURS = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;

/** The first sentence of a blurb — what an index row needs, and the cut the home page makes. */
function firstSentence(text: string): string {
  const end = text.indexOf(". ");
  return end === -1 ? text : text.slice(0, end + 1);
}

/* -------------------------------- plain text ------------------------------- */

const WIDTH = 78;

/** Wraps prose. Never applied to a link line: a wrapped URL would not survive a line-based reader. */
function wrap(text: string, width = WIDTH): string {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  if (line) out.push(line);
  return out.join("\n");
}

/** A wrapped list item: the marker on the first line, continuations indented under it. */
function bullet(text: string, marker = "- "): string {
  const pad = " ".repeat(marker.length);
  return wrap(text, WIDTH - marker.length)
    .split("\n")
    .map((line, index) => (index === 0 ? marker + line : pad + line))
    .join("\n");
}

/** Blocks, one blank line between them. Anything empty drops out rather than leaving a gap. */
const paragraphs = (...blocks: (string | null | undefined | false)[]): string =>
  blocks.filter((block): block is string => Boolean(block)).join("\n\n");

/** The blockquote an llms.txt file is read from first. */
const quoted = (text: string): string =>
  wrap(text, WIDTH - 2)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

/* --------------------- the one door with more than a row ------------------- */

/*
 * Every door but one is its row and nothing else, which is what makes seven
 * offers cost roughly what one costs. The ChatGPT Ads door has a section of its
 * own — the seven places a conversion-tracking engagement goes wrong, the four
 * steps, the two results and the six objections — and it is the most useful
 * writing on the site to anyone deciding whether to buy, so llms-full.txt would
 * be poorer for leaving it out.
 *
 * It is read by rendering the component that draws it and taking the text back
 * out, never by retyping any of it. That is the whole point: the copy lives in a
 * file this script does not own, and the only way for a second copy not to
 * drift is for there not to be one.
 */

/** Tags that end the line they are on. Everything else is inline, and only its text survives. */
const BLOCK_TAGS = new Set([
  "blockquote", "dd", "details", "div", "dl", "dt", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "li", "ol", "p", "section", "summary", "table", "tr", "ul",
]);

/** React escapes five characters on the way out and leaves every typographic one as itself. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'" };

const decode = (text: string): string =>
  text.replace(/&(#x27|#39|amp|lt|gt|quot);/g, (_, name: string) => ENTITIES[name]);

function componentToText(component: ComponentType): string {
  const html = renderToStaticMarkup(createElement(component));

  /* Two things this converter cannot carry, and it says so rather than dropping
   * them quietly: a link would lose its address, which on this site is usually
   * the point of the sentence, and an image would lose its alt text. If either
   * appears, teach the loop below about it. */
  if (/<a[\s>]/i.test(html)) throw new Error("build-llms: the door body has a link now, and this converter drops hrefs");
  if (/<img[\s>]/i.test(html)) throw new Error("build-llms: the door body has an image now, and this converter drops it");

  const cleaned = html
    // A machine copy of the questions printed under it. Once is enough.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    // The numerals in the margin are aria-hidden because they are decoration.
    // On a line of their own in a text file they are furniture.
    .replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/gi, "");

  /* Each top-level section is converted on its own, because heading depth on
   * the page is relative to the section and not to the document: the two
   * results open on an h3 with no h2 above them, and read as a third and
   * fourth step of the section before them if their depth is taken literally. */
  const sections = cleaned.split(/(?=<section\b)/).filter((chunk) => chunk.trim());
  const text = sections.map(sectionToText).filter(Boolean).join("\n\n");

  if (!text) throw new Error("build-llms: the door body rendered no text");
  return text;
}

function sectionToText(html: string): string {
  /* Whatever this section's own top heading is becomes "###", and everything
   * under it follows from that. `summary` is the question on a collapsed
   * answer, which sits one level in. */
  const levels = [...html.matchAll(/<h([1-4])\b/g)].map((match) => Number(match[1]));
  const top = levels.length > 0 ? Math.min(...levels) : 3;

  const hashes = (tag: string): string => {
    const heading = /^h([1-4])$/.exec(tag);
    if (heading) return "#".repeat(3 + Number(heading[1]) - top);
    return tag === "summary" ? "####" : "";
  };

  const blocks: string[] = [];
  let buffer = "";
  let prefix = "";

  const flush = (): void => {
    const text = buffer.replace(/\s+/g, " ").trim();
    if (text) blocks.push(prefix ? `${prefix} ${text}` : wrap(text));
    buffer = "";
    prefix = "";
  };

  const token = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+)/g;
  for (let match = token.exec(html); match !== null; match = token.exec(html)) {
    const [raw, tag, text] = match;
    if (text !== undefined) {
      buffer += decode(text);
      continue;
    }
    const name = tag.toLowerCase();
    if (!BLOCK_TAGS.has(name)) continue;
    flush();
    if (!raw.startsWith("</")) prefix = hashes(name);
  }
  flush();

  return blocks.join("\n\n");
}

/* ------------------------------ shared copy ------------------------------- */

/**
 * The summary both files open on. Every clause is checkable against a page: the
 * count is PUBLIC_DOORS, which is what the home page and /services count in
 * words; the invoice sentence is on every row; and "no price" is the rule in
 * docs/doors.md that the agents' own prompts refuse to break.
 */
const SUMMARY = [
  "Paid advertising, the measurement under it, and the custom AI around both.",
  `${countWordCapital(PUBLIC_DOORS.length)} offers a visitor can read here, and one room behind all of them.`,
  "Where a service is contracted and invoiced by a partner rather than by Top-Rated Team, its row says so.",
  "Every price the site publishes is on one page, /pricing, and the agents may repeat those and no others.",
].join(" ");

/**
 * How a visit goes, in the words the pages use: the panel's own two lines, the
 * "nothing is saved yet" promise under it, the sentence about the room, and the
 * state the panel shows on a deployment with no key.
 */
const HOW_IT_WORKS = [
  bullet(
    "Each offer has a page of its own. Where the offer is open, that page carries a panel: a visitor asks a " +
      "question in it, an agent answers from documentation and links the pages it used, and that costs " +
      "nothing and does not need their name.",
  ),
  bullet(
    "The conversation is not saved while that is happening, and the page says so under the answer: nothing is " +
      "saved yet, close the tab and it is gone.",
  ),
  bullet(
    "A conversation the visitor keeps becomes a room at an address of its own, with our agents and our people " +
      "in it and no signup — the link in the browser is the whole account.",
  ),
  /* Written three ways because the counts move: a door opening is one word in
   * shared/doors.ts, and a sentence that reads correctly at four-of-six and
   * says "the other one have" at five-of-six is a sentence waiting to go wrong
   * on somebody else's commit. */
  bullet(
    SHUT.length === 0
      ? "Every offer below answers questions today."
      : `${countWordCapital(ANSWERING.length)} of the ${countWord(PUBLIC_DOORS.length)} offers below answer ` +
        `questions today. The remaining ${countWord(SHUT.length)} ` +
        (SHUT.length === 1
          ? "has a page and no panel on it yet, and that page says in one sentence why."
          : "have a page and no panel on them yet, and each of those pages says in one sentence why."),
  ),
  bullet(
    "Live answers need an OpenAI key on the deployment. Without one the panel says they are not configured, " +
      "rather than producing something shaped like an answer.",
  ),
].join("\n");

/**
 * The absences, stated. An agent that cannot find the rooms or the API should be
 * told they were left out on purpose rather than left to decide the file is
 * unfinished. Nothing here names a withheld offer: saying one is withheld is a
 * different act from naming it, and robots.txt already publishes both Disallow
 * lines this section refers to.
 */
const NOT_HERE = [
  bullet(
    "Room addresses. A kept conversation lives at /w/<token>, and that token is a bearer credential in the " +
      "URL: writing one down publishes it. robots.txt disallows /w/, those pages carry noindex, and this file " +
      "leaves them out for the same reason.",
  ),
  bullet("The HTTP API. robots.txt disallows /api/ as well, and this file follows it."),
  bullet(
    "Prices, budgets, timelines and promised results. No page publishes any of them, and the agents are " +
      "instructed to say that pricing and scope come from a person rather than produce a figure.",
  ),
  /* Only while there is something behind the step. If every row ever becomes
   * public this sentence would be describing offers that do not exist. */
  DOORS.length > PUBLIC_DOORS.length
    ? bullet(
        `More offers than the ${countWord(PUBLIC_DOORS.length)} listed. ${url("/services")} asks for an email ` +
          "address before it names them, they are absent from sitemap.xml, and their pages are noindex — so a " +
          "file at the root does not name them either.",
      )
    : null,
]
  .filter(Boolean)
  .join("\n");

/* -------------------------------- llms.txt -------------------------------- */

/** One offer, one line, in the shape the convention uses: `- [name](url): notes`. */
function indexLine(door: DoorDef): string {
  const tier = DOOR_TIERS[door.tier];
  const state = answers(door) ? "" : " Not open yet.";
  return `- [${door.headline}](${url(door.path)}): ${firstSentence(door.blurb)}${state} ${tier.label}; invoiced by ${door.contract.legalName}.`;
}

function shortIndex(): string {
  return `${paragraphs(
    "# Top-Rated Team — ai.top-rated.team",
    quoted(SUMMARY),
    wrap(
      "This is the short index. llms-full.txt beside it is the same material at length. Both are written by " +
        "scripts/build-llms.ts out of shared/doors.ts and the pages themselves, so neither can describe an " +
        "offer this site does not make.",
    ),
    "## How a visit works",
    HOW_IT_WORKS,
    "## Offers",
    PUBLIC_DOORS.map(indexLine).join("\n"),
    "## Pages",
    [
      `- [Home](${url("/")}): what the company does, the panel, and the index of the offers.`,
      `- [The index](${url("/services")}): every offer above as one row, with the company that would invoice it.`,
      `- [robots.txt](${url("/robots.txt")}): what crawlers are asked to leave alone.`,
      `- [sitemap.xml](${url("/sitemap.xml")}): the addresses handed to crawlers.`,
    ].join("\n"),
    "## Not in this file",
    NOT_HERE,
    "## Optional",
    `- [llms-full.txt](${url("/llms-full.txt")}): every offer's full description, the agent that answers it, the questions its panel offers, the company that signs it, and the argument the conversion-tracking page makes at length.`,
  )}\n`;
}

/* ------------------------------ llms-full.txt ----------------------------- */

/** Everything a door page prints, in the order the page prints it. */
function fullEntry(door: DoorDef, position: number): string {
  const tier = DOOR_TIERS[door.tier];
  const agent = doorAgent(door);
  const contract = door.contract;

  const status = answers(door)
    ? "Status: open, with a panel on the page."
    : door.status === "live"
      ? "Status: open, and no agent of ours answers in it."
      : `Status: not open yet. ${door.comingLine ?? ""}`.trim();

  /* The starters are printed only where there is a panel to print them in. On a
   * door that is not open the page renders no panel at all, so listing its
   * questions here would offer something the page does not — while the line
   * naming who would answer is printed either way, and says so.
   *
   * Where there is a panel, it prints the first four and puts the rest behind a
   * control saying how many there are. Which four come first is worth keeping:
   * those are the questions the offer leads with. */
  const hidden = door.starters.length - 4;
  const panel = answers(door)
    ? paragraphs(
        wrap(`Panel: ${door.agentLine}`),
        hidden > 0
          ? `Questions the panel offers. It prints the first four and puts the rest behind a "${hidden} more" control:`
          : "Questions the panel offers:",
        door.starters.map((question) => bullet(question)).join("\n"),
      )
    : wrap(
        agent
          ? `No panel yet, and no questions printed. The page still names who would answer: ${door.agentLine}`
          : `No panel. ${door.agentLine}`,
      );

  return paragraphs(
    `### ${position}. ${door.headline}`,
    url(door.path),
    wrap(door.blurb),
    wrap(status),
    wrap(`Tier: ${tier.label}. ${tier.meaning}`),
    panel,
    door.tool && paragraphs(`Runs on a tool of ours: ${door.tool.name} — ${door.tool.href}`, wrap(door.tool.line)),
    paragraphs(
      wrap(`Who you would be buying from: ${contract.legalName}. ${contract.entity} ${contract.invoiceLine}`),
      [
        contract.termsUrl
          ? `Terms: ${contract.termsUrl}`
          : wrap(
              `Terms: none. ${contract.legalName} has not published terms for this work yet, and the page will not show anybody else's.`,
            ),
        contract.contact
          ? `Contact: ${contract.contact}`
          : wrap(
              `Contact: none. ${contract.legalName} has not given an address for this door yet, and the page will not show anybody else's.`,
            ),
      ].join("\n"),
    ),
  );
}

function fullText(): string {
  return `${paragraphs(
    "# Top-Rated Team — ai.top-rated.team, in full",
    quoted(SUMMARY),
    wrap(
      "This is the long version of llms.txt. Every offer below is a row in shared/doors.ts, and every claim " +
        "made about it here is one that offer's own page makes. The last section is the one door page with an " +
        "argument of its own, taken out of the component that draws it. Both files are written by " +
        "scripts/build-llms.ts, so neither can drift from what a visitor reads.",
    ),
    "## How a visit works",
    HOW_IT_WORKS,
    "## Who runs the site",
    paragraphs(
      wrap(`${OURS.legalName}. ${OURS.entity}`),
      wrap(
        "It publishes this website. Where an offer belongs to another company, that company is named on the " +
          "offer, in its footer and in any room opened through it, and this one does not sign that work, " +
          "invoice it or answer for it.",
      ),
      [OURS.termsUrl ? `Terms: ${OURS.termsUrl}` : null, OURS.contact ? `Contact: ${OURS.contact}` : null]
        .filter(Boolean)
        .join("\n") || null,
    ),
    "## Offers",
    PUBLIC_DOORS.map((door, index) => fullEntry(door, index + 1)).join("\n\n"),
    `## The conversion-tracking argument, from ${url(DOOR_BY_ID[DEFAULT_DOOR_ID].path)}`,
    wrap(
      "The longest-running offer is the only one with more to say than its row, and this is that page below " +
        "its panel: the seven places a conversion-tracking engagement goes wrong, the four steps, the two " +
        "results with the sentence saying what they are not, and the six objections including the two that end " +
        "with the company telling somebody not to hire it.",
    ),
    componentToText(ChatGptAdsBody),
    "## Not in this file",
    NOT_HERE,
  )}\n`;
}

/* --------------------------------- writing -------------------------------- */

const FILES: [string, () => string][] = [
  ["llms.txt", shortIndex],
  ["llms-full.txt", fullText],
];

for (const [name, build] of FILES) {
  const body = build();
  await writeFile(path.join(PUBLIC_DIR, name), body, "utf8");
  console.log(`client/public/${name} — ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB`);
}
