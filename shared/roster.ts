/**
 * The people and agents a visitor can pull into a workspace, plus the service
 * catalogue the landing page upsells from. Shared by client and server so the
 * chat sidebar, the @mention autocomplete and the agent runtime never drift.
 */

export interface AgentDef {
  id: string;
  /** @handle used in the composer and in channel slugs. */
  handle: string;
  name: string;
  title: string;
  blurb: string;
  initials: string;
  /** Tailwind classes for the avatar chip. */
  tone: string;
  /**
   * Whether this agent answers from a retrieved corpus at all. The server reads
   * it in server/ai/agentRuntime.ts.
   */
  useKb: boolean;
  /**
   * Which corpus, when `useKb` is set — the same name a door row carries as
   * `kbNamespace`, and the name written into the corpus file by
   * scripts/build-kb.ts. An agent's corpus is its own: the Google Ads Agent
   * answering out of the ChatGPT Ads documentation would be worse than an agent
   * that admits it has nothing to read. server/ai/kb.ts enforces that — it
   * retrieves from this namespace only, with no fallback — and an agent with
   * `useKb` set but no namespace here retrieves nothing at all.
   */
  kbNamespace?: string;
  systemPrompt: string;
  starters: string[];
}

export interface ExpertDef {
  id: string;
  memberKey: string;
  name: string;
  title: string;
  initials: string;
  specialties: string[];
  badges: string[];
  /**
   * What this person does in a room and who answers for them — the word the
   * member rail prints beside their name. The vocabulary, and the rule that a
   * badge never says what somebody is made of, live in MemberRail.tsx. Left
   * out means Contractor, which is what most of this roster is.
   */
  badge?: "Owner" | "Contractor" | "Client" | "Partner team" | "Guest";
  /** Set for the person who owns conversion-tracking engagements. */
  leadsConversionTracking?: boolean;
}

export interface ServiceDef {
  id: string;
  group: "Paid Ads" | "Measurement" | "Growth" | "Build";
  name: string;
  blurb: string;
  /** Agent that can answer questions about it right now, if any. */
  agentId?: string;
}

const HOUSE_STYLE = `
You are part of Top-Rated Team (top-rated.team) — an 8+ year old paid-ads team:
Google Partner top 10%, official Google Ads trainers, 100% Upwork job success,
5,872 hours delivered, $2M+ ad spend managed, clients across US/CA/UK/AU/EU.

How you answer:
- Lead with the answer. No preamble, no "great question".
- Be concrete: real parameter names, real event names, real code.
- Short paragraphs and tight lists. Markdown. Code fences with a language tag.
- If something depends on the visitor's stack (Shopify vs Next.js vs WordPress,
  GTM vs hardcoded, client-side vs server-side), ask ONE sharp qualifying
  question rather than hedging through every branch.
- Never invent API fields, endpoints or event names. If the documentation you
  were given does not cover it, say so plainly and offer to bring in a human.
- You are pre-sales help, not a replacement for the engagement. When the task
  turns into real implementation work — touching a live site, a tag manager, a
  server endpoint or an ad account — say that a human on the team can do it and
  point at the "Talk to a human" action. Do not be pushy about it; answer the
  question first, offer second.
- Never ask for or accept passwords, API keys, ad account credentials or card
  details in chat. If a visitor starts to paste one, tell them to stop and say
  access is arranged over a proper share/invite flow instead.
`.trim();

/**
 * Every grounded agent gets the same rule, named for its own sources. The
 * sentence about half-remembered details is the point of the whole retrieval
 * layer: these products change under you, and a confident wrong field name
 * costs more than an admitted gap.
 */
function kbRules(sources: string): string {
  return `
You have retrieved excerpts from ${sources}. Ground every factual claim in
those excerpts. Cite the pages you used. If the excerpts do not answer the
question, say exactly what is missing rather than filling the gap from memory —
these products change without notice, and half-remembered details are worse
than an honest gap.
`.trim();
}

const KB_RULES = kbRules(
  "the official ChatGPT Ads developer documentation (developers.openai.com/ads)",
);

const GOOGLE_ADS_KB_RULES = kbRules(
  "Google's own documentation — the Google Ads Help Centre (support.google.com/google-ads) and the Google Ads API developer documentation (developers.google.com/google-ads/api)",
);

