# Doors

Read this before you add, change or retire one. It assumes no programming knowledge.
The checklist for adding the eighth door is near the end.

## What a door is

A door is the page a stranger lands on. Seven doors, one workspace: whichever one a
visitor comes through, they meet the same panel, ask a question, get a cited answer for
free, and — only if the conversation turns out to be worth keeping — get a room with an
address of its own.

A door is not a separate website and not a separate product. It decides five things:

1. **What the page says it does** — the headline and the two sentences under it.
2. **Which agent answers first** — and what that agent will and will not touch.
3. **What the four starter questions are** — the questions printed before anyone types.
4. **Whose name the room carries** — on the footer, the contract and the invoice.
5. **How much of the work is ours** — one of three tiers, shown to the buyer as a chip.

Everything else — the panel, the streaming answer, the citations, the "nothing is saved
yet" line, the Keep step, the room, the badges, the task panel — is the same code for
every door and stays the same code. That is the point: seven offers cost roughly what
one offer costs.

## The seven doors today

| Door | Tier | Who invoices | State |
|---|---|---|---|
| Conversion tracking for ChatGPT Ads | Ours end to end | Top-Rated Team (Danylo Burykin SZČO) | live at `/use-case/chatgpt-ads` |
| Google Ads management | Ours end to end | Top-Rated Team (Danylo Burykin SZČO) | live |
| Google Ad Grants, set up through the official Google Ads API | Ours end to end | Top-Rated Team (Danylo Burykin SZČO) | live |
| LinkedIn Ads | Ours end to end | Top-Rated Team (Danylo Burykin SZČO) | coming |
| LinkedIn automation, with a written legal assessment | Lawyer first | Top-Rated Team (Danylo Burykin SZČO) for the build; the lawyer bills the assessment | coming |
| LinkedIn growth | A different company | Maksymenko LinkedIn Growth | coming |
| Custom AI builds | Ours end to end | Top-Rated Team (Danylo Burykin SZČO) | coming |

"Coming" is not a placeholder or a lie. A coming door appears on `/use-case` with its own
one-line explanation of why its panel is shut, because an offer that is real and a page
that is finished are two different things.

## Where a door lives

All seven are rows in one file, `shared/doors.ts`. One row per door, no logic in it,
nothing else to edit. Change a word there and the door page, the `/use-case` overview and
every room opened through it change with it. If anything below disagrees with that
file, the file is right — it is what the site actually reads.

## Every field, and what it is for

**`id`** — the short name the rest of the system uses: `chatgpt-ads`, `linkedin-growth`.
Every room ever opened through this door stores it. Choose it once and never change it;
changing it orphans the rooms that already carry the old one.

**`slug`** — the piece of the address after `/use-case/`. Normally the same as the id.

**`path`** — where the door lives today. `/use-case/<slug>` for all of them except the
ChatGPT Ads door, which is the home page.

**`initials`** and **`tone`** — two letters and a colour for the little square beside the
door's name. Cosmetic. `tone` must be one of the site's token classes so the door looks
right in dark mode as well as light; copy the pattern from a neighbouring row rather
than inventing a colour.

**`headline`** — what the page says at the top. Say the work, not the ambition:
"Conversion tracking for ChatGPT Ads", not "Unlock your full funnel potential".

**`blurb`** — two sentences at most, in the words the buyer would use. Say what gets
done, on whose system, and what proves it is done. The same two sentences are printed on
the door and on the `/use-case` row, so they have to read as well in a list as under a
headline.

**`firstAgentId`** — which agent opens the conversation, or nothing at all. The partner
door sets this to nothing on purpose: no agent of ours speaks for another company.

**`agentLine`** — that agent's job here, in one line, *including what it refuses*. The
LinkedIn automation door says the agent scopes the build and does not answer legal
questions. Writing the refusal down is what stops the agent from guessing later.

**`starters`** — at least four questions. The panel prints the first four and hides the
rest behind "N more", because eight on a card is a menu and a menu is read by nobody.
Take them from what people actually ask you — the support inbox, the first ten minutes
of a sales call — and write each as a whole question ending in a question mark. "Why did
my CPA double?" gets clicked. "CPA analysis" does not.

