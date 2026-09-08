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
import { Fragment, lazy, Suspense, useState } from "react";

import { Link } from "wouter";

import { BOOK_A_CALL_URL, PROOF } from "@shared/roster";
import { useBooking } from "@/hooks/use-booking";


/** The agency profile the record below is drawn from. */
const UPWORK_AGENCY_URL = "https://www.upwork.com/agencies/google/";

const LeadDialog = lazy(() => import("@/components/site/LeadDialog").then((m) => ({ default: m.LeadDialog })));

export function FirstScreen() {
  const [messageOpen, setMessageOpen] = useState(false);
  const booking = useBooking();

  return (
    <section className="mx-auto grid max-w-[var(--page)] grid-cols-1 items-end gap-[var(--s4)] px-[var(--s3)] py-[var(--s5)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)] lg:py-[var(--s6)]">
      {/*
        NO NUMBER, on the owner's reasoning, and it is better than the reasoning
        for having one. A count is a ceiling, and White Label is the door that
        breaks it: a partner can put their own set of services on this platform,
        so the catalogue is not fixed and the scope of each one moves with what
        the market asks for. A headline that says "seven" has to be edited every
        time that happens, and will not be.

        SIXTH PASS, and the owner's two objections were both right.

        "Hybrid digital services" is a pre-AI phrase: in marketing it means
        cross-channel or cross-discipline, so a reader who knows the trade reads
        it as the old thing. The fix is not a different adjective but a
        different noun — HYBRID ATTACHES TO THE TEAM, not to the services.
        "Hybrid team" in 2026 can only mean people and software working the same
        job, which is what this is.

        He also wanted it as a verb and thought that was impossible. It is not,
        and the verb was already his: "AI agent or Human? Hire both for less"
        was one of the slogans he sent. "Hire" is the word his own market uses —
        it is what the button says on Upwork, where the record on the right of
        this screen comes from — so the headline is an instruction rather than a
        label, and it is shorter for it: 71 characters against 95.

        The count is gone for good, and that is settled rather than forgotten: a
        number in a headline is a ceiling, and White Label is the door that
        breaks it. The list immediately below prints how many there are today,
        generated, so nobody has to remember.

        THE SECOND SENTENCE IS THE OWNER'S OWN SHORTER ONE. He tried three:
        "One AI room", then "One AI-human hybrid room behind all of them", then
        "One room with people and AI agents to save time, costs and deliver
        more", and then cut it himself to this. The last is the best of them and
        it is the shortest, which is usually how that goes.

        It keeps the thing that mattered through all four attempts: BOTH sides
        are named. "One AI room" named the software and left out the contractor,
        which is the half he had just asked to bring forward.
      */}
      <div>
        <h1 className="type-display m-0" data-testid="text-home-headline">
          Hire a{" "}
          <Link
            href="/services"
            data-testid="link-headline-services"
            /* Two words, so the rule sits on one line at 68px. Linking the whole
               sentence put a 3px underline across three wrapped lines with a
               stub where the wrap fell, which a render showed reads as damage.
               "hybrid team" is also the thing /services is a list of the work of. */
            className="underline decoration-[3px] underline-offset-[0.16em] decoration-line hover:decoration-foreground"
          >
            hybrid team
          </Link>{" "}
          for your business.
        </h1>

      {/*
        THE MECHANISM DROPS TO READING SIZE, and that is the answer to "make it
        fit one line" rather than shrinking the title.
        
        The arithmetic was done on the shorter version of this line, "People +
        AI agents in one room.": 31 characters, which at the 68px display size
        is about 1,050px against a 730px column. Fitting it meant about 48px, a
        third off the headline. Once the line dropped to reading size the owner
        immediately made it longer and more precise — SUBJECT MATTER EXPERTS
        rather than "people", which is the actual claim, since what a client
        buys here is somebody who knows a trade — and at 19px it still sets on
        one line with room to spare. The join is "+" rather than "and", also on
        his instruction, and it is the better mark here: "and" reads as a list
        of two things you get, where "+" reads as one thing made of two. That is the argument for the demotion
        rather than the shrink: the sentence got free to say what it meant.
        
        So the sentence keeps its words and changes its rank. The claim is the
        headline; this is what the claim means, and it belongs at the size
        things are read at. It fits one line with room to spare, and it gives
        the first screen a hierarchy it did not have when both sentences were
        one flat 68px block.
        
        No fourth type size was added to do it: this is --type-body, the same
        size as the paragraph on the right.

        It shares the h1's wrapper rather than standing as its own grid child:
        as a sibling it claimed a second row and dragged the right-hand
        paragraph down with it.
      */}
        <p className="type-body mt-[var(--s2)] font-display font-medium" data-testid="text-home-mechanism">
          Subject Matter Experts + AI agents in one room.
        </p>
      </div>

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
          Start with a free expert audit of what the AI agents and automations in your ad accounts have been doing.
          Then the work it turns up: paid advertising and the measurement under it, Google Ad Grants, inbound LinkedIn
          on the official API, custom AI around all of it &mdash; for you and/or your clients.
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
          Prague, Madeira, Kyiv, Bratislava, Batumi. In the global paid ads and IT dev markets since 2017.
        </p>
        {/*
          IT USED TO SCROLL TO THE PANEL, and the panel was one door's agent.
          The owner has said twice that the ChatGPT Ads chat has no business
          being the house voice on the home page, and he is right: a visitor
          pressing a general button got a specific door's agent and its starter
          questions. Rather than relabel that, the panel has left the home page
          and the unified room it should be is queued as its own parcel.

          What replaces it is the two things that always work: a person on a
          call, or a message in an inbox. On a phone these are also the actions
          the header no longer shows, which is why they are here rather than
          only lower down the page.
        */}
        <p className="type-meta mt-[var(--s3)] flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]">
          <a
            href={BOOK_A_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-home-book-a-call"
            {...booking}
            className="border-b border-primary pb-[var(--s1)] font-medium text-primary hover:border-foreground hover:text-foreground"
          >
            Book a call
          </a>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            data-testid="button-home-leave-a-message"
            className="border-b border-border pb-[var(--s1)] text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            Leave a message
          </button>
          {/*
            THE THIRD ACTION, and it is the one the site is actually for. The
            owner counted two here and expected three — the room had been added
            to the header and to the ask section and never to the first screen,
            which is the one place every visitor sees.

            It scrolls rather than opening a room on the spot, deliberately: the
            section it lands on says in two sentences what a room is before it
            offers one, and "open a room" pressed by somebody who has not read
            that sentence is a room they will not come back to.
          */}
          <a
            href="#panel"
            data-testid="link-home-open-a-room"
            onClick={(event) => {
              const section = document.getElementById("panel");
              if (!section || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
            }}
            className="border-b border-border pb-[var(--s1)] text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            Open a room
          </a>
        </p>
      </div>

      {messageOpen ? (
        <Suspense fallback={null}>
          <LeadDialog open={messageOpen} onOpenChange={setMessageOpen} prefill={null} />
        </Suspense>
      ) : null}
    </section>
  );
}

export default FirstScreen;
