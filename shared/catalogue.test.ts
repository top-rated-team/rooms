/**
 * The AdGrant in-house catalogue, and a fork of that fork. Run it with:
 *
 *   npx tsx --test shared/catalogue.test.ts
 *
 * server/catalogue.test.ts already holds the four original guarantees
 * (no operator is today's doors; white-label drops our name; named publishes
 * no price; a false claim throws). This file holds what that one cannot:
 * a second house, every row rewritten for a nonprofit, and what happens
 * when a partner forks a deployment that is itself a fork.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ADGRANT_IDENTITY,
  adgrantCopyIds,
  catalogueLegalFacts,
  resolveCatalogue,
  type CatalogueDoor,
  type OperatorConfig,
  type OperatorIdentity,
} from "./catalogue";
import { adgrantCatalogue, catalogue, DOOR_BY_ID, DOORS } from "./doors";
import { ADGRANT_IDENTITY as HOUSE_FROM_OPERATOR } from "./operator";

const HOUSE_LEGAL_NAME = "Top-Rated Team (Danylo Burykin SZČO)";

const NORTHWIND: OperatorIdentity = {
  displayName: "Northwind Agency",
  legalName: "Northwind Agency s.r.o.",
  entity: "A marketing agency registered in Prague.",
  termsUrl: "https://northwind.example/terms",
  contact: "https://northwind.example/contact",
};

function partner(services: NonNullable<OperatorConfig["services"]>, identity: OperatorIdentity = NORTHWIND): OperatorConfig {
  return { identity, services, base: "adgrant-ai" };
}

function asRows(value: ReturnType<typeof resolveCatalogue>): CatalogueDoor[] {
  return value as CatalogueDoor[];
}

describe("the second house identity is the same company, a different face", () => {
  it("is exported from the operator module so a setup form can fill from it", () => {
    assert.equal(HOUSE_FROM_OPERATOR.legalName, ADGRANT_IDENTITY.legalName);
    assert.equal(ADGRANT_IDENTITY.legalName, HOUSE_LEGAL_NAME);
    assert.equal(ADGRANT_IDENTITY.displayName, "AdGrant.AI");
    assert.equal(ADGRANT_IDENTITY.termsUrl, "https://adgrant.ai/terms");
    assert.notEqual(ADGRANT_IDENTITY.termsUrl, DOOR_BY_ID["chatgpt-ads"].contract.termsUrl);
  });
});

describe("with no operator the reference catalogue is still today's doors", () => {
  it("returns the same array, including through the page-facing helper", () => {
    assert.equal(resolveCatalogue(DOORS), DOORS);
    assert.equal(resolveCatalogue(DOORS, null), DOORS);
    assert.equal(catalogue(), DOORS);
    assert.equal(catalogue(null), DOORS);
    assert.equal(catalogue(null, "top-rated-team"), DOORS);
  });
});

describe("the AdGrant in-house clone", () => {
  const rows = asRows(adgrantCatalogue(null, { mount: "" }));

  it("clones every door, including the ones hidden for the LinkedIn review", () => {
    assert.equal(rows.length, DOORS.length);
    for (const door of DOORS) {
      assert.ok(
        rows.some((row) => row.id === door.id),
        `${door.id} was dropped from the AdGrant catalogue`,
      );
    }
    const hidden = DOORS.filter((door) => door.hidden);
    assert.ok(hidden.length > 0, "the test assumes at least one hidden door");
    for (const door of hidden) {
      const row = rows.find((entry) => entry.id === door.id);
      assert.equal(row?.hidden, true);
      assert.notEqual(row?.headline, door.headline);
    }
  });

  it("has nonprofit copy for every door that exists today, so a later row cannot slip through un-rewritten", () => {
    const ids = adgrantCopyIds();
    for (const door of DOORS) {
      assert.ok(ids.includes(door.id), `ADGRANT_SERVICE_COPY is missing ${door.id}`);
    }
  });

  it("re-points headline, blurb, starters and agent line so none of them still sell the Top-Rated Team row", () => {
    const forbidden = ["B2B SaaS", "Shopify", "for your business", "$3K/month B2B"];
    for (const row of rows) {
      const original = DOOR_BY_ID[row.id];
      if (row.id !== "ad-grants") {
        assert.notEqual(row.headline, original.headline, `${row.id} kept the Top-Rated Team headline`);
      }
      const blob = `${row.headline}\n${row.blurb}\n${row.agentLine}\n${row.starters.join("\n")}`;
      for (const phrase of forbidden) {
        assert.equal(blob.includes(phrase), false, `${row.id} still says “${phrase}”`);
      }
    }
  });

  it("tells the truth about generate versus upload on the Ad Grants row", () => {
    const row = rows.find((entry) => entry.id === "ad-grants");
    assert.ok(row);
    assert.match(row.blurb, /Nothing is written into a Google Ads account/);
    assert.doesNotMatch(row.blurb, /written into your Google Ads account through the official Google Ads API/);
    assert.ok(row.tool);
    assert.match(row.tool.line, /does not write into a Google Ads account/);
  });

  it("puts AdGrant's own terms and trading name on our rows, and leaves the partner's contract alone", () => {
    const ours = rows.find((entry) => entry.id === "ad-grants");
    const partnerRow = rows.find((entry) => entry.id === "linkedin-growth");
    assert.ok(ours && partnerRow);
    assert.equal(ours.contract.displayName, "AdGrant.AI");
    assert.equal(ours.contract.legalName, HOUSE_LEGAL_NAME);
    assert.equal(ours.contract.termsUrl, "https://adgrant.ai/terms");
    assert.equal(partnerRow.contract.legalName, "Maksymenko LinkedIn Growth");
    assert.equal(partnerRow.contract.termsUrl, null);
  });

  it("prefixes door paths with the mount this tree is on", () => {
    const mounted = asRows(adgrantCatalogue(null, { mount: "/adgrant" }));
    const root = asRows(adgrantCatalogue(null, { mount: "" }));
    const grants = mounted.find((row) => row.id === "ad-grants");
    const grantsRoot = root.find((row) => row.id === "ad-grants");
    assert.equal(grants?.path, "/adgrant/services/ad-grants");
    assert.equal(grantsRoot?.path, "/services/ad-grants");
  });

  it("does not mutate the live door table", () => {
    const snapshot = JSON.stringify(DOORS);
    adgrantCatalogue(null, { mount: "" });
    assert.equal(JSON.stringify(DOORS), snapshot);
  });
});

describe("a fork of a fork", () => {
  it("white-label names the partner on the row, keeps AdGrant.AI on the tool, and drops both house names from the rest", () => {
    const config = partner({ "ad-grants": { mode: "white-label", offered: true } });
    const row = asRows(resolveCatalogue(DOORS, config)).find((entry) => entry.id === "ad-grants");
    assert.ok(row);
    assert.equal(row.contract.legalName, NORTHWIND.legalName);
    assert.equal(row.contract.displayName, NORTHWIND.displayName);
    assert.equal(row.contract.termsUrl, NORTHWIND.termsUrl);
    assert.equal(row.contract.contact, NORTHWIND.contact);
    assert.equal(row.tier, "white");
    const blob = JSON.stringify({ ...row, tool: undefined });
    assert.equal(blob.includes(HOUSE_LEGAL_NAME), false, "house legal name survived on a white-label fork of AdGrant");
    assert.equal(blob.includes("AdGrant.AI"), false, "AdGrant trading name survived outside the tool");
    assert.equal(row.tool?.name, "AdGrant.AI");
  });

  it("named mode keeps this house on the row — AdGrant terms, our legal name, no price of ours", () => {
    const config = partner({ "google-ads": { mode: "named", offered: true } });
    const row = asRows(resolveCatalogue(DOORS, config)).find((entry) => entry.id === "google-ads");
    assert.ok(row);
    assert.equal(row.contract.legalName, HOUSE_LEGAL_NAME);
    assert.equal(row.contract.termsUrl, "https://adgrant.ai/terms");
    assert.equal(row.contract.displayName, "AdGrant.AI");
    assert.equal(row.tier, "grey");
    assert.equal(row.priceTier, "partner");
  });

  it("two hops — clone, then a partner — agree with base: adgrant-ai on one call", () => {
    const inner = asRows(resolveCatalogue(DOORS, null, { house: "adgrant-ai", mount: "" }));
    const pick = (rows: CatalogueDoor[]) => rows.find((entry) => entry.id === "ad-grants");
    const viaHops = pick(
      asRows(
        resolveCatalogue(inner, { identity: NORTHWIND, services: { "ad-grants": { mode: "white-label", offered: true } } }),
      ),
    );
    const viaBase = pick(
      asRows(
        resolveCatalogue(DOORS, {
          identity: NORTHWIND,
          services: { "ad-grants": { mode: "white-label", offered: true } },
          base: "adgrant-ai",
        }),
      ),
    );
    assert.ok(viaHops && viaBase);
    assert.equal(viaHops.contract.legalName, viaBase.contract.legalName);
    assert.equal(viaHops.headline, viaBase.headline);
    assert.match(viaHops.headline, /nonprofit|Grant/i);
  });

  it("still refuses white-label on a row another company already contracts", () => {
    assert.throws(
      () => resolveCatalogue(DOORS, partner({ "linkedin-growth": { mode: "white-label", offered: true } })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /someone who is not/);
        return true;
      },
    );
  });
});

describe("legal facts a fork's privacy and terms are filled from", () => {
  it("names this house, the three login methods, rooms, the generator, and any partner rows", () => {
    const rows = asRows(adgrantCatalogue(null, { mount: "" }));
    const facts = catalogueLegalFacts(rows, ADGRANT_IDENTITY);
    assert.equal(facts.legalName, HOUSE_LEGAL_NAME);
    assert.equal(facts.displayName, "AdGrant.AI");
    assert.equal(facts.termsUrl, "https://adgrant.ai/terms");
    assert.equal(facts.login.linkedin, true);
    assert.equal(facts.login.whatsapp, true);
    assert.equal(facts.login.email, true);
    assert.equal(facts.rooms, true);
    assert.equal(facts.generatesStructure, true);
    assert.ok(facts.partners.some((partnerRow) => partnerRow.legalName === "Maksymenko LinkedIn Growth"));
  });

  it("drops a partner that was switched off, and the generator when that row is off", () => {
    const rows = asRows(
      resolveCatalogue(DOORS, {
        identity: NORTHWIND,
        base: "adgrant-ai",
        services: {
          "ad-grants": { mode: "named", offered: false },
          "linkedin-growth": { mode: "named", offered: false },
        },
      }),
    );
    const facts = catalogueLegalFacts(rows, NORTHWIND);
    assert.equal(facts.generatesStructure, false);
    assert.equal(
      facts.partners.some((partnerRow) => partnerRow.legalName === "Maksymenko LinkedIn Growth"),
      false,
    );
  });
});
