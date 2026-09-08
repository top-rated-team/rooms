/**
 * GENERATED — do not edit. Run `npx tsx scripts/build-builds.ts`.
 *
 * The things this company has built, as data. Not case studies: there is no
 * client and no metric here, because these are ours. Read the header of
 * scripts/build-builds.ts for why that distinction is kept.
 *
 * `unverifiedClaims` carries what a second agent could not confirm against the
 * live product. A renderer is free to use it to decide what not to print; what
 * it may not do is print a claim listed there as though it were checked.
 */

export interface Build {
  slug: string;
  name: string;
  /** Where to go and look. Null for the two with no public page. */
  url: string | null;
  /** Under 90 characters. What it is. */
  oneLine: string;
  what: string;
  /** The parts worth naming, in the product's own terms. */
  built: string[];
  /** Written for the partner door, where two of these are what is being sold. */
  forPartner: string | null;
  /** What could not be confirmed against the live product. */
  unverifiedClaims: string[];
}

export const BUILDS: Build[] = [
  {
    "slug": "top-rated-team",
    "name": "Top-Rated Team",
    "url": "https://top-rated.team",
    "oneLine": "A room where a client, our people and AI agents work in one place — and the application this site's own doors and agents are defined in, which the apex does not serve yet.",
    "what": "Several service doors sit in front of one workspace. A visitor asks a question on the door that matches their problem, and when the conversation turns out to be worth keeping it becomes a room at an address of its own, where the client, our people and subject-matter AI agents talk in the same channels. Each agent answers only from the corpus it was given and never from another agent's, so it cites the page it used or says plainly that it cannot answer. What one room can spend on agent answers is bounded three separate ways, and an answer carried from a door page into a room is signed by the server that produced it, so text handed back by a browser cannot be passed off as ours. This is the same application we build for clients on the custom-AI-builds door — which is why the panel on that door is the demonstration rather than a picture of one.",
    "built": [
      "Offers as data, not pages: nine rows in shared/doors.ts, seven of them live today. The row decides which agent opens the conversation, which corpus that agent reads, and whose legal name, terms, invoice line and contact the resulting room prints — so a visitor who came in through a partner's door never sees our invoice.",
      "A no-signup room at /w/:token where the URL is the entire credential: channels, a message column, a task panel, a member rail of people and agents, and a share bar. It is a separate JavaScript chunk the door pages never download.",
      "Per-agent grounding with no fallback. server/ai/kb.ts retrieves from the one namespace named on the agent and can reach no other; with no API key, no corpus, or nothing matching, the agent says what it is missing instead of answering from memory. Eleven agent rows are defined and seven of them read a corpus, across six distinct namespaces.",
      "Three bounds on what one room may spend on agent answers, in server/spend.ts, checked before the model is called: a count of 30 agent turns per room per rolling hour, a 20-minute clock on one unbroken run of activity that starts over after 10 minutes of quiet, and a monthly dollar budget per room that warns the operator at 80% and pauses the room at 100%. They fail in different ways on purpose — the count catches a fast loop, the clock catches a slow one pacing itself under the count, the budget catches few turns each enormous.",
      "A second, separate monthly ceiling for the public panel at /api/ask — counted both in total and per calling address — because that endpoint is on every door, needs no token, and belongs to the internet rather than to a client.",
      "Answer receipts. An answer streamed to a door page is HMAC-signed with a key generated per process, and a carried answer is dropped unless the signature matches that exact text, so nobody can POST an invented 'agent' message and get a real room at a real address on our domain to show as evidence of a promise. A restart simply makes the room ask the agent again.",
      "A room that cannot say which company is answerable for it says so: with no door stamped on it, the footer and the member rail report the fault rather than defaulting to the house name.",
      "Degradation as a feature: the whole thing runs with an empty .env. No OpenAI key and the agents say live answers are not configured while the human routes keep working; no DATABASE_URL and storage is in-memory with the same interface; no embeddings file and retrieval drops to keyword scoring. Nothing is faked in any of those states.",
      "One Node process serving the JSON API, the WebSocket at /ws and the built client — React 18, Vite, TypeScript, Tailwind, Radix / shadcn-ui, wouter, TanStack Query, Express, ws, Drizzle over Postgres (optional) and the OpenAI SDK. The workspace token is kept out of stdout and out of the outbound lead webhook, /w/ is disallowed in robots.txt and served with X-Robots-Tag noindex, the agents' house rules forbid accepting passwords, API keys or ad-account credentials pasted into chat, and workspace creation, lead capture, invites, messages and /api/ask each carry their own per-IP rate limit."
    ],
    "forPartner": null,
    "unverifiedClaims": [
      "That the application answers at ai.top-rated.team at this moment. Nothing was fetched (fetched: false), and the repository's own docs/DEPLOY.md — checked 6 September 2026 — records ai.top-rated.team returning Cloudflare error 1016 with no origin behind it and states that nothing in the repository had been deployed yet. render.yaml, written after that, sets PUBLIC_BASE_URL to https://ai.top-rated.team, so a deploy was configured; the repository does not prove it went out. Confirm with a request to the host before this line is published.",
      "That https://top-rated.team serves this application. It does not, on the repository's own evidence: docs/apex-migration.md lists fourteen addresses on the apex that must answer before the DNS record is moved, two of which (/team and /roi-calculator) are still marked unsettled. The url field is the apex on the owner's instruction about the published address, not a description of what is behind it today.",
      "That the application is live, or in use by anyone, at all. The repository records no deployment — docs/DEPLOY.md opens with 'Nothing about this repository has been deployed yet' — and everything dated after that is configuration (render.yaml) or instructions (docs/GO-LIVE.md), not evidence of a running site. The status field says only what the repository shows.",
      "Any price for a build, or for keeping one running. The door's price row is the `custom` row — 'A figure comes from a person after the call' — so the repository carries no figure for this door, and none was written here. shared/pricing.ts does carry figures on other rows; none of them is this door's.",
      "Any client name, engagement, sector, result, metric or date for this build. The repository holds none, so none appears above.",
      "Anything about production behaviour: uptime, latency, how many rooms exist, how many clients use it. The spend ledger is in memory in one process and resets on restart, so the code itself keeps no history to report.",
      "Which retrieval mode the live deployment is using. data/kb/kb.embeddings.json is gitignored and is only built when an OpenAI key is present at build time; without it retrieval is keyword scoring. Semantic search is therefore possible, not established.",
      "That the two of our own products the AI Builds agent is instructed to name — a multilingual life-story writer and an existential coach, both at being.marketing — are live, and what either costs. The agent's prompt names them and explicitly forbids quoting a price. Neither page was opened."
    ]
  },
  {
    "slug": "adgrant-ai",
    "name": "AdGrant.AI",
    "url": "https://adgrant.ai",
    "oneLine": "The site's own line: \"Free instant launch of web traffic to your site from your Google Ad Grant account. Message us its Customer ID & go live.\"",
    "what": "AdGrant.AI is a free web tool for nonprofits that already hold a Google Ad Grant: it takes the nonprofit's website URL, the 10-digit Google Ads Customer ID and the target languages and locations, analyses the website, and generates a full account structure — campaigns, ad groups, keywords, responsive ads, sitelinks, callouts and structured snippets. The generated structure can be reviewed and downloaded as one CSV per type, or written straight into the nonprofit's own Google Ads account by what the page calls \"Automated API Upload\" — \"Upload everything directly to your Google Ads account via API. No manual work required.\" — which requires the account to be connected to the Top-Rated Team manager account (MCC), a connection the Terms say \"can be revoked at any time through your Google Ads settings\". Free use is capped at 3 verified Customer IDs and 3 total generations, gated either by LinkedIn sign-in (the page says it uses only the profile URL, to limit free generations) or by sending the Customer ID as a LinkedIn message; the site directs anyone needing more capacity or premium service to contact it on LinkedIn. Alongside the tool the same domain runs a content library — an Ad Grant glossary, case studies, tips and tricks, starter templates, and nonprofit guides by vertical and by city — plus a four-item Stripe checkout list and a 20% lifetime affiliate program paid out by PayPal.",
    "built": [
      "React single-page app served as a static build (react-dom in the bundle; /assets/index-<hash>.js as an ES module, the standard Vite output shape, and 'vite' appears as a string in the bundle)",
      "wouter for client-side routing — live routes seen in the bundle: /, /resources, /templates, /templates/:slug, /nonprofits, /nonprofits/:niche, /nonprofits/:niche/:location, /nonprofits/locations/:location, /privacy-policy, /terms-of-service, /admin, /affiliate, /affiliate-admin",
      "Tailwind CSS with shadcn/ui on Radix UI primitives (a 'shadcn-card' class, and Radix component names such as Dialog and Switch, appear in the bundle)",
      "lucide-react icon set",
      "zod schemas for the generator form (website URL validated as a URL; Customer ID validated against /^\\d{3}-\\d{3}-\\d{4}$/)",
      "A query-cache data layer over its own JSON API (/api/generate, /api/upload/:id, /api/export/:id, /api/csv/:id/<type>.csv, /api/locations/search, /api/content/pages, /api/templates, /api/auth/linkedin, /api/auth/session)",
      "Google Ads API — the Privacy Policy lists it as a third party the service shares information with, \"To validate keywords and upload account structures\"",
      "Google Ads manager account (MCC) named 'Top-Rated Team' as the link the automated upload runs under",
      "LinkedIn OAuth sign-in (/api/auth/linkedin), used per the page only to cap free generations",
      "Stripe Payment Links for the paid services (buy.stripe.com checkout URLs)",
      "PayPal for affiliate payouts",
      "Google Tag Manager (container GTM-K9PQW2ZM)",
      "Google Translate website widget, auto-selected from navigator.language, offering ru, uk, cs, en, de, fr, es, it, pt, pl, zh-CN, ja, ko",
      "Google Fonts",
      "An admin panel and a separate affiliate-admin dashboard, both token-gated, shipped in the same bundle"
    ],
    "forPartner": null,
    "unverifiedClaims": [
      "The word \"official\" applied to the API. The live site never writes \"official Google Ads API\". Case-insensitively, \"official\" occurs exactly once in the entire shipped bundle, as the footer badge \"Official Google Ads Trainers\". The API itself is referred to only as \"Google Ads API\" (Privacy Policy) and \"Automated API Upload\" / \"via API\" (generator UI). See notes — this repository's ad-grants door and AdGrantDoor.tsx both say \"official Google Ads API\".",
      "Footer trust badges \"Google Ads Partner Top 10%\" and \"Official Google Ads Trainers\" are asserted by the site with no linked evidence, certificate, or Google-side reference on the page.",
      "\"written by the team that has set up 600+ grant accounts\" (glossary hub description) and \"drawn from the 4,500+ accounts we've analyzed\" (case-studies hub description) are site-asserted with no source. Note also that the two figures describe different things — accounts set up vs accounts analysed — and are not reconciled anywhere on the site.",
      "The figure \"4,539 real Ad Grant accounts we analyzed\", with the accompanying benchmarks (median 1 campaign, average about 3-4 campaigns, about 3 ad groups per campaign, about 9 keywords per ad group, 2 ads per ad group, roughly 7 sitelinks and 5 callouts, $329/day = $10,000/month), appears in the bundle only inside the site's own AI content-generation prompt configuration, which is instruction text for generating articles. The count 4,539 itself is in no page body I have seen, but the benchmarks it seeds are published copy: the live case study /case-studies/homeless-shelter-google-ad-grant-structure reads “From managing 600+ Google Ad Grant accounts, I’ve found that a well-structured homeless shelter’s account usually runs 3 campaigns, each with about 3 ad groups, and uses around 9 keywords per ad group” against the $10,000 monthly budget, and this repository's own corpus data/kb/kb.adgrant-ai.json samples the same page for the $329/day, the roughly 7 sitelinks and the 5 callouts. So they are shown to visitors — site-asserted, with no source given for any of them. Do not repeat them as verified.",
      "No named client, testimonial or case-study client name appears anywhere I read, and the case studies are explicitly framed by the site's own configuration as fictional/composite and anonymized — that same configuration forbids invented performance metrics. The generated pages do not hold to it: the live case study /case-studies/homeless-shelter-google-ad-grant-structure states “We see accounts boost CTR by 10-15% just by adding sitelinks and callouts”, and /glossary/maximize-conversions-bidding-google-ad-grants runs a worked example moving 100 monthly conversions to 350 and cost per conversion from $100 to about $28, framed there as “Imagine a nonprofit”. Both are site-asserted. There is no verified outcome number to quote.",
      "No legal entity, company registration, or owner name is stated on the homepage, Privacy Policy or Terms sections I read. Beyond the product name, \"Top-Rated Team\" as the MCC name and the footer location line \"Prague, Kyiv, Madeira\", one person is named: the bundle's author record, used for the byline and the schema.org Person on content pages, is name \"Dan Burykin\", bio \"Dan Burykin is a Google Ads expert and founder at Top-Rated Team who has built and managed 600+ Google Ad Grant accounts for nonprofits worldwide\", with LinkedIn, Upwork and WhatsApp contacts, and the live content API returns authorName \"Dan Burykin\" on the pages themselves. That is a person rather than a legal entity, and the 600+ in that bio is the same unsourced figure as above.",
      "Pricing tension, unresolved and left as-is: adgrant.ai's live Stripe list prices \"Your Google Ad Grant Full-Service\" at $199/mo (\"Ongoing optimization\"), while shared/pricing.ts in this repository defines the $99 \"setup\" row as \"One conversion-tracking setup, or one month of managing one Google Ad Grant account.\" Both may be true of different offers, but nothing on either side says so. Flagged for the owner; I did not change either figure.",
      "Method caveat on this whole record: https://adgrant.ai returns a client-rendered React shell whose <div id=\"root\"> is empty in the HTML, so no rendered DOM was available to me. Every quotation above was read out of the shipped JavaScript bundle (/assets/index-BXXJA0vw.js, 651,879 bytes, HTTP 200). String literals in that bundle are what the app can render, which is not proof of what a visitor actually sees on the homepage at first paint. Specifically unconfirmed: whether the four-item Stripe pricing block, the trust badges, and the \"Automated API Upload\" card render on the homepage, on a later step of the generator flow, or only in some state — and the on-page order of any of it.",
      "The homepage headline and subheadline could not be read as rendered text; taken from the bundle's h1 (\"Google® Ad Grant AI\") and the paragraph beneath it (\"Free instant launch of web traffic to your site from your Google Ad Grant\"), which match the HTML <title> and the opening of the meta description respectively — the meta description continues \" account. Message us its Customer ID & go live.\", which the on-page paragraph does not."
    ]
  },
  {
    "slug": "top-voice",
    "name": "Top Voice",
    "url": "https://top-voice.ai",
    "oneLine": "Organic LinkedIn growth engine that turns targeted reactions into inbound traffic",
    "what": "Top Voice is a LinkedIn visibility platform built around reactions rather than outreach: you describe your business and who you sell to, and it generates a Signal Flow of boolean searches that assembles a feed of your target prospects' posts, then reacts to those posts on behalf of your profile or company page with natural, human-like timing. Because LinkedIn resurfaces posts you have reacted to in the feeds and notifications of the author and the author's own connections, the profile or page earns inbound visits instead of sending cold messages. The app is organised in three sections: Research (Influence Flows built from real influencer voices), Appear (Content Studio and Autopilot publishing) and Grow (LinkedIn Boosting). The page is equally explicit about what it refuses to do: no bulk cold outreach or DMs, no engagement pods, and no AI comments.",
    "built": [
      "Instant AI Setup: four fields generate an Influence Flow, a content campaign and a boosting campaign",
      "Influence Flows - synthesised influencer voices, including custom ones from any LinkedIn profile URL",
      "Content Studio with Autopilot: post copy, images, carousel PDFs and video, published to profiles or company pages on a schedule",
      "LinkedIn Booster: AI-generated Signal Flow boolean searches that assemble a targeted posts feed",
      "Reaction engine with human-like pacing - randomised 5-60 second delays and selectable reaction types",
      "Rented-account pool: dedicated in-house LinkedIn accounts, blocking-free with a replacement guarantee",
      "Performance Plan billing on Stripe: own and rented account slots, campaign slots, proration, auto top-up",
      "Engager and profile-viewer tracking with webhook and Google Sheets delivery",
      "AI Optimize plus an approve-before-apply queue, so no AI suggestion changes a campaign unreviewed",
      "MCP connectors - Add to ChatGPT and Add to Claude - alongside in-app, web-chat and LinkedIn DM entry points",
      "Guided in-app walkthrough for each section, plus referral and three-level affiliate program"
    ],
    "forPartner": "A client buying LinkedIn growth never has to hand over their own LinkedIn login: campaigns can run on a dedicated account rented from the in-house pool - blocking-free with a replacement guarantee - on the client's own connected account, or on a mix of both. From a short description of the client's business and target prospects, Top Voice builds a feed of those prospects' posts and reacts to them with natural, human-like timing, so the client's profile or company page shows up in the post author's notifications and in the relevant-post feeds of that author's connections, with no cold DMs, no pods and no AI comments. Content runs in parallel - post copy, images, carousels and video published to the client's profile or pages on a schedule - while engagers and profile viewers are tracked and can be pushed out by webhook or into a Google Sheet.",
    "unverifiedClaims": [
      "top-voice.ai is a client-rendered SPA whose served HTML body is empty; every string quoted above was verified verbatim against this repository's client source rather than against a rendered DOM, so section order and which strings are currently visible to a live visitor were not confirmed. The bundle path /assets/index-Dy6zFoC1.js is not established as the source of these strings - it is the shared entry chunk also cited for warmlike.com - and several items in 'built' (auto top-up, proration, campaign slots, the approve-before-apply queue, the per-section guided tours, engager and profile-viewer export) describe authenticated in-app surfaces, not public landing-page copy.",
      "No prices, plan tiers or per-engager rates are stated in the fields above. They are NOT absent from the source, though: shared/performance-plan.ts hardcodes PRICE_PER_ACCOUNT = 49 and ENGAGERS_PER_ACCOUNT = 100, and the plan card the landing page renders states '$0.5 per engager it handles ($49/mo per account)', with '$0.15/token' for creative top-ups. Those figures were deliberately not carried into the fields above and must be checked against what is actually charged before any reuse.",
      "No user counts, growth figures or performance metrics are recorded. The comparison section does state 'For the same [budget] Top Voice gets you 12 x more engagers than LinkedIn Ads', but it is the output of an on-page budget calculator, so it was deliberately not used.",
      "'Results from a 14-day case study with Top Voice' appears as a caption in the page, directly under three hardcoded stat tiles - '300K+ Impressions Generated', '3,000+ Profile Visitors', '20+ Inbound Leads' (client/src/components/HowItWorksSteps.tsx, rendered on the landing page). Those are the page's own unverified marketing figures; they were deliberately not used and no result figures are claimed in the fields above.",
      "The people and companies in the page's illustrations (BrightPath Foundation, ScaleUp Labs, ScaleUp For Good, 'Sarah', 'Surfaced to 1,200+ of Sarah's connections') are demo personas inside product mockups, not real clients or real numbers. No client name is verified.",
      "The partner relationship is not stated anywhere on top-voice.ai. warmlike.com is named as the place where Profile Pre-lander pages are made, with their boosting then managed in Top Voice. forPartner was therefore written only from product capability the page itself states, and names no partner.",
      "'Join thousands of professionals who are growing their LinkedIn presence on autopilot' is in the page copy but is an unquantified marketing claim; it was not used as a user count.",
      "Timing statements quoted from the page - randomised 5-60 second reaction delays, 'a natural organic delay (3-14 days)' for some engagers, and 'See real engagement 1-2 weeks' - are the site's own claims and were not independently verified.",
      "Trial terms found in the bundle ('Try FREE 14 days', 'Free 2-week trial', 'first 50 engagers are on us', 'Free trial covers your first account only') are landing-page copy - 'Try FREE 14 days' in the hero, the rest in the plan card the landing page renders - and may not match the current live offer, so no trial terms are asserted in the fields above.",
      "The bundle also contains an outbound feature - AI auto-configuring connection requests to people who viewed or connected with the profile, plus AI follow-ups to profile viewers. The 'no outreach' language above is limited to what the page claims (no cold DMs, no bulk outreach, no pods, no AI comments) and does not assert the product is outbound-free."
    ]
  },
  {
    "slug": "warmlike",
    "name": "WarmLike",
    "url": "https://warmlike.com",
    "oneLine": "A fully managed LinkedIn “pre-lander” company page that engages your target prospects and reshares your posts, so those people flow through to your own profile — with no login or password shared.",
    "what": "WarmLike is a done-for-you LinkedIn visibility service built around a second, managed page rather than your own account. The site describes the mechanism in four steps, in its own words: you “Tell us your profile & niche” over a LinkedIn message or a short call (“That's the whole setup — no dashboards, no login, no password”); WarmLike then “spin[s] up a polished LinkedIn company page from your business — on-brand name, logo, and description”, called a pre-lander and described as “a warm front door that points target prospects to your profile”; that page “proactively engages the posts of your exact target prospects — reactions and comments that ramp up gradually”; and the prospects it engaged “get notified, check it out, and find your reshared post — with you as its author”, then “click straight through to your personal LinkedIn profile, hands-off”. Content is part of the service: “Every day we write a fresh, niche-tuned post and suggest it to you”, reviewed and approved from a private link, published to your own profile, and then reshared by the managed page. The positioning is explicitly compliance-first — the headline reads “Boost your LinkedIn Profile, without linking it anywhere. 100% secured & compliant.”, and the copy states “We share access, not you. No pods, bots, spam, AI comments. Your LinkedIn account is untouchable: violations and ban free.” The FAQ answers “No. We never log into or post from your personal profile” and “There's no login to create and no password to share.” “Warming” is defined on the page as building the page's presence gradually “so growth looks organic and stays healthy, never a suspicious overnight spike.” Four summary stats run across the page as labels, not measurements: Daily / on-brand posts, Zero / logins to share, Gradual / natural warming, 24/7 / hands-off growth.",
    "built": [
      "A single-page marketing and onboarding site at warmlike.com. It is a client-rendered React/Vite application: the served HTML is a 13 KB shell with an empty <div id=\"root\"> and no prerendered body, so all visible copy is delivered by JavaScript. The bundle is shared with Top Voice and switches to the WarmLike app by hostname, matching warmlike.com, warmliker.com and warmlikes.com. Beyond the landing route the WarmLike app registers routes for /message, /hub/:token, /preview/:token, /post/:token and /demo — consistent with the “review everything from a private link” flow the copy promises, though those token routes were not exercised. The landing page itself carries a hero with a 2-week-free-trial badge, a numbered explanation of the mechanism, a four-step “You / We build / We boost / You grow” walkthrough with illustrated LinkedIn mockups, an explainer video block (“A 60-second look at how WarmLike grows your LinkedIn presence — fully managed”), an interactive pricing and projection widget driven by a “boosters” slider, a five-question FAQ, and CTAs that all resolve to either a LinkedIn message or a booked call. HubSpot chat and a Replit analytics script are loaded on the page."
    ],
    "forPartner": "A packaged, productised service with a clear commercial shape and an unusually clean risk story, which is what makes it easy to sell alongside other LinkedIn work. The page states its own pricing: a “Booster plan” at $49 per booster per month, described as “scales linearly”, with the slider capped at 9 boosters and each plan “amplifying 1 LinkedIn profile”. Plan inclusions are listed as: a fully-managed pre-lander page, daily on-brand content plus automatic reshares, “300 content credits / month per page — a daily post with visuals”, engagement with target prospects “no pods, no bots”, prospects channelled to your profile, no login and nothing connected to your account, and “Extra reach above your plan is free — never an overage”. Acquisition is entirely conversational rather than self-serve — every CTA button is “Message & Launch” (“Free launch” on mobile), “Message to Start Trial” or “Free Strategy Call” — so it fits a referral or advisory motion where a partner makes an introduction rather than pointing at a checkout. The audience is signalled only by five illustrative chips inside a page mockup, under the label “Your niche & audience” — B2B SaaS, Founders, AI, Growth, Sales — and by the offer being tied to one personal profile at a time, which points at individual operators and personal-brand-led selling rather than at enterprise teams. The footer positions the product within a family: “© [year] powered by Top-Voice”, linking to top-voice.ai.",
    "unverifiedClaims": [
      "fetchedAt is null by instruction; the fetch itself was performed and returned HTTP 200, but no timestamp is recorded in this file.",
      "The page was not rendered in a real browser. Because the HTML body is empty and all copy lives in the JS bundle, wording is verbatim but on-page ordering, visual hierarchy and which blocks are actually visible at which breakpoint are inferred from source order, not observed.",
      "NO PERFORMANCE METRICS ARE STATED ANYWHERE ON THE PAGE, and none are recorded here. The figures the page shows next to \"Prospects reaching you\", \"Profile visits / mo\", \"New followers / mo\" and \"Impressions / mo\" are outputs of an interactive slider, computed in the browser from hardcoded constants (60 per booster, then ×0.32, ×1.7, ×1, ×26). They are projections generated by a marketing widget, not results, benchmarks, or case-study data, and must never be quoted as outcomes WarmLike has achieved.",
      "Pricing ($49 per booster/month, up to 9 boosters, 300 content credits/month, \"≈ $X per prospect\") was read as literal constants in the client bundle and rendered by the slider, not from a server-rendered price page. Given this project's history with an invented price list reaching production, treat these as needing a human eyeball against the live rendered widget and against what is actually charged before reuse in any sales or billing context.",
      "Currency is shown only as \"$\" with no currency code stated on the page; USD is an assumption and is not asserted here.",
      "The page names no clients, no testimonials, no case studies, no logos, no team members, no company or legal entity, no founding or launch date, and no headcount. All such fields are absent, not withheld.",
      "The relationship to Top Voice is only as stated in the footer, \"powered by Top-Voice\" linking top-voice.ai, plus the shared codebase and hostname switch observed in the bundle. Whether WarmLike is a separate product, a brand of the same entity, or a separate company is NOT stated on the page and is not asserted here.",
      "A detail commonly attached to this product — that the LinkedIn account behind the managed page is rented from an in-house pool — appears in the Top Voice app bundle, NOT on the WarmLike landing page. The WarmLike page says only \"We share access, not you\" and that it runs \"a separate, managed LinkedIn company page\". Do not attribute the rented-account-pool mechanism to WarmLike's own page copy.",
      "The token-based routes (/hub/:token, /preview/:token, /post/:token, /message, /demo) were identified from the router in the bundle and were not opened, so what a customer actually sees in the \"private link\" review flow is unverified.",
      "Claims about compliance and safety (\"100% secured & compliant\", \"violations and ban free\", \"Your LinkedIn account is untouchable\") are quoted as the page's own marketing language. They are the vendor's assertions, not independently verified, and not endorsed here."
    ]
  },
  {
    "slug": "upwork-auto-apply",
    "name": "Upwork Proposal Agent",
    "url": null,
    "oneLine": "A Claude Code skill that finds and scores Google Ads jobs on Upwork, drafts the cover letter and screening answers, and fills the proposal form — the proposal is submitted only after the user confirms that specific one.",
    "what": "Runs inside Claude Code as the /upwork-apply skill and drives the user's own logged-in Upwork session through the Claude in Chrome browser tools — there is no cloud browser and no shared Upwork account. A round opens the search URLs from the user's own profile config, checks each listing against a seen.md watermark and an applied.md log so nothing is triaged or applied to twice, drops anything that fails the profile's reject rules or any of the client's stated Preferred qualifications, and writes an English cover letter plus screening answers built only from the evidence bank in that user's config. It then fills the Upwork proposal form field by field — rate or milestones, letter, each screening question, case-study attachment — and stops: pressing \"Send for X Connects\" requires the user to have confirmed that specific proposal in that session, a rule the skill states outranks the auto-reply setting. Scheduled and background runs are stricter again — they never open the proposal form at all and leave drafts as files for review.",
    "built": [
      "Claude Code skill: SKILL.md plus references/ (upwork-pages.md page-and-form map, inbox-flow.md, onboarding.md) at ~/.claude/skills/upwork-apply",
      "Modes as skill arguments: setup (in-chat onboarding), a default interactive round, duty (turns the live session into the scheduler), background (drafts only), inbox, sync",
      "Browser control via the Claude in Chrome MCP tools (mcp__claude-in-chrome__*) against the user's own signed-in Chrome; CAPTCHA, logins, payments, identity verification and Connects purchases hand control back to the human",
      "Markdown state kept deliberately outside the skill folder, because a plugin update overwrites that folder: a personal profile config (rates, tone, reject rules, evidence bank), a case library, and an upwork-logs/ directory holding applied.md, seen.md, drafts-<date>.md, slots.txt and last-run-epoch",
      "Incremental scanning: results are read newest-first and matched by job ID against seen.md; two consecutive already-seen listings stop that URL, and a catch-up after downtime pages deeper so nothing new is missed between sessions",
      "Rate-limit and anti-bot guards written into the skill: daily proposal and Connects limits, minutes of spacing between sends, a cap of 3 drafts per background run and 5 per day, and a skip if the previous round ran under 20 minutes ago and found nothing new",
      "Optional Google Sheet sync (Profile / Evidence / Answers / Schedule tabs) for editing settings away from the machine, last-write-wins by timestamp, off by default; the chat/GPT/Grok settings front ends can only edit the Sheet and take no Upwork actions",
      "Scheduling: duty mode reads slots.txt and creates one recurring Claude Code cron task per slot; an optional launchd job is offered as a macOS safety net, and a self-paced /loop is offered as an alternative because cron slots can bunch up",
      "Experimental Node stdio MCP server (mcp/upwork-agent/server.js) exposing local profile, drafts, inbox-pending, run-status and schedule tools; its own file header states the tools touch local profile/logs only and never Upwork Send",
      "Distribution as a Claude Code plugin for other people to install: a Stop hook runs sync.sh after each session, which mirrors the live skill folder into a git repo, bumps the plugin.json patch version, commits and pushes; each user runs it on their own machine with their own config and logs"
    ],
    "forPartner": null,
    "unverifiedClaims": [
      "There is no public page for this build. fetchedAt is null and nothing in this entry was checked against a live URL — it is written from the skill's own source files on the owner's machine.",
      "No reply rate, no interview or hire rate, no revenue and no time-saved figure appears in the files read for this entry. An applied.md log of submitted proposals does exist in the owner's upwork-logs/ (kept out of the mirror repo by .gitignore), but it was not used as a source here, so no count of proposals sent is asserted. None of this is claimed here, and none should be added without a file that states it.",
      "Repo visibility is contradictory between the two memory notes (one says the mirror repo is private, the other says it is public), so neither is asserted.",
      "Upwork's commission is stated inconsistently in the source files (SKILL.md uses 10% when computing the amount the freelancer receives; a memory note says fixed-price is 15%), so no commission figure is asserted.",
      "Whether the scheduled automation is running right now is not something any file states. A memory note dated 2026-08-20 lists five daily launchd slots and calls the background mode active, and a slots.txt in the owner's upwork-logs/ holds the same five times; neither shows whether a session or scheduler is live now.",
      "The plugin version on disk here is 1.1.5, but the sync hook bumps it automatically after sessions, so any version number stated on a public page will drift.",
      "How many people use the skill is not stated. The files say only that more than one person does, each on their own machine with their own config.",
      "The actual rates, bid rules, case studies and metrics the agent puts into proposals live in the user's private profile and case files, which were not read for this entry.",
      "No claim is made about how this sits with Upwork's Terms of Service. The files' own position is that automatic submission would risk a permanent ban, which is the stated reason sending is gated on human confirmation."
    ]
  },
  {
    "slug": "being-existential-coach",
    "name": "Being.Marketing: Your Existential Coach",
    "url": "https://being.marketing",
    "oneLine": "A quiet companion for rest from anxious purpose-hunting, tasks, and roles.",
    "what": "A quiet companion for rest from anxious purpose-hunting, tasks, and roles, and a clear mirror for your inner language — the listing invites you to lay down a concern or identity like a stone. It is offered two ways: as a custom ChatGPT, or reached from the web without logging in to ChatGPT, which the page describes as being for ultimate privacy. The page also says your dialogue can seed your GPT's training data or AI prompt to share as a custom ChatGPT, so others can quietly sit beside it as well. It is published and listed free on the being.marketing storefront.",
    "built": [
      "Custom ChatGPT — offered as the \"Custom ChatGPT\" option on the listing",
      "A web version usable without a ChatGPT login — the \"W/o login to ChatGPT\" option, described on the page as being for ultimate privacy",
      "Published through a Gumroad storefront served on the being.marketing custom domain (product permalink /l/being)"
    ],
    "forPartner": null,
    "unverifiedClaims": [
      "No launch, publish, or update date appears on either page, so fetchedAt and any date for this build are null — do not state when it shipped.",
      "No usage, adoption, download, or sales figures are given. The product page reports 0 ratings and no sales count; do not imply traction.",
      "The pages never name the underlying model or version, and never describe the system prompt, instructions, or knowledge files behind the GPT.",
      "The pages do not say what the no-login web version actually runs on, or how its \"ultimate privacy\" is achieved — that phrase is the page's claim, not a verified property.",
      "Neither page links to chatgpt.com or the OpenAI GPT Store, so there is no evidence of a public GPT Store listing or a direct chat link.",
      "\"Existential Coach\" is the product's own title. Neither page claims therapy, counselling, clinical benefit, or any credential — do not add one, and do not describe it as a mental-health service.",
      "The front page never mentions this GPT in prose — it appears only as one product tile in an \"AI development\" section, so there is no front-page narrative about it to quote.",
      "The front-page bio carries the owner's own agency claims (\"20+ yrs of experience in IT, marketing and psychology\", \"the past eight years\", \"conversion rate from leads to B2B contracts exceeds 3%\"). Those are about the agency, not about this GPT, and are unaudited — do not attach them to this build.",
      "How the owner himself types the brand was not sourced — only the two rendered pages were checked, so nothing here describes his own typing, and \"Being.\" is plain ASCII in both."
    ]
  }
];

export const BUILD_BY_SLUG: Record<string, Build> = Object.fromEntries(
  BUILDS.map((build) => [build.slug, build]),
);

/** The two the partner door describes, in the order that door shows them. */
export const PARTNER_BUILDS: Build[] = BUILDS.filter((build) => build.forPartner !== null);
