/**
 * Can anybody get to it?
 *
 * This repository has shipped whole features nobody could reach: 716 lines of
 * server code for admitting an outside agent with no route, a bridge panel
 * with no mount, an exchange nothing called. Every one of them passed its own
 * tests, because a unit test asks whether the code works and never whether
 * anything runs it.
 *
 * So this file asks the other question. It is deliberately crude — it reads
 * source and looks for names — because the moment it needs a graph it will be
 * wrong in a way nobody notices. Run it with:
 *
 *   npx tsx --test server/reachable.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/* fileURLToPath, not `.pathname`: this repository's directory has a space in
   its name and a URL keeps it as %20. */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function sourcesUnder(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(join(ROOT, at), { withFileTypes: true })) {
      const next = `${at}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(next);
        continue;
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      if (entry.name.includes(".test.")) continue;
      out.push(next);
    }
  };
  walk(dir);
  return out;
}

describe("every room component is mounted by something", () => {
  const components = sourcesUnder("client/src/components/workspace", [".tsx"]);
  const everythingElse = [
    ...sourcesUnder("client/src", [".tsx", ".ts"]),
  ].filter((path) => !path.endsWith("/room-style.ts"));

  for (const path of components) {
    const name = path.split("/").pop()!.replace(/\.tsx$/, "");
    it(`${name} is imported somewhere`, () => {
      const importers = everythingElse.filter((other) => other !== path && read(other).includes(`workspace/${name}`));
      assert.ok(
        importers.length > 0,
        `client/src/components/workspace/${name}.tsx is imported by nothing. Either mount it or delete it — a component nobody can open is not a feature.`,
      );
    });
  }
});

describe("every server feature has a door", () => {
  const routes = read("server/routes.ts");

  /* Modules that hold a feature's rules. Each one must be reachable from the
     file that answers HTTP, directly or through a module it imports. */
  const features: { module: string; why: string }[] = [
    { module: "./seats", why: "admitting somebody else's agent" },
    { module: "./billing/consent", why: "whether two agents may answer each other" },
    { module: "./billing/http", why: "putting a card on a room" },
    { module: "./bridge", why: "connecting a room to WhatsApp, Slack or ChatWoot" },
    { module: "./spend", why: "the per-room spending guard" },
  ];

  for (const feature of features) {
    it(`${feature.why} is reachable`, () => {
      assert.ok(
        routes.includes(`from "${feature.module}"`),
        `server/routes.ts does not import ${feature.module}, so nothing in a browser can reach ${feature.why}.`,
      );
    });
  }
});

describe("the endpoints a room's controls call exist", () => {
  const routes = read("server/routes.ts");
  const page = read("client/src/pages/workspace.tsx");
  const panels = [
    "client/src/components/workspace/AgentExchangePanel.tsx",
    "client/src/components/workspace/BridgePanel.tsx",
  ].map(read);
  const client = [page, ...panels].join("\n");

  const paths = [
    "/api/workspaces/:token/seats",
    "/api/workspaces/:token/billing",
    "/api/workspaces/:token/billing/card",
    "/api/workspaces/:token/billing/agent-exchange",
    "/api/workspaces/:token/bridges",
  ];

  for (const path of paths) {
    it(`${path} is served`, () => {
      assert.ok(routes.includes(`"${path}"`), `${path} is called from the room but not served.`);
    });
  }

  it("the room calls the ones it draws controls for", () => {
    assert.ok(client.includes("/seats"), "nothing in the room asks for its admitted agents");
    assert.ok(client.includes("/billing"), "nothing in the room asks what it may spend");
    assert.ok(client.includes("/bridges"), "nothing in the room asks where it is connected");
  });
});
