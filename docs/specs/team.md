# Content spec: `/team` — captured from production, 8 September 2026

This page is being rebuilt at the same URL in a new design. This file records
what the page **says**, not how it looks. Class strings, gradients, badge
variants and grid breakpoints were read during capture and deliberately left
out; the only styling facts kept below are the ones that change the meaning of
the content (an avatar that is initials rather than a face, a stat rendered as
a number).

## How this was captured, and why that matters

`https://top-rated.team/team` returns a 3 KB SPA shell whose body is an empty
`<div id="root">` plus the Google Tag Manager `noscript` iframe (container
`GTM-T959V8MG`). Fetching the URL as a document therefore yields no page copy
at all — only the `<head>`, i.e. the `<title>` and the site-wide `meta`, `og:`
and `twitter:` tags recorded further down. The page's copy is therefore
recorded from two sources:

1. **Static copy** — the `/team` route component in the single production
   bundle `https://top-rated.team/assets/index-DmCyTP04.js` (737 KB, no code
   splitting). Headings, paragraphs, the stat grid, the credential list, the
   offices and the CTA are literals in that bundle.
2. **The team members themselves** — `https://top-rated.team/api/team`, which
   the page requests at render time (`queryKey: ["/api/team"]`). The four
   people are **not** in the bundle. They come from the server.

**Consequence for the rebuild:** the people on this page are server data, not
page content. Whoever rebuilds the page either keeps consuming `/api/team` or
migrates that data deliberately. Redesigning the markup alone will not move the
names. The bundle hash will also change on the next deploy, so the citation
above is a record of where this was read on 8 September 2026, not a durable
address.

---

## The decision this spec does not make

The page names four individuals. The repository's standing convention is that
everything is signed **"Top-Rated Team"**, with the owner's legal form confined
to the footer identification line, Terms and invoices. This page is the
exception to that convention, and resolving it is the owner's call, not the
rebuild's.

What the page actually publishes today, verbatim:

| Rendered name | Role | Avatar shown as |
|---|---|---|
| `Dan B.` | Founder & Lead Strategist | initials `DB` |
| `Julia K.` | Senior PPC Specialist | initials `JK` |
| `Ihor B.` | PPC Analyst | initials `IB` |
| `Bohdan Z.` | Campaign Manager | initials `BZ` |

Three things worth having in view before deciding:

- The names are **already half-redacted** — first name plus a surname initial.
  Nobody's full legal name is printed on this page.
- Each card links out to a **public Upwork profile** (URLs in the table
  further down). Those profiles are outside this site's control and may present
  fuller identities. The page's discretion therefore ends at its own margin.
- The initials are **derived from the rendered name at runtime**
  (`name.split(" ").map(t => t[0]).join("").toUpperCase().slice(0,2)`), so
  changing a name silently changes its avatar. If the roles route is chosen,
  the avatar needs its own source or it will read "FL" for "Founder & Lead
  Strategist".

**Options, for the owner to pick between — not to be chosen during the
rebuild:** (a) keep the four names as they stand; (b) render the team as roles
only and drop the personal names and the outbound Upwork profile links with
them; (c) keep names for the founder, roles for the rest. Until the owner
rules, the rebuild should carry the names through unchanged, because that is
what production says today.

---

## Photographs

**There are none.** This is a positive finding, not a gap in the capture.

The member card renders an `Avatar` whose only child is an `AvatarFallback`
containing initials. There is no `AvatarImage`, no `<img>`, and no `src` in the
member card or anywhere else in the team route. The `/api/team` records carry
no `photo`, `image` or `avatar` field — the seven fields per person are exactly
`id`, `name`, `role`, `jobSuccess`, `badge`, `expertise`, `upworkUrl`.

The loading skeleton reserves a `w-20 h-20 rounded-full` block, i.e. the design
as captured is a round 80 px initials disc (`.w-20{width:5rem}` in the served
CSS). Nothing captured says what it was before this build.

Two image URLs are *declared in the static shell* and are site-wide, not this
page's content: `/attached_assets/ogImage.png` (the OG image, declared
1024×670) and `/favicon.png`. Neither was fetched and neither is a photograph
of a person as far as this capture can establish.

**For the rebuild:** if the new design wants faces, the photographs do not
exist yet. They are new assets and new consent, not a migration.

---

## Section-by-section content

