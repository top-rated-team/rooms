/* ---------------------------------------------------------------------------
 * THE RECORD, THEN TWO RESULTS
 *
 * Two different kinds of number, deliberately set apart rather than in one
 * strip, because they are evidence of different things.
 *
 * The four in the first row are the standing record — hours delivered, job
 * success, spend managed, years. They are a marketplace profile: they say the
 * firm has been doing this for a while and been paid for it, and they say
 * nothing about any particular engagement. The redesign dropped them and the
 * owner put them back, so they are set as one quiet line of metadata rather
 * than as four bold figures in cards: read if you are checking whether these
 * people are real, skipped if you are not.
 *
 * The two below are the opposite: a named piece of work, a number, and the
 * reason the number moved. The paragraph at the end says what they are not.
 *
 * PROOF is read off shared/roster.ts, which is also what every agent recites
 * in its own instructions — so the site and the agents cannot disagree about
 * the firm's own record, which they did until now.
 * ------------------------------------------------------------------------- */

import { PROOF } from "@shared/roster";

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
      <dl
        data-testid="list-record"
        className="m-0 flex flex-wrap items-baseline gap-x-[var(--s4)] gap-y-[var(--s1)] border-b border-border pb-[var(--s3)]"
      >
        {PROOF.map((item) => (
          <div key={item.label} data-testid="stat-proof" className="flex items-baseline gap-[var(--s1)]">
            <dd className="type-body m-0 font-display font-medium tabular-nums">{item.value}</dd>
            <dt className="type-meta text-muted-foreground">{item.label.toLowerCase()}</dt>
          </div>
        ))}
      </dl>

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
