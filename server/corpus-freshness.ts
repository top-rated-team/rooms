/**
 * When each corpus was last read, and which sources failed.
 *
 * The room can print this. A record is dates and URLs — never chunk text.
 * The legal agent may add source URLs and re-read them. It does not write
 * the pages: every sentence it cites has to come from a document somebody
 * else published. This file stores no excerpts, no summaries and no cache
 * of rewritten prose.
 *
 * Adding a jurisdiction or a niche is adding a URL to data/legal-sources.json.
 * That file is the list. The legal corpus in scripts/build-kb.ts still holds
 * the same pages as a constant; `npm run kb:refresh` reads the data file
 * for that namespace so the operator can extend it without editing a script.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/* --------------------------------- shapes --------------------------------- */

export interface SourceRef {
  title: string;
  url: string;
}

export interface FailedSource {
  url: string;
  title: string;
  reason: string;
}

/**
 * What the room is allowed to show for one namespace. No chunk fields.
 * `stale` means the last read wrote nothing and the file on disk is the
 * previous one — the behaviour build-kb.ts already has when a fetch
 * produces no chunks.
 */
export interface CorpusFreshnessRecord {
  namespace: string;
  /** ISO time of the last attempt to read this namespace's sources. */
  lastAttemptAt: string;
  /** ISO time of the last read that produced a corpus, or of the copy still on disk. */
  lastReadAt: string | null;
  stale: boolean;
  /** True when the operator list for this namespace is empty. Not the same as stale. */
  noSources: boolean;
  failedSources: FailedSource[];
}

export interface FreshnessFile {
  updatedAt: string;
  records: CorpusFreshnessRecord[];
}

export interface FetchOutcome {
  leftUntouched: boolean;
  changed: boolean;
  failed: FailedSource[];
  read: SourceRef[];
  builtAt: string | null;
  documents: number;
  chunks: number;
}

/* --------------------------------- paths ---------------------------------- */

export const LEGAL_SOURCES_FILE = "legal-sources.json";
export const FRESHNESS_FILE = "corpus-freshness.json";

/**
 * `data/`, next to `data/kb/`. Freshness and the legal source list live here
 * rather than inside data/kb/: every *.json in that folder is loaded as a
 * corpus, and neither of these files is one.
 */
export function resolveDataDir(): string {
  const override = process.env.DATA_DIR?.trim();
  if (override) return path.resolve(override);

  const start = process.cwd();
  let dir = start;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, "data");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(start, "data");
}

export function legalSourcesPath(dataDir = resolveDataDir()): string {
  return path.join(dataDir, LEGAL_SOURCES_FILE);
}

export function freshnessPath(dataDir = resolveDataDir()): string {
  return path.join(dataDir, FRESHNESS_FILE);
}

/* ----------------------------- legal sources ------------------------------ */

/**
 * Title and URL only. A `text`, `body` or `content` field on an entry is
 * ignored: this list is addresses, not a place to author a corpus.
 */
export function parseLegalSources(raw: unknown): SourceRef[] {
  if (typeof raw !== "object" || raw === null) return [];
  const listed = (raw as { sources?: unknown }).sources;
  if (!Array.isArray(listed)) return [];

  const sources: SourceRef[] = [];
  for (const item of listed) {
    if (typeof item !== "object" || item === null) continue;
    const url = (item as { url?: unknown }).url;
    const title = (item as { title?: unknown }).title;
    if (typeof url !== "string") continue;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) continue;
    sources.push({
      url: trimmed,
      title: typeof title === "string" && title.trim().length > 0 ? title.trim() : trimmed,
    });
  }
  return sources;
}

