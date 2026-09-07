/* ---------------------------------------------------------------------------
 * TWO RESULTS
 *
 * What is left of a band that carried four statistics — hours delivered, a job
 * success score, ad spend managed, years in paid ads — above two case cards
 * with a ring around the better one. The statistics went because none of them
 * is evidence about the work: they are a marketplace profile, and the research
 * on what comparable sites do in 2026 found the static stat strip gone
 * everywhere it looked.
 *
 * These two stay because each is a named piece of work with a number attached
 * and a reason the number moved, and because the paragraph under them says what
 * they are not.
 * ------------------------------------------------------------------------- */

interface CaseLine {
  headline: string;
  note: string;
}

const CASES: CaseLine[] = [
  {
    headline: "+180% conversion growth",
    note: "Commercial proxies, offline conversions only. Nothing was bought on the website, so every conversion that mattered came back from the CRM — which meant the measurement had to be built before the bidding was worth touching.",
  },
  {
    headline: "+477% conversion growth, −81% cost per conversion",
    note: "An account previously run with incorrectly configured conversions. The campaigns were not the problem: the auction had been buying the wrong clicks with real budget for months.",
  },
];

export function Results() {
  return (
    <section className="mx-auto grid max-w-[var(--page)] grid-cols-1 gap-[var(--s4)] px-[var(--s3)] pt-[var(--s6)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
      {CASES.map((entry) => (
        <div key={entry.headline} data-testid="block-case">
          <span className="type-body font-display font-medium">{entry.headline}</span>
          <p className="type-body mt-[var(--s2)]">{entry.note}</p>
        </div>
      ))}

      <p className="type-note text-muted-foreground lg:col-span-2">
        Both of those are Google Ads accounts, because ChatGPT Ads conversion tracking shipped in mid-2026 and anyone
        claiming years of results on it is selling you something. The measurement work is the same work: decide the
        event, install it properly, prove it in the platform.
      </p>
    </section>
  );
}

export default Results;
