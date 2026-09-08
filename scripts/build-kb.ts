/**
 * Builds every knowledge base the doors retrieve from.
 *
 *   npm run kb:fetch   download + chunk  -> data/kb/<corpus>.json
 *   npm run kb:embed   embed the chunks  -> data/kb/<corpus>.embeddings.json (needs a key)
 *   npm run kb:build   both, skipping the embed step if there is no key
 *
 * Add a namespace to any of them to work on one corpus alone:
 *
 *   npm run kb:fetch -- google-ads
 *
 * One corpus per door, because a door's agent must not answer out of another
 * door's documentation. The namespace is written into each file, and
 * server/ai/kb.ts loads every corpus in data/kb/ into its own index and answers
 * only from the one the asking agent belongs to — no fallback to another. Add a
 * corpus here and a door can read it; nothing else has to change.
 *
 * Every file is rewritten whole, so every mode is safe to re-run, and a corpus
 * that fetches nothing is left exactly as it was rather than being emptied —
 * the deploy runs this on every push and must never be able to blank a corpus
 * that is already serving answers.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  KB_FILE,
  resolveKbDir,
  type KbChunk,
  type KbEmbeddingsFile,
  type KbFile,
} from "../server/ai/kb";
import { EMBED_BATCH_SIZE, EMBED_MODEL, classifyLlmError, embedTexts, getClient } from "../server/ai/openai";

/* -------------------------------- corpora --------------------------------- */

/**
 * `namespace` is what a door row's `kbNamespace` points at. It is written into
 * the file so the corpus carries its own name and the server can tell two
 * corpora apart without inferring anything from the filename.
 */
export interface Corpus {
  namespace: string;
  /** File under data/kb/. Its embeddings live beside it as `<base>.embeddings.json`. */
  file: string;
  /** What this corpus is, for the build log. */
  label: string;
  /** An llms.txt index listing `.md` pages, expanded before fetching. */
  index?: string;
  /** The concatenated export, kept only for what the individual pages missed. */
  full?: DocRef;
  /** Markdown pages fetched directly, whether or not the index still lists them. */
  markdownPages?: DocRef[];
  /** HTML pages: the article body is extracted and converted before chunking. */
  htmlPages?: DocRef[];
}

interface DocRef {
  /** Fallback only — the page's own <title> or `# Heading` wins where there is one. */
  title: string;
  url: string;
}

const USER_AGENT = "top-rated-team-kb-builder/0.1 (+https://top-rated.team; door knowledge base)";
const REQUEST_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 30_000;

const DOCS_PREFIX = "https://developers.openai.com/ads/";

/**
 * Door 1. The pages docs/ADS-DOCS-BRIEF.md was written from: llms.txt is the live
 * index and normally supersedes this list, but the product's copy depends on these
 * specific pages, so they are fetched whether or not the index still lists them.
 */
const CHATGPT_ADS: Corpus = {
  namespace: "chatgpt-ads",
  file: KB_FILE,
  label: "ChatGPT Ads — developers.openai.com/ads",
  index: "https://developers.openai.com/ads/llms.txt",
  full: { title: "Ads — full documentation", url: "https://developers.openai.com/ads/llms-full.txt" },
  markdownPages: [
    { title: "Measurement Pixel", url: "https://developers.openai.com/ads/measurement-pixel.md" },
    { title: "Supported Events", url: "https://developers.openai.com/ads/supported-events.md" },
    { title: "Conversions API", url: "https://developers.openai.com/ads/conversions-api.md" },
    { title: "Conversion Setup", url: "https://developers.openai.com/ads/api-reference/conversion-setup.md" },
    { title: "Multiple Pixel IDs", url: "https://developers.openai.com/ads/multiple-pixels.md" },
    { title: "Image Tag", url: "https://developers.openai.com/ads/image-tag.md" },
    { title: "Conversion-Optimized Campaigns", url: "https://developers.openai.com/ads/conversion-optimized-campaigns.md" },
    { title: "Overview", url: "https://developers.openai.com/ads/api-overview.md" },
    { title: "API Partner Setup", url: "https://developers.openai.com/ads/api-partner-setup.md" },
    { title: "Insights", url: "https://developers.openai.com/ads/api-reference/insights.md" },
  ],
};

/**
 * Door 2. Google's own Google Ads Help and Google Ads API documentation, and
 * nothing else: no blog, no agency write-up, nothing behind a login. Every URL
 * here was fetched and checked before it was written down.
 *
 * `?hl=en` is deliberate. Without it the help centre answers in the language it
 * guesses from the caller, and a citation has to open in the language the
 * excerpt was written in.
 */
const GOOGLE_ADS: Corpus = {
  namespace: "google-ads",
  file: "kb.google-ads.json",
  label: "Google Ads — support.google.com/google-ads + developers.google.com/google-ads/api",
  htmlPages: [
    // Structure
    { title: "The ABCs of Account Structure", url: "https://support.google.com/google-ads/answer/14752782?hl=en" },
    { title: "Organize your account with ad groups", url: "https://support.google.com/google-ads/answer/6372655?hl=en" },
    { title: "How ad groups work", url: "https://support.google.com/google-ads/answer/2375404?hl=en" },
    // Bidding
    { title: "About automated bidding", url: "https://support.google.com/google-ads/answer/2979071?hl=en" },
    { title: "About Smart Bidding", url: "https://support.google.com/google-ads/answer/7065882?hl=en" },
    { title: "Understanding bidding basics", url: "https://support.google.com/google-ads/answer/2459326?hl=en" },
    { title: "Determine a bid strategy based on your goals", url: "https://support.google.com/google-ads/answer/2472725?hl=en" },
    { title: "About Target ROAS bidding", url: "https://support.google.com/google-ads/answer/6268637?hl=en" },
    { title: "About Target CPA bidding", url: "https://support.google.com/google-ads/answer/6268632?hl=en" },
    { title: "About Maximize conversion value bidding", url: "https://support.google.com/google-ads/answer/7684216?hl=en" },
    { title: "About Manual CPC bidding", url: "https://support.google.com/google-ads/answer/2464960?hl=en" },
    { title: "About Maximize clicks bidding", url: "https://support.google.com/google-ads/answer/6268626?hl=en" },
    { title: "About Target impression share bidding", url: "https://support.google.com/google-ads/answer/9121108?hl=en" },
    { title: "Set up Smart Bidding", url: "https://support.google.com/google-ads/answer/10893605?hl=en" },
    // Budgets
    { title: "Budgets overview", url: "https://support.google.com/google-ads/answer/10486536?hl=en" },
    { title: "About average daily budgets", url: "https://support.google.com/google-ads/answer/6385083?hl=en" },
    { title: "About overdelivery and your average daily budget", url: "https://support.google.com/google-ads/answer/1704443?hl=en" },
    // Performance Max
    { title: "About Performance Max campaigns", url: "https://support.google.com/google-ads/answer/10724817?hl=en" },
    { title: "Optimization tips for Performance Max campaigns", url: "https://support.google.com/google-ads/answer/11385582?hl=en" },
    { title: "Performance Max best practices for lead generation", url: "https://support.google.com/google-ads/answer/13775965?hl=en" },
    { title: "Optimization tips for Performance Max with a Merchant Center feed", url: "https://support.google.com/google-ads/answer/13776350?hl=en" },
    { title: "Apply brand exclusions to Performance Max or Search campaigns", url: "https://support.google.com/google-ads/answer/14505308?hl=en" },
    { title: "About brand settings for Search and Performance Max", url: "https://support.google.com/google-ads/answer/13721847?hl=en" },
    { title: "Troubleshoot performance fluctuations in Performance Max campaigns", url: "https://support.google.com/google-ads/answer/12200334?hl=en" },
    // Shopping
    { title: "Create a Shopping campaign", url: "https://support.google.com/google-ads/answer/3455481?hl=en" },
    { title: "Use negative keywords for a Shopping campaign", url: "https://support.google.com/google-ads/answer/6275313?hl=en" },
    { title: "Monitor and optimize your Shopping campaigns", url: "https://support.google.com/google-ads/answer/3455573?hl=en" },
    { title: "Link a Google Ads account to Merchant Center", url: "https://support.google.com/google-ads/answer/12499498?hl=en" },
    { title: "Product and listing groups", url: "https://support.google.com/google-ads/answer/3517331?hl=en" },
    // Keywords and search terms
    { title: "Negative keyword: Definition", url: "https://support.google.com/google-ads/answer/105671?hl=en" },
    { title: "Negative broad match: Definition", url: "https://support.google.com/google-ads/answer/7302703?hl=en" },
    { title: "Keyword matching options: Definition", url: "https://support.google.com/google-ads/answer/6324?hl=en" },
    { title: "Search terms report: Definition", url: "https://support.google.com/google-ads/answer/2684537?hl=en" },
    { title: "Use Keyword Planner", url: "https://support.google.com/google-ads/answer/7337243?hl=en" },
    { title: "About Quality Score for Search campaigns", url: "https://support.google.com/google-ads/answer/6167118?hl=en" },
    { title: "Auction", url: "https://support.google.com/google-ads/answer/142918?hl=en" },
    // Measurement — the half that makes every bidding answer right or wrong
    { title: "Different ways to track conversions", url: "https://support.google.com/google-ads/answer/1722054?hl=en" },
    { title: "Understand your conversion tracking data", url: "https://support.google.com/google-ads/answer/6270625?hl=en" },
    { title: "Conversion action: Definition", url: "https://support.google.com/google-ads/answer/6032150?hl=en" },
    { title: "About enhanced conversions", url: "https://support.google.com/google-ads/answer/9888656?hl=en" },
    { title: "About enhanced conversions at the account level", url: "https://support.google.com/google-ads/answer/14664077?hl=en" },
    { title: "About attribution models", url: "https://support.google.com/google-ads/answer/6259715?hl=en" },
    { title: "About primary and secondary conversion actions", url: "https://support.google.com/google-ads/answer/11461796?hl=en" },
    { title: "About cross-account conversion tracking", url: "https://support.google.com/google-ads/answer/3030657?hl=en" },
    { title: "Drive offline sales with online ads", url: "https://support.google.com/google-ads/answer/6190135?hl=en" },
    { title: "About auto-tagging", url: "https://support.google.com/google-ads/answer/3095550?hl=en" },
    { title: "Link Google Analytics 4 properties and Google Ads", url: "https://support.google.com/google-ads/answer/7519537?hl=en" },
    // Diagnosis
    { title: "Troubleshoot performance fluctuations and changes in Google Ads campaigns", url: "https://support.google.com/google-ads/answer/12077891?hl=en" },
    { title: "How to fix Google Ads campaigns not running or low traffic", url: "https://support.google.com/google-ads/answer/12092760?hl=en" },
    { title: "Fix a disapproved ad or appeal a policy decision", url: "https://support.google.com/google-ads/answer/9338593?hl=en" },
    // Access, and where our work stops
    { title: "About Google Ads manager accounts", url: "https://support.google.com/google-ads/answer/6139186?hl=en" },
    { title: "Link accounts to your manager account", url: "https://support.google.com/google-ads/answer/7459601?hl=en" },
    { title: "Unlink accounts from your manager account", url: "https://support.google.com/google-ads/answer/7456531?hl=en" },
    { title: "Google Ads Application Programming Interface (API)", url: "https://support.google.com/google-ads/answer/2375503?hl=en" },
    // The API itself
    { title: "Google Ads API: Introduction", url: "https://developers.google.com/google-ads/api/docs/get-started/introduction?hl=en" },
    { title: "Google Ads API: Campaigns", url: "https://developers.google.com/google-ads/api/docs/campaigns/overview?hl=en" },
    { title: "Google Ads API: Bidding strategy types", url: "https://developers.google.com/google-ads/api/docs/campaigns/bidding/strategy-types?hl=en" },
    { title: "Google Ads API: Conversion management", url: "https://developers.google.com/google-ads/api/docs/conversions/overview?hl=en" },
    { title: "Google Ads API: Manage offline conversions", url: "https://developers.google.com/google-ads/api/docs/conversions/upload-offline?hl=en" },
    { title: "Google Ads API: Conversion goals", url: "https://developers.google.com/google-ads/api/docs/conversions/goals/overview?hl=en" },
    { title: "Google Ads API: Keyword ideas", url: "https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas?hl=en" },
    { title: "Google Ads API: Shopping Ads", url: "https://developers.google.com/google-ads/api/docs/shopping-ads/overview?hl=en" },
  ],
};

