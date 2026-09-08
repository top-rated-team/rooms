/**
 * The case-study PDF.
 *
 *   npx tsx scripts/build-cases-pdf.ts     # writes docs/case-studies.html
 *   npm run cases:pdf                      # that, then Chrome prints it
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
import { readFileSync, writeFileSync } from "node:fs";

import { BUILDS } from "../shared/builds";
import { BOOK_A_CALL_URL, PROOF } from "../shared/roster";

const OUT = "docs/case-studies.html";
const PHONE = "+420774654822";
const WHATSAPP = "https://wa.me/420774654822";
const EMAIL = "contact@top-rated.team";
const UPWORK = "https://www.upwork.com/agencies/google/";
const SITE = "https://top-rated.team";

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

const casePages = detailed.cases
  .map(
    (c, i) => `
  <section class="case">
    <p class="eyebrow">Case ${String(i + 1).padStart(2, "0")}</p>
    <h2>${esc(c.title)}</h2>
    ${metaRow(c)}
    ${c.sections.map(section).join("")}
    ${
      c.shots.length > 0
        ? /* The label travels with the first image. On its own it was left at
             the bottom of a page announcing a screenshot that had broken to the
             next one, which is a caption for nothing. */
          `<div class="shots">
            <div class="shotfirst">
              <p class="label">From the account</p>
              <figure><img src="../data/case-shots/${esc(c.shots[0])}" alt=""></figure>
            </div>
            ${c.shots
              .slice(1)
              .map((f) => `<figure><img src="../data/case-shots/${esc(f)}" alt=""></figure>`)
              .join("")}
          </div>`
        : ""
    }
  </section>`,
  )
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
<title>Top-Rated Team — Case studies</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Outfit:wght@400;500;600&display=swap">
<style>
  :root{
    --paper:#F0EBE1; --ink:#1A1611; --muted:#6D655B;
    --line:#CFC3AE; --hair:#DCD3C4; --clay:#9C4318;
    --sans:"Outfit","Avenir Next",system-ui,sans-serif;
    --read:"Newsreader",Georgia,"Times New Roman",serif;
  }

  /*
    THE MARGINS ARE THE PAGE'S OWN COLOUR, which is what the owner asked for
    and took a specific trick. A background on body stops at the content box,
    so the printed sheet had a white frame around a coloured block. Chrome
    paints the ROOT element's background across the whole page box, margins
    included — so the colour goes on html and the inset stays on @page.
  */
  /*
    THE MARGINS ARE THE PAGE'S OWN COLOUR, and the one line that does it is a
    background on @page itself. Two other attempts did not: a background on
    body stops at the content box, and one on html stops at the page box, so
    both printed a white frame around a coloured block. A position:fixed layer
    stretched into the margins fails for the same reason — Chrome clips it to
    the page box.

    Chrome does honour @page background. Verified by printing a two-page probe
    and reading the corner pixel out of it rather than looking at it: 225,235,240
    where white would be 255,255,255. The literal hex is deliberate — var() does
    not resolve inside @page.
  */
  @page { size:A4; margin:17mm 15mm; background:#F0EBE1; }
  html{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  *{ box-sizing:border-box; }
  body{ margin:0; background:transparent; color:var(--ink);
        font-family:var(--sans); font-size:10pt; line-height:1.5; }

  .case{ break-before:page; }
  .block, .build, figure, .metric{ break-inside:avoid; }
  .block{ margin-top:6mm; }

  .eyebrow,.label{ font-family:var(--sans); font-size:7pt; font-weight:500;
    letter-spacing:.09em; text-transform:uppercase; color:var(--muted); margin:0; }
  h1{ font-family:var(--sans); font-weight:500; font-size:36pt; line-height:.98;
      letter-spacing:-.035em; margin:0; }
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

  .shots{ margin-top:7mm; }
  .shots figure{ margin:3mm 0 0; }
  .shotfirst{ break-inside:avoid; }
  .period{ font-weight:400; letter-spacing:.04em; text-transform:none;
           font-family:var(--read); font-size:8.5pt; }
  .shots img{ width:100%; height:auto; display:block;
              border:.4pt solid var(--line); }

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
  .cover h1{ margin-top:12mm; }
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

  .build{ margin-top:6mm; }
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
    <h1>Case studies</h1>
    <p class="lede">${detailed.cases.length} advertising engagements in full: the category, the
      country, the daily budget, the work as it was done, and ${detailed.cases.reduce(
        (n, c) => n + c.shots.length,
        0,
      )} screenshots
      out of the accounts themselves. Every figure is the account's own over the period its
      page names.</p>

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

  ${contact("closing")}

  <p class="identify">Top-Rated Team (Danylo Burykin SZČO) · top-rated.team</p>
</section>

</body>
</html>
`;

writeFileSync(OUT, html);
const shots = detailed.cases.reduce((n, c) => n + c.shots.length, 0);
console.log(`${OUT}: ${detailed.cases.length} cases, ${shots} screens, ${BUILDS.length} builds`);
