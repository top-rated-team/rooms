import { useEffect } from "react";

import { ADGRANT_MOUNT } from "@/components/adgrant/mount";

/**
 * Per-route title, description and canonical, the way landing.tsx does the
 * first two. Restores what it found, so leaving this tree does not leave
 * AdGrant.AI's title on a Top-Rated Team page.
 *
 * THE CANONICAL POINTS AT adgrant.ai, NOT AT US, and that is the whole reason
 * it exists. These pages are a duplicate: the same twenty-three articles are
 * live on adgrant.ai at the same paths, and this tree is a copy in the new
 * design while the domain has not moved. Two hosts serving one article with no
 * canonical is the textbook way to have neither of them rank. So every page
 * here declares the live URL as the original.
 *
 * WHEN THE DOMAIN MOVES this becomes wrong and must go in the same commit that
 * moves it: ADGRANT_MOUNT is "" on the real host, and a page cannot be a copy
 * of itself. The check is written as exactly that condition rather than as a
 * constant somebody would have to remember to flip.
 */
const LIVE_ORIGIN = "https://adgrant.ai";

/** The live URL this page duplicates, or null once this IS the live site. */
export function canonicalFor(pathname: string): string | null {
  if (!ADGRANT_MOUNT) return null;
  if (!pathname.startsWith(ADGRANT_MOUNT)) return null;
  const path = pathname.slice(ADGRANT_MOUNT.length) || "/";
  return `${LIVE_ORIGIN}${path === "/" ? "" : path}` || LIVE_ORIGIN;
}

export function Meta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let created = false;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
      created = true;
    }
    const element = meta;
    const previousDescription = element.content;
    element.content = description;

    const href = canonicalFor(window.location.pathname);
    let link: HTMLLinkElement | null = document.querySelector('link[rel="canonical"]');
    const linkCreated = link === null;
    const previousHref = link?.href ?? "";
    if (href) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = href;
    }
    const linkElement = link;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
      if (linkElement) {
        if (linkCreated) linkElement.remove();
        else linkElement.href = previousHref;
      }
    };
  }, [title, description]);

  return null;
}
