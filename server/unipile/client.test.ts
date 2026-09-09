/**
 * Unipile HTTP client. Run it with:
 *
 *   npx tsx --test server/unipile/client.test.ts
 *
 * The cases that have to stay true: the DSN comes from the environment, the
 * key is one header with no Bearer prefix, retries are 503 and 504 only, a
 * 401 is an operator alert, nothing under client/ imports this directory, and
 * the suite never opens a socket.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  available,
  unavailableLine,
  unipileRequest,
  UNIPILE_UNCONFIGURED_LINE,
} from "./client";
import {
  calendarAccountId,
  getAccount,
  listAccounts,
  ourAccounts,
  parseAccount,
  whatsappAccountId,
  DEFAULT_CALENDAR_ACCOUNT_ID,
  DEFAULT_WHATSAPP_ACCOUNT_ID,
} from "./accounts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const CALENDAR_ID = "cal_account_for_tests";
const WHATSAPP_ID = "wa_account_for_tests";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setConfigured(): void {
  process.env.UNIPILE_DSN = DSN;
  process.env.UNIPILE_API_KEY = KEY;
}

beforeEach(() => {
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
});

afterEach(() => {
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
});

describe("available and unavailableLine", () => {
  it("reads env at call time, not at import", () => {
    assert.equal(available(), false);
    assert.equal(unavailableLine(), UNIPILE_UNCONFIGURED_LINE);
    setConfigured();
    assert.equal(available(), true);
  });

  it("is false when only one of the two vars is set", () => {
    process.env.UNIPILE_DSN = DSN;
    assert.equal(available(), false);
    delete process.env.UNIPILE_DSN;
    process.env.UNIPILE_API_KEY = KEY;
    assert.equal(available(), false);
  });
});

describe("unipileRequest", () => {
  it("builds https://{DSN}/api/v1/... and sends X-API-KEY with no Bearer prefix", async () => {
    setConfigured();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return jsonResponse(200, { object: "AccountList", items: [] });
    };

    const result = await unipileRequest({ path: "/accounts" }, fetchImpl);
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://${DSN}/api/v1/accounts`);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["X-API-KEY"], KEY);
    assert.equal(headers.Authorization, undefined);
    assert.equal(headers.accept, "application/json");
    const blob = JSON.stringify(calls[0].init);
    assert.equal(blob.includes("Bearer"), false);
  });

  it("strips a scheme if one was pasted into the DSN", async () => {
    process.env.UNIPILE_DSN = `https://${DSN}/`;
    process.env.UNIPILE_API_KEY = KEY;
    let url = "";
    const fetchImpl: typeof fetch = async (input) => {
      url = String(input);
      return jsonResponse(200, {});
    };
    await unipileRequest({ path: "/accounts" }, fetchImpl);
    assert.equal(url, `https://${DSN}/api/v1/accounts`);
  });

  it("returns the unconfigured sentence without calling fetch when env is missing", async () => {
    let called = 0;
    const fetchImpl: typeof fetch = async () => {
      called += 1;
      return jsonResponse(200, {});
    };
    const result = await unipileRequest({ path: "/accounts" }, fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(called, 0);
    if (!result.ok) assert.equal(result.line, UNIPILE_UNCONFIGURED_LINE);
  });

  it("retries 503 and 504 with backoff, and nothing else", async () => {
    setConfigured();
    const statuses = [503, 504, 200];
    const sleeps: number[] = [];
    let i = 0;
    const fetchImpl: typeof fetch = async () => jsonResponse(statuses[i++] ?? 200, { ok: true });

    const result = await unipileRequest(
      { path: "/accounts", sleep: async (ms) => { sleeps.push(ms); } },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    assert.equal(i, 3);
    assert.deepEqual(sleeps, [400, 1_200]);
  });

  it("does not retry a 429", async () => {
    setConfigured();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return jsonResponse(429, { type: "errors/too_many_requests", title: "Slow", status: 429 });
    };
    const result = await unipileRequest(
      { path: "/accounts", sleep: async () => { throw new Error("429 must not sleep"); } },
      fetchImpl,
    );
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
    if (!result.ok) assert.equal(result.error.type, "errors/too_many_requests");
  });

  it("treats a 401 as an operator alert and does not retry, log the key, or log a request body", async () => {
    setConfigured();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return jsonResponse(401, {
        type: "errors/disconnected_account",
        title: "Disconnected",
        detail: `key=${KEY} body={"text":"secret"}`,
        status: 401,
      });
    };

    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const result = await unipileRequest(
        {
          method: "POST",
          path: "/chats",
          json: { text: "must-not-be-logged", account_id: KEY },
          sleep: async () => { throw new Error("401 must not sleep"); },
        },
        fetchImpl,
      );
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.type, "errors/disconnected_account");
        assert.equal(result.line.includes(KEY), false);
        assert.equal(result.line.includes("must-not-be-logged"), false);
      }
    } finally {
      console.error = original;
    }

    assert.equal(calls, 1);
    assert.ok(lines.length >= 1, "a 401 has to reach the operator");
    const blob = lines.join("\n");
    assert.equal(blob.includes(KEY), false);
    assert.equal(blob.includes("must-not-be-logged"), false);
    assert.equal(blob.includes("401"), true);
    assert.equal(blob.includes("errors/disconnected_account"), true);
  });

  it("alerts the operator for a missing scope even when it arrives as 403 rather than 401", async () => {
    setConfigured();
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(403, {
        type: "errors/insufficient_privileges",
        title: "Out of scope",
        detail: `key=${KEY}`,
        status: 403,
      });

    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let result;
    try {
      result = await unipileRequest({ path: "/calendars" }, fetchImpl);
    } finally {
      console.error = original;
    }

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.type, "errors/insufficient_privileges");
      assert.equal(result.error.status, 403, "the observed status, not a canonical one");
    }
    const blob = lines.join("\n");
    assert.ok(lines.length >= 1, "a missing scope has to reach the operator at 403 too");
    assert.equal(blob.includes("errors/insufficient_privileges"), true);
    assert.equal(blob.includes("403"), true);
    assert.equal(blob.includes(KEY), false);
  });

  it("does not retry a thrown fetch, and does not claim Unipile's own wording", async () => {
    setConfigured();
    const fetchImpl: typeof fetch = async () => {
      throw new Error(`ENOTFOUND ${KEY}`);
    };
    const result = await unipileRequest({ path: "/accounts" }, fetchImpl);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.line, "Unipile could not be reached.");
      assert.equal(result.line.includes(KEY), false);
    }
  });
});

describe("accounts", () => {
  it("falls back to the brief's account ids when the env vars are unset", () => {
    assert.equal(calendarAccountId(), DEFAULT_CALENDAR_ACCOUNT_ID);
    assert.equal(whatsappAccountId(), DEFAULT_WHATSAPP_ACCOUNT_ID);
    process.env.UNIPILE_CALENDAR_ACCOUNT_ID = CALENDAR_ID;
    process.env.UNIPILE_WHATSAPP_ACCOUNT_ID = WHATSAPP_ID;
    assert.equal(calendarAccountId(), CALENDAR_ID);
    assert.equal(whatsappAccountId(), WHATSAPP_ID);
  });

  it("lists accounts and drops connection_params so a phone number never leaves the parser", async () => {
    setConfigured();
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(200, {
        object: "AccountList",
        items: [
          {
            object: "Account",
            id: WHATSAPP_ID,
            type: "WHATSAPP",
            name: "should not be required",
            sources: [{ id: "im", status: "OK" }],
            connection_params: { im: { phone_number: "420774654822" } },
          },
        ],
      });

    const result = await listAccounts(fetchImpl);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.length, 1);
      assert.deepEqual(result.body[0], {
        id: WHATSAPP_ID,
        type: "WHATSAPP",
        sources: [{ id: "im", status: "OK" }],
      });
      assert.equal(JSON.stringify(result.body).includes("420774654822"), false);
      assert.equal(JSON.stringify(result.body).includes("phone_number"), false);
    }
  });

  it("reads an accounts list whether its envelope says items or data", async () => {
    setConfigured();
    /* Chats come back as {object, items, cursor} and calendars as {data,
       next_cursor}. Which one the accounts list uses is in no spec we could
       read, and guessing wrong is not an error — it is an empty list and a
       page that says nothing is connected. */
    const row = { object: "Account", id: WHATSAPP_ID, type: "WHATSAPP", sources: [{ id: "im", status: "OK" }] };

    for (const envelope of [{ items: [row] }, { data: [row] }]) {
      const fetchImpl: typeof fetch = async () => jsonResponse(200, envelope);
      const result = await listAccounts(fetchImpl);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.body.length, 1, `envelope ${Object.keys(envelope)[0]} came back empty`);
        assert.equal(result.body[0].id, WHATSAPP_ID);
      }
    }
  });

  it("treats a 404 as not connected, and reports a rotting source on a connected account", async () => {
    setConfigured();
    process.env.UNIPILE_CALENDAR_ACCOUNT_ID = CALENDAR_ID;
    process.env.UNIPILE_WHATSAPP_ACCOUNT_ID = WHATSAPP_ID;

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith(`/accounts/${CALENDAR_ID}`)) {
        return jsonResponse(404, { type: "errors/resource_not_found", title: "Gone", status: 404 });
      }
      if (url.endsWith(`/accounts/${WHATSAPP_ID}`)) {
        return jsonResponse(200, {
          object: "Account",
          id: WHATSAPP_ID,
          type: "WHATSAPP",
          sources: [
            { id: "im", status: "CREDENTIALS" },
            { id: "other", status: "CONNECTING" },
          ],
          connection_params: { im: { phone_number: "420774654822" } },
        });
      }
      return jsonResponse(500, { type: "errors/unexpected_error", status: 500 });
    };

    const missing = await getAccount(CALENDAR_ID, fetchImpl);
    assert.equal(missing.ok, true);
    if (missing.ok) assert.equal(missing.body, null);

    const ours = await ourAccounts(fetchImpl);
    assert.equal(ours.ok, true);
    if (ours.ok) {
      const calendar = ours.accounts.find((row) => row.role === "calendar");
      const whatsapp = ours.accounts.find((row) => row.role === "whatsapp");
      assert.equal(calendar?.connected, false);
      assert.equal(whatsapp?.connected, true);
      assert.equal(whatsapp?.sources[0]?.status, "CREDENTIALS");
      assert.equal(whatsapp?.sources[1]?.status, "CONNECTING");
      assert.equal(JSON.stringify(ours.accounts).includes("420774654822"), false);
    }
  });

  it("keeps every documented source status, and maps any other to unknown", () => {
    const statuses = ["OK", "STOPPED", "ERROR", "CREDENTIALS", "PERMISSIONS", "CONNECTING"] as const;
    for (const status of statuses) {
      const parsed = parseAccount({
        id: "x",
        type: "WHATSAPP",
        sources: [{ id: "im", status }],
      });
      assert.equal(parsed?.sources[0]?.status, status);
    }
    const weird = parseAccount({
      id: "x",
      type: "WHATSAPP",
      sources: [{ id: "im", status: "SOMETHING_NEW" }],
    });
    assert.equal(weird?.sources[0]?.status, "unknown");
  });
});

describe("this directory is unimportable from client code", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const child = join(dir, entry);
      if (statSync(child).isDirectory()) return sourceFiles(child);
      return /\.(ts|tsx|js|jsx)$/.test(entry) ? [child] : [];
    });
  }

  it("fails if anything under client/ imports server/unipile", () => {
    const clientRoot = join(REPO_ROOT, "client");
    const files = sourceFiles(clientRoot);
    assert.ok(files.length > 20, `walked ${files.length} client files, which is too few`);
    const hits: string[] = [];
    const pattern = /server\/unipile|from\s+['"][^'"]*unipile['"]/;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (pattern.test(text)) hits.push(file.slice(REPO_ROOT.length + 1));
    }
    assert.deepEqual(hits, []);
  });

  it("does not hardcode a tenant host or port in this module", () => {
    const owned = ["client.ts", "errors.ts", "accounts.ts", "index.ts", "README.md"];
    for (const name of owned) {
      const text = readFileSync(join(HERE, name), "utf8");
      assert.equal(text.includes("api1"), false, `${name} must not name a tenant host`);
      assert.equal(text.includes("13111"), false, `${name} must not name a tenant port`);
    }
  });
});