**`tier`** — one of three, and the visitor reads a plain-English chip for it:

| Tier | Chip | What it means to the person paying |
|---|---|---|
| `white` | Ours end to end | Top-Rated Team signs, invoices and answers for the work. |
| `light-grey` | Lawyer first | A qualified lawyer writes down what is allowed where you are before anything is built, and bills that part separately. |
| `grey` | A different company | Another company contracts with you, does the work and invoices you. Top-Rated Team is not in that chain and takes no share of it. |

**`status`** and **`comingLine`** — `live` means a visitor can open the panel now.
`coming` means the offer is real and the door is not built, and `comingLine` is the one
sentence saying so. A coming door with no `comingLine` is a dead end; write the
sentence.

**`kbNamespace`** — which body of knowledge the answers are retrieved from. Three
corpora are built today: `chatgpt-ads` (`data/kb/kb.json`), `google-ads`
(`kb.google-ads.json`) and `ad-grants` (`kb.ad-grants.json`), all written by
`scripts/build-kb.ts`. A door pointing at a namespace with nothing behind it does not
invent an answer — the agent says what it is missing, which is honest and also a
wasted visit. Build the corpus before you set the door live.

This field is read on the answer path. Each corpus is loaded into its own index and
`retrieve()` takes the namespace first, so an agent reads its own corpus and nothing
else — **and gets nothing rather than a neighbour's documentation when its own corpus
has no match.** Verified on the live site: the ChatGPT Ads agent cites
`developers.openai.com`, the Google Ads and Ad Grants agents cite `support.google.com`,
and an agent with no corpus returns no citations at all.

**`contract`** — five fields and an optional sixth, and they are the ones that cost
money to get wrong.

## The block that matters: `contract`

- **`legalName`** — the company the client is buying from, in full, including the legal
  form: `Top-Rated Team (Danylo Burykin SZČO)`. The plain `Top-Rated Team` is the
  trading name and belongs in chrome and body copy; the full form belongs where
  somebody is deciding who they are dealing with — the footer's identification
  line, the Terms, the room footer, and every invoice.
- **`entity`** — what kind of body that is, in a client's words.
- **`termsUrl`** — the terms *that company* publishes. It may be empty, and where it is
  empty the room says so out loud. It must never quietly fall back to ours: borrowing
  another company's terms is worse than admitting there are none yet.
- **`invoiceLine`** — who invoices, and for what, in one sentence with no hedging.
- **`contact`** — where a person writes about a room opened through this door: an email
  address, or the address of a contact page. Two companies never share one, so it lives
  here rather than being defaulted in the room. Like `termsUrl` it may be empty, and
  where it is empty the room says there is no address on file rather than offering ours.
- **`contactLabel`** — optional link text, for when `contact` is a page rather than an
  address.

Every room remembers the door it was opened through and prints that door's name in its
footer. A visitor who came in through the partner door sees the partner's name in the
room, on the contract and on the invoice, and never sees Top-Rated Team's. The door
sets it once; nobody downstream has to remember.

**If the name is wrong, the client has been told the wrong thing about who they are
buying from.** Three things decide who the seller actually is, and none of them is what
the website calls itself: who sets the price, whose name is on the paper the client
receives, and who loses the money when it goes wrong. A wrong `legalName` gets the
second one wrong in writing, on every document that room produces.

For the partner door in particular: **the client pays the partner directly, and
Top-Rated Team does not invoice for that work at all — not even a share of it.** A
client who buys from both gets two contracts, two invoices and two support addresses.
That is not paperwork for its own sake; it is the only thing that keeps the two
businesses genuinely separate, and a shared invoice undoes it in one line.

If you find a room carrying the wrong name, it is not a display bug. Fix the row, then
re-issue whatever contract or invoice went out with the wrong name on it, and tell the
client plainly why a second document is arriving. Fixing the row alone leaves the wrong
document in their files.

This is design, not legal advice. When a door involves a company that is not
Top-Rated Team (Danylo Burykin SZČO), have its terms and its invoicing checked by someone qualified
before the door goes live, not after the first client.

## What a live door actually needs

