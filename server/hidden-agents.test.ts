/**
 * A hidden agent may not answer, and a hidden door may not be routed to.
 * Run it with:
 *
 *   npx tsx --test server/hidden-agents.test.ts
 *
 * WHY THIS FILE EXISTS. The first attempt at hiding the LinkedIn agents while
 * the API application is open filtered the lists — the composer's mention
 * menu, the member rail, the connector's tool schema — and left every route
 * open. An unauthenticated POST to /api/ask naming a hidden agent still
 * streamed a grounded answer with citations to that agent's own corpus. The
 * review that found it listed the same hole in five more places.
 *
 * So this file tests the GATE rather than the lists: existence must stop being
 * the whole check, everywhere a hidden agent could be made to speak or a
 * hidden door could be chosen for somebody.
 *
 * The reply for a hidden agent is deliberately identical to the reply for one
 * that never existed. Telling a stranger which agents are being withheld is
 * itself the disclosure this is here to prevent.
 */

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { AGENTS, AGENT_BY_ID, VISIBLE_AGENTS, agentIsHidden, answerableAgent } from "@shared/roster";
import { DOORS, VISIBLE_DOORS } from "@shared/doors";
import { seedFor } from "@shared/playbook";

const HIDDEN_AGENTS = AGENTS.filter((agent) => agent.hidden);
const HIDDEN_DOORS = DOORS.filter((door) => door.hidden);

let origin = "";
let server: Server | null = null;

before(async () => {
  const { registerRoutes } = await import("./routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
});

after(async () => {
  const running = server;
  server = null;
  if (!running) return;
  await new Promise<void>((resolve) => {
    running.closeAllConnections();
    running.close(() => resolve());
  });
});

describe("the roster's own predicate", () => {
  it("has something to hide, or this whole file proves nothing", () => {
    /* If the flags are ever removed the tests below would all pass vacuously,
       which is the failure mode of every "nothing is exposed" suite. */
    assert.ok(HIDDEN_AGENTS.length > 0, "no agent is hidden — did the LinkedIn application get answered?");
    assert.ok(HIDDEN_DOORS.length > 0, "no door is hidden");
  });

  it("keeps the full maps whole and answers separately", () => {
    /* AGENTS and AGENT_BY_ID stay complete on purpose: a room that already
       seated an agent still has to render its name and its past messages. */
    for (const agent of HIDDEN_AGENTS) {
      assert.ok(AGENT_BY_ID[agent.id], `${agent.id} must still be resolvable for rendering`);
      assert.equal(agentIsHidden(agent.id), true);
      assert.equal(answerableAgent(agent.id), null);
      assert.ok(!VISIBLE_AGENTS.some((row) => row.id === agent.id), `${agent.id} is still on the visible roster`);
    }
    for (const agent of VISIBLE_AGENTS) {
      assert.equal(answerableAgent(agent.id)?.id, agent.id);
    }
  });

  it("never hides LinkedIn Ads, which is the exception the owner named", () => {
    assert.equal(agentIsHidden("linkedin-ads"), false);
    assert.ok(VISIBLE_DOORS.some((door) => door.id === "linkedin-ads"));
  });
});

describe("POST /api/ask", () => {
  it("refuses a hidden agent exactly as it refuses one that does not exist", async () => {
    for (const agent of HIDDEN_AGENTS) {
      const hidden = await fetch(`${origin}/api/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "What can be automated on LinkedIn?", agentId: agent.id }),
      });
      assert.equal(hidden.status, 400, `${agent.id} was accepted by /api/ask`);
      const body = (await hidden.json()) as { error?: string };

      const missing = await fetch(`${origin}/api/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "What can be automated on LinkedIn?", agentId: "no-such-agent" }),
      });
      const missingBody = (await missing.json()) as { error?: string };
      assert.equal(hidden.status, missing.status);
      /* Same shape of sentence, each naming the id it was given — so the
         reply cannot be used to tell a hidden agent from an absent one. */
      assert.equal(body.error, `Unknown agent: ${agent.id}`);
      assert.equal(missingBody.error, "Unknown agent: no-such-agent");
    }
  });
});

describe("POST /api/workspaces", () => {
  it("will not open a room seeded on a hidden agent", async () => {
    for (const agent of HIDDEN_AGENTS) {
      const res = await fetch(`${origin}/api/workspaces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      assert.equal(res.status, 400, `a room was opened on ${agent.id}`);
    }
  });
});

describe("POST /api/route-question", () => {
  it("never routes a visitor to a hidden door, by score or by name", async () => {
    const questions = [
      "Can this be built against the official LinkedIn API instead of a browser session?",
      "I want LinkedIn automation with a written legal assessment.",
      "Can a partner company run LinkedIn growth for us?",
    ];
    for (const question of questions) {
      const res = await fetch(`${origin}/api/route-question`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      assert.equal(res.status, 200);
      const body = JSON.stringify(await res.json());
      for (const door of HIDDEN_DOORS) {
        assert.ok(!body.includes(`"${door.id}"`), `${door.id} came back for "${question}"`);
      }
      for (const agent of HIDDEN_AGENTS) {
        assert.ok(!body.includes(`"${agent.id}"`), `${agent.id} came back for "${question}"`);
      }
    }
  });

  it("does not honour a hidden door asked for by id", async () => {
    for (const door of HIDDEN_DOORS) {
      const res = await fetch(`${origin}/api/route-question`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "What can you do for us?", doorId: door.id }),
      });
      const body = JSON.stringify(await res.json());
      assert.ok(!body.includes(`"${door.id}"`), `${door.id} was honoured by id`);
    }
  });
});

describe("GET /api/operator", () => {
  it("does not publish a hidden door to an operator", async () => {
    const res = await fetch(`${origin}/api/operator`, { headers: { Accept: "application/json" } });
    assert.equal(res.status, 200);
    const body = JSON.stringify(await res.json());
    for (const door of HIDDEN_DOORS) {
      assert.ok(!body.includes(`"${door.id}"`), `${door.id} is offered on /setup`);
    }
  });
});

describe("seeding a room", () => {
  it("gives a hidden door no agent channel to be answered in", () => {
    for (const door of HIDDEN_DOORS) {
      const seed = seedFor({
        id: door.id,
        slug: door.slug,
        headline: door.headline,
        firstAgentId: door.firstAgentId,
        ours: true,
        hidden: true,
      });
      for (const channel of seed.channels) {
        /* Not "no agent channel at all" — a hidden door's room still seeds
           ask-legal, and the AI Lawyer Agent is not hidden. The property is
           narrower and it is the one that matters: no channel points at an
           agent nobody may reach. */
        assert.ok(
          !HIDDEN_AGENTS.some((agent) => channel.counterpartKey === `agent:${agent.id}`),
          `${door.id} seeded a channel pointed at a hidden agent`,
        );
      }
    }
  });
});
