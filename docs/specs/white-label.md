# White label — page body spec

Source of record for the body of the `white-label` door. Written from the live
page, not from memory.

**Provenance.** `https://top-rated.team/white-label` was fetched 2026-09-08 and
returns HTTP 200 with a 3,138-byte Vite shell whose `<div id="root">` is empty —
all copy is client-rendered. Two WebFetch attempts (with and without the
trailing slash) therefore returned only the `<title>`. The copy below was read
out of the page's own JS bundle, `https://top-rated.team/assets/index-DmCyTP04.js`
(736,934 bytes), where the router maps `path:"/white-label",component:dF}` and
`dF` is the page component. Everything quoted here is a string literal from that
bundle. Nothing here is reconstructed.

Re-verified after transcription by downloading the same content-hashed asset
a second time: 736,934 bytes, `sha256 1e590a102bea38da9f4590ba7387143b45e0d1e452444d735b3adab090d2e556`,
router mapping and every quoted string in §2 and §8 confirmed present in
the fresh copy.

**One caution about that bundle.** A second, shorter white-label section (`_5`)
also exists and renders on the **home page** (`X6`), not on `/white-label`. Its
copy differs from the dedicated page in ways that matter commercially, so it is
recorded separately in §8 and is *not* mixed into the page transcript. Where the
two disagree, neither is authoritative — the owner has to pick.

---

## 1. What the live page actually is

A single-offer landing page addressed to marketing agencies, ending in the
shared contact form. Structure, in order:

| # | Section | Eyebrow / badge | Heading |
|---|---|---|---|
| 1 | Hero + 4 stat cards | `For Marketing Agencies` | `White-Label Google Ads Partnership` |
| 2 | 6 benefit cards | `Partnership Benefits` | `Why Agencies Choose Us` |
| 3 | 4 process steps, each with a duration chip | `Partnership Process` | `How We Work Together` |
| 4 | Languages + 3 office cards + CTA card | `Global Coverage` | `We Speak Your Clients' Language` |
| 5 | Shared contact section | `Get In Touch` | `Let's Discuss Your Project` |

There is **no FAQ section and no accordion** on this page. Greps for `faq`,
`exclusiv`, `margin`, `markup`, `$`, `EUR`, `USD`, `per month`, `discount`,
`commission`, `resell`, `subcontract`, `contract` and `invoice` across the whole
`dF` region return **no hits at all**. The only pricing-adjacent word in the
region is "minimum", in "No minimum commitment required".

## 2. Verbatim transcript

**Hero**

- Badge: "For Marketing Agencies"
- H1: "White-Label Google Ads Partnership"
- Sub: "Scale your agency without hiring. We seamlessly immerse into your client processes with 24/7 availability and instant task delivery."
- Primary CTA: "Schedule Partnership Call" → `/contact`
- Secondary CTA: "View Our Results" → `/case-studies`

**Hero stat cards** (four)

| Stat | Label | Description |
|---|---|---|
| `100%` | Job Success | "Perfect rating on Upwork with 5,872+ hours delivered" |
| `8+` | Years Experience | "Across all major verticals and markets" |
| `Top 10%` | Google Partner | "Official Google Ads trainers for Barcelona & Lisbon" |
| `<24h` | Response Time | "Most messages answered within hours" |

**"Why Agencies Choose Us" — six cards**

1. **24/7 Availability** — "With offices in Prague, Kyiv, and Madeira across 3 time zones, we're always online and ready to respond to urgent tasks."
2. **Instant Task Delivery** — "No bureaucracy or delays. Direct communication channels and rapid execution of your requests within hours, not days."
3. **White-Label Everything** — "Fully branded reports, documentation, and deliverables that appear as your agency's work. Your clients never know we exist."
4. **Seamless Process Integration** — "We adapt to YOUR processes, tools, and communication style. Slack, Asana, Monday, ClickUp - we use what you use."
5. **Comprehensive Documentation** — "Detailed campaign documentation, SOPs, and knowledge transfer. Everything is organized and accessible."
6. **Dedicated Account Manager** — "A single point of contact who understands your agency's needs, client portfolio, and communication preferences."

**"How We Work Together" — four steps, with published durations**

