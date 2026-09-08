/**
 * The one thing retrieval has to be true of: an agent reads its own corpus and
 * cannot reach anybody else's. Run it with:
 *
 *   npx tsx --test server/ai/kb.test.ts
 *
 * (`npm test` globs `server/*.test.ts`, one directory up. See the handoff note
 * in this parcel's report — package.json is a seam and was not edited here.)
 *
 * Why this file exists. Until now `retrieve()` took a query and searched every
 * chunk on disk. Setting a second door live in that state would have produced an
 * answer about Google Ad Grants, in the house voice, citing a real page on
 * developers.openai.com with a working link — and the only way to catch it would
 * have been to open the citation. That failure is silent, confident and
 * plausible, which is the worst combination this codebase can ship. So the test
 * is not "retrieval returns something sensible"; it is "a chunk that belongs to
 * another door's corpus never comes back", asserted against the files on disk
 * rather than against the retriever's own opinion of itself.
 *
 * Everything here reads the real corpora in data/kb/. A fixture would test the
 * code and not the thing that goes wrong.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { AGENTS, AGENT_BY_ID } from "@shared/roster";
import { DOORS } from "@shared/doors";

import { hasNamespace, kbNamespaces, loadKb, resolveKbDir, retrieve, type KbFile } from "./kb";

/* --------------------------- the corpora on disk --------------------------- */

/** A chunk identified by what it is, not by its position: ids renumber when a section is dropped. */
function keyOf(chunk: { url: string; heading: string; text: string }): string {
  return `${chunk.url}\u0000${chunk.heading}\u0000${chunk.text}`;
}

/** namespace -> the set of chunks that file actually contains. Read straight from disk. */
async function readCorpora(): Promise<Map<string, Set<string>>> {
  const dir = resolveKbDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && !f.endsWith(".embeddings.json"));
  const byNamespace = new Map<string, Set<string>>();

  for (const file of files) {
    const parsed = JSON.parse(await readFile(path.join(dir, file), "utf8")) as KbFile;
    const namespace = parsed.namespace ?? (file === "kb.json" ? "chatgpt-ads" : file.replace(/^kb\./, "").replace(/\.json$/, ""));
    byNamespace.set(namespace, new Set(parsed.chunks.map(keyOf)));
  }

  return byNamespace;
}

const corpora = await readCorpora();
const namespaces = [...corpora.keys()].sort();

// server/index.ts awaits this at boot; the synchronous accessors only kick it off.
await loadKb();

/**
 * Questions written in one door's vocabulary. Each is a strong match in its own
 * corpus, which is what makes it a useful probe against the other two: if
 * anything leaks, these are the queries that leak it.
 */
const PROBES: Record<string, string[]> = {
  "chatgpt-ads": [
    "How do I install the ChatGPT Ads measurement pixel and set pixel_id?",
    "What is the difference between oppref and obref in the Conversions API?",
    "How does event deduplication work between the pixel and the server?",
  ],
  "google-ads": [
    "Should we split PMax from Search, or let Performance Max absorb everything?",
    "How does Target CPA bidding decide bids, and what are bid limits?",
    "How do I upload offline conversions through the Google Ads API?",
  ],
  "ad-grants": [
    "Our Ad Grant account was deactivated over the 5% click-through rate requirement.",
    "What does the Ad Grant account management policy require for conversion tracking?",
    "What does a manager account link let an Ad Grants agency do, and can we remove it?",
  ],
  "linkedin-ads": [
    "How do I install the LinkedIn Insight Tag and send conversions through the Conversions API?",
    "Can we target a list of named accounts with Matched Audiences company list targeting?",
    "How do Lead Gen Forms reach our CRM, and what does the Revenue Attribution Report show?",
  ],
  "linkedin-automation": [
    "Which LinkedIn permissions are Open Permissions available to all developers without special approval?",
    "Usage of the Invitations API is restricted to approved partners subject to an API agreement.",
    "How does LinkedIn API rate limiting work, and what is the response when a call exceeds it?",
  ],
};

const ALL_PROBES = Object.values(PROBES).flat();

/* --------------------------------- tests ---------------------------------- */

test("every corpus in data/kb is loaded under its own namespace", () => {
  const loaded = kbNamespaces();
  assert.ok(loaded.length >= 3, `expected at least three corpora, loaded ${loaded.length}`);

  for (const namespace of namespaces) {
    const entry = loaded.find((c) => c.namespace === namespace);
    assert.ok(entry, `namespace "${namespace}" is on disk but was not loaded`);
    assert.equal(entry.chunks, corpora.get(namespace)?.size, `${namespace}: loaded a different number of chunks than the file holds`);
  }
});

test("an agent can never retrieve from a namespace that is not its own", async () => {
  // The whole point of the change. Every question is asked of every corpus, and
  // every chunk that comes back has to be a chunk of THAT file — checked against
  // the file, not against the score or the namespace label the retriever wrote.
  for (const namespace of namespaces) {
    const own = corpora.get(namespace);
    assert.ok(own);

    for (const question of ALL_PROBES) {
      const hits = await retrieve(namespace, question, 8);

      for (const hit of hits) {
        assert.equal(hit.namespace, namespace, `asked ${namespace}, got a chunk labelled ${hit.namespace}: ${hit.url}`);
        assert.ok(
          own.has(keyOf(hit)),
          `asked ${namespace} "${question}" and got a chunk that is not in that corpus: ${hit.url} — ${hit.heading}`,
        );
      }
    }
  }
});

