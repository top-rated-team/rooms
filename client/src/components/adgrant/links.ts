import { ADGRANT_MOUNT } from "@/components/adgrant/mount";

const LIVE_ORIGIN = "https://adgrant.ai";

const LIBRARY_ROOTS = ["/glossary", "/case-studies", "/tricks", "/templates"] as const;

/**
 * Paths this tree answers. relatedLinks and markdown in shared/adgrant.ts use
 * the live-site shapes (`/glossary/<slug>`, `/tricks/<slug>`, `/` for generate)
 * with no mount prefix. While this product lives under /adgrant they have to
 * be prefixed; when ADGRANT_MOUNT is "" they are already the public URL.
 *
 * `/nonprofits…` is out of scope here. Those 33 pages stay on adgrant.ai.
 */
export function adgrantHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return mountHome();

  if (trimmed.startsWith(LIVE_ORIGIN)) {
    const path = trimmed.slice(LIVE_ORIGIN.length) || "/";
    return adgrantHref(path);
  }

  if (trimmed.startsWith("/nonprofits")) {
    return `${LIVE_ORIGIN}${trimmed}`;
  }

  if (trimmed === "/" ) return mountHome();

  for (const root of LIBRARY_ROOTS) {
    if (trimmed === root || trimmed.startsWith(`${root}/`)) {
      return `${ADGRANT_MOUNT}${trimmed}`;
    }
  }

  return trimmed;
}

export function mountHome(): string {
  return ADGRANT_MOUNT || "/";
}

export function isInternalAdgrantHref(href: string): boolean {
  const resolved = adgrantHref(href);
  if (/^https?:\/\//i.test(resolved)) return false;
  if (resolved === mountHome()) return true;
  const path = ADGRANT_MOUNT && resolved.startsWith(ADGRANT_MOUNT)
    ? resolved.slice(ADGRANT_MOUNT.length) || "/"
    : resolved;
  return LIBRARY_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

export function sectionPath(segment: string): string {
  return `${ADGRANT_MOUNT}/${segment}`;
}

export function leafPath(segment: string, slug: string): string {
  return `${ADGRANT_MOUNT}/${segment}/${slug}`;
}
