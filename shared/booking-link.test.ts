/**
 * /book links. Run it with:
 *
 *   npx tsx --test shared/booking-link.test.ts
 *
 * The cases that have to stay true: both shapes of link fill the address, a
 * "+" in an address survives, nothing that is not an address is ever handed
 * to the popup, every other query parameter is passed on untouched, and the
 * destination is always a path on this site.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bookLinkTarget, bookingLinkEmail, parseBookLinkHash } from "./booking-link";

describe("bookLinkTarget", () => {
  it("opens the popup on the front page when the link carries nothing", () => {
    assert.equal(bookLinkTarget(""), "/#book");
  });

  it("reads ?email= and ?<address>, the two shapes in circulation", () => {
    assert.equal(bookLinkTarget("email=someone@example.com"), "/#book=someone%40example.com");
    assert.equal(bookLinkTarget("someone@example.com"), "/#book=someone%40example.com");
    assert.equal(bookLinkTarget("someone%40example.com"), "/#book=someone%40example.com");
    assert.equal(bookLinkTarget("EMAIL=someone%40example.com"), "/#book=someone%40example.com");
  });

  it("keeps a + in an address, which URLSearchParams would turn into a space", () => {
    assert.equal(bookLinkTarget("email=dan+ads@example.com"), "/#book=dan%2Bads%40example.com");
    assert.equal(bookLinkTarget("dan+ads@example.com"), "/#book=dan%2Bads%40example.com");
  });

  it("passes every other parameter on untouched and drops only the address", () => {
    assert.equal(
      bookLinkTarget("utm_source=newsletter&email=someone@example.com&utm_medium=email"),
      "/?utm_source=newsletter&utm_medium=email#book=someone%40example.com",
    );
    assert.equal(bookLinkTarget("someone@example.com&ref=sig"), "/?ref=sig#book=someone%40example.com");
    assert.equal(bookLinkTarget("ref"), "/?ref#book");
  });

  it("opens the popup empty rather than filling it with something that is not an address", () => {
    assert.equal(bookLinkTarget("email={{email}}"), "/#book");
    assert.equal(bookLinkTarget("email="), "/#book");
    assert.equal(bookLinkTarget("email=%E0%A4%A"), "/#book");
  });

  it("takes the first usable address when a link carries two", () => {
    assert.equal(bookLinkTarget("email=first@example.com&second@example.com"), "/#book=first%40example.com");
  });

  it("never leaves the site, whatever the query holds", () => {
    for (const query of ["//evil.example", "email=//evil.example", "/\\evil.example", "@evil.example"]) {
      const target = bookLinkTarget(query);
      assert.match(target, /^\/[?#]/, target);
    }
  });
});

describe("bookingLinkEmail", () => {
  it("unwraps what a pasted address brings along with it", () => {
    assert.equal(bookingLinkEmail(" someone@example.com "), "someone@example.com");
    assert.equal(bookingLinkEmail("mailto:someone@example.com"), "someone@example.com");
    assert.equal(bookingLinkEmail("<someone@example.com>"), "someone@example.com");
    assert.equal(bookingLinkEmail("{someone@example.com}"), "someone@example.com");
  });

  it("answers null for anything the popup would reject", () => {
    for (const value of ["", null, undefined, "someone", "someone@example", "some one@example.com", "{some-email-address}"]) {
      assert.equal(bookingLinkEmail(value), null, String(value));
    }
  });
});

describe("parseBookLinkHash", () => {
  it("reads the hop the server left, with or without an address", () => {
    assert.deepEqual(parseBookLinkHash("#book"), { email: null });
    assert.deepEqual(parseBookLinkHash("#book=someone%40example.com"), { email: "someone@example.com" });
    assert.deepEqual(parseBookLinkHash("#book=dan%2Bads%40example.com"), { email: "dan+ads@example.com" });
  });

  it("checks a typed fragment again rather than trusting it", () => {
    assert.deepEqual(parseBookLinkHash("#book=%3Cscript%3E"), { email: null });
  });

  it("leaves every other fragment alone", () => {
    for (const hash of ["", "#", "#services", "#booking", "#bookmark=someone%40example.com"]) {
      assert.equal(parseBookLinkHash(hash), null, hash);
    }
  });
});
