/**
 * The one rule this file has: nothing published that a person has not
 * confirmed, and nothing rewritten once they have.
 *
 *   npx tsx --test shared/testimonials.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  TESTIMONIALS,
  TESTIMONIALS_CONFIRMED,
  UPWORK_AGENCY_URL,
  testimonialsFor,
} from "./testimonials";

describe("testimonials", () => {
  it("publishes nothing until a person has confirmed the words are theirs", () => {
    if (TESTIMONIALS_CONFIRMED) return;
    assert.deepEqual(testimonialsFor("main"), []);
    assert.deepEqual(testimonialsFor("adgrant"), []);
  });

  it("gives every row a source a visitor can open, and never invents a person", () => {
    /* saidBy is null on every Upwork row because that profile does not print
       the client's name without an account. A name appearing here later has
       to come from a source that prints it. */
    for (const row of TESTIMONIALS) {
      assert.ok(row.quote.trim().length > 0, `${row.id} has no words`);
      assert.ok(row.source.href.startsWith("https://"), `${row.id} has no source a visitor can open`);
      assert.ok(row.title.trim().length > 0, `${row.id} has no engagement title`);
      if (row.source.href === UPWORK_AGENCY_URL) {
        assert.equal(row.saidBy, null, `${row.id} names a person Upwork does not print publicly`);
      }
    }
  });

  it("has no two rows with the same id, so one cannot quietly replace another", () => {
    assert.equal(new Set(TESTIMONIALS.map((row) => row.id)).size, TESTIMONIALS.length);
  });
});
