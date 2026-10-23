/**
 * Slack and ClickUp, in and out of a room. Run it with:
 *
 *   npx tsx --test server/bridge/providers.test.ts
 *
 * The cases that have to stay true: a Slack event reaches the room that
 * connected that channel and no other; Slack's url_verification gets its
 * challenge back, and only when signed; each provider is believed only on its
 * own proof; and the comment we post to ClickUp does not come back into the
 * room, or out to the other bridges, as if somebody had written it there.
 */

import { createHmac } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Message } from "@shared/schema";
import { storage } from "../storage";
import {
  acceptBridgeInbound,
  connectOrDisconnectBridge,
  fanOutIfBridged,
  resetBridgeForTests,
  storedBridgeForTests,
  type BridgeInboundAuth,
} from "./index";

const SHARED_SECRET = "test-bridge-webhook-secret";
const SLACK_SECRET = "test-slack-signing-secret";
const CLICKUP_SECRET = "test-clickup-webhook-secret";
const SLACK_HOOK = "https://hooks.slack.test/services/T000/B000/XXXX";

beforeEach(() => {
  resetBridgeForTests();
  process.env.BRIDGE_WEBHOOK_SECRET = SHARED_SECRET;
  process.env.SLACK_SIGNING_SECRET = SLACK_SECRET;
  process.env.CLICKUP_WEBHOOK_SECRET = CLICKUP_SECRET;
  process.env.WAHA_BASE_URL = "https://waha.test";
  delete process.env.WAHA_API_KEY;
});

async function openRoom(name: string) {
  const created = await storage.createWorkspace({ name });
  const owner = created.members.find((row) => row.memberKey === "human:dan") ?? created.members.find((row) => row.kind === "expert");
  const channel = created.channels.find((row) => row.kind === "project") ?? created.channels[0];
  return { token: created.token, workspaceId: created.workspace.id, owner, channel };
}

async function bridgedMessages(token: string, source: string): Promise<Message[]> {
  const state = await storage.getWorkspaceByToken(token);
  return (state?.messages ?? []).filter((row) => row.meta?.bridgeInbound === source);
}

function jsonResponse(status: number, body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A body as Slack would send it, with the headers Slack would sign it with. */
function fromSlack(body: unknown, secret = SLACK_SECRET): { raw: unknown; auth: BridgeInboundAuth } {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return { raw: JSON.parse(rawBody), auth: { rawBody, slackSignature: signature, slackTimestamp: timestamp } };
}

function fromClickUp(body: unknown, secret = CLICKUP_SECRET): { raw: unknown; auth: BridgeInboundAuth } {
  const rawBody = JSON.stringify(body);
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  return { raw: JSON.parse(rawBody), auth: { rawBody, clickUpSignature: signature } };
}

function slackMessage(channel: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    type: "event_callback",
    event_id: `Ev${Math.random().toString(36).slice(2)}`,
    event: { type: "message", channel, user: "U0SOMEONE", text, ts: `${Date.now() / 1000}`, ...extra },
  };
}

function clickUpComment(taskId: string, text: string, commentId: string, event = "taskCommentPosted") {
  return {
    event,
    task_id: taskId,
    webhook_id: "wh-test",
    history_items: [
      {
        id: `hist-${commentId}`,
        type: 1,
        field: "comment",
        user: { id: 183 },
        comment: { id: commentId, text_content: text, user: { id: 183 } },
      },
    ],
  };
}

async function connectSlack(token: string, channel: string) {
  return connectOrDisconnectBridge(token, {
    action: "connect",
    kind: "slack",
    target: channel,
    secret: SLACK_HOOK,
    targetLabel: "#client",
  });
}

