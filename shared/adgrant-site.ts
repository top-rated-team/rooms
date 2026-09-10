/**
 * Which hostnames ARE AdGrant.AI.
 *
 * One process serves two products. Until now the second one lived at a path,
 * /adgrant, and everything about it was decided at build time by a constant.
 * On its own domain the same build has to answer as a different site, so the
 * question moves from build time to request time and this is where it is
 * asked — once, by both halves, so the client's idea of "am I AdGrant" and the
 * server's cannot drift apart. They did drift for months in a smaller way:
 * client/public/sitemap.xml was hand-copied from a computed list and went
 * stale, which is the same failure one file earlier.
 *
 * Adding a host here is most of the move. The rest is DNS.
 */

export const ADGRANT_HOSTS = ["adgrant.ai", "www.adgrant.ai"] as const;

/** Where the product's own pages live, for canonicals and the sitemap. */
export const ADGRANT_ORIGIN = "https://adgrant.ai";

/**
 * The path this front answers on for a given host: nothing on its own domain,
 * /adgrant everywhere else.
 *
 * A local port, a preview build and the Render address all fall through to the
 * mounted form on purpose. A developer typing localhost wants the site they
 * were working on, not a second product served at the root of it.
 */
export function adgrantMountFor(hostname: string | undefined | null): "" | "/adgrant" {
  if (!hostname) return "/adgrant";
  const host = hostname.trim().toLowerCase().replace(/:\d+$/, "");
  return (ADGRANT_HOSTS as readonly string[]).includes(host) ? "" : "/adgrant";
}

export function isAdGrantHost(hostname: string | undefined | null): boolean {
  return adgrantMountFor(hostname) === "";
}
