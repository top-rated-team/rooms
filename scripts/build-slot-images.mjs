/**
 * The time buttons of the email booking block, as images: every half-hour of
 * the day, free and taken — client/public/booking-slots/HHMM-free.png and
 * HHMM-taken.png.
 *
 * WHY IMAGES. A block pasted into an email is frozen when it is sent; the one
 * part of an email that is fetched again when it is opened is an image. So
 * each time in the block is a link around an image from
 * /api/booking/slot/<date>/<HHMM>.png (server/booking/slot-image.ts), which
 * answers with the free or the taken picture of that time as the calendar
 * stands at that moment.
 *
 * WHY DRAWN HERE and committed. The server has no image library, and Gmail
 * shows no SVG. There are only two pictures per time, so they are drawn once,
 * like the button the block used to draw in HTML: 1px rule, 6px radius, 14px
 * Arial-metric text (Liberation Sans), at twice the size for sharp screens.
 *
 * Run with Playwright's Chromium available:
 *
 *   node scripts/build-slot-images.mjs
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

const OUT = path.resolve(import.meta.dirname, "..", "client", "public", "booking-slots");
fs.mkdirSync(OUT, { recursive: true });

const STYLE = {
  free: "border:1px solid #D2C8B7;background:#FBF8F2;color:#1B1713;",
  taken: "border:1px dashed #DDD5C6;background:#F7F2E8;color:#B3A999;text-decoration:line-through;",
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 200, height: 100 } });
let written = 0;
for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
  const label = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  for (const [state, style] of Object.entries(STYLE)) {
    await page.setContent(
      `<body style="margin:0;background:transparent">` +
        `<div id="b" style="box-sizing:border-box;width:64px;height:34px;border-radius:6px;${style}` +
        `font:14px/32px 'Liberation Sans',Arial,sans-serif;text-align:center;">${label}</div></body>`,
    );
    await page.locator("#b").screenshot({ path: path.join(OUT, `${label.replace(":", "")}-${state}.png`), omitBackground: true });
    written += 1;
  }
}
await browser.close();
console.log(`wrote ${written} images to ${path.relative(process.cwd(), OUT)}`);
