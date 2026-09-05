/**
 * Retrieval over the developers.openai.com/ads corpus.
 *
 * The index is two files on disk, both written by `scripts/build-kb.ts`:
 *
 *   data/kb/kb.json             chunks + metadata. No API key needed to build it.
 *   data/kb/kb.embeddings.json  one vector per chunk, aligned by array index.
 *
 * Three modes, and `kbStatus().mode` always says which one is live:
 *
 *   embeddings  vectors on disk and a usable key: embed the query, cosine, top-k.
 *   lexical     BM25 over the same chunks. This is what runs before anyone adds a
 *               key, so it has to be genuinely good rather than a stub.
 *   empty       no kb.json. `retrieve()` returns [] and the agents say what they lack.
 *
 * Nothing in here throws. A missing or malformed file logs once and degrades.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
}

export interface KbEmbeddingsFile {
  model: string;
  dims: number;
  /** `kb.json`'s builtAt at embedding time — a cheap staleness check. */
  builtAt: string;
  /** One vector per chunk, aligned to `KbFile.chunks` by index. */
  vectors: number[][];
}

export const KB_FILE = "kb.json";
export const KB_EMBEDDINGS_FILE = "kb.embeddings.json";

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

let loadPromise: Promise<void> | null = null;
let chunks: IndexedChunk[] = [];
let documentCount = 0;
let builtAt: string | null = null;
let docFreq = new Map<string, number>();
let averageLength = 1;
/** Unit vectors, so cosine similarity is a plain dot product. Null in lexical mode. */
let unitVectors: Float32Array[] | null = null;
let vectorModel: string | null = null;

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

export function kbStatus(): KbStatus {
  // Status can be polled before boot has awaited loadKb(); start it and report
  // honestly in the meantime rather than blocking a synchronous accessor.
  if (!loadPromise) void loadKb();
  return {
    ready: chunks.length > 0,
    mode: currentMode(),
    documents: documentCount,
    chunks: chunks.length,
    builtAt,
    llmReady: hasKey(),
  };
}

function currentMode(): KbStatus["mode"] {
  if (chunks.length === 0) return "empty";
  if (unitVectors && vectorModel === EMBED_MODEL && hasKey()) return "embeddings";
  return "lexical";
}

export async function loadKb(): Promise<void> {
  if (!loadPromise) loadPromise = load();
  return loadPromise;
}

export async function retrieve(query: string, k: number = DEFAULT_K): Promise<RetrievedChunk[]> {
  await loadKb();
  const trimmed = query.trim();
  if (chunks.length === 0 || trimmed.length === 0 || k <= 0) return [];

  const semantic = await semanticScores(trimmed);
  const scores = semantic ?? lexicalScores(trimmed);
  const floor = semantic ? MIN_COSINE : 0;

  const ranked: RetrievedChunk[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const score = scores[i];
    if (score <= floor) continue;
    const chunk = chunks[i];
    ranked.push({
      id: chunk.id,
      title: chunk.title,
      url: chunk.url,
      heading: chunk.heading,
      text: chunk.text,
      score,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, k);
}

/* ------------------------------ loading ---------------------------------- */

async function load(): Promise<void> {
  const dir = resolveKbDir();
  const kb = await readKbFile(path.join(dir, KB_FILE));
  if (!kb) return;

  chunks = kb.chunks.map(index);
  documentCount = new Set(chunks.map((c) => c.url)).size;
  builtAt = kb.builtAt;

  docFreq = new Map();
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
    for (const term of chunk.termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  averageLength = chunks.length > 0 ? Math.max(1, totalLength / chunks.length) : 1;

  await loadVectors(path.join(dir, KB_EMBEDDINGS_FILE), kb);

  console.log(
    `[kb] ${chunks.length} chunks from ${documentCount} documents, built ${builtAt}, mode: ${currentMode()}`,
  );
}

async function readKbFile(file: string): Promise<KbFile | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    warnOnce(
      "kb-missing",
      `[kb] no knowledge base at ${file} — retrieval is off and grounded agents will say so. Build it with: npm run kb:build`,
    );
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isKbFile(parsed)) throw new Error("unexpected shape");
    if (parsed.chunks.length === 0) throw new Error("no chunks");
    return parsed;
  } catch (err) {
    warnOnce("kb-malformed", `[kb] ${file} is unreadable (${describe(err)}) — retrieval is off. Rebuild with: npm run kb:build`);
    return null;
  }
}

async function loadVectors(file: string, kb: KbFile): Promise<void> {
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
        "kb-vectors-model",
        `[kb] embeddings were built with ${parsed.model} but OPENAI_EMBED_MODEL is ${EMBED_MODEL} — the two vector spaces are unrelated, so keyword search is used instead. Rebuild with: npm run kb:embed`,
      );
      return;
    }
    if (parsed.vectors.length !== kb.chunks.length) {
      warnOnce(
        "kb-vectors-stale",
        `[kb] ${parsed.vectors.length} vectors for ${kb.chunks.length} chunks — the index moved on. Using keyword search until: npm run kb:embed`,
      );
      return;
    }

    const width = parsed.vectors[0].length;
    const normalised: Float32Array[] = [];
    for (const vector of parsed.vectors) {
      if (vector.length !== width) throw new Error("ragged vectors");
      normalised.push(toUnitVector(vector));
    }

    unitVectors = normalised;
    vectorModel = parsed.model;
  } catch (err) {
    warnOnce("kb-vectors-malformed", `[kb] ${file} is unreadable (${describe(err)}) — using keyword search.`);
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

async function semanticScores(query: string): Promise<number[] | null> {
  const vectors = unitVectors;
  if (!vectors || vectorModel !== EMBED_MODEL) return null;
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
    warnOnce("kb-query-width", "[kb] query vector width does not match the index — falling back to keyword search.");
    return null;
  }

  const q = toUnitVector(queryVector);
  return vectors.map((v) => dot(v, q));
}

function lexicalScores(query: string): number[] {
  const terms = [...new Set(tokenize(query))];
  const scores = new Array<number>(chunks.length).fill(0);
  if (terms.length === 0) return scores;

  const total = chunks.length;
  for (const term of terms) {
    const df = docFreq.get(term) ?? 0;
    if (df === 0) continue;
    // Probabilistic idf, +1 inside the log so a term in every chunk scores ~0 rather than negative.
    const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));

    for (let i = 0; i < total; i += 1) {
      const chunk = chunks[i];
      const freq = chunk.termFreq.get(term);
      if (freq) {
        const denominator = freq + BM25_K1 * (1 - BM25_B + (BM25_B * chunk.length) / averageLength);
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
 * Identifiers carry most of the signal in this corpus (`pixel_id`, `max_bid_micros`,
 * `bidding_type`), so an underscored token is indexed whole *and* in parts — a
 * visitor typing "pixel id" still has to hit `pixel_id`.
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
