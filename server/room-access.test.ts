/**
 * Email way back into a room. Run it with:
 *
 *   npx tsx --test server/room-access.test.ts
 *
 * The cases that have to stay true: the reply is the same whether or not a
 * room was found; the mailed token is not the room's own address; a stored
 * row is a hash, so a stolen dump does not yield a working link; the token
 * works once and then is spent; it is dead after an hour; a deployment with
 * no mail configured says so rather than pretending a link was sent; and
 * sending is limited per address and per room.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ROOM_ACCESS_SENT_LINE,
  ROOM_ACCESS_TTL_MS,
  ROOM_ACCESS_TTL_PHRASE,
} from "@shared/api";
import {
  ROOM_ACCESS_INVALID_EMAIL_LINE,
  ROOM_ACCESS_SPENT_LINE,
  ROOM_ACCESS_UNAVAILABLE_LINE,
  SEND_COOLDOWN_MS,
  bindRoomAddress,
  bindingsForTests,
  issuedLinksForTests,
  mailConfigured,
  openRoomAccess,
  parseEmail,
  resetRoomAccessForTests,
  roomAccessAvailability,
  sendRoomAccessLink,
} from "./room-access";

const PUBLIC_BASE = "https://example.test";
const ROOM_TOKEN = "roomTokenThatMustNeverBeMailed";
const WORKSPACE = "ws_room_access_test";
const ADDRESS = "ada@example.test";

let posted: { url: string; body: string }[] = [];
let resendOk = true;
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetRoomAccessForTests();
  posted = [];
  resendOk = true;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.LEAD_EMAIL_FROM = "rooms@example.test";
  process.env.ROOM_HASH_PEPPER = "room-access-test-pepper";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    posted.push({ url: href, body: typeof init?.body === "string" ? init.body : String(init?.body ?? "") });
    return new Response("{}", { status: resendOk ? 200 : 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("the shared duration", () => {
  it("is one hour, and the phrase a visitor reads matches that number", () => {
    assert.equal(ROOM_ACCESS_TTL_MS, 60 * 60 * 1000);
    assert.equal(ROOM_ACCESS_TTL_PHRASE, "one hour");
  });
});

describe("mailConfigured", () => {
  it("is false when the key is missing, even if a From address is set", () => {
    delete process.env.RESEND_API_KEY;
    assert.equal(mailConfigured(), false);
    assert.deepEqual(roomAccessAvailability(), {
      available: false,
      unavailableLine: ROOM_ACCESS_UNAVAILABLE_LINE,
    });
  });

  it("is false when the From address is missing", () => {
    delete process.env.LEAD_EMAIL_FROM;
    assert.equal(mailConfigured(), false);
  });

  it("is true when both are set", () => {
    assert.equal(mailConfigured(), true);
    assert.deepEqual(roomAccessAvailability(), { available: true });
  });
});

describe("sendRoomAccessLink", () => {
  it("returns the same line whether or not a room is bound to the address", async () => {
    const unknown = await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE });
    assert.deepEqual(unknown, { ok: true, body: { line: ROOM_ACCESS_SENT_LINE } });
    assert.equal(posted.length, 0, "must not mail a stranger");

    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: ADDRESS });
    const known = await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE });
    assert.deepEqual(known, { ok: true, body: { line: ROOM_ACCESS_SENT_LINE } });
    assert.equal(posted.length, 1);
  });

  it("says the route is unavailable rather than pretending a link was sent", async () => {
    delete process.env.RESEND_API_KEY;
    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: ADDRESS });
    const result = await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE });
    assert.deepEqual(result, { ok: false, status: 503, error: ROOM_ACCESS_UNAVAILABLE_LINE });
    assert.equal(posted.length, 0);
  });

  it("rejects an address that is not an address, without the found-or-not line", async () => {
    const result = await sendRoomAccessLink({ email: "not-an-address", publicBaseUrl: PUBLIC_BASE });
    assert.deepEqual(result, { ok: false, status: 400, error: ROOM_ACCESS_INVALID_EMAIL_LINE });
    assert.equal(posted.length, 0);
  });

  it("mails a single-use URL that is not the room's own address", async () => {
    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: ADDRESS });
    const result = await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE });
    assert.equal(result.ok, true);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].url, "https://api.resend.com/emails");

    const payload = JSON.parse(posted[0].body) as { to: string[]; text: string };
    assert.deepEqual(payload.to, [ADDRESS]);
    assert.equal(payload.text.includes(ROOM_TOKEN), false, "the room token must never be in the email");
    assert.equal(payload.text.includes(`/w/${ROOM_TOKEN}`), false);
    assert.match(payload.text, /\/api\/room-access\/[0-9A-Za-z]{32}/);
    assert.match(payload.text, new RegExp(ROOM_ACCESS_TTL_PHRASE));

    const stored = issuedLinksForTests();
    assert.equal(stored.length, 1);
    const dumped = JSON.stringify(stored);
    const mailed = payload.text.match(/\/api\/room-access\/([0-9A-Za-z]{32})/)?.[1];
    assert.ok(mailed);
    assert.equal(dumped.includes(mailed), false, "a stolen dump must not contain the mailed token");
    assert.equal(dumped.includes(ROOM_TOKEN), true, "the server still needs the room token to redirect");
    assert.equal(stored[0].tokenHash.length, 64);
    assert.equal(stored[0].spentAt, null);
  });

  it("does not store the address in plaintext", () => {
    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: ADDRESS });
    const dumped = JSON.stringify(bindingsForTests(ADDRESS));
    assert.equal(dumped.includes(ADDRESS), false);
    assert.equal(dumped.includes("ada@"), false);
  });

  it("rate-limits sending per address, without changing the reply", async () => {
    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: ADDRESS });
    const first = await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE, now: 1_000 });
    const second = await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE, now: 1_000 + 60_000 });
    assert.deepEqual(first, { ok: true, body: { line: ROOM_ACCESS_SENT_LINE } });
    assert.deepEqual(second, { ok: true, body: { line: ROOM_ACCESS_SENT_LINE } });
    assert.equal(posted.length, 1, "the second send inside the cooldown must not post mail");

    const later = await sendRoomAccessLink({
      email: ADDRESS,
      publicBaseUrl: PUBLIC_BASE,
      now: 1_000 + SEND_COOLDOWN_MS,
    });
    assert.deepEqual(later, { ok: true, body: { line: ROOM_ACCESS_SENT_LINE } });
    assert.equal(posted.length, 2);
  });

  it("rate-limits sending per room, even when a second address is bound to it", async () => {
    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: ADDRESS });
    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: "other@example.test" });
    await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE, now: 1_000 });
    await sendRoomAccessLink({ email: "other@example.test", publicBaseUrl: PUBLIC_BASE, now: 2_000 });
    assert.equal(posted.length, 1, "the same room must not be a way to post a second mail inside the cooldown");
  });

  it("treats the same address in different case as one address", () => {
    assert.equal(parseEmail("Ada@Example.TEST"), "ada@example.test");
  });
});

describe("openRoomAccess", () => {
  async function mailedToken(): Promise<string> {
    bindRoomAddress({ workspaceId: WORKSPACE, workspaceToken: ROOM_TOKEN, email: ADDRESS });
    const result = await sendRoomAccessLink({ email: ADDRESS, publicBaseUrl: PUBLIC_BASE });
    assert.equal(result.ok, true);
    const match = posted[0]?.body.match(/\/api\/room-access\/([0-9A-Za-z]{32})/);
    assert.ok(match);
    return match[1];
  }

  it("opens the room once, then spends the token", async () => {
    const token = await mailedToken();
    assert.notEqual(token, ROOM_TOKEN);

    const first = openRoomAccess(token);
    assert.deepEqual(first, { ok: true, workspaceToken: ROOM_TOKEN });

    const second = openRoomAccess(token);
    assert.deepEqual(second, { ok: false, line: ROOM_ACCESS_SPENT_LINE });
  });

  it("refuses a token after an hour", async () => {
    const token = await mailedToken();
    const late = openRoomAccess(token, Date.now() + ROOM_ACCESS_TTL_MS + 1);
    assert.deepEqual(late, { ok: false, line: ROOM_ACCESS_SPENT_LINE });
  });

  it("refuses a guess, in the same words as a spent or expired link", () => {
    const unknown = openRoomAccess("a".repeat(32));
    assert.deepEqual(unknown, { ok: false, line: ROOM_ACCESS_SPENT_LINE });
  });

  it("will not accept the room's own address as an access token", async () => {
    await mailedToken();
    const asAccess = openRoomAccess(ROOM_TOKEN);
    assert.deepEqual(asAccess, { ok: false, line: ROOM_ACCESS_SPENT_LINE });
  });
});
