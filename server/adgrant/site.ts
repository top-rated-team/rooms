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
import { ADGRANT_ORIGIN } from "@shared/adgrant-site";

/** The four section indexes, by the segment their URLs use. */
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

export function adgrantRobotsTxt(): string {
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
