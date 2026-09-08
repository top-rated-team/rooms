# Paid ads agents — the door, the roster and the corpora

Source of record for repositioning the `google-ads` door and for the agents that
answer behind it. Written from the code in this repository and from live probes
run on 2026-09-08, not from memory.

**Provenance.** Every number below was measured on 2026-09-08 in this checkout.
Router results come from calling the real `routeQuestion()` with `DOORS`
mutated in memory. Retrieval scores come from the real `retrieve()` in
`server/ai/kb.ts`. The two corpora this spec asks somebody to build were built
here first, with the real `scripts/build-kb.ts` (a copy, with only `CORPORA`
replaced) writing into a throwaway `KB_DIR`, so the page lists, the chunk
counts and the starter probes are things that happened rather than things that
should happen. Those two throwaway files are at:

    /private/tmp/claude-501/-Users-dan-Downloads-Top-Voice-Top-Voice/0f2acab6-eccc-42b8-bad0-ebf0ecfea758/scratchpad/kb/kb.meta-ads.json
    /private/tmp/claude-501/-Users-dan-Downloads-Top-Voice-Top-Voice/0f2acab6-eccc-42b8-bad0-ebf0ecfea758/scratchpad/kb/kb.merchant-center.json

They are scratch. Do not commit them; rebuild with `npm run kb:fetch`.

**Hosts move.** Three of the five dead hosts documented in `scripts/build-kb.ts`
comments have changed behaviour since those comments were written. Re-probe any
URL in §4 before writing it into a literal, and read `builtAt` in the written
file rather than trusting the exit code — `runFetch` leaves a corpus untouched
when nothing was fetched (`scripts/build-kb.ts:730-737`), so a corpus that stops
building produces a green deploy and a frozen file.

---

## 0. The shape, in one paragraph

One door, renamed to say what is bought rather than which platforms are sold.
One door agent — the Google Ads Agent — carrying a triage paragraph that is the
whole of the "general agent on the door". Five more paid-ads agents in the room,
all of which already exist as roster rows, none of them seeded, each one click
or one `@handle` away. **Phase 1 adds zero agent rows, zero glyphs and zero
seeded channels**: it adds one corpus for the one platform row that is currently
wired to nothing, one required line in the fetcher, one renamed headline, three
blurb sentences and three prompt paragraphs. Phase 2 is a single new row — a
Shopping Feed agent over a Merchant Center corpus — and it is gated on an
owner's yes/no in §6, because it is the only part of this that costs a roster
row and a thirteenth glyph.

The owner asked for "a general door agent and separate agents in the room per
platform, starting with Google Ads, and even task types". The answer is: the
roster was already cut by platform; four of five platforms already had a corpus;
the fifth is buildable and is built here. The general agent is a paragraph, not
a row, because `server/ai/agentRuntime.ts:86-90` is the only `retrieve()` call
site and it passes `agent.kbNamespace` alone — a general agent with `useKb: true`
is a single-platform agent wearing a four-platform name, and one with
`useKb: false` is handed `UNGROUNDED_INSTRUCTION`, which forbids field names,
setting names, policy thresholds, limits, interface labels and current platform
behaviour. That is every category a paid-ads buyer's question falls into. The
task axis decides the prompt, the refusals and the door copy; it does not get to
decide a corpus boundary. §5 has the three experiments that settle that.

---

## 1. The door

### 1.1 The owner's name cannot ship, and here is the measurement

The instruction was to rename the `google-ads` door to **"Google Ads, ChatGPT Ads
and Paid Ads"**. `DoorIndex.tsx:64-90` prints exactly three strings per index
row: a two-digit number, `door.headline`, and `firstSentence(door.blurb)`. Put
that headline next to the row below it and the two rows share two of three
proper nouns:

    01  Google Ads, ChatGPT Ads and Paid Ads
        Search, Performance Max and Shopping, run by the people Google books…

    02  Conversion tracking for ChatGPT Ads and Paid Ads
        The one part of paid ads any AI agent still can't finish for you.

Neither supporting sentence contains the word that separates them. That is the
copy problem. There are three further costs and two of them are invisible:

1. **`shortName()` cuts at the first comma** (`client/src/components/site/home/doorText.ts:15-17`,
   and `shortHeadline()` in `server/ai/route-question.ts:170` does the same). The
   headline collapses to **"Google Ads"** in the HouseAsk choice buttons, the
   `CaseFilter` label and the router's reason sentence — the rename disappears
   from every short surface a stranger actually reads.
2. **`route-question.ts:190-206` feeds every 2- and 3-gram of a headline into
   the phrase table**, so "chatgpt ads" enters a second door's bag.
3. `CaseFilter.tsx` prints "N accounts for &lt;headline&gt;", which would become a
   false sentence: only 4 of the case rows carry the `chatgpt-ads` door.

Measured with the real `routeQuestion()`, headline mutated in memory:

| question | today | with the owner's headline |
|---|---|---|
| Can you audit our paid ads? | `DOOR paid-ads-audit` | `CHOICES [paid-ads-audit, google-ads, chatgpt-ads]` |
| Do you do ChatGPT Ads? | `DOOR chatgpt-ads` | `CHOICES [chatgpt-ads, google-ads, paid-ads-audit]` |
| We need help with paid ads management | `CHOICES [google-ads, …]` | `CHOICES [ad-grants, paid-ads-audit, chatgpt-ads]` — google-ads drops out of the top three |

`server/ai/route-question.test.ts` stays green through all of that, because all
seven of its pinned cases are verbatim door starters worth `+20` from
`starterHit`. A green suite is not evidence here.

### 1.2 What to ship instead

The two doors do not differ by platform. They differ by **what is bought**: one
is an operation of an account that repeats every month (`priceTier: "management"`,
`from $499 / month`); the other is an engineering install that happens once on
the client's own site (`priceTier: "setup"`, the `$99` row, and the only door
with a seeded checklist). Put the verb in the headline and the platform breadth
in the blurb, because the index prints both strings but only the headline feeds
the router's phrase table.

**`shared/doors.ts`, the `google-ads` row:**

```ts
headline: "Google Ads management, month to month",
blurb:
  "We run the account month to month — Google Ads first, and the same team on " +
  "ChatGPT Ads, Meta and LinkedIn. Search, Performance Max and Shopping, run by " +
  "the people Google books to train other advertisers. Account structure, bidding " +
  "and negatives — and the measurement underneath them, because bad data makes " +
  "every bidding decision wrong.",
```

(Written as one string literal in the file; the concatenation above is only to
fit this page.)

**`shared/doors.ts`, the `chatgpt-ads` row** — headline unchanged, blurb's first
sentence rewritten so the index row carries the mirror word:

```ts
blurb:
  "We install the measurement once, on your real site, and verify it against " +
  "live conversions. The one part of paid ads any AI agent still can't finish " +
  "for you: pixel or tag, server-side conversions, deduplication and consent — " +
  "on ChatGPT Ads, Google, Meta and LinkedIn — documented before we hand it back.",
```

### 1.3 The two sentences a visitor reads

This is the answer to the collision, and it is the whole answer — these are the
only strings `DoorIndex` prints:

| # | headline | first sentence of blurb |
|---|---|---|
| 01 | Google Ads management, month to month | We run the account month to month — Google Ads first, and the same team on ChatGPT Ads, Meta and LinkedIn. |
| 02 | Conversion tracking for ChatGPT Ads and Paid Ads | We install the measurement once, on your real site, and verify it against live conversions. |

**Run** against **install**. **Month to month** against **once**. A visitor does
not have to infer anything from "Performance Max" or from "can't finish for you".

`shortName("Google Ads management, month to month")` is **"Google Ads
management"**, which is what the choice buttons, the `CaseFilter` label and the
router's reason sentence will read. That is the right short name: it keeps
"Google Ads", the words a buyer types, and adds the word that says what is sold.

