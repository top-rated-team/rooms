/**
 * Generation quota. Run it with:
 *
 *   npx tsx --test server/adgrant/quota.test.ts
 *
 * Three per identified person. Counted when a structure is produced, not when
 * it is requested. Two people do not share a count.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GENERATION_CAP_REASON,
  GENERATIONS_PER_PERSON,
  OPERATIONS_PER_DAY,
  OPERATIONS_PER_GENERATION,
  personKeyFor,
  quotaViewForPerson,
  recordGeneration,
  remainingForPerson,
  resetAdgrantQuotaForTests,
} from "./quota";

beforeEach(() => {
  resetAdgrantQuotaForTests();
});

describe("the cap", () => {
  it("is three, and says why", () => {
    assert.equal(GENERATIONS_PER_PERSON, 3);
    assert.equal(OPERATIONS_PER_DAY, 15_000);
    assert.equal(OPERATIONS_PER_GENERATION, 150);
    assert.match(GENERATION_CAP_REASON, /15,000/);
    assert.match(GENERATION_CAP_REASON, /150/);
    assert.match(GENERATION_CAP_REASON, /not that write/);
  });
});

describe("remainingForPerson", () => {
  it("starts at three and is stated before anyone hits the limit", async () => {
    const person = personKeyFor({ provider: "linkedin", providerId: "sub-ada" });
    const view = await quotaViewForPerson(person);
    assert.equal(view.remaining, 3);
    assert.equal(view.cap, 3);
    assert.equal(view.capReason, GENERATION_CAP_REASON);
    assert.equal(await remainingForPerson(person), 3);
  });
});

describe("recordGeneration", () => {
  it("counts a produced structure, not a request, and stops at three", async () => {
    const person = personKeyFor({ provider: "linkedin", providerId: "sub-ada" });
    const first = await recordGeneration({ personKey: person, workspaceId: "ws_a" });
    assert.equal(first.recorded, true);
    assert.equal(first.remaining, 2);
    const second = await recordGeneration({ personKey: person, workspaceId: "ws_a" });
    assert.equal(second.remaining, 1);
    const third = await recordGeneration({ personKey: person, workspaceId: "ws_a" });
    assert.equal(third.remaining, 0);
    const fourth = await recordGeneration({ personKey: person, workspaceId: "ws_a" });
    assert.equal(fourth.recorded, false);
    assert.equal(fourth.remaining, 0);
    assert.equal(await remainingForPerson(person), 0);
  });

  it("keeps two identified people on separate counts", async () => {
    const ada = personKeyFor({ provider: "linkedin", providerId: "sub-ada" });
    const beau = personKeyFor({
      provider: "whatsapp",
      providerId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    await recordGeneration({ personKey: ada, workspaceId: "ws_a" });
    await recordGeneration({ personKey: ada, workspaceId: "ws_a" });
    assert.equal(await remainingForPerson(ada), 1);
    assert.equal(await remainingForPerson(beau), 3);
    assert.equal(ada.includes("phone"), false);
    assert.equal(beau.startsWith("whatsapp:"), true);
    assert.match(beau, /^whatsapp:[a-f0-9]+$/);
  });
});