test("a question only another corpus can answer returns nothing borrowed", async () => {
  // The sharper form of the same rule: the ChatGPT Ads corpus is the only one
  // that contains "oppref", and the Ad Grants corpus is the only one that
  // contains the 5% CTR requirement. Ask each of the wrong corpora and no page
  // from the right one may appear.
  const chatgptOnly = corpora.get("chatgpt-ads");
  const grantsOnly = corpora.get("ad-grants");
  assert.ok(chatgptOnly && grantsOnly);

  for (const hit of await retrieve("google-ads", "What is oppref and obref, and how do I deduplicate pixel events?", 8)) {
    assert.ok(!chatgptOnly.has(keyOf(hit)), `the Google Ads corpus returned a ChatGPT Ads page: ${hit.url}`);
    assert.ok(!hit.url.includes("developers.openai.com"), `the Google Ads corpus cited OpenAI: ${hit.url}`);
  }

  for (const hit of await retrieve("chatgpt-ads", "Ad Grants 5% click-through rate requirement and account deactivation", 8)) {
    assert.ok(!grantsOnly.has(keyOf(hit)), `the ChatGPT Ads corpus returned an Ad Grants page: ${hit.url}`);
    assert.ok(!hit.url.includes("support.google.com"), `the ChatGPT Ads corpus cited Google: ${hit.url}`);
  }
});

test("a namespace with no corpus retrieves nothing rather than falling back", async () => {
  // The wrong behaviour here is not an error — it is a confident answer out of
  // somebody else's documentation, which is exactly what returning [] prevents.
  //
  // The probe namespace is CHOSEN FROM DISK rather than named, because naming one
  // makes this test a tripwire for the next person to open a door: it used to
  // assert hasNamespace("linkedin-ads") === false, so the moment that corpus
  // landed, `npm run verify` went red in a file the door parcel does not own and
  // would not think to look in. The invariant is "an unknown namespace returns []
  // instead of falling back into a neighbour's documentation" — not "linkedin-ads
  // is unbuilt".
  const unbuilt = ["no-such-door", "linkedin-growth", "linkedin-ads", "linkedin-automation", "ai-builds"].find(
    (ns) => !hasNamespace(ns),
  );
  assert.ok(unbuilt, "every candidate namespace now has a corpus — add an unbuilt name to this list");
  assert.equal(hasNamespace(unbuilt), false);
  assert.deepEqual(await retrieve(unbuilt, "What is a realistic CPL for enterprise ABM on LinkedIn?", 8), []);
  assert.deepEqual(await retrieve("", "anything at all", 8), []);
});

test("every grounded agent names a corpus that exists", () => {
  for (const agent of AGENTS) {
    if (!agent.useKb) continue;
    assert.ok(agent.kbNamespace, `${agent.id} is useKb but names no corpus — it would answer from nothing`);
    assert.ok(
      hasNamespace(agent.kbNamespace),
      `${agent.id} reads namespace "${agent.kbNamespace}", which is not built. Run: npm run kb:fetch -- ${agent.kbNamespace}`,
    );
  }
});

test("a live door and its agent read the same corpus", () => {
  for (const door of DOORS) {
    if (door.status !== "live" || !door.firstAgentId) continue;
    const agent = AGENT_BY_ID[door.firstAgentId];
    assert.ok(agent, `door ${door.id} points at agent ${door.firstAgentId}, which does not exist`);
    assert.equal(
      agent.kbNamespace ?? null,
      door.kbNamespace,
      `door ${door.id} says it reads "${door.kbNamespace}" but its agent reads "${agent.kbNamespace}" — one of them is citing the wrong documentation`,
    );
  }
});

test("the buyer's shorthand reaches the page the documentation writes out in full", async () => {
  // Google never writes "PMax" — 2 chunks in 581 contain it, against ~300
  // mentions of "Performance Max" — so BM25 read the abbreviation as the rarest
  // and most important word in the question and returned those two. The door's
  // own starter asks about PMax, because that is the word a buyer types.
  const hits = await retrieve("google-ads", "Should we split PMax from Search?", 8);
  assert.ok(hits.length > 0, "the Google Ads corpus returned nothing for a PMax question");
  assert.ok(
    hits.some((hit) => /performance max/i.test(hit.title)),
    "a PMax question came back with no Performance Max page in it",
  );
});

