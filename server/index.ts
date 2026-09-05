import { createServer } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, setupVite } from "./vite";
import { attachWs } from "./ws";
import { storageMode } from "./storage";
import { llmReady } from "./ai/agentRuntime";
import { kbStatus, loadKb } from "./ai/kb";

/**
 * `.env` is read before anything asks it a question. Every module in this
 * server reads process.env lazily for the same reason: ES modules are evaluated
 * before this file's body runs, so a constant captured at import time would see
 * the environment as it was before this call.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file, or a Node older than 20.12. The ambient environment is then
  // the whole configuration — and every value in it is optional by design.
}

const BODY_LIMIT = "256kb";
/** The token in /api/workspaces/:token is a credential. Log the route, not it. */
const TOKEN_IN_PATH = /^\/api\/workspaces\/[^/]+/;

async function main(): Promise<void> {
  const app = express();
  app.disable("x-powered-by");
  // One reverse proxy in front of this process (see docs/DEPLOY.md). Trusting
  // exactly one hop makes req.ip the real client for rate limiting without
  // letting a caller spoof it by inventing X-Forwarded-For entries.
  app.set("trust proxy", 1);

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));
  app.use(apiLogger);
  app.use(noindexWorkspaces);

  // Resolve the store now so the boot log reports it, not the first request.
  const mode = storageMode();

  await loadKnowledgeBase();

  registerRoutes(app);

  const server = createServer(app);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  app.use(errorHandler);

  attachWs(server);

  const port = Number(process.env.PORT ?? 5000);
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[boot] port ${port} is already in use. Set PORT to something else.`);
      process.exit(1);
    }
    console.error("[boot] server error:", error);
  });

  server.listen(port, "0.0.0.0", () => {
    printBanner(port, mode);
  });
}

function apiLogger(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }

  const startedAt = Date.now();
  res.on("finish", () => {
    const route = req.path.replace(TOKEN_IN_PATH, "/api/workspaces/:token");
    console.log(`[api] ${req.method} ${route} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });

  next();
}

function noindexWorkspaces(req: Request, res: Response, next: NextFunction): void {
  // A workspace URL contains the whole credential; keep it out of indexes even
  // if a link leaks into somewhere a crawler can reach.
  if (req.path.startsWith("/w/")) res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const detail = error as { status?: number; statusCode?: number; type?: string; message?: string };
  const status = detail.status ?? detail.statusCode ?? 500;

  console.error("[error]", error);

  if (res.headersSent) {
    res.end();
    return;
  }

  let message = "Something went wrong on our side.";
  if (detail.type === "entity.parse.failed") message = "Invalid JSON body";
  else if (detail.type === "entity.too.large") message = `Request body is larger than ${BODY_LIMIT}`;
  // Stack traces and internal messages stay in the log; 4xx messages are ours.
  else if (status < 500 && detail.message) message = detail.message;

  res.status(status).json({ error: message });
}

async function loadKnowledgeBase(): Promise<void> {
  try {
    await loadKb();
  } catch (error) {
    console.error("[kb] could not be loaded; agents will say what they are missing:", error);
  }
}

function printBanner(port: number, mode: ReturnType<typeof storageMode>): void {
  const storage =
    mode === "postgres" ? "postgres (DATABASE_URL)" : "in-memory (no DATABASE_URL — workspaces reset on restart)";

  const llm = llmReady()
    ? `ready (${process.env.OPENAI_CHAT_MODEL ?? "gpt-5-mini"})`
    : "not configured — agents say so instead of guessing (set OPENAI_API_KEY)";

  let kb = "unavailable";
  try {
    const status = kbStatus();
    kb = `${status.mode} — ${status.documents} documents, ${status.chunks} chunks${status.builtAt ? `, built ${status.builtAt}` : ""}`;
  } catch (error) {
    console.error("[kb] status unavailable:", error);
  }

  console.log(
    [
      "",
      `  ai.top-rated.team  ·  http://0.0.0.0:${port}  ·  ${process.env.NODE_ENV ?? "development"}`,
      `  storage : ${storage}`,
      `  llm     : ${llm}`,
      `  kb      : ${kb}`,
      "",
    ].join("\n"),
  );
}

process.on("unhandledRejection", (reason) => {
  // Background work (agent streams, lead webhooks) must never take the process
  // down; it is logged here rather than left to the default crash.
  console.error("[unhandled]", reason);
});

main().catch((error: unknown) => {
  console.error("[boot] failed to start:", error);
  process.exit(1);
});
