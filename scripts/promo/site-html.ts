/**
 * The site's own visual language: warm paper, one clay accent, Outfit and
 * Newsreader, three type sizes, hairline rules. Tokens are the HSL values
 * from client/src/index.css — named as Tailwind reads them, never a hex.
 */
import fs from "node:fs";
import path from "node:path";

import {
  ACCOUNTS_LABEL,
  ACCOUNTS_NOTE,
  ACCOUNTS_PROCESSED,
  ADDRESS,
  DISPLAY_NAME,
  DOOR_HEADLINES,
  HEADLINE_LINES,
  MECHANISM,
  PRICE_LABEL,
  PRICE_ROWS,
  ROOM_LINES,
  WORK_LABEL,
  escapeHtml,
  wordsHtml,
} from "./copy";
import { timelineScript } from "./timeline";

const logoPath = path.resolve("client/public/assets/top-rated-logo.png");

function doorItems(): string {
  return DOOR_HEADLINES.map(
    (headline, i) =>
      `<li style="animation-delay:${0.12 + i * 0.08}s">${wordsHtml(headline)}</li>`,
  ).join("");
}

function priceItems(): string {
  return PRICE_ROWS.map((row, i) => {
    const condition = row.condition
      ? `<span class="cond">${wordsHtml(row.condition)}</span>`
      : "";
    return `<li style="animation-delay:${0.1 + i * 0.05}s"><span class="price">${wordsHtml(row.price)}</span><span><span class="buys">${wordsHtml(row.buys)}</span>${condition}</span></li>`;
  }).join("");
}

