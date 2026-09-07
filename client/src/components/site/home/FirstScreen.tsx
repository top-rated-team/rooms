/* ---------------------------------------------------------------------------
 * THE FIRST SCREEN
 *
 * What it replaced, measured at 1440x900: 223 words and 24 clickable things —
 * a trainer badge, a two-line headline whose second line was blue, a paragraph,
 * a second paragraph, two buttons, four statistics, a ten-link menu, a theme
 * control, a booking button, a panel with eight things to press in it, and a
 * band under all of that with one more link.
 *
 * What is here: one line, one paragraph, one line of metadata, one button. The
 * button is not a form and not a call — it puts the cursor in the panel further
 * down the page, because the fastest free thing on this site is a question.
 *
 * The headline is the argument, not a benefit claim: seven offers, and one room
 * behind all of them. That is what this company actually is.
 * ------------------------------------------------------------------------- */
import { Fragment } from "react";

import { PROOF } from "@shared/roster";
import { PUBLIC_DOORS } from "@/components/site/GatedOffers";
import { countWord } from "@/components/site/home/doorText";


/** The panel's own textarea. Owned by AskWidget; this is the id it renders. */
const PANEL_FIELD_ID = "ask-question";

/** The agency profile the record above is drawn from. */
const UPWORK_AGENCY_URL = "https://www.upwork.com/agencies/google/";

function toPanel() {
  const field = document.getElementById(PANEL_FIELD_ID);
  const target = field ?? document.getElementById("panel");
  if (!target) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  if (field instanceof HTMLTextAreaElement) field.focus({ preventScroll: true });
}

export function FirstScreen() {
  return (
    <section className="mx-auto grid max-w-[var(--page)] grid-cols-1 items-end gap-[var(--s4)] px-[var(--s3)] py-[var(--s5)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)] lg:py-[var(--s6)]">
      <h1 className="type-display m-0" data-testid="text-home-headline">
        {countWord(PUBLIC_DOORS.length).replace(/^./, (c) => c.toUpperCase())} services. One room behind all of them.
      </h1>

      <div>
        {/* The owner's rewrite, with two clauses corrected against the code.
            "answer asap" was dropped: inviting a person raises a request in the
            lead inbox and adds them to the room, and nothing anywhere promises
            or enforces a reply time — a promise the product cannot keep is the
            one kind of sentence this page may not carry. And "any AI agents"
            became "ours": the route that admits a member rejects anyone outside
            our own roster, and admitting somebody ELSE's agent has no server
            side at all yet. Both come back the moment the parcels land.

            The owner's third clause — your own workspace, invite more into it —
            is deliberately NOT here. The line under the panel already says it,
            at the moment it becomes true for the reader rather than as a claim
            fifty words before they have asked anything. Putting it here doubled
            the first screen's text, which is the complaint this rewrite began
            with. Panel.tsx carries it. */}
        <p className="type-body m-0">
          Paid advertising, the measurement under it, and the custom AI around both. Each one opens with a question: an
          agent answers it from documentation and prints the page it used, and a named contractor can join the same
          thread to scope the work.
        </p>
        <dl
          data-testid="list-record"
          className="m-0 mt-[var(--s3)] grid grid-cols-[auto_1fr] items-baseline gap-x-[var(--s2)] gap-y-[var(--s1)] sm:grid-cols-[auto_1fr_auto_1fr] sm:gap-x-[var(--s3)]"
        >
          {PROOF.map((item) => (
            <Fragment key={item.label}>
              <dd data-testid="stat-proof" className="type-meta m-0 font-medium tabular-nums text-foreground">
                {item.value}
              </dd>
              <dt className="type-meta text-muted-foreground">{item.label.toLowerCase()}</dt>
            </Fragment>
          ))}
        </dl>
        {/* Three of those four numbers are Upwork's own — hours delivered, job
            success, and the years behind them. So the record links to the place
            they can be read rather than asking to be taken on trust. */}
        <p className="type-meta mt-[var(--s2)]">
          <a
            href={UPWORK_AGENCY_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-upwork"
            className="draw text-muted-foreground hover:text-foreground"
          >
            Read the record on Upwork
          </a>
        </p>
        <p className="type-meta mt-[var(--s1)] text-muted-foreground">
          Prague, Madeira, Kyiv, Bratislava, Batumi. In the global paid ads and martech markets since 2017.
        </p>
        <button
          type="button"
          data-testid="button-home-ask"
          onClick={toPanel}
          className="type-meta mt-[var(--s3)] border-b border-primary pb-[var(--s1)] font-medium text-primary hover:border-foreground hover:text-foreground"
        >
          Put a question to the agent
        </button>
      </div>
    </section>
  );
}

export default FirstScreen;