Written after building the knowledge for doors 2 and 3, so the next one is a
checklist rather than an archaeology exercise. `status: "live"` is the last thing you
change, not the first. Four things have to be true before it is honest:

**1. A row in `shared/doors.ts` with `status: "live"`.** The cheap part. Everything
below is what makes the row true.

**2. An agent in `shared/roster.ts` with its own persona.** Not a shared one. Door 3
originally pointed at the Google Ads Agent; it now has its own, because it carries a
refusal the Google Ads Agent has no reason to carry — the Ad Grants Agent must never
say whether Google will approve or reinstate an account. A refusal that lives in one
agent's prompt cannot be borrowed by another door, and an `agentLine` that promises a
refusal the agent was never given is a sentence about nothing.

Write down, in the prompt: what it knows, what it refuses, and where it stops. The
ChatGPT Ads Agent stops where the visitor's codebase begins. These two stop where the
visitor's ad account begins — same rule, same reason: no agent here can see an
account, and an answer that implies otherwise turns a pre-sales question into a
support ticket.

**3. A corpus with real content in it, from sources you can name.** `scripts/build-kb.ts`
holds one entry per corpus. Build one with:

```bash
npm run kb:fetch -- google-ads     # or ad-grants, or chatgpt-ads; omit for all three
npm run kb:embed -- google-ads     # optional, needs a key; without it retrieval is BM25
```

Each corpus is written whole to its own file and carries its own `namespace`. A corpus
that fetches nothing is left exactly as it was rather than emptied — the deploy runs
this on every push, and blanking a corpus that is answering questions would be worse
than serving one a few days old.

What was learned building the Google ones, none of which was obvious:

- **Google publishes no `.md` twin and no `llms.txt`.** OpenAI's docs do, which is why
  door 1's fetcher is twenty lines. Google's pages are read as HTML: the article body
  is pulled out by container (`article-content-container` on the help centre,
  `devsite-article-body` on the developer docs) and converted. The chrome around a
  Google help page is a product picker naming every product Google sells, and indexing
  it would make every page match every query.
- **Ask for English twice.** Google negotiates the language of a page from the caller
  and will answer in Japanese or Thai. `hl=en` on every URL *and* an `accept-language`
  header. The first build of the Google Ads corpus came back with four pages in three
  languages and looked fine in the log.
- **A retired help-centre article does not 404.** It redirects to a generic landing
  page that returns 200. Every URL in the file was fetched and read before it was
  written down; a page that comes back under the minimum length is dropped rather than
  indexed as furniture.
- **Some pages are rewritten per country.** The Ad Grants eligibility page is one, so
  it is deliberately not in the corpus: whichever country the build host sits in would
  become the rule the corpus states for everyone.
- **The developer docs print every sample in six languages.** Only the first is kept,
  and a sample over 3,000 characters is dropped whole rather than truncated — half a
  program in a citation reads as a complete one.
- **Only official sources.** Google's own help centre and developer documentation.
  Nothing behind a login, and nobody's blog. The corpus is what the agent is allowed to
  say; put an agency's opinion in it and the agent will cite the agency's opinion as
  Google's rule.

**4. Retrieval that can tell one corpus from another. This shipped, and the Google Ads
and Ad Grants doors are open.**

`server/ai/kb.ts` loads every `*.json` in `data/kb/` into its own index, and
`retrieve(namespace, query, k)` takes the namespace **first**, because it is the argument
that must not be left out. The namespace travels on the **agent**, not on the request:
one agent reads one corpus, so `/api/ask`, the API contract and the client are untouched
by it.

**There is no fallback, and that is the point.** A corpus with nothing to say returns
nothing, and the agent then says so. The alternative — answering out of a neighbour's
documentation — would cite `developers.openai.com` for a question about Google Ad
Grants: confidently, in the house voice, with a working link. That is worse than a
closed door.

Three tests in `server/ai/kb.test.ts` hold it down: each corpus retrieves only its own
hosts, an unbuilt namespace returns `[]`, and every live door's `kbNamespace` matches its
agent's. The unbuilt-namespace probe **chooses** its namespace from what is actually
missing rather than naming one, so opening a door cannot turn that test red.

### Opening one of the four doors that are still `coming`

