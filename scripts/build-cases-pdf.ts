/**
 * The case-study PDF and the editable snapshot beside it.
 *
 *   npx tsx scripts/build-cases-pdf.ts
 *     writes docs/case-studies.html
 *     writes docs/{year} Dan Burykin & his Top-Rated Team case studies.pdf
 *     writes docs/{year} Dan Burykin & his Top-Rated Team case studies.docx
 *   npm run cases:pdf
 *     same, once package.json calls only this script (see the handoff)
 *
 * WHICH DIRECTION IS AUTHORITATIVE. (a) export only. The repository is the
 * source. This file reads data/cases-detailed.json (the long form of the same
 * 22 engagements that shared/cases.ts holds in short form), data/case-shots
 * (the captures extracted from that document), and shared/builds.ts (the
 * products we run ourselves). The HTML, the PDF and the .docx are three
 * renderings of that one read, dated with the clock at build time. A Google
 * Doc opened from the .docx is a fourth copy of the same snapshot. Edits in
 * the Doc, the .docx or the PDF are discarded the next time this script runs.
 * That is stated on the cover so nobody spends an afternoon on a file that
 * will be replaced.
 *
 * WHY NOT (b). (b) would make the Doc the source and have the build read it
 * back. That needs Drive access this deployment does not have, and it would
 * put a hand-edited Doc in front of the account figures and the repository's
 * own captures. Two-way sync is not built, because a sync that cannot read
 * the Doc back is a one-way export that pretends otherwise.
 *
 * THE TITLE is the owner's words, verbatim. It names the work. It does not
 * add a client result: the advertising pages carry figures from the accounts;
 * LinkedIn, automation and custom AI have no client account in this file, so
 * those pages show what we have built, with no metrics.
 *
 * THE YEAR in the filename is read from the clock. It is not typed here.
 *
 * WHAT IT IS BUILT FROM, and why not from shared/cases.ts alone. The site's 22
 * cases are the short form: a challenge, an objective, a work list and the
 * metrics. The owner's own document is the long form — the same 22 engagements
 * with their category, website, country and daily budget, the sections as he
 * wrote them, and 73 screenshots out of the accounts themselves. He asked for
 * the fuller version, so this reads data/cases-detailed.json (his document,
 * parsed) and data/case-shots (the images, extracted from the same file).
 *
 * A PDF IS THE WORST PLACE FOR A DRIFTED FIGURE, because it is the copy that
 * gets forwarded and cannot be corrected after sending. So nothing here is
 * typed by hand: every sentence and every number comes out of his document,
 * and every screenshot is the one that was next to it.
 *
 * EVERY SERVICE TYPE IS REPRESENTED, which the short version could not do. The
 * detailed cases are paid ads and Google Ad Grants; LinkedIn, automation and
 * custom AI have no client case, and the honest evidence for those is what we
 * have built ourselves — shared/builds.ts, as a portfolio with no invented
 * metrics. Both are in here, under headings that say which is which.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";

import { BUILDS } from "../shared/builds";
import { BOOK_A_CALL_URL, PROOF } from "../shared/roster";

/** The owner's words, verbatim. The title names the work, not a result. */
const TITLE =
  "Case Studies: Google Ads and Paid Ads, Organic LinkedIn growth and any AI agents or custom development";

const builtAt = new Date();
const YEAR = builtAt.getFullYear();
const SNAPSHOT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(builtAt);
const STEM = `${YEAR} Dan Burykin & his Top-Rated Team case studies`;

const OUT_HTML = "docs/case-studies.html";
const OUT_PDF = `docs/${STEM}.pdf`;
const OUT_DOCX = `docs/${STEM}.docx`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PHONE = "+420774654822";
const WHATSAPP = "https://wa.me/420774654822";
const EMAIL = "contact@top-rated.team";
const UPWORK = "https://www.upwork.com/agencies/google/";
const SITE = "https://top-rated.team";
/** Word drawing width, about 6 inches. */
const MAX_EMU = 5486400;

interface Section { heading: string; period?: string; lines: string[] }
interface DetailedCase {
  title: string;
  pages: number[];
  meta: Record<string, string>;
  sections: Section[];
  shots: string[];
}

const detailed = JSON.parse(readFileSync("data/cases-detailed.json", "utf8")) as {
  source: string;
  cases: DetailedCase[];
};

