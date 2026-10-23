/**
 * Recurring lines and the weekly note. Run it with:
 *
 *   npx tsx --test server/digest.test.ts
 *
 * The cases that have to stay true: a weekly line that is checked off comes
 * back after a week, not before; a line that does not repeat stays done; the
 * note says what moved and what is waiting on the client; it does not mark
 * anything done and does not promise anything; an agent of the door writes it
 * when the room has one.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Member, Task, TaskStatus } from "@shared/schema";
import {
  composeDigestBody,
  digestAuthor,
  dueToReopen,
  isWaitingOnClient,
  observeTasks,
  repeatOf,
  resetDigestForTests,
  roomNowLine,
  runWeeklyDigest,
  setTaskRepeat,
  waitingOnName,
} from "./digest";
import { storage } from "./storage";

beforeEach(() => {
  resetDigestForTests();
});

const WEEK_LATER = new Date("2026-09-15T12:00:00.000Z");
const TODAY = new Date("2026-09-08T12:00:00.000Z");
const TWO_WEEKS = new Date("2026-09-22T12:00:00.000Z");

function member(partial: Partial<Member> & Pick<Member, "memberKey" | "kind" | "displayName">): Member {
  return {
    id: partial.id ?? partial.memberKey,
    workspaceId: partial.workspaceId ?? "ws",
    role: partial.role ?? null,
    initials: partial.initials ?? "XX",
    presence: partial.presence ?? "online",
    joinedAt: partial.joinedAt ?? TODAY,
    ...partial,
  };
}

function task(partial: Partial<Task> & Pick<Task, "id" | "title" | "status">): Task {
  return {
    workspaceId: partial.workspaceId ?? "ws",
    detail: partial.detail ?? null,
    assigneeKey: partial.assigneeKey ?? null,
    orderIndex: partial.orderIndex ?? 0,
    createdAt: partial.createdAt ?? TODAY,
    repeat: partial.repeat,
    ...partial,
  };
}

const VISITOR = member({ memberKey: "visitor", kind: "visitor", displayName: "You" });
const IHOR = member({ memberKey: "human:ihor", kind: "expert", displayName: "Ihor" });
const MEMBERS = [VISITOR, IHOR];

async function openRoom(door: string) {
  const created = await storage.createWorkspace({
    name: "Digest room",
    source: { door },
  });
  return {
    token: created.token,
    workspaceId: created.workspace.id,
    channelId: created.channels[0].id,
    tasks: created.tasks,
    members: created.members,
  };
}

describe("the line at the top of the channel", () => {
  it("says nothing is on the list when the list is empty", () => {
    assert.equal(roomNowLine([], MEMBERS), "Nothing on the list yet.");
  });

  it("says the list is clear when every line is done", () => {
    const done = task({ id: "a", title: "Map the funnel", status: "done" });
    assert.equal(roomNowLine([done], MEMBERS), "The list is clear.");
  });

  it("names what is moving and who is on it", () => {
    const moving = task({
      id: "a",
      title: "Install the ChatGPT Ads measurement pixel",
      status: "in_progress",
      assigneeKey: "human:ihor",
    });
    assert.equal(
      roomNowLine([moving], MEMBERS),
      "Still moving: Install the ChatGPT Ads measurement pixel, with Ihor.",
    );
  });

  it("says who the room is waiting on, and names the client as the client", () => {
    const waiting = task({
      id: "a",
      title: "Confirm the pixel ID",
      status: "blocked",
      assigneeKey: "visitor",
    });
    assert.equal(roomNowLine([waiting], MEMBERS), "Waiting on the client: Confirm the pixel ID.");
    assert.equal(waitingOnName("visitor", MEMBERS), "the client");
    assert.equal(isWaitingOnClient(waiting, MEMBERS), true);
  });

  it("uses a named visitor's name rather than the word client", () => {
    const alex = member({ memberKey: "visitor", kind: "visitor", displayName: "Alex" });
    assert.equal(waitingOnName("visitor", [alex]), "Alex");
  });

  it("says the next open line when nothing is moving or waiting", () => {
    const next = task({ id: "a", title: "Map the funnel to conversion events", status: "todo" });
    assert.equal(roomNowLine([next], MEMBERS), "Next: Map the funnel to conversion events.");
  });
});

describe("the weekly note", () => {
  it("says what moved and what is waiting on the client", () => {
    const moved = task({ id: "a", title: "Map the funnel to conversion events", status: "done" });
    const waiting = task({
      id: "b",
      title: "Confirm the pixel ID",
      status: "todo",
      assigneeKey: "visitor",
    });
    const body = composeDigestBody([moved, waiting], MEMBERS, TODAY);
    assert.match(body, /8 Sep 2026/);
    assert.match(body, /What moved/);
    assert.match(body, /Map the funnel to conversion events/);
    assert.match(body, /Waiting on the client/);
    assert.match(body, /Confirm the pixel ID/);
    assert.match(body, /does not change or promise anything/);
    assert.match(body, /A person in this room does that/);
  });

  it("does not promise work, and does not claim a write to an account", () => {
    const body = composeDigestBody(
      [task({ id: "a", title: "Install the pixel", status: "in_progress", assigneeKey: "human:ihor" })],
      MEMBERS,
      TODAY,
    );
    assert.doesNotMatch(body, /we will|we'll|I will|we promise/i);
    assert.doesNotMatch(body, /live in your|has been written/i);
    assert.doesNotMatch(body, /!/);
  });

  it("says when nothing moved and nothing is waiting", () => {
    const body = composeDigestBody(
      [task({ id: "a", title: "Map the funnel", status: "todo", assigneeKey: "human:ihor" })],
      MEMBERS,
      TODAY,
    );
    assert.match(body, /Nothing moved, and nothing is waiting on the client/);
  });
});

describe("checking off a repeating line", () => {
  it("does not bring it back the same day", () => {
    const weekly = task({ id: "rec", title: "Weekly search-term review", status: "done", repeat: "weekly" });
    observeTasks([weekly], TODAY);
    assert.equal(repeatOf(weekly), "weekly");
    assert.equal(dueToReopen(weekly, TODAY), false);
  });

  it("brings it back the following week, and leaves a one-off line done", () => {
    const weekly = task({ id: "rec", title: "Weekly search-term review", status: "done", repeat: "weekly" });
    const once = task({ id: "once", title: "Map the funnel", status: "done" });
    observeTasks([weekly, once], TODAY);
    assert.equal(dueToReopen(weekly, WEEK_LATER), true);
    assert.equal(dueToReopen(once, WEEK_LATER), false);
  });

  it("does not treat a line as repeating unless it is set to", () => {
    const open = task({ id: "x", title: "Map the funnel", status: "done" });
    setTaskRepeat("x", null);
    observeTasks([open], TODAY);
    assert.equal(repeatOf(open), null);
    assert.equal(dueToReopen(open, WEEK_LATER), false);
  });
});

describe("running the weekly note in a room", () => {
  it("reopens a weekly line after a week and posts one note, as the door's agent", async () => {
    const room = await openRoom("chatgpt-ads");
    assert.ok(room.tasks.length > 0);
    const target = room.tasks[0];
    await storage.updateTask(target.id, { status: "done", repeat: "weekly" } as { status: TaskStatus });
    setTaskRepeat(target.id, "weekly");

    const first = await runWeeklyDigest(room.token, TODAY);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.reopened.length, 0);
    assert.equal(first.posted, true);
    assert.equal(first.message?.authorKind, "agent");
    assert.equal(first.message?.authorKey, "agent:chatgpt-ads");
    assert.match(first.message?.body ?? "", /does not change or promise anything/);
    assert.doesNotMatch(first.message?.body ?? "", /we will|we'll|I will|we promise/i);
    assert.doesNotMatch(first.message?.body ?? "", /!/);

    const still = await storage.getWorkspaceByToken(room.token);
    const doneRow = still?.tasks.find((row) => row.id === target.id);
    assert.equal(doneRow?.status, "done");

    const second = await runWeeklyDigest(room.token, WEEK_LATER);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.reopened.length, 1);
    assert.equal(second.reopened[0]?.id, target.id);
    assert.equal(second.reopened[0]?.status, "todo");
    assert.match(second.message?.body ?? "", /Back on the list this week/);
    assert.match(second.message?.body ?? "", new RegExp(target.title));

    const after = await storage.getWorkspaceByToken(room.token);
    assert.equal(after?.tasks.find((row) => row.id === target.id)?.status, "todo");
  });

  it("does not post a second note in the same week, and still reopens when due", async () => {
    const room = await openRoom("chatgpt-ads");
    const target = room.tasks[0];
    await storage.updateTask(target.id, { status: "done", repeat: "weekly" } as { status: TaskStatus });
    setTaskRepeat(target.id, "weekly");

    const first = await runWeeklyDigest(room.token, TODAY);
    assert.equal(first.ok && first.posted, true);

    const sameWeek = await runWeeklyDigest(room.token, new Date(TODAY.getTime() + 2 * 24 * 60 * 60 * 1000));
    assert.equal(sameWeek.ok, true);
    if (!sameWeek.ok) return;
    assert.equal(sameWeek.posted, false);
    assert.equal(sameWeek.message, null);

    const later = await runWeeklyDigest(room.token, WEEK_LATER);
    assert.equal(later.ok, true);
    if (!later.ok) return;
    assert.equal(later.posted, true);
    assert.equal(later.reopened.length, 1);
  });

  it("leaves a line that does not repeat done, and never marks anything done itself", async () => {
    const room = await openRoom("chatgpt-ads");
    const [first, second] = room.tasks;
    await storage.updateTask(first.id, { status: "done" });
    await storage.updateTask(second.id, { status: "todo" });

    const result = await runWeeklyDigest(room.token, WEEK_LATER);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.reopened.length, 0);

    const after = await storage.getWorkspaceByToken(room.token);
    assert.equal(after?.tasks.find((row) => row.id === first.id)?.status, "done");
    assert.equal(after?.tasks.find((row) => row.id === second.id)?.status, "todo");
  });

  it("writes as the room, not as an agent, when the door has no agent of ours", async () => {
    const room = await openRoom("linkedin-growth");
    const added = await storage.addTask(room.workspaceId, {
      title: "Send this week's report",
      status: "todo",
    });
    setTaskRepeat(added.id, "weekly");
    await storage.updateTask(added.id, { status: "done" });

    const result = await runWeeklyDigest(room.token, TODAY);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.posted, true);
    assert.equal(result.message?.authorKind, "system");
    assert.equal(result.message?.authorKey, "system");
    assert.equal(digestAuthor({ door: "linkedin-growth" }, room.members).authorKind, "system");
  });

  it("chases a repeating line that came back and is still open a week later", async () => {
    const room = await openRoom("chatgpt-ads");
    const target = room.tasks[0];
    await storage.updateTask(target.id, { status: "done", repeat: "weekly" } as { status: TaskStatus });
    setTaskRepeat(target.id, "weekly");

    await runWeeklyDigest(room.token, TODAY);
    const reopened = await runWeeklyDigest(room.token, WEEK_LATER);
    assert.equal(reopened.ok && reopened.reopened.length, 1);

    const chased = await runWeeklyDigest(room.token, TWO_WEEKS);
    assert.equal(chased.ok, true);
    if (!chased.ok) return;
    assert.equal(chased.posted, true);
    assert.match(chased.message?.body ?? "", /Still open, and late/);
    assert.match(chased.message?.body ?? "", new RegExp(target.title));
    assert.doesNotMatch(chased.message?.body ?? "", /I will|we will|we promise/i);
  });
});