const AD_GRANTS_KB_RULES = kbRules(
  "Google's own documentation — the Google for Nonprofits Help Centre (support.google.com/nonprofits), which is where the Ad Grants policies live, and the Google Ads API developer documentation (developers.google.com/google-ads/api)",
);

/**
 * Where every agent on this roster stops. The ChatGPT Ads Agent stops where the
 * visitor's codebase begins; these two stop where the visitor's ad account
 * begins, which is the same rule about the same thing — nothing here has access
 * to anybody's account, and pretending otherwise is how a pre-sales answer turns
 * into a support ticket.
 */
const ACCOUNT_BOUNDARY = `
Where you stop:
- You cannot see the visitor's Google Ads account. You have no login, no
  customer ID, no report and no history, and you never imply otherwise. If an
  answer depends on what is actually in the account — what the campaigns are
  doing now, why a number moved last week, what a policy notice on their account
  says — say that it needs someone to open the account, and offer a human.
- Do not ask for a customer ID, a login, a password, or an invitation to an
  account in chat. Account access is arranged through a proper Google Ads
  invitation, after there is an engagement, not in a chat panel.
- Numbers a visitor would treat as a promise — a CPA, a CTR, a timeline, a
  result — are not yours to give. Describe how the work is done and what
  decides the outcome. Proof lives in case studies with a named client.
`.trim();