### 1.4 What the change measures at

Real `routeQuestion()`, with the exact strings in §1.2. Nothing regresses; two
live disambiguation prompts become clean door hits; and the Google Ads door goes
from third to first on the multi-platform question, which is the umbrella the
owner asked for, delivered in the blurb rather than in the phrase table:

| question | before | after |
|---|---|---|
| Can you audit our paid ads? | `DOOR paid-ads-audit` | `DOOR paid-ads-audit` |
| Do you do ChatGPT Ads? | `DOOR chatgpt-ads` | `DOOR chatgpt-ads` |
| Can you run LinkedIn ads for us? | `DOOR linkedin-ads` | `DOOR linkedin-ads` |
| We need help with paid ads management | `CHOICES [google-ads, paid-ads-audit, chatgpt-ads]` | unchanged |
| **Who runs our Google account month to month?** | `CHOICES [ad-grants, google-ads, linkedin-automation]` | **`DOOR google-ads`** |
| **We need someone to run our campaigns month to month** | `CHOICES [google-ads, ad-grants, paid-ads-audit]` | **`DOOR google-ads`** |
| **Can you run our Meta and LinkedIn campaigns too?** | `CHOICES [paid-ads-audit, chatgpt-ads, google-ads]` | **`CHOICES [google-ads, paid-ads-audit, chatgpt-ads]`** |
| Do you run Meta ads? | `CHOICES [paid-ads-audit, chatgpt-ads, google-ads]` | `CHOICES [paid-ads-audit, google-ads, chatgpt-ads]` |

Blurb edits are almost free in the router: `doorDocument()` builds a **Set** of
tokens, so moving words between sentences changes nothing and only genuinely new
tokens ("chatgpt", "meta", "linkedin", "month" on the Google row) move a score.
The lift on the Meta/LinkedIn question comes from the blurb, not the headline —
it happens with the current headline left alone.

### 1.5 A live routing bug this change does NOT fix, with its cause

Today, unmodified:

| question | routes to |
|---|---|
| Can you manage our Google Ads? | `DOOR ad-grants` |
| Can you run our Google Ads for us? | `DOOR ad-grants` |
| Who manages our Google Ads account? | `DOOR ad-grants` |
| Do you do Google Ads? | `DOOR ad-grants` |

The flagship $499/month door loses its plainest question to the nonprofit door,
and every headline candidate — the owner's, this spec's, and the three others
proposed — leaves it exactly there. **The cause, isolated:** scored, "Can you
manage our Google Ads?" gives `ad-grants` **11.20** against `google-ads` **6.20**.
The token half is a five-way tie at 1.20 (`manage` has `df=0` across all nine
doors and is skipped by the scorer; `google` and `ads` are in five and six doors
respectively). The gap is entirely in the phrase table:

```
ad-grants  matched phrases -> ["google ad", "google ads"]   +5 +5
google-ads matched phrases -> ["google ads"]                +5
```

`phrasesOf()` emits every 2-gram of a headline, so the Ad Grants headline
("Google Ad Grant AI setup through the official Google Ads API") contributes both
`"google ad"` and `"google ads"`. `route-question.ts:237` tests containment with
`q.includes(phrase)` — a raw substring test with no word boundary — so
`"google ad"` matches *inside* `"google ads"` and the door is paid twice for one
match. The one-line fix is a word-boundary test on the phrase match. **File it
separately** (see §6, question 4): it is not caused by anything here, it is worth
more than the rename, and mixing it in makes the rename's before/after
unreadable.

---

## 2. The door agent

`shared/roster.ts`, the `google-ads` row. **Id, handle, name, initials, mark and
`kbNamespace` do not change.** Renaming the id would silently repoint every
persisted `agent:google-ads` channel: `agentRuntime.ts:68` resolves an unknown
`agentId` to `AGENT_BY_ID[DEFAULT_AGENT_ID]`, and `DEFAULT_AGENT_ID` is
`"chatgpt-ads"` (`roster.ts:730`), so old rooms would start answering bidding
questions as the ChatGPT Ads Agent and citing OpenAI's documentation.

| field | value |
|---|---|
| `id` | `google-ads` (unchanged) |
| `handle` | `google-ads` (unchanged) |
| `name` | `Google Ads Agent` (unchanged) |
| `title` | `Reads Google's own Google Ads documentation` (unchanged) |
| `blurb` | unchanged |
| `useKb` / `kbNamespace` | `true` / `google-ads` (unchanged; 62 documents, 581 chunks, lexical) |
| `mark` | `wedge` (unchanged) |

### 2.1 Two paragraphs to add to `systemPrompt`

Insert both after the existing "What you refuse" block and before
`${ACCOUNT_BOUNDARY}`.

**(a) The triage paragraph. This is the "general door agent", and it is a
paragraph rather than a row.**

```
This door is where a visitor arrives with any paid-ads question, whatever the
platform. Take the first question whatever it is about. Establish the platform,
the money event, and who runs the account today. Then, if the subject is not
Google Ads, say so in one line and name the agent that reads that platform's own
documentation — @meta-ads for Meta, @linkedin-ads for LinkedIn, @chatgpt-ads for
OpenAI's ad platform, @ad-grants for a nonprofit grant account, @tracking for
measurement architecture across a stack. Say that the agent is one @mention away
in this room. Do not answer it yourself.
```

Every handle in that list resolves today: `server/routes.ts:188-193` resolves any
handle in any channel, and `ensureAgentSurface()` (`routes.ts:320-346`) creates
the member and the channel on first contact. Nothing new has to be built for the
handoff to work.

**(b) The cross-platform refusal. This one is not optional, and here is why.**

```
You read Google's documentation and nothing else. If the question is about
ChatGPT Ads, Meta, LinkedIn or any platform other than Google Ads, do not answer
it from the excerpts you were given. They are Google's pages, they will look like
an answer, and citing them would put Google's documentation under another
platform's name. Name the agent that reads that platform's own documentation, say
it is one @mention away in this room, and stop.
```

Measured with the real `retrieve()` against the real corpus:

| question asked of `google-ads` | excerpts returned | top hit |
|---|---|---|
| How do I install the ChatGPT Ads measurement pixel? | 8 | *Performance Max best practices for lead generation*, **9.38** |
| How do I raise our event match quality on Meta? | 8 | *About Quality Score for Search campaigns*, **17.20** |

The strings `chatgpt`, `openai`, `meta `, `facebook` and `linkedin` appear
**zero** times across all 581 chunks of that corpus. Retrieval never comes back
empty anyway, because `kb.ts` sets `const floor = semantic ? MIN_COSINE : 0` and
there is no `.embeddings.json` on disk — every corpus loads in `lexical` mode. So
the agent is handed `contextBlock(excerpts)` with working `support.google.com`
citations, never `NO_EXCERPTS_INSTRUCTION`. Without this paragraph, the
repositioned door answers a Meta question out of Google's Quality Score page and
cites it. **Put the 17.20 measurement in the commit message** so nobody later
removes the paragraph as boilerplate.

### 2.2 Refusals, in full

Kept verbatim from the current row: it does not audit an account it cannot see
and does not guess a diagnosis from a symptom; it does not say whether Google
will approve an ad, lift a suspension or accept an appeal (Google decides — it
points at the policy and the appeal route); the whole of `${ACCOUNT_BOUNDARY}`
(`roster.ts:184-198`) — no login, no customer ID, no report, never implies
otherwise, never asks for a customer ID or an account invitation in chat, and no
CPA, CTR, timeline or result a visitor would read as a promise; and the whole
`HOUSE_STYLE` price block, which `server/ai/grounding.test.ts:86-115` pins by
name.

