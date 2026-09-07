# Running several agents on this repository at once

One page. Everything on it is something you type or paste.

---

## Before anything

This repository verifies itself with three commands and nothing else. There **is**
a test runner — `node:test` through `tsx --test "server/**/*.test.ts"`, four files,
17 passing cases — but every one of them is server-side, and there is no client
test runner at all. So an agent working here still has far less ground truth than
one working on Top-Voice, which has 7,068. That is the honest starting point.

Before you start a run, one second of checking beats an afternoon of merging:

```bash
node scripts/check-parcels.mjs
```

It reads `parcels.json` against the tree and fails on the things that manifest
exists to prevent — two parcels owning one file, a glob swallowing a neighbour's
file, a path that does not exist, a file both frozen and declared a seam, a seam
nobody declared at the top, a parcel with no done condition. Every one of those
was true of this manifest at least once while it looked fine.

```bash
npm run verify
```

is `npm run check` (types), `npm test` (the tests that exist), and `npm run build`
in one. If that passes, the change compiles, the tests still hold and the site
still builds. It does not tell you the site is correct — only that it is not
broken in the three ways a machine can see.

**So the rule here: an agent that changes behaviour must add a test where a test
can exist, and must always say in its report what it ran the change against.**
Reading the code is not evidence.

Be honest about which half applies to your parcel. Server-side work — the spend
limits, a corpus, seats, the digest, payments — can and must add a case under
`server/`. Work that is a React component cannot: adding a client runner is a new
dependency, and the brief below forbids new dependencies. Those parcels owe a
rendered check instead — what you opened, at what width, and what you saw.

One more thing that is only true here: **there is no `OPENAI_API_KEY` on this
machine.** The Ask panel renders its "live answers aren't configured" state and
`npm run kb:embed` cannot run, so a corpus serves in BM25 mode locally. That is
normal and not a fault to report. The live deployment does have a key and does
answer — so a check that needs a real answer is a check for the operator to run
after deploying, and belongs in your report as that.

---

## Starting a run

**1. Decide who owns what.** Open `parcels.json`. It carries twelve parcels, and
its `//order` field names the waves.

Four are marked `runAlone: true` — `room`, `outside-agent`, `approval-card`,
`recurring-and-digest`. They all write into the room, which everything reads, so
they go one at a time with nothing else running.

**And never two doors in the same wave.** Every door appends a corpus const to
`scripts/build-kb.ts` and a name to its registry line on the last line of that
file, and all the agents share one working tree.
Give an agent one of them and nothing else.

The rule that makes this work: **a parcel owns whole files, never parts of them.**
Where two parcels genuinely need the same file — the door table, the roster, the
router — that file is a *seam*, and a parcel may add at most three lines to it and
delete none, declared up front. Two one-line additions merge by keeping both. Two
thirty-line edits merge into something nobody can verify.

**2. Paste this at the top of every agent's brief**, with the parcel name filled in:

> The repository is `~/Documents/ChatGPT Ads`, branch main. Read `README.md`,
> `docs/doors.md` and `shared/doors.ts` first, then read three neighbouring files
> before you write one. You own exactly the paths listed under `<parcel>` in
> `parcels.json` and nothing else — other agents are in this tree right now.
> Anything you need in a file you do not own goes in your report as a handoff,
> with the file, the exact change and why. You may add at most three lines to a
> seam file and delete none. `npm run verify` must pass when you are done. No new
> dependency, no change to `package.json`, no git command that changes state.
> Write real copy: plain words, no marketing verbs, no exclamation marks, both
> themes, Tailwind tokens only. Anything you tell a visitor must be true of the
> code as it stands. Report what you built, what you could not, and every
> handoff.

**3. Three or four at a time. Not eight.** Not for caution — for merges. Every
extra parcel is another set of handoffs somebody has to apply afterwards.

---

## While it runs

**Do not commit.** The single most expensive mistake made on this project so far
was `git add -A` while agents were still typing: it committed half-written files,
they went live, and it compiled, so nobody noticed until the agents reported.

```bash
git -C ~/Documents/ChatGPT\ Ads status --short
```

shows who has touched what. When every agent has reported, then commit.

---

## When they are done

```bash
npm run verify
```

Then read the handoffs. They are the part that is easy to skip and expensive to
skip: a parcel that says "the route for this page needs adding to App.tsx" has
built a page nothing can reach.

Apply the handoffs yourself, or give them all to one more agent whose only job is
the seams. That agent owns the seam files and nothing else.

---

## If something goes wrong

| What happened | What to do |
|---|---|
| An agent stopped halfway | `git status` shows exactly what it touched. Either give the same brief to a new agent with "these files already carry a partial edit — review it first, keep what is right, finish the rest", or `git checkout -- <its files>` and start it again. |
| Two agents edited one file | They should not have been able to. Check `parcels.json` for the overlap before blaming the agents; the manifest is where this is prevented. |
| `npm run verify` fails and nobody owns the file | It is a seam. Fix it yourself in the smallest way that works, and prefer the seam file over rewriting somebody's component. |
| The deployment broke *after a push* | Render deploys every push to `main`. Roll back in the Render dashboard — **Deploys → the last good one → Redeploy** — which is faster than fixing forward, then fix in the repository. |
| The site answers `530` / `error code 1016` | **Not a bad deploy, and the Deploys tab cannot fix it.** 1016 is "origin DNS error" from Render's *own* edge — it has no route for that hostname. It happened once here because the custom domain had not been added to the service: **Settings → Custom Domains**. Then check Billing for a suspension. A failed build never takes the site down; Render keeps the last good deploy serving. |
| Two agents' `npm run verify` collide | `vite build` empties `dist/` at the start of every build, so a concurrent build reads a directory another one is deleting. Ask agents to report and run `verify` yourself, or stagger it. |

---

## What is worth running in parallel here, and what is not

**Yes, but one at a time:** a door — its corpus, its agent, its row. Mostly a
vertical slice, but *not* a disjoint one: every door appends a corpus const to
`scripts/build-kb.ts` and a name to its registry line, so run **one door per
wave**, with unrelated parcels alongside it. Two doors at once collide on that
one line.

**No:** anything that rewrites the room, the panel, or the shell. Those are read
by everything, and two agents in them at once produces a merge nobody can check.
Give those to one agent alone, and let it finish before starting others.