export async function loadLegalSources(file = legalSourcesPath()): Promise<SourceRef[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  try {
    return parseLegalSources(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

/** Sources named on a build-kb corpus row. The legal namespace is not this: it reads the data file. */
export function sourcesOnCorpus(corpus: {
  index?: string;
  full?: SourceRef;
  markdownPages?: SourceRef[];
  htmlPages?: SourceRef[];
}): SourceRef[] {
  const sources: SourceRef[] = [];
  if (corpus.index) sources.push({ title: "index", url: corpus.index });
  for (const ref of corpus.markdownPages ?? []) sources.push({ title: ref.title, url: ref.url });
  for (const ref of corpus.htmlPages ?? []) sources.push({ title: ref.title, url: ref.url });
  if (corpus.full) sources.push({ title: corpus.full.title, url: corpus.full.url });
  return sources;
}

export async function sourcesForRefresh(
  corpus: {
    namespace: string;
    index?: string;
    full?: SourceRef;
    markdownPages?: SourceRef[];
    htmlPages?: SourceRef[];
  },
  opts?: { legalSourcesFile?: string },
): Promise<SourceRef[]> {
  if (corpus.namespace === "legal") return loadLegalSources(opts?.legalSourcesFile ?? legalSourcesPath());
  return sourcesOnCorpus(corpus);
}

/* ------------------------------- records ---------------------------------- */

export function isFresh(record: CorpusFreshnessRecord): boolean {
  return !record.noSources && !record.stale && record.failedSources.length === 0 && record.lastReadAt !== null;
}

/**
 * Dates and failed URLs, in the words the room can print. Nothing here
 * restates a document.
 */
export function freshnessLine(record: CorpusFreshnessRecord): string {
  if (record.noSources) {
    return "No sources are listed for this corpus, so it is not current.";
  }
  const when = record.lastReadAt ? dayOf(record.lastReadAt) : null;
  if (record.stale) {
    const failed = record.failedSources.length;
    if (when && failed > 0) {
      return `Last read ${when}. ${failed} ${plural(failed, "source")} could not be read, so this copy was left as it was.`;
    }
    if (when) {
      return `Last read ${when}. A later read wrote nothing, so this copy was left as it was.`;
    }
    return "This corpus has not been read, and a read that was tried wrote nothing.";
  }
  if (!when) return "This corpus has not been read yet.";
  if (record.failedSources.length > 0) {
    return `Last read ${when}. ${record.failedSources.length} listed ${plural(record.failedSources.length, "source")} could not be read.`;
  }
  return `Last read ${when}.`;
}

export function freshnessFromOutcome(input: {
  namespace: string;
  sources: SourceRef[];
  outcome?: FetchOutcome | null;
  previous?: Pick<CorpusFreshnessRecord, "lastReadAt"> | null;
  attemptedAt: string;
}): CorpusFreshnessRecord {
  if (input.sources.length === 0) {
    return sanitizeRecord({
      namespace: input.namespace,
      lastAttemptAt: input.attemptedAt,
      lastReadAt: input.previous?.lastReadAt ?? null,
      stale: false,
      noSources: true,
      failedSources: [],
    });
  }

  const outcome = input.outcome;
  const leftUntouched = outcome?.leftUntouched ?? true;
  const failed = (outcome?.failed ?? []).map((item) => ({
    url: item.url,
    title: item.title,
    reason: item.reason,
  }));

  return sanitizeRecord({
    namespace: input.namespace,
    lastAttemptAt: input.attemptedAt,
    lastReadAt: leftUntouched
      ? (input.previous?.lastReadAt ?? outcome?.builtAt ?? null)
      : (outcome?.builtAt ?? input.attemptedAt),
    stale: leftUntouched,
    noSources: false,
    failedSources: failed,
  });
}

export async function readFreshnessFile(file = freshnessPath()): Promise<FreshnessFile | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const updatedAt = (parsed as { updatedAt?: unknown }).updatedAt;
    const records = (parsed as { records?: unknown }).records;
    if (typeof updatedAt !== "string" || !Array.isArray(records)) return null;
    return {
      updatedAt,
      records: records
        .map((item) => parseRecord(item))
        .filter((item): item is CorpusFreshnessRecord => item !== null),
    };
  } catch {
    return null;
  }
}

export function recordForNamespace(
  namespace: string,
  file: FreshnessFile | null,
): CorpusFreshnessRecord | undefined {
  return file?.records.find((record) => record.namespace === namespace);
}

export async function writeNamespaceFreshness(
  file: string,
  record: CorpusFreshnessRecord,
): Promise<CorpusFreshnessRecord> {
  const clean = sanitizeRecord(record);
  const existing = await readFreshnessFile(file);
  const records = existing?.records.filter((row) => row.namespace !== clean.namespace) ?? [];
  records.push(clean);
  records.sort((a, b) => a.namespace.localeCompare(b.namespace));

  const next: FreshnessFile = {
    updatedAt: clean.lastAttemptAt,
    records,
  };

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return clean;
}

/**
 * Apply one namespace's refresh: call fetch only when there are sources,
 * never write the corpus file ourselves, and record the outcome. A fetch
 * that produces nothing is expected to leave the previous corpus as it
 * was — that is build-kb.ts's rule, surfaced here as `stale`.
 */
export async function applyRefresh(input: {
  namespace: string;
  sources: SourceRef[];
  fetch: () => Promise<FetchOutcome>;
  previous?: Pick<CorpusFreshnessRecord, "lastReadAt"> | null;
  attemptedAt?: string;
  freshnessFile: string;
}): Promise<{ record: CorpusFreshnessRecord; outcome: FetchOutcome | null }> {
  const attemptedAt = input.attemptedAt ?? new Date().toISOString();

  if (input.sources.length === 0) {
    const record = await writeNamespaceFreshness(
      input.freshnessFile,
      freshnessFromOutcome({
        namespace: input.namespace,
        sources: input.sources,
        outcome: null,
        previous: input.previous,
        attemptedAt,
      }),
    );
    return { record, outcome: null };
  }

  const outcome = await input.fetch();
  const record = await writeNamespaceFreshness(
    input.freshnessFile,
    freshnessFromOutcome({
      namespace: input.namespace,
      sources: input.sources,
      outcome,
      previous: input.previous,
      attemptedAt,
    }),
  );
  return { record, outcome };
}

/* --------------------------------- utils ---------------------------------- */

function dayOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function parseRecord(raw: unknown): CorpusFreshnessRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.namespace !== "string" || row.namespace.trim().length === 0) return null;
  if (typeof row.lastAttemptAt !== "string") return null;
  if (row.lastReadAt !== null && typeof row.lastReadAt !== "string") return null;
  if (typeof row.stale !== "boolean" || typeof row.noSources !== "boolean") return null;
  if (!Array.isArray(row.failedSources)) return null;

  const failedSources: FailedSource[] = [];
  for (const item of row.failedSources) {
    if (typeof item !== "object" || item === null) continue;
    const failed = item as { url?: unknown; title?: unknown; reason?: unknown };
    if (typeof failed.url !== "string" || typeof failed.reason !== "string") continue;
    failedSources.push({
      url: failed.url,
      title: typeof failed.title === "string" ? failed.title : failed.url,
      reason: failed.reason,
    });
  }

  return sanitizeRecord({
    namespace: row.namespace,
    lastAttemptAt: row.lastAttemptAt,
    lastReadAt: row.lastReadAt,
    stale: row.stale,
    noSources: row.noSources,
    failedSources,
  });
}

/** Drop anything that is not a freshness field — especially chunk text. */
export function sanitizeRecord(record: CorpusFreshnessRecord): CorpusFreshnessRecord {
  return {
    namespace: record.namespace,
    lastAttemptAt: record.lastAttemptAt,
    lastReadAt: record.lastReadAt,
    stale: record.stale,
    noSources: record.noSources,
    failedSources: record.failedSources.map((item) => ({
      url: item.url,
      title: item.title,
      reason: item.reason,
    })),
  };
}

export function recordKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) recordKeys(item, into);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      into.add(key);
      recordKeys(nested, into);
    }
  }
  return into;
}

const CHUNK_KEYS = new Set(["text", "chunks", "heading", "body", "content", "excerpt", "markdown"]);

export function hasChunkText(value: unknown): boolean {
  for (const key of recordKeys(value)) {
    if (CHUNK_KEYS.has(key)) return true;
  }
  return false;
}
