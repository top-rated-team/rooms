/**
 * The one thing this week has to be true of: a request for a human is not lost
 * when delivery fails. Run it with:
 *
 *   npx tsx --test server/notify.test.ts
 *
 * Both tests read the ledger file straight off the disk rather than through
 * `leadInbox()`, because `leadInbox()` also merges this process's memory and
 * would pass even if nothing had been written.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deliverLeadRequest, leadInbox, ledgerPath, recordLeadRequest, wasDelivered } from "./notify";

// A ledger of its own, so a test run never touches the real one.
process.env.LEAD_LOG_DIR = mkdtempSync(join(tmpdir(), "lead-ledger-"));

function ledgerText(): string {
  try {
    return readFileSync(ledgerPath(), "utf8");
  } catch {
    return "";
  }
}

test("a request survives a webhook that throws", async () => {
  process.env.LEAD_WEBHOOK_URL = "https://webhook.invalid/hook";
  delete process.env.RESEND_API_KEY;

  const realFetch = globalThis.fetch;
  let onDiskBeforeDelivery = false;

  globalThis.fetch = ((): never => {
    // The assertion that matters: by the time anything is attempted, the
    // request is already a line in the file.
    onDiskBeforeDelivery = ledgerText().includes("Purchases counted twice");
    throw new Error("socket hang up");
  }) as unknown as typeof fetch;

  let id: string;
  try {
    const request = recordLeadRequest({
      intent: "conversion-tracking",
      name: "A buyer",
      email: "buyer@example.com",
      message: "Purchases counted twice on Shopify.",
      source: { door: "chatgpt-ads", landing: "/" },
    });
    id = request.id;

    // Must resolve, not reject: a dead webhook is not the visitor's problem.
    await deliverLeadRequest(request);
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(onDiskBeforeDelivery, true, "the request must be on disk before delivery is attempted");

  const text = ledgerText();
  assert.ok(text.includes(id), "the request must still be in the ledger after the webhook threw");
  assert.match(text, /"channel":"webhook","ok":false/, "the failure must be recorded, not swallowed");
  assert.ok(text.includes("socket hang up"), "the reason the webhook failed must be recorded");

  const entry = leadInbox().find((row) => row.request.id === id);
  assert.ok(entry, "the request must be listed in the inbox");
  assert.equal(wasDelivered(entry), false, "the inbox must say it reached nobody");
  assert.equal(entry.request.doorId, "chatgpt-ads");
  assert.equal(entry.request.legalName, "Top-Rated Team s.r.o.", "the door decides which company the request belongs to");
  assert.equal(entry.request.message, "Purchases counted twice on Shopify.");
});

test("the room address is kept for the inbox and never sent to the webhook", async () => {
  process.env.LEAD_WEBHOOK_URL = "https://webhook.invalid/hook";
  delete process.env.RESEND_API_KEY;

  const token = "abc123abc123abc123abcd";
  const realFetch = globalThis.fetch;
  let posted = "";

  globalThis.fetch = ((_url: string, init?: { body?: string }) => {
    posted = init?.body ?? "";
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;

  let id: string;
  try {
    const request = recordLeadRequest({
      workspaceId: "ws_1",
      workspaceName: "Shopify tracking",
      roomUrl: `https://ai.top-rated.team/w/${token}`,
      intent: "expert-request",
      message: "Asked for Ihor B. in the workspace.",
      source: { door: "chatgpt-ads" },
    });
    id = request.id;
    await deliverLeadRequest(request);
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.ok(posted.length > 0, "the webhook must have been called");
  assert.ok(!posted.includes(token), "the workspace token is a credential and must not leave in a webhook");
  assert.ok(posted.includes("ws_1"), "the workspace id is enough to find the room from our side");

  const entry = leadInbox().find((row) => row.request.id === id);
  assert.ok(entry, "the request must be listed in the inbox");
  assert.equal(entry.request.roomUrl, `https://ai.top-rated.team/w/${token}`, "the owner must be able to open the room");
  assert.equal(wasDelivered(entry), true);
});
