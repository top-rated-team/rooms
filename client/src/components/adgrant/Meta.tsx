import { useEffect } from "react";

/**
 * Per-route title and description, the way landing.tsx does it. Restores what
 * it found, so leaving this tree does not leave AdGrant.AI's title on a
 * Top-Rated Team page.
 *
 * THERE IS NO CANONICAL HERE ANY MORE. There was one for a few hours, while
 * the same twenty-seven articles were live on adgrant.ai and duplicated under
 * top-rated.team/adgrant, and it declared the live URL as the original. The
 * domain moved, and those copies are a 301 now — see the redirect in
 * server/routes.ts. A canonical is a request to a crawler and a redirect is an
 * answer, so with the answer in place the request is noise, and on the real
 * domain it would have been a page declaring itself a copy of itself.
 *
 * The title and description set here are for a reader and for a client that
 * runs JavaScript. What an unfurler sees is the served HTML, which
 * server/adgrant/head.ts rewrites per host — that is the one that matters for
 * a pasted link, and it cannot be done from in here.
 */
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

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, [title, description]);

  return null;
}
