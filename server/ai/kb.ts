/**
 * Retrieval, one corpus per door.
 *
 * Every `*.json` in data/kb/ that is not an embeddings file is a corpus, written
 * by `scripts/build-kb.ts`, and each one carries its own `namespace`:
 *
 *   data/kb/kb.json              namespace "chatgpt-ads"  + kb.embeddings.json
 *   data/kb/kb.google-ads.json   namespace "google-ads"   + kb.google-ads.embeddings.json
 *   data/kb/kb.ad-grants.json    namespace "ad-grants"    + kb.ad-grants.embeddings.json
 *
 * They are loaded into separate indexes and they never mix. `retrieve()` takes
 * the namespace first, before the query, because that is the argument that must
 * not be forgotten: an agent answering a Google Ad Grants question out of
 * OpenAI's advertising documentation would cite a real page, with a working
 * link, in the house voice, and be wrong. **There is no fallback to another
 * namespace.** A corpus with nothing to say returns nothing, and the agent then
 * says what it cannot confirm and offers a human — see NO_EXCERPTS_INSTRUCTION
 * in agentRuntime.ts. An empty answer is recoverable; a confident answer citing
 * the wrong documentation is not.
 *
 * Three modes, and `kbStatus().mode` always says which one is live:
 *
 *   embeddings  vectors on disk for every corpus and a usable key: embed the
 *               query, cosine, top-k.
 *   lexical     BM25 over the same chunks, scored inside one corpus. This is
 *               what runs before anyone adds a key, so it has to be genuinely
 *               good rather than a stub.
 *   empty       no corpus loaded. `retrieve()` returns [] and the agents say so.
 *
 * Nothing in here throws. A missing or malformed file logs once and degrades:
 * one bad corpus takes out its own door, never the others.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { KbStatus } from "@shared/api";
import { EMBED_MODEL, embedTexts, getClient, hasKey } from "./openai";

/* ------------------------------ on-disk shape ----------------------------- */

export interface KbChunk {
  id: string;
  /** Page title, used verbatim in citations. */
  title: string;
  /** Human URL (no .md), used verbatim in citations. */
  url: string;
  /** Heading trail within the page, e.g. "Measurement Pixel > Deduplication". */
  heading: string;
  text: string;
}

export interface KbFile {
  builtAt: string;
  documents: number;
  chunks: KbChunk[];
  /**
   * Which door's corpus this is. Optional only because a file built before
   * namespaces existed has no such field — see `namespaceOf()`.
   */
  namespace?: string;
}

export interface KbEmbeddingsFile {
  model: string;
  dims: number;
  /** The corpus's `builtAt` at embedding time — a cheap staleness check. */
  builtAt: string;
  /** One vector per chunk, aligned to `KbFile.chunks` by index. */
  vectors: number[][];
}

export const KB_FILE = "kb.json";
export const KB_EMBEDDINGS_FILE = "kb.embeddings.json";
/** What `kb.json` is when the file itself does not say: door one, built before this field existed. */
export const DEFAULT_NAMESPACE = "chatgpt-ads";

/** Vectors live beside their corpus: kb.google-ads.json -> kb.google-ads.embeddings.json. */
function embeddingsFileFor(file: string): string {
  return file.replace(/\.json$/, ".embeddings.json");
}

function isCorpusFile(file: string): boolean {
  return file.endsWith(".json") && !file.endsWith(".embeddings.json");
}

/** A file's declared namespace, or the one its filename implies. */
function namespaceOf(file: string, declared: unknown): string {
  if (typeof declared === "string" && declared.trim().length > 0) return declared.trim();
  if (file === KB_FILE) return DEFAULT_NAMESPACE;
  return file.replace(/^kb\./, "").replace(/\.json$/, "");
}

/**
 * `npm run dev` and `npm start` both run from the repo root, so cwd is the normal
 * answer; the walk upwards covers a process launched from a subdirectory. KB_DIR
 * wins over both, for images that mount the corpus somewhere else.
 */
export function resolveKbDir(): string {
  const override = process.env.KB_DIR?.trim();
  if (override) return path.resolve(override);

  const start = process.cwd();
  let dir = start;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, "data", "kb");
    if (existsSync(path.join(candidate, KB_FILE))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(start, "data", "kb");
}

