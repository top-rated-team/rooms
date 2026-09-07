import { ADGRANT_ACCENT_WRAP, ADGRANT_HREF, ADGRANT_LIBRARY, ADGRANT_MARK } from "@/components/site/doors/adgrant-style";
import { HEADING, LINK, META_PLAIN, NUMERAL, PAGE, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * THE AD GRANTS DOOR'S OWN PAGE.
 *
 * The row in shared/doors.ts already names AdGrant.AI in one sentence. This is
 * the rest of what a visitor needs before they decide: what the tool actually
 * takes, why LinkedIn is on that form, and where the library lives.
 *
 * The library stays on adgrant.ai. Copying those 74 pages onto this domain
 * would put two copies of the same material in the index. Whether that site
 * later folds in is the owner's decision; this component links either way.
 *
 * Nothing here is a claim this repository cannot stand behind. The form itself
 * is on adgrant.ai. This codebase has no Google Ads connection, and the room
 * panel says so. The sentences below describe the tool on its own site.
 * ------------------------------------------------------------------------- */

interface Need {
  title: string;
  body: string;
}

const NEEDS: Need[] = [
  {
    title: "A Google Ad Grant the nonprofit already holds",
    body: "The tool writes into an existing grant account. It does not apply for the grant. If you have not got one yet, the tool's own page offers help getting one.",
  },
  {
    title: "The nonprofit website URL",
    body: "That URL has to be the domain authorised on the grant account. Subdomains of it are included by default. The page also lets you add another domain.",
  },
  {
    title: "The 10-digit Google Ads Customer ID",
    body: "The number in the top right of Google Ads, written 123-456-7890. The tool is not signed in as you. It writes through the official Google Ads API under a manager-account link you can remove, or you can take the generated structure and upload it by hand.",
  },
];

interface Step {
  title: string;
  body: string;
}

const AFTER: Step[] = [
  {
    title: "LinkedIn, and only for the cap",
    body: "Sign-in exists only to limit free generations. It reads only the profile URL. You can skip it and send a LinkedIn message with the Customer ID instead.",
  },
  {
    title: "A structure you can review before anything runs",
    body: "Campaigns, ad groups, keywords, ads and extensions, generated from the website. Google will also send a manager-account invitation from Top-Rated Team. You can ignore that invitation and upload the structure yourself.",
  },
  {
    title: "A person after that",
    body: "The tool does not run the account afterwards. Conversion tracking, and the month-to-month work that keeps the grant inside the rules, are a person, on the same contract as this door.",
  },
];

const LIBRARY = [
  ADGRANT_LIBRARY.glossary,
  ADGRANT_LIBRARY.caseStudies,
  ADGRANT_LIBRARY.tricks,
  ADGRANT_LIBRARY.templates,
  ADGRANT_LIBRARY.nonprofits,
];

export function AdGrantDoor() {
  return (
    <div className={ADGRANT_ACCENT_WRAP} data-testid="block-adgrant-door">
      <section className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <div>
            <h2 className={HEADING}>
              <a
                href={ADGRANT_HREF}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-adgrant-wordmark"
                className={`${LINK} text-primary`}
              >
                {ADGRANT_MARK}
              </a>
            </h2>
          </div>
          <p className={READ_MUTED} data-testid="text-adgrant-what">
            A working tool on its own site. You give it the nonprofit&rsquo;s website and the Google Ads Customer ID. It
            writes a full account structure. Nothing on this page can reach an ad account; the form is on{" "}
            <a href={ADGRANT_HREF} target="_blank" rel="noopener noreferrer" className={`${LINK} text-foreground`}>
              adgrant.ai
            </a>
            .
          </p>
        </div>

        <ol className="mt-[var(--s5)]">
          {NEEDS.map((need, index) => (
            <li
              key={need.title}
              data-testid="item-adgrant-need"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${HEADING} lg:col-start-2`}>{need.title}</h3>
              <p className="type-body text-muted-foreground lg:col-start-3 lg:row-start-1">{need.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>What happens after you submit those two fields.</h2>
          <p className={READ_MUTED}>
            Language and location pickers sit under them. The sentences below are what the form itself says, in the
            words a visitor needs before they type anything.
          </p>
        </div>

        <ol className="mt-[var(--s4)]">
          {AFTER.map((step, index) => (
            <li
              key={step.title}
              data-testid="item-adgrant-after"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${HEADING} lg:col-start-2`}>{step.title}</h3>
              <p className="type-body text-muted-foreground lg:col-start-3 lg:row-start-1">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-adgrant-library">
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>The library stays on AdGrant.AI.</h2>
          <p className={READ_MUTED}>
            Case studies, templates, tricks and vertical pages are our claims, not Google&rsquo;s rules. They are
            indexed on adgrant.ai. This door points at them rather than reprinting them.
          </p>
        </div>

        <ol className="mt-[var(--s4)]">
          {LIBRARY.map((entry, index) => (
            <li
              key={entry.href}
              data-testid="item-adgrant-library"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${HEADING} lg:col-start-2`}>
                <a href={entry.href} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {entry.label}
                </a>
              </h3>
              <p className="type-body text-muted-foreground lg:col-start-3 lg:row-start-1">{entry.line}</p>
            </li>
          ))}
        </ol>

        <p className={`mt-[var(--s4)] max-w-[46ch] ${META_PLAIN}`}>
          Google&rsquo;s own Ad Grants policies are what the agent above cites. The library on adgrant.ai is our
          claims about what has worked, and those pages say so.
        </p>
      </section>
    </div>
  );
}

export default AdGrantDoor;
