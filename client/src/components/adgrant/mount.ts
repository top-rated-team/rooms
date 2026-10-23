import { adgrantMountFor, adgrantSiteNameFor, isAdGrantAppHost } from "@shared/adgrant-site";

/**
 * Where this front is mounted, for THIS host.
 *
 * It used to be the literal "/adgrant" with a note saying it becomes "" when
 * the product moves to its own domain. It has moved, and one build now serves
 * both: adgrant.ai answers the tree at its root, top-rated.team keeps serving
 * it under /adgrant so no link that has ever been published breaks.
 *
 * Read once at module load rather than per render. This is a browser bundle,
 * the hostname cannot change without a navigation, and a value that is stable
 * for the life of the page should not be recomputed on every route change.
 *
 * Internal links in this tree must go through this constant. They must not
 * point at "/" — on top-rated.team that is the other product's home.
 */
export const ADGRANT_MOUNT = adgrantMountFor(
  typeof window === "undefined" ? undefined : window.location.hostname,
);

/**
 * The address this tree is being read on, by name — adgrant.ai, or
 * app.adgrant.ai once the public site is served by the product's own
 * application. The terms and privacy pages say what they cover with it, so
 * neither claims a site this process does not run.
 */
export const ADGRANT_SITE_NAME = adgrantSiteNameFor(
  typeof window === "undefined" ? undefined : window.location.hostname,
);

/** True on the app's address, where the public site is somebody else's process. */
export const ON_ADGRANT_APP_HOST = isAdGrantAppHost(
  typeof window === "undefined" ? undefined : window.location.hostname,
);
