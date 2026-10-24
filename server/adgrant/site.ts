/**
 * robots.txt and sitemap.xml for whichever of the two sites is being asked.
 *
 * One process, two domains. A static file in client/public can only describe
 * one of them, and the one it describes is top-rated.team — so on adgrant.ai
 * it would hand crawlers the wrong sitemap, point them at the wrong host, and
 * omit every page that domain exists to publish.
 *
 * These routes are registered in server/routes.ts, which server/index.ts runs
 * BEFORE express.static, so they take precedence over the files on disk for
 * the AdGrant hosts and fall through to them for ours.
 *
 * GENERATED, NOT COPIED. client/public/sitemap.xml is hand-written and its own
 * header admits it should not be; it went stale exactly as predicted. This one
 * is built from the same PAGES and sections the pages themselves render, so a
 * page that exists is listed and a page that does not cannot be.
 */

import { PAGES } from "@shared/adgrant";
import { ADGRANT_APP_HOST, ADGRANT_APP_ORIGIN, ADGRANT_ORIGIN, isAdGrantAppHost } from "@shared/adgrant-site";

/** The section indexes, by the segment their URLs use: the public site's library. */
const SECTIONS = ["glossary", "case-studies", "tricks", "nonprofits", "templates"] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Every address adgrant.ai answers, in the order a reader would meet them. */
export function adgrantUrls(): string[] {
  const urls = [ADGRANT_ORIGIN + "/"];
  for (const segment of SECTIONS) urls.push(`${ADGRANT_ORIGIN}/${segment}`);
  for (const page of PAGES) {
    /* A nonprofits slug carries a slash and each segment is encoded on its
       own — encodeURIComponent on the whole thing would turn the separator
       into %2F and publish an address that does not exist. */
    const slug = page.slug.split("/").map(encodeURIComponent).join("/");
    urls.push(`${ADGRANT_ORIGIN}/${page.category}/${slug}`);
  }
  return urls;
}

export function adgrantSitemapXml(): string {
  const entries = adgrantUrls()
    .map((url) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/**
 * robots.txt for one of the AdGrant hosts.
 *
 * app.adgrant.ai is an application, not a second copy of the site: the same
 * library answers there, and adgrant.ai is where it is published. Two hosts
 * serving the same pages with nothing between them is how both lose, so the
 * app host asks not to be crawled at all and points at the site that should be.
 */
export function adgrantRobotsTxt(host?: string): string {
  if (isAdGrantAppHost(host)) {
    return [
      `# ${ADGRANT_APP_HOST}`,
      "",
      "# The rooms, the agents and sign-in for AdGrant.AI. The public site, and",
      `# its sitemap, are at ${ADGRANT_ORIGIN}.`,
      "",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }
  return [
    "# adgrant.ai",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# The generator posts to these and a room's address is a bearer credential.",
    "Disallow: /api/",
    "Disallow: /w/",
    "",
    `Sitemap: ${ADGRANT_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * Where an old top-rated.team/adgrant address goes, given the rest of its path
 * and its query.
 *
 * The library and the front door go to the public site, the way they always
 * have -- a link published to /adgrant/glossary/… has been a 301 to
 * adgrant.ai/glossary/… since the domain first answered, and whatever that
 * site does with the path, it does for every other link on the web too.
 * The rest of what this tree had -- services, terms, privacy -- is AdGrant.AI's
 * white label on app.adgrant.ai now, which names its pages differently: the
 * terms and privacy pages by their own names, everything else its front page.
 */
export function adgrantMovedUrl(rest: string, query = ""): string {
  const segment = rest.split("/")[1] ?? "";
  if (segment === "" || (SECTIONS as readonly string[]).includes(segment)) return `${ADGRANT_ORIGIN}${rest}${query}`;
  if (rest === "/terms") return `${ADGRANT_APP_ORIGIN}/terms.html`;
  if (rest === "/privacy") return `${ADGRANT_APP_ORIGIN}/privacy.html`;
  return `${ADGRANT_APP_ORIGIN}/`;
}
