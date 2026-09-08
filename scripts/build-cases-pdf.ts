/**
 * shared/cases.ts  →  docs/case-studies.html  →  docs/case-studies.pdf
 *
 *   npx tsx scripts/build-cases-pdf.ts
 *   # then, to make the PDF itself:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --disable-gpu --no-pdf-header-footer \
 *     --print-to-pdf=docs/case-studies.pdf docs/case-studies.html
 *
 * A LEAVE-BEHIND, not a brochure. The owner asked for the case studies as a PDF
 * in the site's style, to send and to attach — so this is the same three type
 * sizes, the same two typefaces, the same one accent, and no gradient, card,
 * icon or stock photograph anywhere.
 *
 * GENERATED FROM shared/cases.ts, which is itself generated, for the reason
 * that file gives: a case study is a claim about somebody else's account, and a
 * number that drifts from the account it came out of is worse than no number.
 * A PDF is the worst possible place for a drifted figure, because it is the
 * copy that gets forwarded and cannot be corrected after sending.
 *
 * PRINT, NOT SCREEN. One case per page, so a reader can send a single page.
 * Page size is A4 rather than Letter because the audience is European and
 * Upwork clients print rarely; a European reading it on screen sees the shape
 * they expect.
 */
import { writeFileSync } from "node:fs";

import { CASES } from "../shared/cases";
import { PROOF } from "../shared/roster";
import { DOOR_BY_ID } from "../shared/doors";

const OUT = "docs/case-studies.html";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The metric change, as it will be read: a sign, then the figure. */
function change(raw: string): { text: string; direction: "up" | "down" | "flat" } {
  const trimmed = raw.trim();
  if (/^-|↓|decrease/i.test(trimmed)) return { text: trimmed, direction: "down" };
  if (/^\+|↑|increase/i.test(trimmed)) return { text: trimmed, direction: "up" };
  return { text: trimmed, direction: "flat" };
}

const metaLine = (c: (typeof CASES)[number]) =>
  [c.industry, c.place, c.budget].filter(Boolean).map((v) => esc(String(v))).join("  ·  ");

const casePages = CASES.map((c, i) => {
  const doors = c.doors
    .map((id) => DOOR_BY_ID[id]?.headline)
    .filter(Boolean)
    .map((h) => esc(String(h)));

  return `
  <section class="case" id="case-${esc(c.slug)}">
    <p class="eyebrow">Case ${String(i + 1).padStart(2, "0")}${doors.length > 0 ? `  ·  ${doors[0]}` : ""}</p>
    <h2>${esc(c.client)}</h2>
    ${metaLine(c) ? `<p class="meta">${metaLine(c)}</p>` : ""}

    ${c.challenge ? `<div class="block"><p class="label">The problem</p><p class="read">${esc(c.challenge)}</p></div>` : ""}
    ${c.objective ? `<div class="block"><p class="label">What it had to do</p><p class="read">${esc(c.objective)}</p></div>` : ""}

    ${
      c.work.length > 0
        ? `<div class="block"><p class="label">The work</p><ul class="work">${c.work
            .map((w) => `<li>${esc(w)}</li>`)
            .join("")}</ul></div>`
        : ""
    }

    ${
      c.metrics.length > 0
        ? `<div class="block"><p class="label">What changed</p><dl class="metrics">${c.metrics
            .map((m) => {
              const ch = change(m.change);
              return `<div class="metric"><dt>${esc(m.label)}</dt><dd class="figure">${esc(
                m.value,
              )}</dd><dd class="change ${ch.direction}">${esc(ch.text)}</dd></div>`;
            })
            .join("")}</dl></div>`
        : ""
    }
  </section>`;
}).join("\n");

