/**
 * Streamable HTTP MCP, over the same handlers the OpenAPI document names.
 *
 * JSON-RPC 2.0 on POST /api/connector/mcp. JSON responses, not an SSE stream:
 * every tool here is a request/response, and the spec allows application/json
 * for that. GET returns 405 because this server does not push.
 *
 * Origin is checked when the header is present, so a page on another host
 * cannot drive a local process through DNS rebinding. Server-side clients
 * (Claude, ChatGPT) send no Origin and are let through.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";

import { askQuestion, createRoom, listCases, listPrices, listServices } from "./handlers";

const PROTOCOL = "2025-03-26";
const SUPPORTED = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]);

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: ToolDef[] = [
  {
    name: "list_services",
    description:
      "List every published offer: headline, who invoices, whether the panel is open, and which agent answers first. Quote the fields as returned.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_prices",
    description:
      "The published price rows, exactly as written. Repeat a row verbatim. Do not invent a figure, a range, or a price for a partner service.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_cases",
    description:
      "The published case studies. Repeat the metrics as returned. Do not invent a case for a service that has none.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ask_question",
    description:
      "Ask a question answered from the same documentation the site's panel uses, under the same spend ceiling. Pass agentId from a service's firstAgentId. If that field is null, do not ask.",
    inputSchema: {
      type: "object",
      required: ["question"],
      additionalProperties: false,
      properties: {
        question: { type: "string", minLength: 1, maxLength: 4000 },
        agentId: { type: "string", maxLength: 64 },
        history: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            required: ["role", "content"],
            properties: {
              role: { type: "string", enum: ["user", "assistant"] },
              content: { type: "string", maxLength: 8000 },
            },
          },
        },
      },
    },
  },
  {
    name: "create_room",
    description:
      "Open a room and return its address. Give that address to the invited person and to nobody else. Pass doorId from list_services so the room carries that service's contract.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        visitorName: { type: "string", maxLength: 120 },
        visitorEmail: { type: "string", maxLength: 200 },
        visitorCompany: { type: "string", maxLength: 160 },
        visitorWebsite: { type: "string", maxLength: 300 },
        name: { type: "string", maxLength: 120 },
        doorId: { type: "string", maxLength: 64 },
      },
    },
  },
];

export function mcpToolNames(): string[] {
  return MCP_TOOLS.map((tool) => tool.name);
}

export function originAllowed(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = (req.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const localOrigin = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (localHost) return localOrigin;
  return parsed.protocol === "https:" || localOrigin;
}

type LimitFn = RequestHandler;

export function createMcpRouter(limits: { ask: LimitFn; rooms: LimitFn }): Router {
  const router = Router();
  router.use(rejectBadOrigin);
  router.post("/", (req, res, next) => {
    void handlePost(req, res, limits).catch(next);
  });
  router.get("/", (_req, res) => {
    res.status(405).setHeader("Allow", "POST, OPTIONS, DELETE").json({ error: "This MCP server does not open an SSE stream. POST a JSON-RPC message." });
  });
  router.delete("/", (_req, res) => {
    res.status(405).json({ error: "This MCP server is stateless and has no session to delete." });
  });
  return router;
}

function rejectBadOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!originAllowed(req)) {
    res.status(403).json({ error: "Origin not allowed." });
    return;
  }
  next();
}

async function handlePost(req: Request, res: Response, limits: { ask: LimitFn; rooms: LimitFn }): Promise<void> {
  const body = req.body as unknown;
  if (Array.isArray(body)) {
    if (body.length === 0) {
      res.status(400).json(rpcError(null, -32600, "Empty batch"));
      return;
    }
    const hasRequest = body.some((item) => item && typeof item === "object" && "method" in item && "id" in item && (item as JsonRpcRequest).id !== undefined);
    if (!hasRequest) {
      res.status(202).end();
      return;
    }
    const replies = [];
    for (const item of body) {
      const reply = await dispatch(req, res, item, limits);
      if (reply) replies.push(reply);
      if (res.headersSent) return;
    }
    res.status(200).json(replies);
    return;
  }

  if (!body || typeof body !== "object") {
    res.status(400).json(rpcError(null, -32700, "Parse error"));
    return;
  }

  const msg = body as JsonRpcRequest;
  const isNotification = !("id" in msg) || msg.id === undefined;
  if (isNotification) {
    if (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled") {
      res.status(202).end();
      return;
    }
    res.status(202).end();
    return;
  }

  const reply = await dispatch(req, res, msg, limits);
  if (res.headersSent) return;
  res.status(200).json(reply);
}

async function dispatch(
  req: Request,
  res: Response,
  raw: unknown,
  limits: { ask: LimitFn; rooms: LimitFn },
): Promise<Record<string, unknown> | null> {
  if (!raw || typeof raw !== "object") return rpcError(null, -32600, "Invalid request");
  const msg = raw as JsonRpcRequest;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg.id ?? null, -32600, "Invalid request");
  }
  if (!("id" in msg) || msg.id === undefined) return null;

  const id = msg.id;
  const method = msg.method;
  const params = msg.params && typeof msg.params === "object" && !Array.isArray(msg.params) ? (msg.params as Record<string, unknown>) : {};

  switch (method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED.has(requested) ? requested : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "top-rated-team", version: "1.0.0" },
          instructions:
            "You can explain Top-Rated Team's services, quote the published prices verbatim, cite the case studies, ask a grounded question, and open a room. Give a room address only to the person being invited.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = asArgs(params.arguments);
      const called = await callTool(req, res, name, args, limits);
      if (res.headersSent) return null;
      return { jsonrpc: "2.0", id, result: called };
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

async function callTool(
  req: Request,
  res: Response,
  name: string,
  args: Record<string, unknown>,
  limits: { ask: LimitFn; rooms: LimitFn },
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  switch (name) {
    case "list_services":
      return toolOk(listServices());
    case "list_prices":
      return toolOk(listPrices());
    case "list_cases":
      return toolOk(listCases());
    case "ask_question": {
      if (!passedLimit(limits.ask, req, res)) return dummy();
      const result = await askQuestion(req, args);
      return toolBody(result.payload, result.status >= 400);
    }
    case "create_room": {
      if (!passedLimit(limits.rooms, req, res)) return dummy();
      const result = await createRoom(req, args);
      return toolBody(result.payload, result.status >= 400);
    }
    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}

function passedLimit(limit: LimitFn, req: Request, res: Response): boolean {
  let allowed = false;
  limit(req, res, () => {
    allowed = true;
  });
  return allowed;
}

function dummy(): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  return { content: [{ type: "text", text: "Rate limited." }], isError: true };
}

function toolOk(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function toolBody(
  payload: unknown,
  isError: boolean,
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  const result: { content: Array<{ type: "text"; text: string }>; isError?: boolean } = {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
  if (isError || (payload && typeof payload === "object" && "error" in payload && payload.error)) {
    result.isError = true;
  }
  return result;
}

function asArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