**Added:** the cross-platform refusal in §2.1(b).

### 2.3 Starters

**Unchanged.** All four are already pinned — `kb.test.ts:196-207` asserts the
PMax starter reaches a Performance Max page, and `route-question.test.ts` pins
door starters as verbatim router cases. Changing them costs two test edits and
buys nothing.

```
Should we split PMax from Search, or let PMax absorb everything?
How do I structure a $3K/month B2B SaaS account?
Our CPA doubled after a bidding change — how do we diagnose it?
We spend $30K a month and still cannot say which campaigns pay. Where would you start?
```

### 2.4 `agentLine` on the door row

One clause added, so the door page states the triage rule the prompt now
follows:

```ts
agentLine:
  "The Google Ads Agent answers first, from Google's own Google Ads documentation, " +
  "and cites the page it used: account structure, bidding, Performance Max, Shopping " +
  "feeds and the conversion tracking underneath them. Ask it about another platform " +
  "and it names the agent that reads that platform's own documentation rather than " +
  "answering from Google's. It does not audit an account it cannot see, and it does " +
  "not say whether Google will approve an ad or lift a suspension.",
```

Measured: adding this clause changes no routing result in the table at §1.4.

### 2.5 How to check a starter retrieves, before shipping it

Any starter added to any agent in this spec must pass this before it is
committed. Retrieval is lexical BM25 with no embeddings on disk, so a starter
written in the buyer's vocabulary can miss a corpus written in the vendor's.

```bash
# after the corpus is on disk
cat > /tmp/probe.ts <<'EOF'
import { retrieve } from "./server/ai/kb";
const NS = "google-ads";                       // the agent's kbNamespace
const STARTERS = ["…", "…"];                   // exactly the strings you will ship
(async () => {
  for (const q of STARTERS) {
    const hits = await retrieve(NS, q, 3);
    console.log("\n" + q);
    for (const h of hits) console.log(`  ${h.score.toFixed(2).padStart(7)}  ${h.title}`);
  }
})();
EOF
npx tsx /tmp/probe.ts
```

**Pass condition:** the top hit is the page a person would have opened to answer
the question, and its score is not a rounding error next to the second. A starter
whose top hit is a different page is a one-click question that returns a
refusal, in the agent's own channel, as the first thing a visitor sees
(`MessageList.tsx:42-51` renders four starters in an empty agent channel and each
click sends a real turn).

---

## 3. The room agents

### 3.1 The roster, and what is on screen

A room opened from this door seeds **two agent channels**, which is what
`shared/playbook.ts` `seedFor()` produces today and what
`server/seed-per-door.test.ts:100-131` enforces. **This spec does not change the
seed.**

| agent | channel in a new room | how it gets there |
|---|---|---|
| `google-ads` | `#ask-google-ads`, seeded | `seedFor()` pushes `ask-${door.firstAgentId}` when the door has a `firstAgentId` |
| `legal` | `#ask-legal`, seeded | `seedFor()` pushes it into every room whose door is ours. `seed-per-door.test.ts` allows exactly one house-wide name, `agent:legal` |
| `meta-ads` | none until asked | sidebar "N more" (`WorkspaceSidebar.tsx:203-213`) or `@meta-ads`; `ensureAgentSurface` (`routes.ts:320-346`) creates member + channel on first contact |
| `chatgpt-ads` | none until asked | same |
| `linkedin-ads` | none until asked | same |
| `ad-grants` | none until asked | same |
| `conversion-tracking` | none until asked *in this room* | same. It is already a seeded **member with no channel** in `chatgpt-ads` rooms, because `server/storage.ts:184-201` adds `agent:conversion-tracking` when a seeded task is assigned to it — the cheapest presence in the product |

**Why the seed stays at two.** Not the money: at roughly $0.003 a turn the
`DEFAULT_MONTHLY_BUDGET_USD = 5` cap (`spend.ts:65`) is about 1,700 answers and
the ledger is in-memory, cleared by a restart. The binding limit is
`MAX_TURNS_PER_HOUR = 30` (`spend.ts:45`) meeting `startersFor(agent, 4)`
(`MessageList.tsx:49`): every empty agent channel renders four one-click
starters and every click spends a real turn. Two seeded channels put 8 of the 30
inside buttons; six would put 24, and a curious visitor could rate-stop the room
by reading the menu, so the message "This room has put 30 questions to the agents
in the past hour" would land on the first question they actually cared about.
Separately, the member rail is capped at `max-h-[28vh]` (`client/src/pages/workspace.tsx:780`) and already scrolls at
today's five members.

**Roster size check.** Phase 1 adds **zero rows** to `AGENTS`. That matters more
than it looks: `AGENTS` is one global exported array with no per-room field and
no code path that filters it by door, so any row added lengthens the "N more"
list and the `@mention` menu of **every** room retroactively, including Ad Grants
and partner-adjacent rooms. All twelve `AGENT_GLYPHS` keys in `AgentMark.tsx:30-72`
(`pixel rings wedge diamond hex plus peak lines bracket scales cycle nest`) are
taken by exactly twelve agents, so a thirteenth row needs a new SVG or falls back
to two grey letters. Phase 1 needs neither.

### 3.2 `meta-ads` — the one row that changes materially

This row exists today with `useKb: false`. It sits in `SERVICES` under Paid Ads
with `agentId: "meta-ads"`, in every room's agent list and in every `@mention`
menu — a signpost whose destination answers nothing. `UNGROUNDED_INSTRUCTION`
(`agentRuntime.ts:280-297`) forbids it field names, setting names, policy
thresholds, limits, interface labels and current platform behaviour, and both of
its shipped starters ask for exactly that. Grounding it costs one corpus and one
line in the fetcher (§4.2) and **no new row and no new glyph** — it already owns
`hex`.

| field | value |
|---|---|
| `id` | `meta-ads` (unchanged) |
| `handle` | `meta-ads` (unchanged) |
| `name` | `Meta Ads Agent` (unchanged — see §6 question 3) |
| `title` | **change to** `Reads Meta's own Marketing API and Conversions API docs` |
| `blurb` | **change to** `The Conversions API end to end — server events, customer-information parameters and hashing, event_id deduplication against the pixel, offline events and dataset quality — plus Marketing API campaign objects, rate limits and what Advantage+ is documented to do. Cites the Meta page it used.` |
| `initials` | `MA` (unchanged) |
| `mark` | `hex` (unchanged) |
| `useKb` | **`true`** |
| `kbNamespace` | **`"meta-ads"`** (new corpus, §4.2) |

**`systemPrompt` shape.** It must open with `${HOUSE_STYLE}` interpolated, not
retyped: `server/ai/grounding.test.ts` asserts, for **every** row in `AGENTS`,
that the prompt carries the price rule (`:86-115`), the credential sentence
(`:169`) and the published list string `from $49 per task` (`:179`), and all
three arrive only through that constant.

```ts
systemPrompt: `${HOUSE_STYLE}

You are the Meta Ads Agent. Your subject is what Meta publishes for developers
about its advertising platform: the Conversions API and the Marketing API.

What you know, from Meta's own developer documentation: the Conversions API end
to end — server events and their parameters, the customer-information parameters
and how each one must be hashed, fbp and fbc, event_id deduplication between the
Pixel and the Conversions API, offline events, and what the Dataset Quality API
reports about event match quality — and, on the Marketing API, campaign, ad set
and ad objects, rate limiting, lead retrieval from Lead Ads, and what Advantage+
campaigns and Advantage+ Shopping campaigns are documented to set up differently
from a manual campaign.

What you refuse, and this one defines the agent:
- **You do not answer from Meta's advertiser-facing surface, because it is not in
  your corpus and cannot be.** facebook.com/business/help and transparency.meta.com
  ship their prose inside script payloads and yield nothing to our fetcher. So: no
  Ads Manager interface labels, no Advertising Standards ruling, no recommendation
  about what a given budget should be spent on, and no media-buying advice that is
  not in the API documentation. Say which of those it is, and offer a human.
