/**
 * Three bounds on what one room can spend on agent answers, and one line of
 * accounting per turn.
 *
 * The thing being defended against is not a spike. An agent reply costs about a
 * quarter of a cent and a human conversation about three, so a room that runs
 * away costs roughly four dollars an hour — which is not frightening, and that is
 * the danger. Nothing alarming happens at four dollars. Left running it is about
 * a hundred a day, and the first person to notice is whoever reads the invoice a
 * month later.
 *
 * So: three bounds rather than one, because they fail in different ways and a
 * single number cannot cover all three.
 *
 *   1. A count of turns per room per hour. Catches a fast loop — the case where
 *      something answers itself as quickly as the API will serve it.
 *   2. A clock. An agent that has been answering in one room for
 *      MAX_ACTIVE_MINUTES without the room going quiet stops. Catches the slow
 *      loop that paces itself under the hourly count and would otherwise run all
 *      night.
 *   3. A budget in dollars per room per month, warned at 80% and paused at 100%.
 *      Catches what the other two cannot see: few turns, each enormous.
 *
 * The first two are counted before the model is called and therefore hold even
 * when a turn produces no usable numbers. The third is fed from real token counts
 * off the wire, so a stream that dies mid-answer contributes nothing to it — see
 * recordTurnCost below. That gap is deliberate and is why the count and the clock
 * are not priced.
 *
 * WHERE THIS LIVES. In memory, in this process. There is no spend table in
 * shared/schema.ts and this parcel does not own that file, so every bound here
 * resets when the server restarts, and a deployment running two instances bounds
 * each instance separately. Both are stated in the handoff rather than papered
 * over. Nothing a visitor reads claims otherwise: the messages below say what has
 * happened, never when it will lift.
 */

import { storage } from "./storage";
import { broadcast } from "./ws";
import { costUsd, formatUsd, type TokenUsage } from "./ai/usage";

/* -------------------------------- the bounds ------------------------------- */

/** Agent turns one room may take in a rolling hour. A person asks a handful; a loop asks this in a minute. */
export const MAX_TURNS_PER_HOUR = 30;
const TURN_WINDOW_MS = 60 * 60_000;

/** How long an agent may go on answering in one room before it stops. */
export const MAX_ACTIVE_MINUTES = 20;
const MAX_ACTIVE_MS = MAX_ACTIVE_MINUTES * 60_000;

/** A gap this long with no answered turn ends the run of activity and starts the clock over. */
export const IDLE_RESET_MINUTES = 10;
const IDLE_RESET_MS = IDLE_RESET_MINUTES * 60_000;

/**
 * Dollars of agent answers one room may spend in a calendar month.
 *
 * Five is deliberately far above a real conversation and far below the runaway:
 * at the default model it is over a thousand answers, where a room that is
 * actually being used takes a few dozen. It is a backstop, not a quota, and it is
 * the number that decides whether an unnoticed loop costs five dollars or a
 * hundred a day.
 */
const DEFAULT_MONTHLY_BUDGET_USD = 5;

/** Where the operator is told, so the pause at 100% is never the first they hear of it. */
const WARN_AT_FRACTION = 0.8;

/**
 * Read on each turn rather than at import: `.env` is loaded by server/index.ts
 * after this module is first pulled in, and reading it late costs one Number()
 * per answer. A value that is not a positive number is ignored rather than
 * treated as zero, because a typo that silently paused every room would look
 * exactly like an outage.
 */
export function monthlyBudgetUsd(): number {
  const raw = process.env.ROOM_MONTHLY_BUDGET_USD?.trim();
  if (!raw) return DEFAULT_MONTHLY_BUDGET_USD;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  console.warn(`[spend] ROOM_MONTHLY_BUDGET_USD is "${raw}", which is not a positive number — using $${DEFAULT_MONTHLY_BUDGET_USD}.`);
  return DEFAULT_MONTHLY_BUDGET_USD;
}

/* ------------------------------- the ledger -------------------------------- */

/** Which bound stopped a turn. Written onto the stopped message for whoever reads the row later. */
export type SpendStop = "monthly_budget" | "active_too_long" | "turn_rate";

export type SpendClaim = { ok: true } | { ok: false; stop: SpendStop; message: string };

/** What the guard needs to know about the room it is about to answer in. */
export interface RoomRef {
  token: string;
  workspaceId: string;
  channelId: string;
  agentId: string;
}

interface RoomLedger {
  /** When each answered turn was taken, pruned to the rolling hour. */
  turns: number[];
  /** Start of the current unbroken run of activity. */
  activeSince: number;
  /** Last answered turn. Only answered turns move it, so a stopped room can always go quiet and recover. */
  lastTurnAt: number;
  /** The month `spentUsd` belongs to, as YYYY-MM in UTC. */
  month: string;
  spentUsd: number;
  /** Whether the operator has already been told about this month's 80%. */
  warned: boolean;
}

const ledgers = new Map<string, RoomLedger>();

/** UTC, so two instances in different regions agree on when the month turned over. */
function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

