/**
 * Unipile webhook lifecycle. Run it with:
 *
 *   npx tsx --test server/unipile/webhooks.test.ts
 *
 * Two webhooks, never a third. Created only when absent. Retired hosts are
 * deleted. Content-Type and the shared secret header are both set, because
 * either missing fails silently.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  WEBHOOK_SOURCE_ACCOUNT_STATUS,
  WEBHOOK_SOURCE_MESSAGING,
  UNIPILE_WEBHOOK_AUTH_HEADER,
  ensureUnipileWebhooks,
  inboundRequestUrl,
  parseWebhook,
} from "./webhooks";

const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const SECRET = "test-unipile-webhook-secret";
const BASE = "https://top-rated.team";
const CURRENT = `${BASE}/api/unipile/inbound`;
const RETIRED = "https://ai.top-rated.team/api/unipile/inbound";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setConfigured(): void {
  process.env.UNIPILE_DSN = DSN;
  process.env.UNIPILE_API_KEY = KEY;
  process.env.UNIPILE_WEBHOOK_SECRET = SECRET;
  process.env.PUBLIC_BASE_URL = BASE;
}

beforeEach(() => {
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_WEBHOOK_SECRET;
  delete process.env.PUBLIC_BASE_URL;
});

afterEach(() => {
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_WEBHOOK_SECRET;
  delete process.env.PUBLIC_BASE_URL;
});

describe("inboundRequestUrl", () => {
  it("is computed from PUBLIC_BASE_URL, which is why the owner sets no webhook URL", () => {
    assert.equal(inboundRequestUrl(), null);
    process.env.PUBLIC_BASE_URL = `${BASE}/`;
    assert.equal(inboundRequestUrl(), CURRENT);
  });
});

describe("parseWebhook", () => {
  it("reads source account_status from the create-webhook enum, not a guess", () => {
    const parsed = parseWebhook({
      object: "Webhook",
      id: "wh_status",
      request_url: CURRENT,
      source: "account_status",
      name: "top-rated-team-account-status",
    });
    assert.equal(parsed?.source, WEBHOOK_SOURCE_ACCOUNT_STATUS);
    assert.equal(parsed?.source, "account_status");
  });
});

describe("ensureUnipileWebhooks", () => {
  it("is inert when Unipile env is missing, and does not call fetch", async () => {
    let called = 0;
    const fetchImpl: typeof fetch = async () => {
      called += 1;
      return jsonResponse(200, { items: [] });
    };
    const result = await ensureUnipileWebhooks(fetchImpl);
    assert.deepEqual(result, { ok: true, skipped: "unconfigured" });
    assert.equal(called, 0);
  });

  it("is inert when the secret or PUBLIC_BASE_URL is missing", async () => {
    process.env.UNIPILE_DSN = DSN;
    process.env.UNIPILE_API_KEY = KEY;
    let called = 0;
    const fetchImpl: typeof fetch = async () => {
      called += 1;
      return jsonResponse(200, { items: [] });
    };
    assert.deepEqual(await ensureUnipileWebhooks(fetchImpl), { ok: true, skipped: "no-address-or-secret" });
    process.env.PUBLIC_BASE_URL = BASE;
    assert.deepEqual(await ensureUnipileWebhooks(fetchImpl), { ok: true, skipped: "no-address-or-secret" });
    assert.equal(called, 0);
  });

  it("creates both sources when absent, with Content-Type and Unipile-Auth, and never a calendar source", async () => {
    setConfigured();
    const created: unknown[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/webhooks")) {
        return jsonResponse(200, { object: "WebhookList", items: [] });
      }
      if (method === "POST" && url.endsWith("/webhooks")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        created.push(body);
        return jsonResponse(201, {
          object: "Webhook",
          id: `wh_${created.length}`,
          request_url: body.request_url,
          source: body.source,
          name: body.name,
        });
      }
      return jsonResponse(500, { type: "errors/unexpected_error", status: 500 });
    };

    const result = await ensureUnipileWebhooks(fetchImpl);
    assert.equal(result.ok, true);
    assert.equal(created.length, 2);
    const sources = created.map((row) => (row as { source: string }).source);
    assert.deepEqual(sources, [WEBHOOK_SOURCE_MESSAGING, WEBHOOK_SOURCE_ACCOUNT_STATUS]);
    assert.equal(sources.includes("calendar"), false);
    for (const row of created) {
      const body = row as {
        request_url: string;
        headers: { key: string; value: string }[];
        format: string;
      };
      assert.equal(body.request_url, CURRENT);
      assert.equal(body.format, "json");
      assert.deepEqual(
        body.headers.find((header) => header.key === "Content-Type"),
        { key: "Content-Type", value: "application/json" },
      );
      assert.deepEqual(
        body.headers.find((header) => header.key === UNIPILE_WEBHOOK_AUTH_HEADER),
        { key: UNIPILE_WEBHOOK_AUTH_HEADER, value: SECRET },
      );
    }
  });

  it("does not create a second webhook when ours already exist by request_url and source", async () => {
    setConfigured();
    let posts = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        posts += 1;
        return jsonResponse(201, {});
      }
      return jsonResponse(200, {
        object: "WebhookList",
        items: [
          { id: "wh_msg", request_url: CURRENT, source: "messaging" },
          { id: "wh_acc", request_url: CURRENT, source: "account_status" },
        ],
      });
    };
    const result = await ensureUnipileWebhooks(fetchImpl);
    assert.equal(result.ok, true);
    assert.equal(posts, 0);
  });

  it("deletes a webhook pointing at a retired host, and extra copies of the same source", async () => {
    setConfigured();
    const deleted: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return jsonResponse(200, {
          items: [
            { id: "wh_old", request_url: RETIRED, source: "messaging" },
            { id: "wh_msg_a", request_url: CURRENT, source: "messaging" },
            { id: "wh_msg_b", request_url: CURRENT, source: "messaging" },
            { id: "wh_acc", request_url: CURRENT, source: "account_status" },
          ],
        });
      }
      if (method === "DELETE") {
        deleted.push(url.slice(url.lastIndexOf("/") + 1));
        return jsonResponse(200, {});
      }
      if (method === "POST") {
        return jsonResponse(500, { title: "must not create", status: 500 });
      }
      return jsonResponse(500, {});
    };

    const result = await ensureUnipileWebhooks(fetchImpl);
    assert.equal(result.ok, true);
    assert.deepEqual(deleted.sort(), ["wh_msg_b", "wh_old"].sort());
  });
});
