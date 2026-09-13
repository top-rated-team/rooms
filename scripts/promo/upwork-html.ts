/**
 * Upwork's visual language, not their mark. Green on white, then near-black,
 * a tight grotesque, a left rail — the marketplace profile a client scrolls
 * past. No Upwork logo: we do not have the right to show it.
 *
 * Colour classes are Tailwind token names (green-700, neutral-900, white).
 * Values are HSL, never a hex.
 */
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

function doorItems(): string {
  return DOOR_HEADLINES.map((headline, i) => {
    const n = String(i + 1).padStart(2, "0");
    return `<li style="animation-delay:${0.1 + i * 0.07}s"><span class="num">${n}</span><span>${wordsHtml(headline)}</span></li>`;
  }).join("");
}

function priceItems(): string {
  return PRICE_ROWS.map((row, i) => {
    const condition = row.condition
      ? `<span class="cond">${wordsHtml(row.condition)}</span>`
      : "";
    return `<li style="animation-delay:${0.08 + i * 0.05}s"><span class="price">${wordsHtml(row.price)}</span><span><span class="buys">${wordsHtml(row.buys)}</span>${condition}</span></li>`;
  }).join("");
}

export function upworkHtml(): string {
  const count = ACCOUNTS_PROCESSED.toLocaleString("en-US");

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=1920, height=1080">
<title>${escapeHtml(DISPLAY_NAME)}</title>
<style>
  :root {
    --white: 0 0% 100%;
    --neutral-100: 0 0% 96%;
    --neutral-500: 0 0% 45%;
    --neutral-900: 0 0% 9%;
    --neutral-950: 0 0% 4%;
    --green-500: 142 71% 45%;
    --green-700: 142 72% 29%;
    --background: var(--white);
    --foreground: var(--neutral-900);
    --primary: var(--green-700);
    --muted-foreground: var(--neutral-500);
    --border: 0 0% 90%;
    --font-sans: "Inter", "Avenir Next", "Segoe UI", system-ui, sans-serif;
  }
  html.dark {
    --background: var(--neutral-950);
    --foreground: var(--neutral-100);
    --primary: var(--green-500);
    --muted-foreground: 0 0% 63%;
    --border: 0 0% 18%;
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
  .bg-white { background: hsl(var(--white)); }
  .bg-neutral-950 { background: hsl(var(--neutral-950)); }
  .text-neutral-900 { color: hsl(var(--neutral-900)); }
  .text-green-700 { color: hsl(var(--green-700)); }
  #pulse { position: absolute; width: 1px; height: 1px; overflow: hidden; color: transparent; }
  .stage { position: relative; width: 1920px; height: 1080px; }
  [data-scene] {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px 96px 64px;
    opacity: 0; visibility: hidden;
  }
  [data-scene].on { opacity: 1; visibility: visible; }
  .rail {
    width: 6px; height: 56px; background: hsl(var(--primary));
    border-radius: 999px;
  }
  .name { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .kicker { font-size: 15px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: hsl(var(--primary)); }
  .display { font-size: 84px; font-weight: 700; line-height: 1.08; letter-spacing: 0; word-spacing: 0.22em; }
  .mech { font-size: 28px; font-weight: 400; color: hsl(var(--muted-foreground)); margin-top: 24px; }
  .doors { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .doors li {
    display: grid; grid-template-columns: 64px 1fr; gap: 20px; align-items: baseline;
    font-size: 30px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2;
  }
  .num { font-size: 18px; font-weight: 600; color: hsl(var(--primary)); letter-spacing: 0.04em; }
  .doors li { word-spacing: 0.16em; }
  .prices { list-style: none; display: flex; flex-direction: column; }
  .prices li {
    display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: baseline;
    padding: 8px 0; border-top: 1px solid hsl(var(--border));
  }
  .price { font-size: 22px; font-weight: 700; color: hsl(var(--primary)); }
  .buys { font-size: 22px; color: hsl(var(--foreground)); }
  .cond { display: block; margin-top: 2px; font-size: 16px; color: hsl(var(--muted-foreground)); }
  .count { font-size: 168px; font-weight: 700; line-height: 0.9; letter-spacing: -0.045em; }
  .room p { font-size: 52px; font-weight: 600; line-height: 1.18; letter-spacing: -0.03em; }
  .foot { font-size: 18px; font-weight: 600; color: hsl(var(--muted-foreground)); }
  header, footer { display: flex; align-items: center; gap: 16px; }
</style>
<body>
<div id="pulse">0</div>
<div class="stage">

  <section data-scene="open" class="on">
    <header class="rise"><div class="rail"></div><p class="name">${wordsHtml(DISPLAY_NAME)}</p></header>
    <div>
      <h1 class="display rise" style="animation-delay:0.1s">${wordsHtml(HEADLINE_LINES[0])}<br>${wordsHtml(HEADLINE_LINES[1])}</h1>
      <p class="mech rise" style="animation-delay:0.22s">${wordsHtml(MECHANISM)}</p>
    </div>
    <p class="foot rise" style="animation-delay:0.34s">${wordsHtml(ADDRESS)}</p>
  </section>

  <section data-scene="doors">
    <p class="kicker rise">${wordsHtml(WORK_LABEL)}</p>
    <ul class="doors">${doorItems()}</ul>
    <p class="foot rise">${wordsHtml(DISPLAY_NAME)}</p>
  </section>

  <section data-scene="prices">
    <p class="kicker rise">${wordsHtml(PRICE_LABEL)}</p>
    <ul class="prices">${priceItems()}</ul>
    <p class="foot rise">${wordsHtml(ADDRESS)}</p>
  </section>

  <section data-scene="stats">
    <p class="kicker rise">${wordsHtml(DISPLAY_NAME)}</p>
    <div>
      <p class="count rise">${wordsHtml(count)}</p>
      <p class="mech rise" style="animation-delay:0.14s;max-width:none">${wordsHtml(`${ACCOUNTS_LABEL}.`)}</p>
      <p class="foot rise" style="animation-delay:0.26s;margin-top:16px">${wordsHtml(ACCOUNTS_NOTE)}</p>
    </div>
    <span></span>
  </section>

  <section data-scene="room">
    <p class="kicker rise">${wordsHtml(DISPLAY_NAME)}</p>
    <div class="room">
      ${ROOM_LINES.map((line, i) => `<p class="rise" style="animation-delay:${0.08 + i * 0.14}s">${wordsHtml(line)}</p>`).join("")}
    </div>
    <span></span>
  </section>

  <section data-scene="close">
    <header class="rise"><div class="rail"></div><p class="name">${wordsHtml(DISPLAY_NAME)}</p></header>
    <h1 class="display rise" style="animation-delay:0.1s">${wordsHtml(DISPLAY_NAME)}</h1>
    <p class="foot rise" style="animation-delay:0.22s">${wordsHtml(ADDRESS)}</p>
  </section>

</div>
${timelineScript()}
</body>
</html>`;
}