function ledgerFor(workspaceId: string, now: number): RoomLedger {
  const month = monthKey(now);
  let ledger = ledgers.get(workspaceId);

  if (!ledger) {
    // `lastTurnAt: 0` makes the first claim look like a room that has been quiet
    // forever, which is what starts its clock rather than expiring it.
    ledger = { turns: [], activeSince: 0, lastTurnAt: 0, month, spentUsd: 0, warned: false };
    ledgers.set(workspaceId, ledger);
  }

  if (ledger.month !== month) {
    ledger.month = month;
    ledger.spentUsd = 0;
    ledger.warned = false;
  }

  return ledger;
}

/**
 * Rooms are never explicitly closed, so without this the map is a slow leak in a
 * long-lived process. Only entries whose month has already rolled over and whose
 * last turn is outside the rate window are dropped — for those, forgetting the
 * row and keeping it are the same thing, because the budget would have reset and
 * the turns would have aged out anyway.
 */
const SWEEP_EVERY_CLAIMS = 500;
let claimsSinceSweep = 0;

function sweep(now: number): void {
  const month = monthKey(now);
  for (const [workspaceId, ledger] of ledgers) {
    if (ledger.month === month) continue;
    if (now - ledger.lastTurnAt < TURN_WINDOW_MS) continue;
    ledgers.delete(workspaceId);
  }
}

/* -------------------------------- the guard -------------------------------- */

/**
 * Takes this room's next agent turn, or refuses it and says which bound stopped it.
 *
 * Synchronous on purpose, and that is the whole of the concurrency argument: a
 * function with no `await` in it runs to completion before the event loop hands
 * control to anything else, so the read and the write below cannot interleave.
 * Two messages that arrive in the same tick both call this, and the second sees
 * what the first wrote. An async version that awaited storage between reading the
 * count and writing it back would let both through — which is the case the count
 * exists for.
 */
/**
 * The public panel's own monthly ceiling, separate from a room's.
 *
 * A room belongs to somebody who asked for it. /api/ask belongs to the internet:
 * it is on every door, needs no token, and anyone can call it. So it gets its own
 * budget, and the default is deliberately larger than a room's — it is marketing
 * spend rather than delivery — while still being a number rather than no number.
 */
const DEFAULT_ASK_BUDGET_USD = 25;

export function askBudgetUsd(): number {
  const raw = process.env.ASK_MONTHLY_BUDGET_USD?.trim();
  if (!raw) return DEFAULT_ASK_BUDGET_USD;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  console.warn(`[spend] ASK_MONTHLY_BUDGET_USD is "${raw}", which is not a positive number — using $${DEFAULT_ASK_BUDGET_USD}.`);
  return DEFAULT_ASK_BUDGET_USD;
}

/** Every answer the public panel gives, counted together against askBudgetUsd(). */
export const ASK_LEDGER_KEY = "ask:all";

/** One caller of the public panel, so a single address cannot spend the whole ceiling. */
export function askLedgerKey(ip: string): string {
  return `ask:ip:${ip}`;
}

export function claimAgentTurn(
  workspaceId: string,
  now: number = Date.now(),
  budgetUsd: number = monthlyBudgetUsd(),
): SpendClaim {
  if (++claimsSinceSweep >= SWEEP_EVERY_CLAIMS) {
    claimsSinceSweep = 0;
    sweep(now);
  }

  const ledger = ledgerFor(workspaceId, now);

  // Longest-lived stop first: a room paused for the month must not be told it
  // merely asked too quickly this hour, because that sentence would be false and
  // would send the visitor back in five minutes to read it again.
  if (ledger.spentUsd >= budgetUsd) {
    return { ok: false, stop: "monthly_budget", message: BUDGET_MESSAGE };
  }

  // A quiet room starts a fresh clock, so a conversation picked up after lunch is
  // not punished for one that ran this morning. Only a room that never goes quiet
  // trips the bound below.
  if (now - ledger.lastTurnAt > IDLE_RESET_MS) ledger.activeSince = now;
  if (now - ledger.activeSince > MAX_ACTIVE_MS) {
    return { ok: false, stop: "active_too_long", message: ACTIVE_MESSAGE };
  }

  ledger.turns = ledger.turns.filter((at) => now - at < TURN_WINDOW_MS);
  if (ledger.turns.length >= MAX_TURNS_PER_HOUR) {
    return { ok: false, stop: "turn_rate", message: rateMessage(ledger.turns[0] + TURN_WINDOW_MS - now) };
  }

  ledger.turns.push(now);
  ledger.lastTurnAt = now;
  return { ok: true };
}

/**
 * The one call server/routes.ts makes before starting an answer. True means the
 * turn is claimed and the model may be called; false means the room has already
 * been told why it will not be, and the caller stops.
 *
 * The claim above is taken before this function's first `await`, so it keeps its
 * atomicity when reached through here.
 */
export async function guardAgentTurn(room: RoomRef): Promise<boolean> {
  const claim = claimAgentTurn(room.workspaceId);
  if (claim.ok) return true;
  await postStop(room, claim);
  return false;
}

