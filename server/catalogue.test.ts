/**
 * The operator catalogue. Run it with:
 *
 *   npx tsx --test server/catalogue.test.ts
 *
 * Four things this file has to keep true, from private/fork-and-partners.md:
 *
 * 1. With no operator the catalogue is DOORS — the same rows, so this parcel
 *    cannot change what ai.top-rated.team shows.
 * 2. In white-label mode our legal name appears nowhere in the resolved
 *    output. The assertion searches the whole structure, not the fields a
 *    person remembered to check, because a forgotten invoice line is still a
 *    name on the paper.
 * 3. In named mode a row names us and priceForDoor returns null for it, which
 *    is the guarantee that already exists for the partner tier.
 * 4. A config that would have a room claim somebody is answerable who is not
 *    fails rather than renders.
 *
 * The fork is free and reports nothing back. A test that wanted a deployment
 * id or a usage count would be asking for the model the owner cut.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveCatalogue,
  type OperatorConfig,
  type OperatorIdentity,
} from "@shared/catalogue";
import { catalogue, DEFAULT_DOOR_ID, DOOR_BY_ID, DOORS, type DoorDef } from "@shared/doors";
import { priceForDoor } from "@shared/pricing";

const HOUSE_LEGAL_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

const NORTHWIND: OperatorIdentity = {
  displayName: "Northwind Agency",
  legalName: "Northwind Agency s.r.o.",
  entity: "A marketing agency registered in Prague.",
  termsUrl: "https://northwind.example/terms",
  contact: "https://northwind.example/contact",
};

function operator(services: NonNullable<OperatorConfig["services"]>, identity: OperatorIdentity = NORTHWIND): OperatorConfig {
  return { identity, services };
}

function asCatalogue(doors: DoorDef[] | ReturnType<typeof resolveCatalogue>) {
  return doors as Array<DoorDef & { offered?: boolean }>;
}

/* -------------------------------------------------------------------------- */
/* 1. No operator is today's catalogue                                        */
/* -------------------------------------------------------------------------- */

