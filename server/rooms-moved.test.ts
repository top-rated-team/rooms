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

import { DEFAULT_HYBRID_ROOMS_URL, ROOMS_PATH, roomsMovedOn } from "@shared/rooms-moved";
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

const ADGRANT = { "x-forwarded-host": "app.adgrant.ai" };

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

  it("sends an old address of one of AdGrant.AI's rooms to that room, on its own host", async () => {
    const opened = await fetch(`${origin}/api/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: { door: "ad-grants" } }),
    });
    assert.equal(opened.status, 201);
    const { workspace } = (await opened.json()) as { workspace: { token: string } };
    const res = await fetch(`${origin}/w/${workspace.token}`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `https://app.adgrant.ai/w/${workspace.token}`);
  });

  it("leaves AdGrant.AI's hosts alone: their rooms did not move", async () => {
    for (const path of [ROOMS_PATH, "/w", "/w/tok_anything"]) {
      const res = await fetch(`${origin}${path}`, { redirect: "manual", headers: ADGRANT });
      assert.notEqual(res.status, 302, `${path} on app.adgrant.ai was sent away`);
    }
  });
});

describe("which hosts the move is on", () => {
  it("is every host but AdGrant.AI's", () => {
    for (const host of ["top-rated.team", "www.top-rated.team", "ai.top-rated.team", "localhost", undefined]) {
      assert.equal(roomsMovedOn(host), true, String(host));
    }
    for (const host of ["app.adgrant.ai", "adgrant.ai", "www.adgrant.ai", "APP.ADGRANT.AI"]) {
      assert.equal(roomsMovedOn(host), false, host);
    }
  });

  it("offers AdGrant.AI's panel and contact form a room, and Top-Rated Team's a link", () => {
    const ask = read("client/src/components/site/AskWidget.tsx");
    assert.match(ask, /onStartWorkspace \? \(/, "the panel no longer chooses between the room and the link");
    assert.ok(ask.includes("href={ROOMS_PATH}"));
    const lead = read("client/src/components/site/LeadDialog.tsx");
    assert.ok(lead.includes("!roomsMovedOn(window.location.hostname)"), "the contact form opens a room on Top-Rated Team's hosts again");
    assert.ok(read("client/src/pages/adgrant/DoorChat.tsx").includes("onStartWorkspace={keepFromPanel}"), "AdGrant.AI's panel lost its room");
  });
});

describe("nothing on Top-Rated Team's hosts opens a room of its own", () => {
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

  it("still opens AdGrant.AI's rooms, and any room on AdGrant.AI's own hosts", async () => {
    const ours = await fetch(`${origin}/api/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: { door: "ad-grants", entered: "direct" } }),
    });
    assert.equal(ours.status, 201);
    const theirs = await fetch(`${origin}/api/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ADGRANT },
      body: JSON.stringify({}),
    });
    assert.equal(theirs.status, 201);
  });

  it("tells an AI agent on the connector where Top-Rated Team's rooms are", async () => {
    const init = await fetch(`${origin}/api/connector/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {} } }),
    });
    const started = (await init.json()) as { result: { instructions: string } };
    assert.ok(started.result.instructions.includes(`${origin}${ROOMS_PATH}`), started.result.instructions);
    const posted = await fetch(`${origin}/api/connector/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doorId: "chatgpt-ads" }),
    });
    assert.equal(posted.status, 410);
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
