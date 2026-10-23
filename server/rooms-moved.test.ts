/**
 * Rooms are not this site's any more. Run it with:
 *
 *   npx tsx --test --test-force-exit server/rooms-moved.test.ts
 *
 * What has to stay true now that they are MakeHybrid's Hybrid Rooms,
 * white-labelled as ours (shared/rooms-moved.ts):
 *
 *   - /rooms and every room address this site ever gave out go to wherever
 *     HYBRID_ROOMS_URL says, and the old token does not travel with them;
 *   - nothing opens a room here any more, except the record AdGrant.AI's
 *     generator keeps, and a caller asking for a room is told where they are;
 *   - an AI agent on the connector is told the same, and has no tool that
 *     pretends to open one;
 *   - Top-Rated Team's own pages carry no sign-in of their own: RoomMenu is
 *     left only where AdGrant.AI and the operator's pages need it;
 *   - a sign-in started on the operator's page comes back to it, and only
 *     ever to a path on this site.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import express from "express";

import { DEFAULT_HYBRID_ROOMS_URL, ROOMS_PATH } from "@shared/rooms-moved";
import { hybridRoomsUrl } from "./rooms-moved";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

let origin = "";
let server: Server | null = null;
const savedUrl = process.env.HYBRID_ROOMS_URL;

before(async () => {
  const { registerRoutes } = await import("./routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (savedUrl === undefined) delete process.env.HYBRID_ROOMS_URL;
  else process.env.HYBRID_ROOMS_URL = savedUrl;
  const running = server;
  server = null;
  if (!running) return;
  await new Promise<void>((resolve) => {
    running.closeAllConnections();
    running.close(() => resolve());
  });
});

beforeEach(() => {
  delete process.env.HYBRID_ROOMS_URL;
});

describe("where the rooms are", () => {
  it("is the white label's own host until HYBRID_ROOMS_URL says otherwise", () => {
    assert.equal(hybridRoomsUrl(), DEFAULT_HYBRID_ROOMS_URL);
    process.env.HYBRID_ROOMS_URL = "https://rooms.example.org/rooms.html";
    assert.equal(hybridRoomsUrl(), "https://rooms.example.org/rooms.html");
  });

  it("is never an address that is not https", () => {
    for (const bad of ["http://rooms.example.org/", "javascript:alert(1)", "rooms.example.org", "//evil.example"]) {
      process.env.HYBRID_ROOMS_URL = bad;
      assert.equal(hybridRoomsUrl(), DEFAULT_HYBRID_ROOMS_URL, bad);
    }
  });

  it("sends /rooms and every old room address there, without the token, and not for good", async () => {
    process.env.HYBRID_ROOMS_URL = "https://rooms.example.org/rooms.html";
    for (const path of [ROOMS_PATH, "/w", "/w/tok_SECRETROOMTOKEN123"]) {
      const res = await fetch(`${origin}${path}`, { redirect: "manual" });
      assert.equal(res.status, 302, path);
      const location = res.headers.get("location") ?? "";
      assert.equal(location, "https://rooms.example.org/rooms.html", path);
      assert.ok(!location.includes("SECRETROOMTOKEN"), "the old token went to another host");
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.match(res.headers.get("x-robots-tag") ?? "", /noindex/);
      assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    }
  });
});

describe("nothing opens a room here", () => {
  it("tells a caller asking for a room where rooms are", async () => {
    process.env.HYBRID_ROOMS_URL = "https://rooms.example.org/rooms.html";
    for (const body of [{}, { firstMessage: "Hi" }, { source: { door: "chatgpt-ads" } }]) {
      const res = await fetch(`${origin}/api/workspaces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 410, JSON.stringify(body));
      assert.deepEqual(await res.json(), { error: "Rooms have moved.", url: "https://rooms.example.org/rooms.html" });
    }
  });

  it("still keeps AdGrant.AI's generator record", async () => {
    const res = await fetch(`${origin}/api/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: { door: "ad-grants", entered: "direct" } }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { workspace?: { token?: string } };
    assert.equal(typeof body.workspace?.token, "string");
  });

  it("serves none of a room's own routes", async () => {
    for (const [method, path] of [
      ["GET", "/api/workspaces/tok_anything"],
      ["POST", "/api/workspaces/tok_anything/messages"],
      ["POST", "/api/workspaces/tok_anything/invite"],
      ["GET", "/api/workspaces/tok_anything/bridges"],
      ["GET", "/api/workspaces/tok_anything/seats"],
      ["GET", "/api/workspaces/tok_anything/billing"],
      ["POST", "/api/bridge/inbound"],
    ] as const) {
      const res = await fetch(`${origin}${path}`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
      assert.equal(res.status, 404, `${method} ${path}`);
    }
  });

  it("tells an AI agent on the connector where rooms are, and gives it no tool to open one", async () => {
    const init = await fetch(`${origin}/api/connector/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {} } }),
    });
    const started = (await init.json()) as { result: { instructions: string } };
    assert.match(started.result.instructions, /Rooms are not opened from here/);
    assert.ok(started.result.instructions.includes(`${origin}${ROOMS_PATH}`));

    const listed = await fetch(`${origin}/api/connector/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const tools = (await listed.json()) as { result: { tools: Array<{ name: string }> } };
    assert.ok(!tools.result.tools.some((tool) => tool.name === "create_room"));
    const posted = await fetch(`${origin}/api/connector/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(posted.status, 404);
  });
});

describe("no sign-in of our own on Top-Rated Team's pages", () => {
  const ourPages = [
    "client/src/components/site/Header.tsx",
    "client/src/components/site/Footer.tsx",
    "client/src/components/site/home/FirstScreen.tsx",
    "client/src/components/site/home/HouseAsk.tsx",
    "client/src/components/site/AskWidget.tsx",
    "client/src/components/site/LeadDialog.tsx",
    "client/src/pages/door.tsx",
    "client/src/pages/doors.tsx",
    "client/src/pages/landing.tsx",
  ];

  for (const path of ourPages) {
    it(`${path.split("/").pop()} carries no sign-in`, () => {
      const text = read(path);
      assert.ok(!text.includes("RoomMenu"), `${path} renders this site's own sign-in again`);
      assert.ok(!text.includes("/api/room-login") && !text.includes("/api/room-access"), `${path} signs people in again`);
    });
  }

  it("the header and the first screen link to the rooms", () => {
    for (const path of ["client/src/components/site/Header.tsx", "client/src/components/site/home/FirstScreen.tsx"]) {
      assert.ok(read(path).includes("<RoomsLink"), `${path} lost its way to the rooms`);
    }
    assert.ok(read("client/src/components/site/RoomsLink.tsx").includes("href={ROOMS_PATH}"));
  });
});

describe("a sign-in comes back to where it started", () => {
  type Store = Map<string, string>;
  const store: Store = new Map();
  const g = globalThis as unknown as { window?: { localStorage: Storage } };

  before(() => {
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      } as unknown as Storage,
    };
  });
  after(() => {
    delete g.window;
  });
  beforeEach(() => store.clear());

  it("goes back to the operator's page, once", async () => {
    const { rememberSignInReturn, takeSignInReturn } = await import("../client/src/lib/signin-return");
    rememberSignInReturn("/admin/booking-widget", 1_000);
    assert.equal(takeSignInReturn("?signin=1&signin_outcome=signed-in", 2_000), "/admin/booking-widget");
    assert.equal(takeSignInReturn("?signin=1&signin_outcome=signed-in", 3_000), null, "taken twice");
  });

  it("only on a sign-in landing, only for half an hour", async () => {
    const { rememberSignInReturn, takeSignInReturn } = await import("../client/src/lib/signin-return");
    rememberSignInReturn("/admin/booking-widget", 1_000);
    assert.equal(takeSignInReturn("", 2_000), null);
    rememberSignInReturn("/admin/booking-widget", 1_000);
    assert.equal(takeSignInReturn("?signin=1", 1_000 + 31 * 60_000), null);
  });

  it("never anywhere off this site", async () => {
    const { rememberSignInReturn, takeSignInReturn } = await import("../client/src/lib/signin-return");
    for (const bad of ["//evil.example/x", "https://evil.example/", "/\\evil.example"]) {
      rememberSignInReturn(bad, 1_000);
      assert.equal(takeSignInReturn("?signin=1", 2_000), null, bad);
      store.set("tr-signin-return", JSON.stringify({ path: bad, at: 1_000 }));
      assert.equal(takeSignInReturn("?signin=1", 2_000), null, `${bad}, written straight into storage`);
    }
  });
});