/* -------------------------------- retrieval ------------------------------- */

export interface RetrievedChunk extends KbChunk {
  /** Cosine similarity in embeddings mode, BM25 score in lexical mode. */
  score: number;
  /** The corpus this came out of. Always the namespace that was asked for. */
  namespace: string;
}

const DEFAULT_K = 8;
/** 8192-token input limit; 8000 characters is roughly 2000 tokens, with room to spare. */
const MAX_QUERY_CHARS = 8000;
/** Below this a cosine hit is noise, and an irrelevant excerpt invites a bad citation. */
const MIN_COSINE = 0.15;

const BM25_K1 = 1.2;
const BM25_B = 0.75;
/** Added per query term found in the heading trail / page title, scaled by the term's idf. */
const HEADING_BOOST = 1.2;
const TITLE_BOOST = 0.8;

interface IndexedChunk extends KbChunk {
  termFreq: Map<string, number>;
  length: number;
  headingTerms: Set<string>;
  titleTerms: Set<string>;
}

/**
 * One door's corpus, indexed on its own. Nothing is shared between two of them —
 * not the chunks, not the document frequencies, not the vectors — so a chunk in
 * one corpus cannot be reached from a query against another.
 */
interface Corpus {
  namespace: string;
  /** The file it was read from, for the log line and the staleness warnings. */
  file: string;
  chunks: IndexedChunk[];
  documentCount: number;
  builtAt: string;
  docFreq: Map<string, number>;
  averageLength: number;
  /** Unit vectors, so cosine similarity is a plain dot product. Null in lexical mode. */
  unitVectors: Float32Array[] | null;
  vectorModel: string | null;
}

let loadPromise: Promise<void> | null = null;
let corpora = new Map<string, Corpus>();

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** What each door has to read from. Used by the boot banner and by the tests. */
export interface NamespaceStatus {
  namespace: string;
  file: string;
  documents: number;
  chunks: number;
  builtAt: string;
  mode: "embeddings" | "lexical";
}

export function kbNamespaces(): NamespaceStatus[] {
  if (!loadPromise) void loadKb();
  return [...corpora.values()].map((corpus) => ({
    namespace: corpus.namespace,
    file: corpus.file,
    documents: corpus.documentCount,
    chunks: corpus.chunks.length,
    builtAt: corpus.builtAt,
    mode: corpusMode(corpus),
  }));
}

/** True when a door's corpus is actually on disk. A door whose corpus is missing retrieves nothing. */
export function hasNamespace(namespace: string): boolean {
  if (!loadPromise) void loadKb();
  return corpora.has(namespace);
}

export function kbStatus(): KbStatus {
  // Status can be polled before boot has awaited loadKb(); start it and report
  // honestly in the meantime rather than blocking a synchronous accessor.
  if (!loadPromise) void loadKb();

  let documents = 0;
  let chunks = 0;
  let builtAt: string | null = null;
  for (const corpus of corpora.values()) {
    documents += corpus.documentCount;
    chunks += corpus.chunks.length;
    // One date for a shelf of corpora has to mean something: the oldest build is
    // the one that tells you the shelf is stale.
    if (builtAt === null || corpus.builtAt < builtAt) builtAt = corpus.builtAt;
  }

  return {
    ready: chunks > 0,
    mode: currentMode(),
    documents,
    chunks,
    builtAt,
    llmReady: hasKey(),
  };
}

function corpusMode(corpus: Corpus): "embeddings" | "lexical" {
  return corpus.unitVectors && corpus.vectorModel === EMBED_MODEL && hasKey() ? "embeddings" : "lexical";
}

/**
 * The aggregate mode, and deliberately the pessimistic one: "embeddings" only
 * when every loaded corpus can actually answer that way. One door on keyword
 * search while the banner says semantic is the kind of half-truth that costs an
 * afternoon.
 */
function currentMode(): KbStatus["mode"] {
  const all = [...corpora.values()];
  if (all.length === 0 || all.every((corpus) => corpus.chunks.length === 0)) return "empty";
  return all.every((corpus) => corpusMode(corpus) === "embeddings") ? "embeddings" : "lexical";
}

