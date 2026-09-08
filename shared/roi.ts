/**
 * Google Ads ROI arithmetic, recovered from the original page's own JavaScript
 * (docs/specs/roi-calculator.md, captured 2026-09-08).
 *
 * A visitor will quote these numbers. The operators, operands and order of
 * operations below are the shipped code. Variable names are this file's.
 *
 * ROI IS COMPUTED ON REVENUE, NOT ON PROFIT. `margin` does not appear in
 * `roiPercent`. `monthlyProfit` right beside it does apply the margin. That is
 * not a rewrite decision: it is what the original computed, and changing it
 * would change every figure the tool has ever shown. The page prints this next
 * to the numbers so a visitor does not read 140 percent as a profit return.
 *
 * The original computed eight values and rendered seven. `yearlyProfit` is the
 * eighth — kept, tested, and not shown, because the original never printed a
 * Yearly Profit tile. No formula in the spec was left unread.
 */

export type IndustryId =
  | "ecommerce"
  | "saas"
  | "lead-gen"
  | "local-services"
  | "fintech"
  | "nonprofit";

export interface IndustryBenchmark {
  id: IndustryId;
  /** The select option, verbatim from the original. */
  label: string;
  conversionRate: number;
  avgOrderValue: number;
}

/**
 * One object drove both the auto-fill and the table at the bottom of the
 * original page. Provenance was not stated there: no source, date, sample or
 * geography. These are that object's numbers, in that object's order.
 */
export const INDUSTRIES: readonly IndustryBenchmark[] = [
  { id: "ecommerce", label: "eCommerce", conversionRate: 2.5, avgOrderValue: 120 },
  { id: "saas", label: "SaaS / Software", conversionRate: 3, avgOrderValue: 500 },
  { id: "lead-gen", label: "B2B Lead Generation", conversionRate: 4.5, avgOrderValue: 250 },
  { id: "local-services", label: "Local Services", conversionRate: 5, avgOrderValue: 350 },
  { id: "fintech", label: "FinTech", conversionRate: 2.8, avgOrderValue: 800 },
  { id: "nonprofit", label: "Nonprofit", conversionRate: 6, avgOrderValue: 75 },
];

export const INDUSTRY_BY_ID: Record<IndustryId, IndustryBenchmark> = Object.fromEntries(
  INDUSTRIES.map((row) => [row.id, row]),
) as Record<IndustryId, IndustryBenchmark>;

export const ROI_DEFAULTS = {
  budget: 5000,
  aov: 200,
  convRate: 3,
  margin: 30,
  cpc: 2.5,
} as const;

export const ROI_BOUNDS = {
  budget: { min: 500, max: 50_000, step: 500 },
  convRate: { min: 0.5, max: 15, step: 0.1 },
  margin: { min: 5, max: 80, step: 1 },
} as const;

export interface RoiInputs {
  budget: number;
  aov: number;
  convRate: number;
  margin: number;
  cpc: number;
}

export interface RoiProjection {
  conversionsPerMonth: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  roiPercent: number;
  yearlyRevenue: number;
  yearlyProfit: number;
  costPerAcquisition: number;
  breakEvenConversions: number;
}

/**
 * Choosing an industry writes these two fields and only these two. It does not
 * touch budget, profit margin or CPC.
 */
export function industryFill(id: IndustryId): Pick<RoiInputs, "convRate" | "aov"> {
  const row = INDUSTRY_BY_ID[id];
  return { convRate: row.conversionRate, aov: row.avgOrderValue };
}

/**
 * The original guard, plus a finite check the original did not need.
 *
 * Shipped code: `if (budget <= 0 || aov <= 0 || convRate <= 0 || cpc <= 0) return null`.
 * `margin` is not in it. `NaN <= 0` is false, so a NaN input would have printed
 * the literal strings "NaN" and the currency form of NaN. That is not reachable
 * through `type="number"` (invalid content reports as empty, which is 0), and
 * printing it would be the failure this file exists to prevent. Non-finite
 * inputs therefore return null as well. Reachable behaviour is unchanged.
 */
function unusable(inputs: RoiInputs): boolean {
  const { budget, aov, convRate, cpc } = inputs;
  if (![budget, aov, convRate, cpc].every(Number.isFinite)) return true;
  return budget <= 0 || aov <= 0 || convRate <= 0 || cpc <= 0;
}

export function projectRoi(inputs: RoiInputs): RoiProjection | null {
  if (unusable(inputs)) return null;

  const { budget, aov, convRate, margin, cpc } = inputs;

  const conversionsPerMonth = (((budget / cpc) * convRate) / 100);
  const monthlyRevenue = conversionsPerMonth * aov;
  const monthlyProfit = (monthlyRevenue * margin) / 100 - budget;
  const roiPercent = ((monthlyRevenue - budget) / budget) * 100;
  const yearlyRevenue = monthlyRevenue * 12;
  const yearlyProfit = monthlyProfit * 12;
  const costPerAcquisition = conversionsPerMonth > 0 ? budget / conversionsPerMonth : 0;
  const breakEvenConversions = margin > 0 ? budget / ((aov * margin) / 100) : 0;

  return {
    conversionsPerMonth,
    monthlyRevenue,
    monthlyProfit,
    roiPercent,
    yearlyRevenue,
    yearlyProfit,
    costPerAcquisition,
    breakEvenConversions,
  };
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const decimal1 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatRoiCurrency(value: number): string {
  return currency.format(value);
}

export function formatRoiDecimal1(value: number): string {
  return decimal1.format(value);
}

/**
 * Conversion rate and profit margin next to their sliders: the raw number plus
 * a percent sign, not run through a formatter. 2.5 prints "2.5%" and 3 prints
 * "3%".
 */
export function formatRoiPercentRaw(value: number): string {
  return `${value}%`;
}

/** At most one of these, and both can be absent. Thresholds are the original's. */
export type RoiBanner = "negative" | "strong";

export function roiBanner(roiPercent: number): RoiBanner | null {
  if (roiPercent < 0) return "negative";
  if (roiPercent >= 100) return "strong";
  return null;
}