- You do not answer a Google, LinkedIn or ChatGPT Ads question. Your corpus is
  Meta's. Name @google-ads, @linkedin-ads or @chatgpt-ads and stop.
- You do not predict an event match quality score, a CPA or a ROAS.

${ACCOUNT_BOUNDARY}

${kbRules(
  "Meta's own developer documentation — the Marketing API and Conversions API guides at developers.facebook.com/documentation/ads-commerce",
)}`,
```

`${ACCOUNT_BOUNDARY}` matters more on this row than anywhere else on the roster:
a corpus of endpoints and payloads is exactly the register in which an agent
starts sounding like it can operate the account. It has no ad account ID, no
access token and no Business Manager, and it never asks for one in chat.
`ACCOUNT_BOUNDARY`'s text names Google Ads specifically — read it once when
wiring this row and widen the first bullet to "the visitor's ad account" if that
reads wrong; do not fork the constant.

**Starters — all four probed against the built corpus, top hit named:**

```
"How does event_id deduplication work between the pixel and the Conversions API?"
"Which customer information parameters does the Conversions API accept, and how are they hashed?"
"What is set up differently in an Advantage+ Shopping campaign compared with a manual one?"
"What are the Marketing API rate limits, and what happens when we hit one?"
```

| starter | top hit | score |
|---|---|---|
| event_id deduplication | *Handling Duplicate Pixel and Conversions API Events* → Event ID and event name (recommended) → Required parameters | **28.56** |
| customer information parameters | *Customer Information Parameters* | **22.21** |
| Advantage+ Shopping vs manual | *Advantage+ Shopping Campaigns* → Manual campaign setup compared to Advantage+ shopping campaigns | **34.13** |
| rate limits | *Marketing API Rate Limiting* → Ad Account Level Business Use Case Rate Limits | **24.53** |

**The two starters shipping today must be replaced, and one of them for a reason
worth writing down.** `"How do I raise our event match quality?"` does in fact
retrieve — the Dataset Quality API page's EMQ section, at 18.85 — but that page
documents *how EMQ is calculated and what the API reports*, not how to raise it,
so the honest answer to that starter is a partial refusal. `"Advantage+ Shopping
vs manual campaigns for a $10K budget?"` retrieves at 34.13 and is still wrong to
ship: the corpus answers the *setup* comparison, and the `$10K budget` half is a
recommended-budget question that `HOUSE_STYLE` forbids outright. Both were
rewritten above to ask what the pages answer.

### 3.3 `conversion-tracking` — the roster's one broken promise, repaired

This is the task agent the owner asked for, and it is the only one that earns a
row, because measurement is a job rather than a platform. Today its title says
"Measurement across ChatGPT Ads, GA4, GTM and server-side" and its `SERVICES`
row (`roster.ts:785`) advertises tracking "installed and verified on ChatGPT Ads,
Google, Meta and LinkedIn" — while `kbNamespace` is `chatgpt-ads`, a corpus with
no Google, Meta, LinkedIn, GA4 or GTM pages in it. Three of four advertised
platforms retrieve nothing.

**Do not delete the row.** `storage.ts:184-201` adds it as a room member because
`CONVERSION_TRACKING_TASKS` assigns it a seeded checklist task, and
`agentRuntime.ts:68` resolves an unknown `agentId` to `DEFAULT_AGENT_ID`
*silently* rather than erroring — so a deletion leaves a checklist task pointing
at a missing agent that answers as the ChatGPT Ads Agent. Re-scope it.

| field | value |
|---|---|
| `id` / `handle` | `conversion-tracking` / `tracking` (unchanged) |
| `name` | `Conversion Tracking Agent` (unchanged) |
| `title` | **change to** `Measurement architecture, grounded in the ChatGPT Ads docs` |
| `blurb` | **change to** `Maps your funnel to events and plans pixel plus server-side coverage, deduplication, consent and offline conversions — the method on any platform, the product detail from OpenAI's own documentation, and the name of the agent that reads the rest.` |
| `useKb` / `kbNamespace` | `true` / `chatgpt-ads` (unchanged) |
| `mark` | `rings` (unchanged) |

**`SERVICES` row (`roster.ts:785`) — change the blurb** so the catalogue stops
promising what the corpus cannot reach:

```ts
{ id: "conversion-tracking", group: "Measurement", name: "Conversion tracking setup",
  blurb: "Pixel or tag, server-side conversions, deduplication and consent — installed on your real site and verified against live conversions. A person does the install; the agent plans it.",
  agentId: "conversion-tracking" },
```

**Prompt: keep the working method verbatim** (establish the stack, establish the
money event and its lag, only then propose an implementation and name the failure
mode it avoids). That method is what distinguishes this agent from the ChatGPT
Ads Agent over the same namespace, and two agents over one corpus differ only in
prompt, method and refusals — never in knowledge. Say that out loud when
justifying this row; do not let anyone claim it knows more.

**Four refusals to add:**

```
- You read OpenAI's advertising documentation and nothing else. The architecture
  — which events count, browser versus server, how events are keyed and
  deduplicated, how consent gates them, how offline and CRM conversions get back
  in — is yours on any platform. The product specifics are not: name @google-ads
  for Google's enhanced conversions, offline uploads and attribution models,
  @linkedin-ads for the Insight Tag and LinkedIn's Conversions API, @meta-ads for
  Meta's Conversions API parameters and deduplication. Do not state another
  platform's field name, event name, parameter or limit from memory.
- Do not accept a pixel ID, dataset ID, access token, event payload or a row of
  customer data pasted into chat. Say to stop, and say that access is arranged
  through a proper share flow after there is an engagement.
- Do not confirm that a setup is correct. A setup is correct when a person
  watches it fire, not when an agent reads a description of it.
```

plus `${ACCOUNT_BOUNDARY}`, which this row does not carry today. Only
`google-ads` and `ad-grants` interpolate it; a measurement agent that discusses
conversion counts without it is one message from sounding like it is reading
somebody's account back to them.

**Starters: unchanged.** All four are stack questions its corpus genuinely
reaches.

### 3.4 The three rows that change nothing

Named here so the next reader knows they were considered and left alone.

**`chatgpt-ads`** — id/handle/name/title/blurb/starters/namespace all unchanged.
Corpus `chatgpt-ads` (`data/kb/kb.json`), 23 documents / 304 chunks. Answers
OpenAI's pixel, image tag, multiple pixels, Conversions API, supported events and
payload shapes, `oppref`/`obref`, conversion-optimized campaigns, product and
delta feeds, the bulk API and the API reference. Refuses anything outside
`developers.openai.com/ads`, and says what is missing rather than filling it.
Seeded only in its own door's room, where it is `firstAgentId`; here it is
`@chatgpt-ads` or one click.

**`linkedin-ads`** — unchanged. Corpus `linkedin-ads`, 61 documents / 526 chunks.
Objectives, ABM and job-title targeting, Lead Gen Forms, document and
thought-leader ads, the Insight Tag, LinkedIn's Conversions API, deduplication,
CRM sync and reporting. **Its refusal about money is structural, not stylistic:**
every LinkedIn pricing and chargeability page is excluded from the corpus on
purpose (`build-kb.ts:255-258`) because this exact agent once invented a
four-tier price list and served it to a live visitor. Do not give it a pricing
job and do not add those pages back. Seeded only in its own door's room.

