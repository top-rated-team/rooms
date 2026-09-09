import { ADGRANT_LIBRARY } from "@/components/site/doors/adgrant-style";
import {
  DISPLAY,
  HEADING,
  LINK,
  META,
  NUMERAL,
  PAGE,
  READ,
  READ_MUTED,
} from "@/components/site/doors/quiet";
import { AD_GRANT_SETUP } from "@/components/workspace/AdGrantPanel";
import { OpenRoom } from "@/components/adgrant/OpenRoom";

const POLICY_CTR = "https://support.google.com/nonprofits/answer/9314402?hl=en";
const POLICY_BUDGET = "https://support.google.com/nonprofits/answer/1332166?hl=en";

const NEEDS = [
  {
    title: "A Google Ad Grant the nonprofit already holds",
    body: "The tool writes into an existing grant account. It does not apply for the grant.",
  },
  {
    title: "The nonprofit website URL",
    body: "That URL has to be the domain authorised on the grant account. Subdomains of it are included by default.",
  },
  {
    title: "The 10-digit Google Ads Customer ID",
    body: "The number in the top right of Google Ads, written 123-456-7890. Send it in a room. A person then sets up the manager-account link; this page cannot reach an ad account.",
  },
];

const LIBRARY = [
  ADGRANT_LIBRARY.glossary,
  ADGRANT_LIBRARY.caseStudies,
  ADGRANT_LIBRARY.tricks,
  ADGRANT_LIBRARY.templates,
  ADGRANT_LIBRARY.nonprofits,
];

export function Home() {
  return (
    <>
      <section className={`${PAGE} pt-[var(--s5)] lg:pt-[var(--s6)]`}>
        <div className="grid items-end gap-[var(--s4)] pb-[var(--s6)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h1 className={DISPLAY} data-testid="text-adgrant-headline">
            Google Ad Grant setup from your website
          </h1>
          <div>
            <p className={READ_MUTED} data-testid="text-adgrant-pitch">
              Send the Customer ID in a room. A person checks that the grant is active. You invite a manager-account
              link you can remove. The tool then writes campaigns, ad groups, keywords, ads and extensions from the
              nonprofit&rsquo;s website into your own Google Ads account through the Google Ads API.
            </p>
            <div className="mt-[var(--s4)]">
              <OpenRoom where="hero" loud />
            </div>
          </div>
        </div>
      </section>

      <section className={PAGE} data-testid="block-adgrant-needs">
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>What it takes before anything is written.</h2>
          <p className={READ_MUTED}>
            Nothing on this page is signed in as you, and nothing here can start a write into Google Ads. The three
            things below are still what the work needs.
          </p>
        </div>
        <ol className="mt-[var(--s4)]">
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

      <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-adgrant-setup">
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>The setup, in the order it actually runs.</h2>
          <p className={READ_MUTED}>
            Four of these are a person. One is the tool. They are the same five lines a room puts on its list, not a
            catalogue of features.
          </p>
        </div>
        <ol className="mt-[var(--s4)]">
          {AD_GRANT_SETUP.map((step, index) => (
            <li
              key={step.title}
              data-testid="item-adgrant-setup"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${HEADING} lg:col-start-2`}>{step.title}</h3>
              <p className="type-body text-muted-foreground lg:col-start-3 lg:row-start-1">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-adgrant-policy">
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>What Google&rsquo;s own rules say, and what this page will not.</h2>
          <p className={READ_MUTED}>
            Eligibility is written per country, and Google rewrites that page per country. This page does not state
            who qualifies. Nobody here will say whether Google will approve or reinstate an account. A person reads the
            account first.
          </p>
        </div>
        <ul className="mt-[var(--s4)]">
          <li className="border-t border-border py-[var(--s3)] last:border-b">
            <p className={READ}>
              Google Ad Grants caps spend at 10,000 US dollars a month, which is 329 US dollars a day. That is a
              limit, not a guarantee of spend. If the account&rsquo;s currency is not USD, Google converts to an
              approximate local equivalent.{" "}
              <a href={POLICY_BUDGET} target="_blank" rel="noopener noreferrer" className={`${LINK} text-foreground`}>
                Google&rsquo;s budget page
              </a>
            </p>
          </li>
          <li className="border-t border-border py-[var(--s3)] last:border-b">
            <p className={READ}>
              Accounts must keep a 5% click-through rate each month. Failing to meet 5% CTR for two consecutive months
              can result in temporary account deactivation.{" "}
              <a href={POLICY_CTR} target="_blank" rel="noopener noreferrer" className={`${LINK} text-foreground`}>
                Google&rsquo;s policy page
              </a>
            </p>
          </li>
        </ul>
      </section>

      <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-adgrant-library">
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>The library stays where it is indexed.</h2>
          <p className={READ_MUTED}>
            Case studies, templates, tricks and vertical pages are our claims, not Google&rsquo;s rules. They live on
            adgrant.ai. This front points at them rather than reprinting them.
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
      </section>

      <section id="room" className={`${PAGE} scroll-mt-[var(--s4)] pt-[var(--s6)]`} data-testid="block-adgrant-room">
        <div className="max-w-[46ch]">
          <p className={META}>The room</p>
          <h2 className={`mt-[var(--s2)] ${HEADING}`}>Send the Customer ID here, not through a form on this page.</h2>
          <p className={`mt-[var(--s3)] ${READ}`}>
            The Ad Grants Agent answers first, from Google&rsquo;s own Ad Grants policies, and cites the page it used.
            It does not say whether Google will approve or reinstate an account. The five steps above are what a person
            then does, in that room.
          </p>
          <div className="mt-[var(--s3)]">
            <OpenRoom where="close" loud />
          </div>
        </div>
      </section>
    </>
  );
}
