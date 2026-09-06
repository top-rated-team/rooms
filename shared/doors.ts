/**
 * The doors: one row per offer, so an offer is data and never a new page.
 *
 * A door carries everything the panel and the room need to behave correctly for
 * the traffic that came through it — which agent speaks first, which four
 * questions it offers, and, the column that matters, whose name and terms the
 * resulting room must print in its footer. The door sets that once; nothing
 * downstream has to remember it. A visitor who came in through the partner door
 * never sees a Top-Rated Team invoice, because the door never handed the room a
 * Top-Rated Team name to print.
 *
 * Shape follows shared/roster.ts: plain data, no logic, one lookup map, and the
 * client and the server read the same rows so the panel, the room footer and
 * the overview page cannot drift.
 */

import { AGENT_BY_ID, MAIN_SITE_URL, type AgentDef } from "./roster";

/**
 * How much of the work Top-Rated Team is actually in. The three words come from
 * the money-and-liability review, and they are our vocabulary, not the buyer's:
 * a visitor only ever reads `label` and `meaning`.
 */
export type DoorTier = "white" | "light-grey" | "grey";

/** "live" = this door has a page a visitor can open now. "coming" = the offer is real, the door is not built. */
export type DoorStatus = "live" | "coming";

export interface DoorTierDef {
  id: DoorTier;
  /** The chip on the overview row. Says what the tier is, in the buyer's words. */
  label: string;
  /** What the tier means for the person paying, in one sentence. */
  meaning: string;
}

export const DOOR_TIERS: Record<DoorTier, DoorTierDef> = {
  white: {
    id: "white",
    label: "Ours end to end",
    meaning: "Top-Rated Team signs the contract, sends the invoice and answers for the work.",
  },
  "light-grey": {
    id: "light-grey",
    label: "Lawyer first",
    meaning:
      "A qualified lawyer writes down what is allowed where you are before anything is built, and bills that part separately.",
  },
  grey: {
    id: "grey",
    label: "A different company",
    meaning:
      "Another company contracts with you, does the work and invoices you. Top-Rated Team is not in that chain and takes no share of it.",
  },
};

/**
 * Who the client is actually buying from. This is what the room prints in its
 * footer and what any paper the client receives has to agree with.
 */
export interface DoorContract {
  /** Legal name, exactly as it appears on the contract. */
  legalName: string;
  /** What kind of body it is and what it trades as, in a client's words. */
  entity: string;
  /** Terms the room links to. `null` when the entity has not supplied one yet — the room must say so rather than falling back to ours. */
  termsUrl: string | null;
  /** Who invoices, and for what. One sentence, no hedging. */
  invoiceLine: string;
  /**
   * Where a person writes about a room opened through this door: an email
   * address, or the address of a contact page. Two companies never share one,
   * so it lives on the contract rather than being defaulted in the room.
   * `null` when the entity has not given us one — the room says so.
   */
  contact: string | null;
  /** Link text when `contact` is a page rather than an address. */
  contactLabel?: string;
}

export interface DoorDef {
  id: string;
  /** URL segment: /work/<slug>. Also the value handed to the room as its source door. */
  slug: string;
  /** Where the door lives today. Only meaningful while `status` is "live". */
  path: string;
  /** Two letters for the door chip, same shape as AgentDef.initials. */
  initials: string;
  /** Tailwind classes for that chip. */
  tone: string;
  /** The line a visitor reads first. */
  headline: string;
  /** The two sentences under the headline, and the same two on the overview row. What gets done, on whose system. */
  blurb: string;
  /** The agent that opens the conversation, keyed to AGENTS. `null` when no agent of ours speaks in this door. */
  firstAgentId: string | null;
  /** That agent's job here, in one line — including the case where the answer is "none of ours". */
  agentLine: string;
  /** At least four. The panel prints the first four and hides the rest behind "N more" — eight on a card is a menu, and a menu is read by nobody. */
  starters: string[];
  contract: DoorContract;
  tier: DoorTier;
  status: DoorStatus;
  /** Only for status "coming": why the panel is shut, in one sentence. */
  comingLine?: string;
  /**
   * Which corpus the door's answers are retrieved from. Three are built today —
   * "chatgpt-ads" (data/kb/kb.json), "google-ads" (kb.google-ads.json) and
   * "ad-grants" (kb.ad-grants.json), all written by scripts/build-kb.ts. A door
   * pointing at a namespace with no corpus retrieves nothing and its agent says
   * what it is missing — see server/ai/kb.ts. `null` where no agent of ours
   * answers at all.
   *
   * The name that decides an answer is the one on the AGENT, in shared/roster.ts:
   * retrieval happens per agent, and server/ai/kb.ts answers only from that
   * agent's namespace with no fallback. This field is the door's copy of it, and
   * the two must agree — a door whose agent reads a different corpus is a door
   * citing somebody else's documentation.
   */
  kbNamespace: string | null;
}