export function siteHtml(): string {
  const logo = fs.readFileSync(logoPath).toString("base64");
  const count = ACCOUNTS_PROCESSED.toLocaleString("en-US");

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=1920, height=1080">
<title>${escapeHtml(DISPLAY_NAME)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Outfit:wght@400;500;600&display=swap">
<style>
  :root {
    --background: 40 38% 92%;
    --foreground: 33 19% 9%;
    --primary: 16 70% 36%;
    --muted-foreground: 33 11% 38%;
    --border: 38 23% 77%;
    --font-sans: "Outfit", "Inter", "Avenir Next", "Segoe UI", system-ui, sans-serif;
    --font-read: "Newsreader", Georgia, "Times New Roman", serif;
  }
  html.dark {
    --background: 34 20% 7%;
    --foreground: 38 37% 88%;
    --primary: 19 63% 60%;
    --muted-foreground: 34 11% 57%;
    --border: 35 20% 17%;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; }
  body {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: var(--font-sans);
    word-spacing: 0.18em;
  }
  .w { display: inline-block; margin-right: 14px; }
  .bg-background { background: hsl(var(--background)); }
  .text-foreground { color: hsl(var(--foreground)); }
  .text-primary { color: hsl(var(--primary)); }
  .text-muted-foreground { color: hsl(var(--muted-foreground)); }
  .border-border { border-color: hsl(var(--border)); }
  #pulse { position: absolute; width: 1px; height: 1px; overflow: hidden; color: transparent; }
  .stage { position: relative; width: 1920px; height: 1080px; }
  [data-scene] {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 80px 96px 72px;
    opacity: 0; visibility: hidden;
  }
  [data-scene].on { opacity: 1; visibility: visible; }
  .mark { display: flex; align-items: center; gap: 16px; }
  .mark img { width: 44px; height: 44px; display: block; }
  .mark span {
    font-size: 22px; font-weight: 500; letter-spacing: 0.01em;
  }
  .type-meta {
    font-size: 18px; font-weight: 500; letter-spacing: 0.09em;
    text-transform: uppercase; color: hsl(var(--muted-foreground));
  }
  .type-display {
    font-size: 84px; font-weight: 600; line-height: 1.08;
    letter-spacing: 0;
    word-spacing: 0.22em;
  }
  .type-body {
    font-family: var(--font-read);
    font-size: 32px; font-weight: 400; line-height: 1.35;
  }
  .doors { list-style: none; display: flex; flex-direction: column; gap: 12px; }
  .doors li {
    font-size: 30px; font-weight: 500; letter-spacing: 0; line-height: 1.25;
    word-spacing: 0.16em;
  }
  .prices { list-style: none; display: flex; flex-direction: column; }
  .prices li {
    display: grid; grid-template-columns: 260px 1fr; gap: 28px;
    align-items: baseline; padding: 8px 0;
    border-top: 1px solid hsl(var(--border));
  }
  .price { font-size: 22px; font-weight: 600; letter-spacing: -0.015em; }
  .buys { font-family: var(--font-read); font-size: 22px; color: hsl(var(--foreground)); }
  .cond {
    display: block; margin-top: 2px;
    font-family: var(--font-read); font-size: 18px;
    color: hsl(var(--muted-foreground));
  }
  .count {
    font-size: 180px; font-weight: 600; line-height: 0.9; letter-spacing: -0.03em;
  }
  .room p { font-size: 56px; font-weight: 500; line-height: 1.2; letter-spacing: -0.015em; }
  .addr {
    font-family: var(--font-read);
    font-size: 28px; letter-spacing: 0.14em; color: hsl(var(--primary));
  }
</style>
<body class="bg-background text-foreground">
<div id="pulse">0</div>
<div class="stage">

  <section data-scene="open" class="on">
    <div class="mark rise">
      <img src="data:image/png;base64,${logo}" alt="">
      <span>${wordsHtml(DISPLAY_NAME)}</span>
    </div>
    <div>
      <h1 class="type-display rise" style="animation-delay:0.12s">${wordsHtml(HEADLINE_LINES[0])}<br>${wordsHtml(HEADLINE_LINES[1])}</h1>
      <p class="type-body rise" style="animation-delay:0.28s;margin-top:28px">${wordsHtml(MECHANISM)}</p>
    </div>
    <p class="addr rise" style="animation-delay:0.4s">${wordsHtml(ADDRESS.toUpperCase())}</p>
  </section>

  <section data-scene="doors">
    <p class="type-meta rise">${wordsHtml(WORK_LABEL)}</p>
    <ul class="doors">${doorItems()}</ul>
    <p class="type-meta rise">${wordsHtml(DISPLAY_NAME)}</p>
  </section>

  <section data-scene="prices">
    <p class="type-meta rise">${wordsHtml(PRICE_LABEL)}</p>
    <ul class="prices">${priceItems()}</ul>
    <p class="type-meta rise">${wordsHtml(ADDRESS)}</p>
  </section>

  <section data-scene="stats">
    <p class="type-meta rise">${wordsHtml(DISPLAY_NAME)}</p>
    <div>
      <p class="count rise text-foreground">${wordsHtml(count)}</p>
      <p class="type-body rise" style="animation-delay:0.16s;margin-top:20px">${wordsHtml(`${ACCOUNTS_LABEL}.`)}</p>
      <p class="type-meta rise" style="animation-delay:0.28s;margin-top:20px">${wordsHtml(ACCOUNTS_NOTE)}</p>
    </div>
    <span></span>
  </section>

  <section data-scene="room">
    <p class="type-meta rise">${wordsHtml(DISPLAY_NAME)}</p>
    <div class="room">
      ${ROOM_LINES.map((line, i) => `<p class="rise" style="animation-delay:${0.1 + i * 0.16}s">${wordsHtml(line)}</p>`).join("")}
    </div>
    <span></span>
  </section>

  <section data-scene="close">
    <div class="mark rise">
      <img src="data:image/png;base64,${logo}" alt="">
      <span>${wordsHtml(DISPLAY_NAME)}</span>
    </div>
    <h1 class="type-display rise" style="animation-delay:0.12s">${wordsHtml(DISPLAY_NAME)}</h1>
    <p class="addr rise" style="animation-delay:0.24s">${wordsHtml(ADDRESS.toUpperCase())}</p>
  </section>

</div>
${timelineScript()}
</body>
</html>`;
}
