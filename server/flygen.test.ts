/**
 * Boosters are capacity. These cases hold the redaction, the naming, and the
 * difference between "none held" and "we could not ask".
 */

import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import type { BoosterInventory, RoomBooster } from "@shared/api";

import {
  CALL_SIGNS,
  callSignFor,
  FLYGEN_ACCOUNTS_URL,
  listBoosters,
  projectAccount,
  resetFlygenForTests,
} from "./flygen";

const LEAK_PROBE = "flygen-leak-probe-key-9f3c2a1b";

const DROPPED = [
  "name",
  "email",
  "password",
  "twoFactorSecret",
  "twoFactorSecretExpirationTime",
  "description",
  "proxy",
] as const;

/**
 * Shaped like the documented flygen response, with credentials that must never
 * leave the projection. Every distinctive string is a tripwire.
 */
const FIXTURE = {
  id: "acc_test_001",
  name: "PERSON-NAME-MUST-NOT-LEAK",
  email: "secret-owner@example.test",
  password: "RAW-PASSWORD-MUST-NOT-LEAK",
  description: "DESCRIPTION-MUST-NOT-LEAK",
  twoFactorSecret: "JBSWY3DPEHPK3PXP-MUST-NOT-LEAK",
  twoFactorSecretExpirationTime: "2026-12-01T00:00:00.000Z",
  phone: "PHONE-MUST-NOT-LEAK",
  proxy: {
    host: "203.0.113.10",
    port: 1080,
    username: "PROXY-USER-MUST-NOT-LEAK",
    password: "PROXY-PASSWORD-MUST-NOT-LEAK",
    mode: "socks5",
    location: "DE",
    url: "socks5://PROXY-USER-MUST-NOT-LEAK:PROXY-PASSWORD-MUST-NOT-LEAK@203.0.113.10:1080",
  },
  status: "live",
  rentalEndsAt: "2026-11-01T00:00:00.000Z",
};

const TRIPWIRES = [
  FIXTURE.name,
  FIXTURE.email,
  FIXTURE.password,
  FIXTURE.description,
  FIXTURE.twoFactorSecret,
  FIXTURE.twoFactorSecretExpirationTime,
  FIXTURE.phone,
  FIXTURE.proxy.host,
  FIXTURE.proxy.username,
  FIXTURE.proxy.password,
  FIXTURE.proxy.url,
  LEAK_PROBE,
];

type FlygenStub = (url: string, init?: RequestInit) => Promise<Response>;