/**
 * Door 3. Google's own Ad Grants policy pages, which live in the Google for
 * Nonprofits help centre (support.google.com/grants redirects there), plus the
 * Google Ads API pages behind the one claim this door makes about how the setup
 * reaches the account: an official API writing under a manager link the
 * nonprofit can remove. Both halves have to be citable or the claim is a story.
 */
const AD_GRANTS: Corpus = {
  namespace: "ad-grants",
  file: "kb.ad-grants.json",
  label: "Google Ad Grants — support.google.com/nonprofits + developers.google.com/google-ads/api",
  htmlPages: [
    // The policies that suspend a grant
    { title: "Ad Grants Policy Compliance Guide", url: "https://support.google.com/nonprofits/answer/9314402?hl=en" },
    { title: "Ad Grants' click-through rate (CTR) requirements", url: "https://support.google.com/nonprofits/answer/7651240?hl=en" },
    { title: "Website policy", url: "https://support.google.com/nonprofits/answer/1657899?hl=en" },
    { title: "Account management policy", url: "https://support.google.com/nonprofits/answer/117827?hl=en" },
    { title: "Ad Grants single keyword policy exceptions", url: "https://support.google.com/nonprofits/answer/7587473?hl=en" },
    { title: "Mission-based campaigns", url: "https://support.google.com/nonprofits/answer/4410314?hl=en" },
    { title: "Ad quality", url: "https://support.google.com/nonprofits/answer/7404558?hl=en" },
    { title: "Google Ad Grants Terms and Conditions", url: "https://support.google.com/nonprofits/answer/46103?hl=en" },
    // What Google itself says about a deactivated account — which is not much,
    // and is exactly why this door's agent refuses to predict reinstatement.
    { title: "Fix a deactivated account", url: "https://support.google.com/nonprofits/answer/139493?hl=en" },
    // Running the account
    { title: "Set up conversion tracking", url: "https://support.google.com/nonprofits/answer/9841491?hl=en" },
    { title: "Understanding Budgets and Bidding", url: "https://support.google.com/nonprofits/answer/1332166?hl=en" },
    { title: "Tips for success with Google Ad Grants", url: "https://support.google.com/nonprofits/answer/98870?hl=en" },
    { title: "Quick Start Guide for nonprofits", url: "https://support.google.com/nonprofits/answer/9251886?hl=en" },
    { title: "Access your Google Ad Grants account", url: "https://support.google.com/nonprofits/answer/9840391?hl=en" },
    { title: "Connect with the Ad Grants team by opting into email notifications", url: "https://support.google.com/nonprofits/answer/9005089?hl=en" },
    { title: "Refunds", url: "https://support.google.com/nonprofits/answer/4387997?hl=en" },
    // Eligibility — where the agent stops, because Google decides this, not us.
    // support.google.com/nonprofits/answer/3215869 is deliberately absent: Google
    // rewrites that page for the caller's own country, so whichever country the
    // build host sits in would become the rule this corpus states for everyone.
    { title: "About Google for Nonprofits", url: "https://support.google.com/nonprofits/answer/1614581?hl=en" },
    { title: "Check your Google for Nonprofits account status", url: "https://support.google.com/nonprofits/answer/1614637?hl=en" },
    { title: "Get verified by Goodstack", url: "https://support.google.com/nonprofits/answer/12016036?hl=en" },
    { title: "Certified Professionals Directory", url: "https://support.google.com/nonprofits/answer/9069100?hl=en" },
    // How the setup actually reaches the account
    { title: "Google Ads API: Introduction", url: "https://developers.google.com/google-ads/api/docs/get-started/introduction?hl=en" },
    { title: "Google Ads API: Account types", url: "https://developers.google.com/google-ads/api/docs/concepts/account-types?hl=en" },
    { title: "Google Ads API: Linking to manager accounts", url: "https://developers.google.com/google-ads/api/docs/account-management/linking-manager-accounts?hl=en" },
    { title: "Google Ads API: Manage user access", url: "https://developers.google.com/google-ads/api/docs/account-management/managing-users?hl=en" },
    { title: "Google Ads API: Mutating resources", url: "https://developers.google.com/google-ads/api/docs/mutating/overview?hl=en" },
    { title: "Google Ads API: Bulk mutates", url: "https://developers.google.com/google-ads/api/docs/mutating/bulk-mutate?hl=en" },
    { title: "Google Ads API: Create campaigns", url: "https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns?hl=en" },
    { title: "Google Ads API: Create ad groups", url: "https://developers.google.com/google-ads/api/docs/campaigns/create-ad-groups?hl=en" },
    { title: "Google Ads API: Conversion management", url: "https://developers.google.com/google-ads/api/docs/conversions/overview?hl=en" },
    { title: "Google Ads API: Conversion tracking, getting started", url: "https://developers.google.com/google-ads/api/docs/conversions/getting-started?hl=en" },
    { title: "Google Ads API: Partial failure", url: "https://developers.google.com/google-ads/api/docs/best-practices/partial-failures?hl=en" },
    // Manager links, in the nonprofit's own words rather than the API's
    { title: "About Google Ads manager accounts", url: "https://support.google.com/google-ads/answer/6139186?hl=en" },
    { title: "Unlink accounts from your manager account", url: "https://support.google.com/google-ads/answer/7456531?hl=en" },
  ],
};

/**
 * Door 4. LinkedIn's own Marketing Solutions help centre, which is where
 * LinkedIn documents its advertising product, and nothing else: no blog, no
 * agency write-up, nothing behind a login. Every URL here was fetched and read
 * before it was written down.
 *
 * `?lang=en` for the same reason Google's pages carry `hl=en`: this host
 * negotiates the language of a help article from the caller, and an excerpt has
 * to be readable in the language the agent is answering in.
 *
 * The corpus is scoped to what the door actually sells — objectives, audience
 * targeting including the account-based kind, Lead Gen Forms, the Insight Tag,
 * conversion tracking and the CRM loop that turns spend into pipeline. LinkedIn
 * publishes its chargeability and objective-based pricing pages in the same help
 * centre and they are deliberately absent: this agent already invented a price
 * list once (see server/ai/grounding.test.ts), and a corpus is what an agent is
 * allowed to say. Nothing about money is in it.
 */