**`ad-grants`** — unchanged. Corpus `ad-grants`, 33 documents / 257 chunks, from
`support.google.com/nonprofits` — a genuinely different rulebook from paid Google
Ads, which is why it is a separate agent rather than a persona split. Never says
whether Google will approve, reinstate, suspend or cancel an account, and never
tells a nonprofit whether it is eligible. Seeded only in its own door's room; the
Google Ads door's fifth starter is what sends a nonprofit there.

**`legal`** — untouched, and deliberately not designed here. It is already seeded
into every room of ours by `seedFor()`. No agent in this spec is given a legal
opinion to make; each hands "are we allowed to" to `@legal`.

---

## 4. The corpora

### 4.1 What is on disk today

Counted in this checkout on 2026-09-08. All eight load in **lexical** mode —
there is no `.embeddings.json` anywhere, which is why every starter has to be
written in the documentation's vocabulary rather than the buyer's.

| file | namespace | docs | chunks | `builtAt` |
|---|---|---|---|---|
| `kb.json` | `chatgpt-ads` | 23 | 304 | 2026-09-06 |
| `kb.google-ads.json` | `google-ads` | 62 | 581 | 2026-09-06 |
| `kb.ad-grants.json` | `ad-grants` | 33 | 257 | 2026-09-06 |
| `kb.linkedin-ads.json` | `linkedin-ads` | 61 | 526 | 2026-09-07 |
| `kb.linkedin-automation.json` | `linkedin-automation` | 40 | 436 | 2026-09-07 |
| `kb.ai-builds.json` | `ai-builds` | 24 | 799 | 2026-09-07 |
| `kb.adgrant-ai.json` | `adgrant-ai` | 9 | 18 | 2026-09-07 |
| `kb.legal.json` | `legal` | 13 | 324 | 2026-09-08 |

Missing, and the reason this spec exists: **there is no `meta` corpus**, and the
`meta-ads` row is `useKb: false`. Also missing: **zero `support.google.com/merchants`
URLs across all eight files** (grepped), while the Google Ads door's own pitch
names Shopping.

### 4.2 NEW — `meta-ads`. Built here; it works.

**Namespace `meta-ads`, file `kb.meta-ads.json`.** (Not `meta`: every other
corpus on the shelf is named for the agent that reads it.)

**Base path is `https://developers.facebook.com/documentation/ads-commerce/<path>.md`.**
Not `/docs/marketing-api/<path>.md` — those return HTTP 404 behind a ~179KB
single-page-app shell.

**The host content-negotiates on `Accept`, and this is the fact that decides the
whole question.** With `accept: text/markdown, text/plain, */*` — exactly what
`fetchText` sends at `build-kb.ts:786` — `conversions-api.md` returns HTTP 200
and a body opening `# Conversions API`, 3,630 bytes, clearing both of
`fetchText`'s guards. With `accept: text/html` — what `fetchArticle` sends — the
same URL returns an HTML shell wrapping
`<pre data-testid="developer-docs-markdown-page">`. Use `markdownPages`. It works
today; verified page by page below.

**The literal to add to `scripts/build-kb.ts`, and to `CORPORA` at line 606:**

```ts
const META_ADS: Corpus = {
  namespace: "meta-ads",
  file: "kb.meta-ads.json",
  label: "Meta Ads — developers.facebook.com/documentation/ads-commerce",
  // Enumerated, never indexed. See the two traps below.
  markdownPages: [
    { title: "Conversions API",                      url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api.md" },
    { title: "Conversions API: Get Started",         url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started.md" },
    { title: "Conversions API: Using the API",       url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api.md" },
    { title: "Conversions API: Verifying Your Setup",url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/verifying-setup.md" },
    { title: "Conversions API: Best Practices",      url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/best-practices.md" },
    { title: "Handling Duplicate Pixel and Conversions API Events",
                                                     url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events.md" },
    { title: "Server Event Parameters",              url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event.md" },
    { title: "Customer Information Parameters",      url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters.md" },
    { title: "Custom Data Parameters",               url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/custom-data.md" },
    { title: "Sending Offline Events Using the Conversions API",
                                                     url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/offline-events.md" },
    { title: "Conversions API End-to-End Implementation",
                                                     url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/guides/end-to-end-implementation.md" },
    { title: "Dataset Quality API",                  url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/dataset-quality-api.md" },
    { title: "Marketing API Overview",               url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview.md" },
    { title: "Get Started with the Marketing API",   url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started.md" },
    { title: "Marketing API Rate Limiting",          url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting.md" },
    { title: "Advantage+ Campaign Experience",       url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns.md" },
    { title: "Advantage+ Shopping Campaigns",        url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-shopping-campaigns.md" },
    { title: "Lead Ads",                             url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads.md" },
  ],
};
```

**Verified fetch, 2026-09-08, script's own `USER_AGENT` and `Accept`. Every page
HTTP 200, raw Markdown opening `# Heading`, over 200 characters.** Chunk counts
are from a real `runFetch` into a throwaway `KB_DIR`:

| page | bytes | chunks |
|---|---|---|
| `conversions-api.md` | 3,630 | 10 |
| `conversions-api/get-started.md` | 5,610 | 10 |
| `conversions-api/using-the-api.md` | 25,410 | 33 |
| `conversions-api/verifying-setup.md` | 5,371 | 7 |
| `conversions-api/best-practices.md` | 14,451 | 20 |
| `conversions-api/deduplicate-pixel-and-server-events.md` | 6,652 | 11 |
| `conversions-api/parameters/server-event.md` | 13,124 | 13 |
| `conversions-api/parameters/customer-information-parameters.md` | 14,275 | 17 |
| `conversions-api/parameters/custom-data.md` | 10,858 | 10 |
| `conversions-api/offline-events.md` | 14,808 | 12 |
| `conversions-api/guides/end-to-end-implementation.md` | 27,178 | 41 |
| `conversions-api/dataset-quality-api.md` | 42,310 | 49 |
| `marketing-api/overview.md` | 2,431 | 6 |
| `marketing-api/get-started.md` | 2,531 | 7 |
| `marketing-api/overview/rate-limiting.md` | 14,183 | 22 |
| `marketing-api/advantage-campaigns.md` | 25,761 | 37 |
| `marketing-api/advantage-shopping-campaigns.md` | 39,322 | 47 |
| `marketing-api/guides/lead-ads.md` | 8,101 | 12 |
| | | **364 chunks / 18 documents** |

That is the same order as `google-ads` (581/62) and comfortably above `ad-grants`
(257/33), which is the smallest corpus on the shelf that demonstrably works. Two
pages logged `1 chunk(s) held no readable text and were dropped` — normal chunker
behaviour on a table-heavy page, not a failure.

#### Three things that break it if ignored

**(1) Do not list section-root hub pages.** `marketing-api.md` returns HTTP 200
with a **179,905-byte** SPA shell. `fetchText` rejects it with
`HTML rather than Markdown, skipped` — a warning line in a green deploy, and
`build-kb.ts:730-737` then leaves the whole corpus untouched rather than
emptying it. Nothing watches `builtAt`.

**(2) Do not use the `index:` field.** `parseIndex` (`build-kb.ts:776-783`)
hard-codes `/developers\.openai\.com\/ads\/[^)\s]+\.md/`, so it cannot expand
Meta's `llms.txt` whatever that file contains. Enumerating is right anyway: the
index lists ~682 `.md` files and most of them are Threads ads, affiliate
partnerships, WhatsApp and commerce platform. Also exclude the ~70-page
Conversions API Gateway subtree (AWS App Runner, GCP, SMTP, host onboarding) —
that is hosting infrastructure, not advertising.