| Step | Title | Duration chip | Description |
|---|---|---|---|
| 01 | Discovery Call | `30 min` | "We learn about your agency's processes, communication preferences, reporting needs, and current challenges with Google Ads fulfillment." |
| 02 | Integration Setup | `1-2 days` | "We join your project management tools, Slack/Teams channels, and set up secure access to client accounts as needed." |
| 03 | Pilot Project | `2-4 weeks` | "Start with a single client account to establish workflows, communication cadence, and quality standards that match your expectations." |
| 04 | Scale Partnership | `Ongoing` | "Once comfortable, scale to multiple accounts with dedicated team members assigned to your agency's portfolio." |

**"We Speak Your Clients' Language"**

- Body: "Our multilingual team can communicate directly with your clients in their native language when needed, or stay completely behind the scenes."
- Language chips (seven): English, Ukrainian, Russian, Czech, French, Portuguese, Turkish
- Office cards: "Prague, Czech Republic — Primary Office - GMT+1"; "Kyiv, Ukraine — Development Hub - GMT+2"; "Madeira, Portugal — Operations - GMT"

**CTA card, same section**

- H3: "Ready to Scale?"
- Body: "Start with a free 30-minute consultation to discuss how we can support your agency's Google Ads fulfillment needs."
- Bullets: "No minimum commitment required" / "Flexible hourly or project-based pricing" / "NDA available upon request" / "References from agency partners"
- Button: "Schedule Free Consultation" → `/contact`

**Contact section** (shared component `_s`)

- "Get In Touch" / "Let's Discuss Your Project" / "Free audit and consultation available. We respond within 24 hours." / "Our Offices"
- Posts to `/api/contact`; success toast "We'll get back to you within 24 hours."
- Its Project Type select includes a **"White-Label Partnership"** option.

## 3. The seven things asked for, answered from the page

**Who the offer is for.** Marketing agencies, exclusively and repeatedly —
badge "For Marketing Agencies", "Scale your agency without hiring", "Why
Agencies Choose Us", "your agency's Google Ads fulfillment needs". The page
addresses no other kind of buyer.

**What is actually resold.** Google Ads fulfilment — campaign management for
the partner's client accounts — plus "reports, documentation, and deliverables"
carrying the partner's branding, campaign documentation, SOPs and knowledge
transfer. Scoped to Google Ads throughout; no other service is offered
white-label, and the platform itself is never mentioned.

**How the relationship is described.** "Partnership", and only that. The page
never uses the words subcontractor, reseller, contractor, supplier or agency-of-
record, and — confirmed by grep — **never says who signs the contract or who
sends the invoice.** The operational description is immersion into the partner's
own systems: "we seamlessly immerse into your client processes", "We adapt to
YOUR processes", "we join your project management tools", "set up secure access
to client accounts as needed".

**What the partner's client sees and does not see.** Sees: reports and
deliverables branded as the partner's own work. Does not see: us — "Your clients
never know we exist." **But the same page also offers the opposite**, in §4:
the team "can communicate directly with your clients in their native language
when needed, or stay completely behind the scenes." Direct client contact and
"never know we exist" cannot both hold. The page does not reconcile them.

**Pricing or margin.** No figure of any kind. Four pricing-adjacent promises
only: "No minimum commitment required", "Flexible hourly or project-based
pricing", "free 30-minute consultation", and "Free audit and consultation
available" in the contact block. **Nothing about the partner's margin, markup,
or what they may charge their own client.** No rate card, no floor, no currency.

**Exclusivity.** `null`. The page says nothing about exclusivity, territory,
category protection, or non-compete. Do not infer any.