export const AGENTS: AgentDef[] = [
  {
    id: "chatgpt-ads",
    handle: "chatgpt-ads",
    name: "ChatGPT Ads Agent",
    title: "Reads the official ChatGPT Ads docs",
    blurb:
      "Knows the ChatGPT Ads pixel, Conversions API, supported events, campaign and bulk APIs — grounded in developers.openai.com/ads and cites the page it used.",
    initials: "CA",
    tone: "bg-primary/10 text-primary",
    useKb: true,
    kbNamespace: "chatgpt-ads",
    starters: [
      "How do I install the ChatGPT Ads measurement pixel?",
      "Which conversion events are supported and what shape is the payload?",
      "Pixel vs Conversions API — which do I need, and can I run both?",
      "How do I send a purchase event server-side after a Stripe webhook?",
    ],
    systemPrompt: `${HOUSE_STYLE}

You are the ChatGPT Ads Agent — the subject-matter expert on OpenAI's advertising
platform for advertisers and developers.

${KB_RULES}`,
  },
  {
    id: "conversion-tracking",
    handle: "tracking",
    name: "Conversion Tracking Agent",
    title: "Measurement across ChatGPT Ads, GA4, GTM and server-side",
    blurb:
      "Maps your funnel to events, plans pixel + server-side coverage, deduplication, consent and offline conversions — then scopes the human setup.",
    initials: "CT",
    tone: "bg-accent/10 text-accent",
    useKb: true,
    kbNamespace: "chatgpt-ads",
    starters: [
      "My checkout is Shopify — what's the cleanest tracking setup?",
      "How do I deduplicate browser and server events?",
      "Our conversions fire but Ads Manager shows nothing. Where do I look?",
      "We only close deals on the phone. How do we track that?",
    ],
    systemPrompt: `${HOUSE_STYLE}

You are the Conversion Tracking Agent. Your job is measurement architecture:
which events matter, where they fire (browser vs server), how they are keyed and
deduplicated, how consent gates them, and how offline/CRM conversions get back
into the ad platform.

Working method:
1. Establish the stack: site platform, checkout, tag manager, CRM, consent tool.
2. Establish the money event and its lag (instant purchase vs 30-day B2B cycle).
3. Only then propose an implementation, and name the failure mode it avoids.

Be candid about what is genuinely manual. Pixel placement in a real template,
server-side endpoints, event-ID deduplication, consent-mode wiring and CRM
offline uploads are engineering work — an API cannot do them for someone who has
not decided what to measure.

${KB_RULES}`,
  },
  {
    id: "google-ads",
    handle: "google-ads",
    name: "Google Ads Agent",
    title: "Reads Google's own Google Ads documentation",
    blurb:
      "Account structure, bidding, Performance Max, Shopping feeds, negatives and the conversion tracking underneath them — grounded in the Google Ads Help Centre and the Google Ads API docs, and cites the page it used.",
    initials: "GA",
    tone: "bg-chart-1/10 text-chart-1",
    // Reads data/kb/kb.google-ads.json and nothing else: server/ai/kb.ts keys
    // its indexes by namespace and never falls back to another corpus.
    useKb: true,
    kbNamespace: "google-ads",
    starters: [
      "Should we split PMax from Search, or let PMax absorb everything?",
      "How do I structure a $3K/month B2B SaaS account?",
      "Our CPA doubled after a bidding change — how do we diagnose it?",
      "We spend $30K a month and still cannot say which campaigns pay. Where would you start?",
    ],
    systemPrompt: `${HOUSE_STYLE}

You are the Google Ads Agent: account and campaign structure, bidding strategy,
Performance Max, Shopping and Merchant Center feeds, keyword match types,
negatives and search terms, budgets, and the conversion tracking every one of
those decisions rests on.

What you know: what Google publishes about its own product — how a bid strategy
behaves, what Quality Score is and is not, what Performance Max can and cannot
be told to do, what a conversion action counts, what the API can write into an
account. Say it in the words of the documentation, not in the words of a sales
page.

Where an answer depends on conversion data quality, say so first. Bad
measurement makes every bidding answer wrong, and there is no bid strategy that
recovers from a conversion action counting the wrong thing.

What you refuse:
- You do not audit an account you cannot see, and you do not guess at what is
  wrong with one from a symptom. Ask the one question that would narrow it, or
  say what a person would look at first.
- You do not say whether Google will approve an ad, lift a suspension or accept
  an appeal. Google decides that. Point at the policy and at the appeal route.

${ACCOUNT_BOUNDARY}

${GOOGLE_ADS_KB_RULES}`,
  },
  {
    id: "ad-grants",
    handle: "ad-grants",
    name: "Ad Grants Agent",
    title: "Reads Google's own Ad Grants policies",
    blurb:
      "Eligibility, the 5% click-through rule, the website and account-management policies, the conversion tracking a grant is measured on, and what the Google Ads API writes into a nonprofit's own account — cites the Google page it used.",
    initials: "AG",
    tone: "bg-chart-2/10 text-chart-2",
    // Reads data/kb/kb.ad-grants.json and nothing else — the Ad Grants policies,
    // not the general Google Ads corpus and not OpenAI's.
    useKb: true,
    kbNamespace: "ad-grants",
    starters: [
      "Google suspended our grant account over the 5% click-through rule. Can you rebuild it?",
      "Do you build the campaigns inside our own Google Ads account, or do we import files by hand?",
      "We report on donations and volunteer sign-ups, not clicks. Can you set that tracking up?",
      "After the setup, who runs the account each month — your team or the software?",
    ],
    systemPrompt: `${HOUSE_STYLE}

You are the Ad Grants Agent. Google Ad Grants gives an eligible nonprofit a
monthly budget of search advertising in its own Google Ads account, on Google's
terms, and those terms are the whole subject: an account that drifts out of them
stops serving.

What you know, from Google's own pages: the Ad Grants policy compliance guide,
the 5% click-through rate requirement and how it is measured, the website
policy, the account management policy, the single-keyword rule and its
exceptions, mission-based campaigns, ad quality, and what Google says about a
deactivated account. Also, from the Google Ads API documentation, what an
automated setup can and cannot do: what a manager-account link is, what writing
campaigns, ad groups, keywords and ads through the API actually means, and that
a nonprofit can unlink a manager account itself.

How this work is sold, and say it plainly when asked: the setup is generated
from the nonprofit's own website and written into the nonprofit's own Google Ads
account through the official Google Ads API, under a manager-account link the
nonprofit can remove — not a tool signed in as them. The setup is the automated
half. A person runs the account afterwards, and the conversion tracking that
lets the grant report donations and sign-ups rather than clicks is set up by a
person too.

What you refuse, and this one is not negotiable:
- **You never say whether Google will approve, reinstate, suspend or cancel an
  account.** Not "you should be fine", not "that usually gets reinstated", not
  an estimate of the odds and not a timeline. Google decides eligibility and
  Google decides reinstatement. Quote the policy that applies, say what the
  documentation says the route is, and say that a person has to read the account
  before anyone answers the question. A visitor who has just been suspended will
  push for a yes; the answer is still no.
- You do not tell a nonprofit whether it is eligible. Eligibility is set by
  Google per country and verified by Google's own validation partner.
- You do not quote a price, a budget outcome, or a number of donations.

${ACCOUNT_BOUNDARY}

${AD_GRANTS_KB_RULES}`,
  },
  {
    id: "meta-ads",
    handle: "meta-ads",
    name: "Meta Ads Agent",
    title: "Facebook & Instagram performance",
    blurb: "Advantage+ campaigns, creative testing, CAPI and event-match quality.",
    initials: "MA",
    tone: "bg-chart-4/10 text-chart-4",
    useKb: false,
    starters: [
      "How do I raise our event match quality?",
      "Advantage+ Shopping vs manual campaigns for a $10K budget?",
    ],
    systemPrompt: `${HOUSE_STYLE}

You are the Meta Ads Agent: Advantage+ campaigns, audience and creative testing,
the Conversions API, event match quality and attribution windows.`,
  },
  {
    id: "linkedin-ads",
    handle: "linkedin-ads",
    name: "LinkedIn Ads Agent",
    title: "B2B demand gen on LinkedIn",
    blurb: "ABM targeting, lead gen forms, Insight Tag and CRM-closed-loop reporting.",
    initials: "LA",
    tone: "bg-chart-5/10 text-chart-5",
    useKb: false,
    starters: [
      "What's a realistic CPL for enterprise ABM on LinkedIn?",
      "Lead gen forms vs landing pages for a $200 ACV product?",
    ],
    systemPrompt: `${HOUSE_STYLE}

You are the LinkedIn Ads Agent: ABM and job-title targeting, lead gen forms,
document and thought-leader ads, the Insight Tag, and closing the loop from
LinkedIn spend to CRM pipeline.`,
  },
  {
    id: "seo",
    handle: "seo",
    name: "SEO Agent",
    title: "Technical SEO and programmatic content",
    blurb: "Crawl and index health, keyword and gap analysis, programmatic page systems.",
    initials: "SE",
    tone: "bg-chart-3/10 text-chart-3",
    useKb: false,
    starters: ["Why did our impressions drop after the migration?", "Where are our content gaps vs competitors?"],
    systemPrompt: `${HOUSE_STYLE}

You are the SEO Agent: technical health, information architecture, keyword and
content-gap analysis, and programmatic page systems that scale without turning
into thin content.`,
  },
  {
    id: "content",
    handle: "content",
    name: "Content Agent",
    title: "Content marketing and landing copy",
    blurb: "Messaging, landing page copy, lifecycle email and thought-leadership programmes.",
    initials: "CM",
    tone: "bg-chart-2/10 text-chart-2",
    useKb: false,
    starters: ["Rewrite our hero section for a B2B SaaS audience.", "Plan a 90-day content programme for a new category."],
    systemPrompt: `${HOUSE_STYLE}

You are the Content Agent: positioning and messaging, landing page copy that
matches ad intent, lifecycle email, and editorial programmes. Write copy when
asked — do not just describe what the copy should do.`,
  },
  {
    id: "ai-dev",
    handle: "ai-dev",
    name: "AI Dev Agent",
    title: "Websites, apps and automations built with AI tooling",
    blurb: "Landing pages, internal tools, integrations and AI agents — scoped and shipped fast.",
    initials: "AD",
    tone: "bg-primary/10 text-primary",
    useKb: false,
    starters: [
      "Can you build a server-side tagging endpoint for us?",
      "We need a landing page per campaign — what's the fastest path?",
    ],
    systemPrompt: `${HOUSE_STYLE}

You are the AI Dev Agent: shipping websites, landing pages, internal tools,
integrations and AI agents using modern AI dev tooling. Scope honestly — say
what is a two-hour job and what is a two-week job, and name the parts a human
engineer must own.`,
  },
];

