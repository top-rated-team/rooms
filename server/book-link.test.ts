/**
 * /book, the old site's booking address. Run it with:
 *
 *   npx tsx --test server/book-link.test.ts
 *
 * What has to stay true: /book lands on the front page with the popup's
 * fragment, the address a link carries moves from the query into that
 * fragment, the answer is never cached, and adgrant.ai is left alone.
 * shared/booking-link.test.ts holds the parsing cases.
 */

import { createServer, request as httpRequest, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

type Answer = { status: number; location: string | null; cacheControl: string | null };

/* fetch() refuses the Host header, and the AdGrant case needs one. */
function get(origin: string, pathname: string, host?: string): Promise<Answer> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: pathname,
        method: "GET",
        headers: { accept: "text/html", ...(host ? { host } : {}) },
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode ?? 0,
          location: res.headers.location ?? null,
          cacheControl: (res.headers["cache-control"] as string | undefined) ?? null,
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("GET /book", () => {
  let origin = "";
  let server: Server | undefined;

  before(async () => {
    const { registerRoutes } = await import("./routes");
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

  it("serves a bare /book as the page itself, so /book# keeps the mark a redirect would drop", async () => {
    for (const pathname of ["/book", "/book/", "/Book", "/book?"]) {
      const answer = await get(origin, pathname);
      /* No hop: it falls through to the page (the static catch-all, absent
         here), which opens the popup (client/src/lib/operator-shortcut.ts). */
      assert.notEqual(answer.status, 302, pathname);
      assert.ok(!answer.location, pathname);
      assert.equal(answer.cacheControl, "no-store", pathname);
    }
  });

  it("tells a browser that is not signed in that it is not the operator, and logs nothing", async () => {
    const warned: unknown[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args);
    try {
      const res = await fetch(`${origin}/api/admin/operator`, { headers: { host: "top-rated.team" } });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { operator: false });
      assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    } finally {
      console.warn = warn;
    }
    assert.equal(warned.length, 0);
  });

  it("moves the address from the query into the fragment, in both shapes", async () => {
    assert.equal((await get(origin, "/book?email=someone@example.com")).location, "/#book&email=someone%40example.com");
    assert.equal((await get(origin, "/book?someone@example.com")).location, "/#book&email=someone%40example.com");
    assert.equal(
      (await get(origin, "/book?dan+ads%40example.com&utm_source=newsletter")).location,
      "/?utm_source=newsletter#book&email=dan%2Bads%40example.com",
    );
  });

  it("carries a time picked in an email, and that it is confirmed by email", async () => {
    assert.equal(
      (await get(origin, "/book?date=2026-10-02&time=09:30&confirm=email&email=someone@example.com")).location,
      "/#book&email=someone%40example.com&date=2026-10-02&time=09:30&confirm=email",
    );
  });

  it("hops the emailed confirmation link into the popup, which asks before anything is booked", async () => {
    const token = "Ab3_-".repeat(9);
    const answer = await get(origin, `/book/confirm/${token}`);
    assert.equal(answer.status, 302);
    assert.equal(answer.location, `/#book&confirm=email&confirmation=${token}`);
    assert.equal(answer.cacheControl, "no-store");
    assert.equal((await get(origin, "/book/confirm/short")).location, "/#book&confirm=email", "a token it cannot read is not passed on");
  });

  it("keeps the widget maker to the person who runs the deployment", async () => {
    const answer = await get(origin, "/api/admin/booking-widget");
    assert.equal(answer.status, 401);
  });

  it("is not answered on adgrant.ai, whose site has no booking popup", async () => {
    const answer = await get(origin, "/book?email=someone@example.com", "adgrant.ai");
    assert.notEqual(answer.status, 302);
    assert.equal(answer.location, null);
  });
});
