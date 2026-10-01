/**
 * The day headings of the email booking block when its days are worked out
 * as the email is opened ("Nearest when opened" on the widget page): each
 * heading is two pictures side by side, the weekday ("THU") and the day and
 * month ("1 OCT") — client/public/booking-days/wd-<0..6>.png and
 * dm-<1..31>-<1..12>.png. 7 + 372 pictures rather than 2,604 whole headings.
 *
 * Drawn like the HTML heading they stand in for: 12px Arial-metric capitals
 * (Liberation Sans), a little tracking, the block's muted ink, at twice the
 * size for sharp screens. The weekday is set to the right of its box so the
 * gap before the date is always the same.
 *
 * Run with Playwright's Chromium available:
 *
 *   node scripts/build-day-images.mjs
 */

import fs from "node:fs";
import path from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("This script needs Playwright: npm i --no-save playwright (and its Chromium), then run it again.");
  process.exit(1);
}

const OUT = path.resolve(import.meta.dirname, "..", "client", "public", "booking-days");
fs.mkdirSync(OUT, { recursive: true });

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const TEXT = "font:12px/16px 'Liberation Sans',Arial,sans-serif;letter-spacing:0.5px;color:#6B6256;white-space:nowrap;";

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 200, height: 60 } });
async function draw(file, text, width, align) {
  await page.setContent(
    `<body style="margin:0;background:transparent"><div id="b" style="box-sizing:border-box;width:${width}px;height:16px;${TEXT}text-align:${align};">${text}</div></body>`,
  );
  await page.locator("#b").screenshot({ path: path.join(OUT, file), omitBackground: true });
}
let written = 0;
for (const [index, name] of WEEKDAYS.entries()) {
  await draw(`wd-${index}.png`, name, 34, "right");
  written += 1;
}
for (let month = 1; month <= 12; month += 1) {
  for (let day = 1; day <= 31; day += 1) {
    await draw(`dm-${day}-${month}.png`, `&nbsp;${day} ${MONTHS[month - 1]}`, 60, "left");
    written += 1;
  }
}
await browser.close();
console.log(`wrote ${written} images to ${path.relative(process.cwd(), OUT)}`);
