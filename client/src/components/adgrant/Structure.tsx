import { useEffect, useState } from "react";
import { Link } from "wouter";

import { ADGRANT_TEMPLATE_FILES_ROOM_LINE, type AdGrantAccountStructure, type AdGrantGenerateResponse } from "@shared/api";
import { ACTION, HEADING, LINK, META, NUMERAL, READ, READ_MUTED } from "@/components/site/doors/quiet";

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

function downloadLabel(kind: string, filename: string): string {
  if (kind === "editor") return "Download the combined Google Ads Editor file";
  if (kind === "campaigns") return "Download campaigns";
  if (kind === "ad-groups") return "Download ad groups";
  if (kind === "keywords") return "Download keywords";
  if (kind === "ads") return "Download ads";
  if (kind === "sitelinks") return "Download sitelinks";
  if (kind === "callouts") return "Download callouts";
  if (kind === "structured-snippets") return "Download structured snippets";
  return `Download ${filename}`;
}

export function Structure({ result, roomHref }: { result: AdGrantGenerateResponse; roomHref?: string }) {
  const files = result.files?.length
    ? result.files
    : [
        {
          kind: "editor" as const,
          filename: `${result.structure.authorisedDomain.replace(/[^a-z0-9.-]+/gi, "-")}-google-ads-editor.csv`,
          mime: "text/csv;charset=utf-8",
          body: result.csv,
          line: result.editorLine,
          tool: "Google Ads Editor",
        },
      ];
  const [hrefs, setHrefs] = useState<{ file: (typeof files)[number]; href: string }[]>([]);

  useEffect(() => {
    const made = files.map((file) => ({
      file,
      href: URL.createObjectURL(new Blob([file.body], { type: file.mime })),
    }));
    setHrefs(made);
    return () => {
      for (const item of made) URL.revokeObjectURL(item.href);
    };
  }, [result]);

  const { structure } = result;
  const dest = roomHref ?? "/w";

  return (
    <div data-testid="block-adgrant-structure">
      <p className={READ}>{result.editorLine}</p>
      <p className={`mt-[var(--s2)] ${READ}`}>{result.pausedLine}</p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
        A person sets up the manager-account link afterwards if the structure should go into the grant account. This
        page did not write it there.
      </p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{ADGRANT_TEMPLATE_FILES_ROOM_LINE}</p>
      <p className={`mt-[var(--s2)] ${READ}`}>
        <Link href={dest} className={LINK} data-testid="link-adgrant-structure-room">
          Continue in a room
        </Link>
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

      <ul className="mt-[var(--s4)] list-none p-0">
        {hrefs.map(({ file, href }) => (
          <li key={file.filename} className="border-t border-border py-[var(--s3)] last:border-b">
            <a
              href={href}
              download={file.filename}
              className={file.kind === "editor" ? ACTION : LINK}
              data-testid={file.kind === "editor" ? "link-adgrant-csv" : `link-adgrant-csv-${file.kind}`}
            >
              {downloadLabel(file.kind, file.filename)}
            </a>
            <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
              {file.tool ?? "Google Ads Editor"}. {file.line}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