describe("Slack routing", () => {
  it("keeps the real channel id, and refuses a channel name", async () => {
    const room = await openRoom("Slack id room");
    const named = await connectSlack(room.token, "#client-project");
    assert.equal(named.ok, false);
    if (!named.ok) assert.equal(named.status, 400);

    const connected = await connectSlack(room.token, "c0123abcdef");
    assert.equal(connected.ok, true);
    assert.equal(storedBridgeForTests(room.workspaceId, "slack")?.target, "C0123ABCDEF");
  });

  it("delivers an event to the room that connected that channel, not the last room to connect Slack", async () => {
    const first = await openRoom("First Slack room");
    const second = await openRoom("Second Slack room");
    await connectSlack(first.token, "C0FIRST0001");
    await connectSlack(second.token, "C0SECOND002");

    const toFirst = fromSlack(slackMessage("C0FIRST0001", "For the first room"));
    const result = await acceptBridgeInbound(toFirst.raw, toFirst.auth);
    assert.deepEqual(result, { accepted: true, handled: true });

    assert.equal((await bridgedMessages(first.token, "slack")).length, 1);
    assert.match((await bridgedMessages(first.token, "slack"))[0].body, /For the first room/);
    assert.equal((await bridgedMessages(second.token, "slack")).length, 0, "the room that connected last must not get it");
  });

  it("drops an event from a channel no room connected", async () => {
    const room = await openRoom("Slack stray room");
    await connectSlack(room.token, "C0CONNECTED");

    const stray = fromSlack(slackMessage("C0SOMEWHERE", "Not for any room"));
    const result = await acceptBridgeInbound(stray.raw, stray.auth);
    assert.deepEqual(result, { accepted: true, handled: false });
    assert.equal((await bridgedMessages(room.token, "slack")).length, 0);
  });

  it("does not bring Slack's own notices into the room", async () => {
    const room = await openRoom("Slack notice room");
    await connectSlack(room.token, "C0NOTICES01");

    const joined = fromSlack(slackMessage("C0NOTICES01", "<@U0BOT> has joined the channel", { subtype: "channel_join" }));
    assert.deepEqual(await acceptBridgeInbound(joined.raw, joined.auth), { accepted: true, handled: false });
    const ours = fromSlack(slackMessage("C0NOTICES01", "Dan B. · Owner\nhello", { subtype: "bot_message", bot_id: "B0HOOK" }));
    assert.deepEqual(await acceptBridgeInbound(ours.raw, ours.auth), { accepted: true, handled: false });
    assert.equal((await bridgedMessages(room.token, "slack")).length, 0);
  });
});

describe("Slack's url_verification", () => {
  const handshake = { token: "legacy-token", challenge: "made-up-challenge-for-this-test", type: "url_verification" };

  it("echoes the challenge of a signed handshake", async () => {
    const signed = fromSlack(handshake);
    const result = await acceptBridgeInbound(signed.raw, signed.auth);
    assert.deepEqual(result, { accepted: true, handled: false, challenge: handshake.challenge });
  });

  it("refuses a handshake that is not signed with the app's secret", async () => {
    const forged = fromSlack(handshake, "not-the-signing-secret");
    assert.deepEqual(await acceptBridgeInbound(forged.raw, forged.auth), { accepted: false, reason: "unauthorized" });
  });

  it("refuses every Slack request when no signing secret is set", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const signed = fromSlack(handshake);
    assert.deepEqual(await acceptBridgeInbound(signed.raw, signed.auth), { accepted: false, reason: "unauthorized" });
  });
});