### 1. Hero

- Eyebrow badge: **"Our Team"**
- H1: **"Meet Our Certified Experts"**
- Paragraph: **"Top-Rated Plus members only. Every team member brings years of
  experience and a proven track record of results."**

Client-side document title, set by the route: **"Our Team - Meet Our Certified
Experts | Top-Rated Team"** (the helper appends `" | Top-Rated Team"`).

> **Flag — the page contradicts itself here.** The hero says "Top-Rated Plus
> members only", but Ihor B.'s badge is `Rising Talent`, not `Top Rated Plus`.
> Recorded as found. Either the copy or the badge is wrong, and the owner
> decides which; do not quietly "fix" one to match the other during the
> rebuild.

### 2. The team grid

Four cards, from `/api/team`, each card showing: initials avatar, name (as an
`h2`), role, the Upwork badge with an award icon, `"{jobSuccess}% Success"`
behind a check-circle icon, the expertise tags, and a link labelled
**"View Upwork Profile"**.

| Name | Role | Job success | Badge | Expertise tags | Upwork profile |
|---|---|---|---|---|---|
| Dan B. | Founder & Lead Strategist | 100 | Top Rated Plus | Google Ads Strategy · B2B SaaS · Lead Generation · Account Audits | `https://www.upwork.com/freelancers/~011113f4715f8a2a3e/` |
| Julia K. | Senior PPC Specialist | 100 | Top Rated Plus | eCommerce · Google Shopping · Performance Max · Product Feed Optimization | `https://www.upwork.com/o/profiles/users/~011ecef2e2a4bdee69/` |
| Ihor B. | PPC Analyst | 100 | Rising Talent | Google Analytics · Reporting · Data Analysis · Conversion Tracking | `https://www.upwork.com/o/profiles/users/~01fe8f8246439bed14/` |
| Bohdan Z. | Campaign Manager | 100 | Top Rated Plus | Local Ads · B2C Lead Gen · Call Tracking · Landing Page Optimization | `https://www.upwork.com/o/profiles/users/~017b82e0a71de6427b/` |

`jobSuccess` is the integer `100` in the API; the page appends the `%` and the
word `Success`. The four `id` values are `dan`, `julia`, `ihor`, `bohdan`.

**What the page does not say about these people.** No biography, no tenure, no
per-person years of experience, no named certification held by any individual,
no location per person, no email, no LinkedIn. The H1 calls them "Certified
Experts" but no certificate is named on any card. The expertise tags are the
entire description of what each person does. If the new design has room for a
bio, there is no copy for it and none may be written here.

Error state, verbatim: **"Failed to load team members. Please try again later."**
Loading state: four skeleton cards (the count `[1,2,3,4]` is hardcoded in the
page, so the design assumes roughly four people).

### 3. "About Top-Rated Team"

- Eyebrow badge: **"About Top-Rated Team"**
- H2: **"Founded in 2017"**
- Paragraph: **"What started as a solo Google Ads consulting practice has grown
  into a full-service digital advertising agency with offices across Europe.
  Our mission remains the same: deliver exceptional results through expertise,
  not shortcuts."**

Credential list, each line with a star icon, verbatim and in order:

1. **"Official Google Ads Trainers on behalf of Google Barcelona & Google Lisbon"**
2. **"Google Partner - Top 10% globally"**
3. **"Top Rated Plus Agency on Upwork since 2019"**
4. **"100% Job Success Score with 5,872 hours delivered"**
5. **"Expertise across 7 languages for international campaigns"**

Two outbound buttons:

- **"View on Upwork"** → `https://www.upwork.com/agencies/1190237004117893120/`
- **"YouTube Channel"** → `https://www.youtube.com/channel/UCuVlgtYmRpxa7SbLzdZlsFg`

Stat grid, six tiles, label and value exactly as stored:

| Label | Value |
|---|---|
| Founded | 2017 |
| Team Size | 11-50 |
| Total Hours | 5,872 |
| Projects | 67+ |
| Job Success | 100% |
| Languages | 7 |

### 4. "Our Offices"

- Eyebrow badge: **"Global Presence"**
- H2: **"Our Offices"**

Three cards, each with a globe icon, a city, a country, a secondary badge and
a clock icon with an offset:

