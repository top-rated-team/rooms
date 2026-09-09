/**
 * The square lockup Google's OAuth consent screen asks for.
 *
 *   npx tsx scripts/build-brand-logo.ts
 *
 * Google rejected the brand review with "your logo does not uniquely identify
 * your brand and identity". The mark on its own is a shield with a star — a
 * generic trust badge, and one that reads as another platform's. A lockup that
 * carries the name cannot be mistaken for anybody, which is what the rule is
 * actually asking for.
 *
 * Rendered at 480 so it downsamples cleanly to the 120 the console wants, and
 * on the site's own ground rather than on white, so it matches the page the
 * consent screen sends people to.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SIZE = 480;
const logo = fs.readFileSync("client/public/assets/top-rated-logo.png").toString("base64");

/** A non-breaking hyphen: "TOP-RATED" must never break across the two lines. */
const WORDS = `<div class="words">TOP&#8209;RATED<br>TEAM</div>`;
const MARK = `<img class="mark" src="data:image/png;base64,${logo}" alt="">`;

function page(order: "words-above" | "mark-above"): string {
  return `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${SIZE}px;height:${SIZE}px}
  body{background:hsl(40 38% 92%);display:flex;flex-direction:column;align-items:center;
       justify-content:center;gap:34px;padding:52px}
  .mark{width:172px;height:172px;display:block}
  .words{font-family:Outfit,system-ui,sans-serif;font-weight:600;font-size:60px;line-height:1;
         letter-spacing:-.01em;color:hsl(33 19% 9%);text-align:center;text-transform:uppercase}
</style>
${order === "words-above" ? WORDS + MARK : MARK + WORDS}`;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-"));
for (const order of ["words-above", "mark-above"] as const) {
  const html = path.join(dir, `${order}.html`);
  fs.writeFileSync(html, page(order));
  const out = `client/public/assets/brand-${order}.png`;
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${SIZE},${SIZE}`, "--virtual-time-budget=6000",
    `--screenshot=${path.resolve(out)}`, `file://${html}`,
  ], { stdio: "ignore" });
  console.log(`${out} — ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${SIZE}x${SIZE}`);
}
fs.rmSync(dir, { recursive: true, force: true });