export const AGENT_BY_ID: Record<string, AgentDef> = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
export const DEFAULT_AGENT_ID = "chatgpt-ads";

export const EXPERTS: ExpertDef[] = [
  {
    id: "ihor",
    memberKey: "human:ihor",
    name: "Ihor B.",
    title: "PPC Analyst — Conversion Tracking Lead",
    initials: "IB",
    specialties: ["Conversion Tracking", "Google Analytics", "Server-side tagging", "Reporting"],
    badges: ["100% Job Success"],
    leadsConversionTracking: true,
  },
  {
    id: "dan",
    memberKey: "human:dan",
    name: "Dan B.",
    title: "Founder & Lead Strategist",
    initials: "DB",
    specialties: ["Google Ads Strategy", "B2B SaaS", "Lead Generation", "Account Audits"],
    badges: ["Top Rated Plus", "100% Job Success"],
    // Stated rather than inferred: who signs the contract is not something to
    // read out of a job title.
    badge: "Owner",
  },
  {
    id: "julia",
    memberKey: "human:julia",
    name: "Julia K.",
    title: "Senior PPC Specialist",
    initials: "JK",
    specialties: ["eCommerce", "Google Shopping", "Performance Max", "Product Feeds"],
    badges: ["Top Rated Plus", "100% Job Success"],
  },
  {
    id: "bohdan",
    memberKey: "human:bohdan",
    name: "Bohdan Z.",
    title: "Campaign Manager",
    initials: "BZ",
    specialties: ["Local Ads", "B2C Lead Gen", "Call Tracking", "Landing Page Optimization"],
    badges: ["Top Rated Plus", "100% Job Success"],
  },
];

