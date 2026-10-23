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

/*
 * The rooms, their components, seats, billing and bridges used to be listed
 * here. They are MakeHybrid's Hybrid Rooms now (shared/rooms-moved.ts), and
 * what has to be reachable is the way to them.
 */
describe("every server feature has a door", () => {
  const routes = read("server/routes.ts");

  /* Modules that hold a feature's rules. Each one must be reachable from the
     file that answers HTTP, directly or through a module it imports. */
  const features: { module: string; why: string }[] = [
    { module: "./spend", why: "the spending guard on the free panel" },
    { module: "./rooms-moved", why: "sending /rooms and every old room address to the rooms' new home" },
  ];

  for (const feature of features) {
    it(`${feature.why} is reachable`, () => {
      assert.ok(
        routes.includes(`from "${feature.module}"`),
        `server/routes.ts does not import ${feature.module}, so nothing in a browser can reach ${feature.why}.`,
      );
    });
  }

  it("the redirect is registered, not only imported", () => {
    assert.ok(routes.includes("registerRoomsMoved(app)"), "server/routes.ts imports the rooms redirect and never mounts it");
  });
});

describe("nothing on the site still opens a room of its own", () => {
  const client = sourcesUnder("client/src", [".tsx", ".ts"]).map((path) => ({ path, text: read(path) }));

  it("no page asks this server for a new room, except AdGrant.AI's generator", () => {
    const callers = client
      .filter(({ text }) => /fetch\(\s*["'`]\/api\/workspaces["'`]/.test(text))
      .map(({ path }) => path);
    assert.deepEqual(callers, ["client/src/components/adgrant/Conversation.tsx"]);
  });

  it("no page links to a room address of its own", () => {
    const linkers = client.filter(({ text }) => /["'`]\/w\/\$\{/.test(text)).map(({ path }) => path);
    assert.deepEqual(linkers, []);
  });
});
