import { useEffect } from "react";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import CaseFilter from "@/components/site/CaseFilter";
import TalkToUs from "@/components/site/TalkToUs";
import { CASES } from "@shared/cases";
import { MAIN_SITE_URL } from "@shared/roster";
import { LINK, META, PAGE, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * THE CASES
 *
 * This page exists because "read the cases" had to lead somewhere. The
 * alternative was linking to top-rated.team/case-studies from inside this
 * application, which the apex migration will make a redirect back to here —
 * pointing a visitor at a page that is about to point back.
 *
 * It renders every case in shared/cases.ts, and a filter that can show the
 * ones for one service. The filter reads DOORS and the derived `doors` field
 * on each case; this page does not list services by hand.
 *
 * When docs/apex-migration.md is carried out, /case-studies is one of the
 * fourteen addresses that has to keep answering, and this is the page that
 * answers it.
 * ------------------------------------------------------------------------- */

const TITLE = "Cases — Top-Rated Team";
const DESCRIPTION =
  "Twenty-two paid ads accounts and what changed in them: the challenge, the objective, the work as it was listed, and the result metrics with their percentage changes.";

export default function CaseStudies() {
  useEffect(() => {
    document.title = TITLE;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = DESCRIPTION;
  }, []);

  return (
    <div className="min-h-screen bg-background" data-site-chrome>
      <Header />
      <main>
        <section className={`${PAGE} pt-[var(--s5)]`}>
          <p className={META}>Cases</p>
          <h1 className="type-display m-0 mt-[var(--s2)]" data-testid="text-cases-headline">
            {CASES.length} accounts, and what was actually done in them.
          </h1>
          <p className={`mt-[var(--s3)] max-w-[62ch] ${READ_MUTED}`}>
            That is all of them, not a selection. Each one reads the same way: what was wrong, what it had to do, what
            was done — as the list it was — and then the numbers. The list is the part worth reading. Percentages on
            their own only prove somebody is willing to print percentages.
          </p>
        </section>

        <CaseFilter />

        <section className={`${PAGE} pt-[var(--s5)]`}>
          <p className={READ_MUTED}>
            Every case here is one published on{" "}
            <a
              href={`${MAIN_SITE_URL}/case-studies`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-cases-main-site"
              className={LINK}
            >
              top-rated.team
            </a>
            , which is where the figures come from — no case here was written for this page.
          </p>
        </section>

        <TalkToUs className="pt-[var(--s6)] pb-[var(--s5)]" />
      </main>
      <Footer />
    </div>
  );
}