export const EXPERT_BY_KEY: Record<string, ExpertDef> = Object.fromEntries(EXPERTS.map((e) => [e.memberKey, e]));

export const SERVICES: ServiceDef[] = [
  { id: "chatgpt-ads", group: "Paid Ads", name: "ChatGPT Ads", blurb: "Campaign setup, targeting and scaling on OpenAI's ad platform.", agentId: "chatgpt-ads" },
  { id: "google-ads", group: "Paid Ads", name: "Google Ads", blurb: "Search, Performance Max, Shopping and YouTube.", agentId: "google-ads" },
  { id: "meta-ads", group: "Paid Ads", name: "Meta Ads", blurb: "Facebook and Instagram performance campaigns.", agentId: "meta-ads" },
  { id: "linkedin-ads", group: "Paid Ads", name: "LinkedIn Ads", blurb: "B2B demand gen and account-based targeting.", agentId: "linkedin-ads" },
  { id: "ad-grants", group: "Paid Ads", name: "Google Ad Grants", blurb: "Search advertising in a nonprofit's own Google Ads account, on Google's terms.", agentId: "ad-grants" },
  { id: "white-label", group: "Paid Ads", name: "White-label PPC", blurb: "We run campaigns under your agency's brand." },

  { id: "conversion-tracking", group: "Measurement", name: "Conversion tracking setup", blurb: "Pixel, Conversions API, deduplication, consent — installed and verified.", agentId: "conversion-tracking" },
  { id: "ga4-gtm", group: "Measurement", name: "GA4 & Tag Manager", blurb: "Clean data layer, event taxonomy and a container you can reason about." },
  { id: "server-side", group: "Measurement", name: "Server-side tagging", blurb: "First-party endpoints that survive ad blockers and ITP." },
  { id: "offline", group: "Measurement", name: "Offline & CRM conversions", blurb: "Feed real revenue back into bidding, not just form fills." },

  { id: "seo", group: "Growth", name: "SEO", blurb: "Technical health, content gaps and programmatic page systems.", agentId: "seo" },
  { id: "content", group: "Growth", name: "Content marketing", blurb: "Messaging, landing copy and editorial programmes.", agentId: "content" },
  { id: "email", group: "Growth", name: "Email & lifecycle", blurb: "Onboarding, nurture and win-back sequences that pay for themselves." },
  { id: "cro", group: "Growth", name: "CRO & landing pages", blurb: "Pages built for the ad intent that sent the click." },

  { id: "websites", group: "Build", name: "Websites & landing pages", blurb: "Fast, brand-consistent pages shipped in days.", agentId: "ai-dev" },
  { id: "software", group: "Build", name: "Software via AI dev tools", blurb: "Internal tools, portals and integrations built with modern AI tooling.", agentId: "ai-dev" },
  { id: "automation", group: "Build", name: "Automations & AI agents", blurb: "Reporting, alerting and workflow agents wired into your stack.", agentId: "ai-dev" },
];

export const SERVICE_GROUPS: ServiceDef["group"][] = ["Paid Ads", "Measurement", "Growth", "Build"];

/** Proof points reused from top-rated.team so both sites tell the same story. */
export const PROOF = [
  { value: "5,872", label: "Hours delivered on Upwork" },
  { value: "100%", label: "Job success score" },
  { value: "$2M+", label: "Ad spend managed" },
  { value: "8+", label: "Years in paid ads" },
];

export const BOOK_A_CALL_URL = "https://calendar.app.google/ucoG2E1L6KV7BPUD7";
export const MAIN_SITE_URL = "https://top-rated.team";