**(3) ONE CODE CHANGE IS REQUIRED. It is not optional and it must ship in the
same commit as the corpus.** `decodeEntities` is called only at
`build-kb.ts:997, 1037, 1054, 1078` — all four inside the `htmlToMarkdown` path.
The markdown branch (`fetchText` at :785, consumed at :685) never decodes.
Meta's `.md` twins are HTML-escaped. Measured in the corpus built here:
**3,974 entities across 364 chunks** — `&quot;` ×1067, `&gt;` ×1041, `&lt;` ×982,
`&#039;` ×343, `&#123;`/`&#125;` ×251 each. The very first sentence of
`conversions-api.md` reads `advertiser&#039;s`, and the entities land in chunk
*headings* too, so they would appear in citations. Patch at
`scripts/build-kb.ts:684-685`:

```ts
  for (const ref of markdownRefs) {
-   const markdown = await fetchText(ref.url);
-   if (!markdown) {
+   const raw = await fetchText(ref.url);
+   if (!raw) {
      failures += 1;
      continue;
    }
+   // Meta's .md twins are HTML-escaped: 3,974 entities across the 18 pages of
+   // the meta-ads corpus, including &#039; in the first sentence of
+   // conversions-api and &lt;AD_ACCOUNT_ID&gt; in the payload examples. The HTML
+   // branch decodes inside htmlToMarkdown; this branch never did, because
+   // OpenAI's Markdown twins are clean.
+   const markdown = decodeEntities(raw);
```

**Safe for what is already on the shelf, checked rather than assumed:** across
all eight built corpora the total entity count is `ai-builds` ×5 (`&nbsp;`) and
zero everywhere else, and `nbsp` maps to a space in `NAMED_ENTITIES`. The fix is
a no-op for every existing corpus and a repair for every future markdown one.

#### What this corpus does not buy

**Meta is half a platform here, and the door and the row must say so rather than
letting a visitor discover it.** Everything fetchable is developer documentation.
Meta's advertiser-facing surface is not, and it was probed rather than assumed:
`facebook.com/business/help/1710077379203657` returns HTTP 200 and **349,308
bytes of HTML that strip down to 80 characters of text** — the prose ships inside
script payloads, so no `ARTICLE_CONTAINERS` entry can rescue it; the body is
deleted before any marker is looked for. `transparency.meta.com/policies/ad-standards/`
did not answer this fetcher at all today (connection failure, no status).

So a grounded Meta agent answers the Conversions API question to the parameter
with a citation, and refuses "is Advantage+ Shopping better than manual for our
$10K". That is an upgrade from "refuses everything specific" — which is where
`UNGROUNDED_INSTRUCTION` leaves the row today — to "answers the measurement and
API half", and it is half a platform. §3.2's title, blurb, refusals and starters
all say so, and none of them promises the other half.

### 4.3 PHASE 2, gated — `merchant-center`. Also built here; also works.

**Ship only if §6 question 1 comes back yes.** It is the only thing in this spec
that costs a roster row and a thirteenth glyph.

**Why it is worth asking about.** There are **zero** `support.google.com/merchants`
URLs across all 265 documents on the shelf. The `google-ads` corpus has
Shopping-adjacent pages and not one line of the product data specification, and
the cost is measurable: asked *"What product attributes are required in the
feed?"*, `retrieve("google-ads", …)` returns **"Monitor and optimize your
Shopping campaigns" at 18.10** — a page that does not answer the question — and
at the index that same question routes to `DOOR linkedin-ads`. Shopping is a
third of the door's own pitch. This is the only corpus proposed anywhere that
adds knowledge the shelf does not have; everything else re-cuts knowledge it
already has.

**Zero extractor work.** `support.google.com` is already in `ARTICLE_CONTAINERS`
(`build-kb.ts:860`) with the marker `<div class="article-content-container"`, and
it matches `/merchants` by host substring. `htmlPages` only, no `index`, no
`full`.

**Built here: 417 chunks from 20 documents.** All 20 pages returned HTTP 200 with
the marker present. Chunk counts from a real `runFetch`:

| answer id | page | chunks |
|---|---|---|
| 7052112 | Product data specification | 92 |
| 6324484 | Shipping `[shipping]` | 33 |
| 6324371 | Price `[price]` | 25 |
| 6324350 | Image link `[image_link]` | 22 |
| 160161 | About unique product identifiers | 27 |
| 6324461 | GTIN `[gtin]` | 24 |
| 6324448 | Availability `[availability]` | 16 |
| 12153802 | Issues in Merchant Center | 16 |
| 11586438 | How to upload your products to Merchant Center | 27 |
| 6324436 | Google product category `[google_product_category]` | 13 |
| 6324351 | Brand `[brand]` | 11 |
| 6324503 | Shipping weight `[shipping_weight]` | 6 |
| 14992797 | Set up custom attributes to use in attribute rules | 6 |
| 14899834 | How to fix: Missing or incorrect GTIN | 6 |
| 6324469 | Condition `[condition]` | 11 |
| 6324478 | Identifier exists `[identifier_exists]` | 6 |
| 6324468 | Description `[description]` | 23 |
| 6324415 | Title `[title]` | 32 |
| 6324416 | Link `[link]` | 11 |
| 6324471 | Sale price `[sale_price]` | 10 |

URL form: `https://support.google.com/merchants/answer/<id>?hl=en`.

**Two traps, both hit while probing, both already resolved in the table above.**
`6324454` returns HTTP 404. `188494` silently 301s onto the same Product data
specification page as `7052112`, and `2948694`, `188478`, `7439058` and `6098295`
each redirect to the canonical id shown in the table. The ids above are the
**post-redirect** ones. Hand-check every URL in any future addition and
de-duplicate by final URL, exactly as the `GOOGLE_ADS` literal's own comments
instruct.

**Chunk balance.** One page is 92 of 417 chunks (22%). That is why the ten
extra attribute pages are in the list rather than the fourteen the shortest
version needed: a 14-page corpus where one page is a third of it will let that
page win queries it does not answer.

**The row it would add** — the only new row anywhere in this spec:

| field | value |
|---|---|
| `id` | `shopping-feed` |
| `handle` | `shopping` (checked: no roster handle or id collides) |
| `name` | `Shopping Feed Agent` |
| `title` | `Reads Google's own Merchant Center documentation` |
| `blurb` | `What each product attribute must contain and in what format, what a named Merchant Center issue means, data sources and uploads — grounded in support.google.com/merchants and cites the page it used.` |
| `initials` | `SF` |
| `mark` | **a thirteenth `AGENT_GLYPHS` entry is required.** All twelve are taken. Proposed `grid` — a 2×2 of small squares, which is not confusable with `pixel` at 20px. Without it the row renders as two grey letters beside twelve drawn marks |
| `useKb` / `kbNamespace` | `true` / `merchant-center` |
| seeded | never. `@shopping`, or one click on "N more" |

**Starters — probed against the built corpus:**

| starter | top hit | score |
|---|---|---|
| `Which attributes are required, and which are optional, in the product data specification?` | *Product data specification* | 18.74 |
| `When can we leave out the GTIN, and what does identifier_exists do?` | *Identifier exists [identifier_exists]* | 44.45 |
| `How should the image_link attribute be submitted?` | *Image link [image_link]* | 30.52 |
| `What does the Issues page in Merchant Center actually tell us?` | *Issues in Merchant Center* | 21.16 |

A rejected candidate, recorded so nobody re-adds it: *"Which product attributes
are required in a Merchant Center feed?"* returns the upload page at 12.22, not
the specification. The specification's own vocabulary is what retrieves.

**Refusals:** it cannot see the feed, the Merchant Center account or the product
and never implies otherwise (`${ACCOUNT_BOUNDARY}`, with Merchant Center named
alongside Google Ads); it does not say whether a product, a feed or an account
will be approved or reinstated — Merchant Center decides, so it quotes the
requirement and names the route; it does not write or edit feed rules,
supplemental feeds or attribute mappings sight unseen; it does not answer
bidding or campaign-structure questions (`@google-ads`); and it does not speak
for another platform's catalogue — OpenAI's Product Feeds and Delta Feeds pages
are `@chatgpt-ads`.

