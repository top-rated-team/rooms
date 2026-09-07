/**
 * Turns parcels.json into the prompts you actually paste.
 *
 *   node scripts/build-prompts.mjs          # writes docs/prompts.html
 *   node scripts/build-prompts.mjs --text   # prints them to the terminal
 *
 * Generated rather than written, because a prompt that names the wrong files is
 * worse than no prompt: the agent obeys it and edits somebody else's parcel.
 */
import fs from "node:fs";

const m = JSON.parse(fs.readFileSync("parcels.json", "utf8"));
const REPO = "~/Documents/ChatGPT Ads";

const WAVES = [
  { n: 1, keys: ["spend-limits", "door-linkedin-ads", "favicon-and-social"] },
  { n: 2, keys: ["door-linkedin-automation", "llms-txt", "legal-name-display"] },
  { n: 3, keys: ["door-ai-builds", "payment-link", "identity-in-the-room"] },
  { n: 4, keys: ["rented-accounts-inventory"] },
  { n: 5, keys: ["room"], alone: true },
  { n: 6, keys: ["outside-agent"], alone: true },
  { n: 7, keys: ["approval-card"], alone: true },
  { n: 8, keys: ["recurring-and-digest"], alone: true },
];

function prompt(key) {
  const p = m.parcels[key];
  if (!p) throw new Error(`no parcel named ${key}`);
  const seamNames = Object.keys(p.seams ?? {});

  const lines = [];
  lines.push(`You are working in ${REPO}, branch main. One parcel, called "${key}".`);
  lines.push("");
  lines.push("Read these first, before you write anything: README.md, docs/doors.md, shared/doors.ts.");
  lines.push("Then read three files next to the ones you are about to change.");
  lines.push("");
  lines.push("WHAT YOU OWN. These files, and nothing else in the repository:");
  for (const f of p.owns ?? []) lines.push(`  ${f}`);
  lines.push("");

  if (seamNames.length) {
    lines.push("SHARED FILES YOU MAY TOUCH, and only in the way described:");
    for (const f of seamNames) {
      lines.push(`  ${f}`);
      for (const change of p.seams[f]) lines.push(`      - ${change}`);
    }
    lines.push("");
    lines.push("Add to those, never delete from them. Other agents are editing the same files right now.");
  } else {
    lines.push("SHARED FILES: none. You do not edit any file outside the list above.");
  }
  lines.push("");

  lines.push("NEVER EDIT THESE, whatever the reason:");
  for (const f of m.frozen ?? []) lines.push(`  ${f}`);
  lines.push("");
  lines.push("WHAT DONE MEANS FOR THIS PARCEL:");
  lines.push(wrap(p.done, 96, "  "));
  lines.push("");
  lines.push("WHY IT EXISTS, so you can judge the edge cases yourself:");
  lines.push(wrap(p.why ?? "—", 96, "  "));
  lines.push("");
  lines.push("RULES");
  lines.push("  - `npm run verify` must pass when you finish. Run it yourself.");
  lines.push("  - No new dependency. No change to package.json unless it is listed as yours above.");
  lines.push("  - No git command that changes anything: no commit, no checkout, no branch, no stash.");
  lines.push("  - If you need a change in a file you do not own, DO NOT make it. Put it at the end of");
  lines.push("    your report as a handoff: the file, the exact change, and why.");
  lines.push("  - Write real copy: plain words, no marketing verbs, no exclamation marks. Both light and");
  lines.push("    dark themes. Tailwind tokens only, never a hex colour.");
  lines.push("  - Anything you tell a visitor must be true of the code as it stands. If it is not true,");
  lines.push("    change the code or change the sentence — never ship the sentence.");
  lines.push("  - There is no OPENAI_API_KEY on this machine, so the Ask panel shows its \"live answers");
  lines.push("    aren't configured\" state and `npm run kb:embed` cannot run. That is normal. Do not");
  lines.push("    try to work around it and do not report it as a fault.");
  lines.push("");
  lines.push("WHEN YOU FINISH, report exactly this:");
  lines.push("  1. What you built, in plain sentences.");
  lines.push("  2. What you could not do, and why.");
  lines.push("  3. Every handoff.");
  lines.push("  4. The output of `npm run verify`.");
  return lines.join("\n");
}

