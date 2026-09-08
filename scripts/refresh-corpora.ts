/**
 * Re-fetches every corpus and reports what changed, what could not be read,
 * and what is now stale.
 *
 *   npm run kb:refresh
 *   npm run kb:refresh -- legal
 *
 * Fetch itself is scripts/build-kb.ts: a corpus that comes back empty is left
 * as it was, rather than blanked. This script surfaces that — it does not
 * change it — and writes a freshness record per namespace for the room.
 *
 * The legal namespace reads data/legal-sources.json. Adding a jurisdiction
 * or a niche is adding a URL there. This script does not write page text,
 * summarise a document, or keep a rewritten cache.
 */

import { CORPORA, runFetch, type Corpus } from "./build-kb";
import { resolveKbDir } from "../server/ai/kb";
import {
  applyRefresh,
  freshnessLine,
  freshnessPath,
  isFresh,
  legalSourcesPath,
  readFreshnessFile,
  recordForNamespace,
  resolveDataDir,
  sourcesForRefresh,
  type CorpusFreshnessRecord,
  type FetchOutcome,
} from "../server/corpus-freshness";

async function main(): Promise<void> {
  const only = process.argv[2]?.trim();
  const corpora = only ? CORPORA.filter((corpus) => corpus.namespace === only) : CORPORA;
  if (corpora.length === 0) {
    console.error(`Unknown namespace "${only}". Known: ${CORPORA.map((c) => c.namespace).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const kbDir = resolveKbDir();
  const dataDir = resolveDataDir();
  const freshnessFile = freshnessPath(dataDir);
  const legalFile = legalSourcesPath(dataDir);
  const existing = await readFreshnessFile(freshnessFile);

  console.log("Re-reading the published sources for each corpus.");
  console.log("A corpus that cannot be read is left as it was.");
  console.log(`Legal sources: ${legalFile}`);
  console.log(`Freshness record: ${freshnessFile}`);

  for (const listed of corpora) {
    const sources = await sourcesForRefresh(listed, { legalSourcesFile: legalFile });
    const corpus = corpusForFetch(listed, sources);
    const previous = recordForNamespace(listed.namespace, existing);

    const { record, outcome } = await applyRefresh({
      namespace: listed.namespace,
      sources,
      freshnessFile,
      previous,
      fetch: async () => toOutcome(await runFetch(kbDir, corpus)),
    });

    report(listed, sources, record, outcome);
  }
}

function corpusForFetch(corpus: Corpus, sources: { title: string; url: string }[]): Corpus {
  if (corpus.namespace !== "legal") return corpus;
  return {
    ...corpus,
    htmlPages: sources,
    markdownPages: undefined,
    index: undefined,
    full: undefined,
  };
}

function toOutcome(result: {
  leftUntouched: boolean;
  changed: boolean;
  failed: FetchOutcome["failed"];
  read: FetchOutcome["read"];
  builtAt: string | null;
  documents: number;
  chunks: number;
}): FetchOutcome {
  return {
    leftUntouched: result.leftUntouched,
    changed: result.changed,
    failed: result.failed,
    read: result.read,
    builtAt: result.builtAt,
    documents: result.documents,
    chunks: result.chunks,
  };
}

function report(
  corpus: Corpus,
  sources: { title: string; url: string }[],
  record: CorpusFreshnessRecord,
  outcome: FetchOutcome | null,
): void {
  console.log("");
  console.log(`[${corpus.namespace}] ${corpus.label}`);
  console.log(`  ${freshnessLine(record)}`);

  if (record.noSources) {
    console.log("  no sources listed — nothing was fetched, and this is not reported as current");
    return;
  }

  if (outcome) {
    if (outcome.leftUntouched) {
      console.log(`  ${corpus.file} left untouched`);
    } else if (outcome.changed) {
      console.log(`  ${corpus.file} rewritten — ${outcome.documents} documents, ${outcome.chunks} chunks`);
    } else {
      console.log(`  ${corpus.file} rewritten, same size as before — ${outcome.documents} documents, ${outcome.chunks} chunks`);
    }
    console.log(`  read ${outcome.read.length} of ${sources.length} listed sources`);
  }

  if (record.failedSources.length > 0) {
    console.log(`  could not read ${record.failedSources.length}:`);
    for (const failed of record.failedSources) {
      console.log(`    ${failed.url} — ${failed.reason}`);
    }
  }

  if (record.stale) {
    console.log("  stale: the previous corpus is still the one on disk");
  } else if (isFresh(record)) {
    console.log("  current");
  }

  if (record.lastReadAt) {
    console.log(`  last read: ${record.lastReadAt}`);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return /(^|[\\/])refresh-corpora\.(ts|js)$/.test(entry);
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    console.error(`\nrefresh-corpora failed: ${describe(err)}`);
    process.exitCode = 1;
  });
}
