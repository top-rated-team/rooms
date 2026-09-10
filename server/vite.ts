import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import express, { type Express } from "express";
import type { ViteDevServer } from "vite";

/**
 * Mounts Vite as middleware on the same Express app and the same HTTP server,
 * so dev and production are one process with one port and one WebSocket upgrade
 * path. Development only.
 */
export async function setupVite(app: Express, server: Server): Promise<void> {
  // Imported here, not at module scope: `vite` is a devDependency, and a
  // production process must never need it on disk to start.
  const { createLogger, createServer: createViteServer } = await import("vite");

  const root = path.resolve(import.meta.dirname, "..");
  const clientTemplate = path.resolve(root, "client", "index.html");
  const logger = createLogger();

  const vite: ViteDevServer = await createViteServer({
    configFile: path.resolve(root, "vite.config.ts"),
    appType: "custom",
    customLogger: {
      ...logger,
      // A bad import in one component should surface in the browser overlay and
      // the terminal, not kill the API and the WebSocket with it.
      error: (message, options) => {
        logger.error(message, options);
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true,
    },
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    try {
      // Read from disk every time: the template is edited while the server runs.
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).end(page);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

/**
 * Serves the built client in production. Everything that is not a real file is
 * answered with index.html so wouter can own /w/:token and the 404 page.
 */
export function serveStatic(app: Express): void {
  const distPath = resolveDistPath();

  app.use(express.static(distPath, { index: false, maxAge: "1h" }));

  app.use("*", (_req, res) => {
    // The entry document must never be cached: it names the hashed asset
    // bundles, so a stale copy points at files a redeploy has removed.
    res.sendFile(path.join(distPath, "index.html"), { maxAge: 0, headers: { "Cache-Control": "no-cache" } });
  });
}

/**
 * Exported because server/routes.ts serves a rewritten index.html to the
 * AdGrant hosts and must look in the same place. It did not, for one deploy:
 * a hand-rolled path with an extra ".." in it resolved next to the bundle's
 * parent, the existsSync guard failed silently, and adgrant.ai served the
 * other site's head while everything else about it was right.
 */
export function resolveDistPath(): string {
  // This file is bundled into dist/index.js, so "public" next to the bundle is
  // dist/public. The second candidate covers running the server from source.
  const candidates = [path.resolve(import.meta.dirname, "public"), path.resolve(process.cwd(), "dist", "public")];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
  }

  throw new Error(`No built client found in ${candidates.join(" or ")} — run \`npm run build\` first.`);
}
