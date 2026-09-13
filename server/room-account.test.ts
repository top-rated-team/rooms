/**
 * An account, a session, and the merge that must refuse. Run it with:
 *
 *   npx tsx --test server/room-account.test.ts
 *
 * The merge is the dangerous operation. Write that branch first.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { attachIdentity, createAccount, resetIdentityStoreForTests } from "./identity-store";
import {
  ROOM_SESSION_COOKIE,
  ROOM_SESSION_MAX_AGE_MS,
  emailProviderId,
  ROOM_SESSION_YEARS,
  cookieValue,
  endSession,
  hashSessionToken,
  claimLinkedInSession,
  putLinkedInTicket,
  readSessionAccount,
  resetRoomAccountForTests,
  roomSessionOutcomeLine,
  roomSessionOutcomePath,
  sessionCookieOptions,
  signInOrAttach,
  takeLinkedInTicket,
  whoAmI,
} from "./room-account";
import { registerRoomTokenForTests, resetRoomLoginForTests } from "./room-login";
import {
  bindRoomAddress,
  emailHashForTests,
  resetRoomAccessForTests,
} from "./room-access";
import { putBinding } from "./identity-store";
import { ROOM_SESSION_REFUSED_LINE } from "@shared/api";

beforeEach(() => {
  resetIdentityStoreForTests();
  resetRoomAccountForTests();
  resetRoomLoginForTests();
  resetRoomAccessForTests();
  process.env.ROOM_HASH_PEPPER = "room-account-test-pepper";
});

afterEach(() => {
  resetIdentityStoreForTests();
  resetRoomAccountForTests();
  resetRoomLoginForTests();
  resetRoomAccessForTests();
  delete process.env.ROOM_HASH_PEPPER;
});

describe("attaching a second identity that already belongs to another account", () => {
  it("refuses rather than joining the two accounts", async () => {
    const bea = await createAccount({ id: "acct_bea", displayName: "Bea" });
    const attached = await attachIdentity({
      provider: "linkedin",
      providerId: "linkedin:bea",
      accountId: bea.id,
    });
    assert.equal(attached.ok, true);

    const adaSession = await signInOrAttach({
      identity: { provider: "email", providerId: "email:ada", displayName: "Ada" },
    });
    assert.equal(adaSession.ok, true);
    if (!adaSession.ok) return;

    const merge = await signInOrAttach({
      identity: { provider: "linkedin", providerId: "linkedin:bea", displayName: "Bea" },
      cookieHeader: `${ROOM_SESSION_COOKIE}=${adaSession.token}`,
    });

    assert.equal(merge.ok, false);
    if (merge.ok) return;
    assert.equal(merge.reason, "belongs-to-other-account");
    assert.equal(merge.line, ROOM_SESSION_REFUSED_LINE);

    const ada = await readSessionAccount(`${ROOM_SESSION_COOKIE}=${adaSession.token}`);
    assert.equal(ada?.id, adaSession.account.id);
    const stillBea = await attachIdentity({
      provider: "linkedin",
      providerId: "linkedin:bea",
      accountId: adaSession.account.id,
    });
    assert.equal(stillBea.ok, false);
    if (stillBea.ok) return;
    assert.equal(stillBea.accountId, bea.id);
  });
});

describe("signInOrAttach", () => {
  it("creates an account the first time, and signs back into it the next", async () => {
    const first = await signInOrAttach({
      identity: { provider: "linkedin", providerId: "linkedin:ada", displayName: "Ada" },
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.kind, "created");

    const again = await signInOrAttach({
      identity: { provider: "linkedin", providerId: "linkedin:ada" },
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.kind, "signed-in");
    assert.equal(again.account.id, first.account.id);
    assert.notEqual(again.token, first.token);
  });

  it("attaches a free identity to the signed-in account", async () => {
    const email = await signInOrAttach({
      identity: { provider: "email", providerId: "email:ada", displayName: "Ada" },
    });
    assert.equal(email.ok, true);
    if (!email.ok) return;

    const linkedin = await signInOrAttach({
      identity: { provider: "linkedin", providerId: "linkedin:ada" },
      cookieHeader: `${ROOM_SESSION_COOKIE}=${email.token}`,
    });
    assert.equal(linkedin.ok, true);
    if (!linkedin.ok) return;
    assert.equal(linkedin.kind, "attached");
    assert.equal(linkedin.account.id, email.account.id);

    const me = await whoAmI(`${ROOM_SESSION_COOKIE}=${linkedin.token}`);
    assert.equal(me.signedIn, true);
    if (!me.signedIn) return;
    assert.equal(me.attached.email, true);
    assert.equal(me.attached.linkedin, true);
  });
});

describe("the third way in", () => {
  it("signs somebody in by the address a mailed link proved, and finds that address's rooms", async () => {
    /* An address binds a room in room-access, under its own key, which is why
       whoAmI has to look there as well as in identity-store. Skipping it left
       somebody signed in by email with an empty list of rooms and no reason
       given. */
    await bindRoomAddress({
      workspaceId: "ws_mailed",
      workspaceToken: "tok_mailed",
      email: "Ada@Example.test",
    });

    const signed = await signInOrAttach({
      identity: { provider: "email", providerId: emailProviderId(emailHashForTests("ada@example.test")) },
    });
    assert.equal(signed.ok, true);
    if (!signed.ok) return;

    const me = await whoAmI(`${ROOM_SESSION_COOKIE}=${signed.token}`);
    assert.equal(me.signedIn, true);
    if (!me.signedIn) return;
    assert.equal(me.attached.email, true);
    assert.deepEqual(me.rooms, [{ token: "tok_mailed" }]);
  });
});

