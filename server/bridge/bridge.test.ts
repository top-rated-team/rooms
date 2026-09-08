/**
 * The bridge as a path in and out of a room. Run it with:
 *
 *   npx tsx --test server/bridge/bridge.test.ts
 *
 * The cases that have to stay true: a bridged agent turn claims through
 * server/spend.ts; an unmappable inbound sender is stored as unattributed;
 * the room token never appears in an outbound payload; a delivery failure is
 * written onto the message that failed, not only into a log; and an agent's
 * outbound line carries the Agent badge even when the display name is a
 * person's.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { MAX_TURNS_PER_HOUR, claimAgentTurn, resetSpendLedgerForTests } from "../spend";
import { storage } from "../storage";
import { DELIVERY_FAILED, UNATTRIBUTED_AUTHOR_KEY } from "./attribution";
import {
  acceptBridgeInbound,
  connectOrDisconnectBridge,
  fanOutIfBridged,
  resetBridgeForTests,
  runBridgedAgentTurn,
  storedBridgeForTests,
} from "./index";

beforeEach(() => {
  resetBridgeForTests();
  resetSpendLedgerForTests();
  delete process.env.WAHA_BASE_URL;
  delete process.env.WAHA_API_KEY;
});

async function openRoom() {
  const created = await storage.createWorkspace({ name: "Bridge room" });
  const channel = created.channels.find((row) => row.kind === "project") ?? created.channels[0];
  const visitor = created.members.find((row) => row.kind === "visitor");
  const owner = created.members.find((row) => row.memberKey === "human:dan") ?? created.members.find((row) => row.kind === "expert");
  return {
    token: created.token,
    workspaceId: created.workspace.id,
    channel,
    visitor,
    owner,
    members: created.members,
  };
}

function jsonResponse(status: number, body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("connect and disconnect", () => {
  it("connects one WhatsApp chat and forgets it again", async () => {
    const room = await openRoom();
    const connected = await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "whatsapp",
      target: "15551234567@c.us",
      targetLabel: "Jane's WhatsApp",
    });
    assert.equal(connected.ok, true);
    if (!connected.ok) return;
    assert.equal(connected.bridges.length, 1);
    assert.equal(connected.bridges[0].kind, "whatsapp");
    assert.equal(connected.bridges[0].connected, true);
    assert.equal(connected.bridges[0].targetLabel, "Jane's WhatsApp");
    const stored = storedBridgeForTests(room.workspaceId, "whatsapp");
    assert.ok(stored);
    assert.equal(stored?.token, room.token, "the token is kept to look the room up, and must not leave");

    const gone = await connectOrDisconnectBridge(room.token, { action: "disconnect", kind: "whatsapp" });
    assert.equal(gone.ok, true);
    if (!gone.ok) return;
    assert.equal(gone.bridges.length, 0);
  });

  it("refuses a Slack or ClickUp connection that would mirror a whole workspace", async () => {
    const room = await openRoom();
    const slack = await connectOrDisconnectBridge(room.token, { action: "connect", kind: "slack" });
    assert.equal(slack.ok, false);

    const clickup = await connectOrDisconnectBridge(room.token, { action: "connect", kind: "clickup", target: "list-1" });
    assert.equal(clickup.ok, false);
  });
});

describe("inbound", () => {
  it("marks an unmappable WhatsApp group sender unattributed rather than guessing", async () => {
    const room = await openRoom();
    await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "whatsapp",
      target: "120363group@g.us",
      targetLabel: "Client group",
    });

    const result = await acceptBridgeInbound(
      {
        event: "message",
        payload: {
          from: "120363group@g.us",
          participant: "15559876543@c.us",
          body: "Can we look at last week's numbers?",
          pushName: "Dan B.",
          fromMe: false,
        },
      },
      undefined,
    );
    assert.equal(result.accepted, true);

    const state = await storage.getWorkspaceByToken(room.token);
    assert.ok(state);
    const inbound = [...state!.messages].reverse().find((row) => row.meta?.bridgeInbound === "whatsapp");
    assert.ok(inbound, "the inbound message must land in the room");
    assert.equal(inbound?.authorKey, UNATTRIBUTED_AUTHOR_KEY);
    assert.equal(inbound?.authorKind, "system");
    assert.equal(inbound?.meta?.unattributed, true);
    assert.notEqual(inbound?.authorKey, room.visitor?.memberKey);
    assert.match(inbound?.body ?? "", /sender not identified/);
  });
});

describe("spend", () => {
  it("claims a bridged agent turn through server/spend.ts before the model is called", async () => {
    const room = await openRoom();
    let streamed = 0;
    const claims: string[] = [];

    async function* stream() {
      streamed += 1;
      yield { delta: "The pixel fires on Purchase." };
    }

    const posted = await runBridgedAgentTurn(
      {
        token: room.token,
        workspaceId: room.workspaceId,
        channelId: room.channel.id,
        agentId: "chatgpt-ads",
        question: "@chatgpt-ads why is the pixel quiet?",
      },
      {
        llmReady: () => true,
        claimAgentTurn: (workspaceId) => {
          claims.push(workspaceId);
          return claimAgentTurn(workspaceId);
        },
        streamAgentAnswer: stream,
        fetchImpl: async () => jsonResponse(200),
      },
    );

    assert.equal(claims.length, 1);
    assert.equal(claims[0], room.workspaceId);
    assert.equal(streamed, 1);
    assert.ok(posted);
    assert.equal(posted?.authorKind, "agent");
    assert.match(posted?.body ?? "", /pixel/i);
  });

  it("does not call the model once the room has used its hour", async () => {
    const room = await openRoom();
    for (let i = 0; i < MAX_TURNS_PER_HOUR; i += 1) claimAgentTurn(room.workspaceId);
    let streamed = 0;
    async function* stream() {
      streamed += 1;
      yield { delta: "should not run" };
    }

    const posted = await runBridgedAgentTurn(
      {
        token: room.token,
        workspaceId: room.workspaceId,
        channelId: room.channel.id,
        agentId: "chatgpt-ads",
        question: "@chatgpt-ads another one",
      },
      {
        llmReady: () => true,
        streamAgentAnswer: stream,
        fetchImpl: async () => jsonResponse(200),
      },
    );

    assert.equal(streamed, 0, "the model must not be called after the claim fails");
    assert.ok(posted);
    assert.match(posted?.body ?? "", /past hour|capped|stopped|not sent/i);
  });
});

describe("outbound", () => {
  it("never puts the room token in an outbound payload, including when the body had a /w/ link", async () => {
    process.env.WAHA_BASE_URL = "https://waha.test";
    const room = await openRoom();
    await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "whatsapp",
      target: "15551234567@c.us",
      targetLabel: "Jane's WhatsApp",
    });

    const bodies: string[] = [];
    const posted = await storage.addMessage(room.workspaceId, {
      channelId: room.channel.id,
      authorKey: room.owner?.memberKey ?? "human:dan",
      authorKind: "expert",
      body: `Read it in the room: https://example.test/w/${room.token}`,
    });

    await fanOutIfBridged(room.token, posted, async (_url, init) => {
      bodies.push(typeof init?.body === "string" ? init.body : "");
      return jsonResponse(200);
    });

    assert.ok(bodies.length > 0, "WhatsApp must have been called");
    for (const body of bodies) {
      assert.equal(body.includes(room.token), false, "the token is the account and must not leave");
      assert.match(body, /Dan B\. · Owner|Owner/);
      const parsed = JSON.parse(body) as Record<string, unknown>;
      assert.equal(JSON.stringify(parsed).includes(room.token), false);
      assert.equal(Object.keys(parsed).includes("token"), false);
    }
  });

  it("attributes an agent's outbound as Agent, never as a person", async () => {
    process.env.WAHA_BASE_URL = "https://waha.test";
    const room = await openRoom();
    await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "whatsapp",
      target: "15551234567@c.us",
    });

    const bodies: string[] = [];
    const posted = await storage.addMessage(room.workspaceId, {
      channelId: room.channel.id,
      authorKey: "agent:chatgpt-ads",
      authorKind: "agent",
      body: "Deduplicate on event_id.",
    });
    await fanOutIfBridged(room.token, posted, async (_url, init) => {
      bodies.push(typeof init?.body === "string" ? init.body : "");
      return jsonResponse(200);
    });

    assert.ok(bodies.length > 0);
    const text = JSON.parse(bodies[0]) as { text: string };
    assert.match(text.text, /· Agent\n/);
    assert.equal(text.text.includes(" · Owner"), false);
    assert.equal(text.text.includes(" · Contractor"), false);
  });

  it("writes a delivery failure onto the message that failed, not only into a log", async () => {
    process.env.WAHA_BASE_URL = "https://waha.test";
    const room = await openRoom();
    await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "whatsapp",
      target: "15551234567@c.us",
    });

    const posted = await storage.addMessage(room.workspaceId, {
      channelId: room.channel.id,
      authorKey: room.owner?.memberKey ?? "human:dan",
      authorKind: "expert",
      body: "Sent from the room.",
    });

    const updated = await fanOutIfBridged(room.token, posted, async () => {
      throw new Error("ECONNREFUSED");
    });

    assert.ok(updated);
    assert.equal(updated?.meta?.bridgeDelivery, "failed");
    assert.equal(updated?.meta?.error, DELIVERY_FAILED.whatsapp);
    assert.equal(updated?.id, posted.id, "the failure is on the message that was not delivered");

    const state = await storage.getWorkspaceByToken(room.token);
    const row = state?.messages.find((message) => message.id === posted.id);
    assert.equal(row?.meta?.error, DELIVERY_FAILED.whatsapp);
  });
});