Four things, and `node scripts/check-parcels.mjs` plus `npm run verify` between them:

1. **The corpus.** Add a `Corpus` const to `scripts/build-kb.ts` and its name to the
   `CORPORA` array on the last line of that file. A corpus that is not registered there
   is never fetched, chunked or embedded — a hand-written `data/kb/kb.<door>.json` will
   load and serve, but every deploy runs `kb:build` over the registry and yours is not
   in it.
2. **The agent.** `shared/roster.ts`. `linkedin-ads` already has an entry — flip
   `useKb` to true and give it `kbNamespace`. The `linkedin-automation` and `ai-builds`
   rows both point at the shared `ai-dev` agent, and **one agent carries one corpus**, so
   each of those doors needs an agent of its own. Do not repoint `ai-dev`: three
   `SERVICES` rows use it too.
3. **The row.** `status`, and delete the `comingLine`.
4. **`kb:embed` needs `OPENAI_API_KEY`.** Without it the corpus serves in BM25 mode,
   which works and is not a fault. The live deployment has a key.

## Adding the eighth door

**Decide these six things in writing first.** None of them is a developer question, and
answering them badly is what makes a door useless:

1. What is the work, in one sentence a client would recognise?
2. Which company signs and invoices for it, in its registered form, and where are its
   terms published?
3. Which tier is it — ours end to end, lawyer first, or a different company?
4. Who or what answers the first question, and what does that agent refuse?
5. What can it read? If there is no body of knowledge for the subject yet, the door
   opens as `coming` until there is.
6. What four questions does a real person ask about this work before they buy?

**Then the mechanical part**, which is small:

1. Add a row to `shared/doors.ts` with the fields above. Copy the nearest existing row
   and change it; do not start from an empty object.
2. If the door needs a new agent, add it to `shared/roster.ts` and give it something to
   cite — a corpus of its own in `scripts/build-kb.ts`, built and checked. "What a live
   door actually needs" above is the long version, and it is worth reading before you
   promise a date.
3. If the company has no terms page yet, leave `termsUrl` empty rather than pointing at
   ours, and keep the door `coming` until it has one.
4. Update the one sentence under the hero on `/`, which counts the doors in words —
   "one of seven ways in". It is the only place the number is written out, and it is the
   only thing an eighth door makes untrue.

**Then check it as a visitor would**, in this order:

1. Open `/use-case`. The new row reads plainly and the company under it is right.
2. Open the door. Ask one of its four starters. The answer streams, cites something
   real, and the line "Nothing is saved yet. Close this tab and it is gone" is under it.
   **Open the citation.** A door reading the wrong corpus still cites a working link to a
   real page, and the only thing that gives it away is that the page is about somebody
   else's product.
3. Press Keep. The room opens with that conversation already in it.
4. Scroll to the bottom of the room and **read the company name aloud**. If it is not
   the company that will send the invoice, stop and fix the row before anyone else sees
   the page.

## Rules that apply to every door

- **No price on the door.** Whoever sets the price is the seller of that work. On a door
  that is not Top-Rated Team's own, publishing a price makes Top-Rated Team the seller
  in fact, whatever the footer says.
- **No promise of a result.** Doors describe work. Proof lives in the case studies,
  attached to a named client and a real number.
- **Four starters, not eight.** Eight questions is a menu, and a menu is read by nobody.
- **One terms page per legal name.** Never point two companies at one page.
- **Nothing that decides for the client.** Doors do not rank, score, match or assign
  anyone automatically. A door presents work and starts a conversation; a person picks
  up the other end.

## Changing or retiring a door

Editing a headline, a blurb, a starter or an `agentLine` is safe: it changes what the
next visitor reads and nothing else.

Editing anything in `contract` is a paperwork change wearing a text-edit's clothes. A
room keeps the name it was opened with, so a corrected row fixes every room opened from
now on and leaves the existing ones as they were. Those have to be corrected one at a
time, along with any contract or invoice already sent under the wrong name.

To retire a door, set its `status` to `coming` with a sentence saying why, or stop
listing it — but leave the row in the file. Rooms opened through it keep working and
keep the name they were opened with. Deleting the row leaves those rooms pointing at a
door that no longer exists.
