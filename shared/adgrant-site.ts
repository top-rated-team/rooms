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
 *
 * TWO ADDRESSES, TWO JOBS. adgrant.ai is the product's public site, and it
 * goes back to the application it started as (docs/ADGRANT-REPLIT.md). What
 * that application does not have — the rooms, the agents that answer in them,
 * the three ways in, and the terms and privacy that describe those — stays in
 * this process and answers on app.adgrant.ai. Both stay in ADGRANT_HOSTS, so
 * pointing the apex back here is a DNS change and nothing else.
 */

/** The product's public site: the library, the generator, the front door. */
export const ADGRANT_SITE_HOSTS = ["adgrant.ai", "www.adgrant.ai"] as const;

/** Where this process answers as AdGrant.AI once the public site is served elsewhere. */
export const ADGRANT_APP_HOST = "app.adgrant.ai";

export const ADGRANT_HOSTS = [...ADGRANT_SITE_HOSTS, ADGRANT_APP_HOST] as const;

/** Where the product's own pages live, for canonicals and the sitemap. */
export const ADGRANT_ORIGIN = "https://adgrant.ai";

/**
 * Where the rooms, the agents and the legal pages that describe them live.
 * A contract printed in a room — ours, or a partner's fork of this house —
 * links its terms here, because these are the terms of what happens in it.
 */
export const ADGRANT_APP_ORIGIN = `https://${ADGRANT_APP_HOST}`;

function bareHostname(hostname: string | undefined | null): string {
  return (hostname ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

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
  const host = bareHostname(hostname);
  return (ADGRANT_HOSTS as readonly string[]).includes(host) ? "" : "/adgrant";
}

export function isAdGrantHost(hostname: string | undefined | null): boolean {
  return adgrantMountFor(hostname) === "";
}

export function isAdGrantAppHost(hostname: string | undefined | null): boolean {
  return bareHostname(hostname) === ADGRANT_APP_HOST;
}

/**
 * The address a reader of this tree is on, by name, for the legal pages: they
 * describe this process and nothing else, so they name the host it answered
 * on. Anywhere that is not one of ours — top-rated.team/adgrant, localhost —
 * it is the app's address, which is where this tree lives in production.
 */
export function adgrantSiteNameFor(hostname: string | undefined | null): string {
  const host = bareHostname(hostname);
  if ((ADGRANT_HOSTS as readonly string[]).includes(host)) return host.replace(/^www\./, "");
  return ADGRANT_APP_HOST;
}
