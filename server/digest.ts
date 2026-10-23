/**
 * Recurring work and the weekly note, inside the room.
 *
 * Four of the doors are retainers. The method has to live on the task card
 * and in one message, not on a screen of its own. Three primitives:
 *
 *   1. A task marked `repeat: "weekly"` comes back onto the list a week after
 *      it is marked done. The status change is mechanical. It is not a promise
 *      that the work will be done, and this file never marks a line done.
 *   2. One weekly message: what moved, what is waiting on the client, and
 *      what is late. An agent of this door authors it when the room has one.
 *      The words are a record of the list. They do not change the list, and
 *      they do not promise anything.
 *   3. One line for the channel header: what the room is doing now and who
 *      it is waiting on. ChannelHeader already prints a line in that spot.
 *
 * WHERE THIS LIVES. Repeat is an optional field on the task (shared/schema.ts).
 * Done-at and last-note times sit in this process, because the task row has
 * no clock of its own for when it was checked off. A restart forgets those
 * clocks. Nothing a visitor reads claims a timer is running on another machine.
 *
 * WHO CALLS THIS. `runWeeklyDigest` is the whole entry. Routes do not call
 * it yet. Until they do, the tests are what hold the behaviour.
 */

import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import type { Member, MemberKind, Message, Task, TaskRepeat } from "@shared/schema";
/* Moved to shared/ so the channel header can print the same sentence. One
   implementation: a header saying one thing while the digest said another would
   be worse than either. Re-exported because the tests and the composer below
   both read them from here. */
import { isWaitingOnClient, roomNowLine, waitingOnName } from "@shared/room-now";
import { storage } from "./storage";
import { broadcast } from "./ws";

export { isWaitingOnClient, roomNowLine, waitingOnName };

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const RECORD_FOOTER =
  "This is a record of the list. It does not change or promise anything. A person in this room does that.";

interface RepeatRecord {
  repeat: TaskRepeat | null;
  doneAt: number | null;
  reopenedAt: number | null;
}

const records = new Map<string, RepeatRecord>();
const lastNoteAt = new Map<string, number>();

export function resetDigestForTests(): void {
  records.clear();
  lastNoteAt.clear();
}

export function repeatOf(task: Task): TaskRepeat | null {
  const remembered = records.get(task.id)?.repeat ?? null;
  return task.repeat === "weekly" || remembered === "weekly" ? "weekly" : null;
}

export function setTaskRepeat(taskId: string, repeat: TaskRepeat | null): void {
  const existing = records.get(taskId) ?? { repeat: null, doneAt: null, reopenedAt: null };
  records.set(taskId, { ...existing, repeat });
}

function recordOf(taskId: string): RepeatRecord {
  const existing = records.get(taskId);
  if (existing) return existing;
  const created: RepeatRecord = { repeat: null, doneAt: null, reopenedAt: null };
  records.set(taskId, created);
  return created;
}

function isVisitorKey(key: string | null, members: Member[]): boolean {
  if (!key) return false;
  if (key === "visitor") return true;
  return members.some((member) => member.memberKey === key && member.kind === "visitor");
}

function displayNameOf(key: string | null, members: Member[]): string | null {
  if (!key) return null;
  const member = members.find((row) => row.memberKey === key);
  if (member) return member.displayName;
  return null;
}