export async function loadKb(): Promise<void> {
  if (!loadPromise) loadPromise = load();
  return loadPromise;
}

/**
 * Top-k excerpts for one question, **from one corpus only**.
 *
 * `namespace` comes first because it is the argument that cannot be left out. An
 * unknown namespace returns nothing rather than falling back to whatever else is
 * loaded, and the asking agent then says what it is missing — which is the
 * honest outcome. See the note at the top of this file.
 */
export async function retrieve(
  namespace: string,
  query: string,
  k: number = DEFAULT_K,
): Promise<RetrievedChunk[]> {
  await loadKb();

  const trimmed = query.trim();
  if (trimmed.length === 0 || k <= 0) return [];

  const corpus = corpora.get(namespace);
  if (!corpus) {
    warnOnce(
      `kb-namespace-${namespace}`,
      `[kb] no corpus for namespace "${namespace}" — that agent retrieves nothing and says so. ` +
        `Loaded: ${[...corpora.keys()].join(", ") || "none"}. Build it with: npm run kb:fetch -- ${namespace}`,
    );
    return [];
  }
  if (corpus.chunks.length === 0) return [];

  const semantic = await semanticScores(corpus, trimmed);
  const scores = semantic ?? lexicalScores(corpus, trimmed);
  const floor = semantic ? MIN_COSINE : 0;

  const ranked: RetrievedChunk[] = [];
  for (let i = 0; i < corpus.chunks.length; i += 1) {
    const score = scores[i];
    if (score <= floor) continue;
    const chunk = corpus.chunks[i];
    ranked.push({
      id: chunk.id,
      title: chunk.title,
      url: chunk.url,
      heading: chunk.heading,
      text: chunk.text,
      score,
      namespace: corpus.namespace,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, k);
}

/* ------------------------------ loading ---------------------------------- */

async function load(): Promise<void> {
  const dir = resolveKbDir();
  const loaded = new Map<string, Corpus>();

  let files: string[];
  try {
    files = (await readdir(dir)).filter(isCorpusFile).sort();
  } catch {
    warnOnce(
      "kb-dir-missing",
      `[kb] no knowledge base directory at ${dir} — retrieval is off and grounded agents will say so. Build it with: npm run kb:build`,
    );
    corpora = loaded;
    return;
  }

  if (files.length === 0) {
    warnOnce(
      "kb-missing",
      `[kb] no corpus files in ${dir} — retrieval is off and grounded agents will say so. Build it with: npm run kb:build`,
    );
  }

  for (const file of files) {
    const kb = await readKbFile(path.join(dir, file));
    if (!kb) continue;

    const namespace = namespaceOf(file, kb.namespace);
    const existing = loaded.get(namespace);
    if (existing) {
      warnOnce(
        `kb-duplicate-${namespace}`,
        `[kb] ${file} and ${existing.file} both claim namespace "${namespace}" — keeping ${existing.file} and ignoring ${file}. Two corpora under one name is a mixed corpus, which is the thing this file exists to prevent.`,
      );
      continue;
    }

    const corpus = indexCorpus(namespace, file, kb);
    await loadVectors(path.join(dir, embeddingsFileFor(file)), kb, corpus);
    loaded.set(namespace, corpus);
  }

  corpora = loaded;

  for (const corpus of corpora.values()) {
    console.log(
      `[kb] ${corpus.namespace}: ${corpus.chunks.length} chunks from ${corpus.documentCount} documents (${corpus.file}), built ${corpus.builtAt}, mode: ${corpusMode(corpus)}`,
    );
  }
}

function indexCorpus(namespace: string, file: string, kb: KbFile): Corpus {
  const chunks = kb.chunks.map(index);

  const docFreq = new Map<string, number>();
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
    for (const term of chunk.termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  return {
    namespace,
    file,
    chunks,
    documentCount: new Set(chunks.map((c) => c.url)).size,
    builtAt: kb.builtAt,
    docFreq,
    averageLength: chunks.length > 0 ? Math.max(1, totalLength / chunks.length) : 1,
    unitVectors: null,
    vectorModel: null,
  };
}

async function readKbFile(file: string): Promise<KbFile | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    warnOnce(
      `kb-unreadable-${file}`,
      `[kb] no knowledge base at ${file} — retrieval is off for that door and its agent will say so. Build it with: npm run kb:build`,
    );
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isKbFile(parsed)) throw new Error("unexpected shape");
    if (parsed.chunks.length === 0) throw new Error("no chunks");
    return parsed;
  } catch (err) {
    warnOnce(
      `kb-malformed-${file}`,
      `[kb] ${file} is unreadable (${describe(err)}) — that corpus is skipped and the others still load. Rebuild with: npm run kb:build`,
    );
    return null;
  }
}

