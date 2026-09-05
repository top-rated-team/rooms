import { PROOF } from "@shared/roster";

interface CaseLine {
  headline: string;
  context: string;
  note: string;
  emphasis?: boolean;
}

const CASES: CaseLine[] = [
  {
    headline: "+180% conversion growth",
    context: "Commercial proxies. Offline conversions only.",
    note: "Nothing was bought on the website. Every conversion that mattered came back from the CRM, which meant the measurement had to be built before the bidding was worth touching.",
  },
  {
    headline: "+477% conversion growth, −81% cost per conversion",
    context: "Account previously run with incorrectly configured conversions.",
    note: "The campaigns were not the problem. The account had been optimising against conversions that were counted wrong, so the auction had been buying the wrong clicks with real budget for months. Fixing the measurement is what moved the numbers.",
    emphasis: true,
  },
];

export function ProofBand() {
  return (
    <section id="proof" className="py-20 lg:py-28 bg-card border-y border-card-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {PROOF.map((item) => (
            <div key={item.label} data-testid="stat-proof">
              <dd className="text-4xl font-bold tracking-tight tabular-nums">{item.value}</dd>
              <dt className="mt-1 text-sm text-muted-foreground">{item.label}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {CASES.map((entry) => (
            <article
              key={entry.headline}
              data-testid="card-case"
              className={`rounded-lg border bg-background p-6 ${
                entry.emphasis ? "border-primary/30 ring-1 ring-primary/20" : "border-card-border"
              }`}
            >
              <h3 className={`text-xl font-semibold tracking-tight ${entry.emphasis ? "text-primary" : ""}`}>
                {entry.headline}
              </h3>
              <p className="mt-2 text-sm font-medium">{entry.context}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.note}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
          Both of those are Google Ads accounts, because ChatGPT Ads conversion tracking shipped in mid-2026 and anyone
          claiming years of results on it is selling you something. The measurement work is the same work: decide the
          event, install it properly, prove it in the platform.
        </p>
      </div>
    </section>
  );
}

export default ProofBand;
