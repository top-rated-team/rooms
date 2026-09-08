/**
 * The Google Ads ROI arithmetic, held against the worked examples in
 * docs/specs/roi-calculator.md. Run it with:
 *
 *   npx tsx --test server/roi.test.ts
 *
 * A calculator whose numbers nobody checked is worse than no calculator,
 * because a visitor will quote them back.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatRoiCurrency,
  formatRoiDecimal1,
  formatRoiPercentRaw,
  INDUSTRIES,
  INDUSTRY_BY_ID,
  industryFill,
  projectRoi,
  ROI_BOUNDS,
  ROI_DEFAULTS,
  roiBanner,
  type IndustryId,
  type RoiInputs,
} from "@shared/roi";

function at(overrides: Partial<RoiInputs> = {}): RoiInputs {
  return { ...ROI_DEFAULTS, ...overrides };
}

function projected(overrides: Partial<RoiInputs> = {}) {
  const result = projectRoi(at(overrides));
  assert.ok(result, `expected a projection for ${JSON.stringify(overrides)}`);
  return result;
}

describe("defaults match the spec's worked example", () => {
  it("produces the seven printed figures and the unprinted yearly profit", () => {
    const result = projected();

    assert.equal(result.conversionsPerMonth, 60);
    assert.equal(result.monthlyRevenue, 12_000);
    assert.equal(result.monthlyProfit, -1_400);
    assert.equal(result.roiPercent, 140);
    assert.equal(result.yearlyRevenue, 144_000);
    assert.equal(result.yearlyProfit, -16_800);
    assert.equal(result.costPerAcquisition, 5_000 / 60);
    assert.equal(result.breakEvenConversions, 5_000 / 60);
  });

  it("formats those figures the way the original page printed them", () => {
    const result = projected();

    assert.equal(formatRoiCurrency(result.monthlyRevenue), "$12,000");
    assert.equal(formatRoiCurrency(result.monthlyProfit), "-$1,400");
    assert.equal(formatRoiDecimal1(result.roiPercent), "140.0");
    assert.equal(formatRoiDecimal1(result.conversionsPerMonth), "60.0");
    assert.equal(formatRoiCurrency(result.costPerAcquisition), "$83");
    assert.equal(formatRoiCurrency(result.yearlyRevenue), "$144,000");
    assert.equal(formatRoiDecimal1(result.breakEvenConversions), "83.3");
  });

  it("shows the strong banner at the defaults, because ROI is on revenue", () => {
    const result = projected();
    assert.equal(roiBanner(result.roiPercent), "strong");
    assert.ok(result.monthlyProfit < 0, "the default load is a loss sitting next to a 140 percent return");
  });
});

describe("industry presets, holding the other four defaults", () => {
  function fromIndustry(id: IndustryId) {
    return projected(industryFill(id));
  }

  it("ecommerce shows 20 percent ROI against a 3200 monthly loss", () => {
    const result = fromIndustry("ecommerce");
    assert.equal(result.roiPercent, 20);
    assert.equal(result.monthlyProfit, -3_200);
    assert.equal(roiBanner(result.roiPercent), null);
  });

  it("nonprofit shows 80 percent ROI against a 2300 monthly loss", () => {
    const result = fromIndustry("nonprofit");
    assert.equal(result.roiPercent, 80);
    assert.equal(result.monthlyProfit, -2_300);
    assert.equal(roiBanner(result.roiPercent), null);
  });

  it("saas, lead-gen, local-services and fintech land both ROI and profit positive", () => {
    for (const id of ["saas", "lead-gen", "local-services", "fintech"] as const) {
      const result = fromIndustry(id);
      assert.ok(result.roiPercent > 0, `${id} ROI`);
      assert.ok(result.monthlyProfit > 0, `${id} profit`);
    }
  });

  it("writes conversion rate and order value only", () => {
    const fill = industryFill("fintech");
    assert.deepEqual(Object.keys(fill).sort(), ["aov", "convRate"]);
    assert.equal(fill.convRate, INDUSTRY_BY_ID.fintech.conversionRate);
    assert.equal(fill.aov, INDUSTRY_BY_ID.fintech.avgOrderValue);
  });

  it("keeps the six rows in the original object's order, with those rates and values", () => {
    assert.deepEqual(
      INDUSTRIES.map((row) => [row.id, row.conversionRate, row.avgOrderValue]),
      [
        ["ecommerce", 2.5, 120],
        ["saas", 3, 500],
        ["lead-gen", 4.5, 250],
        ["local-services", 5, 350],
        ["fintech", 2.8, 800],
        ["nonprofit", 6, 75],
      ],
    );
  });
});

describe("the eight formulas", () => {
  it("evaluates conversions left to right: ((budget / cpc) * convRate) / 100", () => {
    const { budget, convRate, cpc } = ROI_DEFAULTS;
    const result = projected();
    assert.equal(result.conversionsPerMonth, ((budget / cpc) * convRate) / 100);
  });

  it("computes ROI on revenue, so margin is not in that line", () => {
    const withMargin = projected({ margin: 30 });
    const without = projected({ margin: 5 });
    assert.equal(withMargin.roiPercent, without.roiPercent);
    assert.notEqual(withMargin.monthlyProfit, without.monthlyProfit);
  });

  it("treats every conversion as one order at the entered value", () => {
    const result = projected({ aov: 200 });
    assert.equal(result.monthlyRevenue, result.conversionsPerMonth * 200);
  });

  it("subtracts the whole ad budget from margin-dollars, with no other cost", () => {
    const result = projected();
    assert.equal(result.monthlyProfit, (result.monthlyRevenue * ROI_DEFAULTS.margin) / 100 - ROI_DEFAULTS.budget);
  });

  it("multiplies monthly figures by twelve, with no growth", () => {
    const result = projected();
    assert.equal(result.yearlyRevenue, result.monthlyRevenue * 12);
    assert.equal(result.yearlyProfit, result.monthlyProfit * 12);
  });

  it("takes cost per acquisition as budget over conversions", () => {
    const result = projected();
    assert.equal(result.costPerAcquisition, ROI_DEFAULTS.budget / result.conversionsPerMonth);
  });

  it("takes break-even conversions as budget over gross profit per order", () => {
    const { budget, aov, margin } = ROI_DEFAULTS;
    const result = projected();
    assert.equal(result.breakEvenConversions, budget / ((aov * margin) / 100));
  });
});

describe("the guard", () => {
  it("returns null when budget, order value, conversion rate or CPC is zero or negative", () => {
    assert.equal(projectRoi(at({ budget: 0 })), null);
    assert.equal(projectRoi(at({ budget: -1 })), null);
    assert.equal(projectRoi(at({ aov: 0 })), null);
    assert.equal(projectRoi(at({ aov: -10 })), null);
    assert.equal(projectRoi(at({ convRate: 0 })), null);
    assert.equal(projectRoi(at({ convRate: -1 })), null);
    assert.equal(projectRoi(at({ cpc: 0 })), null);
    assert.equal(projectRoi(at({ cpc: -0.1 })), null);
  });

  it("does not put margin in the guard: at margin 0 the results still render", () => {
    const result = projected({ margin: 0 });
    assert.equal(result.monthlyProfit, -ROI_DEFAULTS.budget);
    assert.equal(result.breakEvenConversions, 0);
    assert.equal(formatRoiDecimal1(result.breakEvenConversions), "0.0");
  });

  it("returns null for non-finite inputs rather than printing NaN", () => {
    assert.equal(projectRoi(at({ aov: Number.NaN })), null);
    assert.equal(projectRoi(at({ cpc: Number.POSITIVE_INFINITY })), null);
  });
});

describe("banners", () => {
  it("is negative below zero, strong at 100 or above, and absent between", () => {
    assert.equal(roiBanner(-0.1), "negative");
    assert.equal(roiBanner(0), null);
    assert.equal(roiBanner(99.9), null);
    assert.equal(roiBanner(100), "strong");
    assert.equal(roiBanner(140), "strong");
  });
});

describe("formatters", () => {
  it("prints conversion rate and margin as the raw number plus a percent sign", () => {
    assert.equal(formatRoiPercentRaw(3), "3%");
    assert.equal(formatRoiPercentRaw(2.5), "2.5%");
  });

  it("uses the original slider bounds", () => {
    assert.deepEqual(ROI_BOUNDS.budget, { min: 500, max: 50_000, step: 500 });
    assert.deepEqual(ROI_BOUNDS.convRate, { min: 0.5, max: 15, step: 0.1 });
    assert.deepEqual(ROI_BOUNDS.margin, { min: 5, max: 80, step: 1 });
  });
});

describe("the page does not submit, store, or invent a missing formula", () => {
  it("computes in shared code the page can import, with no fetch in that module", () => {
    const source = readFileSync(new URL("../shared/roi.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bsessionStorage\b/);
  });

  it("names yearlyProfit as recovered and unrendered, and guesses at nothing", () => {
    const source = readFileSync(new URL("../shared/roi.ts", import.meta.url), "utf8");
    assert.match(source, /yearlyProfit/);
    assert.match(source, /No formula in the spec was left unread/);
  });

  it("renders no Yearly Profit tile and posts nothing", () => {
    const page = readFileSync(new URL("../client/src/pages/roi-calculator.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /Yearly Profit/);
    assert.doesNotMatch(page, /\bfetch\s*\(/);
    assert.doesNotMatch(page, /\buseMutation\b/);
    assert.doesNotMatch(page, /\bapiRequest\b/);
    assert.doesNotMatch(page, /\blocalStorage\b/);
    assert.doesNotMatch(page, /\bsessionStorage\b/);
    assert.doesNotMatch(page, /\bonSubmit\b/);
    assert.doesNotMatch(page, /<form/);
  });
});