describe("each provider on its own proof", () => {
  it("does not let the WAHA and ChatWoot secret write a Slack or ClickUp body into a room", async () => {
    const room = await openRoom("Shared secret room");
    await connectSlack(room.token, "C0SHARED001");
    await connectOrDisconnectBridge(room.token, { action: "connect", kind: "clickup", target: "task-shared", secret: "pk_test" });

    const slack = await acceptBridgeInbound(slackMessage("C0SHARED001", "via the shared secret"), SHARED_SECRET);
    assert.deepEqual(slack, { accepted: true, handled: false });
    const clickup = await acceptBridgeInbound(clickUpComment("task-shared", "via the shared secret", "c-1"), SHARED_SECRET);
    assert.deepEqual(clickup, { accepted: true, handled: false });

    assert.equal((await bridgedMessages(room.token, "slack")).length, 0);
    assert.equal((await bridgedMessages(room.token, "clickup")).length, 0);
  });

  it("refuses a ClickUp delivery with a wrong signature, or with no webhook secret set", async () => {
    const room = await openRoom("ClickUp proof room");
    await connectOrDisconnectBridge(room.token, { action: "connect", kind: "clickup", target: "task-proof", secret: "pk_test" });

    const forged = fromClickUp(clickUpComment("task-proof", "forged", "c-2"), "not-the-webhook-secret");
    assert.deepEqual(await acceptBridgeInbound(forged.raw, forged.auth), { accepted: false, reason: "unauthorized" });

    delete process.env.CLICKUP_WEBHOOK_SECRET;
    const signed = fromClickUp(clickUpComment("task-proof", "signed", "c-3"));
    assert.deepEqual(await acceptBridgeInbound(signed.raw, signed.auth), { accepted: false, reason: "unauthorized" });
    assert.equal((await bridgedMessages(room.token, "clickup")).length, 0);
  });

  it("refuses a request that carries no proof at all", async () => {
    assert.deepEqual(await acceptBridgeInbound({ text: "hello" }, {}), { accepted: false, reason: "unauthorized" });
    assert.deepEqual(await acceptBridgeInbound({ text: "hello" }, undefined), { accepted: false, reason: "unauthorized" });
  });
});

describe("ClickUp's echo", () => {
  async function roomWithClickUpAndWhatsApp() {
    const room = await openRoom("ClickUp echo room");
    await connectOrDisconnectBridge(room.token, { action: "connect", kind: "clickup", target: "task-echo", secret: "pk_test" });
    await connectOrDisconnectBridge(room.token, { action: "connect", kind: "whatsapp", target: "15551234567@c.us" });
    return room;
  }

  /** Posts a room message out, and returns the comment ClickUp was sent. */
  async function postFromRoom(room: Awaited<ReturnType<typeof openRoom>>, body: string, commentId: string): Promise<string> {
    const posted = await storage.addMessage(room.workspaceId, {
      channelId: room.channel.id,
      authorKey: room.owner?.memberKey ?? "human:dan",
      authorKind: "expert",
      body,
    });
    let comment = "";
    await fanOutIfBridged(room.token, posted, async (url, init) => {
      if (String(url).includes("api.clickup.com")) {
        comment = (JSON.parse(String(init?.body)) as { comment_text: string }).comment_text;
        return jsonResponse(200, { id: commentId, hist_id: `hist-${commentId}`, date: Date.now() });
      }
      return jsonResponse(200);
    });
    assert.ok(comment, "ClickUp must have been sent the comment");
    return comment;
  }

  it("drops our own comment when it comes back with the id ClickUp gave it", async () => {
    const room = await roomWithClickUpAndWhatsApp();
    const comment = await postFromRoom(room, "The tag is live on the thank-you page.", "90120000001");

    const sentOnwards: string[] = [];
    const echo = fromClickUp(clickUpComment("task-echo", `${comment}\n`, "90120000001"));
    const result = await acceptBridgeInbound(echo.raw, echo.auth, {
      fetchImpl: async (url) => {
        sentOnwards.push(String(url));
        return jsonResponse(200);
      },
    });

    assert.deepEqual(result, { accepted: true, handled: false });
    assert.equal((await bridgedMessages(room.token, "clickup")).length, 0, "our comment must not land in the room again");
    assert.deepEqual(sentOnwards, [], "and must not be sent on to WhatsApp");
  });

  it("drops our own comment by its text when the webhook arrives before ClickUp's reply names its id", async () => {
    const room = await roomWithClickUpAndWhatsApp();
    const comment = await postFromRoom(room, "Numbers attached.", "90120000002");

    const echo = fromClickUp(clickUpComment("task-echo", comment.replace(/\n/g, "\r\n"), "some-other-id"));
    assert.deepEqual(await acceptBridgeInbound(echo.raw, echo.auth), { accepted: true, handled: false });
    assert.equal((await bridgedMessages(room.token, "clickup")).length, 0);
  });

  it("drops a retried delivery of our comment too", async () => {
    const room = await roomWithClickUpAndWhatsApp();
    const comment = await postFromRoom(room, "Retry me.", "90120000003");

    const echo = fromClickUp(clickUpComment("task-echo", comment, "90120000003"));
    assert.deepEqual(await acceptBridgeInbound(echo.raw, echo.auth), { accepted: true, handled: false });
    assert.deepEqual(await acceptBridgeInbound(echo.raw, echo.auth), { accepted: true, handled: false });
    assert.equal((await bridgedMessages(room.token, "clickup")).length, 0);
  });

  it("still brings in a comment a person wrote in ClickUp, and sends it on to the other bridges", async () => {
    const room = await roomWithClickUpAndWhatsApp();
    await postFromRoom(room, "Our update.", "90120000004");

    const sentOnwards: string[] = [];
    const person = fromClickUp(clickUpComment("task-echo", "Thanks, looks good from our side.", "90120000005"));
    const result = await acceptBridgeInbound(person.raw, person.auth, {
      fetchImpl: async (url, init) => {
        sentOnwards.push(`${String(url)} ${String(init?.body)}`);
        return jsonResponse(200);
      },
    });

    assert.deepEqual(result, { accepted: true, handled: true });
    const landed = await bridgedMessages(room.token, "clickup");
    assert.equal(landed.length, 1);
    assert.match(landed[0].body, /looks good from our side/);
    assert.equal(sentOnwards.length, 1, "WhatsApp, and not ClickUp again");
    assert.match(sentOnwards[0], /waha\.test/);
  });

  it("ignores an edited comment rather than writing it into the room a second time", async () => {
    const room = await roomWithClickUpAndWhatsApp();
    const edited = fromClickUp(clickUpComment("task-echo", "Edited words", "90120000006", "taskCommentUpdated"));
    assert.deepEqual(await acceptBridgeInbound(edited.raw, edited.auth), { accepted: true, handled: false });
    assert.equal((await bridgedMessages(room.token, "clickup")).length, 0);
  });
});

