/**
 * /book links. Run it with:
 *
 *   npx tsx --test shared/booking-link.test.ts
 *
 * The cases that have to stay true: both shapes of link fill the address, a
 * "+" in an address survives, nothing that is not an address, a day or a time
 * is ever handed to the popup, every other query parameter is passed on
 * untouched, the destination is always a path on this site, and a merge tag
 * reaches the mail tool exactly as it was typed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bookLinkTarget,
  bookLinkUrl,
  bookingLinkEmail,
  formatBookLinkHash,
  isMergeTag,
  parseBookLinkHash,
  widgetRecipient,
} from "./booking-link";

describe("bookLinkTarget", () => {
  it("opens the popup on the front page when the link carries nothing", () => {
    assert.equal(bookLinkTarget(""), "/#book");
  });

  it("reads ?email= and ?<address>, the two shapes in circulation", () => {
    assert.equal(bookLinkTarget("email=someone@example.com"), "/#book&email=someone%40example.com");
    assert.equal(bookLinkTarget("someone@example.com"), "/#book&email=someone%40example.com");
    assert.equal(bookLinkTarget("someone%40example.com"), "/#book&email=someone%40example.com");
    assert.equal(bookLinkTarget("someone@example.com="), "/#book&email=someone%40example.com");
    assert.equal(bookLinkTarget("EMAIL=someone%40example.com"), "/#book&email=someone%40example.com");
  });

  it("keeps a + in an address, which URLSearchParams would turn into a space", () => {
    assert.equal(bookLinkTarget("email=dan+ads@example.com"), "/#book&email=dan%2Bads%40example.com");
    assert.equal(bookLinkTarget("dan+ads@example.com"), "/#book&email=dan%2Bads%40example.com");
  });

  it("carries the day, the time and the email confirmation of a time picked in an email", () => {
    assert.equal(
      bookLinkTarget("date=2026-10-02&time=09:30&confirm=email&email=someone@example.com"),
      "/#book&email=someone%40example.com&date=2026-10-02&time=09:30&confirm=email",
    );
    assert.equal(bookLinkTarget("date=2026-10-02&confirm=email"), "/#book&date=2026-10-02&confirm=email");
  });

  it("drops a day, a time or a marker it cannot read, rather than passing it on", () => {
    assert.equal(bookLinkTarget("date=2026-02-31&time=09:30"), "/#book");
    assert.equal(bookLinkTarget("date=tomorrow"), "/#book");
    assert.equal(bookLinkTarget("date=2026-10-02&time=25:00"), "/#book&date=2026-10-02");
    assert.equal(bookLinkTarget("time=09:30"), "/#book");
    assert.equal(bookLinkTarget("confirm=yes"), "/#book");
  });

  it("passes every other parameter on untouched and drops only its own", () => {
    assert.equal(
      bookLinkTarget("utm_source=newsletter&email=someone@example.com&utm_medium=email"),
      "/?utm_source=newsletter&utm_medium=email#book&email=someone%40example.com",
    );
    assert.equal(bookLinkTarget("someone@example.com&ref=sig"), "/?ref=sig#book&email=someone%40example.com");
    assert.equal(bookLinkTarget("ref"), "/?ref#book");
  });

  it("opens the popup empty rather than filling it with something that is not an address", () => {
    assert.equal(bookLinkTarget("email={{email}}"), "/#book");
    assert.equal(bookLinkTarget("email=*|EMAIL|*"), "/#book");
    assert.equal(bookLinkTarget("email="), "/#book");
    assert.equal(bookLinkTarget("email=%E0%A4%A"), "/#book");
  });

  it("takes the first usable address when a link carries two", () => {
    assert.equal(bookLinkTarget("email=first@example.com&second@example.com"), "/#book&email=first%40example.com");
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
    assert.equal(bookingLinkEmail("Dan Burykin <dan+ads@example.com>"), "dan+ads@example.com", "as a To field copies it");
    assert.equal(bookingLinkEmail('"Burykin, Dan" <dan@example.com>'), "dan@example.com");
  });

  it("answers null for anything the popup would reject", () => {
    for (const value of ["", null, undefined, "someone", "someone@example", "some one@example.com", "{some-email-address}"]) {
      assert.equal(bookingLinkEmail(value), null, String(value));
    }
  });
});

describe("parseBookLinkHash", () => {
  it("reads the hop the server left", () => {
    assert.deepEqual(parseBookLinkHash("#book"), {
      email: null,
      date: null,
      time: null,
      confirmByEmail: false,
      confirmation: null,
      sig: null,
      instant: false,
    });
    assert.deepEqual(parseBookLinkHash("#book&email=dan%2Bads%40example.com&date=2026-10-02&time=09:30&confirm=email"), {
      email: "dan+ads@example.com",
      date: "2026-10-02",
      time: "09:30",
      confirmByEmail: true,
      confirmation: null,
      sig: null,
      instant: false,
    });
  });

  it("still reads the fragment's first shape, #book=<address>", () => {
    assert.equal(parseBookLinkHash("#book=someone%40example.com")?.email, "someone@example.com");
  });

  it("reads the way back from an emailed confirmation link", () => {
    const token = "a".repeat(43);
    assert.equal(parseBookLinkHash(`#book&confirmation=${token}`)?.confirmation, token);
    assert.equal(parseBookLinkHash("#book&confirmation=short")?.confirmation, null);
  });

  it("checks a typed fragment again rather than trusting it", () => {
    assert.equal(parseBookLinkHash("#book=%3Cscript%3E")?.email, null);
    assert.equal(parseBookLinkHash("#book&date=2026-13-01&time=09:30")?.date, null);
    assert.equal(parseBookLinkHash("#book&date=2026-13-01&time=09:30")?.time, null, "no time without its day");
  });

  it("leaves every other fragment alone", () => {
    for (const hash of ["", "#", "#services", "#booking", "#bookmark=someone%40example.com"]) {
      assert.equal(parseBookLinkHash(hash), null, hash);
    }
  });

  it("reads back exactly what formatBookLinkHash writes", () => {
    const link = { email: "a+b@example.com", date: "2026-10-02", time: "16:30", confirmByEmail: true, confirmation: null, sig: null, instant: false };
    assert.deepEqual(parseBookLinkHash(`#${formatBookLinkHash(link)}`), link);
  });
});

describe("a signed address", () => {
  const SIG = "AbCdEfGhIjKlMnOpQrStUv";

  it("travels from the link, through /book, to the popup, beside its address", () => {
    const url = new URL(bookLinkUrl("https://top-rated.team", { date: "2026-10-02", time: "09:30", confirmByEmail: true, recipient: "ada@example.com", sig: SIG }));
    assert.equal(url.searchParams.get("sig"), SIG);
    const target = bookLinkTarget(url.search);
    assert.doesNotMatch(target.slice(0, target.indexOf("#")), /sig=/, "never in the visible query");
    assert.equal(parseBookLinkHash(target.slice(target.indexOf("#")))?.sig, SIG);
  });

  it("asks for one-click booking only with a time to book", () => {
    const url = new URL(bookLinkUrl("https://top-rated.team", { date: "2026-10-02", time: "09:30", confirmByEmail: true, recipient: "ada@example.com", sig: SIG, instant: true }));
    assert.equal(url.searchParams.get("instant"), "1");
    const target = bookLinkTarget(url.search);
    assert.equal(parseBookLinkHash(target.slice(target.indexOf("#")))?.instant, true);
    assert.ok(!bookLinkUrl("https://top-rated.team", { date: "2026-10-02", instant: true }).includes("instant"), "a day alone is not a booking");
    assert.equal(parseBookLinkHash("#book&date=2026-10-02&instant=1")?.instant, false);
  });

  it("is dropped without an address, or when it is not one of ours", () => {
    assert.ok(!bookLinkUrl("https://top-rated.team", { recipient: "{{email}}", sig: SIG }).includes("sig="), "a tag is not signed");
    assert.equal(parseBookLinkHash(`#book&sig=${SIG}`)?.sig, null);
    assert.equal(parseBookLinkHash("#book&email=ada%40example.com&sig=<b>")?.sig, null);
  });
});

describe("isMergeTag", () => {
  it("recognises the placeholders mail tools use for the recipient's address", () => {
    for (const tag of ["{{email}}", "{{ contact.EMAIL }}", "*|EMAIL|*", "%email%", "[email]", "{EMAIL}", "{$email}"]) {
      assert.equal(isMergeTag(tag), true, tag);
    }
  });

  it("refuses anything that could break out of a link", () => {
    for (const value of ["someone@example.com", "{{a\"onclick=x}}", "{{<b>}}", "email", "{{}}", "{a b}"]) {
      assert.equal(isMergeTag(value), false, value);
    }
  });
});

describe("widgetRecipient", () => {
  it("says what the links will carry: an address, a tag for the mail tool, or nothing", () => {
    assert.deepEqual(widgetRecipient(" Dan <dan@example.com> "), { kind: "address", value: "dan@example.com" });
    assert.deepEqual(widgetRecipient("{{email}}"), { kind: "tag", value: "{{email}}" });
    assert.deepEqual(widgetRecipient(""), { kind: "none" });
    assert.deepEqual(widgetRecipient("dan@"), { kind: "none" });
  });
});

describe("bookLinkUrl", () => {
  const BASE = "https://top-rated.team/";

  it("writes a time's link with the address last", () => {
    assert.equal(
      bookLinkUrl(BASE, { date: "2026-10-02", time: "09:30", confirmByEmail: true, recipient: "someone@example.com" }),
      "https://top-rated.team/book?date=2026-10-02&time=09:30&confirm=email&email=someone%40example.com",
    );
  });

  it("leaves a merge tag exactly as typed, so the mail tool still finds it", () => {
    assert.equal(
      bookLinkUrl(BASE, { date: "2026-10-02", confirmByEmail: true, recipient: "{{email}}" }),
      "https://top-rated.team/book?date=2026-10-02&confirm=email&email={{email}}",
    );
  });

  it("takes the address out of a To field's \"Name <address>\"", () => {
    assert.equal(
      bookLinkUrl(BASE, { recipient: "Ada Lovelace <ada@example.com>" }),
      "https://top-rated.team/book?email=ada%40example.com",
    );
  });

  it("leaves out a recipient that is neither an address nor a merge tag", () => {
    assert.equal(bookLinkUrl(BASE, { recipient: "not an address" }), "https://top-rated.team/book");
  });

  it("round-trips through /book: what the widget writes is what the popup reads", () => {
    const url = new URL(bookLinkUrl(BASE, { date: "2026-10-02", time: "09:30", confirmByEmail: true, recipient: "dan+ads@example.com" }));
    const target = bookLinkTarget(url.search);
    assert.deepEqual(parseBookLinkHash(target.slice(target.indexOf("#"))), {
      email: "dan+ads@example.com",
      date: "2026-10-02",
      time: "09:30",
      confirmByEmail: true,
      confirmation: null,
      sig: null,
      instant: false,
    });
  });
});
