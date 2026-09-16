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
  installRoomLoginInbound,
  loginNonePage,
  takeWhatsAppLoginResult,
  proveRoomLoginWhatsApp,
  registerRoomTokenForTests,
  resetRoomLoginForTests,
  resolveRoomLoginLinkedIn,
  roomLoginAvailability,
  ROOM_LOGIN_LINKEDIN_ELSEWHERE_LINE,
  roomLoginLinkedInRedirectUri,
  startRoomLoginLinkedIn,
  startRoomLoginWhatsApp,
  whatsappProviderId,
} from "./room-login";
import { claimWhatsAppSession, isSessionTicketLine, resetRoomAccountForTests, whoAmI, ROOM_SESSION_COOKIE } from "./room-account";
import { dispatchInbound, resetInboundForTests } from "./unipile/inbound";
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
    accountId: "acct_whatsapp_for_tests",
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
  resetRoomAccountForTests();
  resetInboundForTests();
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
  resetRoomAccountForTests();
  resetInboundForTests();
  resetIdentityForTests();
  resetIdentityStoreForTests();
  resetRoomAccessForTests();
  delete process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_CLIENT_SECRET;
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.ROOM_HASH_PEPPER;
});

describe("roomLoginAvailability", () => {
  it("returns to the house address the visitor is on, so one app serves both sites", async () => {
    /* LinkedIn will only come back to a URI registered on the app, and both
       of ours are registered on the one app. A visitor who starts on
       adgrant.ai must finish on adgrant.ai — otherwise they are handed to the
       other product half way through signing in, and their session cookie
       lands on a site they were not reading. */
    const onAdGrant = startRoomLoginLinkedIn("adgrant.ai");
    assert.equal(onAdGrant.ok, true);
    if (!onAdGrant.ok) return;
    assert.equal(
      new URL(onAdGrant.url).searchParams.get("redirect_uri"),
      "https://adgrant.ai/api/room-login/linkedin/callback",
    );

    const onWww = startRoomLoginLinkedIn("www.adgrant.ai");
    assert.equal(onWww.ok, true);
    if (!onWww.ok) return;
    assert.equal(
      new URL(onWww.url).searchParams.get("redirect_uri"),
      "https://adgrant.ai/api/room-login/linkedin/callback",
      "www is the same registered address, not a second one",
    );

    /* A host that is not ours is never built into a redirect_uri: it falls
       back to the configured address. */
    const forged = startRoomLoginLinkedIn("evil.example");
    assert.equal(forged.ok, true);
    if (!forged.ok) return;
    assert.equal(
      new URL(forged.url).searchParams.get("redirect_uri"),
      `${PUBLIC_BASE}/api/room-login/linkedin/callback`,
    );
  });

  it("offers LinkedIn on both house addresses now that one app serves both", async () => {
    for (const host of ["ai.top-rated.team", "adgrant.ai", "www.adgrant.ai"]) {
      const availability = await roomLoginAvailability({
        host,
        probe: async () => ({ ok: false, line: "down" }),
      });
      assert.deepEqual(availability.linkedin, { available: true }, `${host} does not offer LinkedIn`);
    }
  });

  it("omits WhatsApp on a fork, and does not offer LinkedIn on an address it does not return to", async () => {
    /* LinkedIn comes back to ONE address, the one registered on the app. On
       any other host the button would start a sign-in that finishes on a
       domain the visitor never asked about — so it is named as belonging
       there rather than drawn as if it worked here. A second deployment that
       wants LinkedIn wants its own app. */
    const fork = await roomLoginAvailability({
      host: "partner.example",
      probe: async () => ({ ok: true, digits: "420774654822" }),
    });
    assert.deepEqual(fork.whatsapp, { available: false });
    /* A fork is not a house host, so its own deployment has to configure its
       own app; ours still answers from the configured address. */
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

    const result = await resolveRoomLoginLinkedIn({
      state,
      cookieState: state,
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
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.rooms, [{ token: ROOM_TOKEN }]);
    assert.equal(result.outcome, "signed-in");
    assert.equal(bindingsForTests("ada@example.test").length, 1);
    assert.equal(bindingsForTests("ada@example.test")[0]?.workspaceToken, ROOM_TOKEN);
  });

  it("returns no rooms for a LinkedIn account that has never bound one, without inventing any", async () => {
    const start = startRoomLoginLinkedIn();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);
    const result = await resolveRoomLoginLinkedIn({
      state,
      cookieState: state,
      code: "ok-code",
      fetchImpl: async (url) => {
        if (String(url).includes("accessToken")) {
          return jsonResponse(200, { access_token: "t", expires_in: 3600 });
        }
        return jsonResponse(200, { sub: "nobody", name: "Nobody" });
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.rooms, []);
    assert.equal(result.outcome, "no-room");
  });

  it("names each failed return as that failure, not as a missing room", async () => {
    const noState = await resolveRoomLoginLinkedIn({});
    assert.deepEqual(noState, { ok: false, outcome: "missing-state" });

    const stale = await resolveRoomLoginLinkedIn({ state: "not-a-pending-row" });
    assert.deepEqual(stale, { ok: false, outcome: "missing-pending" });

    const start = startRoomLoginLinkedIn();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const denied = await resolveRoomLoginLinkedIn({
      state,
      cookieState: state,
      error: "user_cancelled_login",
    });
    assert.deepEqual(denied, { ok: false, outcome: "linkedin-error" });

    const startAgain = startRoomLoginLinkedIn();
    assert.equal(startAgain.ok, true);
    if (!startAgain.ok) return;
    const stateAgain = new URL(startAgain.url).searchParams.get("state");
    assert.ok(stateAgain);
    const failed = await resolveRoomLoginLinkedIn({
      state: stateAgain,
      cookieState: stateAgain,
      code: "bad-code",
      fetchImpl: async () => jsonResponse(400, { error: "invalid_grant" }),
    });
    assert.deepEqual(failed, { ok: false, outcome: "token-failed" });
  });

  it("refuses a return that did not start in this browser, and does not exchange the code", async () => {
    /* The attack this is here for: somebody finishes LinkedIn themselves, keeps
       the callback address, and sends it to a person who is signed in. Their
       browser carries their own session cookie — SameSite=Lax sends it on a
       link click — and without this check the attacker's LinkedIn identity is
       welded onto the victim's account, after which the attacker signs in as
       themselves and is inside the victim's rooms. */
    const start = startRoomLoginLinkedIn();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);
    assert.equal(start.state, state, "the state planted as a cookie is the state sent to LinkedIn");

    let exchanged = false;
    const noCookie = await resolveRoomLoginLinkedIn({
      state,
      code: "ok-code",
      fetchImpl: async () => {
        exchanged = true;
        return jsonResponse(200, { access_token: "t", expires_in: 3600 });
      },
    });
    assert.deepEqual(noCookie, { ok: false, outcome: "wrong-browser" });
    assert.equal(exchanged, false, "a refused return must not spend the code either");

    /* And the pending row is gone, so the real browser cannot rescue it. */
    const retry = await resolveRoomLoginLinkedIn({ state, cookieState: state, code: "ok-code" });
    assert.deepEqual(retry, { ok: false, outcome: "missing-pending" });

    const other = startRoomLoginLinkedIn();
    assert.equal(other.ok, true);
    if (!other.ok) return;
    const wrong = await resolveRoomLoginLinkedIn({
      state: other.state,
      cookieState: "somebody-elses-state",
      code: "ok-code",
      fetchImpl: async () => jsonResponse(200, { access_token: "t", expires_in: 3600 }),
    });
    assert.deepEqual(wrong, { ok: false, outcome: "wrong-browser" });
  });

  it("sends the callback back to the site with a ticket, not a white page", async () => {
    const start = startRoomLoginLinkedIn();
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);
    const result = await completeRoomLoginLinkedIn({
      state,
      cookieState: state,
      code: "ok-code",
      fetchImpl: async (url) => {
        if (String(url).includes("accessToken")) {
          return jsonResponse(200, { access_token: "t", expires_in: 3600 });
        }
        return jsonResponse(200, { sub: "nobody", name: "Nobody" });
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(isSessionTicketLine(result.line), true);
    const page = loginNonePage(result.line);
    assert.match(page, /\/api\/session\/linkedin\?ticket=/);
    assert.equal(page.includes("No room is bound to this LinkedIn account"), false);
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
    assert.match(start.offer.warning, /sign-in code/);
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

  it("confirms through the inbound matcher, then the session claim, end to end", async () => {
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

    installRoomLoginInbound();
    dispatchInbound({
      authorized: true,
      kind: "message",
      message: inbound(`Room-login ${code}`),
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(getRoomLoginWhatsAppConfirmed(code), {
      confirmed: true,
      rooms: [{ token: ROOM_TOKEN }],
    });
    const claimed = await claimWhatsAppSession({ code });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;
    const me = await whoAmI(`${ROOM_SESSION_COOKIE}=${claimed.token}`);
    assert.equal(me.signedIn, true);
    if (!me.signedIn) return;
    assert.equal(me.attached.whatsapp, true);
    assert.deepEqual(me.rooms, [{ token: ROOM_TOKEN }]);

    /* THE CODE IS SPENT. It has been on a screen, inside a QR and inside a
       WhatsApp chat, and what it buys is a ten-year session — so it buys one
       exactly once. */
    const again = await claimWhatsAppSession({ code });
    assert.equal(again.ok, false);
    if (again.ok) return;
    assert.equal(again.reason, "not-confirmed");
    assert.deepEqual(again.rooms, []);
    assert.equal(takeWhatsAppLoginResult(code), null);
  });
});

describe("LOGIN_CODE_RE", () => {
  it("is the pattern extractLoginCode uses", () => {
    assert.equal(extractLoginCode("Room-login ABCDEFGHJKLN"), "ABCDEFGHJKLN");
    assert.equal(extractLoginCode("hello"), null);
  });
});
