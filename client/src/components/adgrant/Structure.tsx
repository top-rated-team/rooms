import { useEffect, useMemo } from "react";

import type { AdGrantAccountStructure, AdGrantGenerateResponse } from "@shared/api";
import { ACTION, HEADING, META, NUMERAL, READ, READ_MUTED } from "@/components/site/doors/quiet";

function bidLabel(strategy: AdGrantAccountStructure["campaigns"][number]["bidStrategy"]): string {
  switch (strategy) {
    case "MAXIMIZE_CONVERSIONS":
      return "Maximize conversions";
    case "MAXIMIZE_CONVERSION_VALUE":
      return "Maximize conversion value";
    case "TARGET_CPA":
      return "Target CPA";
    case "TARGET_ROAS":
      return "Target ROAS";
    case "MAXIMIZE_CLICKS":
      return "Maximize clicks";
    case "MANUAL_CPC":
      return "Manual CPC";
  }
}

function matchLabel(match: "EXACT" | "PHRASE" | "BROAD"): string {
  if (match === "EXACT") return "exact";
  if (match === "PHRASE") return "phrase";
  return "broad";
}

export function Structure({ result }: { result: AdGrantGenerateResponse }) {
  const filename = `${result.structure.authorisedDomain.replace(/[^a-z0-9.-]+/gi, "-")}-google-ads-editor.csv`;
  const href = useMemo(() => URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" })), [result.csv]);

  useEffect(() => {
    return () => URL.revokeObjectURL(href);
  }, [href]);

  const { structure } = result;

  return (
    <div data-testid="block-adgrant-structure">
      <p className={READ}>{result.editorLine}</p>
      <p className={`mt-[var(--s2)] ${READ}`}>{result.pausedLine}</p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
        A person sets up the manager-account link afterwards if the structure should go into the grant account. This
        page did not write it there.
      </p>
      <p className={`mt-[var(--s3)] ${HEADING}`}>
        {structure.organisationName} · {structure.authorisedDomain}
      </p>
      <p className={`mt-[var(--s1)] ${META}`}>
        Daily budget {structure.dailyBudgetUsd} US dollars. Bidding:{" "}
        {structure.smartBiddingRequired ? "conversion-based Smart bidding, as required for accounts created on or after 22 April 2019." : "as generated."}
      </p>

      <ol className="mt-[var(--s4)]">
        {structure.campaigns.map((campaign, index) => (
          <li key={campaign.name} className="border-t border-border py-[var(--s3)] last:border-b">
            <div className="grid items-baseline gap-x-[var(--s3)] lg:grid-cols-[3rem_minmax(0,1fr)]">
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className={HEADING}>{campaign.name}</h3>
                <p className={`mt-[var(--s1)] ${READ_MUTED}`}>
                  {campaign.dailyBudgetUsd} US dollars a day. {bidLabel(campaign.bidStrategy)}. Locations:{" "}
                  {campaign.locations.join(", ")}. Language: {campaign.language}.
                </p>
                {campaign.adGroups.map((group) => (
                  <div key={group.name} className="mt-[var(--s3)]">
                    <p className={HEADING}>{group.name}</p>
                    <p className={`mt-[var(--s1)] ${READ}`}>
                      Keywords:{" "}
                      {group.keywords.map((keyword) => `${keyword.text} (${matchLabel(keyword.matchType)})`).join("; ")}
                    </p>
                    {group.ads.map((ad, adIndex) => (
                      <p key={adIndex} className={`mt-[var(--s1)] ${READ_MUTED}`}>
                        Ad: {ad.headlines.join(" · ")}. {ad.descriptions.join(" ")} → {ad.finalUrl}
                      </p>
                    ))}
                  </div>
                ))}
                {campaign.sitelinks.length > 0 ? (
                  <p className={`mt-[var(--s2)] ${READ}`}>
                    Sitelinks: {campaign.sitelinks.map((link) => `${link.text} (${link.finalUrl})`).join("; ")}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <a href={href} download={filename} className={`${ACTION} mt-[var(--s4)]`} data-testid="link-adgrant-csv">
        Download the Google Ads Editor CSV
      </a>
    </div>
  );
}
