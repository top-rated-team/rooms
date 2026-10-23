/**
 * Two mounts, one implementation.
 *
 *   /api/connector      — REST + the OpenAPI document a custom GPT imports
 *   /api/connector/mcp  — Streamable HTTP MCP for Claude
 *
 * Both call server/connector/handlers.ts. Adding a behaviour in only one of
 * these files is how the GPT and Claude start disagreeing.
 */

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { rateLimit } from "../rateLimit";
import { askQuestion, createRoom, listCases, listPrices, listServices } from "./handlers";
import { createMcpRouter } from "./mcp";
import { openApiFor } from "./openapi";

const askLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: "Too many questions at once. Wait a few seconds and ask again.",
});

const createWorkspaceLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  message: "Too many workspaces from this address. Try again later, or book a call.",
});

function allowCrossOrigin(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Authorization",
  );
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

export const connectorRouter = Router();
connectorRouter.use(allowCrossOrigin);

connectorRouter.get("/services", (_req, res) => {
  res.json(listServices());
});

connectorRouter.get("/prices", (_req, res) => {
  res.json(listPrices());
});

connectorRouter.get("/cases", (_req, res) => {
  res.json(listCases());
});

connectorRouter.get("/openapi.json", (req, res) => {
  res.json(openApiFor(req));
});

connectorRouter.post("/ask", askLimit, (req, res, next) => {
  void askQuestion(req, req.body)
    .then((result) => {
      res.status(result.status).json(result.payload);
    })
    .catch(next);
});

connectorRouter.post("/rooms", createWorkspaceLimit, (req, res, next) => {
  void createRoom(req, req.body)
    .then((result) => {
      res.status(result.status).json(result.payload);
    })
    .catch(next);
});

export const connectorMcp = Router();
connectorMcp.use(allowCrossOrigin);
connectorMcp.use(createMcpRouter({ ask: askLimit, rooms: createWorkspaceLimit }));
