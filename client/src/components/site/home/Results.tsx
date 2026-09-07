/* ---------------------------------------------------------------------------
 * TWO RESULTS
 *
 * A named piece of work, a number, and the reason the number moved. The
 * paragraph at the end says what they are not.
 *
 * The firm's four standing figures — hours, job success, spend, years — used to
 * sit above these. They are now one line of metadata on the first screen, where
 * the firm introduces itself, because they are a different kind of evidence:
 * they say these people are real and have been paid, and say nothing about any
 * particular engagement. Keeping the two kinds apart is the point.
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
    <section className="mx-auto max-w-[var(--page)] px-[var(--s3)] pt-[var(--s6)]">
      <div className="grid grid-cols-1 gap-[var(--s4)] pt-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
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
      </div>
    </section>
  );
}

export default Results;
