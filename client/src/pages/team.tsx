import { Fragment, useEffect } from "react";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import TalkToUs from "@/components/site/TalkToUs";
import TeamGrid from "@/components/site/TeamGrid";
import { DISPLAY, LINK, META, PAGE, READ_MUTED } from "@/components/site/doors/quiet";
import { EXPERTS, PROOF } from "@shared/roster";

/* ---------------------------------------------------------------------------
 * /team
 *
 * One of the fourteen addresses that has to keep answering when this
 * application moves onto top-rated.team. Production's page is recorded in
 * docs/specs/team.md; this file is that page in the quiet-studio language,
 * with two conservative readings the parcel asked for and a pile of claims
 * the spec itself flagged as untrue of the source.
 *
 * NO "11-50" TILE. Conservative reading of the spec's other open decision.
 * Production showed four people and a Team Size of 11-50 on the same screen,
 * a bracket this repository has no source for. Four is what EXPERTS.length
 * is. Repeating a range we cannot stand behind would tell a visitor something
 * the code does not know.
 *
 * Also dropped, because they are not true of this application as it stands:
 * "Top-Rated Plus members only" (one of the four live badges is Rising Talent);
 * "Certified Experts" with no certificate named on any card; 67+ projects
 * (this app publishes 22 cases, which is a different claim); seven languages;
 * a 24-hour reply (FirstScreen already refused that promise — nothing enforces
 * it); three office cards with roles and GMT offsets this repo does not
 * record; a YouTube button the current chrome does not carry; and the old
 * contact form posting to /api/contact, which this app does not have.
 * TalkToUs is the contact section the rest of the site already uses.
 *
 * The five cities and "since 2017" are the same sentence the home page
 * already prints. The hours and job success are PROOF in shared/roster.ts,
 * already on the first screen, and the link is the same Upwork record that
 * screen points at.
 * ------------------------------------------------------------------------- */

const TITLE = "Team — Top-Rated Team";
const DESCRIPTION = `${EXPERTS.length} people, named by role rather than by personal name. Hours delivered and job success are Upwork's. Prague, Madeira, Kyiv, Bratislava and Batumi.`;

/** The agency profile the home page's record is drawn from. Same URL, same numbers. */
const UPWORK_AGENCY_URL = "https://www.upwork.com/agencies/google/";

/** The five places the footer identification line already names. Not a headcount. */
const PLACES = ["Prague", "Madeira", "Kyiv", "Bratislava", "Batumi"] as const;

export default function Team() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = TITLE;

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
    element.content = DESCRIPTION;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background" data-site-chrome>
      <Header />
      <main>
        <section className={`${PAGE} pt-[var(--s5)]`}>
          <p className={META}>Team</p>
          <h1 className={`${DISPLAY} m-0 mt-[var(--s2)]`} data-testid="text-team-headline">
            {EXPERTS.length} people, named by the work they do.
          </h1>
          <p className={`mt-[var(--s3)] max-w-[62ch] ${READ_MUTED}`}>
            Personal names are not on this page. The company&rsquo;s legal name is in the footer, which is
            where it belongs.
          </p>
        </section>

        <TeamGrid />

        <section className={`${PAGE} pt-[var(--s5)]`} data-testid="block-team-record">
          <p className={META}>The record</p>
          <p className={`mt-[var(--s3)] max-w-[62ch] ${READ_MUTED}`}>
            In the global paid ads and IT development markets since 2017. People in{" "}
            {PLACES.slice(0, -1).join(", ")} and {PLACES[PLACES.length - 1]}.
          </p>
          <dl
            className="m-0 mt-[var(--s3)] grid grid-cols-[auto_1fr] items-baseline gap-x-[var(--s2)] gap-y-[var(--s1)] sm:grid-cols-[auto_1fr_auto_1fr] sm:gap-x-[var(--s3)]"
          >
            {PROOF.map((item) => (
              <Fragment key={item.label}>
                <dd className="type-meta m-0 font-medium tabular-nums text-foreground">{item.value}</dd>
                <dt className="type-meta text-muted-foreground">{item.label.toLowerCase()}</dt>
              </Fragment>
            ))}
          </dl>
          <p className={`mt-[var(--s2)] ${META}`}>
            <a
              href={UPWORK_AGENCY_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-team-upwork"
              className={LINK}
            >
              Read the record on Upwork
            </a>
          </p>
        </section>

        <TalkToUs className="pt-[var(--s6)] pb-[var(--s5)]" />
      </main>
      <Footer />
    </div>
  );
}