/**
 * The natural size of every screenshot, so a small one is not blown up to the
 * width of the page. A 803x156 slice of a table stretched to 170mm is a blurry
 * claim; at its own size beside its neighbour it is legible and honest.
 */
const shotSize = new Map<string, { width: number; height: number }>(
  (
    JSON.parse(readFileSync("data/case-shots/manifest.json", "utf8")) as {
      images: { file: string; width: number; height: number }[];
    }
  ).images.map((i) => [i.file, { width: i.width, height: i.height }]),
);

/**
 * How wide to set a screenshot, as a share of the text column.
 *
 * Three buckets rather than a formula: a formula gives every image its own
 * width and the page stops having a grid. Wide screens (a full Google Ads table)
 * take the column; middling ones pair; narrow ones go three to a row. The
 * container wraps, so a row fills with whatever fits.
 */
/**
 * How wide a screenshot is set, from its own size AND from how many the case
 * has — and the second half is what actually does the work.
 *
 * THE MEASUREMENT THAT SETTLED IT. The owner asked for no page carrying a
 * screenshot and no text. Sizing by image width alone got that from 29 pages
 * of 69 to 15 of 55 and then stopped improving, because the binding constraint
 * is not how wide one image is — it is that a case with nine of them has more
 * picture than text however small each one is. So the count decides the ceiling:
 * six or more go three to a row and everything else pairs. Nothing takes the
 * full column any more: the four earliest offenders were cases with ONE
 * screenshot, where the text filled its page and a column-wide image had
 * nowhere to go but the next one. At half width it fits under the text.
 *
 * Re-measure after changing any of this. The build prints the count.
 */
function span(file: string, count: number): "full" | "half" | "third" {
  const w = shotSize.get(file)?.width ?? 2000;
  const ceiling = count >= 6 ? "third" : "half";
  const byWidth = w >= 900 ? "half" : "third";
  const rank = { full: 2, half: 1, third: 0 } as const;
  return rank[byWidth] <= rank[ceiling] ? byWidth : ceiling;
}

/**
 * A build's own screenshot, where there is one.
 *
 * Four were captured in a browser with the consent banners removed. The fifth,
 * being.marketing, could not be: what answers at that address is the Gumroad
 * store, and a capture of it would put a third party's CZK price list in this
 * PDF. The product is a custom GPT inside ChatGPT, behind a login, so the owner
 * sent the screenshot himself.
 *
 * The Upwork proposal agent has none and gets none — it is a Claude Code skill
 * with no interface to photograph, and a picture of a terminal would be
 * decoration rather than evidence.
 */
