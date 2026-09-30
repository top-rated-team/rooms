/**
 * The email block's live time buttons. Run it with:
 *
 *   npx tsx --test server/booking/slot-image.test.ts
 *
 * What has to stay true: a time taken in the calendar, held by somebody else,
 * or already past is drawn crossed out; a free one is drawn free; when the
 * calendar cannot be asked the answer is "free", never a guess that loses a
 * booking; and the picture is never cached, so a mail client that asks again
 * gets the calendar as it is then.
 */

import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { GOOGLE_CALENDAR_API, GOOGLE_FREEBUSY_URL, GOOGLE_TOKEN_URL, resetGcalForTests } from "./gcal";
import { placeHold, resetHoldsForTests } from "./hold";
import { liveSlotState, resetSlotImagesForTests, slotImage, slotImageTime } from "./slot-image";
import { resetSlotsCacheForTests } from "./slots";

const CALENDAR_ID = "dan@top-rated.team";
const TZ = "Europe/Bratislava";
const NOW = new Date("2026-09-09T06:00:00.000Z");
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const PICTURES = path.resolve(process.cwd(), "client", "public", "booking-slots");

let busy: { start: string; end: string }[] = [];
let reachable = true;
const realFetch = globalThis.fetch;

const fakeGoogle: typeof fetch = async (input, init) => {
  const url = String(input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (!reachable) return json({ error: "down" }, 503);
  if (url === GOOGLE_TOKEN_URL) return json({ access_token: "t", expires_in: 3600 });
  if (url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) return json({ id: CALENDAR_ID, timeZone: TZ });
  if (url === GOOGLE_FREEBUSY_URL && init?.method === "POST") return json({ calendars: { [CALENDAR_ID]: { busy } } });
  return json({}, 404);
};

function reset(): void {
  globalThis.fetch = realFetch;
  busy = [];
  reachable = true;
  resetSlotsCacheForTests();
  resetGcalForTests();
  resetHoldsForTests();
  resetSlotImagesForTests();
}

beforeEach(() => {
  reset();
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: "service_account",
    client_email: "sa@test.iam.gserviceaccount.com",
    private_key: privateKey,
  });
  process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
});

afterEach(() => {
  reset();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
});

describe("liveSlotState", () => {
  const opts = { fetchImpl: fakeGoogle, now: NOW };

  it("draws a free time free, and one busy in the calendar crossed out", async () => {
    busy = [{ start: "2026-09-10T08:30:00.000Z", end: "2026-09-10T09:00:00.000Z" }];
    assert.equal(await liveSlotState("2026-09-10", "11:00", opts), "free");
    assert.equal(await liveSlotState("2026-09-10", "10:30", opts), "taken", "10:30 in Bratislava is 08:30Z");
  });

  it("crosses out a time somebody is part-way through booking, and a time already past", async () => {
    placeHold({ date: "2026-09-10", time: "14:00", name: "Bea", topic: "call", timezone: TZ, startsAt: "2026-09-10T12:00:00.000Z" }, NOW.getTime());
    assert.equal(await liveSlotState("2026-09-10", "14:00", opts), "taken");
    assert.equal(await liveSlotState("2026-09-08", "14:00", opts), "taken", "yesterday");
    assert.equal(await liveSlotState("2026-09-12", "10:00", opts), "taken", "a Saturday has no working hours");
  });

  it("says free when the calendar cannot be asked, since the click is checked again", async () => {
    reachable = false;
    assert.equal(await liveSlotState("2026-09-10", "10:30", opts), "free");
  });
});

describe("the pictures", () => {
  it("exist for every half-hour, free and taken, and are PNG", () => {
    for (const time of ["00:00", "09:00", "10:30", "16:30", "23:30"]) {
      for (const state of ["free", "taken"] as const) {
        const image = slotImage(time, state);
        assert.ok(image, `${time} ${state}`);
        assert.equal(image!.subarray(1, 4).toString("ascii"), "PNG");
      }
    }
    assert.equal(slotImage("10:15", "free"), null);
  });

  it("are named by the time they show", () => {
    assert.equal(slotImageTime("1030.png"), "10:30");
    for (const file of ["2530.png", "1030.jpg", "../1030.png", "10:30.png"]) assert.equal(slotImageTime(file), null, file);
  });
});

describe("GET /api/booking/slot/<date>/<HHMM>.png", () => {
  let origin = "";
  let server: Server | undefined;

  before(async () => {
    const { registerRoutes } = await import("../routes");
    const app = express();
    registerRoutes(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  function get(pathname: string): Promise<{ status: number; type: string | undefined; cache: string | undefined; body: Buffer }> {
    const url = new URL(pathname, origin);
    return new Promise((resolve, reject) => {
      const req = httpRequest({ hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, headers: { host: "top-rated.team" } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            type: res.headers["content-type"],
            cache: res.headers["cache-control"],
            body: Buffer.concat(chunks),
          }),
        );
      });
      req.on("error", reject);
      req.end();
    });
  }

  it("sends the picture for the calendar as it is now, and never lets it be cached", async () => {
    globalThis.fetch = fakeGoogle;
    /* A date well inside the next two weeks, whatever today is. */
    const day = new Date(Date.now() + 7 * 86_400_000);
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);

    const free = await get(`/api/booking/slot/${date}/1030.png`);
    assert.equal(free.status, 200);
    assert.equal(free.type, "image/png");
    assert.match(free.cache ?? "", /no-store/);
    assert.deepEqual(free.body, fs.readFileSync(path.join(PICTURES, "1030-free.png")));

    /* Somebody books 10:30 in the owner's calendar; the next open shows it taken. */
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
    const start = new Date(`${date}T10:30:00${offset}`);
    busy = [{ start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() }];
    resetSlotsCacheForTests();
    const taken = await get(`/api/booking/slot/${date}/1030.png`);
    assert.deepEqual(taken.body, fs.readFileSync(path.join(PICTURES, "1030-taken.png")));
  });

  it("draws the reader's own time when the block was made for another zone, crossed out as the calendar slot is", async () => {
    globalThis.fetch = fakeGoogle;
    busy = [];
    resetSlotsCacheForTests();
    const day = new Date(Date.now() + 7 * 86_400_000);
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    const free = await get(`/api/booking/slot/${date}/1030.png?label=0430`);
    assert.equal(free.status, 200);
    assert.deepEqual(free.body, fs.readFileSync(path.join(PICTURES, "0430-free.png")));

    const offset = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
    const start = new Date(`${date}T10:30:00${offset}`);
    busy = [{ start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() }];
    resetSlotsCacheForTests();
    const taken = await get(`/api/booking/slot/${date}/1030.png?label=0430`);
    assert.deepEqual(taken.body, fs.readFileSync(path.join(PICTURES, "0430-taken.png")));
    for (const bad of ["0415", "abc", "2530"]) {
      assert.equal((await get(`/api/booking/slot/${date}/1030.png?label=${bad}`)).status, 404, bad);
    }
  });

  it("answers 404 for anything that is not a time's picture", async () => {
    for (const bad of ["/api/booking/slot/2026-02-31/1030.png", "/api/booking/slot/2026-09-10/1015.png", "/api/booking/slot/2026-09-10/abc.png"]) {
      assert.equal((await get(bad)).status, 404, bad);
    }
  });
});
