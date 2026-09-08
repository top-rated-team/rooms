/**
 * A proposed change in a thread, approved or declined, and recorded. Run it with:
 *
 *   npx tsx --test server/approvals.test.ts
 *
 * The cases that have to stay true: the card shows what would change and what
 * is there now; New and Edit are different headings; approving records who
 * and when; that record is what a later read returns; nothing a visitor would
 * read claims a write to an account happened.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  approvalHeading,
  decideApproval,
  formatApprovalValue,
  listApprovals,
  proposeApproval,
  readApproval,
  resetApprovalsForTests,
} from "./approvals";
import { storage } from "./storage";

beforeEach(() => {
  resetApprovalsForTests();
});

async function openRoom() {
  const created = await storage.createWorkspace({
    name: "Approval card",
    source: { door: "ad-grants" },
  });
  return {
    token: created.token,
    workspaceId: created.workspace.id,
    channelId: created.channels[0].id,
  };
}

function editCampaign(room: { token: string; channelId: string }, extra: Record<string, unknown> = {}) {
  return proposeApproval(room.token, {
    channelId: room.channelId,
    summary: "Widen the location the campaigns can show in.",
    kind: "campaign",
    creates: false,
    targetName: "Spring launch",
    proposedBy: "Ad Grants Agent",
    changes: [{ field: "location", from: "Berlin", to: "Germany" }],
    ...extra,
  });
}

describe("the heading a person reads before they decide", () => {
  it("says New for a creation and Edit for a change, with the name", () => {
    assert.equal(approvalHeading(true, "campaign", "Spring launch"), "New campaign «Spring launch»");
    assert.equal(approvalHeading(false, "campaign", "Evergreen"), "Edit campaign «Evergreen»");
    assert.equal(approvalHeading(true, "ad group", "Brand"), "New ad group «Brand»");
    assert.equal(approvalHeading(false, "conversion action", null), "Edit conversion action");
  });

  it("keeps the name when the kind is unfamiliar, rather than inventing a verb", () => {
    assert.equal(approvalHeading(true, "keyword list", "Grant core"), "New keyword list «Grant core»");
  });
});

describe("how a value is printed", () => {
  it("renders empties as an em-dash and booleans as on/off", () => {
    assert.equal(formatApprovalValue(null), "—");
    assert.equal(formatApprovalValue(undefined), "—");
    assert.equal(formatApprovalValue(""), "—");
    assert.equal(formatApprovalValue(true), "on");
    assert.equal(formatApprovalValue(false), "off");
    assert.equal(formatApprovalValue(["a", "b"]), "a, b");
    assert.equal(formatApprovalValue([]), "—");
  });
});

describe("putting a proposal in a thread", () => {
  it("writes the heading, the before, the after and the honest limit into the channel", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    assert.equal(proposed.approval.status, "pending");
    assert.equal(proposed.approval.decidedBy, null);
    assert.equal(proposed.approval.decidedAt, null);
    assert.equal(proposed.approval.heading, "Edit campaign «Spring launch»");
    assert.equal(proposed.approval.creates, false);
    assert.equal(proposed.approval.changes[0]?.from, "Berlin");
    assert.equal(proposed.approval.changes[0]?.to, "Germany");
    assert.equal(proposed.message.authorKind, "system");

    const state = await storage.getWorkspaceByToken(room.token);
    const row = state?.messages.find((message) => message.id === proposed.message.id);
    assert.ok(row);
    const meta = row?.meta?.approval as { heading?: string; changes?: { from?: unknown; to?: unknown }[] } | undefined;
    assert.equal(meta?.heading, "Edit campaign «Spring launch»");
    assert.equal(meta?.changes?.[0]?.from, "Berlin");
    assert.equal(meta?.changes?.[0]?.to, "Germany");
    assert.match(row?.body ?? "", /Berlin/);
    assert.match(row?.body ?? "", /Germany/);
    assert.match(row?.body ?? "", /does not write this change to any account/);
    assert.doesNotMatch(row?.body ?? "", /live in your Google Ads account|has been written|is now live/i);
  });

  it("says New, and prints an em-dash for what did not exist, when this would create something", async () => {
    const room = await openRoom();
    const proposed = await proposeApproval(room.token, {
      channelId: room.channelId,
      summary: "A campaign generated from the charity's own website.",
      kind: "campaign",
      creates: true,
      targetName: "Donations 2026",
      proposedBy: "Ad Grants Agent",
      changes: [{ field: "name", to: "Donations 2026" }],
    });
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    assert.equal(proposed.approval.heading, "New campaign «Donations 2026»");
    assert.equal(proposed.approval.creates, true);
    assert.equal(proposed.approval.changes[0]?.from, null);
    assert.match(proposed.message.body, /name: — → Donations 2026/);
  });

  it("refuses an edit that does not show what is there now", async () => {
    const room = await openRoom();
    const proposed = await proposeApproval(room.token, {
      channelId: room.channelId,
      summary: "Widen location.",
      kind: "campaign",
      creates: false,
      targetName: "Spring launch",
      proposedBy: "Ad Grants Agent",
      changes: [{ field: "location", to: "Germany" }],
    });
    assert.equal(proposed.ok, false);
    if (proposed.ok) return;
    assert.match(proposed.error, /what is there now/);

    const state = await storage.getWorkspaceByToken(room.token);
    const sneak = (state?.messages ?? []).filter((message) => message.meta?.approval);
    assert.equal(sneak.length, 0);
  });

  it("treats a current value of null or empty string as known, not missing", async () => {
    const room = await openRoom();
    const proposed = await proposeApproval(room.token, {
      channelId: room.channelId,
      summary: "Fill the headline that is blank today.",
      kind: "ad",
      creates: false,
      targetName: "Search ad 1",
      proposedBy: "Ad Grants Agent",
      changes: [
        { field: "headline", from: null, to: "Give this month" },
        { field: "description", from: "", to: "A line about the work." },
      ],
    });
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    assert.equal(proposed.approval.changes[0]?.from, null);
    assert.equal(proposed.approval.changes[1]?.from, "");
    assert.match(proposed.message.body, /headline: — → Give this month/);
  });

  it("can sit under a specific turn, which is the thread", async () => {
    const room = await openRoom();
    const parent = await storage.addMessage(room.workspaceId, {
      channelId: room.channelId,
      authorKey: "visitor",
      authorKind: "visitor",
      body: "Show me what the tool would write.",
    });
    const proposed = await editCampaign(room, { parentId: parent.id });
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    assert.equal(proposed.approval.parentId, parent.id);
    assert.equal(proposed.message.parentId, parent.id);
  });

  it("refuses a channel that is not in this room", async () => {
    const room = await openRoom();
    const other = await openRoom();
    const proposed = await editCampaign({ token: room.token, channelId: other.channelId });
    assert.equal(proposed.ok, false);
  });

  it("refuses a dead workspace token rather than writing into nothing", async () => {
    const proposed = await proposeApproval("noSuchToken0000000000", {
      channelId: "ch_missing",
      summary: "A change",
      kind: "campaign",
      proposedBy: "Ad Grants Agent",
      changes: [{ field: "location", from: "Berlin", to: "Germany" }],
    });
    assert.equal(proposed.ok, false);
    if (proposed.ok) return;
    assert.equal(proposed.error, "Workspace not found");
  });

  it("asks for a summary, a kind, a proposer and at least one change, rather than inventing them", async () => {
    const room = await openRoom();
    const emptySummary = await proposeApproval(room.token, {
      channelId: room.channelId,
      summary: "   ",
      kind: "campaign",
      proposedBy: "Ad Grants Agent",
      changes: [{ field: "location", from: "Berlin", to: "Germany" }],
    });
    assert.equal(emptySummary.ok, false);

    const noChanges = await proposeApproval(room.token, {
      channelId: room.channelId,
      summary: "A change",
      kind: "campaign",
      proposedBy: "Ad Grants Agent",
      changes: [],
    });
    assert.equal(noChanges.ok, false);
  });
});

describe("approving it, and the room recording who and when", () => {
  it("marks the proposal approved and leaves who and when on the original message", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    const decided = await decideApproval(room.token, proposed.approval.id, {
      action: "approve",
      by: "Jane Client",
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.approval.status, "approved");
    assert.equal(decided.approval.decidedBy, "Jane Client");
    assert.ok(decided.approval.decidedAt);
    assert.equal(decided.message.id, proposed.message.id);
    assert.match(decided.message.body, /approved by Jane Client/);
    assert.match(decided.message.body, /Nothing was written to an account/);
    assert.match(decided.notice.body, /Approved by Jane Client/);
    assert.doesNotMatch(decided.message.body, /is now live|has been published/i);

    const state = await storage.getWorkspaceByToken(room.token);
    const row = state?.messages.find((message) => message.id === proposed.message.id);
    const meta = row?.meta?.approval as { status?: string; decidedBy?: string; decidedAt?: string | null } | undefined;
    assert.equal(meta?.status, "approved");
    assert.equal(meta?.decidedBy, "Jane Client");
    assert.ok(meta?.decidedAt);
    assert.equal((state?.messages ?? []).filter((message) => message.meta?.decided === true).length, 1);
  });

  it("is what a later read returns — the same before, after, who and when", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    await decideApproval(room.token, proposed.approval.id, { action: "approve", by: "Jane Client" });

    const later = await readApproval(room.token, proposed.approval.id);
    assert.equal(later.ok, true);
    if (!later.ok) return;
    assert.equal(later.approval.status, "approved");
    assert.equal(later.approval.decidedBy, "Jane Client");
    assert.equal(later.approval.changes[0]?.from, "Berlin");
    assert.equal(later.approval.changes[0]?.to, "Germany");
    assert.equal(later.approval.heading, "Edit campaign «Spring launch»");
  });

  it("records a decline the same way, with who and when", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    const decided = await decideApproval(room.token, proposed.approval.id, {
      action: "decline",
      by: "Jane Client",
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.approval.status, "declined");
    assert.equal(decided.approval.decidedBy, "Jane Client");
    assert.match(decided.message.body, /declined by Jane Client/);
    assert.doesNotMatch(decided.message.body, /approved by/);
  });

  it("is idempotent, so two clicks do not post two decided lines", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    const first = await decideApproval(room.token, proposed.approval.id, { action: "approve", by: "Jane Client" });
    const second = await decideApproval(room.token, proposed.approval.id, { action: "approve", by: "Someone Else" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(second.approval.decidedAt, first.approval.decidedAt);
    assert.equal(second.approval.decidedBy, "Jane Client");

    const state = await storage.getWorkspaceByToken(room.token);
    assert.equal((state?.messages ?? []).filter((message) => message.meta?.decided === true).length, 1);
  });

  it("will not let a decline overwrite an approval, or the other way around", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    const approved = await decideApproval(room.token, proposed.approval.id, { action: "approve", by: "Jane Client" });
    assert.equal(approved.ok, true);

    const flipped = await decideApproval(room.token, proposed.approval.id, { action: "decline", by: "Jane Client" });
    assert.equal(flipped.ok, false);
    if (flipped.ok) return;
    assert.match(flipped.error, /already approved/);

    const still = await readApproval(room.token, proposed.approval.id);
    assert.equal(still.ok, true);
    if (!still.ok) return;
    assert.equal(still.approval.status, "approved");
    assert.equal(still.approval.decidedBy, "Jane Client");
  });

  it("decides one proposal without deciding the other, including when they share a thread", async () => {
    const room = await openRoom();
    const location = await editCampaign(room);
    const budget = await proposeApproval(room.token, {
      channelId: room.channelId,
      summary: "Raise the daily budget.",
      kind: "campaign",
      creates: false,
      targetName: "Spring launch",
      proposedBy: "Ad Grants Agent",
      changes: [{ field: "daily budget", from: "10", to: "12" }],
    });
    assert.equal(location.ok, true);
    assert.equal(budget.ok, true);
    if (!location.ok || !budget.ok) return;

    const decided = await decideApproval(room.token, location.approval.id, { action: "approve", by: "Jane Client" });
    assert.equal(decided.ok, true);

    const still = await readApproval(room.token, budget.approval.id);
    assert.equal(still.ok, true);
    if (!still.ok) return;
    assert.equal(still.approval.status, "pending");
    assert.equal(still.approval.decidedBy, null);

    const listed = await listApprovals(room.token);
    assert.ok(listed);
    assert.equal(listed?.length, 2);
    assert.equal(listed?.find((row) => row.id === location.approval.id)?.status, "approved");
    assert.equal(listed?.find((row) => row.id === budget.approval.id)?.status, "pending");
  });

  it("does not take a decision from a token that is not this room's", async () => {
    const room = await openRoom();
    const other = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    const stolen = await decideApproval(other.token, proposed.approval.id, { action: "approve", by: "Intruder" });
    assert.equal(stolen.ok, false);

    const still = await readApproval(room.token, proposed.approval.id);
    assert.equal(still.ok, true);
    if (!still.ok) return;
    assert.equal(still.approval.status, "pending");
  });

  it("rebuilds the row from the message after the in-memory map is emptied, and can still be decided", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    resetApprovalsForTests();

    const read = await readApproval(room.token, proposed.approval.id);
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.approval.status, "pending");
    assert.equal(read.approval.changes[0]?.from, "Berlin");

    const decided = await decideApproval(room.token, proposed.approval.id, { action: "approve", by: "Jane Client" });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.approval.status, "approved");
    assert.equal(decided.approval.decidedBy, "Jane Client");
  });

  it("refuses a decision without a name, because the record has to say who", async () => {
    const room = await openRoom();
    const proposed = await editCampaign(room);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;

    const nameless = await decideApproval(room.token, proposed.approval.id, { action: "approve", by: "   " });
    assert.equal(nameless.ok, false);
    if (nameless.ok) return;
    assert.match(nameless.error, /name/i);

    const still = await readApproval(room.token, proposed.approval.id);
    assert.equal(still.ok, true);
    if (!still.ok) return;
    assert.equal(still.approval.status, "pending");
  });

  it("refuses an id this room does not have", async () => {
    const room = await openRoom();
    const decided = await decideApproval(room.token, "no-such-approval", { action: "approve", by: "Jane Client" });
    assert.equal(decided.ok, false);
    if (decided.ok) return;
    assert.equal(decided.missing, true);
  });
});
