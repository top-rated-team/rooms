import { useEffect } from "react";

/**
 * Per-route title and description, the way landing.tsx does it. Restores what
 * it found, so leaving this tree does not leave AdGrant.AI's title on a
 * Top-Rated Team page.
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
