/**
 * ChatWoot inbox path: a room opens its own contact and conversation, and
 * the four weaknesses this parcel was asked to fix. Run it with:
 *
 *   npx tsx --test server/bridge/inbox.test.ts
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { payloadContainsToken } from "./attribution";
import { isChatwootEcho, parseChatwootInbound } from "./chatwoot";
import {
  contactExternalId,
  ensureChatwootInboxConversation,
  identifierHash,
  ROOM_IDENTITY_ATTRIBUTE,
  roomIdentityAttributes,
  sendChatwootInboxText,
} from "./inbox";
import {
  acceptBridgeInbound,
  connectOrDisconnectBridge,
  fanOutIfBridged,
  resetBridgeForTests,
  storedBridgeForTests,
} from "./index";
import { storage } from "../storage";
import { UNATTRIBUTED_AUTHOR_KEY } from "./attribution";

const SECRET = "test-bridge-webhook-secret-chatwoot";
const HMAC = "inbox-hmac-token";

beforeEach(() => {
  resetBridgeForTests();
  process.env.BRIDGE_WEBHOOK_SECRET = SECRET;
  delete process.env.CHATWOOT_INBOX_IDENTIFIER;
  delete process.env.CHATWOOT_ACCOUNT_ID;
  delete process.env.CHATWOOT_BASE_URL;
  delete process.env.CHATWOOT_HMAC_TOKEN;
});

afterEach(() => {
  resetBridgeForTests();
  delete process.env.BRIDGE_WEBHOOK_SECRET;
  delete process.env.CHATWOOT_INBOX_IDENTIFIER;
  delete process.env.CHATWOOT_ACCOUNT_ID;
  delete process.env.CHATWOOT_BASE_URL;
  delete process.env.CHATWOOT_HMAC_TOKEN;
});

async function openRoom() {
  const created = await storage.createWorkspace({ name: "Inbox room" });
  const channel = created.channels.find((row) => row.kind === "project") ?? created.channels[0];
  return {
    token: created.token,
    workspaceId: created.workspace.id,
    name: created.workspace.name,
    channel,
  };
}

function jsonResponse(status: number, body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("room identity in ChatWoot attributes", () => {
  it("names the workspace, never the token", () => {
    const room = { id: "ws_abc", token: "tok_secret_bearer" };
    const attrs = roomIdentityAttributes(room.id);
    assert.equal(attrs[ROOM_IDENTITY_ATTRIBUTE], room.id);
    assert.equal(payloadContainsToken(attrs, room.token), false);
    assert.equal(contactExternalId(room.id), room.id);
    assert.equal(contactExternalId(room.id).includes(room.token), false);
  });

  it("creates a contact and a conversation without putting the token in either payload", async () => {
    const room = await openRoom();
    const calls: { url: string; body: string }[] = [];
    const result = await ensureChatwootInboxConversation(
      {
        baseUrl: "https://chatwoot.test",
        inboxIdentifier: "inbox_pub",
        workspaceId: room.workspaceId,
        workspaceName: room.name,
        token: room.token,
        hmacToken: HMAC,
      },
      async (url, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        calls.push({ url: String(url), body });
        if (String(url).endsWith("/contacts")) {
          return jsonResponse(200, { source_id: "src_room", id: 11 });
        }
        return jsonResponse(200, { id: 77, inbox_id: 3 });
      },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.contactIdentifier, "src_room");
    assert.equal(result.conversationId, "77");
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/public\/api\/v1\/inboxes\/inbox_pub\/contacts$/);
    assert.match(calls[1].url, /\/contacts\/src_room\/conversations$/);
    for (const call of calls) {
      assert.equal(call.body.includes(room.token), false, "the room token must not travel");
      const parsed = JSON.parse(call.body) as { custom_attributes?: Record<string, string>; identifier?: string; identifier_hash?: string };
      assert.equal(parsed.custom_attributes?.[ROOM_IDENTITY_ATTRIBUTE], room.workspaceId);
      assert.equal(JSON.stringify(parsed).includes(room.token), false);
    }
    const contact = JSON.parse(calls[0].body) as { identifier: string; identifier_hash: string };
    assert.equal(contact.identifier, room.workspaceId);
    assert.equal(contact.identifier_hash, identifierHash(room.workspaceId, HMAC));
  });

  it("sends as the contact on the Client API, not as an agent", async () => {
    const urls: string[] = [];
    const sent = await sendChatwootInboxText(
      {
        baseUrl: "https://chatwoot.test",
        inboxIdentifier: "inbox_pub",
        contactIdentifier: "src_room",
        conversationId: "77",
        text: "Dan B. · Owner\nHello from the room.",
      },
      async (url, init) => {
        urls.push(String(url));
        const body = typeof init?.body === "string" ? init.body : "";
        assert.equal(body.includes("/api/v1/accounts/"), false);
        const parsed = JSON.parse(body) as { content: string; message_type?: string };
        assert.equal(parsed.message_type, undefined);
        assert.match(parsed.content, /· Owner/);
        return jsonResponse(200);
      },
    );
    assert.equal(sent.ok, true);
    assert.match(urls[0] ?? "", /\/public\/api\/v1\/inboxes\/inbox_pub\/contacts\/src_room\/conversations\/77\/messages$/);
  });
});

describe("echo suppression", () => {
  it("treats message_type outgoing as an echo on the agent path", () => {
    const parsed = parseChatwootInbound({
      event: "message_created",
      id: 501,
      account: { id: 1 },
      conversation: { id: 9 },
      content: "Dan B. · Owner\nHello from the room.",
      message_type: "outgoing",
      sender: { id: 4, type: "user" },
      private: false,
    });
    assert.ok(parsed);
    assert.equal(parsed?.echo, true);
    assert.equal(parsed?.messageType, "outgoing");
    assert.equal(isChatwootEcho(parsed!, "agent"), true);
    assert.equal(isChatwootEcho(parsed!, "inbox"), false);
  });

  it("treats numeric message_type 1 the same as outgoing", () => {
    const parsed = parseChatwootInbound({
      event: "message_created",
      id: 502,
      account_id: 1,
      conversation_id: 9,
      content: "sent by us",
      message_type: 1,
      sender: { id: 4, type: "user" },
    });
    assert.ok(parsed);
    assert.equal(parsed?.echo, true);
    assert.equal(isChatwootEcho(parsed!, "agent"), true);
  });

  it("treats incoming contact messages as an echo on the inbox path, not on the agent path", () => {
    const parsed = parseChatwootInbound({
      event: "message_created",
      id: 503,
      account: { id: 1 },
      conversation: { id: 9 },
      content: "from the room, as the contact",
      message_type: "incoming",
      sender: { id: "src_room", type: "contact" },
    });
    assert.ok(parsed);
    assert.equal(parsed?.echo, false);
    assert.equal(isChatwootEcho(parsed!, "inbox"), true);
    assert.equal(isChatwootEcho(parsed!, "agent"), false);
  });
});

describe("connect without a pasted conversation id", () => {
  it("opens a contact and a conversation and indexes them by accountId:conversationId", async () => {
    const room = await openRoom();
    const connected = await connectOrDisconnectBridge(
      room.token,
      {
        action: "connect",
        kind: "chatwoot",
        inboxIdentifier: "inbox_pub",
        accountId: "1",
        baseUrl: "https://chatwoot.test",
        targetLabel: "Contractors",
      },
      async (url) => {
        if (String(url).endsWith("/contacts")) return jsonResponse(200, { source_id: "src_room" });
        return jsonResponse(200, { id: "88", inbox_id: 3 });
      },
    );
    assert.equal(connected.ok, true);
    if (!connected.ok) return;
    assert.equal(connected.bridges[0]?.targetLabel, "Contractors");
    const stored = storedBridgeForTests(room.workspaceId, "chatwoot");
    assert.ok(stored);
    assert.equal(stored?.target, "88");
    assert.equal(stored?.accountId, "1");
    assert.equal(stored?.inboxIdentifier, "inbox_pub");
    assert.equal(stored?.contactIdentifier, "src_room");
    assert.equal(stored?.token, room.token);
  });

  it("still accepts a pasted conversation id and an API token as the agent path", async () => {
    const room = await openRoom();
    const connected = await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "chatwoot",
      target: "12",
      accountId: "1",
      secret: "api_token_for_one_conversation",
      baseUrl: "https://chatwoot.test",
    });
    assert.equal(connected.ok, true);
    const stored = storedBridgeForTests(room.workspaceId, "chatwoot");
    assert.equal(stored?.target, "12");
    assert.equal(stored?.inboxIdentifier, null);
    assert.equal(stored?.secret, "api_token_for_one_conversation");
  });
});

describe("fan-out on the inbox path", () => {
  it("POSTs to the Client API and keeps the token out of the payload", async () => {
    const room = await openRoom();
    await connectOrDisconnectBridge(
      room.token,
      {
        action: "connect",
        kind: "chatwoot",
        inboxIdentifier: "inbox_pub",
        accountId: "1",
        baseUrl: "https://chatwoot.test",
      },
      async (url) => {
        if (String(url).endsWith("/contacts")) return jsonResponse(200, { source_id: "src_room" });
        return jsonResponse(200, { id: "88" });
      },
    );

    const posted = await storage.addMessage(room.workspaceId, {
      channelId: room.channel.id,
      authorKey: "human:dan",
      authorKind: "expert",
      body: `See the room at /w/${room.token}`,
    });
    const urls: string[] = [];
    const bodies: string[] = [];
    await fanOutIfBridged(room.token, posted, async (url, init) => {
      urls.push(String(url));
      bodies.push(typeof init?.body === "string" ? init.body : "");
      return jsonResponse(200);
    });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /\/public\/api\/v1\/inboxes\/inbox_pub\/contacts\/src_room\/conversations\/88\/messages$/);
    assert.equal(urls[0].includes("/api/v1/accounts/"), false);
    for (const body of bodies) {
      assert.equal(body.includes(room.token), false);
    }
  });
});

describe("inbound", () => {
  it("refuses everything when no webhook secret is configured", async () => {
    delete process.env.BRIDGE_WEBHOOK_SECRET;
    delete process.env.WAHA_WEBHOOK_SECRET;
    delete process.env.CHATWOOT_WEBHOOK_SECRET;
    const result = await acceptBridgeInbound(
      {
        event: "message_created",
        id: 1,
        account: { id: 1 },
        conversation: { id: 9 },
        content: "hello",
        message_type: "incoming",
      },
      undefined,
    );
    assert.equal(result.accepted, false);
    if (result.accepted) return;
    assert.equal(result.reason, "unauthorized");
  });

  it("does not collapse two genuine identical bodies that have different message ids", async () => {
    const room = await openRoom();
    await connectOrDisconnectBridge(
      room.token,
      {
        action: "connect",
        kind: "chatwoot",
        inboxIdentifier: "inbox_pub",
        accountId: "1",
        baseUrl: "https://chatwoot.test",
        senderMap: [{ sender: "44", memberKey: "visitor" }],
      },
      async (url) => {
        if (String(url).endsWith("/contacts")) return jsonResponse(200, { source_id: "src_room" });
        return jsonResponse(200, { id: "88" });
      },
    );

    const first = await acceptBridgeInbound(
      {
        event: "message_created",
        id: 601,
        account: { id: 1 },
        conversation: { id: 88 },
        content: "thanks",
        message_type: "outgoing",
        sender: { id: 44, type: "user" },
      },
      SECRET,
    );
    const second = await acceptBridgeInbound(
      {
        event: "message_created",
        id: 602,
        account: { id: 1 },
        conversation: { id: 88 },
        content: "thanks",
        message_type: "outgoing",
        sender: { id: 44, type: "user" },
      },
      SECRET,
    );
    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    if (!first.accepted || !second.accepted) return;
    assert.equal(first.handled, true);
    assert.equal(second.handled, true);

    const state = await storage.getWorkspaceByToken(room.token);
    const thanks = state?.messages.filter((row) => row.body === "thanks" && row.meta?.bridgeInbound === "chatwoot") ?? [];
    assert.equal(thanks.length, 2);
  });

  it("drops our own inbox-path send coming back as incoming, and keeps a contractor's outgoing", async () => {
    const room = await openRoom();
    await connectOrDisconnectBridge(
      room.token,
      {
        action: "connect",
        kind: "chatwoot",
        inboxIdentifier: "inbox_pub",
        accountId: "1",
        baseUrl: "https://chatwoot.test",
      },
      async (url) => {
        if (String(url).endsWith("/contacts")) return jsonResponse(200, { source_id: "src_room" });
        return jsonResponse(200, { id: "88" });
      },
    );

    const echo = await acceptBridgeInbound(
      {
        event: "message_created",
        id: 701,
        account: { id: 1 },
        conversation: { id: 88 },
        content: "from the room",
        message_type: "incoming",
        sender: { id: "src_room", type: "contact" },
      },
      SECRET,
    );
    assert.equal(echo.accepted, true);
    if (!echo.accepted) return;
    assert.equal(echo.handled, false);

    const contractor = await acceptBridgeInbound(
      {
        event: "message_created",
        id: 702,
        account: { id: 1 },
        conversation: { id: 88 },
        content: "I'll take this",
        message_type: "outgoing",
        sender: { id: 99, type: "user" },
      },
      SECRET,
    );
    assert.equal(contractor.accepted, true);
    if (!contractor.accepted) return;
    assert.equal(contractor.handled, true);

    const state = await storage.getWorkspaceByToken(room.token);
    const inbound = state?.messages.filter((row) => row.meta?.bridgeInbound === "chatwoot") ?? [];
    assert.equal(inbound.length, 1);
    assert.equal(inbound[0]?.authorKey, UNATTRIBUTED_AUTHOR_KEY);
    assert.match(inbound[0]?.body ?? "", /I'll take this/);
  });

  it("drops an agent-path outgoing so our Application-API send does not loop", async () => {
    const room = await openRoom();
    await connectOrDisconnectBridge(room.token, {
      action: "connect",
      kind: "chatwoot",
      target: "12",
      accountId: "1",
      secret: "api_token",
      baseUrl: "https://chatwoot.test",
    });
    const result = await acceptBridgeInbound(
      {
        event: "message_created",
        id: 801,
        account: { id: 1 },
        conversation: { id: 12 },
        content: "Dan B. · Owner\nHello",
        message_type: "outgoing",
        sender: { id: 4, type: "user" },
      },
      SECRET,
    );
    assert.equal(result.accepted, true);
    if (!result.accepted) return;
    assert.equal(result.handled, false);
    const state = await storage.getWorkspaceByToken(room.token);
    const inbound = state?.messages.filter((row) => row.meta?.bridgeInbound === "chatwoot") ?? [];
    assert.equal(inbound.length, 0);
  });
});
