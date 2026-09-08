import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import TalkToUs from "@/components/site/TalkToUs";
import {
  DISPLAY,
  HEADING,
  LINK,
  META,
  META_PLAIN,
  PAGE,
  READ,
  READ_MUTED,
} from "@/components/site/doors/quiet";
import {
  formatRoiCurrency,
  formatRoiDecimal1,
  formatRoiPercentRaw,
  INDUSTRIES,
  industryFill,
  projectRoi,
  ROI_BOUNDS,
  ROI_DEFAULTS,
  roiBanner,
  type IndustryId,
} from "@shared/roi";

/* ---------------------------------------------------------------------------
 * /roi-calculator
 *
 * One of the fourteen addresses that has to keep answering when this
 * application moves onto top-rated.team. The arithmetic is in shared/roi.ts
 * and is the original page's, recovered from its own JavaScript. This file is
 * the controls, the seven printed figures, and the assumptions printed next to
 * them — not under an asterisk.
 *
 * ROI is on revenue, not on profit. That is not a rewrite choice; it is what
 * the original computed. Changing it would change every figure the tool has
 * ever shown. The sentence beside Return on Investment says so.
 *
 * Dropped, because they are not true of this application as it stands, or
 * because the spec itself flagged them:
 * a "500+ clients" claim this repository does not record; a /contact button
 * (that address 301s to /); "Great potential!" and "Free Tool" as chrome;
 * a sourced "industry benchmarks" table whose source, date, sample and
 * geography the original never named. The table is still here. It is named as
 * the figures this page writes in, which is what the code does.
 *
 * Nothing is submitted. There is no form action, no fetch, no storage.
 * ------------------------------------------------------------------------- */

const TITLE = "Google Ads ROI Calculator — Top-Rated Team";
const DESCRIPTION =
  "Six campaign figures go in. Seven come out. The arithmetic is the original page's. Nothing is sent anywhere; a reload clears the numbers.";

const FIELD =
  "type-body w-full border-0 border-b border-input bg-transparent py-[var(--s1)] tabular-nums text-foreground " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const SLIDER = "w-full accent-primary";

const FIGURE = `${READ} m-0 font-display font-medium tabular-nums`;

