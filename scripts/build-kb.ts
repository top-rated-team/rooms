/**
 * Builds the developers.openai.com/ads knowledge base.
 *
 *   npm run kb:fetch   download + chunk  -> data/kb/kb.json            (no API key)
 *   npm run kb:embed   embed the chunks  -> data/kb/kb.embeddings.json (needs a key)
 *   npm run kb:build   both, skipping the embed step if there is no key
 *
 * Both files are rewritten whole, so every mode is safe to re-run. Without the
 * embeddings file the server falls back to keyword retrieval, which is why `fetch`
 * deliberately needs nothing but a network connection.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  KB_EMBEDDINGS_FILE,
  KB_FILE,
  resolveKbDir,
  type KbChunk,
  type KbEmbeddingsFile,
  type KbFile,
} from "../server/ai/kb";
import { EMBED_BATCH_SIZE, EMBED_MODEL, classifyLlmError, embedTexts, getClient } from "../server/ai/openai";

/* -------------------------------- sources -------------------------------- */

const INDEX_URL = "https://developers.openai.com/ads/llms.txt";
const FULL_URL = "https://developers.openai.com/ads/llms-full.txt";
const FULL_TITLE = "Ads — full documentation";
const DOCS_PREFIX = "https://developers.openai.com/ads/";

const USER_AGENT = "top-rated-team-kb-builder/0.1 (+https://top-rated.team; ChatGPT Ads docs index)";
const REQUEST_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * The pages docs/ADS-DOCS-BRIEF.md was written from. llms.txt is the live index and
 * normally supersedes this, but the product's copy depends on these specific pages,
 * so they are fetched whether or not the index still lists them.
 */
const SEED_PAGES: DocRef[] = [
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
];

interface DocRef {
  title: string;
  /** The .md twin — every page on this host has one at `<page>.md`. */
  url: string;
}

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
    console.error("Usage: tsx scripts/build-kb.ts [fetch|embed|all]");
    process.exitCode = 1;
    return;
  }

  const dir = resolveKbDir();
  await mkdir(dir, { recursive: true });

  if (mode === "fetch" || mode === "all") {
    await runFetch(dir);
  }

  if (mode === "embed") {
    await runEmbed(dir);
    return;
  }

  if (mode === "all") {
    if (!getClient()) {
      console.log("");
      console.log("OPENAI_API_KEY is not set, so the embedding step is skipped.");
      console.log("The knowledge base is still usable: the server falls back to keyword retrieval.");
      console.log("Add a key and run `npm run kb:embed` to switch it to semantic search.");
      return;
    }
    await runEmbed(dir);
  }
}

/* --------------------------------- fetch ---------------------------------- */

async function runFetch(dir: string): Promise<void> {
  console.log(`Fetching the ChatGPT Ads documentation into ${dir}`);

  const refs = await collectRefs();
  console.log(`${refs.length} pages to fetch`);

  const chunks: KbChunk[] = [];
  const fetched: string[] = [];
  let failures = 0;

  for (const ref of refs) {
    const markdown = await fetchText(ref.url);
    if (!markdown) {
      failures += 1;
      continue;
    }
    fetched.push(markdown);

    const url = humanUrl(ref.url);
    const title = titleOf(markdown) ?? ref.title;
    const added = chunkDocument(markdown, title, url, chunks);
    console.log(`  ${title} — ${added} chunks`);
    await delay(REQUEST_DELAY_MS);
  }

  // llms-full.txt is the same pages concatenated. Fetching it last and keeping only
  // what the individual pages did not already cover gives us a safety net for a page
  // that 404'd, without indexing the whole corpus twice under a vaguer citation URL.
  const full = await fetchText(FULL_URL);
  if (full) {
    const covered = normalise(fetched.join("\n"));
    const spare: KbChunk[] = [];
    chunkDocument(full, FULL_TITLE, FULL_URL, spare);
    const unique = spare.filter((chunk) => !isCovered(chunk.text, covered));
    chunks.push(...unique);
    console.log(`  ${FULL_TITLE} — ${unique.length} chunks kept, ${spare.length - unique.length} already covered`);
  } else {
    failures += 1;
  }

  if (chunks.length === 0) {
    throw new Error("nothing was fetched — kb.json left untouched");
  }

  const file: KbFile = {
    builtAt: new Date().toISOString(),
    documents: new Set(chunks.map((chunk) => chunk.url)).size,
    chunks,
  };

  const target = path.join(dir, KB_FILE);
  await writeFile(target, `${JSON.stringify(file, null, 1)}\n`, "utf8");

  console.log("");
  console.log(`Wrote ${target}`);
  console.log(`  ${file.chunks.length} chunks from ${file.documents} documents`);
  if (failures > 0) console.log(`  ${failures} source(s) could not be fetched — see the warnings above`);
}

async function collectRefs(): Promise<DocRef[]> {
  const byUrl = new Map<string, DocRef>();

  const index = await fetchText(INDEX_URL);
  if (index) {
    for (const ref of parseIndex(index)) byUrl.set(ref.url, ref);
  } else {
    console.warn(`  ${INDEX_URL} could not be read — falling back to the pages named in docs/ADS-DOCS-BRIEF.md`);
  }
  for (const ref of SEED_PAGES) {
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
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/markdown, text/plain, */*" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch((err: unknown) => {
    console.warn(`  ${url} — request failed (${describe(err)}), skipped`);
    return null;
  });

  if (!response) return null;
  if (!response.ok) {
    console.warn(`  ${url} — HTTP ${response.status}, skipped`);
    return null;
  }

  const body = await response.text();
  // This host answers a missing page with its full single-page-app shell. Any
  // proxy that rewrites the status would otherwise land 400KB of HTML in the index.
  if (/^\s*<(!doctype|html)/i.test(body)) {
    console.warn(`  ${url} — HTML rather than Markdown, skipped`);
    return null;
  }
  if (body.trim().length < 200) {
    console.warn(`  ${url} — only ${body.trim().length} characters, skipped`);
    return null;
  }
  return body;
}

function humanUrl(mdUrl: string): string {
  // Citations point at the page a visitor can open, not at its Markdown twin.
  return mdUrl.endsWith(".md") ? mdUrl.slice(0, -3) : mdUrl;
}

function titleOf(markdown: string): string | null {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : null;
}

/* -------------------------- markdown -> chunks ---------------------------- */

function chunkDocument(markdown: string, title: string, url: string, into: KbChunk[]): number {
  const slug = url.startsWith(DOCS_PREFIX) ? url.slice(DOCS_PREFIX.length) || "index" : url;
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

/** The page's own `# Title` is normally already the root of the trail. */
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

async function runEmbed(dir: string): Promise<void> {
  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set — embedding needs a key. Retrieval works without one, in keyword mode.");
  }

  const source = path.join(dir, KB_FILE);
  const kb = await readKb(source);
  console.log(`Embedding ${kb.chunks.length} chunks from ${source} with ${EMBED_MODEL}`);

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

  const target = path.join(dir, KB_EMBEDDINGS_FILE);
  await writeFile(target, JSON.stringify(file), "utf8");

  console.log("");
  console.log(`Wrote ${target}`);
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
