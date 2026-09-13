import { Link } from "wouter";

import {
  ACCOUNTS_PROCESSED,
  CASE_STUDIES_HREF,
  HOURS_ON_UPWORK,
  JOB_SUCCESS,
  PUBLISHED_CASES,
  UPWORK_AGENCY_URL,
  testimonialsFor,
  workLine,
  type Testimonial,
  type TestimonialSite,
} from "@shared/testimonials";
import { HEADING, LINK, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * WHAT PEOPLE WHO HIRED US WROTE
 *
 * Filled from shared/testimonials.ts and nowhere else. A row without a sourced
 * quotation is not a row. If that file is empty, this section is not on the
 * page — an invented sentence with a name attached is the thing the parcel
 * forbids, and a hidden section is the honest empty state.
 *
 * The copy around the quotations is ours: what the work is, and the numbers
 * this repository already measures. No new figures, no marketing verbs.
 * ------------------------------------------------------------------------- */

function attribution(entry: Testimonial): string {
  const who = entry.saidBy ?? entry.title;
  return entry.when ? `${who} · ${entry.when}` : who;
}

function Framing({ site }: { site: TestimonialSite }) {
  if (site === "adgrant") {
    return (
      <p className={`mt-[var(--s2)] max-w-[46ch] ${READ_MUTED}`}>
        The same team. The work is {workLine()}. The {ACCOUNTS_PROCESSED} Ad Grant accounts on this page are
        accounts this product has processed. The words below are from people who hired that team for Google Ads
        work, published on the public Upwork record — they are not Ad Grant clients.
      </p>
    );
  }

  return (
    <p className={`mt-[var(--s2)] max-w-[46ch] ${READ_MUTED}`}>
      The work is {workLine()}. The {HOURS_ON_UPWORK} hours and the {JOB_SUCCESS} job-success score are the public
      record on Upwork. The account results are the {PUBLISHED_CASES} published on this site.
    </p>
  );
}

export function Testimonials({ site = "main" }: { site?: TestimonialSite }) {
  const entries = testimonialsFor(site);
  if (entries.length === 0) return null;

  return (
    <section className={`${PAGE} pt-[var(--s6)]`} id="testimonials" data-testid="block-testimonials">
      <div className="border-t border-border pt-[var(--s3)]">
        <p className={META}>From the public record</p>
        <h2 className={`mt-[var(--s2)] ${HEADING}`}>What people who hired us wrote</h2>
        <Framing site={site} />
      </div>

      <ol className="mt-[var(--s4)] list-none p-0">
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-testid="item-testimonial"
            className="border-t border-border py-[var(--s3)] last:border-b"
          >
            <blockquote className={`m-0 max-w-[62ch] ${READ}`}>{entry.quote}</blockquote>
            <p className={`mt-[var(--s2)] ${META}`}>{attribution(entry)}</p>
            <p className={`mt-[var(--s1)] ${META}`}>
              <a
                href={entry.source.href}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
                data-testid="link-testimonial-source"
              >
                {entry.source.label}
              </a>
            </p>
          </li>
        ))}
      </ol>

      <p className={`mt-[var(--s3)] ${META}`}>
        <a
          href={UPWORK_AGENCY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
          data-testid="link-testimonials-upwork"
        >
          The public reviews on Upwork
        </a>
        <span className="text-muted-foreground"> · </span>
        {site === "adgrant" ? (
          <a href={CASE_STUDIES_HREF} className={LINK} data-testid="link-testimonials-cases">
            The {PUBLISHED_CASES} published accounts
          </a>
        ) : (
          <Link href="/case-studies" className={LINK} data-testid="link-testimonials-cases">
            The {PUBLISHED_CASES} published accounts
          </Link>
        )}
      </p>
    </section>
  );
}

export default Testimonials;
