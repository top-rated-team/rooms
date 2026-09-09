import { useEffect } from "react";

import { Home } from "@/components/adgrant/Home";
import { Shell } from "@/components/adgrant/Shell";

/* ---------------------------------------------------------------------------
 * ADGRANT.AI'S FRONT, IN THIS APPLICATION.
 *
 * It cannot be a second host. client/index.html is the one head this process
 * serves, so a second site with its own title and meta is owner work for when
 * no wave is running. This page sets its own title the way landing.tsx does.
 *
 * It does not import the site header or footer. The 74 library pages stay on
 * adgrant.ai and are linked, not copied.
 * ------------------------------------------------------------------------- */

const PAGE_TITLE = "AdGrant.AI — Google Ad Grant setup from your website";
const PAGE_DESCRIPTION =
  "Send the Google Ads Customer ID in a room. A person checks the grant, you invite a manager-account link, and the tool writes campaigns, ad groups, keywords, ads and extensions from the nonprofit website into your own account. This page is in English.";

export function AdGrantApp() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;

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
    element.content = PAGE_DESCRIPTION;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, []);

  return (
    <Shell>
      <Home />
    </Shell>
  );
}

export default AdGrantApp;
