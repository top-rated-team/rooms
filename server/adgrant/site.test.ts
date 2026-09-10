/**
 * One process, two sites. Run it with:
 *
 *   npx tsx --test server/adgrant/site.test.ts
 *
 * robots.txt and sitemap.xml are files on disk for top-rated.team and routes
 * for adgrant.ai, and the branch between them is a Host header. That is the
 * kind of thing nobody notices is broken until a crawler has spent a week
 * indexing the wrong host, so it is pinned here rather than eyeballed once.
 *
 * The AdGrant sitemap is generated from the same PAGES the pages render, so
 * these tests also fail if a page is added and the index is not — which is
 * the exact drift that made the hand-written client/public/sitemap.xml stale.
 */

import { createServer, request as httpRequest, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import express from "express";

import { PAGES } from "@shared/adgrant";
import { ADGRANT_HOSTS, ADGRANT_ORIGIN, adgrantMountFor, isAdGrantHost } from "@shared/adgrant-site";
import { adgrantRobotsTxt, adgrantSitemapXml, adgrantUrls } from "./site";

let origin = "";
let server: Server | null = null;

/**
 * node:http and not fetch. fetch() refuses to set a Host header — it is on
 * the forbidden list — so a test that needs Express to believe it is being
 * asked as adgrant.ai has to speak HTTP itself. server/operator.test.ts
 * learned this the same way.
 */
function asHost(path: string, host: string): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const { port } = server!.address() as AddressInfo;
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET", headers: { Host: host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

before(async () => {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
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

describe("which site am I", () => {
  it("mounts at the root on its own hosts and under /adgrant everywhere else", () => {
    for (const host of ADGRANT_HOSTS) {
      assert.equal(adgrantMountFor(host), "");
      assert.equal(isAdGrantHost(host), true);
      /* A port must not change the answer: a preview on adgrant.ai:4173 is
         still adgrant.ai. */
      assert.equal(adgrantMountFor(`${host}:4173`), "");
      assert.equal(adgrantMountFor(host.toUpperCase()), "");
    }
    for (const host of ["top-rated.team", "www.top-rated.team", "localhost", "agency.example", undefined]) {
      assert.equal(adgrantMountFor(host), "/adgrant", `${host} should not be AdGrant`);
    }
    /* A lookalike is not us. */
    assert.equal(isAdGrantHost("adgrant.ai.evil.example"), false);
    assert.equal(isAdGrantHost("notadgrant.ai"), false);
  });
});

describe("the generated sitemap", () => {
  it("lists the home, every section and every page, and nothing else", () => {
    const urls = adgrantUrls();
    assert.equal(new Set(urls).size, urls.length, "an address is listed twice");
    assert.ok(urls.includes(`${ADGRANT_ORIGIN}/`));
    for (const page of PAGES) {
      const slug = page.slug.split("/").map(encodeURIComponent).join("/");
      assert.ok(
        urls.includes(`${ADGRANT_ORIGIN}/${page.category}/${slug}`),
        `${page.category}/${page.slug} is not in the sitemap`,
      );
    }
    assert.equal(urls.length, 1 + 5 + PAGES.length, "the sitemap is not home + five sections + every page");
  });

  it("encodes a nested slug segment by segment, keeping the separator a separator", () => {
    /* A nonprofits slug is animal-shelters/houston. encodeURIComponent on the
       whole thing would publish %2F and an address that does not exist. */
    const nested = PAGES.filter((page) => page.slug.includes("/"));
    assert.ok(nested.length > 0, "expected at least one nested slug to guard");
    const xml = adgrantSitemapXml();
    for (const page of nested) {
      assert.ok(xml.includes(`${ADGRANT_ORIGIN}/${page.category}/${page.slug}</loc>`), page.slug);
    }
    assert.ok(!xml.includes("%2F"), "a separator was encoded away");
  });

  it("is well formed and points only at its own host", () => {
    const xml = adgrantSitemapXml();
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.ok(!xml.includes("top-rated.team"), "the AdGrant sitemap names the other site");
    assert.equal(xml.match(/<loc>/g)?.length, adgrantUrls().length);
  });
});

describe("robots.txt and sitemap.xml by host", () => {
  it("answers AdGrant's own files on AdGrant's hosts", async () => {
    for (const host of ADGRANT_HOSTS) {
      const robots = await asHost("/robots.txt", host);
      assert.equal(robots.status, 200);
      assert.match(robots.type, /text\/plain/);
      assert.equal(robots.body, adgrantRobotsTxt());
      assert.ok(robots.body.includes(`Sitemap: ${ADGRANT_ORIGIN}/sitemap.xml`));

      const sitemap = await asHost("/sitemap.xml", host);
      assert.equal(sitemap.status, 200);
      assert.match(sitemap.type, /xml/);
      assert.equal(sitemap.body, adgrantSitemapXml());
    }
  });

  it("falls through to the static files on ours", async () => {
    /* No express.static in this harness, so falling through means reaching
       the end of the router — a 404 here proves the route did NOT answer,
       which is the whole assertion. In production serveStatic is mounted
       after registerRoutes and hands over client/public/robots.txt. */
    for (const path of ["/robots.txt", "/sitemap.xml"]) {
      const res = await asHost(path, "top-rated.team");
      assert.notEqual(res.status, 200, `${path} was answered by the AdGrant route on our own host`);
      assert.ok(!res.body.includes(ADGRANT_ORIGIN), `${path} leaked the AdGrant sitemap on our own host`);
    }
  });
});