let flygenStub: FlygenStub | null = null;
let originalFetch: typeof fetch;
let originalKey: string | undefined;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetchGuard(): void {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.flygen.in")) {
      if (!flygenStub) throw new Error("flygen fetch was not stubbed for this test");
      return flygenStub(url, init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

function assertNoTripwire(value: unknown, label: string): void {
  const blob = JSON.stringify(value);
  for (const needle of TRIPWIRES) {
    assert.equal(blob.includes(needle), false, `${label} leaked ${needle}`);
  }
}

function assertDroppedFields(projected: RoomBooster): void {
  const rec = projected as unknown as Record<string, unknown>;
  for (const field of DROPPED) {
    assert.equal(field in rec, false, `projection still carries ${field}`);
  }
}

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

before(() => {
  originalKey = process.env.FLYGEN_API_KEY;
  installFetchGuard();
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FLYGEN_API_KEY;
  else process.env.FLYGEN_API_KEY = originalKey;
});

beforeEach(() => {
  resetFlygenForTests();
  process.env.FLYGEN_API_KEY = LEAK_PROBE;
  flygenStub = null;
});

afterEach(() => {
  resetFlygenForTests();
  flygenStub = null;
});

describe("the projection", () => {
  it("carries none of the seven dropped fields, asserted field by field", () => {
    const projected = projectAccount(FIXTURE);
    assert.ok(projected, "a documented account should project");
    assertDroppedFields(projected);
    assertNoTripwire(projected, "projection");
    assert.equal(projected.location, "DE");
    assert.equal(projected.state, "live");
    assert.equal(projected.rentalEndsAt, "2026-11-01T00:00:00.000Z");
    assert.equal(Object.keys(projected).sort().join(","), "callSign,location,number,rentalEndsAt,state");
  });

  it("is built by naming what is kept, so an extra field does not pass through", () => {
    const projected = projectAccount({ ...FIXTURE, ssn: "SSN-MUST-NOT-LEAK", memberKey: "human:jane" });
    assert.ok(projected);
    const rec = projected as unknown as Record<string, unknown>;
    assert.equal("ssn" in rec, false);
    assert.equal("memberKey" in rec, false);
    assert.equal(JSON.stringify(projected).includes("SSN-MUST-NOT-LEAK"), false);
    assert.equal(JSON.stringify(projected).includes("human:jane"), false);
  });

  it("keeps the same call sign for the same account id", () => {
    const once = callSignFor("acc_test_001");
    const twice = callSignFor("acc_test_001");
    assert.deepEqual(once, twice);
    assert.match(once.label, /^Booster \d{2} · /);
    assert.equal(once.label, `Booster ${String(once.number).padStart(2, "0")} · ${once.word}`);
    assert.equal(CALL_SIGNS[once.number - 1], once.word);
    assert.equal(callSignFor("acc_test_001").label, projectAccount(FIXTURE)?.callSign);
  });

  it("draws call signs from the register of things, not from people", () => {
    assert.ok(CALL_SIGNS.includes("Basalt"));
    assert.ok(CALL_SIGNS.length >= 40);
    const forbidden = ["Vito", "Corleone", "Jane", "John", "Mary", "Hamlet", "Bond"];
    for (const name of forbidden) {
      assert.equal(
        CALL_SIGNS.some((word) => word.toLowerCase() === name.toLowerCase()),
        false,
        `${name} is a person or character, not a thing`,
      );
    }
    const labels = new Set(["acc_a", "acc_b", "acc_c", "acc_d", "acc_e", "acc_f"].map((id) => callSignFor(id).label));
    assert.ok(labels.size >= 5, "distinct ids should not all collapse to one call sign");
  });
});

describe("listBoosters", () => {
  it("returns the redacted inventory and does not cache the raw body", async () => {
    let calls = 0;
    flygenStub = async () => {
      calls += 1;
      return jsonResponse(200, [FIXTURE]);
    };

    const first = await listBoosters();
    const second = await listBoosters();
    assert.equal(calls, 1, "the second read must be served from the redacted cache");
    assert.equal(first.status, "ok");
    if (first.status !== "ok") return;
    assert.equal(first.boosters.length, 1);
    assertDroppedFields(first.boosters[0]);
    assertNoTripwire(first, "listBoosters");
    assert.deepEqual(second, first);
  });

  it("treats a 401 as not available, not as an empty inventory", async () => {
    flygenStub = async () => jsonResponse(401, { error: `invalid token ${LEAK_PROBE}` });
    const result = await listBoosters();
    assert.deepEqual(result, { status: "unavailable" });
    assert.notEqual(result.status, "ok");
    assertNoTripwire(result, "401 inventory");
  });

  it("treats a 429 as not available, not as an empty inventory", async () => {
    flygenStub = async () => jsonResponse(429, { error: "rate limit", key: LEAK_PROBE });
    const result = await listBoosters();
    assert.deepEqual(result, { status: "unavailable" });
    assertNoTripwire(result, "429 inventory");
  });

  it("treats a timeout as not available, not as an empty inventory", async () => {
    resetFlygenForTests({ timeoutMs: 30 });
    flygenStub = async (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const fail = (): void => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (!signal) return;
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail, { once: true });
      });

    const result = await listBoosters();
    assert.deepEqual(result, { status: "unavailable" });
    assertNoTripwire(result, "timeout inventory");
  });

  it("treats a real empty list as none held, which is the other fact", async () => {
    flygenStub = async () => jsonResponse(200, []);
    const result = await listBoosters();
    assert.deepEqual(result, { status: "ok", boosters: [] });
  });

  it("puts the API key in no returned body and no thrown error", async () => {
    flygenStub = async () => {
      throw new Error(`Unauthorized Bearer ${LEAK_PROBE}`);
    };

    let thrown: unknown = null;
    let result: BoosterInventory | undefined;
    try {
      result = await listBoosters();
    } catch (error) {
      thrown = error;
    }

    assert.equal(thrown, null, "a flygen failure must not throw");
    assert.deepEqual(result, { status: "unavailable" });
    assertNoTripwire(result, "thrown-error inventory");
  });

  it("does not call flygen when there is no key, and still says not available", async () => {
    delete process.env.FLYGEN_API_KEY;
    let calls = 0;
    flygenStub = async () => {
      calls += 1;
      return jsonResponse(200, [FIXTURE]);
    };
    const result = await listBoosters();
    assert.equal(calls, 0);
    assert.deepEqual(result, { status: "unavailable" });
  });
});

