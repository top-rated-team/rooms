import { useEffect, useState } from "react";
import { Link } from "wouter";

import { STATS, type AdGrantStats } from "@shared/adgrant";
import { DISPLAY, HEADING, LINK, META, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { Conversation } from "@/components/adgrant/Conversation";
import { formatCount, formatMeasuredOn } from "@/components/adgrant/format";
import { ADGRANT_SECTIONS } from "@/components/adgrant/sections";

const POLICY_CTR = "https://support.google.com/nonprofits/answer/117827?hl=en";
const POLICY_BUDGET = "https://support.google.com/nonprofits/answer/1332166?hl=en";

/**
 * The figures, from whichever reading we have. Built from a parameter rather
 * than from the imported constant so that today's numbers and the ones this
 * build shipped with go through exactly the same sentences — a second copy of
 * this prose is a second place for a figure to go stale.
 */
function figuresFrom(stats: AdGrantStats): { n: string; of: string }[] {
  return [
  {
    n: formatCount(stats.accountsProcessed),
    of: "Ad Grant accounts processed. Every account this product has run, not a sample.",
  },
  {
    n: formatCount(stats.totals.campaigns),
    of: `campaigns in those accounts. Median ${stats.campaignsPerAccount.median} per account, average ${stats.campaignsPerAccount.avg}, maximum ${formatCount(stats.campaignsPerAccount.max)}.`,
  },
  {
    n: formatCount(stats.totals.keywords),
    of: `keywords in those accounts. Median ${stats.keywordsPerAdGroup.median} per ad group, average ${stats.keywordsPerAdGroup.avg}.`,
  },
  {
    n: formatCount(stats.totals.adGroups),
    of: `ad groups in those accounts. Median ${stats.adGroupsPerCampaign.median} per campaign, average ${stats.adGroupsPerCampaign.avg}.`,
  },
  {
    n: formatCount(stats.totals.ads),
    of: "ads in those accounts.",
  },
  ];
}

/**
 * Today's figures, asked for once on mount. The page renders the shipped
 * snapshot first and swaps in the live reading when it arrives, so there is
 * never a spinner where a measured number goes and never a layout that jumps
 * from empty to full. A failure keeps the snapshot, silently: a visitor cannot
 * act on our not having reached our own API, and the numbers they are reading
 * are still true, only older.
 */
function useLiveStats(): AdGrantStats {
  const [stats, setStats] = useState<AdGrantStats>(STATS);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    void fetch("/api/adgrant/stats", { headers: { Accept: "application/json" }, signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { stats?: AdGrantStats } | null) => {
        if (alive && body?.stats?.accountsProcessed) setStats(body.stats);
      })
      .catch(() => {
        /* the snapshot stands */
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);
  return stats;
}

export function Home() {
  const stats = useLiveStats();
  const FIGURES = figuresFrom(stats);
  return (
    <>
      <section className={`${PAGE} pt-[var(--s5)] lg:pt-[var(--s6)]`}>
        <p className={META}>Measured {formatMeasuredOn(stats.generatedAt)}</p>
        <h1 className={`mt-[var(--s2)] ${DISPLAY}`} data-testid="text-adgrant-headline">
          {formatCount(stats.accountsProcessed)} Ad Grant accounts processed
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