test("the LinkedIn Ads door's printed questions reach LinkedIn's own pages", async () => {
  // There is no OPENAI_API_KEY on this machine, so /api/ask cannot answer here and
  // a screenshot would prove nothing. This is the evidence instead: two of the four
  // questions the LinkedIn Ads panel prints, asserted against the corpus on disk.
  //
  // Named rather than generic, because a starter that retrieves nothing is a
  // question printed for a visitor to be let down by — and this door's agent is the
  // one that answered a live visitor with a four-tier price list it had invented
  // (server/ai/grounding.test.ts). Its corpus is the only thing it may speak from,
  // so the corpus is the thing worth asserting.
  const questions: Array<{ question: string; expects: RegExp }> = [
    // The closed loop the door's blurb promises: spend on one side, CRM pipeline on
    // the other, one report.
    { question: "How do we get LinkedIn spend and CRM pipeline into one report?", expects: /revenue attribution|CRM/i },
    { question: "Lead gen forms vs landing pages for a $200 ACV product?", expects: /lead gen form/i },
  ];

  /*
   * BY URL, NOT BY HOST, and the difference is not academic — this assertion
   * went red the day a `legal` corpus was added, because it holds LinkedIn's
   * User Agreement and Professional Community Policies, which are also on
   * www.linkedin.com. Nothing had leaked. Two corpora simply share a host and
   * read different parts of it: /help/lms/… here, /legal/… there.
   *
   * Comparing addresses says what this test always meant — a retrieval from
   * this namespace returns this namespace's own documents — and it says it more
   * strictly than the host check did, since it would also catch a leak between
   * two corpora on the SAME host, which the old form could not see at all.
   *
   * Still read off the other corpora rather than typed out, so a corpus added
   * after this is covered without anybody remembering to come back here.
   */
  const foreign = new Set<string>();
  for (const [namespace, keys] of corpora) {
    if (namespace === "linkedin-ads") continue;
    for (const key of keys) foreign.add(key.split("\u0000")[0]);
  }
  assert.ok(foreign.size > 0, "no other corpus is on disk, so this test cannot show a leak");

  for (const { question, expects } of questions) {
    const hits = await retrieve("linkedin-ads", question, 8);
    assert.ok(hits.length > 0, `the LinkedIn Ads corpus returned nothing for "${question}"`);
    assert.ok(
      hits.some((hit) => expects.test(hit.title)),
      `"${question}" came back with no ${expects} page in it: ${hits.map((hit) => hit.title).join(" / ")}`,
    );

    for (const hit of hits) {
      const host = new URL(hit.url).host;
      assert.equal(host, "www.linkedin.com", `"${question}" cited ${host}, which is not LinkedIn's own documentation`);
      assert.ok(
        !foreign.has(hit.url),
        `"${question}" cited a page that belongs to another corpus: ${hit.url}`,
      );
    }
  }
});

test("the LinkedIn Automation door's printed questions reach LinkedIn's own developer pages", async () => {
  // Same evidence rule as the LinkedIn Ads case above: there is no OPENAI_API_KEY
  // on this machine, so /api/ask cannot answer here and a pasted answer would
  // prove nothing. Two named buyer questions, asserted against the corpus on
  // disk, and no hit from another corpus's host.
  //
  // The first is the panel starter about the official API, which is the fact
  // the door's blurb now states instead of "documented interfaces". The second
  // is the invitations question a buyer actually asks — the page it must reach
  // says the interface is restricted to approved partners, which is not the
  // same fact as "permitted".
  const questions: Array<{ question: string; expects: RegExp }> = [
    { question: "Can this be built against the official LinkedIn API instead of a browser session?", expects: /share on linkedin|sign in with linkedin|getting access/i },
    { question: "Can an app send connection invitations through the official API?", expects: /invitation/i },
  ];

  const foreign = new Set<string>();
  for (const [namespace, keys] of corpora) {
    if (namespace === "linkedin-automation") continue;
    for (const key of keys) foreign.add(new URL(key.split("\u0000")[0]).host);
  }
  assert.ok(foreign.size > 0, "no other corpus is on disk, so this test cannot show a leak");

  for (const { question, expects } of questions) {
    const hits = await retrieve("linkedin-automation", question, 8);
    assert.ok(hits.length > 0, `the LinkedIn automation corpus returned nothing for "${question}"`);
    assert.ok(
      hits.some((hit) => expects.test(hit.title)),
      `"${question}" came back with no ${expects} page in it: ${hits.map((hit) => hit.title).join(" / ")}`,
    );

    for (const hit of hits) {
      const host = new URL(hit.url).host;
      assert.equal(host, "learn.microsoft.com", `"${question}" cited ${host}, which is not LinkedIn's own developer documentation`);
      assert.ok(
        !foreign.has(host),
        `"${question}" cited ${host}, a host that belongs to another door's corpus: ${hit.url}`,
      );
    }
  }
});

test("the LinkedIn Automation Agent names the assessment and does not answer permitted", () => {
  const agent = AGENT_BY_ID["linkedin-automation"];
  assert.ok(agent, "the LinkedIn Automation Agent is missing from the roster");
  assert.equal(agent.kbNamespace, "linkedin-automation");
  const prompt = agent.systemPrompt.toLowerCase();
  assert.ok(
    prompt.includes("never say whether a particular automation is permitted"),
    "the agent's prompt dropped the refusal this door exists to carry",
  );
  assert.ok(
    prompt.includes("assessment"),
    "the agent's prompt no longer names the assessment it is supposed to stop at",
  );
});