export default function RoiCalculator() {
  const [industry, setIndustry] = useState("");
  const [budget, setBudget] = useState<number>(ROI_DEFAULTS.budget);
  const [aovInput, setAovInput] = useState(String(ROI_DEFAULTS.aov));
  const [convRate, setConvRate] = useState<number>(ROI_DEFAULTS.convRate);
  const [margin, setMargin] = useState<number>(ROI_DEFAULTS.margin);
  const [cpcInput, setCpcInput] = useState(String(ROI_DEFAULTS.cpc));

  const aov = Number(aovInput);
  const cpc = Number(cpcInput);

  const projection = useMemo(
    () => projectRoi({ budget, aov, convRate, margin, cpc }),
    [budget, aov, convRate, margin, cpc],
  );

  useEffect(() => {
    const previousTitle = document.title;
    document.title = TITLE;

    let created = false;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
      created = true;
    }
    const element = meta;
    const previousDescription = element.content;
    element.content = DESCRIPTION;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, []);

  function onIndustry(next: string) {
    setIndustry(next);
    if (!next) return;
    const fill = industryFill(next as IndustryId);
    setConvRate(fill.convRate);
    setAovInput(String(fill.aov));
  }

  return (
    <div className="min-h-screen bg-background" data-site-chrome>
      <Header />
      <main>
        <section className={`${PAGE} pt-[var(--s5)]`}>
          <p className={META}>Calculator</p>
          <h1 className={`${DISPLAY} m-0 mt-[var(--s2)]`} data-testid="text-roi-headline">
            Google Ads ROI Calculator
          </h1>
          <p className={`mt-[var(--s3)] max-w-[62ch] ${READ_MUTED}`}>
            Type the campaign figures. The page recomputes on every change. Nothing is submitted; a reload
            clears the numbers.
          </p>
        </section>

        <section
          className={`${PAGE} grid gap-[var(--s5)] pt-[var(--s5)] lg:grid-cols-2 lg:gap-[var(--s6)]`}
        >
          <div data-testid="block-roi-inputs">
            <h2 className={`${HEADING} m-0`}>Campaign Parameters</h2>
            <p className={`mt-[var(--s1)] ${META_PLAIN}`}>Adjust the sliders or input your own values</p>

            <div className="mt-[var(--s3)] flex flex-col gap-[var(--s3)]">
              <label className="block">
                <span className={META}>Industry</span>
                <select
                  value={industry}
                  onChange={(event) => onIndustry(event.target.value)}
                  data-testid="select-roi-industry"
                  className={`${FIELD} mt-[var(--s1)] [text-transform:none]`}
                >
                  <option value="">Select your industry</option>
                  {INDUSTRIES.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
                <span className={`mt-[var(--s1)] block ${META_PLAIN}`}>
                  Picking one writes conversion rate and average order value from the table at the bottom of
                  this page. It does not change budget, profit margin or cost per click.
                </span>
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between gap-[var(--s2)]">
                  <span className={META}>Monthly Ad Budget</span>
                  <span className={`${META} tabular-nums text-foreground`} data-testid="text-roi-budget-value">
                    {formatRoiCurrency(budget)}
                  </span>
                </span>
                <input
                  type="range"
                  min={ROI_BOUNDS.budget.min}
                  max={ROI_BOUNDS.budget.max}
                  step={ROI_BOUNDS.budget.step}
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                  data-testid="slider-roi-budget"
                  className={`${SLIDER} mt-[var(--s2)]`}
                />
                <span className={`mt-[var(--s1)] flex justify-between ${META} tabular-nums`}>
                  <span>{formatRoiCurrency(ROI_BOUNDS.budget.min)}</span>
                  <span>{formatRoiCurrency(ROI_BOUNDS.budget.max)}</span>
                </span>
              </label>

              <label className="block">
                <span className={META}>Average Order Value / Lead Value</span>
                <span className="mt-[var(--s1)] flex items-baseline gap-[var(--s1)]">
                  <span className={`${READ} text-muted-foreground`}>$</span>
                  <input
                    type="number"
                    value={aovInput}
                    onChange={(event) => setAovInput(event.target.value)}
                    data-testid="input-roi-aov"
                    className={FIELD}
                  />
                </span>
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between gap-[var(--s2)]">
                  <span className={META}>Conversion Rate</span>
                  <span className={`${META} tabular-nums text-foreground`} data-testid="text-roi-conv-value">
                    {formatRoiPercentRaw(convRate)}
                  </span>
                </span>
                <input
                  type="range"
                  min={ROI_BOUNDS.convRate.min}
                  max={ROI_BOUNDS.convRate.max}
                  step={ROI_BOUNDS.convRate.step}
                  value={convRate}
                  onChange={(event) => setConvRate(Number(event.target.value))}
                  data-testid="slider-roi-conv"
                  className={`${SLIDER} mt-[var(--s2)]`}
                />
                <span className={`mt-[var(--s1)] flex justify-between ${META} tabular-nums`}>
                  <span>{formatRoiPercentRaw(ROI_BOUNDS.convRate.min)}</span>
                  <span>{formatRoiPercentRaw(ROI_BOUNDS.convRate.max)}</span>
                </span>
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between gap-[var(--s2)]">
                  <span className={META}>Profit Margin</span>
                  <span className={`${META} tabular-nums text-foreground`} data-testid="text-roi-margin-value">
                    {formatRoiPercentRaw(margin)}
                  </span>
                </span>
                <input
                  type="range"
                  min={ROI_BOUNDS.margin.min}
                  max={ROI_BOUNDS.margin.max}
                  step={ROI_BOUNDS.margin.step}
                  value={margin}
                  onChange={(event) => setMargin(Number(event.target.value))}
                  data-testid="slider-roi-margin"
                  className={`${SLIDER} mt-[var(--s2)]`}
                />
                <span className={`mt-[var(--s1)] flex justify-between ${META} tabular-nums`}>
                  <span>{formatRoiPercentRaw(ROI_BOUNDS.margin.min)}</span>
                  <span>{formatRoiPercentRaw(ROI_BOUNDS.margin.max)}</span>
                </span>
              </label>

              <label className="block">
                <span className={META}>Cost Per Click (CPC)</span>
                <span className="mt-[var(--s1)] flex items-baseline gap-[var(--s1)]">
                  <span className={`${READ} text-muted-foreground`}>$</span>
                  <input
                    type="number"
                    step={0.1}
                    value={cpcInput}
                    onChange={(event) => setCpcInput(event.target.value)}
                    data-testid="input-roi-cpc"
                    className={FIELD}
                  />
                </span>
              </label>
            </div>
          </div>

          <div data-testid="block-roi-results">
            <h2 className={`${HEADING} m-0`}>Projected Results</h2>
            <p className={`mt-[var(--s1)] ${META_PLAIN}`}>Based on your campaign parameters</p>

            {projection ? (
              <Results projection={projection} />
            ) : (
              <p className={`mt-[var(--s3)] ${READ_MUTED}`} data-testid="text-roi-empty">
                Adjust the parameters to see projected results
              </p>
            )}
          </div>
        </section>

        <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-roi-benchmarks">
          <h2 className={`${HEADING} m-0`}>Industry Conversion Rate Benchmarks</h2>
          <p className={`mt-[var(--s1)] max-w-[62ch] ${READ_MUTED}`}>
            These are the conversion rate and order value this page writes in when you pick an industry. The
            original page called them industry benchmarks and named no source, date, sample or geography.
            Neither does this one.
          </p>
          <ul className="m-0 mt-[var(--s3)] grid list-none grid-cols-1 gap-x-[var(--s4)] p-0 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map((row) => (
              <li key={row.id} className="border-t border-border py-[var(--s2)]">
                <p className={`${HEADING} m-0`}>{row.label}</p>
                <dl className="m-0 mt-[var(--s1)] grid grid-cols-[auto_1fr] items-baseline gap-x-[var(--s2)]">
                  <dt className={META}>Avg. Conversion Rate</dt>
                  <dd className={`m-0 ${META} tabular-nums text-foreground`}>
                    {formatRoiPercentRaw(row.conversionRate)}
                  </dd>
                  <dt className={META}>Avg. Order Value</dt>
                  <dd className={`m-0 ${META} tabular-nums text-foreground`}>
                    {formatRoiCurrency(row.avgOrderValue)}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${PAGE} pt-[var(--s5)]`}>
          <p className={`max-w-[62ch] ${READ_MUTED}`}>
            This is a calculator, not an account. The{" "}
            <Link href="/services/google-ads" data-testid="link-roi-google-ads" className={LINK}>
              Google Ads door
            </Link>{" "}
            is the work.
          </p>
        </section>

        <TalkToUs className="pt-[var(--s6)] pb-[var(--s5)]" />
      </main>
      <Footer />
    </div>
  );
}

function Results({
  projection,
}: {
  projection: NonNullable<ReturnType<typeof projectRoi>>;
}) {
  const banner = roiBanner(projection.roiPercent);
  const profitTone = projection.monthlyProfit >= 0 ? "text-primary" : "text-destructive";
  const roiTone = projection.roiPercent >= 0 ? "text-primary" : "text-destructive";

  return (
    <div className="mt-[var(--s3)]">
      <dl className="m-0 grid grid-cols-1 gap-x-[var(--s4)] gap-y-[var(--s3)] sm:grid-cols-2">
        <Tile
          label="Monthly Revenue"
          value={formatRoiCurrency(projection.monthlyRevenue)}
          testId="text-roi-monthly-revenue"
        />
        <Tile
          label="Monthly Profit"
          value={formatRoiCurrency(projection.monthlyProfit)}
          testId="text-roi-monthly-profit"
          valueClassName={profitTone}
        />
      </dl>

      <div className="mt-[var(--s3)] border-t border-border pt-[var(--s3)]">
        <p className={META}>Return on Investment</p>
        <p className={`${FIGURE} ${roiTone}`} data-testid="text-roi-percent">
          {formatRoiDecimal1(projection.roiPercent)}%
        </p>
        <p className={`mt-[var(--s2)] max-w-[62ch] ${META_PLAIN}`} data-testid="text-roi-assumptions">
          Return on investment is (monthly revenue − budget) / budget. Profit margin is not in that line.
          Monthly profit is monthly revenue times the margin, minus the whole ad budget. Every conversion is
          counted as one order or lead at the value you entered. Yearly revenue is the monthly figure times
          twelve. There is no management fee in any of these sums. The original page printed no disclaimer;
          this paragraph is the formulas, in words.
        </p>
      </div>

      <dl className="m-0 mt-[var(--s3)] grid grid-cols-1 gap-x-[var(--s4)] gap-y-[var(--s3)] border-t border-border pt-[var(--s3)] sm:grid-cols-2">
        <Tile
          label="Conversions/Month"
          value={formatRoiDecimal1(projection.conversionsPerMonth)}
          testId="text-roi-conversions"
        />
        <Tile
          label="Cost per Acquisition"
          value={formatRoiCurrency(projection.costPerAcquisition)}
          testId="text-roi-cpa"
        />
        <Tile
          label="Yearly Revenue"
          value={formatRoiCurrency(projection.yearlyRevenue)}
          testId="text-roi-yearly-revenue"
        />
        <Tile
          label="Break-even Conversions"
          value={formatRoiDecimal1(projection.breakEvenConversions)}
          testId="text-roi-breakeven"
        />
      </dl>

      {banner === "negative" ? (
        <p className={`mt-[var(--s3)] max-w-[62ch] ${READ} text-destructive`} data-testid="text-roi-banner-negative">
          Current parameters show negative ROI. That figure is (revenue − budget) / budget. Conversion rate,
          order value and cost per click are the three inputs that move it.
        </p>
      ) : null}
      {banner === "strong" ? (
        <p className={`mt-[var(--s3)] max-w-[62ch] ${READ} text-primary`} data-testid="text-roi-banner-strong">
          Return on investment is 100 percent or more. That figure is (revenue − budget) / budget. Monthly
          profit, above, is the one that uses the margin.
        </p>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  testId,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  testId: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <dt className={META}>{label}</dt>
      <dd className={`${FIGURE} ${valueClassName}`} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
