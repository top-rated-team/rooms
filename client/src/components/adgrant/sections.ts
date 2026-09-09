import { pagesIn, TEMPLATES, type AdGrantCategory } from "@shared/adgrant";

import { sectionPath } from "@/components/adgrant/links";

/**
 * The four sections the live site names, and the URL shapes it already uses.
 * Labels are the live names; the parenthetical is the live subtitle. Counts
 * come from shared/adgrant.ts so an index cannot go stale against the library.
 */
export interface AdGrantSection {
  segment: "glossary" | "case-studies" | "tricks" | "templates" | "nonprofits";
  name: string;
  subtitle: string | null;
  /** One sentence for the index, from what is actually in the library. */
  line: string;
  count: number;
  path: string;
  category: AdGrantCategory | null;
}

function countLine(count: number, singular: string, plural: string): string {
  const word = count === 1 ? singular : plural;
  return `${count} ${word}`;
}

export const ADGRANT_SECTIONS: AdGrantSection[] = [
  {
    segment: "glossary",
    name: "Ad Grant Glossary",
    subtitle: "Terminology explained",
    line: `${countLine(pagesIn("glossary").length, "term", "terms")} as they apply to Google Ad Grant accounts.`,
    count: pagesIn("glossary").length,
    path: sectionPath("glossary"),
    category: "glossary",
  },
  {
    segment: "case-studies",
    name: "Case Studies",
    subtitle: null,
    line: `${countLine(pagesIn("case-studies").length, "structure", "structures")} for kinds of nonprofit, written from the measured accounts.`,
    count: pagesIn("case-studies").length,
    path: sectionPath("case-studies"),
    category: "case-studies",
  },
  {
    segment: "tricks",
    name: "Tips & Tricks",
    subtitle: "Custom workarounds",
    line: `${countLine(pagesIn("tricks").length, "workaround", "workarounds")} that are still true against Google's current Ad Grants pages.`,
    count: pagesIn("tricks").length,
    path: sectionPath("tricks"),
    category: "tricks",
  },
  {
    segment: "nonprofits",
    name: "By Nonprofit",
    subtitle: "City by city",
    line: `${countLine(pagesIn("nonprofits").length, "guide", "guides")} for a kind of nonprofit in one city, with the local search terms that actually get typed.`,
    count: pagesIn("nonprofits").length,
    path: sectionPath("nonprofits"),
    category: "nonprofits",
  },
  {
    segment: "templates",
    name: "Starter Templates",
    subtitle: null,
    line: `${countLine(TEMPLATES.length, "starter structure", "starter structures")} by nonprofit niche. Each one is a count of campaigns, ad groups, keywords and ads — not a generated account.`,
    count: TEMPLATES.length,
    path: sectionPath("templates"),
    category: null,
  },
];

export const SECTION_BY_SEGMENT: Record<AdGrantSection["segment"], AdGrantSection> = Object.fromEntries(
  ADGRANT_SECTIONS.map((section) => [section.segment, section]),
) as Record<AdGrantSection["segment"], AdGrantSection>;