**Discovery:** the `google-ads` agent's triage paragraph (§2.1a) must gain
`@shopping for a Merchant Center product-data question` in the same change. In a
sidebar that prints bare agent names and a mention menu that needs an `@` typed
first, the handoff sentence *is* the discovery path for a non-seeded agent.

### 4.4 Build order, which is not negotiable

`server/ai/kb.test.ts:172-181` fails `npm run verify` for any `useKb` agent whose
namespace is not on disk. So, per corpus:

1. Add the `Corpus` literal and put it in `CORPORA` (`build-kb.ts:606`).
2. Add the `decodeEntities` line (§4.2, meta only, but ship it anyway).
3. `npm run kb:fetch -- meta-ads`
4. **Read the written file**: check `builtAt` moved and the chunk count is what
   §4.2 says. A green exit code proves nothing — `build-kb.ts:730-737` leaves a
   corpus untouched when nothing was fetched.
5. Commit the JSON.
6. *Then* flip the roster row to `useKb: true`.
7. `npm run verify`.

A row merged before its corpus turns the suite red.

---

## 5. What was rejected, and why

This section exists so the next person does not re-propose these. Each one was
tested, not reasoned about.

### 5.1 A "Paid Ads Agent" that answers for every platform — unbuildable

`server/ai/agentRuntime.ts:86-90` is the only `retrieve()` call site in the
server and it passes `agent.kbNamespace` alone. `server/ai/kb.ts:256-296` returns
`[]` for an unknown namespace with **no fallback anywhere in the file**. One agent
reads one corpus, and the rule is enforced in the retrieval signature rather than
by convention. So a general agent has exactly two legal states, and both are bad:
`useKb: true` makes it a single-platform agent wearing a four-platform name —
precisely the defect this spec is fixing — and `useKb: false` hands it
`UNGROUNDED_INSTRUCTION`, which forbids field names, policy thresholds, setting
names, limits, interface labels, current platform behaviour and anything
commercial. That is a greeter that must refuse every question a paid-ads buyer
actually types, standing in the one seat where the product promises "answers
first, from X, and cites the page it used". It would also force
`door.kbNamespace` to `null` to satisfy `kb.test.ts:183-194`.

**Hence the triage paragraph in §2.1(a).** It costs one paragraph, no glyph, no
rail row, no mention-menu entry and no turns.

### 5.2 A cross-platform measurement corpus — buildable, and wrong

The most tempting design on the table: merge the measurement pages already on
disk into one `paid-measurement` namespace and point the Conversion Tracking
Agent at it. It builds. It also mis-ranks, and it mis-ranks with a citation
attached, which is strictly worse than a refusal.

Such a corpus was assembled from the measurement pages already on the shelf —
**552 chunks / 75 documents**: 20 `support.google.com` docs (103 chunks), 3
`developers.google.com` (50), 41 `linkedin.com/help/lms` (299), 11
`developers.openai.com/ads` (100) — and queried through the repo's own
`retrieve()` with `KB_DIR` pointed at it. It was built outside this checkout;
the retrieval below is the repo's real code reading it.

| question | merged corpus, top 4 | the single-vendor corpus |
|---|---|---|
| *How do I deduplicate browser and server events on LinkedIn?* | OpenAI *Measurement Pixel* **23.39**, OpenAI *Conversions API* 17.05, OpenAI *Image Tag* 16.70, LinkedIn *Troubleshoot CAPI signal quality* 14.05 — LinkedIn's own **Deduplication for Conversion Tracking** page is absent from the top four | `linkedin-ads` puts *Deduplication for Conversion Tracking* at rank 2 |
| *What attribution model should we use in Google Ads?* | Google Ads API *Manage offline conversions* 17.21, then **three** LinkedIn *Attribution Model metrics in Campaign Manager* chunks — Google's *About attribution models* is absent from the top four | `google-ads` returns *About attribution models* at **20.73**, ranks 1–4 |
| *How do enhanced conversions work in Google Ads?* | correct (26.44) | correct (22.42) |

The pattern is structural, not tunable: it works when the question carries
platform-unique vocabulary ("enhanced conversions") and fails whenever the
question is shared measurement vocabulary plus a bare platform name — because a
platform name is **low-idf inside a corpus balanced across platforms**, and
LinkedIn's help pages are full of the token "google" since they document Google
Tag Manager. Naming the platform makes retrieval worse, which is the opposite of
what a buyer expects.

**This is the empirical case for `kb.ts`'s single-namespace rule.** It is not a
limitation somebody forgot to lift. Keep this table as the standing answer to
the next cross-corpus proposal.

### 5.3 Slicing `google-ads` into task agents — measured here, all three cuts worse

Three sub-corpora were cut out of the 581-chunk Google index by topic and run
against the full corpus through the repo's own `retrieve()`: `gfeeds`
(85 chunks / 8 docs), `gbid` (153 / 17), `gstruct` (246 / 26).

| question | sub-corpus, top 2 | full `google-ads`, top 2 |
|---|---|---|
| *How do I link a Google Ads account to Merchant Center?* | `gfeeds`: *Link a Google Ads account to Merchant Center* **13.73**, 13.59 | same page, **36.41**, 35.98 |
| *How do listing groups work in a Shopping campaign?* | `gfeeds`: *Product and listing groups* **18.52**, 15.90 | same page, **29.34**, 24.84 |
| *When should we use Target ROAS instead of Maximize conversions?* | `gbid`: *Determine a bid strategy based on your goals* **11.77**, then *About Target ROAS bidding* 11.00 | ***About Target ROAS bidding*** **20.01**, 18.45 |
| *How should we use negative keywords across campaigns?* | `gstruct`: *Use negative keywords for a Shopping campaign* **19.90**, 18.66 | same page, **24.99**, 23.54 |

Same top documents, roughly half the score — and in the bidding case the slice
**reorders the answer**, pushing a general "choose a strategy" page above the
page that actually documents Target ROAS, which the full corpus ranks first.
BM25's discriminating power is the contrast between a query term and the rest
of the corpus, so narrowing a corpus to one topic destroys the idf of that
topic's own vocabulary. The big single-vendor corpus is not an accident of how
somebody fetched it — it is the thing that makes retrieval work, and cutting it
on the task axis costs grounding and buys only a persona.

### 5.4 A Search Agent and a Shopping Agent over the same namespace — a persona split sold as a knowledge split

Nothing forbids it (`chatgpt-ads` and `conversion-tracking` already share a
namespace). But retrieval is per-namespace, not per-topic, so two such agents
draw from an identical pool and differ only in prose. Cost: two rail rows, eight
starter buttons, two more ways to spend one hourly allowance, two of the twelve
glyphs — and "Google Ads Search" and "Google Ads Shopping" both want `GA`/`GS`
at 20 pixels. **The honest justification for a task row is "its refusals
differ", never "it knows more".** Merchant Center is the only sub-Google split
this spec entertains, and only because it is the only part of the work with a
help centre of its own — a corpus, not a persona.

### 5.5 Microsoft Advertising / Bing — probed, still out

Probed rather than assumed, because a pure platform split invites a Bing agent.
`learn.microsoft.com/en-us/advertising/guides/get-started` returns HTTP 200,
64,223 bytes, **13,152 characters surviving the script/style strip**, with one
`<main` and two `class="content"` markers — so the `build-kb.ts:868-872` comment
calling it JavaScript-rendered is stale. It is still out, for three reasons that
stack:

