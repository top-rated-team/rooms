/**
 * LOGIN: given this person, which rooms are theirs. Run it with:
 *
 *   npx tsx --test server/room-login.test.ts
 *
 * LinkedIn and WhatsApp look up the same hashed identifiers identity already
 * stores. WhatsApp is house-only. A fork is not offered the owner's number.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { putBinding, resetIdentityStoreForTests } from "./identity-store";
import { resetIdentityForTests } from "./identity";
import {
  bindingsForTests,
  resetRoomAccessForTests,
  useMemoryRoomAccessForTests,
} from "./room-access";
import {
  LOGIN_CODE_RE,
  ROOM_LOGIN_LINKEDIN_UNCONFIGURED_LINE,
  completeRoomLoginLinkedIn,
  extractLoginCode,
  getRoomLoginWhatsAppConfirmed,
  proveRoomLoginWhatsApp,
  registerRoomTokenForTests,
  resetRoomLoginForTests,
  roomLoginAvailability,
  roomLoginLinkedInRedirectUri,
  startRoomLoginLinkedIn,
  startRoomLoginWhatsApp,
  whatsappProviderId,
} from "./room-login";
import type { AcceptedInboundMessage } from "./unipile/inbound";

const PUBLIC_BASE = "https://ai.top-rated.team";
const ROOM_TOKEN = "roomTokenFromLogin";
const WORKSPACE = "ws_room_login_test";
const CHAT = "chat_login_ada";
const PEPPER = "room-login-test-pepper";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function inbound(message: string, chatId = CHAT): AcceptedInboundMessage {
  return {
    accountId: "y8T1nMDYR0ejEsMQpLr9OA",
    chatId,
    messageId: "msg_login_1",
    message,
    sender: {
      attendeeId: "att_1",
      attendeeName: "Ada",
      attendeeProviderId: { form: "lid", value: "123@lid" },
    },
    timestamp: new Date().toISOString(),
  };
}

function setLinkedIn(): void {
  process.env.LINKEDIN_CLIENT_ID = "linkedin-client-id-for-tests";
  process.env.LINKEDIN_CLIENT_SECRET = "linkedin-client-secret-for-tests";
}

beforeEach(() => {
  resetRoomLoginForTests();
  resetIdentityForTests();
  resetIdentityStoreForTests();
  resetRoomAccessForTests();
  useMemoryRoomAccessForTests();
  process.env.ROOM_HASH_PEPPER = PEPPER;
  process.env.PUBLIC_BASE_URL = PUBLIC_BASE;
  setLinkedIn();
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_EMAIL_FROM = "rooms@example.test";
});

afterEach(() => {
  resetRoomLoginForTests();
  resetIdentityForTests();
  resetIdentityStoreForTests();
  resetRoomAccessForTests();
  delete process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_CLIENT_SECRET;
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.ROOM_HASH_PEPPER;
});

describe("roomLoginAvailability", () => {
  it("omits WhatsApp on a fork, and offers LinkedIn when the app is configured", async () => {
    const fork = await roomLoginAvailability({
      host: "partner.example",
      probe: async () => ({ ok: true, digits: "420774654822" }),
    });
    assert.deepEqual(fork.whatsapp, { available: false });
    assert.deepEqual(fork.linkedin, { available: true });
  });

  it("offers WhatsApp only on a house host when the probe succeeds", async () => {
    const house = await roomLoginAvailability({
      host: "top-rated.team",
      probe: async () => ({ ok: true, digits: "420774654822" }),
    });
    assert.deepEqual(house.whatsapp, { available: true });

    const down = await roomLoginAvailability({
      host: "top-rated.team",
      probe: async () => ({ ok: false, line: "WhatsApp is not reachable from this page right now, so LinkedIn is the way to bind this room." }),
    });
    assert.deepEqual(down.whatsapp, { available: false });
  });

  it("does not offer LinkedIn without PUBLIC_BASE_URL, so the redirect cannot be built from Host", async () => {
    delete process.env.PUBLIC_BASE_URL;
    const result = await roomLoginAvailability({
      host: "top-rated.team",
      probe: async () => ({ ok: false, line: "down" }),
    });
    assert.equal(result.linkedin.available, false);
    if (result.linkedin.available) return;
    assert.match(result.linkedin.unavailableLine, /public address/);
  });
});

describe("LinkedIn login", () => {
  it("uses PUBLIC_BASE_URL for the redirect, not a caller-supplied host", () => {
    const start = startRoomLoginLinkedIn();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const url = new URL(start.url);
    assert.equal(
      url.searchParams.get("redirect_uri"),
      roomLoginLinkedInRedirectUri(PUBLIC_BASE),
    );
    assert.equal(url.searchParams.get("redirect_uri")?.includes("attacker"), false);
  });

  it("finds rooms by LinkedIn subject, and binds the userinfo email when it arrives", async () => {
    await putBinding({
      workspaceId: WORKSPACE,
      provider: "linkedin",
      providerId: "linkedin:782bbtaQ",
      displayName: "Ada Example",
      boundAt: "2026-09-09T10:00:00.000Z",
    });
    registerRoomTokenForTests(WORKSPACE, ROOM_TOKEN);

    const start = startRoomLoginLinkedIn();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const result = await completeRoomLoginLinkedIn({
      state,
      code: "ok-code",
      fetchImpl: async (url, init) => {
        const href = String(url);
        if (href.includes("accessToken")) {
          return jsonResponse(200, { access_token: "liau_should_never_be_kept", expires_in: 3600 });
        }
        assert.match(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""), /liau_should_never_be_kept/);
        return jsonResponse(200, {
          sub: "782bbtaQ",
          name: "Ada Example",
          email: "ada@example.test",
        });
      },
    });
    assert.deepEqual(result, { ok: true, rooms: [{ token: ROOM_TOKEN }] });
    assert.equal(bindingsForTests("ada@example.test").length, 1);
    assert.equal(bindingsForTests("ada@example.test")[0]?.workspaceToken, ROOM_TOKEN);
  });

  it("returns no rooms for a LinkedIn account that has never bound one, without inventing any", async () => {
    const start = startRoomLoginLinkedIn();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);
    const result = await completeRoomLoginLinkedIn({
      state,
      code: "ok-code",
      fetchImpl: async (url) => {
        if (String(url).includes("accessToken")) {
          return jsonResponse(200, { access_token: "t", expires_in: 3600 });
        }
        return jsonResponse(200, { sub: "nobody", name: "Nobody" });
      },
    });
    assert.deepEqual(result, { ok: true, rooms: [] });
  });

  it("says so when LinkedIn is not configured", () => {
    delete process.env.LINKEDIN_CLIENT_ID;
    const start = startRoomLoginLinkedIn();
    assert.deepEqual(start, { ok: false, line: ROOM_LOGIN_LINKEDIN_UNCONFIGURED_LINE });
  });
});

describe("WhatsApp login", () => {
  it("refuses to start on a fork", async () => {
    const start = await startRoomLoginWhatsApp({
      host: "partner.example",
      probe: async () => ({ ok: true, digits: "420774654822" }),
    });
    assert.equal(start.ok, false);
  });

  it("plants a login code, not a room address, and opens rooms bound to that chat", async () => {
    await putBinding({
      workspaceId: WORKSPACE,
      provider: "whatsapp",
      providerId: whatsappProviderId(CHAT),
      displayName: "Ada",
      boundAt: "2026-09-09T10:00:00.000Z",
    });
    registerRoomTokenForTests(WORKSPACE, ROOM_TOKEN);

    const start = await startRoomLoginWhatsApp({
      host: "top-rated.team",
      probe: async () => ({ ok: true, digits: "420774654822" }),
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    assert.equal(start.offer.url.includes(ROOM_TOKEN), false);
    assert.match(start.offer.warning, /login code/);
    const text = decodeURIComponent(new URL(start.offer.url).searchParams.get("text") ?? "");
    const code = LOGIN_CODE_RE.exec(text)?.[1];
    assert.equal(code, extractLoginCode(text));
    assert.ok(code);
    assert.equal(getRoomLoginWhatsAppConfirmed(code).confirmed, false);

    await proveRoomLoginWhatsApp(inbound(`hello\nRoom-login ${code}`));
    assert.deepEqual(getRoomLoginWhatsAppConfirmed(code), {
      confirmed: true,
      rooms: [{ token: ROOM_TOKEN }],
    });
  });

  it("does not guess a room from a different chat than the one that sent the code", async () => {
    await putBinding({
      workspaceId: WORKSPACE,
      provider: "whatsapp",
      providerId: whatsappProviderId(CHAT),
      displayName: "Ada",
      boundAt: "2026-09-09T10:00:00.000Z",
    });
    registerRoomTokenForTests(WORKSPACE, ROOM_TOKEN);

    const start = await startRoomLoginWhatsApp({
      host: "top-rated.team",
      probe: async () => ({ ok: true, digits: "420774654822" }),
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const text = decodeURIComponent(new URL(start.offer.url).searchParams.get("text") ?? "");
    const code = extractLoginCode(text);
    assert.ok(code);

    await proveRoomLoginWhatsApp(inbound(`Room-login ${code}`, "chat_someone_else"));
    assert.deepEqual(getRoomLoginWhatsAppConfirmed(code), { confirmed: true, rooms: [] });
  });
});

describe("LOGIN_CODE_RE", () => {
  it("is the pattern extractLoginCode uses", () => {
    assert.equal(extractLoginCode("Room-login ABCDEFGHJKLN"), "ABCDEFGHJKLN");
    assert.equal(extractLoginCode("hello"), null);
  });
});
