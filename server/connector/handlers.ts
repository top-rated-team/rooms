/**
 * The one implementation behind both front doors.
 *
 * Custom GPT Actions and the MCP server call these functions. The HTTP routes
 * and the MCP tools are wrappers; if a behaviour lives in only one of those
 * wrappers it will drift. Prices and cases leave this file as the rows in
 * shared/pricing.ts and shared/cases.ts — no arithmetic, no ranges, no
 * rewriting. Questions go through server/spend.ts the same way /api/ask does,
 * including the two claims (this address, then the panel as a whole). Rooms
 * are not opened here any more: they are MakeHybrid's Hybrid Rooms, with their
 * own address and sign-in (shared/rooms-moved.ts), and the instructions say so.
 */

import type { Request } from "express";
import { z } from "zod";

import { CASES } from "@shared/cases";
import { DOOR_BY_ID, DOOR_TIERS, DOORS, type DoorDef } from "@shared/doors";
import { PRICES } from "@shared/pricing";
import { AGENT_BY_ID, DEFAULT_AGENT_ID, type AgentDef } from "@shared/roster";
import { askSchema, type Citation } from "@shared/schema";

import { llmReady, streamAgentAnswer } from "../ai/agentRuntime";
import {
  ASK_LEDGER_KEY,
  askBudgetUsd,
  askLedgerKey,
  claimAgentTurn,
  recordTurnCost,
} from "../spend";

export const CONNECTOR_VIA = "connector";

const LLM_UNAVAILABLE =
  "Live answers are not configured on this deployment — no OPENAI_API_KEY is set, so nothing here will be answered from guesswork. A human on the team can answer the same question today: book a call, or open a room from this connector and write in it.";

export type ConnectorError = { error: string };

export interface ServiceRow {
  id: string;
  slug: string;
  path: string;
  headline: string;
  blurb: string;
  status: DoorDef["status"];
  comingLine?: string;
  tier: DoorDef["tier"];
  tierLabel: string;
  tierMeaning: string;
  contract: DoorDef["contract"];
  agentLine: string;
  starters: string[];
  firstAgentId: string | null;
  tool?: DoorDef["tool"];
  priceTier: DoorDef["priceTier"];
}

export interface AskSuccess {
  answer: string;
  citations?: Citation[];
  error?: string;
}

function publicService(door: DoorDef): ServiceRow {
  const tier = DOOR_TIERS[door.tier];
  const firstAgentId = publishedAgentId(door.firstAgentId);
  const row: ServiceRow = {
    id: door.id,
    slug: door.slug,
    path: door.path,
    headline: door.headline,
    blurb: door.blurb,
    status: door.status,
    tier: door.tier,
    tierLabel: tier.label,
    tierMeaning: tier.meaning,
    contract: door.contract,
    agentLine: door.agentLine,
    starters: door.starters,
    firstAgentId,
    priceTier: door.priceTier,
  };
  if (door.comingLine) row.comingLine = door.comingLine;
  if (door.tool) row.tool = door.tool;
  return row;
}

/** HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
function publishedDoors(): DoorDef[] {
  return DOORS.filter((door) => !door.hidden);
}

/** HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
function answerableAgent(id: string): AgentDef | undefined {
  const agent = AGENT_BY_ID[id];
  if (!agent || agent.hidden) return undefined;
  return agent;
}

function publishedAgentId(id: string | null): string | null {
  if (!id) return null;
  return answerableAgent(id) ? id : null;
}

function publishedDoor(id: string): DoorDef | undefined {
  const door = DOOR_BY_ID[id];
  if (!door || door.hidden) return undefined;
  return door;
}

/** Every published door, in the order shared/doors.ts writes them. */
export function listServices(): { services: ServiceRow[] } {
  return { services: publishedDoors().map(publicService) };
}

/** The published ladder, row for row, with no figure added or removed. */
export function listPrices(): { prices: typeof PRICES } {
  return { prices: PRICES };
}

/** The published case studies, row for row. */
export function listCases(): { cases: typeof CASES } {
  return { cases: CASES };
}

export function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? `localhost:${process.env.PORT ?? 5000}`}`;
}

export function callerIp(req: Request): string {
  return typeof req.ip === "string" && req.ip ? req.ip : "unknown";
}

/**
 * The same two claims /api/ask takes, then the same generator. Collected into
 * one JSON body because a GPT Action and an MCP tool both wait for a finished
 * result rather than an event stream.
 */
export async function askQuestion(
  req: Request,
  body: unknown,
): Promise<{ status: number; payload: AskSuccess | ConnectorError }> {
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, payload: { error: describeZod(parsed.error) } };
  }

  const agentId = parsed.data.agentId ?? DEFAULT_AGENT_ID;
  /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
  if (!answerableAgent(agentId)) {
    return { status: 400, payload: { error: `Unknown agent: ${agentId}` } };
  }

  if (!llmReady()) {
    return { status: 200, payload: { error: LLM_UNAVAILABLE } };
  }

  const mine = claimAgentTurn(askLedgerKey(callerIp(req)));
  const everyone = mine.ok ? claimAgentTurn(ASK_LEDGER_KEY, Date.now(), askBudgetUsd()) : mine;
  if (!everyone.ok) {
    return { status: 200, payload: { error: everyone.message } };
  }

  let answer = "";
  let citations: Citation[] | undefined;
  let error: string | undefined;

  try {
    for await (const chunk of streamAgentAnswer({
      agentId,
      question: parsed.data.question,
      history: parsed.data.history,
    })) {
      if (chunk.error) error = chunk.error;
      if (chunk.citations && chunk.citations.length > 0) citations = chunk.citations;
      if (chunk.usage) {
        recordTurnCost(askLedgerKey(callerIp(req)), agentId, chunk.usage);
        recordTurnCost(ASK_LEDGER_KEY, agentId, chunk.usage);
      }
      if (chunk.delta) answer += chunk.delta;
    }
  } catch (streamError) {
    console.error("[connector] ask stream failed:", streamError);
    return {
      status: 200,
      payload: { error: "The answer stopped part-way through. Ask again, or bring in a human." },
    };
  }

  const payload: AskSuccess = { answer: answer.trim() };
  if (citations && citations.length > 0) payload.citations = citations;
  if (error) payload.error = error;
  if (!payload.answer && error) {
    return { status: 200, payload: { error } };
  }
  return { status: 200, payload };
}

function describeZod(error: z.ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${where}${issue.message}`;
  });
  return issues.length > 0 ? issues.join("; ") : "Invalid request body";
}