describe("a booster is never a room member", () => {
  it("is not written into the members list or the mention list", async () => {
    flygenStub = async () => jsonResponse(200, [FIXTURE]);

    const { registerRoutes } = await import("./routes");
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json({ limit: "256kb" }));
    registerRoutes(app);
    const server: Server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;

    try {
      const created = await fetch(`${origin}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Booster inventory test" }),
      });
      assert.equal(created.status, 201);
      const state = (await created.json()) as {
        workspace: { token: string };
        members: Array<{ displayName: string; memberKey: string; kind: string; presence?: string }>;
      };
      const token = state.workspace.token;

      const inventoryRes = await fetch(`${origin}/api/workspaces/${token}/boosters`);
      const inventoryText = await inventoryRes.text();
      assert.equal(inventoryRes.status, 200);
      assert.equal(inventoryText.includes(LEAK_PROBE), false);
      const inventory = JSON.parse(inventoryText) as BoosterInventory;
      assert.equal(inventory.status, "ok");
      if (inventory.status !== "ok") return;
      assert.equal(inventory.boosters.length, 1);
      assertNoTripwire(inventory, "http inventory");

      const roomRes = await fetch(`${origin}/api/workspaces/${token}`);
      const room = (await roomRes.json()) as { members: typeof state.members };
      const names = room.members.map((member) => member.displayName);
      assert.equal(names.some((name) => name.includes("Booster")), false);
      assert.equal(names.includes(FIXTURE.name), false);
      assert.equal(
        room.members.some((member) => member.memberKey.startsWith("booster")),
        false,
      );
      for (const member of room.members) {
        assert.equal(["visitor", "expert", "agent", "system"].includes(member.kind), true);
      }

      const write = await fetch(`${origin}/api/workspaces/${token}/boosters`, { method: "POST" });
      assert.equal(write.status, 404);

      const headerBlob = JSON.stringify([...inventoryRes.headers]);
      assert.equal(headerBlob.includes(LEAK_PROBE), false);
    } finally {
      await new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      });
    }
  });

  it("is not referenced from the member rail or the composer mention menu", () => {
    const rail = read("../client/src/components/workspace/MemberRail.tsx");
    const composer = read("../client/src/components/workspace/Composer.tsx");
    const sidebar = read("../client/src/components/workspace/WorkspaceSidebar.tsx");
    const panel = read("../client/src/components/workspace/AccountsPanel.tsx");
    const flygen = read("./flygen.ts");
    const routes = read("./routes.ts");

    for (const [name, src] of [
      ["MemberRail", rail],
      ["Composer", composer],
      ["WorkspaceSidebar", sidebar],
    ] as const) {
      assert.equal(src.includes("AccountsPanel"), false, `${name} must not import the inventory panel`);
      assert.equal(src.includes("RoomBooster"), false, `${name} must not treat a booster as a member`);
      assert.equal(src.includes("listBoosters"), false, `${name} must not fetch the inventory`);
      assert.equal(src.includes("flygen"), false, `${name} must not talk to flygen`);
    }

    assert.match(composer, /function mentionOptions\(members: Member\[\]\)/);
    assert.equal(panel.includes("MemberRail"), false);
    assert.equal(panel.includes("mentionOptions"), false);
    assert.equal(panel.includes("Avatar"), false);
    assert.equal(panel.includes("presence"), false);
    assert.equal(flygen.includes("addMember"), false);
    assert.equal(flygen.includes("storage"), false);
    assert.match(routes, /app\.get\(\s*"\/api\/workspaces\/:token\/boosters"/);
    assert.doesNotMatch(routes, /app\.(post|put|patch|delete)\(\s*"\/api\/workspaces\/:token\/boosters"/);
  });
});

describe("the panel copy", () => {
  it("says not available for a failed read, and none held for an empty list", () => {
    const panel = read("../client/src/components/workspace/AccountsPanel.tsx");
    assert.match(panel, /Not available\./);
    assert.match(panel, /The inventory could not be read\. That is not the same as holding none\./);
    assert.match(panel, /None held\./);
    assert.match(panel, /status === "unavailable"/);
    assert.match(panel, /boosters\.length === 0/);
    assert.doesNotMatch(panel, /totp|TOTP|authenticator|otpauth/i);
    assert.doesNotMatch(panel, /#[0-9a-fA-F]{3,8}/);
  });

  it("does not generate a 2FA code or persist the raw response", () => {
    const flygen = read("./flygen.ts");
    assert.doesNotMatch(flygen, /otpauth:|speakeasy|otplib|authenticator\.generate/i);
    assert.doesNotMatch(flygen, /writeFile|appendFile|createWriteStream/);
    assert.doesNotMatch(flygen, /console\.(log|info|debug|error|warn)\(/);
    assert.match(flygen, /callSign:/);
    assert.match(flygen, /location: readLocation/);
  });
});
