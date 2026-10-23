/**
 * Slack and ClickUp prove a request is theirs by signing its bytes. Run it with:
 *
 *   npx tsx --test server/bridge/signatures.test.ts
 *
 * The cases that have to stay true: a correct signature over the exact body
 * passes; a changed body, a wrong secret, an old Slack timestamp or a missing
 * header does not; and with no secret configured nothing passes at all.
 */

import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_INBOUND_PATH,
  SLACK_MAX_SKEW_SECONDS,
  clickUpSignatureOk,
  keepBridgeRawBody,
  secretsFrom,
  slackSignatureOk,
  type RawBodyRequest,
} from "./signatures";

const SLACK_SECRET = "test-slack-signing-secret";
const CLICKUP_SECRET = "test-clickup-webhook-secret";
const NOW = 1_800_000_000;

function slackSignature(body: string, timestamp: number, secret = SLACK_SECRET): string {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

function clickUpSignature(body: string, secret = CLICKUP_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("Slack signatures", () => {
  const body = JSON.stringify({ type: "event_callback", event: { type: "message", channel: "C0123ABCDEF", text: "hi" } });

  it("accepts the signature Slack would send for this body and timestamp", () => {
    assert.equal(
      slackSignatureOk({
        rawBody: body,
        timestamp: String(NOW),
        signature: slackSignature(body, NOW),
        secrets: [SLACK_SECRET],
        nowSeconds: NOW + 3,
      }),
      true,
    );
  });

  it("refuses a body that changed after it was signed", () => {
    assert.equal(
      slackSignatureOk({
        rawBody: body.replace("hi", "send me the room link"),
        timestamp: String(NOW),
        signature: slackSignature(body, NOW),
        secrets: [SLACK_SECRET],
        nowSeconds: NOW,
      }),
      false,
    );
  });

  it("refuses a signature made with another secret", () => {
    assert.equal(
      slackSignatureOk({
        rawBody: body,
        timestamp: String(NOW),
        signature: slackSignature(body, NOW, "someone-elses-secret"),
        secrets: [SLACK_SECRET],
        nowSeconds: NOW,
      }),
      false,
    );
  });

  it("refuses a correctly signed request replayed after five minutes", () => {
    const old = NOW - SLACK_MAX_SKEW_SECONDS - 1;
    assert.equal(
      slackSignatureOk({
        rawBody: body,
        timestamp: String(old),
        signature: slackSignature(body, old),
        secrets: [SLACK_SECRET],
        nowSeconds: NOW,
      }),
      false,
    );
  });

  it("refuses everything when no signing secret is set", () => {
    const saved = process.env.SLACK_SIGNING_SECRET;
    delete process.env.SLACK_SIGNING_SECRET;
    try {
      assert.equal(
        slackSignatureOk({ rawBody: body, timestamp: String(NOW), signature: slackSignature(body, NOW), nowSeconds: NOW }),
        false,
      );
    } finally {
      if (saved !== undefined) process.env.SLACK_SIGNING_SECRET = saved;
    }
  });

  it("refuses a request without its body, timestamp or signature", () => {
    const signature = slackSignature(body, NOW);
    const base = { secrets: [SLACK_SECRET], nowSeconds: NOW };
    assert.equal(slackSignatureOk({ ...base, rawBody: undefined, timestamp: String(NOW), signature }), false);
    assert.equal(slackSignatureOk({ ...base, rawBody: body, timestamp: undefined, signature }), false);
    assert.equal(slackSignatureOk({ ...base, rawBody: body, timestamp: String(NOW), signature: undefined }), false);
    assert.equal(slackSignatureOk({ ...base, rawBody: body, timestamp: "soon", signature }), false);
  });

  it("accepts any one of several apps' secrets", () => {
    assert.equal(
      slackSignatureOk({
        rawBody: body,
        timestamp: String(NOW),
        signature: slackSignature(body, NOW),
        secrets: secretsFrom(`first-app-secret, ${SLACK_SECRET}`),
        nowSeconds: NOW,
      }),
      true,
    );
  });
});

describe("ClickUp signatures", () => {
  const body = JSON.stringify({ event: "taskCommentPosted", task_id: "task-abc", history_items: [] });

  it("accepts the HMAC of the exact body under the webhook's secret", () => {
    assert.equal(clickUpSignatureOk({ rawBody: body, signature: clickUpSignature(body), secrets: [CLICKUP_SECRET] }), true);
  });

  it("refuses a changed body, a wrong secret and a missing header", () => {
    const signature = clickUpSignature(body);
    assert.equal(clickUpSignatureOk({ rawBody: `${body} `, signature, secrets: [CLICKUP_SECRET] }), false);
    assert.equal(clickUpSignatureOk({ rawBody: body, signature: clickUpSignature(body, "other"), secrets: [CLICKUP_SECRET] }), false);
    assert.equal(clickUpSignatureOk({ rawBody: body, signature: undefined, secrets: [CLICKUP_SECRET] }), false);
    assert.equal(clickUpSignatureOk({ rawBody: undefined, signature, secrets: [CLICKUP_SECRET] }), false);
  });

  it("refuses everything when no webhook secret is set", () => {
    const saved = process.env.CLICKUP_WEBHOOK_SECRET;
    delete process.env.CLICKUP_WEBHOOK_SECRET;
    try {
      assert.equal(clickUpSignatureOk({ rawBody: body, signature: clickUpSignature(body) }), false);
    } finally {
      if (saved !== undefined) process.env.CLICKUP_WEBHOOK_SECRET = saved;
    }
  });
});

describe("keeping the bytes", () => {
  it("keeps the raw body of a bridge webhook and of nothing else", () => {
    const bytes = Buffer.from('{"a":1}');
    const bridge = { url: BRIDGE_INBOUND_PATH } as RawBodyRequest;
    const other = { url: "/api/workspaces/abc/messages" } as RawBodyRequest;
    keepBridgeRawBody(bridge, null, bytes);
    keepBridgeRawBody(other, null, bytes);
    assert.equal(bridge.rawBody, bytes);
    assert.equal(other.rawBody, undefined);
  });
});