async function loadVectors(file: string, kb: KbFile, corpus: Corpus): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    // Expected before anyone runs `npm run kb:embed`. Lexical mode covers it.
    return;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isEmbeddingsFile(parsed)) throw new Error("unexpected shape");

    if (parsed.model !== EMBED_MODEL) {
      warnOnce(
        `kb-vectors-model-${file}`,
        `[kb] ${file} was built with ${parsed.model} but OPENAI_EMBED_MODEL is ${EMBED_MODEL} — the two vector spaces are unrelated, so keyword search is used instead. Rebuild with: npm run kb:embed -- ${corpus.namespace}`,
      );
      return;
    }
    if (parsed.vectors.length !== kb.chunks.length) {
      warnOnce(
        `kb-vectors-stale-${file}`,
        `[kb] ${parsed.vectors.length} vectors for ${kb.chunks.length} chunks in ${corpus.namespace} — the index moved on. Using keyword search until: npm run kb:embed -- ${corpus.namespace}`,
      );
      return;
    }

    const width = parsed.vectors[0].length;
    const normalised: Float32Array[] = [];
    for (const vector of parsed.vectors) {
      if (vector.length !== width) throw new Error("ragged vectors");
      normalised.push(toUnitVector(vector));
    }

    corpus.unitVectors = normalised;
    corpus.vectorModel = parsed.model;
  } catch (err) {
    warnOnce(`kb-vectors-malformed-${file}`, `[kb] ${file} is unreadable (${describe(err)}) — using keyword search.`);
  }
}

function isKbFile(value: unknown): value is KbFile {
  if (typeof value !== "object" || value === null) return false;
  const file = value as Partial<KbFile>;
  if (typeof file.builtAt !== "string" || !Array.isArray(file.chunks)) return false;
  return file.chunks.every(
    (chunk) =>
      typeof chunk === "object" &&
      chunk !== null &&
      typeof chunk.id === "string" &&
      typeof chunk.title === "string" &&
      typeof chunk.url === "string" &&
      typeof chunk.heading === "string" &&
      typeof chunk.text === "string",
  );
}

function isEmbeddingsFile(value: unknown): value is KbEmbeddingsFile {
  if (typeof value !== "object" || value === null) return false;
  const file = value as Partial<KbEmbeddingsFile>;
  if (typeof file.model !== "string" || typeof file.dims !== "number" || typeof file.builtAt !== "string") return false;
  if (!Array.isArray(file.vectors) || file.vectors.length === 0) return false;
  return file.vectors.every((vector) => Array.isArray(vector) && vector.length > 0 && vector.every((n) => typeof n === "number"));
}

/* ------------------------------ scoring ---------------------------------- */

async function semanticScores(corpus: Corpus, query: string): Promise<number[] | null> {
  const vectors = corpus.unitVectors;
  if (!vectors || corpus.vectorModel !== EMBED_MODEL) return null;
  const client = getClient();
  if (!client) return null;

  let queryVector: number[] | undefined;
  try {
    const result = await embedTexts(client, [query.slice(0, MAX_QUERY_CHARS)], { maxRetries: 1, timeoutMs: 15_000 });
    queryVector = result.vectors[0];
  } catch (err) {
    warnOnce("kb-query-embed", `[kb] query embedding failed (${describe(err)}) — falling back to keyword search.`);
    return null;
  }

  if (!queryVector || queryVector.length !== vectors[0].length) {
    warnOnce(
      `kb-query-width-${corpus.namespace}`,
      `[kb] query vector width does not match the ${corpus.namespace} index — falling back to keyword search.`,
    );
    return null;
  }

  const q = toUnitVector(queryVector);
  return vectors.map((v) => dot(v, q));
}

