/**
 * Click-to-chat probe and QR. Run it with:
 *
 *   npx tsx --test server/waha.test.ts
 *
 * Our own number is asked of the WhatsApp interface. This file checks the
 * wa.me URL, the digit helper, the account-body digit helper, and that a QR
 * of a short link comes back as SVG.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  WAHA_DISCONNECTED_LINE,
  WAHA_UNCONFIGURED_LINE,
  digitsFromAccountBody,
  digitsFromMeId,
  probeWaha,
  qrSvg,
  waMeUrl,
} from "./waha";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  delete process.env.WAHA_BASE_URL;
  delete process.env.WAHA_API_KEY;
  delete process.env.WAHA_SESSION;
  delete process.env.HOSTED_WHATSAPP_BASE_URL;
  delete process.env.HOSTED_WHATSAPP_API_KEY;
  delete process.env.HOSTED_WHATSAPP_ACCOUNT_ID;
});

afterEach(() => {
  delete process.env.WAHA_BASE_URL;
  delete process.env.WAHA_API_KEY;
  delete process.env.WAHA_SESSION;
  delete process.env.HOSTED_WHATSAPP_BASE_URL;
  delete process.env.HOSTED_WHATSAPP_API_KEY;
  delete process.env.HOSTED_WHATSAPP_ACCOUNT_ID;
});

describe("waMeUrl", () => {
  it("strips non-digits and puts the text in the query", () => {
    assert.equal(
      waMeUrl("+420 774 654 822", "Room-bind ABCDEFGHJKLN"),
      "https://wa.me/420774654822?text=Room-bind%20ABCDEFGHJKLN",
    );
  });
});

describe("digitsFromMeId", () => {
  it("keeps only a phone-bearing id, and refuses a LID or a short fragment", () => {
    assert.equal(digitsFromMeId("420774654822@c.us"), "420774654822");
    assert.equal(digitsFromMeId("420774654822"), "420774654822");
    assert.equal(digitsFromMeId("123@lid"), null);
    assert.equal(digitsFromMeId("12345"), null);
  });
});

describe("digitsFromAccountBody", () => {
  it("reads connection_params.im.phone_number and drops the rest", () => {
    assert.equal(
      digitsFromAccountBody({
        id: "acct_1",
        connection_params: { im: { phone_number: "+420774654822" } },
        sources: [{ status: "OK" }],
      }),
      "420774654822",
    );
    assert.equal(digitsFromAccountBody({ id: "123@lid" }), null);
    assert.equal(digitsFromAccountBody(null), null);
  });
});

describe("probeWaha", () => {
  it("says unconfigured when no transport is set, without calling fetch", async () => {
    let called = false;
    const probe = await probeWaha(async () => {
      called = true;
      return jsonResponse(500, {});
    });
    assert.equal(called, false);
    assert.deepEqual(probe, { ok: false, line: WAHA_UNCONFIGURED_LINE });
  });

  it("asks WAHA for the session and returns digits when WORKING", async () => {
    process.env.WAHA_BASE_URL = "https://waha.test.example";
    process.env.WAHA_SESSION = "default";
    const urls: string[] = [];
    const probe = await probeWaha(async (input) => {
      urls.push(String(input));
      return jsonResponse(200, {
        status: "WORKING",
        me: { id: "420774654822@c.us" },
      });
    });
    assert.deepEqual(probe, { ok: true, digits: "420774654822" });
    assert.equal(urls[0], "https://waha.test.example/api/sessions/default");
  });

  it("treats a missing session as disconnected", async () => {
    process.env.WAHA_BASE_URL = "https://waha.test.example";
    const probe = await probeWaha(async () => jsonResponse(404, {}));
    assert.deepEqual(probe, { ok: false, line: WAHA_DISCONNECTED_LINE });
  });
});

describe("qrSvg", () => {
  it("returns an SVG for a short wa.me link, with currentColor modules", () => {
    const svg = qrSvg("https://wa.me/420774654822?text=hi");
    assert.ok(svg);
    assert.match(svg!, /^<svg /);
    assert.match(svg!, /fill="currentColor"/);
  });
});