/** Doors 1-5 and 7. One company, one contract, one invoice. */
const TOP_RATED_TEAM: DoorContract = {
  legalName: "Top-Rated Team s.r.o.",
  entity: "The company that runs top-rated.team, with people in Prague, Kyiv and Madeira.",
  termsUrl: `${MAIN_SITE_URL}/terms`,
  invoiceLine: "Top-Rated Team s.r.o. signs the contract and sends the invoice.",
  contact: `${MAIN_SITE_URL}/contact`,
  contactLabel: "Write to Top-Rated Team",
};

export const DOORS: DoorDef[] = [
  {
    id: "chatgpt-ads",
    slug: "chatgpt-ads",
    // The one door that already exists: it is the landing page this site was built as.
    path: "/",
    initials: "CA",
    tone: "bg-primary/10 text-primary",
    headline: "Conversion tracking for ChatGPT Ads",
    blurb:
      "The one part of paid ads an API still can't finish for you. Pixel, Conversions API, deduplication and consent — installed on your real site, verified against live conversions, and documented before we hand it back.",
    firstAgentId: "chatgpt-ads",
    agentLine: "The ChatGPT Ads Agent answers first, from developers.openai.com/ads, and cites the page it used.",
    starters: [
      "How do I install the ChatGPT Ads pixel on Shopify without breaking checkout?",
      "Which event should I optimise on if our sales cycle is 60 days and nothing is bought online?",
      "What is the difference between oppref and obref, and do I need both?",
      "Our purchases are being counted twice. How does deduplication actually work?",
      // The four below are the rest of what the live panel already offers behind
      // "4 more". Keep them in step with client/src/components/site/AskWidget.tsx.
      "Can I send a conversion from HubSpot when a deal moves to closed-won?",
      "What do I need to add to our Content Security Policy for the pixel?",
      "We're in the EU. How do I gate the pixel behind consent without losing every conversion?",
      "How do I confirm real events are arriving, not just getting a 200 back?",
    ],
    contract: TOP_RATED_TEAM,
    tier: "white",
    status: "live",
    kbNamespace: "chatgpt-ads",
  },
  {
    id: "google-ads",
    slug: "google-ads",
    path: "/work/google-ads",
    initials: "GA",
    tone: "bg-chart-1/10 text-chart-1",
    headline: "Google Ads management",
    blurb:
      "Search, Performance Max and Shopping, run by the people Google books to train other advertisers. Account structure, bidding and negatives — and the measurement underneath them, because bad data makes every bidding decision wrong.",
    firstAgentId: "google-ads",
    agentLine:
      "The Google Ads Agent answers first, from Google's own Google Ads documentation, and cites the page it used: account structure, bidding, Performance Max, Shopping feeds and the conversion tracking underneath them. It does not audit an account it cannot see, and it does not say whether Google will approve an ad or lift a suspension.",
    starters: [
      "Should we split PMax from Search, or let PMax absorb everything?",
      "How do I structure a $3K/month B2B SaaS account?",
      "Our CPA doubled after a bidding change — how do we diagnose it?",
      "We spend $30K a month and still cannot say which campaigns pay. Where would you start?",
    ],
    contract: TOP_RATED_TEAM,
    tier: "white",
    status: "live",
    kbNamespace: "google-ads",
  },
  {
    id: "ad-grants",
    slug: "ad-grants",
    path: "/work/ad-grants",
    initials: "AG",
    tone: "bg-chart-2/10 text-chart-2",
    headline: "Google Ad Grants, set up through the official Google Ads API",
    blurb:
      "Campaigns, ad groups, keywords, ads and extensions are generated from your own website and written into your Google Ads account through the official Google Ads API — under a manager-account link you can remove, not a tool signed in as you. The setup is the automated half; the other half is a person, on the conversion tracking that lets the grant report donations and sign-ups instead of clicks, and on the month-to-month work that keeps the account inside the rules that suspend grants.",
    // Its own agent, not the Google Ads one: this door's agent reads Google's
    // Ad Grants policies rather than the general Google Ads corpus, and carries
    // a refusal the Google Ads Agent has no reason to carry.
    firstAgentId: "ad-grants",
    agentLine:
      "The Ad Grants Agent answers first, from Google's own Ad Grants policies, and cites the page it used: the 5% click-through rule, the website and account-management policies, what the API upload writes into your account, and what conversion tracking needs from your website. It does not say whether Google will approve or reinstate an account — a person reads the account before anyone answers that.",
    starters: [
      "Google suspended our grant account over the 5% click-through rule. Can you rebuild it?",
      "Do you build the campaigns inside our own Google Ads account, or do we import files by hand?",
      "We report on donations and volunteer sign-ups, not clicks. Can you set that tracking up?",
      "After the setup, who runs the account each month — your team or the software?",
    ],
    contract: {
      ...TOP_RATED_TEAM,
      // Only the entity line moves: the tool is ours and so are the hours after
      // it, so this door stays one contract and one invoice.
      entity:
        "The company that runs top-rated.team. Ad Grants setup runs on our own tool, adgrant.ai, which writes through the official Google Ads API under a manager-account link you can remove; the management and the conversion tracking after it are our own people, on the same contract.",
    },
    tier: "white",
    status: "live",
    kbNamespace: "ad-grants",
  },
  {
    id: "linkedin-ads",
    slug: "linkedin-ads",
    path: "/work/linkedin-ads",
    initials: "LA",
    tone: "bg-chart-5/10 text-chart-5",
    headline: "LinkedIn Ads for B2B",
    blurb:
      "Account-based targeting, lead gen forms, the Insight Tag, and a closed loop from spend to pipeline in your CRM — so the report says revenue rather than form fills.",
    firstAgentId: "linkedin-ads",
    agentLine:
      "The LinkedIn Ads Agent answers first: targeting, lead gen forms, the Insight Tag and the CRM loop.",
    starters: [
      "What's a realistic CPL for enterprise ABM on LinkedIn?",
      "Lead gen forms vs landing pages for a $200 ACV product?",
      "Our LinkedIn leads never become opportunities. Is that the targeting or the offer?",
      "How do we get LinkedIn spend and CRM pipeline into one report?",
    ],
    contract: TOP_RATED_TEAM,
    tier: "white",
    status: "coming",
    comingLine: "This door has no panel yet. Until it does, a call covers the same ground.",
    kbNamespace: "linkedin-ads",
  },
  {
    id: "linkedin-automation",
    slug: "linkedin-automation",
    path: "/work/linkedin-automation",
    initials: "LL",
    tone: "bg-chart-4/10 text-chart-4",
    headline: "LinkedIn automation — with a written legal assessment",
    blurb:
      "Before anything runs on your account, a qualified lawyer writes down what is and is not allowed where you are. Then we build only that, against documented interfaces, and hand over the code.",
    firstAgentId: "ai-dev",
    agentLine:
      "The AI Dev Agent answers first and scopes the build. It does not answer legal questions — that is the lawyer's assessment, and it is written before anything runs.",
    starters: [
      "What can be automated on LinkedIn without putting the account at risk?",
      "We want follow-ups sent from our sales team's own profiles. Is that allowed where we are?",
      "What does the written assessment cover, who writes it, and what does it cost?",
      "Can this be built against the official LinkedIn API instead of a browser session?",
    ],
    contract: {
      legalName: "Top-Rated Team s.r.o.",
      entity:
        "The company that runs top-rated.team. The written assessment is not ours: it comes from a qualified lawyer, on the lawyer's own paper.",
      termsUrl: `${MAIN_SITE_URL}/terms`,
      invoiceLine:
        "Top-Rated Team s.r.o. invoices the build. The lawyer invoices the assessment separately, and we do not mark it up.",
      contact: `${MAIN_SITE_URL}/contact`,
      contactLabel: "Write to Top-Rated Team",
    },
    tier: "light-grey",
    status: "coming",
    comingLine:
      "This door opens once the assessment is on the shelf and the agent knows to refuse legal questions rather than guess at them.",
    kbNamespace: "linkedin-automation",
  },
  {
    id: "linkedin-growth",
    slug: "linkedin-growth",
    path: "/work/linkedin-growth",
    initials: "MK",
    // Deliberately not one of our brand tones: this row is not our company.
    tone: "bg-muted text-muted-foreground",
    headline: "LinkedIn growth — run by Maksymenko LinkedIn Growth",
    blurb:
      "A separate company, a separate contract, a separate invoice. Not Top-Rated Team. If you buy this and something of ours, you get two of everything: two contracts, two invoices, two support addresses.",
    firstAgentId: null,
    agentLine: "No agent of ours answers in this door. Maksymenko's own people do, in their own room.",
    starters: [
      "Who exactly is the company doing this work, and where is it registered?",
      "What does Maksymenko's team do on my behalf, and what do they never touch?",
      "If this goes wrong, who am I complaining to, and under whose terms?",
      "I already work with Top-Rated Team. What changes if I add this?",
    ],
    contract: {
      legalName: "Maksymenko LinkedIn Growth",
      entity: "A different company. Its own contract, its own invoice, its own support address.",
      // No fallback here on purpose: a room opened from this door must show the
      // partner's terms or say it has none, never quietly borrow ours.
      termsUrl: null,
      invoiceLine:
        "Maksymenko LinkedIn Growth invoices you directly. Top-Rated Team does not invoice for this work and takes no share of it.",
      // Same rule as the terms: their address or none, never ours.
      contact: null,
    },
    tier: "grey",
    status: "coming",
    comingLine:
      "This door opens when Maksymenko's registered name and terms are on the page, because the room has to show theirs and it has none to show yet.",
    kbNamespace: null,
  },
  {
    id: "ai-builds",
    slug: "ai-builds",
    path: "/work/ai-builds",
    initials: "AB",
    tone: "bg-accent/10 text-accent",
    headline: "Custom AI builds",
    blurb:
      "The agent you are talking to is the thing itself: an assistant grounded in one body of knowledge, wired into one stack, that hands the work to a person where it runs out. We build them for clients, and we sell two of our own at being.marketing — a multilingual life-story writer, and a set of custom AIs that run without a login.",
    firstAgentId: "ai-dev",
    agentLine:
      "The AI Dev Agent answers first: what is a two-hour job, what is a two-week job, and which parts a person has to own.",
    starters: [
      "Can you build an agent that answers from our own documentation and cites it?",
      "We want a workspace like this one, on our domain and our data. What does that take?",
      "What does it cost to keep an agent running once it is built, and who owns the code?",
      "Can an agent write back into our CRM, or only read from it?",
    ],
    contract: TOP_RATED_TEAM,
    tier: "white",
    status: "coming",
    comingLine: "This door has no panel yet. The builds are running, so start with a call.",
    kbNamespace: "ai-builds",
  },
];

export const DOOR_BY_ID: Record<string, DoorDef> = Object.fromEntries(DOORS.map((door) => [door.id, door]));
export const DOOR_BY_SLUG: Record<string, DoorDef> = Object.fromEntries(DOORS.map((door) => [door.slug, door]));

/** The door a visitor is in when nothing said otherwise — the page that pays for the rest. */
export const DEFAULT_DOOR_ID = "chatgpt-ads";

/** The agent that opens this door's conversation, or undefined where none of ours does. */
export function doorAgent(door: DoorDef): AgentDef | undefined {
  return door.firstAgentId ? AGENT_BY_ID[door.firstAgentId] : undefined;
}
