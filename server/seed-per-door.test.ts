/**
 * A room is seeded from the door it was opened through. Run it with:
 *
 *   npx tsx --test --test-force-exit server/seed-per-door.test.ts
 *
 * WHY. Every room used to be seeded identically: #conversion-tracking, the
 * ChatGPT Ads agent, the Conversion Tracking agent, Ihor, Dan, and a six-line
 * checklist about measuring ChatGPT Ads conversions — whichever door the
 * visitor came through.
 *
 * Two consequences, and the second is the one that matters. A charity arriving
 * through Google Ad Grants was told the checklist on the right was its
 * conversion-tracking engagement. And a client arriving through the PARTNER's
 * door landed in a room staffed by Top-Rated Team's people, on Top-Rated Team's
 * services — with the member rail printing an accountability line naming the
 * partner as the payer of our contractor. That is not untidy. It is false, and
 * it is false about money, in the one part of this product whose whole job is
 * being trustworthy about who is answerable.
 *
 * It was reported on 6 September by the agent that rebuilt the room, could not
 * fix it because the files were not its to edit, and stayed open through four
 * more waves. These are the assertions that keep it shut.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { DOORS, DOOR_BY_ID, DEFAULT_DOOR_ID } from "@shared/doors";
import { seedFor } from "@shared/playbook";

const OURS = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

function planFor(doorId: string) {
  const door = DOOR_BY_ID[doorId];
  assert.ok(door, `no door called ${doorId}`);
  return seedFor({
    id: door.id,
    slug: door.slug,
    headline: door.headline,
    firstAgentId: door.firstAgentId,
    ours: door.contract.legalName === OURS,
  });
}

test("a partner's room contains nothing of ours", () => {
  const partner = DOORS.find((door) => door.contract.legalName !== OURS);
  assert.ok(partner, "no partner door in the table; this test has lost its subject");
  const plan = planFor(partner.id);

  assert.deepEqual(plan.expertIds, [], "our people were seeded into a room we do not invoice");
  assert.deepEqual(plan.tasks, [], "our checklist was seeded into somebody else's engagement");
  assert.equal(plan.channels.length, 1, "a partner's room gets one project channel and nothing else");
  assert.equal(plan.channels[0].kind, "project");
  assert.ok(
    plan.channels.every((channel) => channel.kind !== "agent"),
    "no agent of ours answers in a partner's room",
  );
});

test("no door is given another door's checklist", () => {
  for (const door of DOORS) {
    const plan = planFor(door.id);
    if (door.id === DEFAULT_DOOR_ID) {
      assert.ok(plan.tasks.length > 0, "the door whose checklist is written should carry it");
      continue;
    }
    assert.deepEqual(
      plan.tasks,
      [],
      `${door.id} was seeded with a checklist that was written for another door. An empty checklist is a room ` +
        `waiting to be filled; somebody else's checklist tells the client the wrong thing about what they bought.`,
    );
  }
});

test("every channel in a room has its own slug", () => {
  // The agent channel is `ask-` prefixed because on several doors the agent's
  // id IS the door's slug, and two channels with one slug means anything
  // looking a channel up by slug has two answers.
  for (const door of DOORS) {
    const slugs = planFor(door.id).channels.map((channel) => channel.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${door.id} seeds two channels with the same slug: ${slugs.join(", ")}`);
  }
});

test("a room on one of our doors names that door, not the flagship", () => {
  for (const door of DOORS) {
    if (door.contract.legalName !== OURS) continue;
    const plan = planFor(door.id);
    assert.equal(plan.channels[0].slug, door.slug, `${door.id}'s project channel is not named after it`);
    if (door.firstAgentId) {
      assert.ok(
        plan.channels.some((channel) => channel.counterpartKey === `agent:${door.firstAgentId}`),
        `${door.id} has an agent and no channel to reach it in`,
      );
    }
    assert.ok(
      plan.channels.every(
        (channel) => channel.kind !== "agent" || channel.counterpartKey === `agent:${door.firstAgentId}`,
      ),
      `${door.id} seeds a channel for an agent that is not its own`,
    );
  }
});
