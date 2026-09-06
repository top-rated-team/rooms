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
 * door's documentation. The namespace is written into each file; how the server
 * uses it, and what still has to change there before a second door can be set
 * live, is in docs/doors.md under "What a live door actually needs".
 *
 * Every file is rewritten whole, so every mode is safe to re-run, and a corpus
 * that fetches nothing is left exactly as it was rather than being emptied —
 * the deploy runs this on every push and must never be able to blank a corpus
 * that is already serving answers.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
interface Corpus {
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

const CORPORA: Corpus[] = [CHATGPT_ADS, GOOGLE_ADS, AD_GRANTS];
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

/**
 * A corpus file carries its own namespace so nothing downstream has to guess it
 * from a filename. `KbFile` itself is the server's type and does not know about
 * namespaces yet — see docs/doors.md for what still has to change there.
 */
interface NamespacedKbFile extends KbFile {
  namespace: string;
}

async function runFetch(dir: string, corpus: Corpus): Promise<void> {
  console.log("");
  console.log(`[${corpus.namespace}] ${corpus.label}`);

  const chunks: KbChunk[] = [];
  const fetched: string[] = [];
  let failures = 0;

  const markdownRefs = await collectMarkdownRefs(corpus);
  if (markdownRefs.length > 0) console.log(`  ${markdownRefs.length} markdown pages to fetch`);

  for (const ref of markdownRefs) {
    const markdown = await fetchText(ref.url);
    if (!markdown) {
      failures += 1;
      continue;
    }
    fetched.push(markdown);

    const url = humanUrl(ref.url);
    const title = titleOf(markdown) ?? ref.title;
    const added = chunkDocument(markdown, title, url, chunks);
    console.log(`    ${title} — ${added} chunks`);
    await delay(REQUEST_DELAY_MS);
  }

  const htmlRefs = corpus.htmlPages ?? [];
  if (htmlRefs.length > 0) console.log(`  ${htmlRefs.length} HTML pages to fetch`);

  for (const ref of htmlRefs) {
    const page = await fetchArticle(ref);
    if (!page) {
      failures += 1;
      continue;
    }
    const added = chunkDocument(page.markdown, page.title, ref.url, chunks);
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
      console.log(`    ${corpus.full.title} — ${unique.length} chunks kept, ${spare.length - unique.length} already covered`);
    } else {
      failures += 1;
    }
  }

  const target = path.join(dir, corpus.file);

  // A corpus that fetched nothing keeps whatever is already on disk. The deploy
  // runs this on every push, and blanking a corpus that is answering questions
  // is worse than serving one that is a few days old.
  if (chunks.length === 0) {
    console.warn(`  nothing was fetched — ${corpus.file} left untouched`);
    return;
  }

  const file: NamespacedKbFile = {
    namespace: corpus.namespace,
    builtAt: new Date().toISOString(),
    documents: new Set(chunks.map((chunk) => chunk.url)).size,
    chunks,
  };

  await writeFile(target, `${JSON.stringify(file, null, 1)}\n`, "utf8");

  console.log(`  wrote ${target}`);
  console.log(`  ${file.chunks.length} chunks from ${file.documents} documents`);
  if (failures > 0) console.log(`  ${failures} source(s) could not be fetched — see the warnings above`);
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
const ARTICLE_CONTAINERS: Array<{ host: string; marker: string }> = [
  { host: "support.google.com", marker: '<div class="article-content-container"' },
  { host: "developers.google.com", marker: '<div class="devsite-article-body' },
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

  const body = extractArticleBody(html, ref.url);
  if (!body) {
    console.warn(`    ${ref.url} — no article body found, skipped`);
    return null;
  }

  const markdown = htmlToMarkdown(body);
  if (markdown.length < MIN_ARTICLE_CHARS) {
    console.warn(`    ${ref.url} — only ${markdown.length} characters of article, skipped`);
    return null;
  }

  return { title: articleTitle(html) ?? ref.title, markdown };
}

function extractArticleBody(html: string, url: string): string | null {
  const container = ARTICLE_CONTAINERS.find((candidate) => url.includes(candidate.host));
  if (!container) return null;

  const start = html.indexOf(container.marker);
  if (start < 0) return null;

  const open = html.indexOf(">", start);
  if (open < 0) return null;

  let depth = 0;
  for (const match of html.slice(start).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(open + 1, start + match.index);
  }
  // Unbalanced markup: take the rest of the document rather than nothing.
  return html.slice(open + 1);
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

function chunkDocument(markdown: string, title: string, url: string, into: KbChunk[]): number {
  const slug = slugFor(url);
  let added = 0;

  for (const section of splitSections(markdown)) {
    for (const text of chunkBlocks(section.blocks)) {
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

main().catch((err: unknown) => {
  console.error(`\nbuild-kb failed: ${describe(err)}`);
  process.exitCode = 1;
});