const LINKEDIN_ADS: Corpus = {
  namespace: "linkedin-ads",
  file: "kb.linkedin-ads.json",
  label: "LinkedIn Ads — linkedin.com/help/lms (LinkedIn Marketing Solutions Help)",
  htmlPages: [
    // What the platform can be told to do
    { title: "Marketing objectives available for your ad campaigns", url: "https://www.linkedin.com/help/lms/answer/a424570?lang=en" },
    { title: "Lead generation ad objective", url: "https://www.linkedin.com/help/lms/answer/a422440?lang=en" },
    { title: "Ad formats for objective-based advertising", url: "https://www.linkedin.com/help/lms/answer/a422880?lang=en" },
    // The two formats the agent's own prompt names, so its remit is retrievable
    // rather than a claim with nothing behind it.
    { title: "Create document ads in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a733950?lang=en" },
    { title: "Create an article and newsletter ad using a thought leader ad", url: "https://www.linkedin.com/help/lms/answer/a6841255?lang=en" },
    // Targeting, and the account-based half of it
    { title: "Targeting options for LinkedIn Ads", url: "https://www.linkedin.com/help/lms/answer/a424655?lang=en" },
    { title: "Best practices for LinkedIn Ads audience targeting", url: "https://www.linkedin.com/help/lms/answer/a417950?lang=en" },
    { title: "Use AND-OR targeting to set up your LinkedIn Ads audience", url: "https://www.linkedin.com/help/lms/answer/a420879?lang=en" },
    { title: "Get started with LinkedIn Matched Audiences", url: "https://www.linkedin.com/help/lms/answer/a420552?lang=en" },
    { title: "Company list targeting in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a423102?lang=en" },
    { title: "Contact list targeting in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a1489764?lang=en" },
    { title: "Matched Audiences match rates", url: "https://www.linkedin.com/help/lms/answer/a420595?lang=en" },
    { title: "Matched Audiences best practices", url: "https://www.linkedin.com/help/lms/answer/a424450?lang=en" },
    { title: "Retargeting with Matched Audiences", url: "https://www.linkedin.com/help/lms/answer/a427551?lang=en" },
    { title: "Data collection and storage for LinkedIn Matched Audiences", url: "https://www.linkedin.com/help/lms/answer/a420297?lang=en" },
    { title: "LinkedIn buyer groups", url: "https://www.linkedin.com/help/lms/answer/a7437052?lang=en" },
    // Lead Gen Forms, and where the leads go afterwards
    { title: "Lead Gen Forms", url: "https://www.linkedin.com/help/lms/answer/a423447?lang=en" },
    { title: "Create Lead Gen Forms in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a427102?lang=en" },
    { title: "Create a Lead Gen Form – Best Practices", url: "https://www.linkedin.com/help/lms/answer/a421181?lang=en" },
    { title: "Lead Gen Form fields", url: "https://www.linkedin.com/help/lms/answer/a425337?lang=en" },
    { title: "Lead Gen Form hidden fields", url: "https://www.linkedin.com/help/lms/answer/a421421?lang=en" },
    { title: "Integrate Lead Gen Forms with your marketing automation or CRM platform", url: "https://www.linkedin.com/help/lms/answer/a425316?lang=en" },
    { title: "Troubleshoot Lead Gen Form third-party integrations", url: "https://www.linkedin.com/help/lms/answer/a426297?lang=en" },
    { title: "View and download leads, metrics, and analytics for Lead Gen Form ad sets", url: "https://www.linkedin.com/help/lms/answer/a425750?lang=en" },
    { title: "Qualified leads optimization goal", url: "https://www.linkedin.com/help/lms/answer/a6553958?lang=en" },
    { title: "Lead Gen Forms Privacy Policy", url: "https://www.linkedin.com/help/lms/answer/a420012?lang=en" },
    { title: "Create a Lead Gen Form audience with Matched Audiences", url: "https://www.linkedin.com/help/lms/answer/a422179?lang=en" },
    // The Insight Tag, which is the part that gets installed on a real site
    { title: "LinkedIn Insight Tag", url: "https://www.linkedin.com/help/lms/answer/a489169?lang=en" },
    { title: "Create and manage your Insight Tag", url: "https://www.linkedin.com/help/lms/answer/a415868?lang=en" },
    { title: "Add the LinkedIn Insight Tag to your website", url: "https://www.linkedin.com/help/lms/answer/a418880?lang=en" },
    { title: "Add the LinkedIn site-wide Insight Tag to Google Tag Manager", url: "https://www.linkedin.com/help/lms/answer/a416960?lang=en" },
    { title: "Enable first-party cookies on your LinkedIn Insight Tag", url: "https://www.linkedin.com/help/lms/answer/a423304?lang=en" },
    { title: "Troubleshoot the LinkedIn Insight Tag", url: "https://www.linkedin.com/help/lms/answer/a425696?lang=en" },
    // Conversion tracking
    { title: "Get started with LinkedIn Conversion Tracking", url: "https://www.linkedin.com/help/lms/answer/a420536?lang=en" },
    { title: "Conversion tracking event types on LinkedIn", url: "https://www.linkedin.com/help/lms/answer/a528686?lang=en" },
    { title: "Set up Conversion Tracking for Insight Tag conversions", url: "https://www.linkedin.com/help/lms/answer/a425606?lang=en" },
    { title: "Understanding Website Actions", url: "https://www.linkedin.com/help/lms/answer/a1377941?lang=en" },
    { title: "Deduplication for Conversion Tracking", url: "https://www.linkedin.com/help/lms/answer/a5967630?lang=en" },
    { title: "LinkedIn conversion values", url: "https://www.linkedin.com/help/lms/answer/a7494346?lang=en" },
    { title: "Using modeled conversions to measure conversions for LinkedIn Ads", url: "https://www.linkedin.com/help/lms/answer/a546228?lang=en" },
    { title: "Troubleshoot Insight Tag conversions", url: "https://www.linkedin.com/help/lms/answer/a422796?lang=en" },
    // The Conversions API and the CRM loop — the claim the door's blurb makes
    { title: "LinkedIn Conversions API", url: "https://www.linkedin.com/help/lms/answer/a1655394?lang=en" },
    { title: "Set up a Conversions API integration in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a1657171?lang=en" },
    { title: "Conversions API setup in Campaign Manager best practices", url: "https://www.linkedin.com/help/lms/answer/a5538676?lang=en" },
    { title: "Troubleshoot Conversions API signal quality", url: "https://www.linkedin.com/help/lms/answer/a5938392?lang=en" },
    { title: "Create conversions with Conversions API and Google Tag Manager", url: "https://www.linkedin.com/help/lms/answer/a1718034?lang=en" },
    { title: "Set up and create conversions using Direct API", url: "https://www.linkedin.com/help/lms/answer/a1711116?lang=en" },
    { title: "Create a conversion with a CSV file upload", url: "https://www.linkedin.com/help/lms/answer/a1716039?lang=en" },
    { title: "Set up HubSpot integration to send conversion data to Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a6888207?lang=en" },
    { title: "Connect Salesforce CRM to Business Manager", url: "https://www.linkedin.com/help/lms/answer/a7480664?lang=en" },
    { title: "Connect HubSpot CRM to Business Manager", url: "https://www.linkedin.com/help/lms/answer/a7479660?lang=en" },
    { title: "Use CRM Sync to share CRM data from Business Manager for use in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a7477297?lang=en" },
    // Attribution and reporting — where the closed loop is read back
    { title: "LinkedIn conversion attribution model", url: "https://www.linkedin.com/help/lms/answer/a426349?lang=en" },
    { title: "LinkedIn conversion window", url: "https://www.linkedin.com/help/lms/answer/a426359?lang=en" },
    { title: "LinkedIn Conversion Tracking reporting and metrics", url: "https://www.linkedin.com/help/lms/answer/a422513?lang=en" },
    { title: "Attribution Model metrics for leads and conversions in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a7132084?lang=en" },
    { title: "Conversions and leads metrics in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a420212?lang=en" },
    { title: "Lead Funnel metrics in Campaign Manager", url: "https://www.linkedin.com/help/lms/answer/a7134581?lang=en" },
    { title: "Campaign Manager reporting dashboard", url: "https://www.linkedin.com/help/lms/answer/a447152?lang=en" },
    { title: "Compare Campaign Manager conversions with third-party reporting", url: "https://www.linkedin.com/help/lms/answer/a420207?lang=en" },
    { title: "Revenue Attribution Report in Business Manager", url: "https://www.linkedin.com/help/lms/answer/a1459789?lang=en" },
  ],
};

/**
 * Door 5. LinkedIn's own developer documentation, which LinkedIn publishes on
 * Microsoft Learn, and nothing else: no blog, no agency write-up, nothing
 * behind a login. Every URL here was fetched and read before it was written
 * down. The locale sits in the path (`/en-us/`) rather than in a query
 * parameter, so these URLs are already pinned to the language the agent
 * answers in — the same job `hl=en` and `lang=en` do above.
 *
 * What this corpus is FOR is the whole of the door. A visitor asks "can you
 * automate this", and an honest answer has two halves: what LinkedIn publishes
 * an interface for, and whether a particular automation is permitted where the
 * visitor is. Only the first half is documentation. So the corpus is the
 * permissions and partner-programme pages, the OAuth flows, what an
 * integration has to handle, and the interfaces that touch invitations,
 * messages, connections and posting — the three permissions open to any
 * developer, and the many that are not.
 *
 * LinkedIn's User Agreement, its Professional Community Policies and its help
 * pages about third-party software are deliberately absent, and that absence
 * is the door. This agent may never say whether an automation is permitted; a
 * corpus of prohibitions is what would make it answer that question anyway, in
 * the house voice, with a working link. That question is the lawyer's written
 * assessment, which is not ours and is not on this shelf. LinkedIn's
 * advertising pages are absent for a plainer reason: they are the LinkedIn Ads
 * door's subject and its own corpus already reads them.
 *
 * This corpus cannot be fetched by this script as it stands, and the parcel
 * report hands that back. `extractArticleBody` picks its article container by
 * host and knows two, both Google's; on this host the article body is the
 * second `<div class="content">` — the first wraps the h1 alone, and is short
 * enough to be dropped as furniture — so the container has to be chosen by
 * length rather than by first match. The file on disk was built off this exact
 * list with that change applied outside the repo. Until it lands here,
 * `npm run kb:fetch -- linkedin-automation` fetches nothing and leaves the
 * corpus exactly as it is, which is this script's documented behaviour and is
 * why the door keeps answering in the meantime.
 */
