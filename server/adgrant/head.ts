/**
 * The head adgrant.ai serves, rewritten out of the one head this process has.
 *
 * client/index.html is frozen, and it is Top-Rated Team's: its title, its
 * description, its icon, its card. On adgrant.ai every one of those is wrong,
 * and the parts that matter most are the parts JavaScript cannot fix — an
 * unfurler and most crawlers read the HTML as served and never run the
 * application, so a title set at runtime by Meta.tsx is invisible to exactly
 * the readers a preview exists for.
 *
 * So the substitution happens on the way out, per request, for the AdGrant
 * hosts only. Ours is untouched: the same bytes, off disk, as before.
 *
 * REPLACED BY VALUE, NOT BY REGEX OVER TAG NAMES. Each edit looks for the
 * exact string the frozen file contains, and `rewriteHead` reports which
 * substitutions it could not make rather than silently serving half a head —
 * because a head that is half one site and half the other is worse than
 * either, and it would look fine in a browser.
 */

import { ADGRANT_ORIGIN } from "@shared/adgrant-site";

export const ADGRANT_TITLE = "AdGrant.AI — a Google Ad Grant structure from the nonprofit's website";
export const ADGRANT_DESCRIPTION =
  "Give a nonprofit's website and get a Google Ad Grant account structure back: campaigns, ad groups, keywords, ads and extensions, with a Google Ads Editor file. Built on what was measured across thousands of Ad Grant accounts. Nothing is written into a Google Ads account.";
const ADGRANT_IMAGE = `${ADGRANT_ORIGIN}/assets/adgrant-social.png`;
const ADGRANT_ICON = "/assets/adgrant-logo.png";

interface Swap {
  from: string;
  to: string;
  /** Some tags appear more than once and every copy has to change. */
  all?: boolean;
}

function swaps(): Swap[] {
  return [
    {
      from: "<title>Top-Rated Team — hire a hybrid team for your business</title>",
      to: `<title>${ADGRANT_TITLE}</title>`,
    },
    {
      from: '<link rel="icon" type="image/png" href="/assets/top-rated-logo.png" />',
      to: `<link rel="icon" type="image/png" href="${ADGRANT_ICON}" />`,
    },
    {
      from: '<link rel="apple-touch-icon" href="/assets/top-rated-logo.png" />',
      to: `<link rel="apple-touch-icon" href="${ADGRANT_ICON}" />`,
    },
    {
      from: '<meta property="og:site_name" content="Top-Rated Team" />',
      to: '<meta property="og:site_name" content="AdGrant.AI" />',
    },
    {
      from: '<meta property="og:image" content="https://top-rated.team/assets/social.png" />',
      to: `<meta property="og:image" content="${ADGRANT_IMAGE}" />`,
    },
    {
      from: '<meta name="twitter:image" content="https://top-rated.team/assets/social.png" />',
      to: `<meta name="twitter:image" content="${ADGRANT_IMAGE}" />`,
    },
    /* The same sentence is the title three times over — the tag, og and
       twitter — so this one is replaced everywhere it appears. */
    {
      from: "Top-Rated Team — hire a hybrid team for your business",
      to: ADGRANT_TITLE,
      all: true,
    },
  ];
}

export interface RewrittenHead {
  html: string;
  /** Substitutions the frozen file no longer matches. Empty is the only good value. */
  missed: string[];
}

export function rewriteHead(html: string): RewrittenHead {
  let out = html;
  const missed: string[] = [];
  for (const swap of swaps()) {
    if (!out.includes(swap.from)) {
      missed.push(swap.from.slice(0, 60));
      continue;
    }
    out = swap.all ? out.split(swap.from).join(swap.to) : out.replace(swap.from, swap.to);
  }

  /* The description is a long sentence wrapped across lines in the source, so
     it is matched by its tag and its attribute rather than by its text. */
  const described = out.replace(
    /<meta\s+(name="description"|property="og:description"|name="twitter:description"|property="og:image:alt")([\s\S]*?)\/>/g,
    (_match, which: string) =>
      `<meta ${which} content="${ADGRANT_DESCRIPTION.replace(/"/g, "&quot;")}" />`,
  );
  if (described === out) missed.push("description meta tags");
  out = described;

  return { html: out, missed };
}
