/**
 * AdGrant.AI's variation of the quiet studio, and nothing else.
 *
 * The type scale, the spacing scale, the layout and the token names are the
 * ones in quiet.ts and index.css. Variation is one remapped accent on this
 * door, plus the wordmark. A second font, a second spacing step, a card, a
 * gradient or a second colour anywhere else on the page would undo the system
 * this sits inside.
 */

/** As the product names itself in its own chrome. Not the page title on adgrant.ai. */
export const ADGRANT_MARK = "AdGrant.AI";

/** Canonical address. The 74 library URLs live here; this door links, it does not copy them. */
export const ADGRANT_HREF = "https://adgrant.ai";

export const ADGRANT_LIBRARY = {
  glossary: { href: `${ADGRANT_HREF}/glossary`, label: "Glossary", line: "Terms as we use them on grant accounts." },
  caseStudies: {
    href: `${ADGRANT_HREF}/case-studies`,
    label: "Case studies",
    line: "How we have structured accounts in a few nonprofit verticals.",
  },
  tricks: { href: `${ADGRANT_HREF}/tricks`, label: "Tricks", line: "Workarounds we have actually used, including the 5% click-through rule." },
  templates: { href: `${ADGRANT_HREF}/templates`, label: "Templates", line: "Starter structures by kind of nonprofit." },
  nonprofits: { href: `${ADGRANT_HREF}/nonprofits`, label: "Verticals", line: "Pages written for a kind of nonprofit, or a city." },
} as const;

/**
 * `--primary` is the site's one accent. On this door it reads as `--chart-2`,
 * which is already the Ad Grants row's tone in shared/doors.ts. The name of the
 * token does not change, so every `text-primary` and `border-primary` class
 * still means "the accent" — it is the value that moves, and only here.
 */
export const ADGRANT_ACCENT_WRAP = "[--primary:var(--chart-2)]";