/** Runs in a fire-and-forget reply, so a failure here is logged and never thrown. */
async function postStop(room: RoomRef, claim: Extract<SpendClaim, { ok: false }>): Promise<void> {
  try {
    const message = await storage.addMessage(room.workspaceId, {
      channelId: room.channelId,
      authorKey: `agent:${room.agentId}`,
      authorKind: "agent",
      body: claim.message,
      /*
       * Not `meta.error`. client/src/components/workspace/MessageItem.tsx keeps a
       * closed map of error codes and prints any code it has no copy for straight
       * to the visitor, so a code from here would put `turn_rate` on the page in
       * red. That file's own rule is that a body which already explains itself
       * needs no notice above it, and these bodies explain themselves. `stopped`
       * is read by nothing on the client and is here for whoever reads the row.
       */
      meta: { stopped: claim.stop },
    });
    broadcast(room.token, { type: "message", message });
  } catch (error) {
    console.error("[spend] could not post the stopped-turn notice:", error);
  }
}

/* ----------------------------- the cost event ------------------------------ */

/** One turn, six fields, and nothing else kept. */
export interface CostEvent {
  room: string;
  agent: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usd: number;
}

/**
 * One event per answered turn, from the token counts the API actually sent.
 *
 * Called from the stream loop when the usage chunk arrives. That chunk is the
 * last thing the API sends — it carries `choices: []` and comes after the final
 * delta — so this runs once, at the end of the stream, and never for a stream
 * that failed part-way. A turn whose connection dropped is therefore not
 * charged: the tokens were spent, but nobody sent us the count, and a figure
 * derived from the length of the text would be an invention in a ledger. The
 * count and the clock in claimAgentTurn are what bound that case, which is the
 * reason they are not priced.
 *
 * Synchronous and total: it is called from inside a `for await` over the answer,
 * and an exception here would break an answer already on the visitor's screen.
 */
export function recordTurnCost(workspaceId: string, agentId: string, usage: TokenUsage, now: number = Date.now()): void {
  try {
    const event: CostEvent = {
      room: workspaceId,
      agent: agentId,
      model: usage.model,
      tokensIn: usage.promptTokens,
      tokensOut: usage.completionTokens,
      usd: costUsd(usage),
    };

    // `room` is the workspace id, never the token. The token is a bearer
    // credential in a URL and is not written to a log — see the security notes
    // in README.md.
    console.log(
      `[spend] room=${event.room} agent=${event.agent} model=${event.model} ` +
        `in=${event.tokensIn} out=${event.tokensOut} usd=${formatUsd(event.usd)}`,
    );

    const ledger = ledgerFor(workspaceId, now);
    ledger.spentUsd += event.usd;

    const budget = monthlyBudgetUsd();
    if (!ledger.warned && ledger.spentUsd >= budget * WARN_AT_FRACTION) {
      ledger.warned = true;
      // The operator, not the visitor. At 80% nothing has happened to the person
      // in the room yet, and telling them about our cost accounting would be
      // alarming about something that is not theirs. At 100% the room is told,
      // because at 100% their agent stops answering.
      console.warn(
        `[spend] room=${workspaceId} has used $${ledger.spentUsd.toFixed(2)} of its $${budget.toFixed(2)} ` +
          `monthly allowance for agent answers (${Math.round((ledger.spentUsd / budget) * 100)}%). ` +
          "The agents in that room stop answering once it is used up, and say so in the room.",
      );
    }
  } catch (error) {
    console.error("[spend] could not record the cost of a turn:", error);
  }
}

/* --------------------------- what the room reads --------------------------- */
/* Every number below is interpolated from the constant above it, so raising a
 * bound cannot leave one of these sentences describing the old one. None of them
 * promises when the agent will answer again beyond what the code actually
 * guarantees: the ledger lives in this process, and a restart would lift a bound
 * sooner than any sentence here implies. */

const HUMAN_ROUTE =
  "The checklist beside this channel is the engagement itself, and you can ask for someone from the team to join and answer this properly.";

const BUDGET_MESSAGE = `This room has used its allowance for AI answers this month, so this question was not sent to the model and nothing has been written in place of an answer.

The rest of the room is unaffected. ${HUMAN_ROUTE}`;

const ACTIVE_MESSAGE = `An agent has been answering in this room for ${MAX_ACTIVE_MINUTES} minutes without a break, so it has stopped. Leave the room quiet for ${IDLE_RESET_MINUTES} minutes and it can answer again.

Nothing else here is affected. ${HUMAN_ROUTE}`;

function rateMessage(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  const wait = minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  return `This room has put ${MAX_TURNS_PER_HOUR} questions to the agents in the past hour, which is as many as it gets, so this one was not sent to the model. The next one can go through in ${wait}.

Nothing else here is affected. ${HUMAN_ROUTE}`;
}

/* ---------------------------------- tests ---------------------------------- */

/** Empties the ledger. For server/spend.test.ts, so one case cannot bleed into the next. */
export function resetSpendLedgerForTests(): void {
  ledgers.clear();
  claimsSinceSweep = 0;
}
