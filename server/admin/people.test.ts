/**
 * The people page is the most dangerous page in the repository: it lists
 * room addresses, which are bearer credentials. Authorisation is the whole
 * parcel. These cases are written before the page.
 *
 *   npx tsx --test server/admin/people.test.ts
 */

import { createServer, request as httpRequest, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { ROOM_SESSION_COOKIE, emailProviderId, signInOrAttach } from "../room-account";
import { resetRoomAccountForTests } from "../room-account";
import { putBinding, resetIdentityStoreForTests } from "../identity-store";
import { registerRoomTokenForTests, resetRoomLoginForTests, whatsappProviderId } from "../room-login";
import { bindRoomAddress, emailHashForTests, resetRoomAccessForTests } from "../room-access";
import { listStoredBookings, recordBooking, resetHoldsForTests } from "../booking/hold";
import { storage } from "../storage";
import {
  ADMIN_NOT_OPERATOR_LINE,
  ADMIN_OPERATOR_UNCONFIGURED_LINE,
  ADMIN_UNSIGNED_LINE,
  WHATSAPP_PHONE_NOT_HELD_LINE,
} from "./people";

const OPERATOR_EMAIL = "ada@example.test";
const OTHER_EMAIL = "bea@example.test";
const PEPPER = "people-admin-test-pepper";

let origin = "";
let server: Server | null = null;

async function startApp(): Promise<void> {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
}

before(async () => {
  await startApp();
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

beforeEach(() => {
  resetIdentityStoreForTests();
  resetRoomAccountForTests();
  resetRoomLoginForTests();
  resetRoomAccessForTests();
  resetHoldsForTests();
  process.env.ROOM_HASH_PEPPER = PEPPER;
  process.env.OPERATOR_EMAIL = OPERATOR_EMAIL;
  delete process.env.OPERATOR_LINKEDIN_SUB;
  delete process.env.LEAD_NOTIFY_EMAIL;
});

afterEach(() => {
  resetIdentityStoreForTests();
  resetRoomAccountForTests();
  resetRoomLoginForTests();
  resetRoomAccessForTests();
  resetHoldsForTests();
  delete process.env.ROOM_HASH_PEPPER;
  delete process.env.OPERATOR_EMAIL;
  delete process.env.OPERATOR_LINKEDIN_SUB;
  delete process.env.LEAD_NOTIFY_EMAIL;
});

async function signIn(email: string) {
  const signed = await signInOrAttach({
    identity: {
      provider: "email",
      providerId: emailProviderId(emailHashForTests(email)),
      displayName: email.split("@")[0] ?? "Someone",
    },
  });
  assert.equal(signed.ok, true);
  if (!signed.ok) throw new Error("sign-in failed");
  return signed;
}

async function people(cookie?: string, headers: Record<string, string> = {}) {
  return fetch(`${origin}/api/admin/people`, {
    headers: {
      Accept: "application/json",
      ...(cookie ? { Cookie: `${ROOM_SESSION_COOKIE}=${cookie}` } : {}),
      ...headers,
    },
  });
}

function bodyHasRoomToken(text: string): boolean {
  return /\/w\/|[A-Za-z0-9]{16,}/.test(text) && (text.includes("token") || text.includes("/w/"));
}

describe("authorisation, written before the page", () => {
  it("refuses a request with no session, and does not list anyone", async () => {
    const res = await people();
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error?: string; people?: unknown };
    assert.equal(body.error, ADMIN_UNSIGNED_LINE);
    assert.equal(body.people, undefined);
  });

  it("does not open for a query key, a shared password, or an unlisted path", async () => {
    const res = await fetch(`${origin}/api/admin/people?key=guessed-secret`, {
      headers: { Accept: "application/json" },
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error?: string; people?: unknown };
    assert.equal(body.error, ADMIN_UNSIGNED_LINE);
    assert.equal(body.people, undefined);
  });

  it("refuses a signed-in person who is not the operator, and does not leak a room token", async () => {
    const room = await storage.createWorkspace({ name: "Bea's room", source: { door: "chatgpt-ads" } });
    await bindRoomAddress({
      workspaceId: room.workspace.id,
      workspaceToken: room.token,
      email: OTHER_EMAIL,
    });
    const bea = await signIn(OTHER_EMAIL);

    const res = await people(bea.token);
    assert.equal(res.status, 403);
    const text = await res.text();
    const body = JSON.parse(text) as { error?: string; people?: unknown };
    assert.equal(body.error, ADMIN_NOT_OPERATOR_LINE);
    assert.equal(body.people, undefined);
    assert.equal(text.includes(room.token), false, "a 403 must not contain the room token");
    assert.equal(bodyHasRoomToken(text) && text.includes(room.token), false);
  });

  it("refuses everyone when no operator identity is configured, even if they are signed in", async () => {
    delete process.env.OPERATOR_EMAIL;
    const ada = await signIn(OPERATOR_EMAIL);
    const res = await people(ada.token);
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: string; people?: unknown };
    assert.equal(body.error, ADMIN_OPERATOR_UNCONFIGURED_LINE);
    assert.equal(body.people, undefined);
  });

  it("has no write route — deleting a person is not this parcel", async () => {
    const ada = await signIn(OPERATOR_EMAIL);
    const res = await fetch(`${origin}/api/admin/people`, {
      method: "DELETE",
      headers: {
        Cookie: `${ROOM_SESSION_COOKIE}=${ada.token}`,
        Accept: "application/json",
      },
    });
    assert.equal(res.status, 404);
  });
});

describe("what the operator is allowed to see", () => {
  it("returns an empty list when nobody else has signed in", async () => {
    const ada = await signIn(OPERATOR_EMAIL);
    const res = await people(ada.token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { people: { id: string }[] };
    assert.equal(Array.isArray(body.people), true);
    assert.equal(body.people.length, 1);
    assert.equal(body.people[0]?.id, ada.account.id);
  });

  it("says the phone is not held for a WhatsApp sign-in, rather than leaving a blank", async () => {
    const ada = await signIn(OPERATOR_EMAIL);
    const chatId = "420777000111@s.whatsapp.net";
    const whatsapp = await signInOrAttach({
      identity: {
        provider: "whatsapp",
        providerId: whatsappProviderId(chatId),
        displayName: "Kira",
      },
    });
    assert.equal(whatsapp.ok, true);

    const res = await people(ada.token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      people: {
        displayName: string | null;
        signedInWith: { method: string; contactLine: string }[];
      }[];
    };
    const kira = body.people.find((row) => row.displayName === "Kira");
    assert.ok(kira, "the WhatsApp person must be on the list");
    const way = kira.signedInWith.find((row) => row.method === "whatsapp");
    assert.ok(way);
    assert.equal(way.contactLine, WHATSAPP_PHONE_NOT_HELD_LINE);
    assert.equal(way.contactLine.includes("phone number is not held"), true);
  });

  it("shows a room link, last-opened time, a booking and whether it stands, and white-label status", async () => {
    const ada = await signIn(OPERATOR_EMAIL);
    const room = await storage.createWorkspace({
      name: "Partner conversation",
      source: { door: "white-label" },
    });
    await bindRoomAddress({
      workspaceId: room.workspace.id,
      workspaceToken: room.token,
      email: OTHER_EMAIL,
    });
    registerRoomTokenForTests(room.workspace.id, room.token);
    const bea = await signIn(OTHER_EMAIL);

    recordBooking({
      code: "K7QMX2",
      eventId: "evt_1",
      calendarId: "cal_1",
      date: "2027-01-05",
      time: "09:00",
      startsAt: "2027-01-05T08:00:00.000Z",
      timezone: "Europe/Prague",
      meetUrl: null,
      invited: true,
      email: OTHER_EMAIL,
      chatId: null,
      name: "Bea",
      topic: "google-ads",
      createdAt: Date.now(),
      cancelledAt: null,
    });
    recordBooking({
      code: "P3LMN4",
      eventId: "evt_2",
      calendarId: "cal_1",
      date: "2027-01-06",
      time: "10:00",
      startsAt: "2027-01-06T09:00:00.000Z",
      timezone: "Europe/Prague",
      meetUrl: null,
      invited: false,
      email: OTHER_EMAIL,
      chatId: null,
      name: "Bea",
      topic: "google-ads",
      createdAt: Date.now(),
      cancelledAt: Date.now(),
    });
    assert.ok(listStoredBookings().length >= 2);

    const res = await people(ada.token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      people: {
        id: string;
        rooms: { token: string; name: string; openedAt: string; lastActiveAt: string | null }[];
        bookings: { stands: boolean; topic: string }[];
        whiteLabelPartner: boolean;
        whiteLabelLine: string;
        orders: unknown[];
        tasks: unknown[];
      }[];
    };
    const person = body.people.find((row) => row.id === bea.account.id);
    assert.ok(person);
    assert.equal(person.rooms.some((row) => row.token === room.token), true);
    assert.equal(person.rooms[0]?.name, "Partner conversation");
    assert.ok(person.rooms[0]?.openedAt);
    assert.equal(person.whiteLabelPartner, true);
    assert.match(person.whiteLabelLine, /white-label door/);
    assert.equal(person.bookings.length, 2);
    assert.equal(person.bookings.some((row) => row.stands), true);
    assert.equal(person.bookings.some((row) => row.stands === false), true);
    assert.deepEqual(person.orders, []);
    assert.deepEqual(person.tasks, []);
  });

  it("does not offer WhatsApp contact fields on a fork host", async () => {
    const ada = await signIn(OPERATOR_EMAIL);
    const res = await new Promise<{ status: number; body: { offeredSignIn: { whatsapp: boolean }; house: boolean } }>(
      (resolve, reject) => {
        const req = httpRequest(
          `${origin}/api/admin/people`,
          {
            method: "GET",
            headers: {
              Host: "agency.example",
              Accept: "application/json",
              Cookie: `${ROOM_SESSION_COOKIE}=${ada.token}`,
            },
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on("data", (chunk) => chunks.push(chunk as Buffer));
            incoming.on("end", () => {
              resolve({
                status: incoming.statusCode ?? 0,
                body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
              });
            });
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.house, false);
    assert.equal(res.body.offeredSignIn.whatsapp, false);
  });
});

describe("a LinkedIn operator identity", () => {
  it("accepts the operator by LinkedIn member id", async () => {
    process.env.OPERATOR_LINKEDIN_SUB = "linkedin:ada-sub";
    delete process.env.OPERATOR_EMAIL;
    const signed = await signInOrAttach({
      identity: { provider: "linkedin", providerId: "linkedin:ada-sub", displayName: "Ada" },
    });
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    await putBinding({
      workspaceId: "ws_unused",
      provider: "linkedin",
      providerId: "linkedin:ada-sub",
      displayName: "Ada",
      boundAt: "2026-09-09T10:00:00.000Z",
    });
    const res = await people(signed.token);
    assert.equal(res.status, 200);
  });
});
