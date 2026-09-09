# AdGrant.AI as a site of ours, and the two dev agents

**The second brief of programme three. Parcels that build the AdGrant.AI site, its
generator, or the Google Ads Dev and LinkedIn Dev agents say "read this first", and this is
why: the content that is being carried over is wrong in six places, and the feature that
sounds like one product is two with a Google-shaped approval between them.**

`docs/specs/unipile-rooms-and-booking.md` is the other brief and still applies — the Unipile
contract, the identity decisions, and the message rule are all there.

**[V]** = verified this week against a live API, a repository file, or Google's own
documentation, with the URL. **[I]** = reasoning. **[?]** = unsettled.

---

## 0. adgrant.ai is an application, not a site

**[V]** Its single 636KB bundle names **38 API paths**. The ones that matter:

| path | what it is |
|---|---|
| `GET /api/content/pages?category={cat}&pageSize=100` | the page index, paginated, `{page,pageSize,total,totalPages,items[]}` |
| `GET /api/content/page/{category}/{slug}` | one page, **with `bodyMarkdown`** |
| `GET /api/content/pages/facets?category={cat}` | tag facets — returns `{"tags":[]}` for every category today |
| `GET /api/templates` | 12 starter templates, `{slug,niche,title,summary,heroImage,heroImageAlt,stats}` |
| `GET /api/templates/stats` | aggregate statistics over every processed account |
| `POST /api/auth/linkedin`, `/api/auth/session`, `/api/auth/logout` | **LinkedIn login already exists there** |
| `POST /api/generate` | **generation already exists there** |
| `/api/admin/content`, `/api/admin/content/generate`, `/api/admin/generations`, `/api/admin/users` | the owner's own admin, including a content generator |
| `/api/affiliate/*`, `/api/affiliate-admin/*` | a whole affiliate programme with registration, payouts and transactions |
| `/api/nonprofits/{taxonomy,location,niche,page}` | the 33 `/nonprofits…` pages, driven by a taxonomy |

None of it is authenticated for reads. All of it is on Google App Engine, behind an Express
app, and **not in this repository**.

So two of the things the owner asked for as new — "requires a LinkedIn login" and
"generations" — already exist on the live product. What is genuinely new here is the
conversation instead of a form, the WhatsApp alternative, the three-generation cap, the
policy gate, and the design.

### 0.1 What was captured, and where it is

Everything below was pulled through those endpoints and is on disk at
`/private/tmp/.../scratchpad/adgrant-content/` (raw JSON) and
`/private/tmp/.../scratchpad/recon-4/adgrant-pages/` (markdown).

| section | pages | characters |
|---|---|---|
| Ad Grant Glossary | 9 | 36,992 |
| Case Studies | 8 | 45,559 |
| Tips & Tricks | 6 | 32,493 |
| **total** | **23** | **115,044 — about twenty A4 pages** |

Plus **12 Starter Templates** across twelve nonprofit niches: youth-mentoring,
veterans-services, religious-faith, homeless-shelters, health-clinics, food-banks,
environmental, education-literacy, domestic-violence, disability-services, arts-culture,
animal-shelters.

Every page carries `bodyMarkdown`, `metaTitle`, `metaDescription`, `keywords[]`,
`relatedLinks[]`, `heroImage`, `niche`, `topic`, `publishedAt` and `authorName`. So the URL
shapes and the internal link graph survive a rebuild.

### 0.2 The statistics are real, and they are the best thing on the site

**[V]** `GET /api/templates/stats`:

```
accountsProcessed 4,539
campaigns        16,575      keywords  3,142,469
adGroups        108,656      ads         244,071
campaignsPerAccount  median 1, avg 3.7, max 224
adGroupsPerCampaign  median 3, avg 6.6
keywordsPerAdGroup   median 9, avg 28.9
```

Four and a half thousand real Ad Grant accounts, measured. Nothing else on the site is
worth as much, and the current design does almost nothing with it. **Put it on the front
page.** It is exactly the kind of material this design system exists to present: a number
that is true, stated plainly, with what it is a number of.

