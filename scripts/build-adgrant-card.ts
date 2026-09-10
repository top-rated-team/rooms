/**
 * The 1200x630 card social networks show when adgrant.ai is pasted.
 *
 *   npx tsx scripts/build-adgrant-card.ts
 *
 * A sibling of scripts/build-social-card.ts and deliberately not a parameter
 * of it: the two sites have different marks, different palettes and different
 * arguments, and a card generator with a branch for each is the kind of thing
 * that quietly renders one site's colours under the other's name.
 *
 * THE NUMBER ON THE CARD IS READ, NOT TYPED. It comes from shared/adgrant.ts,
 * which the build fetches from the live product, so a card that says 4,539
 * says it because the API did. When the figure moves the card follows on the
 * next run rather than becoming quietly false, which is the failure a preview
 * image is uniquely good at hiding — nobody on this side ever looks at it.
 *
 * Chrome renders it. macOS only, which is where it is run.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { STATS } from "../shared/adgrant";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "client/public/assets/adgrant-social.png";

const count = STATS.accountsProcessed.toLocaleString("en-US");
const HEADLINE = `${count} Ad Grant accounts\nprocessed.`;
const MECHANISM = "A Google Ad Grant structure, produced from the nonprofit's own website.";
const ADDRESS = "ADGRANT.AI";

const logo = fs.readFileSync("client/public/assets/adgrant-logo.png").toString("base64");

const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Outfit:wght@400;500;600&display=swap">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: hsl(40 38% 92%);
    color: hsl(33 19% 9%);
    font-family: Outfit, system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 78px 88px;
  }
  .mark { display: flex; align-items: center; gap: 16px; }
  .mark img { width: 52px; height: 52px; }
  .mark span { font-size: 30px; font-weight: 500; letter-spacing: .12em; }
  h1 {
    font-size: 88px; font-weight: 600; line-height: .98; letter-spacing: -.025em;
    white-space: pre-line;
  }
  .mech { margin-top: 26px; font-size: 32px; font-weight: 400; max-width: 26ch; }
  .addr { font-family: Newsreader, Georgia, serif; font-size: 24px; letter-spacing: .14em; color: hsl(16 70% 36%); }
</style>
<div class="mark"><img src="data:image/png;base64,${logo}" alt=""><span>AdGrant.AI</span></div>
<div><h1>${HEADLINE}</h1><p class="mech">${MECHANISM}</p></div>
<div class="addr">${ADDRESS}</div>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adgrant-card-"));
const page = path.join(dir, "card.html");
fs.writeFileSync(page, html);

execFileSync(CHROME, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1200,630",
  "--virtual-time-budget=6000",
  `--screenshot=${path.resolve(OUT)}`,
  `file://${page}`,
], { stdio: "ignore" });

fs.rmSync(dir, { recursive: true, force: true });
const bytes = fs.statSync(OUT).size;
console.log(`${OUT} — ${(bytes / 1024).toFixed(0)} KB, ${count} accounts`);
