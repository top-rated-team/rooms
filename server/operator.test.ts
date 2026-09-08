/**
 * The operator setup. Run it with:
 *
 *   npx tsx --test server/operator.test.ts
 *
 * Four things this file has to keep true, from private/fork-and-partners.md:
 *
 * 1. An unconfigured fork redirects every page to /setup.
 * 2. A config missing a legal name is rejected with a sentence a person can act on.
 * 3. The model key is never returned in a response body or an error.
 * 4. A saved config is the one partner-catalogue reads — it round-trips through
 *    the resolver.
 */

import { createServer, request as httpRequest, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { resolveCatalogue } from "@shared/catalogue";
import { DOOR_BY_ID, DOORS } from "@shared/doors";
import { parseOperatorWrite } from "@shared/operator";
import { operatorConfig, resetOperatorForTests, restoreOperatorDefaultsForTests, seededCatalogue } from "./operator";

const FORK_HOST = "agency.example";
const SECRET_KEY = "sk-test-never-return-this-key-9f3c";

const NORTHWIND = {
  displayName: "Northwind Agency",
  legalName: "Northwind Agency s.r.o.",
  entity: "A marketing agency registered in Prague.",
  termsUrl: "https://northwind.example/terms",
  contact: "hello@northwind.example",
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    identity: { ...NORTHWIND },
    services: {
      "google-ads": { mode: "white-label", offered: true },
      "chatgpt-ads": { mode: "named", offered: true },
    },
    origin: "https://rooms.northwind.example",
    model: { useOwnKey: true, apiKey: SECRET_KEY },
    ...overrides,
  };
}