describe("the session cookie", () => {
  it("is HttpOnly, SameSite, Secure in production, and measured in years", () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const options = sessionCookieOptions();
    process.env.NODE_ENV = was;
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.secure, true);
    assert.equal(options.path, "/");
    assert.equal(ROOM_SESSION_YEARS >= 10, true);
    assert.equal(options.maxAge, ROOM_SESSION_MAX_AGE_MS);
    assert.equal(options.maxAge > 24 * 60 * 60 * 1000, true);
  });

  it("reads the named cookie and no other", () => {
    assert.equal(cookieValue("a=1; room_session=abc; b=2", ROOM_SESSION_COOKIE), "abc");
    assert.equal(cookieValue("a=1", ROOM_SESSION_COOKIE), null);
  });

  it("hashes two tokens to different values, and the same token to itself", () => {
    const a = hashSessionToken("one-token");
    const b = hashSessionToken("other-token");
    assert.notEqual(a, b);
    assert.equal(hashSessionToken("one-token"), a);
    assert.equal(a.includes("one-token"), false);
  });
});

describe("whoAmI and sign-out", () => {
  it("answers from the server session, and sign-out ends only that", async () => {
    await putBinding({
      workspaceId: "ws_ada",
      provider: "linkedin",
      providerId: "linkedin:ada",
      displayName: "Ada",
      boundAt: "2026-09-09T10:00:00.000Z",
    });
    registerRoomTokenForTests("ws_ada", "roomTokenAda");

    const signed = await signInOrAttach({
      identity: { provider: "linkedin", providerId: "linkedin:ada", displayName: "Ada" },
    });
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    const header = `${ROOM_SESSION_COOKIE}=${signed.token}`;

    const me = await whoAmI(header);
    assert.equal(me.signedIn, true);
    if (!me.signedIn) return;
    assert.equal(me.displayName, "Ada");
    assert.deepEqual(me.rooms, [{ token: "roomTokenAda" }]);

    await endSession(header);
    assert.deepEqual(await whoAmI(header), { signedIn: false });
    assert.deepEqual(await whoAmI(undefined), { signedIn: false });
  });
});

describe("claimLinkedInSession", () => {
  it("refuses a ticket whose LinkedIn identity already belongs to another account", async () => {
    const bea = await signInOrAttach({
      identity: { provider: "linkedin", providerId: "linkedin:bea", displayName: "Bea" },
    });
    assert.equal(bea.ok, true);
    if (!bea.ok) return;

    const ada = await signInOrAttach({
      identity: { provider: "email", providerId: "email:ada", displayName: "Ada" },
    });
    assert.equal(ada.ok, true);
    if (!ada.ok) return;

    const ticket = putLinkedInTicket({
      ok: true,
      outcome: "signed-in",
      rooms: [],
      identity: { provider: "linkedin", providerId: "linkedin:bea", displayName: "Bea" },
    });
    const claimed = await claimLinkedInSession({
      ticket,
      cookieHeader: `${ROOM_SESSION_COOKIE}=${ada.token}`,
    });
    assert.match(claimed.location, /signin_outcome=refused/);
    assert.equal(claimed.token, undefined);
    const stillAda = await readSessionAccount(`${ROOM_SESSION_COOKIE}=${ada.token}`);
    assert.equal(stillAda?.id, ada.account.id);
  });
});

describe("LinkedIn callback tickets", () => {
  it("hands a finish over once, then forgets it", () => {
    const id = putLinkedInTicket({
      ok: false,
      outcome: "missing-state",
    });
    assert.deepEqual(takeLinkedInTicket(id), { ok: false, outcome: "missing-state" });
    assert.equal(takeLinkedInTicket(id), undefined);
  });

  it("names each failed sign-in as that failure, not as a missing room", () => {
    assert.match(roomSessionOutcomeLine("missing-state"), /no state/);
    assert.match(roomSessionOutcomeLine("missing-pending"), /not one we started/);
    assert.match(roomSessionOutcomeLine("linkedin-error"), /error/);
    assert.match(roomSessionOutcomeLine("token-failed"), /did not complete/);
    assert.match(roomSessionOutcomeLine("no-room"), /No room is bound/);
    assert.equal(roomSessionOutcomePath("no-room").startsWith("/?"), true);
    assert.match(roomSessionOutcomePath("no-room"), /signin_outcome=no-room/);
  });
});
