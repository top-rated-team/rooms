/**
 * The connector's guarantees. Run with:
 *
 *   npx tsx --test server/connector/connector.test.ts
 *
 * The cases that have to stay true: the price rows leave exactly as
 * shared/pricing.ts wrote them; the GPT and Claude see the same operations;
 * a question goes through server/spend.ts; a room response is only an address.
 */

import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import express, { type Request } from "express";

import { CASES } from "@shared/cases";
import { DOORS } from "@shared/doors";
import { PRICES } from "@shared/pricing";
import { AGENT_BY_ID } from "@shared/roster";

import { ASK_LEDGER_KEY, askBudgetUsd, claimAgentTurn, recordTurnCost, resetSpendLedgerForTests } from "../spend";
import { askQuestion, createRoom, listCases, listPrices, listServices } from "./handlers";
import { mcpToolNames, originAllowed } from "./mcp";
import { openApiOperationIds } from "./openapi";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fakeReq(ip = "203.0.113.80"): Request {
  return {
    ip,
    protocol: "http",
    get(name: string) {
      if (name.toLowerCase() === "host") return "127.0.0.1:5000";
      return undefined;
    },
  } as Request;
}

describe("the published rows leave this file as they arrived", () => {
  it("returns the price rows with no figure added, removed or rewritten", () => {
    assert.deepEqual(listPrices(), { prices: PRICES });
  });

  it("returns the case studies with no metric rewritten", () => {
    assert.deepEqual(listCases(), { cases: CASES });
  });

  it("returns every published door, and copies headline, blurb and contract rather than rewriting them", () => {
    /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
    const published = DOORS.filter((door) => !door.hidden);
    const { services } = listServices();
    assert.equal(services.length, published.length);
    for (const [index, door] of published.entries()) {
      const row = services[index];
      assert.equal(row.id, door.id);
      assert.equal(row.headline, door.headline);
      assert.equal(row.blurb, door.blurb);
      assert.deepEqual(row.contract, door.contract);
      assert.equal(row.status, door.status);
      const expectedAgentId =
        door.firstAgentId && AGENT_BY_ID[door.firstAgentId]?.hidden ? null : door.firstAgentId;
      assert.equal(row.firstAgentId, expectedAgentId);
      assert.equal(row.priceTier, door.priceTier);
      if (door.status === "coming") {
        assert.equal(row.comingLine, door.comingLine);
        assert.ok(row.comingLine && row.comingLine.length > 0, `${door.id} is coming and has no comingLine`);
      } else {
        assert.equal(row.comingLine, undefined);
      }
      assert.ok(!("kbNamespace" in row), `${door.id} leaked kbNamespace`);
      assert.ok(!("token" in row));
    }
  });
});

describe("one implementation, two front doors", () => {
  it("names the same operations in OpenAPI and in MCP", () => {
    assert.deepEqual(openApiOperationIds().sort(), mcpToolNames().sort());
    assert.deepEqual(openApiOperationIds().sort(), [
      "ask_question",
      "create_room",
      "list_cases",
      "list_prices",
      "list_services",
    ]);
  });
});

describe("ask goes through the spend guard", () => {
  const previousKey = process.env.OPENAI_API_KEY;

  after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    resetSpendLedgerForTests();
  });

  it("says live answers are not configured when there is no key, and does not take a spend turn", () => {
    delete process.env.OPENAI_API_KEY;
    resetSpendLedgerForTests();
    return askQuestion(fakeReq("203.0.113.81"), { question: "How does deduplication work?" }).then((result) => {
      assert.equal(result.status, 200);
      assert.ok("error" in result.payload && typeof result.payload.error === "string");
      if ("error" in result.payload && typeof result.payload.error === "string") {
        assert.match(result.payload.error, /not configured/i);
      }
      const after = claimAgentTurn(ASK_LEDGER_KEY, Date.now(), askBudgetUsd());
      assert.equal(after.ok, true, "a refused-for-no-key ask must not have spent a turn");
    });
  });

  it("returns the spend message when the panel's ceiling is used up, without calling the model", () => {
    process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
    resetSpendLedgerForTests();
    recordTurnCost(ASK_LEDGER_KEY, "chatgpt-ads", {
      model: "gpt-5-mini",
      promptTokens: 1,
      completionTokens: 40_000_000,
    });
    return askQuestion(fakeReq("203.0.113.82"), { question: "How does deduplication work?" }).then((result) => {
      assert.equal(result.status, 200);
      assert.ok("error" in result.payload && typeof result.payload.error === "string");
      if ("error" in result.payload && typeof result.payload.error === "string") {
        assert.match(result.payload.error, /capped for the month/i);
      }
    });
  });
});

describe("a room response is an address, not a workspace", () => {
  it("returns only url, and that url is the room's address", async () => {
    const previous = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://ai.top-rated.team";
    try {
      const result = await createRoom(fakeReq(), { visitorName: "Ada", doorId: "google-ads" });
      assert.equal(result.status, 201);
      assert.deepEqual(Object.keys(result.payload).sort(), ["url"]);
      if ("url" in result.payload) {
        assert.match(result.payload.url, /^https:\/\/ai\.top-rated\.team\/w\/[A-Za-z0-9_-]+$/);
      }
      assert.ok(!("token" in result.payload));
      assert.ok(!("members" in result.payload));
      assert.ok(!("messages" in result.payload));
      assert.ok(!("workspace" in result.payload));
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = previous;
    }
  });

  it("rejects a door that does not exist", async () => {
    const result = await createRoom(fakeReq(), { doorId: "not-a-door" });
    assert.equal(result.status, 400);
    assert.ok("error" in result.payload);
  });

  /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete these two cases when the application is answered. */
  it("rejects a hidden door as unknown", async () => {
    const result = await createRoom(fakeReq(), { doorId: "linkedin-automation" });
    assert.equal(result.status, 400);
    assert.deepEqual(result.payload, { error: "Unknown door: linkedin-automation" });
  });

  it("rejects a hidden agent as unknown", async () => {
    const result = await askQuestion(fakeReq(), { question: "What can be automated?", agentId: "linkedin-dev" });
    assert.equal(result.status, 400);
    assert.deepEqual(result.payload, { error: "Unknown agent: linkedin-dev" });
  });
});

