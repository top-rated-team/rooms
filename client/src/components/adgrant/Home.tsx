import { Link } from "wouter";

import { STATS } from "@shared/adgrant";
import { DISPLAY, HEADING, LINK, META, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { Conversation } from "@/components/adgrant/Conversation";
import { formatCount, formatMeasuredOn } from "@/components/adgrant/format";
import { ADGRANT_SECTIONS } from "@/components/adgrant/sections";

const POLICY_CTR = "https://support.google.com/nonprofits/answer/117827?hl=en";
const POLICY_BUDGET = "https://support.google.com/nonprofits/answer/1332166?hl=en";

const FIGURES: { n: string; of: string }[] = [
  {
    n: formatCount(STATS.accountsProcessed),
    of: "Ad Grant accounts processed. Every account this product has run, not a sample.",
  },
  {
    n: formatCount(STATS.totals.campaigns),
    of: `campaigns in those accounts. Median ${STATS.campaignsPerAccount.median} per account, average ${STATS.campaignsPerAccount.avg}, maximum ${formatCount(STATS.campaignsPerAccount.max)}.`,
  },
  {
    n: formatCount(STATS.totals.keywords),
    of: `keywords in those accounts. Median ${STATS.keywordsPerAdGroup.median} per ad group, average ${STATS.keywordsPerAdGroup.avg}.`,
  },
  {
    n: formatCount(STATS.totals.adGroups),
    of: `ad groups in those accounts. Median ${STATS.adGroupsPerCampaign.median} per campaign, average ${STATS.adGroupsPerCampaign.avg}.`,
  },
  {
    n: formatCount(STATS.totals.ads),
    of: "ads in those accounts.",
  },
];

export function Home() {
  return (
    <>
      <section className={`${PAGE} pt-[var(--s5)] lg:pt-[var(--s6)]`}>
        <p className={META}>Measured {formatMeasuredOn(STATS.generatedAt)}</p>
        <h1 className={`mt-[var(--s2)] ${DISPLAY}`} data-testid="text-adgrant-headline">
          {formatCount(STATS.accountsProcessed)} Ad Grant accounts processed
        </h1>
        <p className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`} data-testid="text-adgrant-pitch">
          Those are the accounts, campaigns and keywords this product has actually processed. A structure for a
          nonprofit is produced from its own website and shown on this page. Nothing here is written into a Google Ads
          account. A person sets up the manager-account link afterwards if the structure should go into the grant
          account.
        </p>
      </section>

      <section className={`${PAGE} pt-[var(--s5)]`} data-testid="block-adgrant-stats">
        <ol>
          {FIGURES.map((figure, index) => (
            <li
              key={figure.of}
              data-testid="item-adgrant-stat"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,14ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className={`${HEADING} tabular-nums`}>{figure.n}</p>
              <p className={`${READ} lg:col-start-3 lg:row-start-1`}>{figure.of}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${PAGE} pt-[var(--s6)]`}>
        <Conversation />
      </section>

      <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-adgrant-library">
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>The four sections</h2>
          <p className={READ_MUTED}>
            Named as the live library names them. Where a page was thin, it stays short.
          </p>
        </div>
        <ol className="mt-[var(--s4)]">
          {ADGRANT_SECTIONS.map((section, index) => (
            <li
              key={section.segment}
              data-testid="item-adgrant-library"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${HEADING} lg:col-start-2`}>
                <Link href={section.path} className={LINK}>
                  {section.name}
                </Link>
                {section.subtitle ? <span className={`mt-[var(--s1)] block ${META}`}>{section.subtitle}</span> : null}
              </h3>
              <p className={`${READ_MUTED} lg:col-start-3 lg:row-start-1`}>{section.line}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-adgrant-policy">
        <h2 className={HEADING}>Two numbers from Google, not from us</h2>
        <ul className="mt-[var(--s4)]">
          <li className="border-t border-border py-[var(--s3)] last:border-b">
            <p className={READ}>
              Google Ad Grants caps spend at 10,000 US dollars a month, which is 329 US dollars a day. That is a limit,
              not a guarantee of spend.{" "}
              <a href={POLICY_BUDGET} target="_blank" rel="noopener noreferrer" className={`${LINK} text-foreground`}>
                Google&rsquo;s budget page
              </a>
            </p>
          </li>
          <li className="border-t border-border py-[var(--s3)] last:border-b">
            <p className={READ}>
              If the 5% click-through requirement is not met for two consecutive months, the account is temporarily
              deactivated.{" "}
              <a href={POLICY_CTR} target="_blank" rel="noopener noreferrer" className={`${LINK} text-foreground`}>
                Google&rsquo;s policy page
              </a>
            </p>
          </li>
        </ul>
      </section>
    </>
  );
}