/**
 * BM25 inside one corpus. The document frequencies are that corpus's own, which
 * is the second reason the indexes are kept apart: idf computed across three
 * bodies of documentation would make "campaign" look rare in the corpus where it
 * is the whole subject and common in the two where it is an aside.
 */
function lexicalScores(corpus: Corpus, query: string): number[] {
  const terms = [...new Set(tokenizeQuery(query))];
  const scores = new Array<number>(corpus.chunks.length).fill(0);
  if (terms.length === 0) return scores;

  const total = corpus.chunks.length;
  for (const term of terms) {
    const df = corpus.docFreq.get(term) ?? 0;
    if (df === 0) continue;
    // Probabilistic idf, +1 inside the log so a term in every chunk scores ~0 rather than negative.
    const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));

    for (let i = 0; i < total; i += 1) {
      const chunk = corpus.chunks[i];
      const freq = chunk.termFreq.get(term);
      if (freq) {
        const denominator = freq + BM25_K1 * (1 - BM25_B + (BM25_B * chunk.length) / corpus.averageLength);
        scores[i] += idf * ((freq * (BM25_K1 + 1)) / denominator);
      }
      // Heading and title matches are evidence about the whole chunk, not just a
      // word in it — "deduplication" in a heading beats it once in a paragraph.
      if (chunk.headingTerms.has(term)) scores[i] += HEADING_BOOST * idf;
      if (chunk.titleTerms.has(term)) scores[i] += TITLE_BOOST * idf;
    }
  }

  return scores;
}

function index(chunk: KbChunk): IndexedChunk {
  const terms = tokenize(chunk.text);
  const termFreq = new Map<string, number>();
  for (const term of terms) termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
  return {
    ...chunk,
    termFreq,
    length: Math.max(1, terms.length),
    headingTerms: new Set(tokenize(chunk.heading)),
    titleTerms: new Set(tokenize(chunk.title)),
  };
}

const STOPWORDS = new Set([
  "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by",
  "can", "do", "does", "for", "from", "get", "had", "has", "have", "how", "i", "if", "in", "into", "is", "it",
  "its", "me", "more", "must", "my", "no", "not", "of", "on", "one", "or", "our", "out", "over", "so", "some",
  "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "up", "use", "using",
  "was", "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

/**
 * Identifiers carry most of the signal in these corpora (`pixel_id`,
 * `max_bid_micros`, `bidding_type`), so an underscored token is indexed whole
 * *and* in parts — a visitor typing "pixel id" still has to hit `pixel_id`.
 */
function tokenize(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (!raw) continue;
    if (raw.includes("_")) {
      out.push(raw);
      for (const part of raw.split("_")) {
        if (part.length > 1 && !STOPWORDS.has(part)) out.push(part);
      }
      continue;
    }
    if (raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(raw);
  }
  return out;
}

/**
 * The buyer's shorthand, rewritten into the words the documentation itself uses.
 * Query side only — nothing in a corpus is rewritten, and a question containing
 * none of these words tokenises exactly as it did before.
 *
 * "PMax" is why this exists. Google never writes it: 2 chunks out of 623 contain
 * the string, against 299 mentions of "Performance Max". BM25 reads a term that
 * rare as the most distinctive thing in the question, so those two chunks won
 * every PMax query and the page that answers it — "Search campaigns containing
 * an exact match keyword are prioritized to serve over Performance Max" — never
 * came back. The door's own starter asks about PMax, because that is the word a
 * buyer types.
 *
 * Rewritten rather than added: keeping the rare token would keep the same idf
 * spike that caused the problem.
 */
const QUERY_ALIASES: Record<string, string[]> = {
  pmax: ["performance", "max"],
  tcpa: ["target", "cpa"],
  troas: ["target", "roas"],
};

function tokenizeQuery(query: string): string[] {
  const out: string[] = [];
  for (const term of tokenize(query)) {
    const alias = QUERY_ALIASES[term];
    if (alias) out.push(...alias);
    else out.push(term);
  }
  return out;
}

function toUnitVector(values: number[]): Float32Array {
  const vector = Float32Array.from(values);
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  }
  return vector;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