async function startApp(): Promise<{ origin: string; close(): Promise<void> }> {
  const { registerRoutes } = await import("./routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  registerRoutes(app);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function forkHeaders(): Record<string, string> {
  return { Host: FORK_HOST, Accept: "text/html" };
}

/**
 * fetch() refuses the Host header, so a test that needs Express to see a fork
 * host has to go through node:http.
 */
function getAsHost(origin: string, pathname: string, host: string): Promise<{ status: number; location: string | null }> {
  const url = new URL(pathname, origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: pathname,
        method: "GET",
        headers: { host, accept: "text/html" },
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("operator setup", () => {
  let origin = "";
  let close: (() => Promise<void>) | undefined;
  let tmpDir = "";
  let file = "";

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operator-"));
    file = path.join(tmpDir, "operator.json");
    resetOperatorForTests({ file });
    const app = await startApp();
    origin = app.origin;
    close = app.close;
  });

  after(async () => {
    await close?.();
    restoreOperatorDefaultsForTests();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    resetOperatorForTests({ file });
  });

  describe("an unconfigured deployment redirects", () => {
    it("sends a fork visitor from any page to /setup", async () => {
      const res = await getAsHost(origin, "/pricing", FORK_HOST);
      assert.equal(res.status, 302);
      assert.equal(res.location, "/setup");
    });

    it("sends the front of the house there too", async () => {
      const res = await getAsHost(origin, "/", FORK_HOST);
      assert.equal(res.status, 302);
      assert.equal(res.location, "/setup");
    });

    it("leaves /setup itself in place so the form can load", async () => {
      const res = await getAsHost(origin, "/setup", FORK_HOST);
      assert.notEqual(res.status, 302);
    });

    it("does not move the reference deployment, which has no operator and must stay as it is", async () => {
      const res = await fetch(`${origin}/pricing`, { redirect: "manual" });
      assert.notEqual(res.status, 302);
    });
  });

  describe("a config missing a legal name is rejected", () => {
    it("answers with a sentence a person can act on", async () => {
      const body = validBody({
        identity: { ...NORTHWIND, legalName: "   " },
      });
      const res = await fetch(`${origin}/api/operator`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...forkHeaders() },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 400);
      const payload = (await res.json()) as { error: string };
      assert.match(payload.error, /registered name/i);
      assert.match(payload.error, /contract|invoice/i);
    });
  });

  describe("the model key is never returned", () => {
    it("is absent from a successful save and from a later read", async () => {
      const saved = await fetch(`${origin}/api/operator`, {
        method: "PUT",
        headers: { "content-type": "application/json", Host: FORK_HOST },
        body: JSON.stringify(validBody()),
      });
      assert.equal(saved.status, 200);
      const savedText = await saved.text();
      assert.equal(savedText.includes(SECRET_KEY), false);
      assert.equal(/sk-/.test(savedText), false);

      const savedJson = JSON.parse(savedText) as { model: { hasKey: boolean; useOwnKey: boolean }; configured: boolean };
      assert.equal(savedJson.configured, true);
      assert.equal(savedJson.model.hasKey, true);
      assert.equal(savedJson.model.useOwnKey, true);
      assert.equal("apiKey" in savedJson, false);
      assert.equal("apiKey" in savedJson.model, false);

      const read = await fetch(`${origin}/api/operator`, { headers: { Host: FORK_HOST } });
      const readText = await read.text();
      assert.equal(readText.includes(SECRET_KEY), false);
      assert.equal(/sk-/.test(readText), false);
    });

    it("is absent from an error, even when the rejected body carried one", async () => {
      const res = await fetch(`${origin}/api/operator`, {
        method: "PUT",
        headers: { "content-type": "application/json", Host: FORK_HOST },
        body: JSON.stringify(
          validBody({
            identity: { ...NORTHWIND, legalName: "" },
            model: { useOwnKey: true, apiKey: SECRET_KEY },
          }),
        ),
      });
      assert.equal(res.status, 400);
      const text = await res.text();
      assert.equal(text.includes(SECRET_KEY), false);
      assert.equal(/sk-/.test(text), false);
    });
  });

  describe("a saved config round-trips through the resolver", () => {
    it("is the same record partner-catalogue reads", async () => {
      const body = validBody({
        prices: {
          setup: { price: "from 4 000 Kč", buys: "One conversion-tracking setup." },
        },
      });
      const res = await fetch(`${origin}/api/operator`, {
        method: "PUT",
        headers: { "content-type": "application/json", Host: FORK_HOST },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        identity: typeof NORTHWIND;
        services: Record<string, { mode: string; offered: boolean }>;
        origin: string;
      };
      assert.equal("prices" in payload, false);

      const config = operatorConfig();
      assert.ok(config);
      assert.equal(config.identity.legalName, NORTHWIND.legalName);
      assert.equal(config.services?.["google-ads"]?.mode, "white-label");

      const [googleAds] = resolveCatalogue([DOOR_BY_ID["google-ads"]], config) as Array<
        (typeof DOORS)[number] & { offered?: boolean }
      >;
      assert.equal(googleAds.contract.legalName, NORTHWIND.legalName);
      assert.equal(googleAds.tier, "white");

      const blob = JSON.stringify(googleAds);
      assert.equal(blob.includes("Top-Rated Team (Danylo Burykin SZČO)"), false);

      const seeded = seededCatalogue() as Array<(typeof DOORS)[number] & { offered?: boolean }>;
      const seededGoogle = seeded.find((door) => door.id === "google-ads");
      assert.ok(seededGoogle);
      assert.equal(seededGoogle.contract.legalName, NORTHWIND.legalName);
    });

    it("turns /setup into /partner once it exists", async () => {
      const saved = await fetch(`${origin}/api/operator`, {
        method: "PUT",
        headers: { "content-type": "application/json", Host: FORK_HOST },
        body: JSON.stringify(validBody()),
      });
      assert.equal(saved.status, 200);

      const res = await fetch(`${origin}/setup`, { headers: forkHeaders(), redirect: "manual" });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("location"), "/partner");
    });

    it("still refuses a write that would name someone who is not answerable", async () => {
      const res = await fetch(`${origin}/api/operator`, {
        method: "PUT",
        headers: { "content-type": "application/json", Host: FORK_HOST },
        body: JSON.stringify(
          validBody({
            services: { "linkedin-automation": { mode: "white-label", offered: true } },
          }),
        ),
      });
      assert.equal(res.status, 400);
      const payload = (await res.json()) as { error: string };
      assert.match(payload.error, /someone who is not/);
    });
  });

  describe("parseOperatorWrite", () => {
    it("drops a prices field rather than keeping one", () => {
      const write = parseOperatorWrite(
        validBody({
          prices: { setup: { price: "$99" } },
        }),
      );
      assert.equal("prices" in write, false);
    });
  });
});