describe("with no operator the catalogue is today's doors", () => {
  it("returns the same array that shared/doors.ts exports", () => {
    assert.equal(resolveCatalogue(DOORS), DOORS);
    assert.equal(resolveCatalogue(DOORS, null), DOORS);
    assert.equal(resolveCatalogue(DOORS, undefined), DOORS);
    assert.equal(catalogue(), DOORS);
    assert.equal(catalogue(null), DOORS);
  });

  it("equals DOORS byte for byte, including when the caller asked the page-facing resolver", () => {
    assert.equal(JSON.stringify(resolveCatalogue(DOORS)), JSON.stringify(DOORS));
    assert.equal(JSON.stringify(catalogue()), JSON.stringify(DOORS));
  });

  it("does not copy or freeze the live rows, so a later edit of DOORS is what the next visitor reads", () => {
    const resolved = resolveCatalogue(DOORS);
    assert.equal(resolved[0], DOORS[0]);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. White-label: ours nowhere                                               */
/* -------------------------------------------------------------------------- */

describe("white-label mode puts the operator on the row and ours nowhere", () => {
  const googleAds = DOOR_BY_ID["google-ads"];
  const config = operator({ "google-ads": { mode: "white-label", offered: true } });

  it("prints the operator's legal name, terms, invoice line and contact", () => {
    const [row] = asCatalogue(resolveCatalogue([googleAds], config));
    assert.equal(row.contract.legalName, NORTHWIND.legalName);
    assert.equal(row.contract.displayName, NORTHWIND.displayName);
    assert.equal(row.contract.entity, NORTHWIND.entity);
    assert.equal(row.contract.termsUrl, NORTHWIND.termsUrl);
    assert.equal(row.contract.contact, NORTHWIND.contact);
    assert.equal(row.contract.invoiceLine, `${NORTHWIND.legalName} signs the contract and sends the invoice.`);
    assert.equal(row.tier, "white");
    assert.equal(row.offered, true);
  });

  it("leaves our legal name nowhere in the resolved output, searching the whole structure", () => {
    /*
     * The blurb is planted with the house legal name on purpose. If the
     * resolver only rewrote the contract fields its author listed, this case
     * would go green while a visitor still read our name in the body copy.
     */
    const planted: DoorDef = {
      ...googleAds,
      blurb: `${googleAds.blurb} The contract is ${HOUSE_LEGAL_NAME}.`,
      starters: [...googleAds.starters, `Who is ${HOUSE_LEGAL_NAME}?`],
    };
    const resolved = resolveCatalogue([planted], config);
    const blob = JSON.stringify(resolved);

    assert.equal(
      blob.includes(HOUSE_LEGAL_NAME),
      false,
      `our legal name still appears in the white-label output:\n${blob}`,
    );
    assert.equal(blob.includes(NORTHWIND.legalName), true, "the operator's legal name should be on the row that replaced ours");
  });

  it("does not mutate the door it was given", () => {
    const snapshot = JSON.stringify(googleAds);
    resolveCatalogue([googleAds], config);
    assert.equal(JSON.stringify(googleAds), snapshot);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Named: us, and no price of ours                                         */
/* -------------------------------------------------------------------------- */

describe("named mode keeps us on the row the way the partner tier already does", () => {
  it("names us and makes priceForDoor return null", () => {
    const googleAds = DOOR_BY_ID["google-ads"];
    assert.ok(priceForDoor(googleAds), "the live Google Ads door has a price row; named mode is what removes it");

    const resolved = asCatalogue(
      resolveCatalogue([googleAds], operator({ "google-ads": { mode: "named", offered: true } })),
    );
    const row = resolved[0];

    assert.equal(row.contract.legalName, HOUSE_LEGAL_NAME);
    assert.equal(row.contract.termsUrl, googleAds.contract.termsUrl);
    assert.equal(row.contract.invoiceLine, googleAds.contract.invoiceLine);
    assert.equal(row.contract.contact, googleAds.contract.contact);
    assert.equal(row.tier, "grey");
    assert.equal(row.priceTier, "partner");
    assert.equal(
      priceForDoor(row),
      null,
      "named mode must sit on the partner price tier, so this site publishes no figure for work the operator is not selling",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 4. A false claim is a throw, not a page                                    */
/* -------------------------------------------------------------------------- */

describe("a config that would name someone who is not answerable fails rather than renders", () => {
  it("rejects white-label on a door another company already contracts", () => {
    const partnerDoor = DOOR_BY_ID["linkedin-growth"];
    assert.notEqual(partnerDoor.contract.legalName, HOUSE_LEGAL_NAME);

    assert.throws(
      () => resolveCatalogue([partnerDoor], operator({ "linkedin-growth": { mode: "white-label", offered: true } })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Maksymenko LinkedIn Growth/);
        assert.match(err.message, /someone who is not/);
        return true;
      },
    );
  });

  it("rejects white-label on the lawyer-first door, where a lawyer is answerable for part of the work", () => {
    const lawyerDoor = DOOR_BY_ID["linkedin-automation"];
    assert.equal(lawyerDoor.tier, "light-grey");

    assert.throws(
      () =>
        resolveCatalogue([lawyerDoor], operator({ "linkedin-automation": { mode: "white-label", offered: true } })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /someone who is not/);
        return true;
      },
    );
  });

  it("rejects white-label when the operator has no legal name to print", () => {
    const googleAds = DOOR_BY_ID["google-ads"];
    const nameless: OperatorIdentity = { ...NORTHWIND, legalName: "  " };

    assert.throws(
      () =>
        resolveCatalogue(
          [googleAds],
          operator({ "google-ads": { mode: "white-label", offered: true } }, nameless),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /no legal name/);
        return true;
      },
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Switching a service off is a flag                                          */
/* -------------------------------------------------------------------------- */

describe("a service the operator has switched off stays in the catalogue as a flag", () => {
  it("keeps the row and marks it, so switching it back on is the same flag", () => {
    const googleAds = DOOR_BY_ID["google-ads"];
    const adGrants = DOOR_BY_ID["ad-grants"];
    const resolved = asCatalogue(
      resolveCatalogue(
        [googleAds, adGrants],
        operator({
          "google-ads": { mode: "named", offered: false },
          "ad-grants": { mode: "named", offered: true },
        }),
      ),
    );

    assert.equal(resolved.length, 2);
    assert.equal(resolved[0].id, "google-ads");
    assert.equal(resolved[0].offered, false);
    assert.equal(resolved[1].id, "ad-grants");
    assert.equal(resolved[1].offered, true);
  });
});