describe("a visitor's own message", () => {
  it("goes to Slack but not back to the one-to-one WhatsApp chat that is the visitor", async () => {
    const created = await storage.createWorkspace({ name: "Visitor out room", visitorName: "Jane Client" });
    const channel = created.channels.find((row) => row.kind === "project") ?? created.channels[0];
    await connectOrDisconnectBridge(created.token, { action: "connect", kind: "whatsapp", target: "15551234567@c.us" });
    await connectSlack(created.token, "C0VISITOR01");

    const posted = await storage.addMessage(created.workspace.id, {
      channelId: channel.id,
      authorKey: "visitor",
      authorKind: "visitor",
      body: "Typed in the room.",
    });
    const calls: string[] = [];
    await fanOutIfBridged(created.token, posted, async (url, init) => {
      calls.push(`${String(url)} ${String(init?.body)}`);
      return jsonResponse(200);
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0], /hooks\.slack\.test/);
    assert.match(calls[0], /Jane Client · Guest\\nTyped in the room\./);
  });
});

describe("a room's own Slack or ClickUp secret", () => {
  const ROOM_SLACK_SECRET = "room-own-slack-signing-secret";
  const ROOM_CLICKUP_SECRET = "room-own-clickup-webhook-secret";

  it("checks a room's Slack events with its own secret, and with nothing else", async () => {
    const own = await openRoom("Own Slack app room");
    const shared = await openRoom("Deployment Slack app room");
    await connectOrDisconnectBridge(own.token, {
      action: "connect",
      kind: "slack",
      target: "C0OWNAPP001",
      secret: SLACK_HOOK,
      inboundSecret: ROOM_SLACK_SECRET,
    });
    await connectSlack(shared.token, "C0DEPLOY001");

    const deploymentSigned = fromSlack(slackMessage("C0OWNAPP001", "signed with the deployment's"));
    assert.deepEqual(await acceptBridgeInbound(deploymentSigned.raw, deploymentSigned.auth), {
      accepted: false,
      reason: "unauthorized",
    });
    const ownSigned = fromSlack(slackMessage("C0OWNAPP001", "signed with the room's own"), ROOM_SLACK_SECRET);
    assert.deepEqual(await acceptBridgeInbound(ownSigned.raw, ownSigned.auth), { accepted: true, handled: true });

    /* Another room's secret is no key to a room that uses the deployment's. */
    const crossSigned = fromSlack(slackMessage("C0DEPLOY001", "signed with the other room's"), ROOM_SLACK_SECRET);
    assert.deepEqual(await acceptBridgeInbound(crossSigned.raw, crossSigned.auth), { accepted: false, reason: "unauthorized" });
    const sharedSigned = fromSlack(slackMessage("C0DEPLOY001", "signed with the deployment's"));
    assert.deepEqual(await acceptBridgeInbound(sharedSigned.raw, sharedSigned.auth), { accepted: true, handled: true });

    assert.equal((await bridgedMessages(own.token, "slack")).length, 1);
    assert.equal((await bridgedMessages(shared.token, "slack")).length, 1);
  });

  it("answers the handshake of a room's own Slack app with no deployment secret set", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const room = await openRoom("Own Slack handshake room");
    await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "slack",
      target: "C0OWNHAND01",
      secret: SLACK_HOOK,
      inboundSecret: ROOM_SLACK_SECRET,
    });
    const handshake = fromSlack({ type: "url_verification", challenge: "own-app-challenge" }, ROOM_SLACK_SECRET);
    assert.deepEqual(await acceptBridgeInbound(handshake.raw, handshake.auth), {
      accepted: true,
      handled: false,
      challenge: "own-app-challenge",
    });
  });

  it("checks a room's ClickUp deliveries with its own webhook secret, and with nothing else", async () => {
    const room = await openRoom("Own ClickUp webhook room");
    await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "clickup",
      target: "task-own",
      secret: "pk_test",
      inboundSecret: ROOM_CLICKUP_SECRET,
    });

    const deploymentSigned = fromClickUp(clickUpComment("task-own", "signed with the deployment's", "c-own-1"));
    assert.deepEqual(await acceptBridgeInbound(deploymentSigned.raw, deploymentSigned.auth), {
      accepted: false,
      reason: "unauthorized",
    });
    const ownSigned = fromClickUp(clickUpComment("task-own", "signed with the room's own", "c-own-2"), ROOM_CLICKUP_SECRET);
    assert.deepEqual(await acceptBridgeInbound(ownSigned.raw, ownSigned.auth), { accepted: true, handled: true });
    assert.equal((await bridgedMessages(room.token, "clickup")).length, 1);
  });

  it("stops using a room's own secret once it reconnects without one", async () => {
    const room = await openRoom("Reconnected ClickUp room");
    const connect = (inboundSecret?: string) =>
      connectOrDisconnectBridge(room.token, { action: "connect", kind: "clickup", target: "task-again", secret: "pk_test", inboundSecret });
    await connect(ROOM_CLICKUP_SECRET);
    assert.equal(storedBridgeForTests(room.workspaceId, "clickup")?.inboundSecret, ROOM_CLICKUP_SECRET);

    await connect();
    assert.equal(storedBridgeForTests(room.workspaceId, "clickup")?.inboundSecret, null);
    const oldSigned = fromClickUp(clickUpComment("task-again", "old secret", "c-again-1"), ROOM_CLICKUP_SECRET);
    assert.deepEqual(await acceptBridgeInbound(oldSigned.raw, oldSigned.auth), { accepted: false, reason: "unauthorized" });
    const deploymentSigned = fromClickUp(clickUpComment("task-again", "deployment secret", "c-again-2"));
    assert.deepEqual(await acceptBridgeInbound(deploymentSigned.raw, deploymentSigned.auth), { accepted: true, handled: true });
  });

  it("is never kept for WhatsApp or ChatWoot, and never shown to the room", async () => {
    const room = await openRoom("No inbound secret room");
    const connected = await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "whatsapp",
      target: "15551234567@c.us",
      inboundSecret: "ignored",
    });
    assert.equal(storedBridgeForTests(room.workspaceId, "whatsapp")?.inboundSecret, null);
    assert.equal(JSON.stringify(connected).includes("ignored"), false);

    const slack = await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "slack",
      target: "C0PUBLIC001",
      secret: SLACK_HOOK,
      inboundSecret: ROOM_SLACK_SECRET,
    });
    assert.equal(JSON.stringify(slack).includes(ROOM_SLACK_SECRET), false);
  });
});