const LINKEDIN_AUTOMATION: Corpus = {
  namespace: "linkedin-automation",
  file: "kb.linkedin-automation.json",
  label: "LinkedIn automation — learn.microsoft.com/linkedin (LinkedIn's own API documentation)",
  htmlPages: [
    // Who is allowed to call anything at all. The first page is the one the
    // door's corrected blurb rests on: sign-in, email and posting as the member
    // are the only permissions LinkedIn gives out without approval.
    { title: "Getting Access to LinkedIn APIs", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access" },
    { title: "Authenticating with OAuth 2.0 Overview", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication" },
    { title: "LinkedIn 3-Legged OAuth Flow", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow" },
    { title: "LinkedIn 2-Legged OAuth Flow", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/client-credentials-flow" },
    { title: "Refresh Tokens with OAuth 2.0", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens" },
    { title: "Token Introspection", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/token-introspection" },
    { title: "Application Secret Management", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/application-secret-management" },
    { title: "Developer Portal Tools", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/developer-portal-tools" },
    // The interfaces a buyer asks about by name: sending an invitation,
    // sending a message, reading connections and a profile. Every one of them
    // says on its own page what it is restricted to, which is the fact the
    // agent is allowed to state — and it is not the same fact as "permitted".
    { title: "Invitations API", url: "https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations" },
    { title: "Messages API", url: "https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages" },
    { title: "Connections API", url: "https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api" },
    { title: "Profile API", url: "https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api" },
    // The self-serve surface, in full. It is small, and a visitor is entitled
    // to see how small before anyone scopes a build.
    { title: "Share on LinkedIn", url: "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin" },
    { title: "Sign In with LinkedIn using OpenID Connect", url: "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2" },
    { title: "LinkedIn Consumer Solutions Platform", url: "https://learn.microsoft.com/en-us/linkedin/consumer/" },
    // Where programmatic access to messages, invitations and a member's
    // network actually lives: a partner programme, an approval and a signed
    // API agreement. Named so the agent can say what the route is instead of
    // guessing whether there is one.
    { title: "LinkedIn Compliance Solutions", url: "https://learn.microsoft.com/en-us/linkedin/compliance/" },
    { title: "Compliance APIs Overview", url: "https://learn.microsoft.com/en-us/linkedin/compliance/compliance-api/overview" },
    { title: "Compliance FAQ", url: "https://learn.microsoft.com/en-us/linkedin/compliance/compliance-api/compliance-faq" },
    { title: "Compliance API Request Limits and Patterns", url: "https://learn.microsoft.com/en-us/linkedin/compliance/request-limits-and-patterns" },
    { title: "Compliance Events API", url: "https://learn.microsoft.com/en-us/linkedin/compliance/integrations/compliance-events/" },
    { title: "Messages Compliance Events", url: "https://learn.microsoft.com/en-us/linkedin/compliance/integrations/compliance-events/resource-references/messages" },
    { title: "Invitations Compliance Events", url: "https://learn.microsoft.com/en-us/linkedin/compliance/integrations/compliance-events/resource-references/invitations" },
    { title: "Sales Navigator Application Platform Documentation", url: "https://learn.microsoft.com/en-us/linkedin/sales/" },
    // What an integration has to handle. This is the half that makes a scope a
    // scope rather than a wish: paging, throttles, versions, errors, webhooks.
    { title: "LinkedIn API Concepts", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts" },
    { title: "LinkedIn API Request Methods", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/methods" },
    { title: "LinkedIn API Data Formats", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/data-formats" },
    { title: "LinkedIn API URNs and IDs", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/urns" },
    { title: "Field Projections", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/projections" },
    { title: "LinkedIn API Pagination", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/pagination" },
    { title: "LinkedIn API Rate Limiting", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits" },
    { title: "LinkedIn API Error Handling", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/error-handling" },
    { title: "LinkedIn API Protocol Versions", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/protocol-version" },
    { title: "LinkedIn API Response Decoration", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/decoration" },
    { title: "LinkedIn API Query Tunneling", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/query-tunneling" },
    { title: "Webhooks", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/webhook-validation" },
    // What happens to the code after the client is operating it, which is the
    // question a hand-over makes unavoidable.
    { title: "Best Practices Overview", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/best-practices/overview" },
    { title: "Best Practices for Application Development", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/best-practices/application-development" },
    { title: "Best Practices for Secure Applications", url: "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/best-practices/secure-applications" },
    { title: "LinkedIn API Breaking Change Policy", url: "https://learn.microsoft.com/en-us/linkedin/shared/breaking-change-policy" },
    { title: "LinkedIn API Partner Support", url: "https://learn.microsoft.com/en-us/linkedin/shared/linkedin-api-partner-support-guide" },
  ],
};

/**
 * Door 7. OpenAI's own API documentation for the work this door sells: an
 * agent that retrieves from a body of files and cites them, function calling
 * that writes into a system the model does not own, and GPT Actions —
 * including the no-authentication option, which is the platform fact behind
 * a custom AI that runs without a login. Markdown twins, same as door 1.
 *
 * Pricing pages, model-comparison pages and cost calculators are deliberately
 * absent: this door is sold as "custom", a person names the figure, and a
 * corpus is what an agent is allowed to say. ChatGPT Ads pages are absent
 * because they are door 1's subject and its own corpus already reads them.
 *
 * being.marketing is not in this list. It is a Gumroad store that renders
 * client-side; this fetcher would index the empty shell. What is sold there
 * was read in the browser before the agent persona was written, and lives
 * on the agent, not in the retrieved excerpts.
 */
const AI_BUILDS: Corpus = {
  namespace: "ai-builds",
  file: "kb.ai-builds.json",
  label: "Custom AI builds — developers.openai.com/api/docs",
  markdownPages: [
    // Retrieval and citation — the first starter on the door.
    { title: "File search", url: "https://developers.openai.com/api/docs/guides/tools-file-search.md" },
    { title: "Retrieval", url: "https://developers.openai.com/api/docs/guides/retrieval.md" },
    { title: "Citation Formatting", url: "https://developers.openai.com/api/docs/guides/citation-formatting.md" },
    { title: "Vector embeddings", url: "https://developers.openai.com/api/docs/guides/embeddings.md" },
    { title: "Web QA with embeddings", url: "https://developers.openai.com/api/docs/tutorials/web-qa-embeddings.md" },
    { title: "File inputs", url: "https://developers.openai.com/api/docs/guides/file-inputs.md" },
    { title: "Optimizing LLM Accuracy", url: "https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy.md" },
    // Write-back — the CRM starter. The model proposes a call; the client's
    // code executes it. That split is the whole of an honest answer.
    { title: "Function calling", url: "https://developers.openai.com/api/docs/guides/function-calling.md" },
    { title: "Using tools", url: "https://developers.openai.com/api/docs/guides/tools.md" },
    { title: "GPT Actions", url: "https://developers.openai.com/api/docs/actions/introduction.md" },
    { title: "Getting started with GPT Actions", url: "https://developers.openai.com/api/docs/actions/getting-started.md" },
    { title: "GPT Action authentication", url: "https://developers.openai.com/api/docs/actions/authentication.md" },
    { title: "Data retrieval with GPT Actions", url: "https://developers.openai.com/api/docs/actions/data-retrieval.md" },
    { title: "Production notes on GPT Actions", url: "https://developers.openai.com/api/docs/actions/production.md" },
    { title: "Sending and returning files with GPT Actions", url: "https://developers.openai.com/api/docs/actions/sending-files.md" },
    { title: "GPT Actions library", url: "https://developers.openai.com/api/docs/actions/actions-library.md" },
    { title: "MCP and Connectors", url: "https://developers.openai.com/api/docs/guides/tools-connectors-mcp.md" },
    // What a production build has to survive, and whose data it is.
    { title: "Data controls in the OpenAI platform", url: "https://developers.openai.com/api/docs/guides/your-data.md" },
    { title: "Production best practices", url: "https://developers.openai.com/api/docs/guides/production-best-practices.md" },
    { title: "Rate limits", url: "https://developers.openai.com/api/docs/guides/rate-limits.md" },
    { title: "Streaming API responses", url: "https://developers.openai.com/api/docs/guides/streaming-responses.md" },
    { title: "Structured model outputs", url: "https://developers.openai.com/api/docs/guides/structured-outputs.md" },
    // Completions and Conversation state are deliberately absent: both
    // pages print the same sample twice, and the retrieval test keys a
    // chunk by url+heading+text, so a duplicate fails the count. This
    // panel's use of Chat Completions is stated on the agent, which is
    // a fact about this codebase rather than a citation. The Assistants
    // migration page is here so the agent can say that API is retired
    // rather than recommending it from memory.
    { title: "Assistants migration guide", url: "https://developers.openai.com/api/docs/assistants/migration.md" },
    { title: "Agents SDK", url: "https://developers.openai.com/api/docs/guides/agents.md" },
  ],
};

/**
 * Our own Ad Grants material, not Google's. Case studies, templates, tricks,
 * vertical pages and what the tool on adgrant.ai actually takes. The ad-grants
 * corpus above is support.google.com; putting this in that file would let the
 * agent cite our practice as Google's rule.
 *
 * `extractArticleBody` does not yet know this host, so `kb:fetch` leaves
 * data/kb/kb.adgrant-ai.json untouched — the hand-written file on disk. The
 * URL list is the registry of what that file is for.
 */
const ADGRANT_AI: Corpus = {
  namespace: "adgrant-ai",
  file: "kb.adgrant-ai.json",
  label: "AdGrant.AI — our own Ad Grants material (adgrant.ai), not Google's documentation",
  htmlPages: [
    { title: "AdGrant.AI", url: "https://adgrant.ai/" },
    { title: "Ad Grant Glossary", url: "https://adgrant.ai/glossary" },
    { title: "Case Studies", url: "https://adgrant.ai/case-studies" },
    { title: "Tips & Tricks", url: "https://adgrant.ai/tricks" },
    { title: "Starter Templates", url: "https://adgrant.ai/templates" },
    { title: "Nonprofit verticals", url: "https://adgrant.ai/nonprofits" },
    { title: "How a Homeless Shelter Structures Its Google Ad Grant Account", url: "https://adgrant.ai/case-studies/homeless-shelter-google-ad-grant-structure" },
    { title: "Avoid Account Suspension from the Google Ad Grant 5% CTR Rule", url: "https://adgrant.ai/tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule" },
    { title: "Maximize Conversions Bidding for Google Ad Grants Explained", url: "https://adgrant.ai/glossary/maximize-conversions-bidding-google-ad-grants" },
  ],
};

/**
 * The lawyer's corpus, and the only one on this list that is not a product's
 * documentation.
 *
 * WHAT IS IN IT: the documents that actually answer "are we allowed to do
 * this". For the questions this agent gets, that is almost never a statute —
 * whether you may send automated connection invitations is answered by
 * LinkedIn's own User Agreement and its own list of prohibited software, and
 * whether a competitor's brand may appear in ad copy is answered by Google's
 * own trademark policy. Platform rules first, because platform rules are what
 * gets an account closed.
 *
 * WHAT IS DELIBERATELY NOT IN IT: the text of the GDPR, national marketing
 * law, and anything else a licensed opinion is written from. Not because it is
 * unimportant but because an agent retrieving three paragraphs of a regulation
 * and answering from them is doing the one thing the agent's own prompt says
 * it does not do. The two regulator pages that ARE here are guidance written
 * for practitioners about consent and unsolicited email, which is the level
 * this agent operates at.
 *
 * SOME OF THESE PAGES MAY REFUSE THE FETCHER. LinkedIn's legal pages in
 * particular are served to browsers, not to scripts. That is survivable and
 * documented: this script leaves a corpus exactly as it is when a page fails,
 * so a partial corpus is a smaller corpus rather than a broken one — and the
 * agent's grounding rule means it says what is missing instead of inventing
 * the page it could not read.
 */
const LEGAL: Corpus = {
  namespace: "legal",
  file: "kb.legal.json",
  label: "What the platforms and regulators publish about what is permitted",
  htmlPages: [
    // LinkedIn: the four documents every automation question lands on.
    { title: "LinkedIn User Agreement", url: "https://www.linkedin.com/legal/user-agreement" },
    { title: "LinkedIn Professional Community Policies", url: "https://www.linkedin.com/legal/professional-community-policies" },
    { title: "LinkedIn API Terms of Use", url: "https://www.linkedin.com/legal/l/api-terms-of-use" },
    { title: "LinkedIn Privacy Policy", url: "https://www.linkedin.com/legal/privacy-policy" },
    /*
     * THE PAGE THAT ANSWERS THE AGENT'S OWN FIRST STARTER. Without it, "can we
     * send connection invitations automatically" retrieved three copies of the
     * Privacy Policy's "How We Use Your Data" — the User Agreement's real
     * answer is in its Dos and Don'ts, which forbids "software, devices,
     * scripts, robots ... or other means or processes", and lexical retrieval
     * does not connect the word a buyer types to the words a contract uses.
     * This page says "automated" and "prohibited" in the same paragraph, which
     * is the vocabulary the question arrives in.
     */
    { title: "LinkedIn: Prohibited software and extensions", url: "https://www.linkedin.com/help/linkedin/answer/a1341387" },
    /* The API-permission half — who may call the Invitations and Messages APIs,
       and what the partner programme is — is NOT in this corpus. Those pages
       are on learn.microsoft.com and render client-side, and the agent's prompt
       handles it the honest way instead: endpoint-level questions go to
       @linkedin-automation, whose own corpus is that documentation. The four
       LinkedIn documents above are the PERMISSION documents, which is this
       agent's subject. */
    // Google: the advertising policies, and the two that end an account.
    { title: "Google Ads policies overview", url: "https://support.google.com/adspolicy/answer/6008942" },
    { title: "Google Ads: Misrepresentation", url: "https://support.google.com/adspolicy/answer/6020955" },
    { title: "Google Ads: Trademarks", url: "https://support.google.com/adspolicy/answer/6118" },
    { title: "Google Ads: Circumventing systems", url: "https://support.google.com/adspolicy/answer/6020954" },
    /* The Ad Grants policy guide is deliberately absent: support.google.com
       serves /grants/ pages to this script as a shell. The same policies are
       already in the ad-grants corpus, fetched from the /nonprofits/ host,
       which does serve them. */
    { title: "Google Ads API Terms and Conditions", url: "https://developers.google.com/google-ads/api/terms" },
    // Meta, for the platform terms a build has to agree with.
    /* Meta is absent on purpose. developers.facebook.com/terms answers 400 to
       anything that is not a browser, and transparency.meta.com renders its
       policies client-side, so a fetch returns the shell. Neither is a page
       this script can honestly index, and an agent is better with a gap it
       reports than with a page it half-read. */
    // The regulators, at the level a practitioner reads: consent, and email.
    { title: "EDPB Guidelines 05/2020 on consent under the GDPR", url: "https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en" },
    { title: "FTC: CAN-SPAM Act Compliance Guide for Business", url: "https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business" },
    { title: "ICO: Electronic and telephone marketing", url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/" },
  ],
};

export /**
 * Door: the paid-ads door's Meta half. The one platform this company sells that
 * had an agent row and no corpus at all — meta-ads has existed in
 * shared/roster.ts with useKb false since it was written.
 *
 * TWO TRAPS, both found by measurement rather than by reading:
 *
 * The base path is /documentation/ads-commerce/, not /docs/marketing-api/. The
 * second returns 404 behind a ~179KB single-page-app shell, which fetchText
 * rejects — a warning line in an otherwise green build.
 *
 * And the host CONTENT-NEGOTIATES ON Accept. With the markdown accept header
 * fetchText sends, these URLs return raw markdown opening "# Heading". With
 * text/html — what the article fetcher sends — the same URL returns an HTML
 * shell. So these are markdownPages, and they must stay markdownPages.
 *
 * Enumerated rather than indexed: parseIndex only expands developers.openai.com
 * paths, so an `index:` here would expand to nothing.
 *
 * WHAT THIS CORPUS CANNOT ANSWER, and the agent's prompt says so: Meta's
 * advertiser-facing help — Ads Manager labels, Advertising Standards, "should we
 * use Advantage+ or manual" — is not here. That material is not on a host this
 * fetcher can read. The agent answers the API to the parameter and refuses the
 * interface, which is the honest shape of what we can ground.
 */
const META_ADS: Corpus = {
  namespace: "meta-ads",
  file: "kb.meta-ads.json",
  label: "Meta Ads — developers.facebook.com/documentation/ads-commerce",
  markdownPages: [
    { title: "Conversions API", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api.md" },
    { title: "Conversions API: Get Started", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started.md" },
    { title: "Conversions API: Using the API", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api.md" },
    { title: "Conversions API: Verifying Your Setup", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/verifying-setup.md" },
    { title: "Conversions API: Best Practices", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/best-practices.md" },
    { title: "Handling Duplicate Pixel and Conversions API Events", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events.md" },
    { title: "Server Event Parameters", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event.md" },
    { title: "Customer Information Parameters", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters.md" },
    { title: "Custom Data Parameters", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/custom-data.md" },
    { title: "Sending Offline Events Using the Conversions API", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/offline-events.md" },
    { title: "Conversions API End-to-End Implementation", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/guides/end-to-end-implementation.md" },
    { title: "Dataset Quality API", url: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/dataset-quality-api.md" },
    { title: "Marketing API Overview", url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview.md" },
    { title: "Get Started with the Marketing API", url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started.md" },
    { title: "Marketing API Rate Limiting", url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting.md" },
    { title: "Advantage+ Campaign Experience", url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns.md" },
    { title: "Advantage+ Shopping Campaigns", url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-shopping-campaigns.md" },
    { title: "Lead Ads", url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads.md" },
  ],
};

/**
 * Shopping feeds, and the only corpus here that adds knowledge the shelf does
 * not already hold in some other shape.
 *
 * THE GAP, MEASURED: there are zero support.google.com/merchants URLs across
 * every document on the shelf. The google-ads corpus has Shopping-adjacent
 * pages and not one line of the product data specification, so "What product
 * attributes are required in the feed?" came back with "Monitor and optimize
 * your Shopping campaigns" — a page that does not answer it. Shopping is a
 * third of this door's own pitch.
 *
 * No extractor work: support.google.com is already in ARTICLE_CONTAINERS and
 * /merchants matches it by host.
 *
 * THE IDS BELOW ARE THE POST-REDIRECT ONES. 6324454 is a 404, and 188494,
 * 2948694, 188478, 7439058 and 6098295 each 301 onto a page already in this
 * list — 188494 lands on the product data specification, which would have been
 * indexed twice under two titles. Hand-check any addition and de-duplicate by
 * FINAL url, the way the GOOGLE_ADS literal says.
 */
const MERCHANT_CENTER: Corpus = {
  namespace: "merchant-center",
  file: "kb.merchant-center.json",
  label: "Google Merchant Center — support.google.com/merchants",
  htmlPages: [
    { title: "Product data specification", url: "https://support.google.com/merchants/answer/7052112?hl=en" },
    { title: "Shipping [shipping]", url: "https://support.google.com/merchants/answer/6324484?hl=en" },
    { title: "Price [price]", url: "https://support.google.com/merchants/answer/6324371?hl=en" },
    { title: "Image link [image_link]", url: "https://support.google.com/merchants/answer/6324350?hl=en" },
    { title: "About unique product identifiers", url: "https://support.google.com/merchants/answer/160161?hl=en" },
    { title: "GTIN [gtin]", url: "https://support.google.com/merchants/answer/6324461?hl=en" },
    { title: "Availability [availability]", url: "https://support.google.com/merchants/answer/6324448?hl=en" },
    { title: "Issues in Merchant Center", url: "https://support.google.com/merchants/answer/12153802?hl=en" },
    { title: "How to upload your products to Merchant Center", url: "https://support.google.com/merchants/answer/11586438?hl=en" },
    { title: "Google product category [google_product_category]", url: "https://support.google.com/merchants/answer/6324436?hl=en" },
    { title: "Brand [brand]", url: "https://support.google.com/merchants/answer/6324351?hl=en" },
    { title: "Shipping weight [shipping_weight]", url: "https://support.google.com/merchants/answer/6324503?hl=en" },
    { title: "Set up custom attributes to use in attribute rules", url: "https://support.google.com/merchants/answer/14992797?hl=en" },
    { title: "How to fix: Missing or incorrect GTIN", url: "https://support.google.com/merchants/answer/14899834?hl=en" },
    { title: "Condition [condition]", url: "https://support.google.com/merchants/answer/6324469?hl=en" },
    { title: "Identifier exists [identifier_exists]", url: "https://support.google.com/merchants/answer/6324478?hl=en" },
    { title: "Description [description]", url: "https://support.google.com/merchants/answer/6324468?hl=en" },
    { title: "Title [title]", url: "https://support.google.com/merchants/answer/6324415?hl=en" },
    { title: "Link [link]", url: "https://support.google.com/merchants/answer/6324416?hl=en" },
    { title: "Sale price [sale_price]", url: "https://support.google.com/merchants/answer/6324471?hl=en" },
  ],
};

/** Exported for scripts/refresh-corpora.ts, which re-reads every one of them. */
export const CORPORA: Corpus[] = [CHATGPT_ADS, GOOGLE_ADS, AD_GRANTS, LINKEDIN_ADS, LINKEDIN_AUTOMATION, AI_BUILDS, ADGRANT_AI, LEGAL, META_ADS, MERCHANT_CENTER];
/* -------------------------------- chunking -------------------------------- */

const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 150;
/** A prose block this long gets split at line boundaries; a code block never does. */
const OVERSIZE_BLOCK_CHARS = TARGET_CHARS * 2;
/** ~7500 tokens, under the 8192-token per-input embedding limit. */
const MAX_EMBED_CHARS = 30_000;

interface Block {
  text: string;
  code: boolean;
}

interface Section {
  /** Heading trail, e.g. "Measurement Pixel > Deduplicate events". */
  heading: string;
  blocks: Block[];
}

/* ---------------------------------- CLI ----------------------------------- */

type Mode = "fetch" | "embed" | "all";

async function main(): Promise<void> {
  const mode = (process.argv[2] ?? "all") as Mode;
  if (mode !== "fetch" && mode !== "embed" && mode !== "all") {
    console.error("Usage: tsx scripts/build-kb.ts [fetch|embed|all] [namespace]");
    process.exitCode = 1;
    return;
  }

  const only = process.argv[3]?.trim();
  const corpora = only ? CORPORA.filter((corpus) => corpus.namespace === only) : CORPORA;
  if (corpora.length === 0) {
    console.error(`Unknown namespace "${only}". Known: ${CORPORA.map((c) => c.namespace).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const dir = resolveKbDir();
  await mkdir(dir, { recursive: true });

  if (mode === "fetch" || mode === "all") {
    for (const corpus of corpora) await runFetch(dir, corpus);
  }

  if (mode === "embed") {
    for (const corpus of corpora) await runEmbed(dir, corpus);
    return;
  }

  if (mode === "all") {
    if (!getClient()) {
      console.log("");
      console.log("OPENAI_API_KEY is not set, so the embedding step is skipped.");
      console.log("The knowledge bases are still usable: the server falls back to keyword retrieval.");
      console.log("Add a key and run `npm run kb:embed` to switch them to semantic search.");
      return;
    }
    for (const corpus of corpora) await runEmbed(dir, corpus);
  }
}

/* --------------------------------- fetch ---------------------------------- */

export interface CorpusFetchResult {
  namespace: string;
  file: string;
  read: Array<{ title: string; url: string }>;
  failed: Array<{ title: string; url: string; reason: string }>;
  /** True when nothing was fetched and the file on disk was left as it was. */
  leftUntouched: boolean;
  changed: boolean;
  documents: number;
  chunks: number;
  builtAt: string | null;
}

async function existingCorpusMeta(
  file: string,
): Promise<{ builtAt: string; documents: number; chunks: number } | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const builtAt = (parsed as { builtAt?: unknown }).builtAt;
    const documents = (parsed as { documents?: unknown }).documents;
    const chunks = (parsed as { chunks?: unknown }).chunks;
    if (typeof builtAt !== "string") return null;
    return {
      builtAt,
      documents: typeof documents === "number" ? documents : Array.isArray(chunks) ? chunks.length : 0,
      chunks: Array.isArray(chunks) ? chunks.length : 0,
    };
  } catch {
    return null;
  }
}

export async function runFetch(dir: string, corpus: Corpus): Promise<CorpusFetchResult> {
  console.log("");
  console.log(`[${corpus.namespace}] ${corpus.label}`);

  const chunks: KbChunk[] = [];
  const fetched: string[] = [];
  const read: CorpusFetchResult["read"] = [];
  const failed: CorpusFetchResult["failed"] = [];
  let failures = 0;
  const target = path.join(dir, corpus.file);
  const previous = await existingCorpusMeta(target);

  const markdownRefs = await collectMarkdownRefs(corpus);
  if (markdownRefs.length > 0) console.log(`  ${markdownRefs.length} markdown pages to fetch`);

  for (const ref of markdownRefs) {
    /*
     * DECODED, because a markdown twin is not always clean markdown.
     *
     * The HTML path decodes entities in four places; this one decoded nowhere,
     * and it did not matter while every markdown source here was OpenAI's, whose
     * twins carry none. Meta's do: "advertiser&#039;s" is in the first sentence
     * of conversions-api.md, and the pages carry thousands of them between
     * them — in headings as well as body text, so they reach chunk titles and
     * from there a citation a visitor reads.
     */
    const raw = await fetchText(ref.url);
    const markdown = raw === null ? null : decodeEntities(raw);
    if (!markdown) {
      failures += 1;
      failed.push({ title: ref.title, url: ref.url, reason: "could not be read" });
      continue;
    }
    fetched.push(markdown);

    const url = humanUrl(ref.url);
    const title = titleOf(markdown) ?? ref.title;
    const added = chunkDocument(markdown, title, url, chunks);
    read.push({ title, url: ref.url });
    console.log(`    ${title} — ${added} chunks`);
    await delay(REQUEST_DELAY_MS);
  }

  const htmlRefs = corpus.htmlPages ?? [];
  if (htmlRefs.length > 0) console.log(`  ${htmlRefs.length} HTML pages to fetch`);

  for (const ref of htmlRefs) {
    const page = await fetchArticle(ref);
    if (!page) {
      failures += 1;
      failed.push({ title: ref.title, url: ref.url, reason: "could not be read" });
      continue;
    }
    const added = chunkDocument(page.markdown, page.title, ref.url, chunks);
    read.push({ title: page.title, url: ref.url });
    console.log(`    ${page.title} — ${added} chunks`);
    await delay(REQUEST_DELAY_MS);
  }

  // llms-full.txt is the same pages concatenated. Fetching it last and keeping only
  // what the individual pages did not already cover gives us a safety net for a page
  // that 404'd, without indexing the whole corpus twice under a vaguer citation URL.
  if (corpus.full) {
    const full = await fetchText(corpus.full.url);
    if (full) {
      const covered = normalise(fetched.join("\n"));
      const spare: KbChunk[] = [];
      chunkDocument(full, corpus.full.title, corpus.full.url, spare);
      const unique = spare.filter((chunk) => !isCovered(chunk.text, covered));
      chunks.push(...unique);
      read.push({ title: corpus.full.title, url: corpus.full.url });
      console.log(`    ${corpus.full.title} — ${unique.length} chunks kept, ${spare.length - unique.length} already covered`);
    } else {
      failures += 1;
      failed.push({ title: corpus.full.title, url: corpus.full.url, reason: "could not be read" });
    }
  }

  // A corpus that fetched nothing keeps whatever is already on disk. The deploy
  // runs this on every push, and blanking a corpus that is answering questions
  // is worse than serving one that is a few days old.
  if (chunks.length === 0) {
    console.warn(`  nothing was fetched — ${corpus.file} left untouched`);
    return {
      namespace: corpus.namespace,
      file: corpus.file,
      read,
      failed,
      leftUntouched: true,
      changed: false,
      documents: previous?.documents ?? 0,
      chunks: previous?.chunks ?? 0,
      builtAt: previous?.builtAt ?? null,
    };
  }

  // `namespace` is written first and read back by server/ai/kb.ts, which loads
  // every corpus in data/kb/ and keeps each one under the name it declares here.
  // Nothing downstream infers a corpus from its filename.
  const file: KbFile = {
    namespace: corpus.namespace,
    builtAt: new Date().toISOString(),
    documents: new Set(chunks.map((chunk) => chunk.url)).size,
    chunks,
  };

  await writeFile(target, `${JSON.stringify(file, null, 1)}\n`, "utf8");

  console.log(`  wrote ${target}`);
  console.log(`  ${file.chunks.length} chunks from ${file.documents} documents`);
  if (failures > 0) console.log(`  ${failures} source(s) could not be fetched — see the warnings above`);

  return {
    namespace: corpus.namespace,
    file: corpus.file,
    read,
    failed,
    leftUntouched: false,
    changed:
      previous === null ||
      previous.builtAt !== file.builtAt ||
      previous.documents !== file.documents ||
      previous.chunks !== file.chunks.length,
    documents: file.documents,
    chunks: file.chunks.length,
    builtAt: file.builtAt,
  };
}

async function collectMarkdownRefs(corpus: Corpus): Promise<DocRef[]> {
  const byUrl = new Map<string, DocRef>();

  if (corpus.index) {
    const index = await fetchText(corpus.index);
    if (index) {
      for (const ref of parseIndex(index)) byUrl.set(ref.url, ref);
    } else {
      console.warn(`  ${corpus.index} could not be read — falling back to the pages named in this file`);
    }
  }
  for (const ref of corpus.markdownPages ?? []) {
    if (!byUrl.has(ref.url)) byUrl.set(ref.url, ref);
  }

  return [...byUrl.values()];
}

/** llms.txt lists every page as `- [Title](https://…/page.md): description`. */
function parseIndex(markdown: string): DocRef[] {
  const refs: DocRef[] = [];
  const pattern = /^-\s*\[([^\]]+)\]\((https:\/\/developers\.openai\.com\/ads\/[^)\s]+\.md)\)/gm;
  for (const match of markdown.matchAll(pattern)) {
    refs.push({ title: match[1].trim(), url: match[2] });
  }
  return refs;
}

async function fetchText(url: string): Promise<string | null> {
  const body = await fetchBody(url, "text/markdown, text/plain, */*");
  if (body === null) return null;

  // This host answers a missing page with its full single-page-app shell. Any
  // proxy that rewrites the status would otherwise land 400KB of HTML in the index.
  if (/^\s*<(!doctype|html)/i.test(body)) {
    console.warn(`    ${url} — HTML rather than Markdown, skipped`);
    return null;
  }
  if (body.trim().length < 200) {
    console.warn(`    ${url} — only ${body.trim().length} characters, skipped`);
    return null;
  }
  return body;
}

async function fetchBody(url: string, accept: string): Promise<string | null> {
  // Google negotiates the language of a documentation page from the caller, and
  // will happily answer in Japanese or Thai. A corpus in a language the agent is
  // not answering in retrieves nothing and cites a page the reader cannot read,
  // so English is asked for in the header as well as in every `hl=en` above.
  const headers = { "user-agent": USER_AGENT, accept, "accept-language": "en-US,en;q=0.9" };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch((err: unknown) => {
      // One timeout in a run of sixty pages is normal and means nothing about
      // the page; losing it from the corpus is a real gap. Retry once, then give up.
      if (attempt === 0) return undefined;
      console.warn(`    ${url} — request failed (${describe(err)}), skipped`);
      return null;
    });

    if (response === undefined) {
      await delay(REQUEST_DELAY_MS * 2);
      continue;
    }
    if (!response) return null;
    if (!response.ok) {
      console.warn(`    ${url} — HTTP ${response.status}, skipped`);
      return null;
    }
    return response.text();
  }
  return null;
}

function humanUrl(mdUrl: string): string {
  // Citations point at the page a visitor can open, not at its Markdown twin.
  return mdUrl.endsWith(".md") ? mdUrl.slice(0, -3) : mdUrl;
}

function titleOf(markdown: string): string | null {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : null;
}

/* --------------------------- html -> markdown ----------------------------- */

/**
 * Google publishes no `.md` twin and no llms.txt, so these pages are read as
 * HTML. Only the article body is kept: the surrounding chrome on a Google help
 * page is a product picker listing every Google product, and indexing it would
 * make every page match every query.
 *
 * The marker is matched as a literal, then `<div>` tags are balanced from there
 * to find the end. It is deliberately dumb — no HTML parser, no new dependency —
 * and every page it is pointed at was checked by hand before being written into
 * a corpus above.
 */
const ARTICLE_CONTAINERS: Array<{ host: string; marker: string; tag?: string }> = [
  { host: "support.google.com", marker: '<div class="article-content-container"' },
  /* There was briefly a second marker here for support.google.com, added
   * because a /grants/ page reported "no article body found". It was the wrong
   * diagnosis: that host serves THIS script a different document than it
   * serves a browser — USER_AGENT above says truthfully what this is, and the
   * page comes back as a shell. The marker matched an element of that shell and
   * produced 163 chunks whose entire text was "-", which is a third of the
   * corpus it went into. Removed, and the page removed with it. */
  { host: "developers.google.com", marker: '<div class="devsite-article-body' },
  /* learn.microsoft.com is not here either, and the same test settled it: the
   * page is 60KB, the word "Permissions" appears zero times in it, and the
   * article arrives after JavaScript. The <div class="content"> markers on it
   * hold a breadcrumb. The linkedin-automation corpus already carries a note
   * saying its own copy of these pages was built outside this repository. */
  // The documents that answer most of what the lawyer agent is asked. All three
  // are server-rendered and none of them is a <div>.
  { host: "linkedin.com/legal", marker: '<main role="main"', tag: "main" },
  /* The help centre, which has a precise container of its own. Narrower than
     <main> on purpose: <main> here also holds the help centre's own search box
     and its "related articles" rail. */
  { host: "linkedin.com/help", marker: '<div class="article-details-page"' },
  { host: "ftc.gov", marker: '<main role="main"', tag: "main" },
  { host: "edpb.europa.eu", marker: '<main class="page__body', tag: "main" },
  { host: "ico.org.uk", marker: "<main", tag: "main" },
];

/**
 * Below this, the fetch found the site's shell rather than the article — a
 * retired help-centre answer redirects to a generic landing page instead of
 * returning 404. Google's shortest real article here is a little over 300
 * characters, and it says something worth citing.
 */
const MIN_ARTICLE_CHARS = 250;

/**
 * A code sample longer than this is a full multi-file program, and the chunker
 * never splits code. It is dropped whole rather than truncated: half a program
 * in a citation reads as a complete one.
 */
const MAX_CODE_CHARS = 3000;

/** Interface furniture that sits inside the article body and answers nothing. */
const BOILERPLATE = [
  /^Was this helpful\?/i,
  /^How can we improve it\?/i,
  /^Need more help\?/i,
  /^Try these next steps:/i,
  /^Give feedback about this article/i,
  /^Except as otherwise noted, the content of this page is licensed/i,
  /^To view subtitles in your language, turn on YouTube captions/i,
  /^Send feedback\b/i,
];

interface Article {
  title: string;
  markdown: string;
}

async function fetchArticle(ref: DocRef): Promise<Article | null> {
  const html = await fetchBody(ref.url, "text/html, */*");
  if (html === null) return null;

  const bodies = extractArticleBodies(html, ref.url);
  if (bodies.length === 0) {
    console.warn(`    ${ref.url} — no article body found, skipped`);
    return null;
  }

  /* The first candidate that yields a real article. A page can match an early
     marker on a wrapper that holds a breadcrumb and nothing else, and the next
     marker is then the actual text — so shortness is a reason to try the next
     one, not a reason to give up. */
  let shortest = Number.POSITIVE_INFINITY;
  for (const body of bodies) {
    const markdown = htmlToMarkdown(body);
    if (markdown.length >= MIN_ARTICLE_CHARS) {
      return { title: articleTitle(html) ?? ref.title, markdown };
    }
    shortest = Math.min(shortest, markdown.length);
  }

  console.warn(`    ${ref.url} — only ${shortest} characters of article, skipped`);
  return null;
}

/**
 * Every container this host declares, in declaration order, for the caller to
 * try in turn.
 *
 * Plural because one marker per host was wrong twice over: support.google.com
 * serves two different article shells depending on which help centre a page is
 * in, and the hosts added for the lawyer's corpus wrap their text in <main>
 * rather than <div>, which the balancer could not follow at all. Both failures
 * looked identical from the outside — "no article body found" — which is the
 * kind of message that gets read as "the page is gone".
 */
function extractArticleBodies(html: string, url: string): string[] {
  const bodies: string[] = [];

  for (const container of ARTICLE_CONTAINERS) {
    if (!url.includes(container.host)) continue;

    const start = html.indexOf(container.marker);
    if (start < 0) continue;

    const open = html.indexOf(">", start);
    if (open < 0) continue;

    const tag = container.tag ?? "div";
    const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, "g");

    let depth = 0;
    let closed = false;
    for (const match of html.slice(start).matchAll(tags)) {
      depth += match[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        bodies.push(html.slice(open + 1, start + match.index));
        closed = true;
        break;
      }
    }
    // Unbalanced markup: take the rest of the document rather than nothing.
    if (!closed) bodies.push(html.slice(open + 1));
  }

  return bodies;
}

/**
 * `<title>` rather than the configured title, because it follows the page when
 * Google merges two articles and redirects one at the other — and a citation
 * whose title disagrees with the page it opens is a citation nobody trusts.
 */
function articleTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;

  const raw = decodeEntities(match[1]).replace(/\s+/g, " ").trim();

  // The developer docs title every page "Foo | Google Ads API | Google for
  // Developers". Keeping only "Foo" produces citations called "Introduction" and
  // "Campaigns", which tell a reader nothing about where they are about to land,
  // so the product is kept and the publisher dropped.
  if (/Google for Developers\s*$/i.test(raw)) {
    const parts = raw
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^Google for Developers$/i.test(part));
    const title = parts.slice(0, 2).join(" — ");
    return title.length > 0 ? title : null;
  }

  // "Foo - Google Ads Help", "Foo - Google for Nonprofits Help".
  const title = raw.replace(/\s+-\s+(Google|YouTube)[^-]*Help\s*$/i, "").trim();
  return title.length > 0 ? title : null;
}

function htmlToMarkdown(fragment: string): string {
  let html = fragment;

  // Comments, and everything that is script or furniture rather than prose.
  html = html.replace(/<!--[\s\S]*?-->/g, " ");
  html = html.replace(/<(script|style|noscript|svg|form|button|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // Google's developer docs print the same sample in six languages, one
  // <section> per language inside a <devsite-selector>. Six copies of one
  // program crowd out the prose that actually answers a question, so only the
  // first is kept.
  html = html.replace(/<devsite-selector\b[^>]*>([\s\S]*?)<\/devsite-selector>/gi, (_all, inner: string) => {
    const first = /<section\b[^>]*>([\s\S]*?)<\/section>/i.exec(inner);
    return first ? first[1] : inner;
  });

  // Code comes out before the tags are stripped, or its own angle brackets and
  // indentation are stripped with them.
  const code: string[] = [];
  html = html.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (_all, attrs: string, inner: string) => {
    const text = decodeEntities(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\s+$/, "");
    if (text.trim().length === 0 || text.length > MAX_CODE_CHARS) return "\n\n";
    const language = /syntax="([^"]+)"/i.exec(attrs)?.[1]?.toLowerCase() ?? "";
    code.push(`\`\`\`${language}\n${text}\n\`\`\``);
    return `\n\nCODEBLOCK${code.length - 1}ENDCODEBLOCK\n\n`;
  });

  html = html.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_all, level: string, inner: string) => {
    const text = plain(inner);
    return text ? `\n\n${"#".repeat(Number(level))} ${text}\n\n` : "\n\n";
  });

  html = html.replace(/<li\b[^>]*>/gi, "\n- ");
  html = html.replace(/<br\s*\/?>/gi, "\n");
  html = html.replace(/<\/(th|td)>/gi, " | ");
  html = html.replace(/<\/(tr|p|div|section|ul|ol|table|dl|dd|dt|blockquote|article)>/gi, "\n\n");

  let text = decodeEntities(html.replace(/<[^>]+>/g, ""));

  // Non-breaking spaces come out of these pages by the hundred and break the
  // tokenizer's word boundaries if they are left in.
  text = text.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+\|\s*$/, "").trimEnd())
    .join("\n");
  // Source indentation puts a newline between a list marker and its own text
  // ("<li>\n  <p>…"), which reads as an empty bullet followed by a stray line.
  text = text.replace(/\n-[ \t]*\n[ \t]*(?=\S)/g, "\n- ");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  text = text
    .split("\n\n")
    .filter((para) => !BOILERPLATE.some((pattern) => pattern.test(para.trim())))
    .join("\n\n");

  return text.replace(/CODEBLOCK(\d+)ENDCODEBLOCK/g, (_all, index: string) => code[Number(index)] ?? "");
}

/** Tag-free inline text, for a heading or a table cell. */
function plain(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  times: "×",
  middot: "·",
  bull: "•",
  reg: "®",
  copy: "©",
  trade: "™",
  deg: "°",
  euro: "€",
  pound: "£",
  laquo: "«",
  raquo: "»",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, digits: string) => safeCodePoint(Number(digits)))
    .replace(/&([a-z]+);/gi, (all, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? all);
}

function safeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/* -------------------------- markdown -> chunks ---------------------------- */

/**
 * Section headings that are navigation rather than content. A Google help page
 * ends with a "Related links" list of other article titles; indexed, that is a
 * short chunk made almost entirely of product words, which BM25 scores like a
 * dense match and ranks above the paragraph that answers the question. Asking
 * the Google Ads corpus about Performance Max and Search returned four of these
 * link lists in the top eight, and a citation has to open a page that says
 * something rather than a list of links to other pages.
 *
 * Deliberately short. "Next steps" is not in it: in the OpenAI documentation
 * that heading carries real instructions.
 */
const NAVIGATION_HEADINGS = new Set(["related links", "related link", "on this page"]);

function isNavigation(trail: string): boolean {
  const last = trail.split(">").pop()?.trim().toLowerCase() ?? "";
  return NAVIGATION_HEADINGS.has(last.replace(/[?:.!]+$/, ""));
}

/** Letters or digits, ignoring punctuation, markup leftovers and whitespace. */
function lettersIn(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/**
 * Below this a chunk is furniture rather than content. Set from the two sides:
 * the shortest real paragraph in these corpora is a one-line policy statement
 * of about sixty characters, and the fragments that got in were three.
 */
const MIN_CHUNK_LETTERS = 40;

function chunkDocument(markdown: string, title: string, url: string, into: KbChunk[]): number {
  const slug = slugFor(url);
  let added = 0;
  let thin = 0;

  for (const section of splitSections(markdown)) {
    if (isNavigation(headingTrail(title, section.heading))) continue;
    for (const text of chunkBlocks(section.blocks)) {
      /*
       * A CHUNK HAS TO SAY SOMETHING.
       *
       * This exists because of a real corpus: a marker aimed at a Google help
       * page matched the site's shell and wrote 163 chunks whose whole text was
       * "-". Nothing rejected them. They would have sat in a retrieval index
       * competing with real documents, and the agent grounded on that corpus
       * would have cited them by title.
       *
       * The extractor was fixed too, but a marker is a guess about somebody
       * else's markup and the next one can be wrong the same way. This is the
       * end of the pipe, where being wrong is cheap to catch: forty letters or
       * digits, which no navigation fragment has and no real paragraph lacks.
       */
      if (lettersIn(text) < MIN_CHUNK_LETTERS) {
        thin += 1;
        continue;
      }

      into.push({
        id: `${slug}#${added}`,
        title,
        url,
        heading: headingTrail(title, section.heading),
        text,
      });
      added += 1;
    }
  }

  if (thin > 0) console.warn(`    ${url} — ${thin} chunk(s) held no readable text and were dropped`);

  return added;
}

/**
 * A chunk id has to be stable and unique across a corpus, and short enough to
 * read in a log. Google's help centre numbers its articles, so `answer/6167118`
 * identifies one exactly; everything else falls back to the path.
 */
function slugFor(url: string): string {
  if (url.startsWith(DOCS_PREFIX)) return url.slice(DOCS_PREFIX.length) || "index";
  try {
    const parsed = new URL(url);
    const path2 = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return path2 || parsed.hostname;
  } catch {
    return url;
  }
}
function headingTrail(title: string, sectionHeading: string): string {
  if (!sectionHeading) return title;
  if (sectionHeading === title || sectionHeading.startsWith(`${title} > `)) return sectionHeading;
  return `${title} > ${sectionHeading}`;
}

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const trail: string[] = [];
  let buffer: string[] = [];
  let heading = "";
  let inFence = false;
  let fence = "";
  let inComment = false;

  const flush = (): void => {
    const blocks = toBlocks(buffer);
    if (blocks.length > 0) sections.push({ heading, blocks });
    buffer = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const fenceStart = /^\s*(```|~~~)/.exec(line);
    if (fenceStart) {
      if (!inFence) {
        inFence = true;
        fence = fenceStart[1];
      } else if (line.trim().startsWith(fence)) {
        inFence = false;
      }
      buffer.push(line);
      continue;
    }

    // A `#` inside a fenced block is a comment, not a heading.
    if (!inFence) {
      // MDX directives and the editorial notes left in these pages ("do not add
      // this field to the table without product approval") are not documentation
      // and must never reach a visitor as a cited excerpt.
      if (inComment) {
        if (line.includes("*/}")) inComment = false;
        continue;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith("{/*")) {
        if (!trimmed.includes("*/}")) inComment = true;
        continue;
      }

      const match = /^(#{1,6})\s+(.+)$/.exec(line);
      if (match) {
        flush();
        const depth = match[1].length;
        trail.length = Math.max(0, depth - 1);
        trail[depth - 1] = match[2].trim();
        heading = trail.filter(Boolean).join(" > ");
        continue;
      }
    }

    buffer.push(line);
  }

  flush();
  return sections;
}

/** Paragraphs, tables and fenced code blocks — the units a chunk is allowed to break on. */
function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let inFence = false;
  let fence = "";

  const flush = (code: boolean): void => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (!text) return;
    // Every page carries the same "Markdown versions are available…" blockquote.
    // It matches every query about markdown and answers none of them.
    if (!code && text.startsWith(">") && text.includes("llms.txt")) return;
    blocks.push({ text, code });
  };

  for (const line of lines) {
    const fenceMark = /^\s*(```|~~~)/.exec(line);
    if (fenceMark) {
      if (!inFence) {
        flush(false);
        inFence = true;
        fence = fenceMark[1];
        buffer.push(line);
      } else {
        buffer.push(line);
        if (line.trim().startsWith(fence)) {
          flush(true);
          inFence = false;
        }
      }
      continue;
    }

    if (!inFence && line.trim() === "") {
      flush(false);
      continue;
    }
    buffer.push(line);
  }

  flush(inFence);
  return blocks.flatMap(expand);
}

/** A very long prose block or table is split at line boundaries; code is left whole. */
function expand(block: Block): Block[] {
  if (block.code || block.text.length <= OVERSIZE_BLOCK_CHARS) return [block];

  const out: Block[] = [];
  let buffer: string[] = [];
  let length = 0;
  for (const line of block.text.split("\n")) {
    if (length > 0 && length + line.length > TARGET_CHARS) {
      out.push({ text: buffer.join("\n"), code: false });
      buffer = [];
      length = 0;
    }
    buffer.push(line);
    length += line.length + 1;
  }
  if (buffer.length > 0) out.push({ text: buffer.join("\n"), code: false });
  return out;
}

function chunkBlocks(blocks: Block[]): string[] {
  const chunks: string[] = [];
  let current: Block[] = [];
  let length = 0;
  /** Characters of `current` carried over from the previous chunk as overlap. */
  let carried = 0;

  const flush = (): void => {
    if (length <= carried) return; // overlap only — nothing new to say
    const text = current.map((block) => block.text).join("\n\n").trim();
    if (text) chunks.push(text);
  };

  for (const block of blocks) {
    const cost = block.text.length + 2;
    if (length > carried && length + cost > TARGET_CHARS) {
      flush();
      current = overlapTail(current);
      carried = current.reduce((sum, block2) => sum + block2.text.length + 2, 0);
      length = carried;
    }
    current.push(block);
    length += cost;
  }

  flush();
  return chunks;
}

/**
 * Overlap is prose only. A code fence repeated across two chunks reads as two
 * different snippets, and a citation has to point at exactly one of them — which is
 * also why an oversized code block gets a chunk to itself rather than being split.
 */
function overlapTail(blocks: Block[]): Block[] {
  const tail: Block[] = [];
  let total = 0;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.code) break;
    if (total + block.text.length > OVERLAP_CHARS) break;
    tail.unshift(block);
    total += block.text.length;
  }
  return tail;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Containment test by probe: chunk boundaries differ between the per-page files and
 * the concatenated export, so comparing whole chunks would miss. 300 normalised
 * characters is specific enough that a false positive is not a realistic worry.
 */
function isCovered(text: string, covered: string): boolean {
  const probe = normalise(text).slice(0, 300);
  return probe.length >= 60 && covered.includes(probe);
}

/* --------------------------------- embed ---------------------------------- */

/** Vectors live beside their corpus: kb.json -> kb.embeddings.json. */
function embeddingsFileFor(corpus: Corpus): string {
  return corpus.file.replace(/\.json$/, ".embeddings.json");
}

async function runEmbed(dir: string, corpus: Corpus): Promise<void> {
  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set — embedding needs a key. Retrieval works without one, in keyword mode.");
  }

  const source = path.join(dir, corpus.file);
  const kb = await readKb(source);
  console.log("");
  console.log(`[${corpus.namespace}] embedding ${kb.chunks.length} chunks from ${source} with ${EMBED_MODEL}`);

  const inputs = kb.chunks.map((chunk) => prepareForEmbedding(chunk));

  let vectors: number[][];
  let totalTokens: number;
  try {
    // Nobody is waiting on this, so retry generously rather than losing a long run
    // to one 429. Batches go out one at a time for the same reason.
    const result = await embedTexts(client, inputs, {
      maxRetries: 4,
      timeoutMs: 120_000,
      onProgress: (done, total) => {
        const batches = Math.ceil(total / EMBED_BATCH_SIZE);
        const batch = Math.ceil(done / EMBED_BATCH_SIZE);
        console.log(`  batch ${batch}/${batches} — ${done}/${total} chunks`);
      },
    });
    vectors = result.vectors;
    totalTokens = result.totalTokens;
  } catch (err) {
    const failure = classifyLlmError(err, EMBED_MODEL);
    throw new Error(`embedding failed (${failure.kind}) — nothing was written, re-run when it is resolved`);
  }

  if (vectors.length !== kb.chunks.length) {
    throw new Error(`expected ${kb.chunks.length} vectors, got ${vectors.length} — nothing was written`);
  }

  const file: KbEmbeddingsFile = {
    model: EMBED_MODEL,
    dims: vectors[0].length,
    builtAt: kb.builtAt,
    vectors,
  };

  const target = path.join(dir, embeddingsFileFor(corpus));
  await writeFile(target, JSON.stringify(file), "utf8");

  console.log(`  wrote ${target}`);
  console.log(`  ${vectors.length} vectors of ${file.dims} dimensions`);
  console.log(`  ${totalTokens.toLocaleString("en-US")} tokens billed`);
}

async function readKb(file: string): Promise<KbFile> {
  const raw = await readFile(file, "utf8").catch(() => {
    throw new Error(`${file} does not exist — run \`npm run kb:fetch\` first`);
  });

  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as KbFile).chunks) ||
    typeof (parsed as KbFile).builtAt !== "string"
  ) {
    throw new Error(`${file} is not a knowledge base file — rebuild it with \`npm run kb:fetch\``);
  }

  const kb = parsed as KbFile;
  if (kb.chunks.length === 0) throw new Error(`${file} has no chunks — rebuild it with \`npm run kb:fetch\``);
  return kb;
}

/**
 * Vectors are aligned to chunks by array index, so every chunk must produce exactly
 * one input. The API rejects an empty string, hence the heading fallback.
 */
function prepareForEmbedding(chunk: KbChunk): string {
  const text = chunk.text.trim();
  if (!text) {
    console.warn(`  ${chunk.id} has no text — embedding its heading instead`);
    return chunk.heading || chunk.title;
  }
  if (text.length > MAX_EMBED_CHARS) {
    console.warn(`  ${chunk.id} is ${text.length} characters — truncated to ${MAX_EMBED_CHARS} for embedding`);
    return text.slice(0, MAX_EMBED_CHARS);
  }
  return text;
}
/* --------------------------------- utils ---------------------------------- */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  if (/(^|[\\/])build-kb\.(ts|js)$/.test(entry)) return true;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    console.error(`\nbuild-kb failed: ${describe(err)}`);
    process.exitCode = 1;
  });
}