---

## 1. THE CONTENT IS WRONG IN SIX PLACES, and it must be fixed on the way in

**[V]** All 23 pages are `source: "daily"`, all authored "Dan Burykin", all published on 5–6
June 2026 — one machine-generated batch. That is not a criticism of generating content. It
is the reason to check it, and checking it found this:

| # | where | what it says | what Google says |
|---|---|---|---|
| 1 | `tricks/avoid-account-suspension…5-percent-ctr-rule` | "if your CTR drops below 5% for even one month, Google may suspend the account" | "If the CTR requirement isn't met for **2 consecutive months**, your account will be temporarily deactivated." — [answer/117827](https://support.google.com/nonprofits/answer/117827?hl=en) |
| 2 | same page | "about **329 clicks/day** ($10,000 ÷ $2 ÷ 30)" | that arithmetic is **166.7**. 329 is the daily *dollar* budget. The dependent "6,580 impressions daily" is wrong too (≈3,334). `glossary/maximize-conversions` gets it right in the same corpus — **the two pages contradict each other by 2×** |
| 3 | `avoid-account-suspension` and `recover-suspended` | "Google requires at least 2 ads per ad group" | that rule stopped applying to grantees on 30 June 2022, when responsive search ads became required. **Two ad *groups* per campaign is still required** — [answer/9314402](https://support.google.com/nonprofits/answer/9314402) |
| 4 | `tricks/collect-remarketing-audiences` | "500+ users (the minimum Google requires)" | never 500. Historically 1,000 Search / 100 Display, lowered to 100 across networks in late 2025 |
| 5 | `glossary/ad-rank-google-ad-grant` | "Ad Rank ≈ 14 (Bid $2 × Quality Score 7)" | Google publishes **no formula** and does not name Quality Score as a factor — [answer/1752122](https://support.google.com/google-ads/answer/1752122?hl=en) |
| 6 | `tricks/add-verify-additional-domains` | links "Ad Grant website policies" to `support.google.com/grants/answer/2454026` | dead — resolves to a generic help page. Live page is `/nonprofits/answer/1657899` |

And one framing problem across the whole `/tricks` section: **"bypass the $2 CPC cap"
assumes manual CPC is the default.** **[V]** Accounts created on or after 22 April 2019 must
use conversion-based Smart bidding for all campaigns, so for almost every reader there is no
cap to bypass — the exception *is* the default. The cap and the exception are both still
real ([answer/98870](https://support.google.com/nonprofits/answer/98870?hl=en)); the framing
is a decade out of date.

**Also:** the same unverifiable claims repeat verbatim across all fifteen generated pages —
"600+ accounts I've managed", "30-50% of incremental clicks", "15-25% higher CTR",
"15-40% conversion lift". None is sourced. This site's standing rule is that anything told
to a visitor must be true, and there is a real number available — 4,539 accounts, measured —
that these invented ones are standing in front of.

> **The rule for any parcel carrying this content over: correct the six, drop every
> unsourced percentage, and replace the "600+ accounts" claim with the measured figure.
> Content that is wrong in a nicer typeface is worse, not better, because more people will
> believe it.**

**[?] For the owner:** the byline. Every one of these pages says "Dan Burykin" and writes in
the first person about accounts he managed, on material his own generator wrote. Under
top-rated.team's own standard that needs either a real edit pass or a different byline.

---

## 2. "Three generations and uploads through the Google Ads API" is two products

**[V]** The repository contains **no Google Ads integration of any kind** — no
`google-ads-api`, no `googleapis`, no OAuth library, no customer id. `package.json`'s only
network SDK is `openai`. Everything Google-Ads-shaped here is knowledge-base text.

### A. Generate a structure and show it — **zero Google approvals**

An agent asks the nonprofit what it needs, requires identification, reads their site, and
produces a complete, policy-checked account structure they can see, download and take to
Google Ads Editor. No developer token, no OAuth client, no MCC link, no customer id. **A
nonprofit can use it without giving us anything.**

### B. Write it into their live grant account — a different project

Everything in A, plus:

1. **A developer token at Basic Access**, applied for in the MCC's API Center. **[V]**
   Google's published turnaround is 5 business days, and it is rejectable. It blocks
   everything and costs nothing to start. **[?]** Whether adgrant.ai already holds one is
   unknown and worth asking before anybody applies twice.
2. **An OAuth2 client with the `adwords` scope.** **[I]** That is a sensitive scope; a
   public consent screen needs Google's OAuth verification, measured in weeks. Avoidable
   entirely by using only the MCC path — one refresh token, held by us, no per-nonprofit
   consent screen.
3. **A manager link per nonprofit, accepted by a human at the nonprofit.** The API can send
   the invitation; a person at the charity accepts it in the Google Ads UI. **This is
   unavoidable and it is not instant.** Any page promising three generations *and uploads*
   in one session is promising something the linking flow cannot deliver in one session.
4. **A durable secret store outside the room** — the repository already says why, at
   `client/src/components/workspace/AdGrantPanel.tsx:34-36`: "A room's token is a bearer
   credential in a URL; a Google refresh token must never live anywhere the URL can reach."
5. **A written record and a rollback** — `AdGrantPanel.tsx:42-44`.
6. **[V] 15,000 operations a day, shared across every client.** At roughly 150 operations a
   generation that is about a hundred generations a day for the whole company. **The
   three-generation cap is not generosity; it is capacity planning.** Say it that way.

> **Build A. Sell B as the thing a person sets up afterwards.** A is shippable now from what
> this repository already has, and it is *more* honest than the page today, which says "send
> the Customer ID and a person does the rest" — A replaces a described human step with a
> real machine one and still never touches an account.

### The policy gate is the highest-value part of A

Pure functions over the generated structure, and every input is documented. A generator that
produces a structure Google would suspend is worse than no generator. It must enforce: the
single-word keyword ban with its exception list; two ad groups per campaign; two sitelinks;
geo-targeting present; https and an authorised domain; a daily budget at or under $329;
Smart bidding rather than manual CPC; and the $2 program-level bid ceiling where manual
bidding is still in play.

---

## 3. The two dev agents, and the limit question answered

The owner asked for **Google Ads Dev** (official Google Ads API, on the Top-Rated Team MCC)
and **LinkedIn Dev** (Unipile API, described white-label because we are only the developer),
both helping a client build their own agents against those platforms, in every Google Ads,
paid-ads and dev room.

### 3.1 There is no per-agent limit today, and the ledger is per room

**[V]** Everything in `server/spend.ts` is keyed by `workspaceId`. `agentId` reaches the
module twice and neither is a limit: `RoomRef.agentId` (`:98`) authors the refusal sentence,
`CostEvent.agent` (`:282`) goes in a log line. `recordTurnCost` takes an `agentId` (`:304`)
and charges the room's single ledger (`:323-324`).

`ROOM_MONTHLY_BUDGET_USD` is one env var in the frozen `render.yaml`. The 30-turns-an-hour
bound and the 20-minute active clock are **not configurable at all**, and `render.yaml:66-68`
says so.

### 3.2 What a per-agent limit costs, exactly

`claimAgentTurn` already takes `budgetUsd` as its third argument (`spend.ts:204`), so the
budget half is nearly free; the turns-per-hour half reads a module constant (`:229`) and
would have to be parameterised. `guardAgentTurn(room)` (`:246-251`) is the only room caller,
it already has `room.agentId`, and it passes neither.

**Where the number lives: a map in `server/spend.ts`, not a field on `AgentDef`.**
`shared/roster.ts` is imported by client code, so a per-agent dollar figure on an `AgentDef`
ships a cost number to the browser. `askBudgetUsd()` is the precedent for keeping money
server-side.

**The ledger is the hard part.** `RoomLedger` holds one `turns[]`, one `activeSince`, one
`spentUsd`. A room that has spent $5 has spent $5 whichever agent spent it. A genuine
per-agent ceiling needs a second ledger keyed `${workspaceId}:${agentId}` — cheap, because
`ledgers` is already a `Map<string, RoomLedger>` and the first parameter is just a string —
and then a **double claim**, the agent's key first and the room's second. `routes.ts:1048-1049`
already does exactly that double claim for the `ask:` keys. Copy it.

### 3.3 The recommendation on limits

**[I]** These agents should be scoped as **design and review, not build.** A $5-a-month room
cannot pay for an agent that writes a production integration, and pretending otherwise sells
something the budget cannot deliver. What they can do well, inside the existing bounds, is
read the API documentation they are grounded in and tell a client what is possible, what it
will cost in approvals, what the quota is, what shape the code takes, and what is wrong with
the code they already have. That is genuinely valuable and it is honest.

Give them a **higher per-agent ceiling than a general question** — they answer longer and
read more — through the double-claim mechanism above, and keep the room's own bound over
the top of it, so one agent cannot spend the room's whole month.

**Bring-your-own-key is not a small change.** **[V]** `server/ai/openai.ts` holds one client
from one env var; `AgentTurn` has no field for a key; both existing secret stores are
in-memory and lost on restart; and `HOUSE_STYLE` (`shared/roster.ts:106-108`) instructs
every agent to refuse pasted credentials — correctly, and that instruction must stay, which
means a key would have to arrive through a form outside the chat, the way `/setup` does. It
is a project, not a flag. **[?]** Worth doing eventually; not in this programme.

### 3.4 The $49/month row — read this before adding one

**[V] A `$49 / month` row already exists**: `support`, `shared/pricing.ts:181-187`, "Content
generation support, or boosting support for top-voice.ai or warmlike.com", "Run by us, on
our own accounts."

**[V]** And a `+$49 / month` row was already cut by the owner, with the reason recorded at
`shared/pricing.ts:93-107`: it was an add-on nobody could buy alone, and **"a rung nobody can
stand on is not a rung."** `Ladder.tsx:159-160` says the ladder is not a menu to compare, so
two rows at the same figure work against it.

**[?] And the bigger question, which only the owner can answer.** "Discounted Claude Code
Max at $49/month" describes reselling somebody else's subscription below its list price.
That needs an actual agreement with Anthropic. **If one exists, the row can say so and name
it. If not, the page must not say it** — this site's whole position is that its claims are
checkable, and a resale claim is the easiest kind to check. The honest version without an
agreement is to recommend the tool and charge for the work around it, which is what the
existing `support` row already does. **No parcel adds this row until the owner answers.**

---

## 4. What the AdGrant site has to be

Same design system as top-rated.team — the tokens in the frozen `client/src/index.css`, the
class vocabulary in `client/src/components/site/doors/quiet.ts`, the same type and spacing
scale. Its own mark, its own top menu, its own footer, and the footer and menu link back to
top-rated.team.

`client/src/components/site/doors/adgrant-style.ts` already establishes the identity — one
remapped accent, `ADGRANT_MARK`, and `ADGRANT_LIBRARY` naming the five sections. Extend it;
do not start a second palette.

**Four sections, named as the live site names them:** Ad Grant Glossary ("Terminology
explained"), Case Studies, Tips & Tricks ("Custom workarounds"), Starter Templates. Keep the
`/glossary/<slug>` and `/tricks/<slug>` URL shapes so the link graph and the metadata survive.

**Per-route title and description.** **[V]** The live site serves one `<title>Google® Ad
Grant AI</title>` and one canonical for all 74 URLs and injects the rest client-side, so
every page's `metaTitle` and `metaDescription` — which exist, and were recovered — are
currently wasted. Do better here: set them per route, the way `client/src/pages/landing.tsx`
does.

**Not on a second host yet.** `client/index.html` is the one head this process serves and it
is frozen. The AdGrant tree lives at its own route path until the host switch, which is
owner work done when no wave is running. Build it so it can move: no import of the
top-rated.team header or footer, and nothing that assumes the apex.

**The 33 `/nonprofits…` pages are out of scope.** They are driven by a taxonomy API and the
owner named four sections, not five.