**Objections and FAQ answered.** No FAQ exists. The objections the page answers
implicitly, by assertion, are only these: *will my client find out* ("never know
we exist"), *will you be slow* ("within hours, not days"), *will I have to
change how I work* ("we use what you use"), *is this a big commitment*
("No minimum commitment required"), *can I trust you with client accounts*
("NDA available upon request", "References from agency partners"), and *are you
any good* (the four stat cards and the Google Partner / trainer claims).

## 4. Where the old page and the new `doors.ts` row disagree

The row is `shared/doors.ts` lines 467–518: `id: "white-label"`,
`path: "/services/white-label"`, `tier: "white"`, `priceTier: "custom"`,
`status: "coming"`, `firstAgentId: null`, `kbNamespace: null`,
`contract: TOP_RATED_TEAM`.

### 4.1 The old page is only half the offer

The row is explicit that this door is **two offers**: (1) us behind
the partner's brand, invisible to their clients; (2) "this platform runs under
your name, with your own set of services rather than ours" — that second one
quoted from the `blurb`; the comment's own wording is "This platform itself
under their name, with their own set of doors." The live page
contains **offer 1 only**. There is no live copy anywhere for offer 2 — the word
"platform" does not appear in the page region at all. Offer 2 has to be written
from the owner, not adapted from this page.

### 4.2 Sentences that must not be carried over

Each of these is a live-page claim the new application does not make or actively
contradicts. Listed by the exact string to drop.

| # | Do not carry | Why |
|---|---|---|
| 1 | "For Marketing Agencies" (badge), "Scale your agency without hiring", "Why Agencies Choose Us", "How We Work Together" as agency-only address, "your agency's Google Ads fulfillment needs", "your agency's needs, client portfolio", "dedicated team members assigned to your agency's portfolio" | **Direct contradiction.** The row's blurb says "Agencies use both, and so do teams that are not agencies", starter 4 is "We are not an agency. Does this still work for us?", and the row comment says it is "not only marketing agencies, and not necessarily agencies at all". The agency-only framing is the single biggest thing the new page must not inherit. |
| 2 | "White-Label **Google Ads** Partnership" and every scoping of the offer to Google Ads ("current challenges with Google Ads fulfillment", "your agency's Google Ads fulfillment needs") | **Narrows the offer.** The row asks "which of your services we would be behind" — any of them — and offer 2 is the platform, not Google Ads. |
| 3 | "with 24/7 availability", "24/7 Availability", "we're always online" | Availability promise the row does not make. Also internally inconsistent with the home-page section, which hedges to "almost 24/7" (§8). |
| 4 | "No minimum commitment required", "Flexible hourly or project-based pricing" | **Commercial terms the new app does not publish.** `priceTier: "custom"` resolves to `price: "custom"`, `condition: "A figure comes from a person after the call."` (`shared/pricing.ts:186`). The new page publishes no rate, no engagement model and no commitment terms for this door. This is the same class of claim as the invented price list that had to be pulled from production. |
| 5 | "Your clients never know we exist" **as an unqualified promise** | Contradicted on the old page itself by "can communicate directly with your clients in their native language when needed". The row says "invisible to your clients and answering to you" but does not resolve the conflict. Owner decides which is true before either sentence ships. |
| 6 | "With offices in Prague, Kyiv, and Madeira across 3 time zones"; the three office cards ("Primary Office - GMT+1", "Development Hub - GMT+2", "Operations - GMT") | Nothing in the new application asserts three *offices* or a Kyiv *development hub*. The row's `contract` is `Top-Rated Team (Danylo Burykin SZČO)`, one Czech sole trader — but note that the same contract block's `entity` field does say "with people in Prague, Madeira, Kyiv, Bratislava and Batumi" (`shared/doors.ts:184`), which is people, not offices. Needs the owner's confirmation, not a copy-paste. |
| 7 | "Top 10%" / "Google Partner"; "Official Google Ads trainers for Barcelona & Lisbon" | Credential claims absent from `doors.ts` entirely. Must be re-verified against current Google Partner status before reuse — partner tier is recalculated and can lapse. |
| 8 | "100%" Job Success, "5,872+ hours delivered", "8+" Years Experience, "<24h" Response Time | Dated Upwork-derived metrics the new app publishes nowhere. Note the live site contradicts itself: the `<meta name="description">` in the shell says "5,800+ hours delivered" while the page card says "5,872+". Re-read from Upwork or drop. |
| 9 | "30 min", "1-2 days", "2-4 weeks", "Ongoing" duration chips; "within hours, not days"; "We respond within 24 hours" | Published SLAs and timelines. The row makes no timing commitment. The home-page section publishes a *different* four-step process with no durations (§8), so the site already ships two incompatible processes. |
| 10 | "Dedicated Account Manager", "A single point of contact" (plus "Dedicated Support", which is the home-page variant, §8) | Staffing commitment absent from the row. |
| 11 | "Slack, Asana, Monday, ClickUp - we use what you use"; "We join your project management tools, Slack/Teams channels" | Named-tool integration commitment absent from the row. |
| 12 | "set up secure access to client accounts as needed" | Access/security claim with no counterpart in the new app; touches whose paper the work is on, which the row says is a conversation. |
| 13 | "NDA available upon request", "References from agency partners" | Both plausible and both unverified. Nothing in `doors.ts` offers an NDA or asserts referenceable partners. |
| 14 | The CTA architecture: "Schedule Partnership Call" / "Schedule Free Consultation" → `/contact` form, and the `/contact` Project Type option "White-Label Partnership" | **Design decision reversed.** The row's comment rejects exactly this: "the page is the two offers, the contact and a way to write — and no form pretending to be onboarding", and `firstAgentId: null` because "that is a conversation with a person, not a form". |
| 15 | "Free audit and consultation available" (contact block) | A free-audit offer belongs to the audit door, not this one; carrying it here mis-prices this door by implication. |

### 4.3 Gaps the old page cannot fill

The row's four `starters` are the questions the new body must answer. The live
page answers **one**.

| Starter | Old page |
|---|---|
| "Can you deliver Google Ads work under our brand, without our client knowing you exist?" | Answered — though see rows 5 and 2 above. |
| "Could we run this platform as our own, with our own set of services?" | **Silent.** Offer 2 has no live copy. |
| "Whose contract is my client on, and whose invoice do they receive?" | **Silent.** Grep confirms the page never says sign, invoice, or paper. The row's `TOP_RATED_TEAM` contract block already has the sentence — "Top-Rated Team (Danylo Burykin SZČO) signs the contract and sends the invoice." — and the body has to carry it, because `tier: "white"` renders the chip "Ours end to end". |
| "We are not an agency. Does this still work for us?" | **Contradicted**, per row 1. |

Also unaddressed by the live page and required by the row: `agentLine` says
"No agent answers first in this door", so the body must not imply an assistant
will reply; and `status: "coming"` means `comingLine` still governs until the
body ships.

### 4.4 One thing not to over-read

The row comment says "conversation with a white-label partner is individual and
exclusive". That is a note about **why there is no self-service onboarding
form** — it is not a published promise of exclusive territory or category. The
live page says nothing about exclusivity (§3). Do not turn this comment into a
customer-facing exclusivity guarantee.

## 5. Path and migration

Live copy is at `/white-label` on the apex. The new row's `path` is
`/services/white-label`. The row comment notes "the apex migration has to land
it"; see `docs/apex-migration.md`. The apex header and footer both link
`/white-label`, and the footer separately lists a non-linked services item
"White-Label PPC" (`href:null`) — both need updating when the path moves.

## 6. What is null

Recorded as absent, not as zero: margin or markup guidance; any price, rate,
floor or currency; exclusivity, territory or category terms; who signs; who
invoices; contract length or notice period; any named client or testimonial on
this page; any FAQ; any copy at all for offer 2.

## 7. Unverified on the live page

Claims the page asserts that this spec does **not** endorse and that need the
owner before reuse: the three offices and their roles; Google Partner Top 10%;
official Google Ads trainer status for Barcelona and Lisbon; 100% Job Success;
5,872+ hours (vs. 5,800+ in the same page's meta); 8+ years; <24h response;
24/7 availability; seven languages; NDA availability; existence of referenceable
agency partners.

## 8. The home-page section, for completeness — not the source

`_5` renders inside the home page component `X6`, at anchor `#white-label`.
Recorded because it disagrees with `/white-label` and both are live.

- Badge "For Agencies"; H2 "White-Label Partnership"
- Sub: "Scale your agency without hiring. We seamlessly immerse into your processes with **almost 24/7** availability and instant task delivery." (the dedicated page says plain "24/7")
- Six cards, retitled and reworded: "24/7 Availability" — "With offices across 3 time zones..." (no city names); "Instant Task Delivery"; "White-Label Reports" — "Fully branded reports and documentation that appear as your agency's work product."; "Seamless Integration" — "...Your clients never know we exist."; "Detailed Documentation"; "Dedicated Support"
- A **different** "How It Works": 01 Onboarding ("Quick 30-minute call..."), 02 Integration, 03 Execution ("following your agency's SOPs and quality standards"), 04 Reporting — **no duration chips**
- "Why Agencies Choose Us" as a six-bullet list, including two claims absent from the dedicated page: "**Flexible engagement: hourly, project-based, or retainer**" and "**Transparent pricing with no hidden fees**", plus "100% Job Success rate on Upwork with 5,872 hours delivered" (no "+"), "8+ years experience across all major verticals", "Official Google Ads trainers - we know the platform inside out", "References available from agency partners"
- CTA card "Ready to Scale Your Agency?" → **Google Calendar** `https://calendar.app.google/ucoG2E1L6KV7BPUD7`, with "Free 30-minute consultation" and "NDA available upon request"

Both added claims — the retainer engagement model and "no hidden fees" — fall
under §4.2 row 4 and must not be carried over.
