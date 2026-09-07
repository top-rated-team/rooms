/**
 * A price in a thread, paid, and recorded. Run it with:
 *
 *   npx tsx --test server/payments.test.ts
 *
 * The cases that have to stay true: a price names who invoices it; the expert
 * and the house are two invoices, not one; a partner room cannot carry a
 * Top-Rated Team fee; Pay records the paid state in the room; this site does
 * not take the money, and nothing a visitor would read claims that it does.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";

import {
  HOUSE_LEGAL_NAME,
  formatPriceAmount,
  houseFeeAllowed,
  issuePrice,
  listPrices,
  payPrice,
  readPrice,
  resetPaymentsForTests,
} from "./payments";
import { storage } from "./storage";

const PARTNER_DOOR = "linkedin-growth";
const PARTNER_LEGAL_NAME = DOOR_BY_ID[PARTNER_DOOR].contract.legalName;
const HOUSE_DOOR = DEFAULT_DOOR_ID;

beforeEach(() => {
  resetPaymentsForTests();
});

async function openRoom(door?: string) {
  const created = await storage.createWorkspace({
    name: "Payment link",
    source: door ? { door } : {},
  });
  return {
    token: created.token,
    workspaceId: created.workspace.id,
    channelId: created.channels[0].id,
    channels: created.channels,
  };
}

describe("whose price it is", () => {
  it("reads the house legal name off the door, including the legal form", () => {
    assert.equal(HOUSE_LEGAL_NAME, DOOR_BY_ID[HOUSE_DOOR].contract.legalName);
    assert.match(HOUSE_LEGAL_NAME, /SZČO/);
    assert.notEqual(HOUSE_LEGAL_NAME, "Top-Rated Team");
  });

  it("allows a house fee only in a room Top-Rated Team already invoices", () => {
    assert.equal(houseFeeAllowed(HOUSE_DOOR), true);
    assert.equal(houseFeeAllowed("ad-grants"), true);
    assert.equal(houseFeeAllowed("linkedin-automation"), true);
    assert.equal(houseFeeAllowed(PARTNER_DOOR), false);
    assert.equal(houseFeeAllowed(undefined), false);
    assert.equal(houseFeeAllowed("no-such-door"), false);
  });

  it("puts Top-Rated Team's legal name on a house fee, not a trading name and not the expert's", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 4900,
      for: "The team's fee for this room",
      issuer: "house",
      legalName: "Somebody Else Ltd",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.equal(issued.price.issuer, "house");
    assert.equal(issued.price.legalName, HOUSE_LEGAL_NAME);
    assert.equal(issued.price.amount, "$49.00");
    assert.match(issued.message.body, new RegExp(HOUSE_LEGAL_NAME.replace(/[()]/g, "\\$&")));
    assert.doesNotMatch(issued.message.body, /Somebody Else Ltd/);
  });

  it("keeps the expert's invoicing name on the expert's price", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "Conversion tracking setup",
      issuer: "expert",
      legalName: "Jane Expert",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.equal(issued.price.issuer, "expert");
    assert.equal(issued.price.legalName, "Jane Expert");
    assert.notEqual(issued.price.legalName, HOUSE_LEGAL_NAME);
    assert.match(issued.message.body, /Jane Expert/);
    assert.doesNotMatch(issued.message.body, new RegExp(HOUSE_LEGAL_NAME.replace(/[()]/g, "\\$&")));
  });

  it("refuses a house fee in a partner room, so our name cannot land on their work", async () => {
    const room = await openRoom(PARTNER_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 4900,
      for: "A fee",
      issuer: "house",
    });
    assert.equal(issued.ok, false);
    if (issued.ok) return;
    assert.match(issued.error, /not Top-Rated Team/);

    const state = await storage.getWorkspaceByToken(room.token);
    const sneak = (state?.messages ?? []).filter((message) => message.meta?.price);
    assert.equal(sneak.length, 0);
  });

  it("refuses a house fee in an unstamped room, which has not named a company", async () => {
    const room = await openRoom();
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 4900,
      for: "A fee",
      issuer: "house",
    });
    assert.equal(issued.ok, false);
  });

  it("lets the partner invoice their own work in their own room", async () => {
    const room = await openRoom(PARTNER_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 150000,
      for: "LinkedIn growth work",
      issuer: "expert",
      legalName: PARTNER_LEGAL_NAME,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.equal(issued.price.legalName, PARTNER_LEGAL_NAME);
    assert.notEqual(issued.price.legalName, HOUSE_LEGAL_NAME);
  });

  it("will not let a Top-Rated Team name onto an expert price in a partner room", async () => {
    const room = await openRoom(PARTNER_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "Work",
      issuer: "expert",
      legalName: HOUSE_LEGAL_NAME,
    });
    assert.equal(issued.ok, false);
    if (issued.ok) return;
    assert.match(issued.error, /cannot carry Top-Rated Team/);
  });

  it("asks for the expert's legal name rather than inventing one", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "Work",
      issuer: "expert",
    });
    assert.equal(issued.ok, false);
    if (issued.ok) return;
    assert.match(issued.error, /legal name/);
  });
});

describe("putting a price in a thread", () => {
  it("writes the amount, the work and the issuer into the channel as a message", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "One conversion-tracking setup",
      issuer: "house",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    assert.equal(issued.price.status, "open");
    assert.equal(issued.price.paidAt, null);
    assert.equal(issued.price.currency, "USD");
    assert.equal(issued.price.parentId, null);
    assert.equal(issued.message.channelId, room.channelId);
    assert.equal(issued.message.authorKind, "system");

    const state = await storage.getWorkspaceByToken(room.token);
    const row = state?.messages.find((message) => message.id === issued.message.id);
    assert.ok(row);
    const meta = row?.meta?.price as { legalName?: string; amount?: string; for?: string } | undefined;
    assert.equal(meta?.legalName, HOUSE_LEGAL_NAME);
    assert.equal(meta?.amount, "$99.00");
    assert.equal(meta?.for, "One conversion-tracking setup");
    assert.match(row?.body ?? "", /does not take the money/);
    assert.doesNotMatch(row?.body ?? "", /subscription|plan|upgrade/i);
  });

  it("can sit under a specific turn, which is the thread", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const parent = await storage.addMessage(room.workspaceId, {
      channelId: room.channelId,
      authorKey: "visitor",
      authorKind: "visitor",
      body: "Please send the figure for the setup.",
    });
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      parentId: parent.id,
      cents: 9900,
      for: "One conversion-tracking setup",
      issuer: "house",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.equal(issued.price.parentId, parent.id);
    assert.equal(issued.message.parentId, parent.id);
  });

  it("derives the displayed figure from cents, so the two cannot disagree", () => {
    assert.equal(formatPriceAmount(9900), "$99.00");
    assert.equal(formatPriceAmount(4950), "$49.50");
    assert.equal(formatPriceAmount(1), "$0.01");
  });

  it("refuses a channel that is not in this room", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const other = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: other.channelId,
      cents: 9900,
      for: "Work",
      issuer: "house",
    });
    assert.equal(issued.ok, false);
  });

  it("refuses a dead workspace token rather than writing into nothing", async () => {
    const issued = await issuePrice("noSuchToken0000000000", {
      channelId: "ch_missing",
      cents: 9900,
      for: "Work",
      issuer: "house",
    });
    assert.equal(issued.ok, false);
    if (issued.ok) return;
    assert.equal(issued.error, "Workspace not found");
  });

  it("refuses a zero or a negative amount, and a sentence with nothing in it", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const zero = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 0,
      for: "Work",
      issuer: "house",
    });
    assert.equal(zero.ok, false);

    const empty = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "   ",
      issuer: "house",
    });
    assert.equal(empty.ok, false);
  });
});

describe("paying it, and the room recording that it was", () => {
  it("marks the price paid and leaves that on the original message", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "One conversion-tracking setup",
      issuer: "house",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const paid = await payPrice(room.token, issued.price.id);
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    assert.equal(paid.price.status, "paid");
    assert.ok(paid.price.paidAt);
    assert.equal(paid.message.id, issued.message.id);
    assert.match(paid.message.body, /recorded as paid/);
    assert.match(paid.message.body, new RegExp(HOUSE_LEGAL_NAME.replace(/[()]/g, "\\$&")));
    assert.match(paid.message.body, /does not take the money/);
    assert.match(paid.notice.body, /Recorded as paid/);

    const state = await storage.getWorkspaceByToken(room.token);
    const row = state?.messages.find((message) => message.id === issued.message.id);
    const meta = row?.meta?.price as { status?: string; paidAt?: string | null } | undefined;
    assert.equal(meta?.status, "paid");
    assert.ok(meta?.paidAt);
    assert.equal((state?.messages ?? []).filter((message) => message.meta?.paid === true).length, 1);
  });

  it("is idempotent, so two clicks do not post two paid lines", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 4900,
      for: "The team's fee",
      issuer: "house",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const first = await payPrice(room.token, issued.price.id);
    const second = await payPrice(room.token, issued.price.id);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(second.price.paidAt, first.price.paidAt);

    const state = await storage.getWorkspaceByToken(room.token);
    assert.equal((state?.messages ?? []).filter((message) => message.meta?.paid === true).length, 1);
  });

  it("pays one price without paying the other, including when they share a thread", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const work = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "The setup",
      issuer: "expert",
      legalName: "Jane Expert",
    });
    const fee = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 4900,
      for: "The team's fee",
      issuer: "house",
    });
    assert.equal(work.ok, true);
    assert.equal(fee.ok, true);
    if (!work.ok || !fee.ok) return;

    const paid = await payPrice(room.token, work.price.id);
    assert.equal(paid.ok, true);

    const still = await readPrice(room.token, fee.price.id);
    assert.equal(still.ok, true);
    if (!still.ok) return;
    assert.equal(still.price.status, "open");
    assert.equal(still.price.issuer, "house");

    const listed = await listPrices(room.token);
    assert.ok(listed);
    assert.equal(listed?.length, 2);
    assert.equal(listed?.find((price) => price.id === work.price.id)?.status, "paid");
    assert.equal(listed?.find((price) => price.id === fee.price.id)?.status, "open");
  });

  it("does not take a payment from a token that is not this room's", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const other = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "Work",
      issuer: "house",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const stolen = await payPrice(other.token, issued.price.id);
    assert.equal(stolen.ok, false);

    const still = await readPrice(room.token, issued.price.id);
    assert.equal(still.ok, true);
    if (!still.ok) return;
    assert.equal(still.price.status, "open");
  });

  it("rebuilds the row from the message after the in-memory map is emptied, and can still be paid", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const issued = await issuePrice(room.token, {
      channelId: room.channelId,
      cents: 9900,
      for: "One conversion-tracking setup",
      issuer: "house",
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    resetPaymentsForTests();

    const read = await readPrice(room.token, issued.price.id);
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.price.status, "open");
    assert.equal(read.price.legalName, HOUSE_LEGAL_NAME);

    const paid = await payPrice(room.token, issued.price.id);
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    assert.equal(paid.price.status, "paid");
  });

  it("refuses an id this room does not have", async () => {
    const room = await openRoom(HOUSE_DOOR);
    const paid = await payPrice(room.token, "no-such-price");
    assert.equal(paid.ok, false);
  });
});
