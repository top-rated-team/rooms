/**
 * Admitting somebody else's agent to one thread. Run it with:
 *
 *   npx tsx --test server/seats.test.ts
 *
 * The cases that have to stay true: the agent is watch-only until a second
 * decision; it has its own credential, which is not the room link; that
 * credential is bound to a named person on our roster; it has its own call
 * counter, because a server-initiated turn has no IP; revoke writes a reason
 * into the thread; and an agent replies to an agent only when a person named
 * both in one message.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { EXPERTS } from "@shared/roster";

import {
  DEFAULT_CALLS_PER_DAY,
  DEFAULT_EXPIRES_DAYS,
  MAX_CALLS_PER_DAY,
  MAX_EXPIRES_DAYS,
  ROOM_TOKEN_IS_NOT_A_SEAT,
  SEAT_AUTHORIZATION_SCHEME,
  WATCH_CANNOT_POST,
  admitSeat,
  agentsNamedIn,
  authenticateSeat,
  claimSeatCall,
  credentialFromAuthorization,
  listSeats,
  mayAgentReplyToAgent,
  mayKickOffFromMessage,
  postFromSeat,
  readSeatThread,
  resetSeatsForTests,
  revokeSeat,
  seatForMemberInRoom,
  setSeatMode,
  storedSeatForTests,
} from "./seats";
import { storage } from "./storage";

const T0 = Date.UTC(2026, 8, 8, 11, 0, 0);
const DAY = 24 * 60 * 60_000;
const PARTY = EXPERTS.find((row) => row.badge === "Owner") ?? EXPERTS[0];

beforeEach(() => {
  resetSeatsForTests();
});

async function openRoom() {
  const created = await storage.createWorkspace({ name: "Outside agent" });
  const thread = created.channels.find((channel) => channel.kind === "project") ?? created.channels[0];
  const other = created.channels.find((channel) => channel.id !== thread.id) ?? created.channels[0];
  return {
    token: created.token,
    workspaceId: created.workspace.id,
    thread,
    other,
    channels: created.channels,
  };
}

function expiryIso(days: number = DEFAULT_EXPIRES_DAYS, now: number = T0): string {
  return new Date(now + days * DAY).toISOString();
}

async function admit(room: Awaited<ReturnType<typeof openRoom>>, extra: Record<string, unknown> = {}, now: number = T0) {
  return admitSeat(
    room.token,
    {
      company: "Acme Tools",
      displayName: "Acme Bot",
      channelId: room.thread.id,
      boundPartyKey: PARTY.memberKey,
      callsPerDay: DEFAULT_CALLS_PER_DAY,
      expiresOn: expiryIso(),
      ...extra,
    },
    now,
  );
}

describe("admission", () => {
  it("lets somebody else's agent into one thread, watching, with a budget and an expiry", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    assert.equal(admitted.seat.mode, "watch");
    assert.equal(admitted.seat.thread, room.thread.slug);
    assert.equal(admitted.seat.channelId, room.thread.id);
    assert.equal(admitted.seat.company, "Acme Tools");
    assert.equal(admitted.seat.callsUsed, 0);
    assert.equal(admitted.seat.callsPerDay, DEFAULT_CALLS_PER_DAY);
    assert.equal(admitted.seat.boundPartyKey, PARTY.memberKey);
    assert.equal(admitted.seat.boundParty, PARTY.name);
    assert.equal(admitted.member.kind, "agent");
    assert.equal(admitted.member.memberKey, admitted.seat.memberKey);
    assert.match(admitted.message.body, /watching/);
    assert.match(admitted.message.body, new RegExp(`#${room.thread.slug}`));
    assert.match(admitted.message.body, new RegExp(PARTY.name.replace(/[.]/g, "\\.")));
    assert.doesNotMatch(admitted.message.body, /!/);
  });

  it("does not put the credential on the public seat, the member, or the thread line", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    assert.ok(admitted.credential.startsWith("seat_"));
    assert.ok(!("credential" in admitted.seat));
    assert.ok(!JSON.stringify(admitted.seat).includes(admitted.credential));
    assert.ok(!admitted.message.body.includes(admitted.credential));
    assert.ok(!JSON.stringify(admitted.member).includes(admitted.credential));

    const listed = await listSeats(room.token, T0);
    assert.ok(listed);
    assert.equal(listed?.some((row) => JSON.stringify(row).includes(admitted.credential)), false);

    const stored = storedSeatForTests(admitted.seat.id);
    assert.ok(stored);
    assert.equal("credential" in (stored ?? {}), false);
    assert.ok(stored && stored.credentialHash.length === 64);
    assert.notEqual(stored?.credentialHash, admitted.credential);
  });

  it("refuses an admission that is not bound to a named person on our roster", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { boundPartyKey: "human:nobody-here" });
    assert.equal(admitted.ok, false);
    if (admitted.ok) return;
    assert.match(admitted.error, /named person on our side/);
  });

  it("refuses an admission with no expiry, because an admission that never ends is a key", async () => {
    const room = await openRoom();
    const empty = await admit(room, { expiresOn: "" });
    assert.equal(empty.ok, false);

    const past = await admit(room, { expiresOn: new Date(T0 - DAY).toISOString() });
    assert.equal(past.ok, false);
    if (past.ok) return;
    assert.match(past.error, /future/);
  });

  it("refuses an expiry further away than the bound, so a year-long seat cannot sneak through", async () => {
    const room = await openRoom();
    const far = await admit(room, { expiresOn: expiryIso(MAX_EXPIRES_DAYS + 1) });
    assert.equal(far.ok, false);
    if (far.ok) return;
    assert.match(far.error, new RegExp(`${MAX_EXPIRES_DAYS} days`));
  });

  it("caps the daily calls at the constant, not at whatever number a caller typed", async () => {
    const room = await openRoom();
    const over = await admit(room, { callsPerDay: MAX_CALLS_PER_DAY + 1 });
    assert.equal(over.ok, false);
  });

  it("says in the thread that the room link is not this agent's credential, and that a restart forgets it", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;
    assert.match(admitted.message.body, /not a credential for this agent/);
    assert.match(admitted.message.body, /restart forgets/);
  });
});

describe("the credential is not the room link", () => {
  it("authenticates with the secret minted at admission", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const auth = authenticateSeat(admitted.credential, T0);
    assert.equal(auth.ok, true);
    if (!auth.ok) return;
    assert.equal(auth.seat.id, admitted.seat.id);
    assert.equal(auth.seat.channelId, room.thread.id);
  });

  it("refuses the room token, even though that token opens the room", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const asRoom = authenticateSeat(room.token, T0);
    assert.equal(asRoom.ok, false);
    if (asRoom.ok) return;
    assert.equal(asRoom.error, ROOM_TOKEN_IS_NOT_A_SEAT);

    const listed = await listSeats(room.token, T0);
    assert.ok(listed && listed.length === 1, "the room token still identifies the room for the owner");
  });

  it("refuses another seat's secret, and a string that is not a secret at all", async () => {
    const room = await openRoom();
    const first = await admit(room);
    const second = await admit(room, { displayName: "Other Bot" });
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;

    const crossed = authenticateSeat(first.credential, T0);
    assert.equal(crossed.ok, true);
    if (!crossed.ok) return;
    assert.equal(crossed.seat.id, first.seat.id);
    assert.notEqual(crossed.seat.id, second.seat.id);

    const junk = authenticateSeat("seat_thisisnotarealsecretatall00", T0);
    assert.equal(junk.ok, false);
  });

  it("reads the secret from an Authorization: Seat header, and ignores Bearer room tokens", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const pulled = credentialFromAuthorization(`${SEAT_AUTHORIZATION_SCHEME} ${admitted.credential}`);
    assert.equal(pulled, admitted.credential);
    assert.equal(authenticateSeat(pulled ?? "", T0).ok, true);

    assert.equal(credentialFromAuthorization(`Bearer ${room.token}`), null);
    assert.equal(credentialFromAuthorization(`Bearer ${admitted.credential}`), null);
    assert.equal(credentialFromAuthorization(room.token), null);
  });

  it("refuses to read or post when the caller presents the room token as the agent", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const read = await readSeatThread(room.token, T0);
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.error, ROOM_TOKEN_IS_NOT_A_SEAT);

    await setSeatMode(room.token, admitted.seat.id, "act", T0);
    const posted = await postFromSeat(room.token, "sneaking in", T0);
    assert.equal(posted.ok, false);
    if (posted.ok) return;
    assert.equal(posted.error, ROOM_TOKEN_IS_NOT_A_SEAT);
  });
});

describe("one thread, not the room", () => {
  it("lets the agent read only the thread it was admitted to", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    await storage.addMessage(room.workspaceId, {
      channelId: room.thread.id,
      authorKey: "visitor",
      authorKind: "visitor",
      body: "In the admitted thread.",
    });
    if (room.other.id !== room.thread.id) {
      await storage.addMessage(room.workspaceId, {
        channelId: room.other.id,
        authorKey: "visitor",
        authorKind: "visitor",
        body: "In another thread the agent must not see.",
      });
    }

    const read = await readSeatThread(admitted.credential, T0);
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.channelId, room.thread.id);
    assert.equal(read.thread, room.thread.slug);
    assert.ok(read.messages.every((message) => message.channelId === room.thread.id));
    assert.equal(
      read.messages.some((message) => message.body.includes("must not see")),
      false,
    );
    assert.ok(!("token" in read));
    assert.ok(!("workspace" in read));
    assert.ok(!("roomToken" in read));
    assert.ok(!JSON.stringify(read.seat).includes(room.token));
  });

  it("does not count a read against the day's calls", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    await readSeatThread(admitted.credential, T0);
    await readSeatThread(admitted.credential, T0);
    const auth = authenticateSeat(admitted.credential, T0);
    assert.equal(auth.ok && auth.ok ? auth.seat.callsUsed : -1, 0);
  });
});

describe("watch is the default, and posting is a second decision", () => {
  it("refuses a post while the seat is watching", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const posted = await postFromSeat(admitted.credential, "Hello from the outside.", T0);
    assert.equal(posted.ok, false);
    if (posted.ok) return;
    assert.equal(posted.error, WATCH_CANNOT_POST);

    const state = await storage.getWorkspaceByToken(room.token);
    const sneak = (state?.messages ?? []).filter((message) => message.authorKey === admitted.seat.memberKey);
    assert.equal(sneak.length, 0);
  });

  it("does not take a call for a refused watch post", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    await postFromSeat(admitted.credential, "Hello.", T0);
    const auth = authenticateSeat(admitted.credential, T0);
    assert.equal(auth.ok && auth.ok ? auth.seat.callsUsed : -1, 0);
  });

  it("lets a seat post after a person moves it to suggest, and marks the post as a draft", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const moved = await setSeatMode(room.token, admitted.seat.id, "suggest", T0);
    assert.equal(moved.ok, true);
    if (!moved.ok) return;
    assert.equal(moved.seat.mode, "suggest");

    const posted = await postFromSeat(admitted.credential, "A suggested change.", T0);
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    assert.equal(posted.message.authorKey, admitted.seat.memberKey);
    assert.equal(posted.message.channelId, room.thread.id);
    assert.match(posted.message.body, /waiting for a person to approve/);
    assert.equal(posted.message.meta?.draft, true);
    assert.equal(posted.seat.callsUsed, 1);
  });

  it("writes an act-mode post into the admitted thread as itself, not as the visitor", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    await setSeatMode(room.token, admitted.seat.id, "act", T0);
    const posted = await postFromSeat(admitted.credential, "Did the short list.", T0);
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    assert.equal(posted.message.authorKind, "agent");
    assert.equal(posted.message.body, "Did the short list.");
    assert.notEqual(posted.message.authorKey, "visitor");
  });
});

describe("its own counter, not an IP", () => {
  it("lets a seat take its day's worth and stops the next one", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { callsPerDay: 3 });
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    await setSeatMode(room.token, admitted.seat.id, "act", T0);
    for (let i = 0; i < 3; i += 1) {
      const posted = await postFromSeat(admitted.credential, `Call ${i + 1}`, T0 + i);
      assert.equal(posted.ok, true, `call ${i + 1} should have been allowed`);
    }

    const refused = await postFromSeat(admitted.credential, "One more", T0 + 3);
    assert.equal(refused.ok, false);
    if (refused.ok) return;
    assert.match(refused.error, /Budget spent — 3 calls today/);

    const state = await storage.getWorkspaceByToken(room.token);
    const notices = (state?.messages ?? []).filter((message) => message.body.includes("Budget spent"));
    assert.equal(notices.length, 1);
    assert.equal(notices[0]?.authorKey, admitted.seat.memberKey);
  });

  it("counts per seat, so one agent's budget cannot silence another", async () => {
    const room = await openRoom();
    const noisy = await admit(room, { displayName: "Noisy", callsPerDay: 1 });
    const quiet = await admit(room, { displayName: "Quiet", callsPerDay: 1 });
    assert.equal(noisy.ok && quiet.ok, true);
    if (!noisy.ok || !quiet.ok) return;

    await setSeatMode(room.token, noisy.seat.id, "act", T0);
    await setSeatMode(room.token, quiet.seat.id, "act", T0);

    assert.equal((await postFromSeat(noisy.credential, "spent", T0)).ok, true);
    assert.equal((await postFromSeat(noisy.credential, "again", T0)).ok, false);
    assert.equal((await postFromSeat(quiet.credential, "still allowed", T0)).ok, true);
  });

  it("resets when the UTC day does, without anyone intervening", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { callsPerDay: 1 });
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;
    await setSeatMode(room.token, admitted.seat.id, "act", T0);

    assert.equal((await postFromSeat(admitted.credential, "today", T0)).ok, true);
    assert.equal((await postFromSeat(admitted.credential, "still today", T0 + 60_000)).ok, false);
    assert.equal((await postFromSeat(admitted.credential, "next day", T0 + DAY + 1)).ok, true);
  });

  it("cannot let two posts arriving together both take the last call, because the claim never awaits", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { callsPerDay: 1 });
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const first = claimSeatCall(admitted.credential, T0);
    const burst = Array.from({ length: 20 }, () => claimSeatCall(admitted.credential, T0));
    assert.equal(first.ok, true);
    assert.equal(burst.filter((claim) => claim.ok).length, 0);
  });

  it("takes a claim with no IP address at all, which is the case a server-initiated turn is in", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { callsPerDay: 2 });
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    // No req, no req.ip, no socket. The counter is the seat.
    const claim = claimSeatCall(admitted.credential, T0);
    assert.equal(claim.ok, true);
    if (!claim.ok) return;
    assert.equal(claim.seat.callsUsed, 1);
  });
});

describe("expiry and revoke", () => {
  it("stops authenticating once the expiry has passed", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { expiresOn: expiryIso(1) });
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    assert.equal(authenticateSeat(admitted.credential, T0).ok, true);
    const later = authenticateSeat(admitted.credential, T0 + DAY + 1);
    assert.equal(later.ok, false);
    if (later.ok) return;
    assert.match(later.error, /expired/i);
    assert.match(later.error, /re-added/);
    assert.doesNotMatch(later.error, /!/);
  });

  it("writes a dated revoke line with a reason into the thread, and then the credential fails", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const revoked = await revokeSeat(
      room.token,
      { seatId: admitted.seat.id, by: PARTY.name, reason: "The trial ended." },
      T0 + 60_000,
    );
    assert.equal(revoked.ok, true);
    if (!revoked.ok) return;
    assert.ok(revoked.seat.revoked);
    assert.equal(revoked.seat.revoked?.reason, "The trial ended.");
    assert.equal(revoked.seat.revoked?.by, PARTY.name);
    assert.match(revoked.message.body, /Revoked/);
    assert.match(revoked.message.body, /The trial ended/);
    assert.match(revoked.message.body, new RegExp(PARTY.name.replace(/[.]/g, "\\.")));
    assert.doesNotMatch(revoked.message.body, /!/);

    const auth = authenticateSeat(admitted.credential, T0 + 60_000);
    assert.equal(auth.ok, false);
    if (auth.ok) return;
    assert.match(auth.error, /Revoked/);
    assert.match(auth.error, /The trial ended/);
  });

  it("looks a seat up by the member key the rail's revoke button actually has", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const found = await seatForMemberInRoom(room.token, admitted.seat.memberKey, T0);
    assert.equal(found?.id, admitted.seat.id);
    assert.equal(await seatForMemberInRoom(room.token, "agent:nobody", T0), null);
  });

  it("refuses a second revoke rather than writing the reason twice", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const first = await revokeSeat(
      room.token,
      { seatId: admitted.seat.id, by: PARTY.name, reason: "The trial ended." },
      T0,
    );
    assert.equal(first.ok, true);

    const second = await revokeSeat(
      room.token,
      { seatId: admitted.seat.id, by: PARTY.name, reason: "Again." },
      T0 + 1,
    );
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.match(second.error, /The trial ended/);
    assert.doesNotMatch(second.error, /Again/);

    const state = await storage.getWorkspaceByToken(room.token);
    const revokeLines = (state?.messages ?? []).filter((message) => message.body.includes("Revoked"));
    assert.equal(revokeLines.length, 1);
  });

  it("refuses a revoke with no reason, because a timestamp alone cannot say why access ended", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const silent = await revokeSeat(room.token, { seatId: admitted.seat.id, by: PARTY.name, reason: "" }, T0);
    assert.equal(silent.ok, false);
    if (silent.ok) return;
    assert.match(silent.error, /reason/);
  });

  it("cannot change mode on a revoked or expired seat", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { expiresOn: expiryIso(1) });
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    await revokeSeat(room.token, { seatId: admitted.seat.id, by: PARTY.name, reason: "Done." }, T0);
    const afterRevoke = await setSeatMode(room.token, admitted.seat.id, "act", T0);
    assert.equal(afterRevoke.ok, false);

    const fresh = await admit(room, { displayName: "Short", expiresOn: expiryIso(1) });
    assert.equal(fresh.ok, true);
    if (!fresh.ok) return;
    const afterExpiry = await setSeatMode(room.token, fresh.seat.id, "act", T0 + DAY + 1);
    assert.equal(afterExpiry.ok, false);
  });
});

describe("an agent replies to an agent only when a person named both in one message", () => {
  it("lets a person summon an agent, whether they named one or none", () => {
    const named = agentsNamedIn("What broke the pixel?", []);
    const none = mayAgentReplyToAgent({
      authorKind: "visitor",
      authorKey: "visitor",
      targetAgentId: "chatgpt-ads",
      namedByPerson: named,
    });
    assert.equal(none.ok, true);

    const one = agentsNamedIn("Please look, @chatgpt-ads", ["agent:chatgpt-ads"]);
    assert.deepEqual(one, ["chatgpt-ads"]);
    const allowed = mayAgentReplyToAgent({
      authorKind: "expert",
      authorKey: PARTY.memberKey,
      targetAgentId: "chatgpt-ads",
      namedByPerson: one,
    });
    assert.equal(allowed.ok, true);
  });

  it("does not let one agent start another agent's reply when the person named only one of them", () => {
    const named = agentsNamedIn("@chatgpt-ads what do you think?", ["chatgpt-ads"]);
    const refused = mayAgentReplyToAgent({
      authorKind: "agent",
      authorKey: "agent:chatgpt-ads",
      targetAgentId: "google-ads",
      namedByPerson: named,
    });
    assert.equal(refused.ok, false);
    if (refused.ok) return;
    assert.equal(
      refused.reason,
      "An agent replies to an agent only when a person named both in one message.",
    );
    assert.doesNotMatch(refused.reason, /!/);
  });

  it("does let the second agent answer when the person named both in that one message", () => {
    const named = agentsNamedIn(
      "@chatgpt-ads @google-ads compare notes on the pixel.",
      ["chatgpt-ads", "google-ads"],
    );
    assert.ok(named.includes("chatgpt-ads") && named.includes("google-ads"));

    const allowed = mayAgentReplyToAgent({
      authorKind: "agent",
      authorKey: "agent:chatgpt-ads",
      targetAgentId: "google-ads",
      namedByPerson: named,
    });
    assert.equal(allowed.ok, true);
  });

  it("does not let an agent reply to itself, even when it was named", () => {
    const named = agentsNamedIn("@chatgpt-ads please continue", ["chatgpt-ads"]);
    const refused = mayAgentReplyToAgent({
      authorKind: "agent",
      authorKey: "agent:chatgpt-ads",
      targetAgentId: "chatgpt-ads",
      namedByPerson: named,
    });
    assert.equal(refused.ok, false);
    if (refused.ok) return;
    assert.match(refused.reason, /itself/);
  });

  it("does not let a system line start an agent reply", () => {
    const refused = mayAgentReplyToAgent({
      authorKind: "system",
      authorKey: "system",
      targetAgentId: "chatgpt-ads",
      namedByPerson: ["chatgpt-ads", "google-ads"],
    });
    assert.equal(refused.ok, false);
  });

  it("names a seat by its handle the same way it names a roster agent", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const extras = [{ handle: admitted.seat.handle, id: `seat:${admitted.seat.id}` }];
    const named = agentsNamedIn(
      `@chatgpt-ads @${admitted.seat.handle} both of you, please.`,
      ["chatgpt-ads", admitted.seat.handle],
      extras,
    );
    assert.ok(named.includes("chatgpt-ads"));
    assert.ok(named.includes(`seat:${admitted.seat.id}`));

    const allowed = mayAgentReplyToAgent({
      authorKind: "agent",
      authorKey: admitted.seat.memberKey,
      targetAgentId: "chatgpt-ads",
      namedByPerson: named,
    });
    assert.equal(allowed.ok, true);
  });

  it("is the same rule when the message route asks in one call", async () => {
    const room = await openRoom();
    const admitted = await admit(room);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    const visitor = mayKickOffFromMessage({
      authorKind: "visitor",
      authorKey: "visitor",
      body: "Carry on.",
      targetAgentId: "chatgpt-ads",
      workspaceId: room.workspaceId,
    });
    assert.equal(visitor.ok, true);

    const loop = mayKickOffFromMessage({
      authorKind: "agent",
      authorKey: admitted.seat.memberKey,
      body: `@chatgpt-ads take this.`,
      mentions: ["chatgpt-ads"],
      targetAgentId: "chatgpt-ads",
      workspaceId: room.workspaceId,
    });
    assert.equal(loop.ok, false);

    const both = mayKickOffFromMessage({
      authorKind: "agent",
      authorKey: admitted.seat.memberKey,
      body: `@chatgpt-ads @${admitted.seat.handle} both of you.`,
      mentions: ["chatgpt-ads", admitted.seat.handle],
      targetAgentId: "chatgpt-ads",
      workspaceId: room.workspaceId,
    });
    assert.equal(both.ok, true);
  });
});

describe("what a visitor would read", () => {
  it("keeps the house voice in every sentence the room or the agent is shown", async () => {
    const room = await openRoom();
    const admitted = await admit(room, { callsPerDay: 1 });
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;

    await setSeatMode(room.token, admitted.seat.id, "act", T0);
    await postFromSeat(admitted.credential, "first", T0);
    await postFromSeat(admitted.credential, "second", T0);
    await revokeSeat(room.token, { seatId: admitted.seat.id, by: PARTY.name, reason: "Finished." }, T0);

    const state = await storage.getWorkspaceByToken(room.token);
    const bodies = (state?.messages ?? []).map((message) => message.body);
    bodies.push(WATCH_CANNOT_POST, ROOM_TOKEN_IS_NOT_A_SEAT);
    for (const body of bodies) {
      assert.ok(!body.includes("!"), `an exclamation mark got into: ${body}`);
    }
  });
});
