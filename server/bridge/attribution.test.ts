/**
 * Attribution on the bridge. Run it with:
 *
 *   npx tsx --test server/bridge/attribution.test.ts
 *
 * The cases that have to stay true: every outbound message names the speaker
 * from the member record; an agent's message can never be attributed as a
 * person's; an unmappable inbound sender is marked unattributed rather than
 * guessed, including when their WhatsApp push name matches a member; and the
 * room token is stripped from anything that would leave.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ROOM_BADGES,
  UNATTRIBUTED_AUTHOR_KEY,
  attributionFor,
  badgeForMember,
  buildOutboundPayload,
  formatOutboundText,
  mapInboundSender,
  normalizeSender,
  payloadContainsToken,
  stripRoomToken,
  unattributedLine,
} from "./attribution";

const OWNER = {
  memberKey: "human:dan",
  kind: "expert" as const,
  displayName: "Dan B.",
};

const CONTRACTOR = {
  memberKey: "human:ihor",
  kind: "expert" as const,
  displayName: "Ihor B.",
};

const AGENT = {
  memberKey: "agent:chatgpt-ads",
  kind: "agent" as const,
  displayName: "ChatGPT Ads Agent",
};

const VISITOR = {
  memberKey: "visitor",
  kind: "visitor" as const,
  displayName: "Jane",
};

const TOKEN = "tokBridgeTestToken12abcd";

describe("outbound attribution", () => {
  it("names the speaker from the member record, with the room's badge, before the body", () => {
    const text = formatOutboundText(OWNER, "The pixel is on checkout.");
    assert.equal(text.startsWith("Dan B. · Owner\n"), true);
    assert.equal(text.includes("The pixel is on checkout."), true);
    assert.equal(attributionFor(OWNER).badge, "Owner");
    assert.equal(attributionFor(CONTRACTOR).badge, "Contractor");
    assert.equal(attributionFor(VISITOR).badge, "Guest");
  });

  it("uses the six badges the room already holds, and no others", () => {
    assert.deepEqual(ROOM_BADGES, ["Owner", "Contractor", "Client", "Partner team", "Guest", "Agent"]);
  });

  it("never attributes an agent's message as a person's, even when the name looks like one", () => {
    const disguised = {
      memberKey: "agent:chatgpt-ads",
      kind: "expert" as const,
      displayName: "Dan B.",
    };
    assert.equal(badgeForMember(disguised), "Agent");
    assert.equal(attributionFor(disguised).badge, "Agent");
    const text = formatOutboundText(disguised, "Here is the measurement plan.");
    assert.match(text, /^Dan B\. · Agent\n/);
    assert.equal(text.includes(" · Owner"), false);
    assert.equal(text.includes(" · Contractor"), false);
    assert.equal(text.includes(" · Guest"), false);
    assert.equal(text.includes(" · Client"), false);

    const honest = formatOutboundText(AGENT, "Here is the measurement plan.");
    assert.match(honest, /^ChatGPT Ads Agent · Agent\n/);
  });

  it("takes the name off the member record, not off whoever typed the body", () => {
    const text = formatOutboundText(CONTRACTOR, "— Jane");
    assert.equal(text.startsWith("Ihor B. · Contractor\n"), true);
    assert.equal(text.startsWith("Jane"), false);
  });
});

describe("inbound attribution", () => {
  it("maps an explicit sender id and refuses to guess from a display name", () => {
    const members = [VISITOR, OWNER];
    const map = new Map([[normalizeSender("15551234567@c.us"), "visitor"]]);

    const mapped = mapInboundSender(
      {
        source: "whatsapp",
        senderId: "15551234567@c.us",
        shared: true,
        target: "120363group@g.us",
      },
      members,
      map,
    );
    assert.equal(mapped.kind, "mapped");
    assert.equal(mapped.memberKey, "visitor");

    const guessed = mapInboundSender(
      {
        source: "whatsapp",
        senderId: "15559876543@c.us",
        shared: true,
        target: "120363group@g.us",
      },
      members,
      new Map(),
      "visitor",
    );
    assert.equal(guessed.kind, "unattributed");
    assert.equal(guessed.memberKey, null);
  });

  it("marks an unmappable group sender unattributed rather than picking the only visitor", () => {
    const result = mapInboundSender(
      {
        source: "whatsapp",
        senderId: "15551110000@c.us",
        shared: true,
        target: "120363group@g.us",
      },
      [VISITOR, { memberKey: "visitor:other" }],
      new Map(),
      "visitor",
    );
    assert.equal(result.kind, "unattributed");
    assert.equal(result.memberKey, null);
    assert.equal(UNATTRIBUTED_AUTHOR_KEY, "unattributed");
    assert.match(unattributedLine("whatsapp"), /not identified/);
  });

  it("will map a one-to-one chat that was connected as this client's, and not a group", () => {
    const oneToOne = mapInboundSender(
      {
        source: "whatsapp",
        senderId: "15551234567@c.us",
        shared: false,
        target: "15551234567@c.us",
      },
      [VISITOR],
      new Map(),
      "visitor",
    );
    assert.equal(oneToOne.kind, "mapped");
    assert.equal(oneToOne.memberKey, "visitor");
  });
});

describe("what may not cross", () => {
  it("strips the room token from an outbound body, including a /w/ link", () => {
    const body = `Keep this: https://example.test/w/${TOKEN} and also ${TOKEN}`;
    const stripped = stripRoomToken(body, TOKEN);
    assert.equal(stripped.includes(TOKEN), false);
    assert.equal(stripped.includes("/w/"), false);

    const payload = buildOutboundPayload(OWNER, body, TOKEN, "15551234567@c.us");
    assert.equal(payloadContainsToken(payload, TOKEN), false);
    assert.equal(payload.to.includes(TOKEN), false);
    assert.equal(JSON.stringify(payload).includes(TOKEN), false);
    assert.match(payload.text, /^Dan B\. · Owner\n/);
  });
});
