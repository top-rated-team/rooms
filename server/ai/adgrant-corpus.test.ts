/**
 * Our Ad Grants material and Google's Ad Grants documentation must never
 * share a URL. The ad-grants corpus is Google's own pages. kb.adgrant-ai.json
 * is ours: case studies, templates, tricks, verticals, and what the tool on
 * adgrant.ai actually takes. Mixing them would let the agent cite our practice
 * as Google's rule. Run with:
 *
 *   npx tsx --test server/ai/adgrant-corpus.test.ts
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DOOR_BY_ID } from "@shared/doors";

import { resolveKbDir, type KbFile } from "./kb";

async function readCorpus(file: string): Promise<KbFile> {
  const parsed = JSON.parse(await readFile(path.join(resolveKbDir(), file), "utf8")) as KbFile;
  assert.ok(Array.isArray(parsed.chunks), `${file} has no chunks array`);
  return parsed;
}

function hostOf(url: string): string {
  return new URL(url).host;
}

const ours = await readCorpus("kb.adgrant-ai.json");
const googles = await readCorpus("kb.ad-grants.json");

test("the AdGrant.AI corpus declares its own namespace", () => {
  assert.equal(ours.namespace, "adgrant-ai");
  assert.ok(ours.chunks.length > 0, "kb.adgrant-ai.json has no chunks");
});

test("no chunk from our AdGrant.AI corpus carries a support.google.com URL", () => {
  for (const chunk of ours.chunks) {
    const host = hostOf(chunk.url);
    assert.notEqual(
      host,
      "support.google.com",
      `our corpus cited Google's help centre: ${chunk.url} — ${chunk.heading}`,
    );
    assert.ok(
      !host.endsWith("google.com"),
      `our corpus cited a Google host (${host}): ${chunk.url} — put Google's documentation in kb.ad-grants.json`,
    );
  }
});

test("no chunk from Google's Ad Grants corpus carries an adgrant.ai URL", () => {
  for (const chunk of googles.chunks) {
    const host = hostOf(chunk.url);
    assert.notEqual(
      host,
      "adgrant.ai",
      `Google's corpus cited our site: ${chunk.url} — ${chunk.heading}`,
    );
    assert.ok(
      !host.includes("adgrant"),
      `Google's corpus cited an AdGrant host (${host}): ${chunk.url}`,
    );
  }
});

test("every chunk in our AdGrant.AI corpus cites adgrant.ai", () => {
  for (const chunk of ours.chunks) {
    assert.equal(
      hostOf(chunk.url),
      "adgrant.ai",
      `our corpus cited ${chunk.url}, which is not adgrant.ai`,
    );
  }
});

test("the Ad Grants door names our material as a second namespace", () => {
  const door = DOOR_BY_ID["ad-grants"];
  assert.ok(door, "the ad-grants door is missing");
  assert.equal(door.kbNamespace, "ad-grants", "the door's platform corpus must stay Google's");
  assert.equal(
    door.ownKbNamespace,
    "adgrant-ai",
    "the door must point at kb.adgrant-ai.json under its own namespace, not mix it into Google's",
  );
});
