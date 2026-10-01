/**
 * Signed addresses in booking links. Run it with:
 *
 *   npx tsx --test server/booking/link-sign.test.ts
 *
 * What has to stay true: a signature is for one address and no other; case
 * does not matter; anything malformed is simply "not signed"; the key comes
 * from a secret the deployment already has, BOOKING_LINK_SECRET first; and
 * with no secret nothing is signed at all.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { addressSigned, linkSigningOn, signAddress } from "./link-sign";

const NAMES = ["BOOKING_LINK_SECRET", "LEAD_INBOX_KEY", "ROOM_HASH_PEPPER"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of NAMES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("signAddress and addressSigned", () => {
  it("sign one address, whatever its case, and no other", () => {
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    const sig = signAddress("Ada+Calls@Example.com");
    assert.match(sig ?? "", /^[A-Za-z0-9_-]{22}$/);
    assert.equal(addressSigned("ada+calls@example.com", sig), true);
    assert.equal(addressSigned("bea@example.com", sig), false);
    assert.equal(addressSigned("ada+calls@example.com", `${sig!.slice(0, -1)}A` === sig ? `${sig!.slice(0, -1)}B` : `${sig!.slice(0, -1)}A`), false);
  });

  it("cover the guests named with the address, in any order, and leave a link without guests as it was", () => {
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    const plain = signAddress("ada@example.com")!;
    const withGuests = signAddress("ada@example.com", ["cy@example.org", "Bea@example.com"])!;
    assert.notEqual(withGuests, plain);
    assert.equal(signAddress("ada@example.com", []), plain, "no guests: the signature every sent link carries");
    assert.equal(addressSigned("ada@example.com", withGuests, ["bea@example.com", "cy@example.org"]), true);
    assert.equal(addressSigned("ada@example.com", withGuests, ["bea@example.com", "mallory@example.net"]), false);
    assert.equal(addressSigned("ada@example.com", withGuests), false, "the guests are part of what was signed");
    assert.equal(addressSigned("ada@example.com", plain, ["mallory@example.net"]), false, "guests added to a link are not signed");
  });

  it("treat anything malformed as not signed, without throwing", () => {
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    for (const sig of [undefined, null, 42, "", "short", "x".repeat(40)]) {
      assert.equal(addressSigned("ada@example.com", sig), false, String(sig));
    }
    assert.equal(addressSigned(undefined, signAddress("ada@example.com")), false);
  });

  it("use BOOKING_LINK_SECRET first, so setting it moves every link to a new key", () => {
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    const withInboxKey = signAddress("ada@example.com");
    process.env.BOOKING_LINK_SECRET = "dedicated-secret";
    assert.notEqual(signAddress("ada@example.com"), withInboxKey);
    assert.equal(addressSigned("ada@example.com", withInboxKey), false, "an older link goes back to the email step");
  });

  it("do not sign with the inbox key itself: the signature is labelled for this one use", () => {
    process.env.LEAD_INBOX_KEY = "inbox-key-for-tests";
    process.env.ROOM_HASH_PEPPER = "inbox-key-for-tests";
    const fromInbox = signAddress("ada@example.com");
    delete process.env.LEAD_INBOX_KEY;
    assert.equal(signAddress("ada@example.com"), fromInbox, "same secret, same label, same signature");
  });

  it("sign nothing when the deployment has no secret", () => {
    assert.equal(linkSigningOn(), false);
    assert.equal(signAddress("ada@example.com"), null);
    assert.equal(addressSigned("ada@example.com", "a".repeat(22)), false);
  });
});