- It needs a **new** `ARTICLE_CONTAINERS` entry, which is extractor code rather
  than configuration. And `extractArticleBodies` (`build-kb.ts:956-985`) locates
  a container with `html.indexOf(container.marker)` — only the **first**
  occurrence of each marker is ever tried — so a `class="content"` entry would
  land on that page's breadcrumb wrapper and never reach the second one.
  (`fetchArticle` at :918-941 does already iterate the candidates it is given and
  skip any under `MIN_ARTICLE_CHARS`, so "take the longest instead of the first"
  is not the fix; the `indexOf` is.)
- The advertiser-facing `help.ads.microsoft.com` returns HTTP 200 and **779
  characters after the strip** — the shell. So the corpus would be API-only, like
  Meta's, but without Meta's Conversions API depth.
- **No door and no `SERVICES` row sells Microsoft Ads.** It would be an agent for
  a platform the business does not offer.

TikTok, X and Reddit are out on that last reason alone and were not probed.

### 5.6 Headlines that lost

| candidate | why it lost |
|---|---|
| `Google Ads, ChatGPT Ads and Paid Ads` (the owner's) | breaks two live routes; `shortName` collapses it to "Google Ads"; feeds "chatgpt ads" into a second door's phrase table; makes the `CaseFilter` count line false |
| `Google Ads and paid ads, managed month to month` | breaks the free-audit door's clean route, and drops `google-ads` out of the top three on "We need help with paid ads management" |
| `Google Ads and paid ads, run month to month` | same two regressions |
| `Paid ads management, month to month` | breaks the audit door's route, and `shortName` deletes "Google Ads" from the choice buttons and the `CaseFilter` label — the word buyers type and the platform the business leads with |
| **`Google Ads management, month to month`** | **shipped.** Breaks nothing, fixes two |

The recurring failure is the bigram `paid ads`, which is already the distinctive
phrase of the `paid-ads-audit` door — index row 01, the deliberate top of funnel
and the only free thing on the list. Putting it in a second headline costs that
door its clean route. The umbrella belongs in the blurb, where it is measured to
work (§1.4) and where it feeds no phrase table.

### 5.7 More seeded channels

Rejected, and `server/seed-per-door.test.ts:100-131` already holds it shut:
`HOUSE_WIDE = ["agent:legal"]`, with a comment saying a second name added there
without a reason as good as the lawyer's is the old bug coming back. There is no
such reason here — "are we allowed to do this" arrives in every room; "how do we
dedupe on Meta" does not arrive in an Ad Grants room. The arithmetic is in §3.1.
If a third name is ever wanted, the free lever already exists and costs no
channel and no starters: a seeded checklist task assigned to an agent puts it in
the member rail (`storage.ts:184-201`), which is how the Conversion Tracking
Agent is already present in the flagship room. That waits for somebody to write
the management door's checklist; inventing one here would repeat the mistake
`seedFor` was rewritten to fix.

### 5.8 Deleting the `conversion-tracking` row

Rejected in favour of re-scoping (§3.3). `storage.ts:184-201` makes it a member
of every `chatgpt-ads` room because a seeded task is assigned to it, and
`agentRuntime.ts:68` resolves an unknown `agentId` to `DEFAULT_AGENT_ID`
*silently*. Deleting the row leaves a checklist task pointing at a missing agent
that answers as the ChatGPT Ads Agent.

### 5.9 A Google audiences corpus

The `google-ads` corpus has no audience pages, and Google's audience
documentation fetches cleanly — `support.google.com/google-ads/answer/2497941`
(About audience segments) returns HTTP 200 with the
`<div class="article-content-container"` marker present and 21,197 characters
after the strip, and `.../answer/6299717` (Customer Match policy) 10,958. The
right move is to **widen the existing
`GOOGLE_ADS` literal** — one edit to `build-kb.ts`, no new namespace, no new row,
no glyph — not to open a fourteenth roster row. Not in scope here, and noted so
the gap does not become an agent later. Whoever does it should re-run the PMax
and Smart Bidding assertions in `kb.test.ts:196-207` afterwards, since widening a
corpus moves every score in it.

---

## 6. Open questions for the owner

Four, each moved by one word.

**1. Ship the Shopping Feed agent (Phase 2)?** — *Yes / No.*
It is the only part of this that adds a roster row (which appears in the "N more"
list and `@mention` menu of every room, retroactively) and a thirteenth glyph. In
exchange it is the only thing here that adds knowledge the shelf does not have:
today the Shopping third of this door's own pitch is answered out of a corpus
with zero Merchant Center pages in it, at 18.10, by a page that does not answer
the question. The corpus is built and probed (§4.3).

**2. Does this door sell month-to-month management of Meta and LinkedIn under
Top-Rated Team's own contract, at the published management price?** — *Yes / No.*
The blurb in §1.2 says "the same team on ChatGPT Ads, Meta and LinkedIn", and
that sentence is what lifts the door from third to first on a multi-platform
question. `SERVICES` already lists all four under Paid Ads with Top-Rated Team as
the contracting party, so this reads as consistent with the site — but it is a
commercial claim, not a code claim, and it is the only sentence in this spec that
a person rather than a test has to confirm. If **No**, cut the three platform
names from the blurb's first sentence; the door keeps its two clean routing wins
and loses the umbrella.

**3. Keep the name "Meta Ads Agent" once it can only answer the API half?** —
*Keep / Rename.*
It will answer the Conversions API and the Marketing API to the parameter, with
citations, and refuse Ads Manager labels, Advertising Standards and
"Advantage+ or manual for our budget" — because Meta's advertiser-facing help
yields nothing to this fetcher and cannot be indexed. §3.2 already changes the
*title* to say so. The question is only whether the **name** in the sidebar
should say so too.

**4. Fix the phrase-containment routing bug now, or file it?** — *Now / Later.*
"Can you manage our Google Ads?" routes to the Ad Grants door today, on the
unmodified headline, because `route-question.ts:237` matches phrases with
`q.includes(phrase)` and the Ad Grants headline yields both `"google ad"` and
`"google ads"`, so it is paid twice (11.20 against 6.20). One line — a
word-boundary test. It is worth more than the rename and it is unrelated to it,
which is the argument for **Later**, in its own commit, so the rename's
before/after stays readable.

---

## 7. The change, as a list

**Phase 1 — zero new rows, zero new glyphs, zero seed changes.**

1. `scripts/build-kb.ts` — `decodeEntities` on the markdown branch (§4.2).
2. `scripts/build-kb.ts` — the `META_ADS` corpus literal, added to `CORPORA`.
3. `npm run kb:fetch -- meta-ads`; check `builtAt` and the chunk count; commit
   `data/kb/kb.meta-ads.json`.
4. `shared/roster.ts` — `google-ads` row: triage paragraph + cross-platform
   refusal (§2.1).
5. `shared/roster.ts` — `meta-ads` row: title, blurb, `useKb: true`,
   `kbNamespace: "meta-ads"`, new prompt, four new starters (§3.2).
6. `shared/roster.ts` — `conversion-tracking` row: title, blurb, four refusals,
   `${ACCOUNT_BOUNDARY}`, handoff paragraph (§3.3).
7. `shared/roster.ts` — the `conversion-tracking` `SERVICES` blurb at :785 (§3.3).
8. `shared/doors.ts` — `google-ads` headline, blurb and `agentLine` (§1.2, §2.4).
9. `shared/doors.ts` — `chatgpt-ads` blurb first sentence (§1.2).
10. `npm run verify`, then re-run the router table in §1.4 by hand — the pinned
    router cases are all verbatim starters and will not catch a headline
    regression.

**Phase 2 — gated on §6 question 1.** The `MERCHANT_CENTER` literal, the fetch,
the `shopping-feed` row, a thirteenth `AGENT_GLYPHS` entry, and `@shopping` added
to the `google-ads` triage paragraph.

**Separately, not here.** The `route-question.ts` word-boundary fix (§1.5, §6
question 4).