const contents = CASES.map(
  (c, i) =>
    `<li><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="who">${esc(
      c.client,
    )}</span><span class="what">${esc(c.industry ?? "")}</span></li>`,
).join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Top-Rated Team — Case studies</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Outfit:wght@400;500;600&display=swap">
<style>
  /* The site's own tokens, converted from HSL once so this file has no build
     step of its own and can be opened on any machine. */
  :root{
    --paper:#F0EBE1;      /* 40 38% 92% */
    --ink:#1A1611;        /* 33 19% 9%  */
    --muted:#6D655B;      /* 33 11% 38% */
    --line:#CFC3AE;       /* 38 23% 77% */
    --hair:#DCD3C4;       /* 38 26% 84% */
    --clay:#9C4318;       /* 16 70% 36% */
    --sans:"Outfit","Avenir Next",system-ui,sans-serif;
    --read:"Newsreader",Georgia,"Times New Roman",serif;
  }

  @page { size: A4; margin: 18mm 16mm 16mm; }

  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; }
  body{
    background:var(--paper); color:var(--ink);
    font-family:var(--sans); font-size:10.5pt; line-height:1.5;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }

  /* One case per sheet. break-inside on the blocks as well, because a "what
     changed" grid split across two pages is the one thing a reader will
     misread — half the metrics on one page look like all of them. */
  .case{ break-before:page; break-inside:avoid; }
  .block{ break-inside:avoid; margin-top:7mm; }

  .eyebrow, .label{
    font-family:var(--sans); font-size:7.5pt; font-weight:500;
    letter-spacing:.09em; text-transform:uppercase; color:var(--muted);
    margin:0;
  }
  h1{ font-family:var(--sans); font-weight:500; font-size:34pt; line-height:.98;
      letter-spacing:-.035em; margin:0; }
  h2{ font-family:var(--sans); font-weight:500; font-size:21pt; line-height:1.05;
      letter-spacing:-.03em; margin:2mm 0 0; }
  .meta{ font-family:var(--sans); font-size:8pt; letter-spacing:.06em;
         text-transform:uppercase; color:var(--muted); margin:2.5mm 0 0; }
  .read{ font-family:var(--read); font-size:11pt; line-height:1.6; margin:2mm 0 0;
         max-width:62em; }

  ul.work{ font-family:var(--read); font-size:10.5pt; line-height:1.55;
           margin:2mm 0 0; padding:0; list-style:none; }
  ul.work li{ padding:1.6mm 0; border-top:.4pt solid var(--hair); }
  ul.work li:last-child{ border-bottom:.4pt solid var(--hair); }

  dl.metrics{ margin:2.5mm 0 0; padding:0; display:grid;
              grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 8mm; }
  .metric{ display:grid; grid-template-columns:1fr auto auto; align-items:baseline;
           gap:0 3mm; padding:2mm 0; border-top:.4pt solid var(--hair); break-inside:avoid; }
  .metric dt{ font-family:var(--sans); font-size:8.5pt; color:var(--muted); }
  .metric dd{ margin:0; font-variant-numeric:tabular-nums; }
  .figure{ font-family:var(--sans); font-weight:500; font-size:11pt; }
  .change{ font-family:var(--sans); font-size:8.5pt; }
  .change.up{ color:var(--clay); }
  .change.down{ color:var(--muted); }
  .change.flat{ color:var(--muted); }

  /* ---- cover ---- */
  .cover{ height:calc(297mm - 34mm); display:flex; flex-direction:column;
          justify-content:space-between; }
  .wordmark{ font-family:var(--sans); font-weight:500; font-size:10pt;
             letter-spacing:.13em; text-transform:uppercase; }
  .cover .lede{ font-family:var(--read); font-size:12pt; line-height:1.6;
                max-width:34em; margin:5mm 0 0; color:var(--ink); }
  .record{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
           gap:1mm 8mm; margin:8mm 0 0; }
  .record div{ display:flex; gap:3mm; align-items:baseline;
               border-top:.4pt solid var(--line); padding-top:1.6mm; }
  .record b{ font-family:var(--sans); font-weight:500; font-size:12pt;
             font-variant-numeric:tabular-nums; }
  .record span{ font-family:var(--sans); font-size:7.5pt; letter-spacing:.09em;
                text-transform:uppercase; color:var(--muted); }
  .where{ font-family:var(--sans); font-size:7.5pt; letter-spacing:.09em;
          text-transform:uppercase; color:var(--muted); margin:0; }

  /* ---- contents ---- */
  .toc{ break-before:page; }
  ol.toc-list{ list-style:none; margin:6mm 0 0; padding:0; }
  ol.toc-list li{ display:grid; grid-template-columns:9mm 1fr auto; gap:0 3mm;
                  align-items:baseline; padding:1.9mm 0;
                  border-top:.4pt solid var(--hair); }
  .n{ font-family:var(--sans); font-size:8pt; color:var(--muted);
      font-variant-numeric:tabular-nums; }
  .who{ font-family:var(--sans); font-size:10.5pt; font-weight:500; }
  .what{ font-family:var(--read); font-size:9.5pt; color:var(--muted); text-align:right; }

  /* ---- closing ---- */
  .closing{ break-before:page; }
  .closing .read{ max-width:44em; }
  .identify{ margin-top:10mm; padding-top:3mm; border-top:.4pt solid var(--line);
             font-family:var(--sans); font-size:8pt; color:var(--muted); line-height:1.7; }
</style>
</head>
<body>

<section class="cover">
  <div>
    <p class="wordmark">Top-Rated Team</p>
  </div>

  <div>
    <h1>Case studies</h1>
    <p class="lede">${CASES.length} paid-advertising engagements, with the figures as they
      were published — the account's own numbers over the period named on each page, and
      nothing rounded to make a point.</p>

    <div class="record">
      ${PROOF.map((p) => `<div><b>${esc(p.value)}</b><span>${esc(p.label)}</span></div>`).join("")}
    </div>
  </div>

  <p class="where">Prague, Madeira, Kyiv, Bratislava, Batumi · In the global paid ads and IT dev markets since 2017</p>
</section>

<section class="toc">
  <p class="eyebrow">Contents</p>
  <h2>What is in here</h2>
  <ol class="toc-list">${contents}</ol>
</section>

${casePages}

<section class="closing">
  <p class="eyebrow">About these pages</p>
  <h2>How to read them</h2>
  <p class="read">Every figure on the preceding pages comes from the advertising account it
    describes, over the period that page names, and is published in the same form the client
    saw it. Where a case gives no figure for something, the account did not measure it —
    a gap is left as a gap rather than filled with an estimate.</p>
  <p class="read">These are advertising results. They are evidence of work done on comparable
    accounts and they are not a forecast: what an account does next depends on its market, its
    offer and its budget, and anyone who tells you otherwise before seeing it is guessing.</p>
  <p class="read">The hours and the job-success score on the cover are the public record on
    Upwork and can be checked there.</p>
  <p class="identify">Top-Rated Team (Danylo Burykin SZČO) · top-rated.team<br>
    Generated from the published case studies — <code>scripts/build-cases-pdf.ts</code></p>
</section>

</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`${OUT}: ${CASES.length} cases`);
console.log(`\nNow make the PDF:\n  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\\n    --headless=new --disable-gpu --no-pdf-header-footer \\\n    --print-to-pdf="docs/case-studies.pdf" "docs/case-studies.html"`);