function wrap(text, width, indent) {
  const words = String(text).split(/\s+/);
  const out = [];
  let line = indent;
  for (const w of words) {
    if (line.length + w.length + 1 > width && line.trim()) { out.push(line); line = indent; }
    line += (line === indent ? "" : " ") + w;
  }
  if (line.trim()) out.push(line);
  return out.join("\n");
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (process.argv.includes("--text")) {
  for (const wave of WAVES) {
    for (const key of wave.keys) {
      console.log(`\n${"=".repeat(78)}\nWAVE ${wave.n} — ${key}\n${"=".repeat(78)}\n`);
      console.log(prompt(key));
    }
  }
  process.exit(0);
}

const waveHtml = WAVES.map((wave) => {
  const cards = wave.keys
    .map((key) => {
      const p = m.parcels[key];
      return `      <article class="parcel">
        <header>
          <h3>${esc(key)}</h3>
          <button class="copy" data-target="p-${esc(key)}">Copy this prompt</button>
        </header>
        <p class="what">${esc(oneLine(p.why))}</p>
        <pre id="p-${esc(key)}">${esc(prompt(key))}</pre>
      </article>`;
    })
    .join("\n");
  return `    <section class="wave">
      <h2>Wave ${wave.n}${wave.alone ? " — this one runs alone" : ""}</h2>
      <p class="waveNote">${
        wave.alone
          ? "Start it, wait for it to finish, then move on. Nothing else at the same time."
          : `Start these ${wave.keys.length} together. When all ${wave.keys.length} have reported, run the two commands, then go to the next wave.`
      }</p>
${cards}
    </section>`;
}).join("\n");

function oneLine(text) {
  const s = String(text ?? "").trim();
  const stop = s.indexOf(". ");
  return stop > 40 ? s.slice(0, stop + 1) : s;
}

fs.writeFileSync("docs/prompts.html", page(waveHtml));
console.log(`docs/prompts.html — ${WAVES.reduce((n, w) => n + w.keys.length, 0)} prompts in ${WAVES.length} waves`);

function page(body) {
  const TOTAL = WAVES.reduce((n, w) => n + w.keys.length, 0);
  return `<title>Prompts to Paste</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{
    --paper:#F3EEE4; --card:#FBF8F2; --ink:#1A1713; --ink2:#4A423A; --ink3:#7C7166;
    --line:#DED5C6; --line2:#C9BDA9; --clay:#9A4A22; --code:#211D18; --codeInk:#E6DFD3;
    --read:"Newsreader",Georgia,serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --paper:#15120E; --card:#1D1913; --ink:#F0EAE0; --ink2:#BFB4A6; --ink3:#8B8072;
    --line:#2E271F; --line2:#443A2E; --clay:#D98B5F; --code:#0E0C09; --codeInk:#DCD4C8;
  }}
  :root[data-theme="dark"]{
    --paper:#15120E; --card:#1D1913; --ink:#F0EAE0; --ink2:#BFB4A6; --ink3:#8B8072;
    --line:#2E271F; --line2:#443A2E; --clay:#D98B5F; --code:#0E0C09; --codeInk:#DCD4C8;
  }
  *{box-sizing:border-box}
  body{background:var(--paper);color:var(--ink);font-family:var(--read);font-size:19px;line-height:1.6;margin:0}
  .wrap{max-width:60rem;margin:0 auto;padding:3rem 1.5rem 6rem}
  h1{font-size:clamp(2rem,1rem+3.4vw,3rem);line-height:1.05;letter-spacing:-.02em;margin:.4rem 0 0;text-wrap:balance}
  .lede{color:var(--ink2);margin:1rem 0 0;max-width:44ch}
  h2{font-size:1.35rem;font-weight:600;letter-spacing:-.01em;margin:0;padding-top:1.4rem;border-top:1px solid var(--line2)}
  h3{font-family:var(--mono);font-size:.95rem;font-weight:500;margin:0;color:var(--clay)}
  .steps{margin:2.5rem 0 0;padding:0;list-style:none;counter-reset:s}
  .steps li{counter-increment:s;position:relative;padding-left:2.6rem;margin:0 0 1.1rem}
  .steps li::before{content:counter(s);position:absolute;left:0;top:.05em;font-family:var(--mono);font-size:.8rem;color:var(--ink3);border:1px solid var(--line2);border-radius:50%;width:1.7rem;height:1.7rem;display:grid;place-items:center}
  .cmd{background:var(--code);color:var(--codeInk);font-family:var(--mono);font-size:.82rem;line-height:1.7;padding:.9rem 1.1rem;border-radius:.4rem;overflow-x:auto;margin:.7rem 0 0;white-space:pre}
  .wave{margin-top:3.4rem}
  .waveNote{color:var(--ink2);font-size:.95rem;margin:.6rem 0 0;max-width:52ch}
  .parcel{background:var(--card);border:1px solid var(--line);border-radius:.5rem;margin-top:1.4rem;overflow:hidden}
  .parcel header{display:flex;flex-wrap:wrap;gap:.8rem;align-items:center;justify-content:space-between;padding:.9rem 1.1rem;border-bottom:1px solid var(--line)}
  .what{color:var(--ink2);font-size:.95rem;margin:0;padding:.9rem 1.1rem 0;max-width:60ch}
  .copy{font-family:var(--mono);font-size:.75rem;letter-spacing:.03em;cursor:pointer;background:var(--clay);color:var(--paper);border:0;border-radius:.3rem;padding:.5rem .85rem}
  .copy:hover{filter:brightness(1.12)}
  .copy:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  .copy[data-done]{background:transparent;color:var(--clay);box-shadow:inset 0 0 0 1px var(--clay)}
  pre{font-family:var(--mono);font-size:.74rem;line-height:1.62;background:transparent;color:var(--ink2);margin:0;padding:1.1rem;overflow-x:auto;white-space:pre;max-height:19rem}
  .parcel[data-open] pre{max-height:none}
  .more{width:100%;font-family:var(--mono);font-size:.72rem;color:var(--ink3);background:transparent;border:0;border-top:1px solid var(--line);padding:.55rem;cursor:pointer}
  .more:hover{color:var(--ink)}
  footer{margin-top:4rem;padding-top:1.2rem;border-top:1px solid var(--line);color:var(--ink3);font-size:.86rem}
</style>

<div class="wrap">
  <h1>Prompts to Paste</h1>
  <p class="lede">${TOTAL} of them. Copy one, paste it into a fresh agent, and that is the whole job.
  Nothing on this page needs reading twice.</p>

  <ol class="steps">
    <li>Open a terminal in the project.
      <div class="cmd">cd ~/Documents/ChatGPT\\ Ads</div>
    </li>
    <li>Check the tree is clean before anyone writes in it.
      <div class="cmd">node scripts/check-parcels.mjs &amp;&amp; npm run verify</div>
    </li>
    <li>Start the agents in a wave — press <b>Copy this prompt</b>, paste into a new agent, one agent per prompt.</li>
    <li>Wait for every agent in that wave to report. <b>Do not run anything while they type.</b></li>
    <li>Run the same two commands again. If they pass, commit. Then the next wave.</li>
  </ol>

${body}

  <footer>Generated from <code>parcels.json</code> by <code>scripts/build-prompts.mjs</code>. Change a parcel
  and rebuild — never edit a prompt here by hand, or it will name files that have moved.</footer>
</div>

<script>
  for (const b of document.querySelectorAll(".copy")) {
    b.addEventListener("click", async () => {
      const text = document.getElementById(b.dataset.target).textContent;
      try { await navigator.clipboard.writeText(text); }
      catch {
        const t = document.createElement("textarea");
        t.value = text; document.body.appendChild(t); t.select();
        document.execCommand("copy"); t.remove();
      }
      const was = b.textContent;
      b.textContent = "Copied"; b.dataset.done = "1";
      setTimeout(() => { b.textContent = was; delete b.dataset.done; }, 1600);
    });
  }
  for (const p of document.querySelectorAll(".parcel")) {
    const pre = p.querySelector("pre");
    if (pre.scrollHeight <= pre.clientHeight + 4) continue;
    const more = document.createElement("button");
    more.className = "more"; more.type = "button"; more.textContent = "Show the whole prompt";
    more.addEventListener("click", () => {
      const open = p.hasAttribute("data-open");
      if (open) p.removeAttribute("data-open"); else p.setAttribute("data-open", "");
      more.textContent = open ? "Show the whole prompt" : "Collapse";
    });
    p.appendChild(more);
  }
</script>
`;
}
