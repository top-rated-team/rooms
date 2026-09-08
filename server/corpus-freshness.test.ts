/**
 * Corpus freshness. Run with:
 *
 *   npx tsx --test server/corpus-freshness.test.ts
 *
 * The cases that have to stay true: a re-fetch that fails leaves the previous
 * corpus intact and marks it stale; a namespace with no sources reports so
 * rather than reporting fresh; and the freshness record carries no chunk text.
 */

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyRefresh,
  freshnessFromOutcome,
  freshnessLine,
  hasChunkText,
  isFresh,
  parseLegalSources,
  readFreshnessFile,
  recordKeys,
  sanitizeRecord,
  writeNamespaceFreshness,
  type CorpusFreshnessRecord,
  type FetchOutcome,
  type SourceRef,
} from "./corpus-freshness";

const ATTEMPTED = "2026-09-08T22:00:00.000Z";
const PREVIOUS_BUILT = "2026-01-15T10:00:00.000Z";

const SOURCE: SourceRef = {
  title: "LinkedIn User Agreement",
  url: "https://www.linkedin.com/legal/user-agreement",
};

const PREVIOUS_CORPUS = {
  namespace: "legal",
  builtAt: PREVIOUS_BUILT,
  documents: 1,
  chunks: [
    {
      id: "legal/user-agreement#0",
      title: "User Agreement",
      url: SOURCE.url,
      heading: "User Agreement > Dos and Don'ts",
      text: "This sentence is corpus text and must never appear in a freshness record.",
    },
  ],
};

function failedOutcome(): FetchOutcome {
  return {
    leftUntouched: true,
    changed: false,
    failed: [{ title: SOURCE.title, url: SOURCE.url, reason: "could not be read" }],
    read: [],
    builtAt: PREVIOUS_BUILT,
    documents: 1,
    chunks: 1,
  };
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "corpus-freshness-"));
}

describe("a re-fetch that fails", () => {
  it("leaves the previous corpus intact and marks it stale", async () => {
    const dir = await tempDir();
    const corpusFile = path.join(dir, "kb.legal.json");
    const freshnessFile = path.join(dir, "corpus-freshness.json");
    const before = `${JSON.stringify(PREVIOUS_CORPUS, null, 1)}\n`;
    await writeFile(corpusFile, before, "utf8");

    let fetched = false;
    const { record, outcome } = await applyRefresh({
      namespace: "legal",
      sources: [SOURCE],
      freshnessFile,
      attemptedAt: ATTEMPTED,
      previous: { lastReadAt: PREVIOUS_BUILT },
      fetch: async () => {
        fetched = true;
        return failedOutcome();
      },
    });

    assert.equal(fetched, true, "a namespace with sources has to be read");
    assert.equal(outcome?.leftUntouched, true);
    assert.equal(record.stale, true);
    assert.equal(record.noSources, false);
    assert.equal(isFresh(record), false);
    assert.equal(record.lastReadAt, PREVIOUS_BUILT);

    const after = await readFile(corpusFile, "utf8");
    assert.equal(after, before, "the previous corpus file must be byte-identical");
  });
});

describe("a namespace with no sources", () => {
  it("reports so rather than reporting fresh", async () => {
    const dir = await tempDir();
    const freshnessFile = path.join(dir, "corpus-freshness.json");
    let fetched = false;

    const { record, outcome } = await applyRefresh({
      namespace: "legal",
      sources: [],
      freshnessFile,
      attemptedAt: ATTEMPTED,
      fetch: async () => {
        fetched = true;
        return {
          leftUntouched: false,
          changed: true,
          failed: [],
          read: [SOURCE],
          builtAt: ATTEMPTED,
          documents: 1,
          chunks: 1,
        };
      },
    });

    assert.equal(fetched, false, "there is nothing to fetch");
    assert.equal(outcome, null);
    assert.equal(record.noSources, true);
    assert.equal(record.stale, false);
    assert.equal(isFresh(record), false);
    assert.match(freshnessLine(record), /no sources/i);
  });
});

describe("the freshness record", () => {
  it("carries no chunk text", async () => {
    const dir = await tempDir();
    const freshnessFile = path.join(dir, "corpus-freshness.json");

    const record = freshnessFromOutcome({
      namespace: "legal",
      sources: [SOURCE],
      outcome: failedOutcome(),
      previous: { lastReadAt: PREVIOUS_BUILT },
      attemptedAt: ATTEMPTED,
    });

    assert.equal(hasChunkText(record), false);
    assert.ok(!recordKeys(record).has("text"));
    assert.ok(!recordKeys(record).has("chunks"));
    assert.ok(!JSON.stringify(record).includes(PREVIOUS_CORPUS.chunks[0].text));

    const written = await writeNamespaceFreshness(freshnessFile, {
      ...record,
      // A caller that tried to hang an excerpt on the record must not persist it.
      ...( { text: PREVIOUS_CORPUS.chunks[0].text, chunks: PREVIOUS_CORPUS.chunks } as unknown as CorpusFreshnessRecord),
    });
    assert.equal(hasChunkText(written), false);
    assert.ok(!JSON.stringify(written).includes(PREVIOUS_CORPUS.chunks[0].text));

    const file = await readFreshnessFile(freshnessFile);
    assert.ok(file);
    assert.equal(hasChunkText(file), false);
    assert.ok(!JSON.stringify(file).includes(PREVIOUS_CORPUS.chunks[0].text));
  });

  it("drops authored prose if someone puts it on a source entry", () => {
    const sources = parseLegalSources({
      namespace: "legal",
      sources: [
        {
          title: SOURCE.title,
          url: SOURCE.url,
          text: "An agent-written restatement of the User Agreement.",
          body: "more authored text",
        },
      ],
    });
    assert.deepEqual(sources, [SOURCE]);
    assert.equal(hasChunkText(sources), false);
  });
});

describe("sanitizeRecord", () => {
  it("keeps only the fields the room may show", () => {
    const clean = sanitizeRecord({
      namespace: "legal",
      lastAttemptAt: ATTEMPTED,
      lastReadAt: PREVIOUS_BUILT,
      stale: true,
      noSources: false,
      failedSources: [{ title: SOURCE.title, url: SOURCE.url, reason: "could not be read" }],
    });
    assert.deepEqual([...recordKeys(clean)].sort(), [
      "failedSources",
      "lastAttemptAt",
      "lastReadAt",
      "namespace",
      "noSources",
      "reason",
      "stale",
      "title",
      "url",
    ]);
  });
});