describe("the HTTP mounts and the MCP front door", () => {
  let origin: string;
  let server: Server;

  before(async () => {
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json({ limit: "256kb" }));
    registerRoutes(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
  });

  after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );

  it("serves an OpenAPI 3.1 document whose servers url is this process", async () => {
    const res = await fetch(`${origin}/api/connector/openapi.json`);
    assert.equal(res.status, 200);
    const spec = (await res.json()) as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };
    assert.equal(spec.openapi, "3.1.0");
    assert.equal(spec.servers[0]?.url, origin);
    const agentEnum = (
      spec.paths["/api/connector/ask"] as {
        post: { requestBody: { content: { "application/json": { schema: { properties: { agentId: { enum: string[] } } } } } } };
      }
    ).post.requestBody.content["application/json"].schema.properties.agentId.enum;
    /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
    assert.ok(agentEnum.includes("linkedin-ads"));
    assert.ok(!agentEnum.includes("linkedin-automation"));
    assert.ok(!agentEnum.includes("linkedin-dev"));
    for (const path of [
      "/api/connector/services",
      "/api/connector/prices",
      "/api/connector/cases",
      "/api/connector/ask",
      "/api/connector/rooms",
    ]) {
      assert.ok(spec.paths[path], `OpenAPI is missing ${path}`);
    }
  });

  it("GET /api/connector/prices matches shared/pricing.ts byte for byte on the rows", async () => {
    const res = await fetch(`${origin}/api/connector/prices`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { prices: PRICES });
  });

  it("GET /api/connector/cases matches shared/cases.ts", async () => {
    const res = await fetch(`${origin}/api/connector/cases`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { cases: CASES });
  });

  it("GET /api/connector/services lists every published door", async () => {
    const res = await fetch(`${origin}/api/connector/services`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { services: Array<{ id: string }> };
    /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
    assert.deepEqual(
      body.services.map((row) => row.id),
      DOORS.filter((door) => !door.hidden).map((door) => door.id),
    );
    assert.ok(!body.services.some((row) => row.id === "linkedin-automation"));
    assert.ok(!body.services.some((row) => row.id === "linkedin-growth"));
  });

  it("does not list rooms, leads or members", async () => {
    for (const path of ["/api/connector/rooms", "/api/connector/leads", "/api/connector/members", "/api/connector/w"]) {
      const res = await fetch(`${origin}${path}`);
      assert.equal(res.status, 404, `${path} should not be a collection`);
    }
  });

  it("opens a room over HTTP and returns only the address", async () => {
    const res = await fetch(`${origin}/api/connector/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada", doorId: "chatgpt-ads" }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["url"]);
    assert.equal(typeof body.url, "string");
    assert.match(String(body.url), /\/w\/[A-Za-z0-9_-]+$/);
  });

  it("initializes as MCP and lists the same tools", async () => {
    const init = await fetch(`${origin}/api/connector/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } },
      }),
    });
    assert.equal(init.status, 200);
    const started = (await init.json()) as {
      result: { serverInfo: { name: string }; capabilities: { tools?: unknown } };
    };
    assert.equal(started.result.serverInfo.name, "top-rated-team");
    assert.ok(started.result.capabilities.tools);

    const listed = await fetch(`${origin}/api/connector/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const tools = (await listed.json()) as { result: { tools: Array<{ name: string }> } };
    assert.deepEqual(
      tools.result.tools.map((tool) => tool.name).sort(),
      mcpToolNames().sort(),
    );

    const called = await fetch(`${origin}/api/connector/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_prices", arguments: {} },
      }),
    });
    const result = (await called.json()) as { result: { content: Array<{ text: string }> } };
    assert.deepEqual(JSON.parse(result.result.content[0].text), { prices: PRICES });
  });

  it("rejects a DNS-rebinding Origin on the MCP endpoint", async () => {
    const res = await fetch(`${origin}/api/connector/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    assert.equal(res.status, 403);
  });
});

describe("MCP origin check", () => {
  it("allows a request with no Origin, which is how Claude and ChatGPT call it", () => {
    assert.equal(originAllowed(fakeReq()), true);
  });
});

describe("the well-known manifests point at this surface", () => {
  it("ai-plugin.json names the OpenAPI document", () => {
    const raw = readFileSync(join(REPO_ROOT, "client/public/.well-known/ai-plugin.json"), "utf8");
    const manifest = JSON.parse(raw) as { api: { url: string }; auth: { type: string } };
    assert.match(manifest.api.url, /\/api\/connector\/openapi\.json$/);
    assert.equal(manifest.auth.type, "none");
  });

  it("mcp.json names the Streamable HTTP endpoint", () => {
    const raw = readFileSync(join(REPO_ROOT, "client/public/.well-known/mcp.json"), "utf8");
    const card = JSON.parse(raw) as { remotes: Array<{ type: string; url: string }> };
    assert.equal(card.remotes[0]?.type, "streamable-http");
    assert.match(card.remotes[0]?.url ?? "", /\/api\/connector\/mcp$/);
  });
});