const BUILD_SHOTS: Record<string, string> = {
  "adgrant-ai": "adgrant-ai.png",
  "top-voice": "top-voice.png",
  warmlike: "warmlike.png",
  "top-rated-team": "top-rated-team.png",
  "being-existential-coach": "being.png",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The drawing off the home page, as a print element: one line per entry point,
 * converging on a point, and one thicker line leaving it. Same curve as
 * client/src/components/site/home/Plate.tsx — control points proportional to
 * the meeting point — so the two are the same mark rather than two drawings of
 * one idea.
 */
function lines(count: number, meetX = 620, width = 1000, height = 260): string {
  const paths = Array.from({ length: count }, (_, i) => {
    const y = 24 + i * ((height - 48) / Math.max(1, count - 1));
    return `M0 ${y} C ${(meetX * 0.44).toFixed(1)} ${y} ${(meetX * 0.72).toFixed(1)} ${height / 2} ${meetX} ${height / 2}`;
  });
  return `<svg class="plate" viewBox="0 0 ${width} ${height}" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.42">
    ${paths.map((d) => `<path d="${d}" />`).join("\n    ")}
  </g>
  <g class="clay">
    <circle cx="${meetX}" cy="${height / 2}" r="4" fill="currentColor" />
    <path d="M${meetX} ${height / 2} H${width}" stroke="currentColor" stroke-width="2.4" fill="none" />
  </g>
</svg>`;
}

/** A short rule that reads as the same motif: the convergence, small. */
const mark = (count = 5) => lines(count, 150, 240, 96);

const contact = (tone: "cover" | "closing") => `
<div class="contact ${tone}">
  <p class="label">Talk to a person</p>
  <ul>
    <li><a href="${BOOK_A_CALL_URL}">Book a call</a><span>20 minutes, free, with the person who would do the work</span></li>
    <li><a href="${SITE}/#panel">Open a room</a><span>Its own address, an agent and our people already in it</span></li>
    <li><a href="${SITE}">Leave a message</a><span>Goes to one inbox, answered by a person</span></li>
    <li><a href="${WHATSAPP}">${esc(PHONE)}</a><span>WhatsApp</span></li>
    <li><a href="mailto:${EMAIL}">${EMAIL}</a><span>Email</span></li>
    <li><a href="${UPWORK}">The record on Upwork</a><span>5,872 hours and the job-success score, public</span></li>
  </ul>
</div>`;

const META_ORDER = ["Category", "Client", "Website", "Country", "Location", "Budget", "Period", "Account", "Start"];

function metaRow(c: DetailedCase): string {
  const keys = META_ORDER.filter((k) => c.meta[k]);
  if (keys.length === 0) return "";
  return `<dl class="casemeta">${keys
    .map((k) => `<div><dt>${esc(k)}</dt><dd>${esc(c.meta[k])}</dd></div>`)
    .join("")}</dl>`;
}

function section(s: Section): string {
  const bullets = s.lines.filter((l) => l.startsWith("• "));
  const prose = s.lines.filter((l) => !l.startsWith("• "));
  return `<div class="block">
    ${
      s.heading
        ? `<p class="label">${esc(s.heading)}${
            /* The dates a comparison is against belong beside the heading, not
               lost: "Results" alone does not say what the numbers moved from. */
            s.period ? ` <span class="period">${esc(s.period)}</span>` : ""
          }</p>`
        : ""
    }
    ${prose.map((l) => `<p class="read">${esc(l)}</p>`).join("")}
    ${bullets.length > 0 ? `<ul class="items">${bullets.map((l) => `<li>${esc(l.slice(2))}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function shotsBlock(c: DetailedCase, aside: boolean): string {
  if (c.shots.length === 0) return "";
  return `<div class="shots${aside ? " aside" : ""}">
    <p class="label">From the account</p>
    <div class="grid">
      ${c.shots
        .map(
          (f) =>
            `<figure class="${aside ? "full" : span(f, c.shots.length)}"><img src="../data/case-shots/${esc(
              f,
            )}" alt=""></figure>`,
        )
        .join("")}
  </div>
  </div>`;
}

const casePages = detailed.cases
  .map((c, i) => {
    /*
     * ONE OR TWO SCREENSHOTS GO BESIDE THE TEXT, not after it.
     *
     * Four pages carrying an image and nothing else survived every reduction in
     * image size, and they were all cases with a single screenshot: the text
     * filled its sheet exactly, so any image at all had nowhere to go but the
     * next one. Making it smaller does not help — the page was already full.
     *
     * Floated into the column it fills the space the text leaves, which is
     * where the evidence for a claim belongs anyway. Up to four go this way;
     * five or more keep the grid at the end, because a float that long runs
     * past the text it is supposed to sit beside and the wrap stops reading.
     */
    const aside = c.shots.length > 0 && c.shots.length <= 4;

    return `
  <section class="case">
    <p class="eyebrow">Case ${String(i + 1).padStart(2, "0")}</p>
    <h2>${esc(c.title)}</h2>
    ${metaRow(c)}
    ${aside ? shotsBlock(c, true) : ""}
    ${c.sections.map(section).join("")}
    ${aside ? "" : shotsBlock(c, false)}
  </section>`;
  })
  .join("\n");

const buildPages = `
  <section class="case builds">
    <p class="eyebrow">Beyond paid ads</p>
    <h2>What we have built</h2>
    <p class="read">The cases above are advertising accounts. The work on the other side of
      this company — LinkedIn, automation, custom AI — has no client account to show, so the
      evidence is what we have built and run ourselves. There are no metrics on this page
      because there is no client whose numbers these would be.</p>
    ${BUILDS.map(
      (b) => `
    <div class="build">
      <h3>${esc(b.name)}${b.url ? ` <span class="url">${esc(b.url.replace(/^https?:\/\//, ""))}</span>` : ""}</h3>
      <p class="read">${esc(b.what)}</p>
      ${b.built.length > 0 ? `<ul class="items">${b.built.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${
        BUILD_SHOTS[b.slug]
          ? `<figure class="buildshot"><img src="../data/build-shots/${BUILD_SHOTS[b.slug]}" alt=""></figure>`
          : ""
      }
    </div>`,
    ).join("")}
  </section>`;

const contents = detailed.cases
  .map(
    (c, i) =>
      `<li><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="who">${esc(
        c.title,
      )}</span><span class="what">${c.shots.length > 0 ? `${c.shots.length} screen${c.shots.length === 1 ? "" : "s"}` : ""}</span></li>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Outfit:wght@400;500;600&display=swap">
<style>
  /*
    The names and the HSL channels are the site's own tokens from
    client/src/index.css. This file is printed by Chrome, not compiled by
    Tailwind, so the utilities are not available — the tokens are.
    @page cannot resolve var(), so the page-box fill is the same HSL as
    --background, written out. That is not a second colour.
  */
  :root{
    --background: 40 38% 92%;
    --foreground: 33 19% 9%;
    --muted-foreground: 33 11% 38%;
    --border: 38 23% 77%;
    --card-border: 38 26% 84%;
    --primary: 16 70% 36%;
    --paper: hsl(var(--background));
    --ink: hsl(var(--foreground));
    --muted: hsl(var(--muted-foreground));
    --line: hsl(var(--border));
    --hair: hsl(var(--card-border));
    --clay: hsl(var(--primary));
    --sans:"Outfit","Avenir Next",system-ui,sans-serif;
    --read:"Newsreader",Georgia,"Times New Roman",serif;
  }
  @media screen {
    @media (prefers-color-scheme: dark) {
      :root{
        --background: 34 20% 7%;
        --foreground: 38 37% 88%;
        --muted-foreground: 34 11% 57%;
        --border: 35 20% 17%;
        --card-border: 34 22% 13%;
        --primary: 19 63% 60%;
      }
    }
  }
  @media print {
    :root{
      --background: 40 38% 92%;
      --foreground: 33 19% 9%;
      --muted-foreground: 33 11% 38%;
      --border: 38 23% 77%;
      --card-border: 38 26% 84%;
      --primary: 16 70% 36%;
    }
  }

  /*
    THE MARGINS ARE THE PAGE'S OWN COLOUR. A background on body stops at the
    content box, and one on html stops at the page box, so both printed a
    white frame. Chrome honours @page background. var() does not resolve
    inside @page, so the fill is the light --background token, written as HSL.
  */
  @page { size:A4; margin:17mm 15mm; background: hsl(40 38% 92%); }
  html{ -webkit-print-color-adjust:exact; print-color-adjust:exact;
        background: var(--paper); }

  *{ box-sizing:border-box; }
  body{ margin:0; background:transparent; color:var(--ink);
        font-family:var(--sans); font-size:10pt; line-height:1.5; }

  .case{ break-before:page; }
  .block, .build, figure, .metric{ break-inside:avoid; }
  .block{ margin-top:6mm; }

  .eyebrow,.label{ font-family:var(--sans); font-size:7pt; font-weight:500;
    letter-spacing:.09em; text-transform:uppercase; color:var(--muted); margin:0; }
  h1{ font-family:var(--sans); font-weight:500; font-size:22pt; line-height:1.12;
      letter-spacing:-.03em; margin:0; max-width:22em; }
  h2{ font-family:var(--sans); font-weight:500; font-size:19pt; line-height:1.06;
      letter-spacing:-.03em; margin:1.5mm 0 0; }
  h3{ font-family:var(--sans); font-weight:500; font-size:11.5pt; margin:0; }
  h3 .url{ font-family:var(--sans); font-weight:400; font-size:8pt; color:var(--muted);
           letter-spacing:.04em; }
  .read{ font-family:var(--read); font-size:10.5pt; line-height:1.58; margin:2mm 0 0;
         max-width:64em; }

  ul.items{ font-family:var(--read); font-size:10pt; line-height:1.5;
            margin:2mm 0 0; padding:0; list-style:none; }
  ul.items li{ padding:1.3mm 0 1.3mm 4mm; border-top:.4pt solid var(--hair);
               position:relative; }
  ul.items li:last-child{ border-bottom:.4pt solid var(--hair); }
  ul.items li::before{ content:""; position:absolute; left:0; top:3.1mm;
    width:2mm; height:.4pt; background:var(--line); }

  dl.casemeta{ margin:3mm 0 0; padding:0; display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 6mm; }
  dl.casemeta div{ border-top:.4pt solid var(--line); padding:1.4mm 0; }
  dl.casemeta dt{ font-size:6.8pt; letter-spacing:.09em; text-transform:uppercase;
                  color:var(--muted); }
  dl.casemeta dd{ margin:.6mm 0 0; font-size:9.5pt; font-variant-numeric:tabular-nums; }

  .shots{ margin-top:6mm; }
  /* Floated into the text column. The clear on a case keeps the next one from
     starting beside a leftover float. */
  .shots.aside{ float:right; width:44%; margin:0 0 4mm 5mm; }
  .shots.aside .label{ margin-bottom:1.5mm; }
  .shots.aside figure{ width:100%; margin:0 0 2mm 0; }
  .shots.aside img{ max-height:none; }
  .case{ clear:both; }
  /*
    INLINE-BLOCK, NOT FLEX, and the difference is 29 pages. A flex container
    does not fragment across printed sheets in Chrome: with flex it put one
    screenshot on each page and left 29 of 69 pages carrying an image and no
    text at all, which is the thing the owner asked to stop. Inline-block flows
    like text, so a row fills, wraps, and breaks between rows.
  */
  .shots .grid{ margin-top:2.5mm; font-size:0; }
  .shots figure{ margin:0 2mm 2mm 0; display:inline-block; vertical-align:top; }
  .shots figure.full{ width:100%; margin-right:0; }
  .shots figure.half{ width:calc(50% - 2mm); }
  .shots figure.third{ width:calc(33.333% - 2mm); }
  /* Whichever constraint binds first, and the aspect ratio survives both: a
     wide table hits the width, a tall dashboard hits the height, and neither
     is allowed to own a page. */
  /* A ceiling per class, so a narrow-and-tall screenshot in a three-up row
     cannot be taller than the row it shares. */
  .shots img{ max-width:100%; width:auto; height:auto;
              border:.4pt solid var(--line); display:block; }
  .shots figure.full img{ max-height:48mm; }
  .shots figure.half img{ max-height:48mm; }
  .shots figure.third img{ max-height:34mm; }
  .period{ font-weight:400; letter-spacing:.04em; text-transform:none;
           font-family:var(--read); font-size:8.5pt; }

  /* ---- the drawing ---- */
  svg.plate{ width:100%; height:auto; display:block; color:var(--ink); }
  svg.plate .clay{ color:var(--clay); }
  svg.plate.small{ width:52mm; }

  /* ---- cover ---- */
  /* Natural flow rather than a fixed height with space-between: the first
     render pushed the contact list and the location line off the sheet, which
     is what a column of that height does the moment anything is added to it. */
  .cover{ padding-top:2mm; }
  .cover .head{ margin-bottom:14mm; }
  .cover h1{ margin-top:8mm; }
  .snapshot{ font-family:var(--sans); font-size:8pt; color:var(--muted);
             margin:3mm 0 0; max-width:46em; }
  .cover .where{ margin-top:12mm; }
  .lockup{ display:flex; align-items:center; gap:4mm; }
  .lockup img{ width:17mm; height:17mm; }
  .lockup span{ font-family:var(--sans); font-weight:500; font-size:11pt;
                letter-spacing:.13em; text-transform:uppercase; }
  .cover .lede{ font-family:var(--read); font-size:11.5pt; line-height:1.58;
                max-width:36em; margin:4mm 0 0; }
  .record{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr));
           gap:0 5mm; margin:7mm 0 0; }
  .record div{ border-top:.4pt solid var(--line); padding-top:1.6mm; }
  .record b{ display:block; font-family:var(--sans); font-weight:500; font-size:13pt;
             font-variant-numeric:tabular-nums; }
  .record span{ font-family:var(--sans); font-size:6.8pt; letter-spacing:.09em;
                text-transform:uppercase; color:var(--muted); }
  .where{ font-family:var(--sans); font-size:7pt; letter-spacing:.09em;
          text-transform:uppercase; color:var(--muted); margin:0; }

  /* ---- contact ---- */
  .contact{ margin-top:6mm; }
  .contact ul{ list-style:none; margin:2.5mm 0 0; padding:0;
    display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 8mm; }
  .contact li{ border-top:.4pt solid var(--line); padding:1.6mm 0;
    display:flex; flex-direction:column; gap:.4mm; }
  .contact a{ font-family:var(--sans); font-size:10pt; font-weight:500;
              color:var(--clay); text-decoration:none; }
  .contact span{ font-family:var(--read); font-size:8.5pt; color:var(--muted); }

  /* ---- contents ---- */
  .toc{ break-before:page; }
  ol.toc-list{ list-style:none; margin:5mm 0 0; padding:0; }
  ol.toc-list li{ display:grid; grid-template-columns:8mm 1fr auto; gap:0 3mm;
    align-items:baseline; padding:1.7mm 0; border-top:.4pt solid var(--hair); }
  .n{ font-size:7.5pt; color:var(--muted); font-variant-numeric:tabular-nums; }
  .who{ font-size:10pt; font-weight:500; }
  .what{ font-family:var(--read); font-size:8.5pt; color:var(--muted); text-align:right; }

  .build{ margin-top:6mm; break-inside:avoid; }
  /* The product's own front page. Captured in a real browser with the consent
     banners and chat bubbles removed first — furniture is not product. */
  .buildshot{ margin:3mm 0 0; }
  .buildshot img{ width:100%; height:auto; border:.4pt solid var(--line); }
  .closing{ break-before:page; }
  .closing .read{ max-width:46em; }
  .identify{ margin-top:8mm; padding-top:2.5mm; border-top:.4pt solid var(--line);
    font-family:var(--sans); font-size:7.5pt; color:var(--muted); line-height:1.7; }
</style>
</head>
<body>

<section class="cover">
  <div class="head">
    <div class="lockup">
      <img src="../client/public/assets/top-rated-logo.png" alt="">
      <span>Top-Rated Team</span>
    </div>
    ${lines(7)}
  </div>

  <div>
    <h1>${esc(TITLE)}</h1>
    <p class="snapshot">Snapshot of ${esc(SNAPSHOT)}. This file is an export of the repository.
      Changing the text or the pictures here does not change the site, and the next build
      replaces this file.</p>
    <p class="lede">The title names the work. The advertising pages are ${detailed.cases.length} engagements
      with the category, the country, the daily budget, the work as it was done, and ${detailed.cases.reduce(
        (n, c) => n + c.shots.length,
        0,
      )} screenshots
      from the accounts themselves. Every figure is the account's own over the period its
      page names. LinkedIn, automation and custom AI have no client account in this file, so
      those pages show what we have built. They carry no metrics.</p>

    <div class="record">
      ${PROOF.map((p) => `<div><b>${esc(p.value)}</b><span>${esc(p.label)}</span></div>`).join("")}
    </div>

    ${contact("cover")}
  </div>

  <p class="where">Prague, Madeira, Kyiv, Bratislava, Batumi · In the global paid ads and IT dev markets since 2017</p>
</section>

<section class="toc">
  <p class="eyebrow">Contents</p>
  <h2>What is in here</h2>
  ${mark(5).replace("<svg class=\"plate\"", "<svg class=\"plate small\"")}
  <ol class="toc-list">${contents}</ol>
</section>

${casePages}
${buildPages}

<section class="closing">
  <p class="eyebrow">About these pages</p>
  <h2>How to read them</h2>
  <p class="read">Every figure comes from the advertising account it describes, over the period
    that page names, in the form the client saw it. Where a case gives no figure for something,
    the account did not measure it — a gap is left as a gap rather than filled with an estimate.</p>
  <p class="read">These are advertising results. They are evidence of work done on comparable
    accounts and they are not a forecast: what an account does next depends on its market, its
    offer and its budget, and anybody who tells you otherwise before seeing it is guessing.</p>
  <p class="read">The hours and the job-success score on the cover are the public record on
    Upwork and can be checked there.</p>
  <p class="read">This copy is a snapshot of ${esc(SNAPSHOT)}. It is not a Google Doc the next
    build will read. Edits made after opening it in Google Docs are discarded when this
    file is generated again.</p>

  ${contact("closing")}

  <p class="identify">Top-Rated Team (Danylo Burykin SZČO) · top-rated.team</p>
</section>

</body>
</html>
`;

writeFileSync(OUT_HTML, html);
const shots = detailed.cases.reduce((n, c) => n + c.shots.length, 0);
writeDocx();
printPdf();
console.log(`${OUT_HTML}: ${detailed.cases.length} cases, ${shots} screens, ${BUILDS.length} builds`);
console.log(`${OUT_PDF}`);
console.log(`${OUT_DOCX} — snapshot of ${SNAPSHOT}; the repository is the source`);
console.log(
  "After printing, count the pages with no text on them — that is what the\n" +
    "screenshot sizing above is tuned against, and it is the one thing about\n" +
    "this layout that cannot be judged from the HTML.",
);

/**
 * A ZIP of uncompressed or deflated members. No extra dependency: a .docx is
 * a ZIP, and Google Docs opens a conventional one.
 */
function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function zipMembers(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const compressed = deflateRawSync(file.data);
    const store = compressed.length >= file.data.length;
    const payload = store ? file.data : compressed;
    const method = store ? 0 : 8;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    const piece = Buffer.concat([local, payload]);
    locals.push(piece);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += piece.length;
  }
  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

function xmlText(s: string): string {
  return esc(s).replace(/\n/g, " ");
}

function wPara(text: string, style?: string): string {
  const pr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pr}<w:r><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r></w:p>`;
}

function wEmpty(): string {
  return `<w:p/>`;
}

function imageExtent(pxW: number, pxH: number): { cx: number; cy: number } {
  const cx = Math.round((pxW / 96) * 914400);
  const cy = Math.round((pxH / 96) * 914400);
  if (cx <= MAX_EMU) return { cx: Math.max(cx, 914400), cy: Math.max(cy, 457200) };
  return { cx: MAX_EMU, cy: Math.round((cy * MAX_EMU) / cx) };
}

function wImage(relId: string, cx: number, cy: number, docPrId: number): string {
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${cx}" cy="${cy}"/>
    <wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="${docPrId}" name="Picture ${docPrId}"/>
    <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Picture ${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline></w:drawing></w:r></w:p>`;
}

/**
 * A linear Word document of the same cases, figures and captures as the HTML.
 * Headings, paragraphs, lists and inline images — no print floats — so Google
 * Docs keeps the reading order when it imports the file.
 */
function writeDocx(): void {
  const media: { name: string; data: Buffer; contentType: string; relId: string }[] = [];
  const body: string[] = [];
  let docPr = 1;

  const addImage = (absPath: string, file: string): string => {
    if (!existsSync(absPath)) return "";
    const ext = extname(file).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    const mediaName = `image${media.length + 1}${ext === ".png" ? ".png" : ".jpg"}`;
    const relId = `rId${media.length + 2}`;
    media.push({ name: mediaName, data: readFileSync(absPath), contentType, relId });
    const size = shotSize.get(file) ?? { width: 1200, height: 800 };
    const { cx, cy } = imageExtent(size.width, size.height);
    const xml = wImage(relId, cx, cy, docPr);
    docPr += 1;
    return xml;
  };

  body.push(wPara(TITLE, "Title"));
  body.push(
    wPara(
      `Snapshot of ${SNAPSHOT}. This file is an export of the repository. Changing the text or the pictures here does not change the site, and the next build replaces this file.`,
    ),
  );
  body.push(
    wPara(
      `The title names the work. The advertising pages are ${detailed.cases.length} engagements with the category, the country, the daily budget, the work as it was done, and ${shots} screenshots from the accounts themselves. Every figure is the account's own over the period its page names. LinkedIn, automation and custom AI have no client account in this file, so those pages show what we have built. They carry no metrics.`,
    ),
  );
  for (const p of PROOF) body.push(wPara(`${p.value} — ${p.label}`));
  body.push(wEmpty());
  body.push(wPara("Talk to a person", "Heading2"));
  body.push(wPara(`Book a call: ${BOOK_A_CALL_URL}`));
  body.push(wPara(`Open a room: ${SITE}/#panel`));
  body.push(wPara(`Leave a message: ${SITE}`));
  body.push(wPara(`WhatsApp: ${PHONE}`));
  body.push(wPara(`Email: ${EMAIL}`));
  body.push(wPara(`The record on Upwork: ${UPWORK}`));
  body.push(wEmpty());
  body.push(wPara("What is in here", "Heading2"));
  for (const [i, c] of detailed.cases.entries()) {
    body.push(wPara(`${String(i + 1).padStart(2, "0")}  ${c.title}`));
  }

  for (const [i, c] of detailed.cases.entries()) {
    body.push(wPara(`Case ${String(i + 1).padStart(2, "0")}`, "Heading2"));
    body.push(wPara(c.title, "Heading1"));
    for (const k of META_ORDER) {
      if (c.meta[k]) body.push(wPara(`${k}: ${c.meta[k]}`));
    }
    for (const s of c.sections) {
      const head = s.period ? `${s.heading} ${s.period}` : s.heading;
      if (head) body.push(wPara(head, "Heading2"));
      for (const line of s.lines) {
        body.push(wPara(line.startsWith("• ") ? line.slice(2) : line));
      }
    }
    if (c.shots.length > 0) body.push(wPara("From the account", "Heading2"));
    for (const f of c.shots) {
      body.push(addImage(resolve("data/case-shots", f), f));
    }
  }

  body.push(wPara("What we have built", "Heading1"));
  body.push(
    wPara(
      "The cases above are advertising accounts. The work on the other side of this company — LinkedIn, automation, custom AI — has no client account to show, so the evidence is what we have built and run ourselves. There are no metrics on this page because there is no client whose numbers these would be.",
    ),
  );
  for (const b of BUILDS) {
    body.push(wPara(b.url ? `${b.name}  ${b.url.replace(/^https?:\/\//, "")}` : b.name, "Heading2"));
    body.push(wPara(b.what));
    for (const x of b.built) body.push(wPara(x));
    const shot = BUILD_SHOTS[b.slug];
    if (shot) {
      const abs = resolve("data/build-shots", shot);
      if (existsSync(abs)) {
        const ext = extname(shot).toLowerCase();
        const contentType = ext === ".png" ? "image/png" : "image/jpeg";
        const mediaName = `image${media.length + 1}${ext === ".png" ? ".png" : ".jpg"}`;
        const relId = `rId${media.length + 2}`;
        media.push({ name: mediaName, data: readFileSync(abs), contentType, relId });
        const { cx, cy } = imageExtent(1600, 1000);
        body.push(wImage(relId, cx, cy, docPr));
        docPr += 1;
      }
    }
  }

  body.push(wPara("How to read them", "Heading1"));
  body.push(
    wPara(
      "Every figure comes from the advertising account it describes, over the period that page names, in the form the client saw it. Where a case gives no figure for something, the account did not measure it — a gap is left as a gap rather than filled with an estimate.",
    ),
  );
  body.push(
    wPara(
      "These are advertising results. They are evidence of work done on comparable accounts and they are not a forecast: what an account does next depends on its market, its offer and its budget, and anybody who tells you otherwise before seeing it is guessing.",
    ),
  );
  body.push(
    wPara(
      `This copy is a snapshot of ${SNAPSHOT}. It is not a Google Doc the next build will read. Edits made after opening it in Google Docs are discarded when this file is generated again.`,
    ),
  );
  body.push(wPara("Top-Rated Team (Danylo Burykin SZČO) · top-rated.team"));

  const defaults = media
    .map((m) => {
      const ext = m.name.endsWith(".png") ? "png" : "jpg";
      return `<Default Extension="${ext}" ContentType="${m.contentType}"/>`;
    })
    .filter((v, i, a) => a.indexOf(v) === i)
    .join("");

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${defaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${media
    .map(
      (m) =>
        `<Relationship Id="${m.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`,
    )
    .join("\n  ")}
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="240" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
</w:styles>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${body.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const files = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(document, "utf8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(docRels, "utf8") },
    { name: "word/styles.xml", data: Buffer.from(styles, "utf8") },
    ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
  ];
  writeFileSync(OUT_DOCX, zipMembers(files));
}

function printPdf(): void {
  if (!existsSync(CHROME)) {
    console.log(`Chrome is not at ${CHROME}, so the PDF was not printed. The HTML and the .docx were written.`);
    return;
  }
  const printed = spawnSync(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${resolve(OUT_PDF)}`, resolve(OUT_HTML)],
    { encoding: "utf8" },
  );
  if (printed.status !== 0) {
    console.log(`Chrome did not print the PDF (exit ${printed.status}). The HTML and the .docx were written.`);
    if (printed.stderr) console.log(printed.stderr);
  }
}
