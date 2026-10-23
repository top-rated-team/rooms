import { Muted } from "@/components/site/LegalPage";
import { LINK } from "@/components/site/doors/quiet";
import { ADGRANT_ORIGIN } from "@shared/adgrant-site";

/**
 * One sentence for the terms and privacy pages on the app's address.
 *
 * adgrant.ai is served by the product's own application, which this process
 * does not run and these pages cannot describe: what it collects, how it signs
 * people in, what it asks them to agree to. A legal page that over-claims
 * describes a transfer of somebody's data that never happened, so it says
 * where it stops.
 */
export function PublicSiteLine() {
  return (
    <Muted>
      The public site at{" "}
      <a href={ADGRANT_ORIGIN} target="_blank" rel="noopener noreferrer" className={LINK}>
        adgrant.ai
      </a>{" "}
      is a separate application run by the same company, and this page does not describe it.
    </Muted>
  );
}
