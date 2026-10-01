/**
 * The email block worked out when it is opened. Run it with:
 *
 *   npx tsx --test server/booking/live-block.test.ts
 *
 * What has to stay true: row N is the Nth upcoming day with a free time among
 * the block's own times, skipping weekends and days already full; each
 * heading is the reader's own date; each time is drawn on the reader's clock,
 * free or taken as the calendar stands; a click lands on that time to be
 * booked with one press, never booked by the click alone.
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
import { resetHoldsForTests } from "./hold";
import { liveColumns, liveDay, livePicture, liveTarget } from "./live-block";
import { resetSlotImagesForTests } from "./slot-image";
import { resetSlotsCacheForTests } from "./slots";

const CALENDAR_ID = "dan@top-rated.team";
/* A Wednesday, 08:00 in Prague. */
const NOW = new Date("2026-09-09T06:00:00.000Z");
const DAYS = path.resolve(process.cwd(), "client", "public", "booking-days");
const SLOTS = path.resolve(process.cwd(), "client", "public", "booking-slots");
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

let busy: { start: string; end: string }[] = [];
let reachable = true;
const realFetch = globalThis.fetch;
const fakeGoogle: typeof fetch = async (input, init) => {
  const url = String(input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (!reachable) return json({ error: "down" }, 503);
  if (url === GOOGLE_TOKEN_URL) return json({ access_token: "t", expires_in: 3600 });
  if (url === `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}`) return json({ id: CALENDAR_ID, timeZone: "Europe/Prague" });
  if (url === GOOGLE_FREEBUSY_URL && init?.method === "POST") return json({ calendars: { [CALENDAR_ID]: { busy } } });
  return json({}, 404);
};
const opts = { fetchImpl: fakeGoogle, now: NOW };
const picture = (dir: string, file: string) => fs.readFileSync(path.join(dir, file));

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
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: "service_account", client_email: "sa@test.iam.gserviceaccount.com", private_key: privateKey });
  process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID;
});
afterEach(() => {
  reset();
  delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_CALENDAR_ID;
});

describe("liveColumns", () => {
  it("reads the block's times, keeping only times of the working day", () => {
    assert.deepEqual(liveColumns("1300,1000,0900,1015,2330,1000"), ["10:00", "13:00"]);
  });
});

describe("liveDay", () => {
  it("counts the upcoming days that have a free time among the block's, weekends left out", async () => {
    const columns = ["10:00", "13:00"];
    assert.equal(await liveDay(0, columns, opts), "2026-09-09");
    assert.equal(await liveDay(2, columns, opts), "2026-09-11");
    assert.equal(await liveDay(3, columns, opts), "2026-09-14", "Friday, then Monday");
  });

  it("passes over a day already full at the block's times", async () => {
    /* 10:00 and 13:00 in Prague on the 9th. */
    busy = [
      { start: "2026-09-09T08:00:00.000Z", end: "2026-09-09T08:30:00.000Z" },
      { start: "2026-09-09T11:00:00.000Z", end: "2026-09-09T11:30:00.000Z" },
    ];
    assert.equal(await liveDay(0, ["10:00", "13:00"], opts), "2026-09-10");
    assert.equal(await liveDay(0, ["10:00", "13:00", "16:00"], opts), "2026-09-09", "a day with one of them still free stays");
  });

  it("knows no day when the calendar cannot be read", async () => {
    reachable = false;
    assert.equal(await liveDay(0, ["10:00"], opts), null);
  });
});

describe("livePicture", () => {
  it("heads a row with the reader's own weekday and date", async () => {
    const columns = ["10:00", "19:30"];
    assert.deepEqual(await livePicture({ row: 0, file: "weekday.png", columns, readerZone: "Europe/Prague", opts }), picture(DAYS, "wd-3.png"));
    assert.deepEqual(await livePicture({ row: 0, file: "date.png", columns, readerZone: "Europe/Prague", opts }), picture(DAYS, "dm-9-9.png"));
    /* 19:30 in Prague is 02:30 the next morning in Tokyo: the reader's Thursday the 10th. */
    const late = ["19:30"];
    assert.deepEqual(await livePicture({ row: 0, file: "weekday.png", columns: late, readerZone: "Asia/Tokyo", opts }), picture(DAYS, "wd-4.png"));
    assert.deepEqual(await livePicture({ row: 0, file: "date.png", columns: late, readerZone: "Asia/Tokyo", opts }), picture(DAYS, "dm-10-9.png"));
  });

  it("draws each time on the reader's clock, free or taken as the calendar stands", async () => {
    const columns = ["10:00", "13:00"];
    assert.deepEqual(await livePicture({ row: 0, file: "1000.png", columns, readerZone: "America/New_York", opts }), picture(SLOTS, "0400-free.png"));
    busy = [{ start: "2026-09-09T11:00:00.000Z", end: "2026-09-09T11:30:00.000Z" }];
    resetSlotsCacheForTests();
    assert.deepEqual(await livePicture({ row: 0, file: "1300.png", columns, readerZone: "Europe/Prague", opts }), picture(SLOTS, "1300-taken.png"));
    assert.equal(await livePicture({ row: 0, file: "1630.png", columns, readerZone: "Europe/Prague", opts }), null, "not one of the block's times");
  });
});

describe("liveTarget", () => {
  it("lands on the time when it is free, on its day when it has gone, and on the picker when nothing can be read", async () => {
    const columns = ["10:00", "13:00"];
    assert.deepEqual(await liveTarget({ row: 1, time: "13:00", columns, opts }), { date: "2026-09-10", time: "13:00" });
    busy = [{ start: "2026-09-10T11:00:00.000Z", end: "2026-09-10T11:30:00.000Z" }];
    resetSlotsCacheForTests();
    assert.deepEqual(await liveTarget({ row: 1, time: "13:00", columns, opts }), { date: "2026-09-10" });
    reachable = false;
    resetSlotsCacheForTests();
    assert.deepEqual(await liveTarget({ row: 1, time: "13:00", columns, opts }), {});
  });
});

describe("GET /book/live", () => {
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

  it("opens the popup on the day the row stands for now, address and signature passed on, never booked at once", async () => {
    globalThis.fetch = fakeGoogle;
    const sig = "AbCdEfGhIjKlMnOpQrStUv";
    const location = await new Promise<string>((resolve, reject) => {
      const url = new URL(`/book/live?r=0&t=1000&c=1000,1300,1630,1930&confirm=email&email=ada%40example.com&guests=bea%40example.com&sig=${sig}&instant=1`, origin);
      const req = httpRequest({ hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, headers: { host: "top-rated.team" } }, (res) => {
        res.resume();
        resolve(String(res.headers.location ?? ""));
      });
      req.on("error", reject);
      req.end();
    });
    assert.match(location, /^\/#book&email=ada%40example\.com&guests=bea%40example\.com&sig=AbCdEfGhIjKlMnOpQrStUv&date=\d{4}-\d{2}-\d{2}/);
    assert.match(location, /&confirm=email/);
    assert.doesNotMatch(location, /instant/, "a live time is booked on the page, with one press");
  });
});
