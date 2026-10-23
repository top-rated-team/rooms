/**
 * The bridge through the real HTTP routes. Run it with:
 *
 *   npx tsx --test --test-force-exit server/bridge/routes.test.ts
 *
 * The cases that have to stay true: a message a person types in the web room
 * goes out over the room's bridges, named from the member record like every
 * other outbound line; and Slack's signed handshake gets its challenge back
 * through Express, which only works if the raw body survived the JSON parser.
 */

import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { storage } from "../storage";
import { connectOrDisconnectBridge, resetBridgeForTests } from "./index";
import { BRIDGE_INBOUND_PATH, keepBridgeRawBody } from "./signatures";

const SLACK_SECRET = "test-slack-signing-secret";
const WAHA = "https://waha.test";

const realFetch = globalThis.fetch;
const wahaBodies: string[] = [];
let origin = "";
let server: Server;

before(async () => {
  /* Outbound sends use the global fetch. Anything for the WAHA host is caught
     here; the test's own requests to this server go through untouched. */
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input instanceof Request ? input.url : input).startsWith(WAHA)) {
      wahaBodies.push(typeof init?.body === "string" ? init.body : "");
      return new Response(JSON.stringify({ id: "wamid" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const { registerRoutes } = await import("../routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb", verify: keepBridgeRawBody }));
  registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetBridgeForTests();
  wahaBodies.length = 0;
  process.env.WAHA_BASE_URL = WAHA;
  delete process.env.WAHA_API_KEY;
  process.env.SLACK_SIGNING_SECRET = SLACK_SECRET;
});

async function waitFor(check: () => boolean, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function roomWithWhatsApp(visitorName?: string) {
  const created = await storage.createWorkspace({ name: "Typed room", visitorName });
  const channel = created.channels.find((row) => row.kind === "project") ?? created.channels[0];
  await connectOrDisconnectBridge(created.token, { action: "connect", kind: "whatsapp", target: "120363clientgroup@g.us" });
  return { token: created.token, channel };
}

async function typeInRoom(token: string, channelId: string, body: string): Promise<number> {
  const res = await realFetch(`${origin}/api/workspaces/${token}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, body }),
  });
  return res.status;
}

function outboundTexts(): string[] {
  return wahaBodies.map((body) => (JSON.parse(body) as { text: string }).text);
}

describe("a person's message typed in the web room", () => {
  it("goes out over the bridge, named from the member record", async () => {
    const room = await roomWithWhatsApp("Jane Client");
    const status = await typeInRoom(room.token, room.channel.id, "Can we move the call to Thursday?");
    assert.equal(status, 201);

    await waitFor(() => outboundTexts().some((text) => text.includes("Thursday")));
    const sent = outboundTexts().find((text) => text.includes("Thursday"));
    assert.ok(sent, "the typed message must reach WhatsApp");
    assert.equal(sent, "Jane Client · Guest\nCan we move the call to Thursday?");
  });

  it("never sends the room's own word for an unnamed visitor as their name", async () => {
    const room = await roomWithWhatsApp();
    await typeInRoom(room.token, room.channel.id, "Quick question about the invoice.");

    await waitFor(() => outboundTexts().some((text) => text.includes("invoice")));
    const sent = outboundTexts().find((text) => text.includes("invoice"));
    assert.ok(sent);
    assert.match(sent!, /^The client · Guest\n/);
    assert.equal(sent!.startsWith("You "), false);
  });

  it("does not carry the room address out, even when the person pastes it", async () => {
    const room = await roomWithWhatsApp("Jane Client");
    await typeInRoom(room.token, room.channel.id, `Link for the team: https://example.test/w/${room.token}`);

    await waitFor(() => outboundTexts().some((text) => text.includes("Link for the team")));
    const sent = wahaBodies.find((body) => body.includes("Link for the team"));
    assert.ok(sent);
    assert.equal(sent!.includes(room.token), false);
  });
});

describe("Slack's handshake over HTTP", () => {
  const handshake = JSON.stringify({ token: "legacy", challenge: "abc123challenge", type: "url_verification" });

  function signed(body: string, secret = SLACK_SECRET): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {
      "Content-Type": "application/json",
      "X-Slack-Request-Timestamp": timestamp,
      "X-Slack-Signature": `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
    };
  }

  it("answers a signed url_verification with its challenge", async () => {
    const res = await realFetch(`${origin}${BRIDGE_INBOUND_PATH}`, { method: "POST", headers: signed(handshake), body: handshake });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { challenge: "abc123challenge" });
  });

  it("answers 401 when the signature is not Slack's", async () => {
    const res = await realFetch(`${origin}${BRIDGE_INBOUND_PATH}`, {
      method: "POST",
      headers: signed(handshake, "not-the-signing-secret"),
      body: handshake,
    });
    assert.equal(res.status, 401);
  });
});
