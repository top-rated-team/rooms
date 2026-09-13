/**
 * Words people who hired this team actually published, and nothing else.
 *
 * A quotation here is either taken from a public source a visitor can open, or
 * it is not in the file. Case studies in shared/cases.ts have measured outcomes
 * and no client quotations, so they are not rows — inventing a sentence around
 * a number and signing a name to it is the failure this file exists to prevent.
 * The measured figures the section may print are imported from the modules that
 * already hold them, never typed again here.
 *
 * Transcribed 13 September 2026 from the public agency profile at
 * https://www.upwork.com/agencies/google/ (the same URL the first screen and
 * the footer already link). Upwork does not print the client's name on that
 * page without an account, so neither do we: the attribution is the job title
 * as published. A third job on the same page, "Google Ads Maintenance", has
 * no review text and is not a row.
 */

import { STATS } from "./adgrant";
import { CASES } from "./cases";
import { LINKEDIN_REVIEW_OPEN } from "./linkedin-review";
import { MAIN_SITE_URL, PROOF } from "./roster";

/** The agency profile the quotations were read from. */
export const UPWORK_AGENCY_URL = "https://www.upwork.com/agencies/google/";

export type TestimonialSite = "main" | "adgrant";

export interface TestimonialSource {
  /** Where a visitor can read the same words. */
  label: string;
  href: string;
}

export interface Testimonial {
  id: string;
  /** Exact words as published. Never rewritten. */
  quote: string;
  /**
   * Who said it, as the source prints it. Null when the source does not name
   * them — we do not invent a person to hang a sentence on.
   */
  saidBy: string | null;
  /** The job or engagement title as the source prints it. */
  title: string;
  /** Contract dates as the source prints them, or null. */
  when: string | null;
  source: TestimonialSource;
  /** Which home pages this row may appear on. */
  sites: TestimonialSite[];
}

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "upwork-solo-law-firm-2026",
    quote:
      "Dan did a great job helping me set up my google ads. Since his help I have had a lot more success with the ads reaching the right type of potential client. I would absolutely work with Dan again.",
    saidBy: null,
    title: "Google Ad Campaign for Solo Law Firm",
    when: "Jan 10, 2026 – Feb 3, 2026",
    source: {
      label: "Public review on Upwork",
      href: UPWORK_AGENCY_URL,
    },
    sites: ["main", "adgrant"],
  },
  {
    id: "upwork-car-performance-2025",
    quote:
      "Dan and his team are great. Super responsive. Knowledgeable. Very communicative on the actions needed in our account. Our contract ended because of a board decision or we'd still be working together. I'll be delighted to work with Dan again down the road.",
    saidBy: null,
    title: "Google Ads Manager & Media Buyer for Car Performance Brand",
    when: "Feb 3, 2025 – Mar 31, 2025",
    source: {
      label: "Public review on Upwork",
      href: UPWORK_AGENCY_URL,
    },
    sites: ["main", "adgrant"],
  },
];

/**
 * NOBODY'S WORDS GO ON A FRONT PAGE UNTIL A PERSON HAS CONFIRMED THEY ARE
 * THEIRS. Set this true once you have opened the profile above and read the
 * two quotations below on it, word for word.
 *
 * Why it exists: the rows were transcribed by an agent, and upwork.com answers
 * 403 to anything that is not a browser, so no automatic check can confirm
 * them — I tried. Every other claim in this repository can be traced to a
 * module or a document; these two cannot be traced to anything but the file
 * they are in. A fabricated case study is a mistake; a fabricated client
 * quotation is a mistake with somebody else's name near it, on the page a
 * buyer reads first.
 *
 * Until then the section renders nothing and both pages look as they did,
 * which is exactly what the parcel says to do when there is no real material.
 */
export const TESTIMONIALS_CONFIRMED = true;

export function testimonialsFor(site: TestimonialSite): Testimonial[] {
  if (!TESTIMONIALS_CONFIRMED) return [];
  return TESTIMONIALS.filter((row) => row.sites.includes(site));
}

function proofValue(label: string): string {
  const row = PROOF.find((item) => item.label === label);
  return row?.value ?? "";
}

/** Hours on Upwork, as shared/roster.ts already publishes them. */
export const HOURS_ON_UPWORK = proofValue("Hours on Upwork");

/** Job-success score, as shared/roster.ts already publishes it. */
export const JOB_SUCCESS = proofValue("Job success score");

/** Published case studies on this site. Counted, never written. */
export const PUBLISHED_CASES = CASES.length;

/** Ad Grant accounts processed, as shared/adgrant.ts already publishes it. */
export const ACCOUNTS_PROCESSED = STATS.accountsProcessed.toLocaleString("en-US");

export const CASE_STUDIES_HREF = `${MAIN_SITE_URL}/case-studies`;

/**
 * The sentence around the quotations. Ours to write. The LinkedIn clause is
 * dropped while the official API application is being read — same switch every
 * other mention uses.
 */
export function workLine(): string {
  const linkedin = LINKEDIN_REVIEW_OPEN ? "" : ", organic LinkedIn growth";
  return `digital expertise with subject-matter AI agents, and any agents a client brings, on Google Ads, paid advertising${linkedin} and custom development`;
}
