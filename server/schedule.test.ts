/**
 * The weekly trigger. Run it with:
 *
 *   npx tsx --test server/schedule.test.ts
 *
 * The cases that have to stay true: it fires once a week; it does not fire
 * twice in the same week; a room with nothing to say is left alone; and it
 * does not start at all when WEEKLY_DIGEST is unset.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TaskStatus } from "@shared/schema";
import { resetDigestForTests, setTaskRepeat, WEEK_MS } from "./digest";
import {
  startDigestSchedule,
  stopDigestSchedule,
  WEEKLY_DIGEST_ENV,
} from "./schedule";
import { storage } from "./storage";

const TODAY = new Date("2026-09-08T12:00:00.000Z");
const TWO_DAYS = new Date("2026-09-10T12:00:00.000Z");
const WEEK_LATER = new Date("2026-09-15T12:00:00.000Z");

beforeEach(() => {
  resetDigestForTests();
  stopDigestSchedule();
  delete process.env[WEEKLY_DIGEST_ENV];
});

afterEach(() => {
  stopDigestSchedule();
  delete process.env[WEEKLY_DIGEST_ENV];
});

function digestMessages(token: string) {
  return storage.getWorkspaceByToken(token).then((state) => {
    const messages = state?.messages ?? [];
    return messages.filter((message) => {
      const meta = message.meta as { digest?: unknown } | null | undefined;
      return Boolean(meta && typeof meta === "object" && meta.digest);
    });
  });
}

async function openRoom(door: string) {
  const created = await storage.createWorkspace({
    name: "Schedule room",
    source: { door },
  });
  return {
    token: created.token,
    workspaceId: created.workspace.id,
    tasks: created.tasks,
  };
}

async function roomWithSomethingToSay() {
  const room = await openRoom("chatgpt-ads");
  const target = room.tasks[0];
  assert.ok(target, "the ChatGPT Ads door seeds a checklist, so there is a line to mark done");
  await storage.updateTask(target.id, { status: "done", repeat: "weekly" } as { status: TaskStatus });
  setTaskRepeat(target.id, "weekly");
  return room;
}

function captureInterval() {
  const ticks: Array<() => unknown> = [];
  let intervalMs: number | undefined;
  let started = 0;
  return {
    ticks,
    get intervalMs() {
      return intervalMs;
    },
    get started() {
      return started;
    },
    setInterval(callback: () => unknown, ms: number) {
      started += 1;
      intervalMs = ms;
      ticks.push(callback);
      return { unref() {} };
    },
    clearInterval() {
      ticks.length = 0;
    },
  };
}

describe("the weekly trigger", () => {
  it("does not start at all when the variable is unset", () => {
    const timers = captureInterval();
    const off = startDigestSchedule({
      env: {},
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    assert.equal(off.started, false);
    assert.equal(timers.started, 0);

    const empty = startDigestSchedule({
      env: { [WEEKLY_DIGEST_ENV]: "" },
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    assert.equal(empty.started, false);
    assert.equal(timers.started, 0);

    const zero = startDigestSchedule({
      env: { [WEEKLY_DIGEST_ENV]: "0" },
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    assert.equal(zero.started, false);
    assert.equal(timers.started, 0);
  });

  it("fires once a week", async () => {
    const room = await roomWithSomethingToSay();
    const timers = captureInterval();
    let now = TODAY;

    const started = startDigestSchedule({
      env: { [WEEKLY_DIGEST_ENV]: "1" },
      now: () => now,
      listTokens: async () => [room.token],
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    assert.equal(started.started, true);
    assert.equal(timers.started, 1);
    assert.equal(timers.intervalMs, WEEK_MS);
    assert.equal(timers.ticks.length, 1);
    assert.equal((await digestMessages(room.token)).length, 0, "the timer waits a week before the first note");

    now = TODAY;
    await timers.ticks[0]?.();
    assert.equal((await digestMessages(room.token)).length, 1);

    now = WEEK_LATER;
    await timers.ticks[0]?.();
    assert.equal((await digestMessages(room.token)).length, 2);
  });

  it("does not fire twice", async () => {
    const room = await roomWithSomethingToSay();
    const timers = captureInterval();
    let now = TODAY;

    startDigestSchedule({
      env: { [WEEKLY_DIGEST_ENV]: "true" },
      now: () => now,
      listTokens: async () => [room.token],
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });

    const again = startDigestSchedule({
      env: { [WEEKLY_DIGEST_ENV]: "true" },
      now: () => now,
      listTokens: async () => [room.token],
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    assert.equal(again.started, true);
    assert.equal(timers.started, 1, "one timer for the process, not one per start");

    await timers.ticks[0]?.();
    assert.equal((await digestMessages(room.token)).length, 1);

    now = TWO_DAYS;
    await timers.ticks[0]?.();
    assert.equal((await digestMessages(room.token)).length, 1);
  });

  it("does not fire for a room with nothing to say", async () => {
    const silent = await openRoom("linkedin-growth");
    const busy = await roomWithSomethingToSay();
    const timers = captureInterval();

    startDigestSchedule({
      env: { [WEEKLY_DIGEST_ENV]: "on" },
      now: () => TODAY,
      listTokens: async () => [silent.token, busy.token],
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });

    await timers.ticks[0]?.();

    assert.equal((await digestMessages(silent.token)).length, 0);
    assert.equal(silent.tasks.length, 0, "the partner door seeds no checklist, so there is nothing to say");
    assert.equal((await digestMessages(busy.token)).length, 1);
  });
});
