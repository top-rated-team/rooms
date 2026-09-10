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
  /*
   * PROGRAMME THREE, SECOND HALF. The first five parcels are landed and retired to
   * docs/parcels-programme-3-landed.json, so they no longer appear here: a re-run of a
   * landed parcel is an agent rewriting a finished file, and the owner copies from the
   * published page rather than from this file. The numbering keeps going from four so
   * that "wave 4" still means what it meant when the page said it.
   *
   * Two of the new parcels reuse ownership the retired ones released, on purpose:
   * adgrant-site inherits the AdGrant tree from adgrant-front, and booking-picker
   * inherits the dialog from booking-dialog.
   *
   * The dependencies, which is why the order is not a preference:
   *   - dev-agents-kb before dev-agents. An agent with useKb set and no corpus retrieves
   *     nothing AT ALL, silently, and shared/roster.ts says so in the field's own comment.
   *   - adgrant-content before adgrant-site. The site renders shared/adgrant.ts, and that
   *     module does not exist until the content parcel writes it.
   *   - adgrant-generate before adgrant-site. The front page calls the generator; it does
   *     not reimplement it.
   *
   * And the standing rule, unchanged: AT MOST ONE PARCEL PER WAVE TOUCHES server/routes.ts,
   * and the same for shared/api.ts and shared/schema.ts.
   */
  /* Waves 4 to 8 are landed and their parcels are retired to
     docs/parcels-programme-3-landed.json, so they no longer appear here — a
     re-run of a landed parcel is an agent rewriting a finished file. */
  /* Waves 10 to 12 have run and their parcels are retired to
     docs/parcels-programme-3-landed.json. booking-gate landed clean. The other
     two came back with defects and their code is on main but sealed; the two
     waves below are what repairs and finishes them, so re-running the retired
     parcels would undo that. */
  /* The flags are set and mostly ignored. A sweep found seventy-five surfaces
     where a LinkedIn service or agent still reaches a visitor despite
     hidden: true, and the list is docs/review/2026-09-09-interrupted-reviews.md
     rather than something this parcel has to rediscover. It runs alone because
     it touches the room panel and the connector, which everything reads. */
  /* Waves 13 to 15 have run and their parcels are retired to the landed
     manifest. The adgrant.ai move that followed them was done by hand rather
     than as a parcel, on the owner's instruction. */
  /*
   * A template page prints seven numbers and hands over nothing, and the
   * owner's point is that a template IS the setup. The structures are already
   * published — /api/templates/<slug> carries them and our build asks the
   * endpoint that omits them — so this parcel joins data that exists to a CSV
   * writer that exists. It does NOT touch anybody's Google Ads account.
   */
  { n: 16, keys: ["adgrant-setup-files"], alone: true },
  /*
   * Everything after a booking: remember it, come back to it, change it,
   * cancel it. It waited for wave 14 to release BookingDialog.tsx.
   */
  { n: 17, keys: ["booking-return"], alone: true },
  /* Logout, and one account with several ways in. It is last of the three
     because it is the only one that introduces a session — a credential in a
     cookie and a merge that can hand one person's rooms to another if it is
     written carelessly — and the other two are additions to things that
     already work. One after another, not together: all three want
     server/routes.ts and shared/api.ts. */
  { n: 18, keys: ["room-account"], alone: true },
  /* The thing the owner has asked for four times and that has never existed.
     It cannot be started until two values exist — the client id and secret of
     his separate Google app, the one with only calendar.freebusy on it. The
     parcel is written to be completely inert without them, so running it early
     costs nothing but produces nothing either. */
  { n: 19, keys: ["visitor-calendar"], alone: true },
];

function prompt(key) {
  const p = m.parcels[key];
  if (!p) throw new Error(`no parcel named ${key}`);
  const seamNames = Object.keys(p.seams ?? {});

  const lines = [];
  lines.push(`You are working in ${REPO}, branch main. One parcel, called "${key}".`);
  lines.push("");
  lines.push("Read these first, before you write anything, in this order:");
  lines.push("  docs/specs/adgrant-and-dev-agents.md — the second brief. adgrant.ai's own public");
  lines.push("    content API and what was captured through it; the six statements in that material");
  lines.push("    that are wrong against Google's current documentation, each with the page that");
  lines.push("    contradicts it; why \"generate and upload\" is two products with a Google approval");
  lines.push("    between them; and the answer to the owner's question about per-agent limits.");
  lines.push("  docs/specs/unipile-rooms-and-booking.md — the first brief. Every Unipile");
  lines.push("    endpoint it touches, transcribed with the URL it came from. Four decisions already");
  lines.push("    made, with the reasoning, so you do not spend your wave relitigating them. The");
  lines.push("    request and response shapes two parcels build to in parallel. And the rule the");
  lines.push("    owner set: every message is checked for who it is from, who it is to and which");
  lines.push("    chat it is in. Do not work from a paraphrase of the owner's request instead. Three");
  lines.push("    things a reasonable person assumes Unipile has, it does not: a free/busy endpoint,");
  lines.push("    a LID-to-phone resolver, and an HMAC signature on its webhooks. The brief says so.");
  lines.push("    A paraphrase would not, and you would find out after building on all three.");
  lines.push("  README.md, private/doors.md, shared/doors.ts.");
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
  if (wave.landed) {
    return `    <section class="wave" data-landed>
      <h2>Wave ${wave.n} — landed</h2>
      <p class="waveNote">${wave.keys.join(", ")} — reported, reviewed and committed. Nothing to run here.</p>
    </section>`;
  }

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
const total = WAVES.reduce((n, w) => n + w.keys.length, 0);
console.log(`docs/prompts.html — ${total} prompts in ${WAVES.length} waves (${WAVES.filter((w) => w.landed).reduce((n, w) => n + w.keys.length, 0)} landed)`);
/*
 * The reminder exists because of a real failure, not as decoration.
 *
 * Writing this file and publishing the page the owner copies from are two
 * steps, and for several days I did only the first. He ran a wave whose prompt
 * had never reached him, the agent produced nothing, and it took him telling me
 * "there is no home-room in the file I take everything from" to find it.
 *
 * Nothing here can publish for me — that is a tool call, not a command — so the
 * only defence is that the step is impossible to forget quietly.
 */
console.log("");
console.log("  REPUBLISH THE ARTIFACT. This file is not what the owner reads:");
console.log("  he copies from the published page, and it is now behind by");
console.log(`  whatever changed. ${total} prompts should appear there.`);

function page(body) {
  /* Counts what is still to run, not what has ever existed: a page that says
     "14 of them" over eleven runnable prompts is a page that has to be counted
     by hand. */
  const runnable = WAVES.filter((w) => !w.landed).reduce((n, w) => n + w.keys.length, 0);
  const landed = WAVES.filter((w) => w.landed).reduce((n, w) => n + w.keys.length, 0);
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
  .wave[data-landed] h2{color:var(--ink3)}
  .wave[data-landed] .waveNote{font-family:var(--mono);font-size:.8rem}
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
  <p class="lede">${runnable} still to run${landed > 0 ? `, ${landed} landed` : ""}. Copy one, paste
  it into a fresh agent, and that is the whole job. Nothing on this page needs reading twice.</p>

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
