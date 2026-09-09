/**
 * Unipile error mapping. Run it with:
 *
 *   npx tsx --test server/unipile/errors.test.ts
 *
 * The cases that have to stay true: the brief's `type` values are a closed
 * union, and Unipile's `detail` never reaches a visitor.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseUnipileError, visitorLine, UNIPILE_ERROR_TYPES } from "./errors";

const ACCOUNT_NAMING_DETAIL =
  "Account acct_LEAK_ME (someone@example.test) is disconnected from Google.";

describe("parseUnipileError", () => {
  it("maps each operational type the brief lists", () => {
    const cases = [
      ["errors/disconnected_account", 401],
      ["errors/expired_credentials", 401],
      ["errors/insufficient_privileges", 401],
      ["errors/account_restricted", 403],
      ["errors/resource_not_found", 404],
      ["errors/too_many_requests", 429],
      ["errors/no_client_session", 503],
      ["errors/network_down", 503],
      ["errors/service_unavailable", 503],
      ["errors/request_timeout", 504],
    ] as const;

    assert.equal(UNIPILE_ERROR_TYPES.length, cases.length);

    for (const [type, status] of cases) {
      const parsed = parseUnipileError(status, {
        title: "ignored",
        detail: ACCOUNT_NAMING_DETAIL,
        instance: "/accounts/secret",
        type,
        status,
      });
      assert.equal(parsed.type, type);
      assert.equal(parsed.status, status);
      assert.equal("detail" in parsed, false);
    }
  });

  it("does not promote an unlisted Unipile type into an operational case", () => {
    const parsed = parseUnipileError(401, {
      type: "errors/missing_credentials",
      title: "Missing credentials",
      detail: ACCOUNT_NAMING_DETAIL,
      status: 401,
    });
    assert.equal(parsed.type, "unknown");
    assert.equal(parsed.status, 401);
  });

  it("keeps the status Unipile returned, because one type arrives under two of them", () => {
    /* Unipile's calendar page lists errors/insufficient_privileges under 401
       and then prints it in a 403 example body. A mapper with a canonical
       status per type reported 401 for that 403, which sends whoever reads it
       to re-pair a device when the truth is a missing subscription. */
    const asFourOhOne = parseUnipileError(401, { type: "errors/insufficient_privileges", status: 401 });
    const asFourOhThree = parseUnipileError(403, { type: "errors/insufficient_privileges", status: 403 });
    assert.equal(asFourOhOne.type, "errors/insufficient_privileges");
    assert.equal(asFourOhOne.status, 401);
    assert.equal(asFourOhThree.type, "errors/insufficient_privileges");
    assert.equal(asFourOhThree.status, 403);
  });

  it("falls back on HTTP status when the body has no type", () => {
    assert.equal(parseUnipileError(404, null).type, "errors/resource_not_found");
    assert.equal(parseUnipileError(503, {}).type, "errors/service_unavailable");
    assert.equal(parseUnipileError(504, "not json").type, "errors/request_timeout");
  });
});

describe("visitorLine", () => {
  it("never includes Unipile's detail, even when that detail names an account", () => {
    const error = parseUnipileError(401, {
      type: "errors/disconnected_account",
      detail: ACCOUNT_NAMING_DETAIL,
      title: ACCOUNT_NAMING_DETAIL,
      status: 401,
    });
    const line = visitorLine(error);
    assert.equal(line.includes("acct_LEAK_ME"), false);
    assert.equal(line.includes("someone@example.test"), false);
    assert.equal(line.includes(ACCOUNT_NAMING_DETAIL), false);
    assert.equal(line.includes("disconnected from Google"), false);
  });

  it("says an account is not connected on 404, and that Unipile could not be reached on retryable failures", () => {
    assert.equal(
      visitorLine({ type: "errors/resource_not_found", status: 404 }),
      "That account is not connected.",
    );
    assert.equal(
      visitorLine({ type: "errors/service_unavailable", status: 503 }),
      "Unipile could not be reached.",
    );
    assert.equal(
      visitorLine({ type: "errors/request_timeout", status: 504 }),
      "Unipile could not be reached.",
    );
  });
});

describe("the two new corpora keep to their own documentation", () => {
  it("draws the Google Ads API corpus only from developers.google.com, and Unipile's only from developer.unipile.com", async () => {
    const { readFileSync } = await import("node:fs");
    const cases = [
      ["data/kb/kb.google-ads-api.json", "developers.google.com"],
      ["data/kb/kb.unipile-api.json", "developer.unipile.com"],
    ] as const;

    for (const [file, host] of cases) {
      const corpus = JSON.parse(readFileSync(file, "utf8")) as { chunks: { url?: string }[] };
      assert.ok(corpus.chunks.length > 50, `${file} has too few chunks to be a corpus`);
      for (const chunk of corpus.chunks) {
        assert.ok(chunk.url, `${file} has a chunk with no source URL, and a citation is the point`);
        assert.equal(new URL(chunk.url).host, host, `${file} carries a chunk from ${chunk.url}`);
      }
    }
  });

  it("says a 429 is busy rather than unreachable, because only one of those is actionable", () => {
    assert.equal(
      visitorLine({ type: "errors/too_many_requests", status: 429 }),
      "Too many requests just now. Try again in a moment.",
    );
  });
});
