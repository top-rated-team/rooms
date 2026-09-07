import { useEffect } from "react";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import Results from "@/components/site/home/Results";
import TalkToUs from "@/components/site/TalkToUs";
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
 * It renders the same two results the home page does, from the same component,
 * so there is no second copy of a number to go stale. That is deliberately all
 * it renders: the fuller set still lives on top-rated.team and this page says
 * so rather than pretending to be the whole record.
 *
 * When docs/apex-migration.md is carried out, /case-studies is one of the
 * fourteen addresses that has to keep answering, and this is the page that
 * answers it.
 * ------------------------------------------------------------------------- */

const TITLE = "Cases — Top-Rated Team";
const DESCRIPTION =
  "Two paid ads accounts and what changed in them: +180% conversion growth on offline conversions only, and +477% with cost per conversion down 81% after the measurement was fixed.";

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
            Two accounts, and what the measurement did to them.
          </h1>
          <p className={`mt-[var(--s3)] max-w-[62ch] ${READ_MUTED}`}>
            Both are Google Ads accounts, and both moved because the measurement under them was wrong before anything
            was optimised. That is the same order of work the free audit starts with.
          </p>
        </section>

        <Results />

        <section className={`${PAGE} pt-[var(--s5)]`}>
          <p className={READ_MUTED}>
            More of them, written up at length, are on{" "}
            <a
              href={`${MAIN_SITE_URL}/case-studies`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-cases-main-site"
              className={LINK}
            >
              top-rated.team
            </a>
            , until that page moves here.
          </p>
        </section>

        <TalkToUs className="pt-[var(--s6)] pb-[var(--s5)]" />
      </main>
      <Footer />
    </div>
  );
}
