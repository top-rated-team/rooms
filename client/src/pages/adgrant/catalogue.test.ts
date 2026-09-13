/**
 * The AdGrant catalogue's finders, held to the one rule that has been broken
 * here before: a hidden row is hidden everywhere, not on the index only.
 *
 *   npx tsx --test client/src/pages/adgrant/catalogue.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DOORS } from "@shared/doors";
import { listedDoors, thisCatalogue, thisDoor, thisDoorBySlug } from "./catalogue";

describe("the AdGrant catalogue's finders", () => {
  it("clones every door, including the hidden ones", () => {
    /* The clone is the whole table: switching the LinkedIn review flag off
       must bring those rows back without a second edit here. */
    assert.equal(thisCatalogue().length, DOORS.length);
  });

  it("does not list a hidden row, and does not resolve one by id or by slug either", () => {
    const hidden = DOORS.filter((door) => door.hidden);
    assert.ok(hidden.length > 0, "nothing is hidden, so this test proves nothing — check shared/doors.ts");

    for (const door of hidden) {
      assert.equal(
        listedDoors().some((row) => row.id === door.id),
        false,
        `${door.id} is on the services list`,
      );
      assert.equal(thisDoor(door.id), undefined, `${door.id} resolves by id, so its page renders`);
      assert.equal(
        thisDoorBySlug(door.slug),
        undefined,
        `/services/${door.slug} renders a door that is hidden from every list`,
      );
    }
  });

  it("still resolves a visible door, so the guard did not take the page with it", () => {
    const grant = thisDoor("ad-grants");
    assert.ok(grant, "the Ad Grants door is what the front page and the shell are built on");
    assert.equal(thisDoorBySlug(grant.slug)?.id, "ad-grants");
    assert.match(grant.headline, /nonprofit/i);
  });
});
