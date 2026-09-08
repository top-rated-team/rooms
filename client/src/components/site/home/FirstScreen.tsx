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

        FIFTH PASS, and the two halves now do different jobs. The owner wanted
        the opening to be about hybridising AI with digital experts for the
        reader's own business. Said plainly that way it collides with the second
        sentence, which already names people and AI agents — a two-sentence
        headline that says the same thing twice is shorter than it looks and
        weaker than either half.

        So the first half carries the CATEGORY and the ADDRESSEE — hybrid,
        digital services, and "shaped to your business", which is his "именно
        твоего бизнеса" — and the second half stays the mechanism, which is what
        hybrid actually means here. "Hybridise" as a verb was the other option
        and it reads as a brochure; the adjective is his own word from an
        earlier pass and it does the same work without asking anyone to admire
        it.

        The count is gone for good: it was a ceiling, and White Label is the
        door that breaks it. The list immediately below says how many there are
        today, generated, so nobody has to remember.

        THE SECOND SENTENCE IS THE OWNER'S OWN SHORTER ONE. He tried three:
        "One AI room", then "One AI-human hybrid room behind all of them", then
        "One room with people and AI agents to save time, costs and deliver
        more", and then cut it himself to this. The last is the best of them and
        it is the shortest, which is usually how that goes.

        It keeps the thing that mattered through all four attempts: BOTH sides
        are named. "One AI room" named the software and left out the contractor,
        which is the half he had just asked to bring forward.
      */}
      <h1 className="type-display m-0" data-testid="text-home-headline">
        <Link
          href="/services"
          data-testid="link-headline-services"
          /* ONLY THE TERM IS LINKED, not the whole sentence. At 68px the
             sentence wraps onto three lines, and a 3px rule under all three
             reads as damage rather than as a link — a render showed that
             plainly. "Hybrid digital services" is the thing /services is a list
             of, which also makes it the right amount of text to be a link. */
          className="underline decoration-[3px] underline-offset-[0.16em] decoration-line hover:decoration-foreground"
        >
          Hybrid digital services
        </Link>
        , shaped to your business. One room for people and AI agents to deliver.
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
          Start with a free expert audit of what the AI agents and automations in your ad accounts have been doing.
          Then the work it turns up: paid advertising and the measurement under it, Google Ad Grants, inbound LinkedIn
          on the official API, and custom AI around all of it &mdash; for your clients as readily as for you.
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