| City | Country | Badge | Offset |
|---|---|---|---|
| Prague | Czech Republic | Primary Office | GMT+1 |
| Kyiv | Ukraine | Development Hub | GMT+2 |
| Madeira | Portugal | Operations | GMT |

No street addresses, no per-office staff counts, no phone numbers.

### 5. Closing CTA

- H2: **"Ready to Work With Us?"**
- Paragraph: **"Whether you need a one-time audit or ongoing campaign
  management, our team is ready to help you achieve your advertising goals."**
- Button: **"Start the Conversation"** → `/contact`

### 6. The shared contact section

The page ends by rendering the site's shared contact-form component, so the
following copy is *on* `/team` even though it is not team content and is
presumably specified elsewhere. Recorded so the rebuild does not lose the
section by accident:

Eyebrow **"Get In Touch"**; H2 **"Let's Discuss Your Project"**; paragraph
**"Free audit and consultation available. We respond within 24 hours."**; a
repeated **"Our Offices"** block; **"Verified on Upwork"** with **"100% Job
Success rate with 5,872 hours delivered. Top-Rated Plus agency since 2019."**
and a **"View our Upwork profile"** link; and a form headed **"Send us a
message"** with fields Name, Email, Company (optional), Project Type, Message
(placeholders: "Your name", "your@email.com", "Your company", "Select project
type", "Tell us about your project..."). It POSTs to `/api/contact`; on success
it toasts **"Message sent!" / "We'll get back to you within 24 hours."**

---

## How many people the page implies

The page gives two different answers, and both are on the same screen:

- **Four**, by enumeration — four cards, and a hardcoded four-card skeleton.
- **"11-50"**, by the Team Size stat.

So between seven and forty-six people are claimed but not shown. This is
recorded as a contradiction in the source, not resolved. Note that "11-50" is
the shape of an Upwork or LinkedIn company-size *bracket* rather than a
headcount, which may be where it came from — but that is an observation about
its shape, not a verified provenance, and the owner should confirm it before
the number is reused or dropped.

---

## Every number, year and credential on the page, in one list

For the rebuild's fact-check. Each of these is a claim the new page will either
repeat or drop, and repeating it means standing behind it.

| Claim | Where it appears |
|---|---|
| Founded 2017 | H2 "Founded in 2017" and the Founded stat |
| Top Rated Plus agency on Upwork **since 2019** | Credential list; repeated in the contact section |
| Team size **11-50** | Stat tile |
| **5,872** total hours | Stat tile; credential list; contact section |
| **67+** projects | Stat tile |
| **100%** job success | Stat tile; credential list; contact section; and per-person on all four cards |
| **7** languages | Stat tile; credential list ("Expertise across 7 languages") |
| Official Google Ads Trainers for **Google Barcelona & Google Lisbon** | Credential list |
| **Google Partner — top 10% globally** | Credential list |
| Badges: Top Rated Plus ×3, Rising Talent ×1 | Team cards |
| "offices across Europe", three named cities | About paragraph; Offices section |
| Respond **within 24 hours** | Contact section copy and success toast |

**Discrepancies against the static shell's site-wide metadata.** The shell is
served for every route, so these are the *site's* claims rather than this
page's, but they disagree with it and the rebuild will have to pick one:

- Shell `<title>` says **"8+ Years Experience"**. A 2017 founding read on
  8 September 2026 is nine years. No "8+ years" string appears in the team page
  body.
- Shell `meta description` says **"5,800+ hours delivered"**; the page says
  **5,872**. Not contradictory, but rounded differently in two places.
- Shell `twitter:description` claims **"485% conversion growth"**. That figure
  appears nowhere on the team page and is not corroborated by anything captured
  here.
- Shell `meta author` is **"Top-Rated Team"** — consistent with the signing
  convention, and the reason the four personal names in the body stand out.

---

## Gaps — things a team page often has that this one does not

Listed so the rebuild does not read absence as an oversight it should fill from
imagination. Every one of these is genuinely absent from production:

- No per-person biography, photograph, tenure, or individual certification.
- No named certification anywhere, despite the H1 "Certified Experts" — the
  closest is "Google Partner", which is an agency status, not a person's.
- No legal entity name, company number, or registered address (consistent with
  keeping the legal form to the footer, Terms and invoices).
- No hiring or careers link, no "join us".
- No testimonials or client names on this page.
- No pricing.
- No per-office address or contact detail.