export function dayLabel(at: Date): string {
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

function withPeriod(line: string): string {
  return /[.?!]$/.test(line) ? line : `${line}.`;
}

export interface DigestSections {
  moved: Task[];
  moving: Task[];
  waitingOnClient: Task[];
  late: Task[];
  backThisWeek: Task[];
}

function isLate(task: Task, at: number, members: Member[]): boolean {
  if (task.status === "done") return false;
  if (task.status === "blocked" && !isWaitingOnClient(task, members)) return true;
  const row = records.get(task.id);
  if (repeatOf(task) !== "weekly") return false;
  if (row?.reopenedAt == null) return false;
  return at - row.reopenedAt >= WEEK_MS;
}

export function digestSections(tasks: Task[], members: Member[], at: Date, backThisWeek: Task[] = []): DigestSections {
  const now = at.getTime();
  return {
    moved: tasks.filter((task) => task.status === "done"),
    moving: tasks.filter((task) => task.status === "in_progress" && !isWaitingOnClient(task, members)),
    waitingOnClient: tasks.filter((task) => isWaitingOnClient(task, members)),
    late: tasks.filter((task) => isLate(task, now, members)),
    backThisWeek,
  };
}

function listBlock(heading: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [`${heading}\n${lines.map((line) => `- ${line}`).join("\n")}`];
}

function lineFor(task: Task, members: Member[], suffix?: string): string {
  const who = waitingOnName(task.assigneeKey, members);
  const withWho = who === "nobody" || who === "the client" ? "" : `, with ${who}`;
  return `${task.title}${suffix ?? ""}${withWho}`;
}

/**
 * The weekly note, as plain words. Empty sections are omitted. The footer is
 * always there, so a visitor cannot read this as a promise.
 */
export function composeDigestBody(tasks: Task[], members: Member[], at: Date, backThisWeek: Task[] = []): string {
  const sections = digestSections(tasks, members, at, backThisWeek);
  const blocks: string[] = [dayLabel(at)];

  blocks.push(
    ...listBlock(
      "What moved",
      sections.moved.map((task) => lineFor(task, members)),
    ),
  );
  blocks.push(
    ...listBlock(
      "Still moving",
      sections.moving.map((task) => lineFor(task, members)),
    ),
  );
  blocks.push(
    ...listBlock(
      "Waiting on the client",
      sections.waitingOnClient.map((task) => task.title),
    ),
  );
  blocks.push(
    ...listBlock(
      "Still open, and late",
      sections.late.map((task) => lineFor(task, members)),
    ),
  );
  blocks.push(
    ...listBlock(
      "Back on the list this week",
      sections.backThisWeek.map((task) => task.title),
    ),
  );

  const hasWork =
    sections.moved.length +
      sections.moving.length +
      sections.waitingOnClient.length +
      sections.late.length +
      sections.backThisWeek.length >
    0;
  if (!hasWork) {
    blocks.push("Nothing moved, and nothing is waiting on the client.");
  }

  blocks.push(RECORD_FOOTER);
  return blocks.join("\n\n");
}

export function dueToReopen(task: Task, at: Date): boolean {
  if (repeatOf(task) !== "weekly") return false;
  if (task.status !== "done") return false;
  const row = records.get(task.id);
  if (row?.doneAt == null) return false;
  return at.getTime() - row.doneAt >= WEEK_MS;
}

function observeTask(task: Task, at: Date): void {
  const weekly = repeatOf(task);
  const row = recordOf(task.id);
  if (weekly) row.repeat = "weekly";
  else if (task.repeat === null) row.repeat = null;

  if (task.status === "done" && weekly) {
    if (row.doneAt == null) row.doneAt = at.getTime();
  } else {
    row.doneAt = null;
  }
}

export function observeTasks(tasks: Task[], at: Date): void {
  for (const task of tasks) observeTask(task, at);
}

function doorOf(source: Record<string, string> | null | undefined) {
  const id = source?.door?.trim();
  return (id && DOOR_BY_ID[id]) || DOOR_BY_ID[DEFAULT_DOOR_ID];
}

export function digestAuthor(source: Record<string, string> | null | undefined, members: Member[]): {
  authorKey: string;
  authorKind: MemberKind;
} {
  const door = doorOf(source);
  if (!door.firstAgentId) return { authorKey: "system", authorKind: "system" };
  const key = `agent:${door.firstAgentId}`;
  const present = members.some((member) => member.memberKey === key);
  if (!present) return { authorKey: "system", authorKind: "system" };
  return { authorKey: key, authorKind: "agent" };
}

export type WeeklyDigestResult =
  | { ok: true; posted: boolean; message: Message | null; reopened: Task[] }
  | { ok: false; error: string };

/**
 * Reopen repeating lines that have been done for a week, and post the weekly
 * note when a week has passed since the last one. Never marks a line done.
 * Never changes a title, an assignee, or a promise.
 */
export async function runWeeklyDigest(token: string, at: Date = new Date()): Promise<WeeklyDigestResult> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return { ok: false, error: "Workspace not found" };

  for (const task of state.tasks) {
    if (task.repeat === "weekly") setTaskRepeat(task.id, "weekly");
    if (task.repeat === null) setTaskRepeat(task.id, null);
  }
  observeTasks(state.tasks, at);

  const reopened: Task[] = [];
  for (const task of state.tasks) {
    if (!dueToReopen(task, at)) continue;
    const updated = await storage.updateTask(task.id, { status: "todo" });
    if (!updated) continue;
    updated.repeat = "weekly";
    const row = recordOf(task.id);
    row.repeat = "weekly";
    row.doneAt = null;
    row.reopenedAt = at.getTime();
    reopened.push(updated);
    broadcast(token, { type: "task", task: updated });
  }

  const remaining = state.tasks.map((task) => reopened.find((row) => row.id === task.id) ?? task);
  const now = at.getTime();
  const previous = lastNoteAt.get(state.workspace.id);
  const dueToPost = previous == null || now - previous >= WEEK_MS;
  const hasAnything = remaining.length > 0 || reopened.length > 0;

  if (!dueToPost || !hasAnything) {
    return { ok: true, posted: false, message: null, reopened };
  }

  const project = [...state.channels].sort((a, b) => a.orderIndex - b.orderIndex).find((channel) => channel.kind === "project");
  const channel = project ?? state.channels[0];
  if (!channel) return { ok: true, posted: false, message: null, reopened };

  const author = digestAuthor(state.workspace.source, state.members);
  const body = composeDigestBody(remaining, state.members, at, reopened);
  const message = await storage.addMessage(state.workspace.id, {
    channelId: channel.id,
    authorKey: author.authorKey,
    authorKind: author.authorKind,
    body,
    meta: {
      digest: {
        weekOf: at.toISOString(),
        reopened: reopened.map((task) => task.id),
      },
    },
  });
  lastNoteAt.set(state.workspace.id, now);
  broadcast(token, { type: "message", message });
  return { ok: true, posted: true, message, reopened };
}
