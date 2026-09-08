/**
 * WHEN the weekly note runs. WHAT it says lives in digest.ts.
 *
 * runWeeklyDigest already composes the note, skips a second call in the same
 * week, and writes only into the room. This file is the timer that invokes it.
 * One interval for the process, not one per room. It does not email, webhook
 * or post anywhere outside the room — the arrival panel's "Nothing here posts
 * anywhere by itself" is a promise about the outside world, and this keeps it.
 *
 * Off unless WEEKLY_DIGEST is set. A deploy must not start writing into live
 * rooms before the owner has decided. The timer itself holds no per-room
 * state: after a restart it simply calls runWeeklyDigest again, and digest.ts
 * is what refuses a second note in the same week.
 *
 * server/index.ts is frozen, so registerRoutes is what starts this.
 */

import { setInterval as nodeSetInterval, clearInterval as nodeClearInterval } from "node:timers";
import { workspaces } from "@shared/schema";
import { WEEK_MS, runWeeklyDigest, type WeeklyDigestResult } from "./digest";
import { getDb, hasDb } from "./db";
import { storage, type Storage } from "./storage";

/** Set to 1, true, on or yes to turn the weekly note on. Unset, empty, or anything else leaves it off. */
export const WEEKLY_DIGEST_ENV = "WEEKLY_DIGEST";

export { WEEK_MS };

type IntervalHandle = { unref?: () => void };

export interface DigestScheduleOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  listTokens?: () => Promise<string[]>;
  setInterval?: (callback: () => unknown, ms: number) => IntervalHandle;
  clearInterval?: (handle: IntervalHandle) => void;
}

export interface DigestScheduleHandle {
  started: boolean;
  stop: () => void;
}

export interface DigestSweepResult {
  posted: number;
  skipped: number;
  results: WeeklyDigestResult[];
}

let timer: IntervalHandle | null = null;
let clear: (() => void) | null = null;

function digestEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env[WEEKLY_DIGEST_ENV]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/**
 * Rooms the sweep should visit. Storage has no list method today; postgres
 * can answer directly, and tests pass their own list. A memory store with no
 * list still starts the timer and visits nobody until that method exists.
 */
async function defaultListTokens(): Promise<string[]> {
  const store = storage as Storage & { listWorkspaceTokens?: () => Promise<string[]> };
  if (typeof store.listWorkspaceTokens === "function") {
    return store.listWorkspaceTokens();
  }
  if (!hasDb()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db.select({ token: workspaces.token }).from(workspaces);
  return rows.map((row) => row.token);
}

/**
 * Call runWeeklyDigest for each room. digest.ts decides whether that room
 * has a note to post this week; a room with nothing on the list is skipped
 * there, not here.
 */
export async function runDueDigests(
  at: Date = new Date(),
  listTokens: () => Promise<string[]> = defaultListTokens,
): Promise<DigestSweepResult> {
  let tokens: string[];
  try {
    tokens = await listTokens();
  } catch (error) {
    console.error("[digest] could not list rooms for the weekly note:", error);
    return { posted: 0, skipped: 0, results: [] };
  }

  const results: WeeklyDigestResult[] = [];
  let posted = 0;
  let skipped = 0;
  for (const token of tokens) {
    try {
      const result = await runWeeklyDigest(token, at);
      results.push(result);
      if (result.ok && result.posted) posted += 1;
      else skipped += 1;
    } catch (error) {
      // The token is a credential. It does not go in the log.
      console.error("[digest] weekly note failed for a room:", error);
      skipped += 1;
    }
  }
  return { posted, skipped, results };
}

/**
 * One timer for the process. Does not fire on start — a restart would otherwise
 * look like a new week before digest.ts had a chance to see the last note, and
 * lastNoteAt in digest.ts lives only in this process. Waiting a week, then
 * calling runWeeklyDigest, is the whole contract.
 */
export function startDigestSchedule(options: DigestScheduleOptions = {}): DigestScheduleHandle {
  if (!digestEnabled(options.env ?? process.env)) {
    return { started: false, stop: stopDigestSchedule };
  }
  if (timer) {
    return { started: true, stop: stopDigestSchedule };
  }

  const now = options.now ?? (() => new Date());
  const listTokens = options.listTokens ?? defaultListTokens;
  const setInt = options.setInterval ?? ((callback, ms) => nodeSetInterval(callback, ms));
  const clearInt = options.clearInterval ?? ((handle) => nodeClearInterval(handle as ReturnType<typeof nodeSetInterval>));

  const tick = () =>
    runDueDigests(now(), listTokens).catch((error: unknown) => {
      console.error("[digest] weekly sweep failed:", error);
    });

  const handle = setInt(tick, WEEK_MS);
  if (typeof handle.unref === "function") handle.unref();
  timer = handle;
  clear = () => clearInt(handle);

  return { started: true, stop: stopDigestSchedule };
}

export function stopDigestSchedule(): void {
  if (!timer) return;
  clear?.();
  timer = null;
  clear = null;
}
