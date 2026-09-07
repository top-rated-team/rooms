/**
 * Room identity binding. Run it with:
 *
 *   npx tsx --test server/identity.test.ts
 *
 * The cases that have to stay true: an unbound room keeps the anonymous
 * allowance; a failed or abandoned identification writes nothing; the stored
 * row carries no token and no phone number; and a down WAHA host degrades to
 * LinkedIn with a sentence, never to a dead button.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ANONYMOUS_TURNS_PER_HOUR,
  LINKEDIN_UNCONFIGURED_LINE,
  SIGNED_IN_TURNS_PER_HOUR,
  WHATSAPP_CHAT_WARNING,
  acceptWhatsAppInbound,
  accessLevelFor,
  allowanceForWorkspace,
  bindingStateForWorkspace,
  completeLinkedIn,
  extractWhatsAppInbound,
  identifyActions,
  looksLikeOwnMaterial,
  resetIdentityForTests,
  startLinkedIn,
  startWhatsApp,
  storedBindingForTests,
  BIND_CODE_RE,
} from "./identity";
import { WAHA_UNAVAILABLE_LINE, probeWaha, qrSvg, waMeUrl } from "./waha";

const WORKSPACE = "ws_identity_test";
const TOKEN = "tokIdentityTestToken12";
const ROOM_URL = "https://example.test/w/tokIdentityTestToken12";

beforeEach(() => {
  resetIdentityForTests();
  process.env.LINKEDIN_CLIENT_ID = "linkedin-client-id-for-tests";
  process.env.LINKEDIN_CLIENT_SECRET = "linkedin-client-secret-for-tests";
  delete process.env.WAHA_WEBHOOK_SECRET;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("an unbound room", () => {
  it("keeps working at the anonymous allowance", () => {
    const allowance = allowanceForWorkspace(WORKSPACE);
    assert.equal(allowance.level, "anonymous");
    assert.equal(allowance.turnsPerHour, ANONYMOUS_TURNS_PER_HOUR);
    assert.equal(accessLevelFor(WORKSPACE), "anonymous");
    assert.ok(
      ANONYMOUS_TURNS_PER_HOUR < SIGNED_IN_TURNS_PER_HOUR,
      "signed in has to be more, or the second level is a name for nothing",
    );
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });

  it("is not asked to identify until they paste something of their own", async () => {
    const quiet = await bindingStateForWorkspace(WORKSPACE, ["How does the pixel work?"], async () => ({
      ok: true,
      digits: "15555550100",
    }));
    assert.equal(quiet.needsIdentify, false);
    assert.equal(quiet.bound, false);

    const own = await bindingStateForWorkspace(
      WORKSPACE,
      ["Please look at https://ads.example.com/account/123"],
      async () => ({ ok: true, digits: "15555550100" }),
    );
    assert.equal(own.needsIdentify, true);
    assert.equal(own.bound, false);
    assert.equal(own.level, "anonymous");
  });
});

describe("abandoned or failed identification", () => {
  it("leaves the room unbound if they never return from LinkedIn", () => {
    const start = startLinkedIn({
      workspaceId: WORKSPACE,
      token: TOKEN,
      publicBaseUrl: "https://example.test",
    });
    assert.equal(start.ok, true);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
    assert.equal(accessLevelFor(WORKSPACE), "anonymous");
  });

  it("leaves the room unbound if they deny LinkedIn's consent screen", async () => {
    const start = startLinkedIn({
      workspaceId: WORKSPACE,
      token: TOKEN,
      publicBaseUrl: "https://example.test",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const result = await completeLinkedIn({ state, error: "user_cancelled_login" });
    assert.equal(result.bound, false);
    assert.equal(result.token, TOKEN);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
    assert.equal(allowanceForWorkspace(WORKSPACE).level, "anonymous");
  });

  it("leaves the room unbound if LinkedIn's token exchange fails", async () => {
    const start = startLinkedIn({
      workspaceId: WORKSPACE,
      token: TOKEN,
      publicBaseUrl: "https://example.test",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const result = await completeLinkedIn({
      state,
      code: "not-a-real-code",
      fetchImpl: async () => jsonResponse(400, { error: "invalid_grant" }),
    });
    assert.equal(result.bound, false);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });

  it("leaves the room unbound rather than half-bound if userinfo has no name", async () => {
    const start = startLinkedIn({
      workspaceId: WORKSPACE,
      token: TOKEN,
      publicBaseUrl: "https://example.test",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = new URL(start.url).searchParams.get("state");
    assert.ok(state);

    const result = await completeLinkedIn({
      state,
      code: "ok-code",
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.includes("accessToken")) {
          return jsonResponse(200, { access_token: "should-not-be-stored", expires_in: 3600 });
        }
        return jsonResponse(200, { sub: "linkedin-member-sub" });
      },
    });
    assert.equal(result.bound, false);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });

  it("leaves the room unbound if they open WhatsApp and never send the message", async () => {
    const start = await startWhatsApp({
      workspaceId: WORKSPACE,
      token: TOKEN,
      roomUrl: ROOM_URL,
      probe: async () => ({ ok: true, digits: "15555550100" }),
    });
    assert.equal(start.ok, true);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
    assert.equal(accessLevelFor(WORKSPACE), "anonymous");
  });
});

describe("what may be stored", () => {
  it("keeps an opaque LinkedIn id and a display name, and no token", async () => {
    const start = startLinkedIn({
      workspaceId: WORKSPACE,
      token: TOKEN,
      publicBaseUrl: "https://example.test",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const auth = new URL(start.url);
    assert.equal(auth.origin + auth.pathname, "https://www.linkedin.com/oauth/v2/authorization");
    assert.equal(auth.searchParams.get("scope"), "openid profile");
    assert.equal(auth.searchParams.get("response_type"), "code");
    const state = auth.searchParams.get("state");
    assert.ok(state);

    let sawToken = false;
    const result = await completeLinkedIn({
      state,
      code: "ok-code",
      fetchImpl: async (url, init) => {
        const href = String(url);
        if (href.includes("accessToken")) {
          const body = String(init?.body ?? "");
          assert.match(body, /grant_type=authorization_code/);
          return jsonResponse(200, {
            access_token: "liau_should_never_be_kept",
            expires_in: 3600,
            refresh_token: "lirt_should_never_be_kept",
          });
        }
        sawToken = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "").includes(
          "liau_should_never_be_kept",
        );
        return jsonResponse(200, {
          sub: "782bbtaQ",
          name: "Ada Example",
          email: "ada@example.com",
        });
      },
    });
    assert.equal(result.bound, true);
    assert.equal(sawToken, true, "the token is used once to read userinfo, then dropped");

    const stored = storedBindingForTests(WORKSPACE);
    assert.ok(stored);
    assert.equal(stored.provider, "linkedin");
    assert.equal(stored.providerId, "linkedin:782bbtaQ");
    assert.equal(stored.displayName, "Ada Example");
    const dumped = JSON.stringify(stored);
    assert.equal(dumped.includes("liau_should_never_be_kept"), false);
    assert.equal(dumped.includes("lirt_should_never_be_kept"), false);
    assert.equal(dumped.includes("access_token"), false);
    assert.equal(dumped.includes("refresh_token"), false);
    assert.equal(dumped.includes("ada@example.com"), false);
    assert.equal("token" in stored, false);
    assert.equal("accessToken" in stored, false);
    assert.equal("phone" in stored, false);
    assert.equal("phoneNumber" in stored, false);
    assert.equal(allowanceForWorkspace(WORKSPACE).level, "signed-in");
    assert.equal(allowanceForWorkspace(WORKSPACE).turnsPerHour, SIGNED_IN_TURNS_PER_HOUR);
  });

  it("hashes a WhatsApp chat id and stores no phone number", async () => {
    const start = await startWhatsApp({
      workspaceId: WORKSPACE,
      token: TOKEN,
      roomUrl: ROOM_URL,
      probe: async () => ({ ok: true, digits: "15555550100" }),
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    assert.equal(start.offer.warning, WHATSAPP_CHAT_WARNING);
    assert.match(start.offer.url, /^https:\/\/wa\.me\/15555550100\?text=/);
    const text = decodeURIComponent(new URL(start.offer.url).searchParams.get("text") ?? "");
    // Read through the SAME pattern the webhook uses, imported rather than
    // retyped. This line used to carry its own copy of the regex, which is how
    // it came to disagree with the generator: nanoid's alphabet has `-` and `_`
    // in it, so two runs in five produced a code neither this nor the webhook
    // would match, and a room that silently never bound.
    const nonce = BIND_CODE_RE.exec(text)?.[1];
    assert.ok(nonce);
    assert.match(text, /tokIdentityTestToken12/, "the pre-filled message carries the room address");

    const inbound = acceptWhatsAppInbound(
      {
        event: "message",
        payload: {
          from: "15555550999@c.us",
          pushName: "Ada Example",
          body: text,
        },
      },
      undefined,
    );
    assert.equal(inbound.accepted, true);
    if (!inbound.accepted) return;
    assert.equal(inbound.bound, true);

    const stored = storedBindingForTests(WORKSPACE);
    assert.ok(stored);
    assert.equal(stored.provider, "whatsapp");
    assert.equal(stored.displayName, "Ada Example");
    assert.match(stored.providerId, /^whatsapp:[0-9a-f]{64}$/);
    const dumped = JSON.stringify(stored);
    assert.equal(dumped.includes("15555550999"), false);
    assert.equal(dumped.includes("@c.us"), false);
    assert.equal(dumped.includes("phone"), false);
    assert.equal("phone" in stored, false);
    assert.equal("phoneNumber" in stored, false);
    assert.equal("token" in stored, false);
  });

  it("does not bind a WhatsApp inbound that has a code but no display name", async () => {
    const start = await startWhatsApp({
      workspaceId: WORKSPACE,
      token: TOKEN,
      roomUrl: ROOM_URL,
      probe: async () => ({ ok: true, digits: "15555550100" }),
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const text = decodeURIComponent(new URL(start.offer.url).searchParams.get("text") ?? "");

    const inbound = acceptWhatsAppInbound(
      { payload: { from: "15555550999@c.us", pushName: "", body: text } },
      undefined,
    );
    assert.equal(inbound.accepted, true);
    if (!inbound.accepted) return;
    assert.equal(inbound.bound, false);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });
});

describe("a down WAHA host", () => {
  it("degrades to the LinkedIn route with a sentence, never a dead button", async () => {
    const state = await bindingStateForWorkspace(
      WORKSPACE,
      ["See https://ads.example.com/account/123"],
      async () => ({ ok: false, line: WAHA_UNAVAILABLE_LINE }),
    );
    assert.equal(state.needsIdentify, true);
    const actions = identifyActions(state);
    assert.equal(actions.linkedin, true, "LinkedIn must still be offered");
    assert.equal(actions.whatsapp, false);
    assert.equal(actions.whatsappUnavailableLine, WAHA_UNAVAILABLE_LINE);

    const start = await startWhatsApp({
      workspaceId: WORKSPACE,
      token: TOKEN,
      roomUrl: ROOM_URL,
      probe: async () => ({ ok: false, line: WAHA_UNAVAILABLE_LINE }),
    });
    assert.equal(start.ok, false);
    if (start.ok) return;
    assert.equal(start.line, WAHA_UNAVAILABLE_LINE);
    assert.equal(storedBindingForTests(WORKSPACE), undefined);
  });

  it("does not offer a LinkedIn button that cannot work when LinkedIn is unconfigured", async () => {
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
    const state = await bindingStateForWorkspace(WORKSPACE, ["https://ads.example.com/x"], async () => ({
      ok: true,
      digits: "15555550100",
    }));
    const actions = identifyActions(state);
    assert.equal(actions.linkedin, false);
    assert.equal(actions.whatsapp, true);
    assert.equal(state.linkedin.unavailableLine, LINKEDIN_UNCONFIGURED_LINE);
  });
});

describe("own-material detection", () => {
  it("treats a pasted URL as theirs and a short question as not", () => {
    assert.equal(looksLikeOwnMaterial("How does the pixel work?"), false);
    assert.equal(looksLikeOwnMaterial("Look at https://shop.example.com/checkout"), true);
    assert.equal(looksLikeOwnMaterial("a".repeat(200)), true);
  });
});

describe("inbound extraction", () => {
  it("keeps only chat id, push name and body from a WAHA payload", () => {
    const fields = extractWhatsAppInbound({
      event: "message",
      payload: {
        from: "15555550999@c.us",
        pushName: "Ada",
        body: "hello",
        fromMe: false,
        _data: { notifyName: "Ada", id: { remote: "15555550999@c.us" } },
      },
    });
    assert.deepEqual(fields, { chatId: "15555550999@c.us", pushName: "Ada", body: "hello" });
  });
});

describe("WAHA helpers", () => {
  it("treats a down host as unavailable without throwing", async () => {
    process.env.WAHA_BASE_URL = "https://waha.example.test";
    const probe = await probeWaha(async () => {
      throw new Error("ECONNREFUSED");
    });
    assert.equal(probe.ok, false);
    if (probe.ok) return;
    assert.equal(probe.line, WAHA_UNAVAILABLE_LINE);
  });

  it("builds a click-to-chat URL and a QR of it", () => {
    const url = waMeUrl("15555550100", "hello");
    assert.equal(url, "https://wa.me/15555550100?text=hello");
    const svg = qrSvg(url);
    assert.ok(svg && svg.startsWith("<svg "), "the QR has to be real SVG, not a third-party image");
    assert.match(svg, /<rect /);
    assert.equal(svg.includes("15555550100"), false, "the number is in the modules, not as text in the markup");
  });
});
