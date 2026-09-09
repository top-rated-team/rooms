/**
 * The 1200x630 card every social network shows when this address is pasted.
 *
 *   npx tsx scripts/build-social-card.ts
 *
 * It is a script rather than a thing done by hand because the card carries the
 * hero's own line, drawn into pixels. When that line changed the first time,
 * the card kept the old one and nothing said so — a preview is the one surface
 * where being out of date is invisible from inside the application.
 *
 * The palette and the two faces are the site's own, read from
 * client/src/index.css rather than retyped: --background 40 38% 92%,
 * --foreground 33 19% 9%, --primary 16 70% 36%, Outfit and Newsreader.
 *
 * Chrome renders it. macOS only, which is where it is run.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "client/public/assets/social.png";

/** The hero's own two lines. Change them here and the card follows. */
const HEADLINE = "Hire a hybrid team\nfor your business.";
const MECHANISM = "Digital Experts + any AI agents in one room.";
const ADDRESS = "TOP-RATED.TEAM";

const logo = fs.readFileSync("client/public/assets/top-rated-logo.png").toString("base64");

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
  .mark { display: flex; align-items: baseline; gap: 14px; }
  .mark img { width: 46px; height: 46px; transform: translateY(11px); }
  .mark span { font-size: 30px; font-weight: 500; letter-spacing: .01em; }
  h1 {
    font-family: Outfit, system-ui, sans-serif;
    font-size: 92px; font-weight: 600; line-height: .98; letter-spacing: -.025em;
    white-space: pre-line;
  }
  .mech { margin-top: 26px; font-size: 34px; font-weight: 400; color: hsl(33 19% 9%); }
  .addr { font-family: Newsreader, Georgia, serif; font-size: 24px; letter-spacing: .14em; color: hsl(16 70% 36%); }
</style>
<div class="mark"><img src="data:image/png;base64,${logo}" alt=""><span>Top-Rated Team</span></div>
<div><h1>${HEADLINE}</h1><p class="mech">${MECHANISM}</p></div>
<div class="addr">${ADDRESS}</div>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-"));
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
console.log(`${OUT} — ${(bytes / 1024).toFixed(0)} KB`);
