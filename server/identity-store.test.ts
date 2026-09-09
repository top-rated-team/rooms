/**
 * Room identity store. Run it with:
 *
 *   npx tsx --test server/identity-store.test.ts
 *
 * The first binding on a room is its owner. A later write does not replace it.
 * A typed WhatsApp number is a note, stored apart from a binding. Without a
 * database the rows live in memory.
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { storage } from "./storage";
import {
  getBinding,
  getWhatsappNote,
  listBindingsByPerson,
  putBinding,
  putWhatsappNote,
  resetIdentityStoreForTests,
} from "./identity-store";

beforeEach(() => {
  resetIdentityStoreForTests();
});

describe("putBinding", () => {
  it("keeps the first row as the owner", async () => {
    const first = await putBinding({
      workspaceId: "ws_a",
      provider: "linkedin",
      providerId: "linkedin:ada",
      displayName: "Ada",
      boundAt: "2026-09-09T10:00:00.000Z",
    });
    const second = await putBinding({
      workspaceId: "ws_a",
      provider: "whatsapp",
      providerId: "whatsapp:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      displayName: "Other",
      boundAt: "2026-09-09T11:00:00.000Z",
    });
    assert.equal(second.provider, "linkedin");
    assert.equal(second.providerId, "linkedin:ada");
    assert.equal(second.displayName, "Ada");
    assert.equal(getBinding("ws_a")?.providerId, first.providerId);
    const dumped = JSON.stringify(getBinding("ws_a"));
    assert.equal(dumped.includes("phone"), false);
    assert.equal(dumped.includes("token"), false);
  });
});

describe("listBindingsByPerson", () => {
  it("answers the reverse of getBinding: given this person, which rooms are theirs", async () => {
    await putBinding({
      workspaceId: "ws_a",
      provider: "linkedin",
      providerId: "linkedin:ada",
      displayName: "Ada",
      boundAt: "2026-09-09T10:00:00.000Z",
    });
    await putBinding({
      workspaceId: "ws_b",
      provider: "linkedin",
      providerId: "linkedin:ada",
      displayName: "Ada",
      boundAt: "2026-09-09T11:00:00.000Z",
    });
    await putBinding({
      workspaceId: "ws_c",
      provider: "whatsapp",
      providerId: "whatsapp:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      displayName: "Ada",
      boundAt: "2026-09-09T12:00:00.000Z",
    });

    const rooms = await listBindingsByPerson("linkedin", "linkedin:ada");
    assert.deepEqual(
      rooms.map((row) => row.workspaceId).sort(),
      ["ws_a", "ws_b"],
    );
    assert.equal(
      (await listBindingsByPerson("linkedin", "linkedin:nobody")).length,
      0,
    );
    const dumped = JSON.stringify(rooms);
    assert.equal(dumped.includes("phone"), false);
    assert.equal(dumped.includes("token"), false);
  });
});

describe("a typed WhatsApp number", () => {
  it("is stored as a note and is not a binding", async () => {
    await putWhatsappNote({
      workspaceId: "ws_a",
      number: "+420774654822",
      addedAt: "2026-09-09T10:00:00.000Z",
    });
    assert.equal(getBinding("ws_a"), undefined);
    assert.equal(getWhatsappNote("ws_a")?.number, "+420774654822");
  });
});

describe("renameWorkspace", () => {
  it("updates the name on both the write and the next read", async () => {
    const created = await storage.createWorkspace({ name: "A room of your own" });
    const renamed = await storage.renameWorkspace(created.workspace.id, "Ada's grant room");
    assert.equal(renamed?.name, "Ada's grant room");
    const loaded = await storage.getWorkspaceByToken(created.token);
    assert.equal(loaded?.workspace.name, "Ada's grant room");
  });
});
