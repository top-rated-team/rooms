import type { Member, Task } from "./schema";

/**
 * WHAT THE ROOM IS DOING NOW, in one line.
 *
 * It lives in shared/ rather than in server/digest.ts because the channel
 * header prints it, and the channel header is in the browser. It was written in
 * the server module by the parcel that built the weekly digest — the same
 * sentence serves both, and one implementation is the whole point: a header
 * that said one thing while the digest said another would be worse than either.
 *
 * Pure: tasks and members in, a sentence out. No storage, no clock.
 */

function isVisitorKey(key: string | null, members: Member[]): boolean {
  if (!key) return false;
  if (key === "visitor") return true;
  return members.some((member) => member.memberKey === key && member.kind === "visitor");
}

function displayNameOf(key: string | null, members: Member[]): string | null {
  if (!key) return null;
  const member = members.find((row) => row.memberKey === key);
  return member ? member.displayName : null;
}

/**
 * Who a line is waiting on, in the room's words. The anonymous visitor is "the
 * client" rather than "You", because this line is read by everyone in the room.
 * A named visitor is that name.
 */
export function waitingOnName(key: string | null, members: Member[]): string {
  if (!key) return "nobody";
  const name = displayNameOf(key, members)?.trim();
  if (isVisitorKey(key, members)) {
    if (!name || name === "You") return "the client";
    return name;
  }
  return name && name.length > 0 ? name : "somebody";
}

export function isWaitingOnClient(task: Task, members: Member[]): boolean {
  if (task.status === "done") return false;
  return isVisitorKey(task.assigneeKey, members);
}

function withPeriod(line: string): string {
  return /[.?!]$/.test(line) ? line : `${line}.`;
}

export function roomNowLine(tasks: Task[], members: Member[]): string {
  if (tasks.length === 0) return "Nothing on the list yet.";
  const open = tasks.filter((task) => task.status !== "done");
  if (open.length === 0) return "The list is clear.";

  const waiting = open.filter((task) => isWaitingOnClient(task, members));
  const blockedOther = open.filter((task) => task.status === "blocked" && !isWaitingOnClient(task, members));
  const moving = open.filter((task) => task.status === "in_progress" && !isWaitingOnClient(task, members));

  const parts: string[] = [];

  if (waiting.length > 0) {
    const extra = waiting.length > 1 ? `, and ${waiting.length - 1} more` : "";
    parts.push(`Waiting on the client: ${waiting[0].title}${extra}`);
  } else if (blockedOther.length > 0) {
    const who = waitingOnName(blockedOther[0].assigneeKey, members);
    parts.push(`Waiting on ${who}: ${blockedOther[0].title}`);
  }

  if (moving.length > 0) {
    const who = waitingOnName(moving[0].assigneeKey, members);
    parts.push(who === "nobody" ? `Still moving: ${moving[0].title}` : `Still moving: ${moving[0].title}, with ${who}`);
  }

  if (parts.length === 0) return withPeriod(`Next: ${open[0].title}`);
  return withPeriod(parts.join(". "));
}
