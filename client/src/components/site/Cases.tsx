import { CASES, casesForDoor, type CaseStudy } from "@shared/cases";
import { HEADING, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * THE CASES
 *
 * Twenty-two of them, read out of shared/cases.ts, which is generated from
 * every case study published on top-rated.team. Nothing is written here and
 * nothing is invented: a case study is a claim about somebody else's account,
 * and the only defensible version is the one already published.
 *
 * THE STRUCTURE IS THE ARGUMENT, and it is why these read as work rather than
 * as boasting. Each one goes: what was wrong, what it had to do, what was
 * actually done — as the list it was — and then the numbers. A reader who knows
 * the trade reads the Work Done list and can tell whether we understood the
 * account; the percentages alone would tell them nothing except that we are
 * willing to print percentages.
 *
 * NO SCREENSHOTS, and that is deliberate rather than unfinished. The source
 * page carries four images: the logo twice and two tracking pixels. There is
 * nothing to migrate, and manufacturing account screenshots to sit beside a
 * result would be inventing the evidence for a claim. The metrics table is the
 * visual, set in tabular figures so a column of numbers lines up.
 * ------------------------------------------------------------------------- */

function Metrics({ metrics }: { metrics: CaseStudy["metrics"] }) {
  if (metrics.length === 0) return null;
  return (
    <dl className="m-0 grid grid-cols-[1fr_auto_auto] items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]">
      {metrics.map((metric) => (
        <div key={metric.label} className="col-span-3 grid grid-cols-subgrid items-baseline">
          <dt className={META}>{metric.label}</dt>
          <dd className="type-body m-0 tabular-nums">{metric.value}</dd>
          {/* The direction is in the sign the source published. A minus on cost
              per conversion is the good one, so nothing here colours a sign
              green or red — that would need to know which way each metric
              should move, and getting it wrong on one row discredits the rest. */}
          <dd className="type-body m-0 font-medium tabular-nums text-primary">{metric.change}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CaseEntry({ entry, index }: { entry: CaseStudy; index?: number }) {
  return (
    <article
      id={entry.slug}
      data-testid="block-case-study"
      className="scroll-mt-[var(--s5)] border-t border-border pt-[var(--s3)]"
    >
      <div className="grid gap-[var(--s3)] lg:grid-cols-[minmax(0,36ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
        <div>
          {typeof index === "number" ? (
            <p className={`${META} tabular-nums`}>{String(index + 1).padStart(2, "0")}</p>
          ) : null}
          <h3 className={`mt-[var(--s1)] ${HEADING}`} data-testid="text-case-client">
            {entry.client}
          </h3>
          <p className={`mt-[var(--s1)] ${META}`}>
            {[entry.industry, entry.place, entry.budget].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-[var(--s3)]">
            <Metrics metrics={entry.metrics} />
          </div>
        </div>

        <div className="flex flex-col gap-[var(--s2)]">
          {entry.challenge ? (
            <p className={READ_MUTED}>
              <span className="font-medium text-foreground">What was wrong. </span>
              {entry.challenge}
            </p>
          ) : null}
          {entry.objective ? (
            <p className={READ_MUTED}>
              <span className="font-medium text-foreground">What it had to do. </span>
              {entry.objective}
            </p>
          ) : null}
          {entry.work.length > 0 ? (
            <div>
              <p className={META}>What was done</p>
              <ul className="mt-[var(--s1)] list-none space-y-[var(--s1)] p-0">
                {entry.work.map((line) => (
                  <li key={line} className={READ}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Every case, for /case-studies. */
export function AllCases() {
  return (
    <section className={`${PAGE} pt-[var(--s5)]`} data-testid="list-cases">
      <div className="flex flex-col gap-[var(--s4)]">
        {CASES.map((entry, index) => (
          <CaseEntry key={entry.slug} entry={entry} index={index} />
        ))}
      </div>
    </section>
  );
}

/**
 * This door's cases, or nothing. Five doors have none, and they render no
 * section at all: an absence says nothing, where a line explaining the absence
 * would draw a reader's attention to it.
 */
export function DoorCases({ doorId }: { doorId: string }) {
  const entries = casesForDoor(doorId);
  if (entries.length === 0) return null;

  return (
    <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-door-cases">
      <div className="border-t border-border pt-[var(--s3)]">
        <p className={META}>What this work did</p>
        <p className={`mt-[var(--s2)] max-w-[62ch] ${READ_MUTED}`}>
          {entries.length === 1
            ? "One account, and what changed in it."
            : `${entries.length} accounts, and what changed in them.`}{" "}
          Every figure is the one published on top-rated.team, and the list of what was done is the list as it was
          written.
        </p>
      </div>
      <div className="mt-[var(--s4)] flex flex-col gap-[var(--s4)]">
        {entries.map((entry) => (
          <CaseEntry key={entry.slug} entry={entry} />
        ))}
      </div>
    </section>
  );
}

export default AllCases;
