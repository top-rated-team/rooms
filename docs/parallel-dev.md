# Running several agents on this repository at once

One page. Everything on it is something you type or paste.

---

## Before anything

This repository verifies itself with three commands and nothing else. There is
no test framework and one test file, so an agent working here has far less
ground truth than one working on Top-Voice. That is the honest starting point.

```bash
npm run verify
```

is `npm run check` (types), `npm test` (the tests that exist), and `npm run build`
in one. If that passes, the change compiles, the tests still hold and the site
still builds. It does not tell you the site is correct — only that it is not
broken in the three ways a machine can see.

**So the rule here is stricter than the rule on Top-Voice: an agent that changes
behaviour must add a test, and must say in its report what it ran the change
against.** Reading the code is not evidence. Rendering the page is.

---

## Starting a run

**1. Decide who owns what.** Open `parcels.json`. It already carries six parcels.
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
| The deployment broke | Render deploys every push to `main`. Roll back in the Render dashboard — **Deploys → the last good one → Redeploy** — which is faster than fixing forward, then fix in the repository. |

---

## What is worth running in parallel here, and what is not

**Yes:** a door (its knowledge base, its agent, its row) — each one is a vertical
slice that touches nothing another door touches. Three of those at once is the
sweet spot for this repository.

**No:** anything that rewrites the room, the panel, or the shell. Those are read
by everything, and two agents in them at once produces a merge nobody can check.
Give those to one agent alone, and let it finish before starting others.
