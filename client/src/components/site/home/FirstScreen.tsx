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
import { RoomMenu } from "@/components/site/RoomMenu";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { useBooking } from "@/hooks/use-booking";


/**
 * A term in the subtitle that has something behind it.
 *
 * delayDuration={0} on the Root, not on the provider: the provider's 200ms is
 * right for a dense panel where a pointer crosses many targets on its way
 * somewhere, and wrong for two words in a sentence that the reader has
 * deliberately stopped on.
 *
 * The trigger is a span rather than the button Radix renders by default,
 * because this sits mid-sentence and a button would break the line's own
 * typography. asChild does that, and tabIndex puts the keyboard back — the
 * native title it replaces was never reachable that way at all.
 *
 * No touch branch. A tooltip does not open on tap, and neither did the title;
 * making one do so means deciding what a tap on a word in a paragraph means,
 * which is a bigger question than this sentence is asking.
 */
function Hover({ text, testId, children }: { text: string; testId: string; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="underline decoration-from-font underline-offset-[0.18em] outline-none focus-visible:rounded-[2px] focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={testId}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom" align="start" className="max-w-[min(38ch,calc(100vw-2rem))] text-balance">
          {text}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/** The agency profile the record below is drawn from. */
const UPWORK_AGENCY_URL = "https://www.upwork.com/agencies/google/";

const LeadDialog = lazy(() => import("@/components/site/LeadDialog").then((m) => ({ default: m.LeadDialog })));

/** The one loud action. Uppercase and the display face are stated, not inherited. */
const ACTION_LOUD =
  "type-meta border-b border-primary pb-[var(--s1)] font-medium text-primary " +
  "hover:border-foreground hover:text-foreground";

/** The rest, same shape and less weight. */
const ACTION_QUIET =
  "type-meta border-b border-border pb-[var(--s1)] text-muted-foreground " +
  "hover:border-foreground hover:text-foreground";

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
        immediately made it longer and more precise — DIGITAL EXPERTS rather
        than "people", which is the actual claim, since what a client buys here
        is somebody who knows a trade — and at 19px it still sets on
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
        {/*
          NOT A FLEX CONTAINER, and that was a real bug of mine. Making this
          paragraph `flex` to seat the mark gave the text an anonymous flex item
          with min-width:auto, which refuses to shrink below its max-content
          width — so on a phone the line did not wrap, it pushed the whole page
          sideways and clipped the standfirst with it. An inline image in normal
          text flow wraps the way text does, which is what a paragraph should do.

          THE MARK'S TOP EDGE IS LEVEL WITH THE TOP OF THE D, not above it, on
          the owner's instruction. Same arithmetic the header carries: the image
          sits on the baseline, so its top is its own height above it, and
          translate-y = height − cap-height brings that top to the cap line.
          MEASURED, NOT DERIVED. The formula I kept applying —
          translate = height minus cap-height — is for a box whose bottom sits
          on the baseline by CSS default, and then it double-counts: an
          inline-block with vertical-align baseline ALREADY has its bottom on
          the baseline, so its top is already one em above it, which for this
          face is already the ink top. Every translate I added pushed it below
          the line, and I did it three times.

          So the number comes off a render measured the same way the owner's
          reference image was measured: at 1440 and dpr 3 the mark's top landed
          at 1637 against a text ink top of 1621, sixteen device pixels low,
          and sixteen device pixels is the 0.3em that was there. At zero they
          are level — 1620 against 1621 — which is what his reference shows,
          where the mark sits one pixel under the ink top. 0.02em is that one
          pixel. Do not reintroduce a cap-height term here.

          THEN ONE PIXEL BIGGER, on the owner's instruction, growing down and
          sideways with the top staying put. At 19px that is 20/19 = 1.053em.
          The translate does NOT grow with it, which is the opposite of what the
          arithmetic predicted: adding 1/19em pushed the mark three device
          pixels down rather than holding it in place. Measured, so the
          measurement wins — here the box grows downward from a fixed top,
          which is exactly what was asked for. Proportions untouched: it was
          square and it is square.

          THEN ONE MORE, same instruction, same arithmetic: 21/19 = 1.105em.
          Re-measured rather than assumed, and this time the box did NOT hold
          its top: an inline-block sits on the baseline, so a taller one grows
          upward, and at 1.105em the mark's ink top read 1618 device pixels
          against the D's 1622 — four above, which is the one thing the owner
          ruled out. So the translate carries those four back: 4/3 CSS pixels
          at a 19px font is 0.0702em, and 0.02 + 0.0702 rounds to 0.09em.
          Measured from the ink, not from the boxes — a box top includes
          leading and would have called this aligned when it was not.
        */}
        <p
          className="type-body mt-[var(--s2)] ps-[0.25rem] font-display font-medium [font-size:clamp(0.82rem,3.5vw,var(--type-body))!important]"
          data-testid="text-home-mechanism"
        >
          <img
            src="/assets/top-rated-logo.png"
            alt=""
            aria-hidden="true"
            className="me-[0.18em] inline-block h-[1.105em] w-[1.105em] translate-y-[0.09em]"
          />
          {/* Not the native title any more. That one waits about a second
              before it appears, in a delay the page cannot set, and the owner
              wants both of these to answer the moment the pointer arrives — so
              Radix, whose Root takes delayDuration={0}. The provider in
              main.tsx sets 200ms for everything else and is not changed here.

              Both terms are underlined because both now carry something to
              read, and one underlined term beside a bare one that behaves
              identically would teach the reader the wrong rule. tabIndex makes
              each reachable by keyboard, which the native title never was. */}
          <Hover text="Come in. We're inside!" testId="text-home-digital-experts">
            Digital experts
          </Hover>{" "}
          +{" "}
          <Hover
            text="Every room here has its own AI agent, grounded in its service's own documentation. You can admit your own agents to a room too, and they can work alongside ours as well as collaborate between each other."
            testId="text-home-any-agents"
          >
            any AI agents
          </Hover>{" "}
          in one room.
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
          Start with a free expert audit of what the AI agents and automations in your ad accounts and beyond have
          been doing. Then the work it turns up: any automations, Google Ad, any advertising, and the measurement
          under it, inbound LinkedIn on the official API, custom AI around all of it &mdash; for you and/or your
          clients.
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
        {/*
          FOUR WAYS IN, AND THE ROOM GOES FIRST, on the owner's instruction —
          the order is the argument: the room is free and immediate, the call
          costs a slot in somebody's day, the message costs a day.

          EVERY CONTROL CARRIES ITS OWN CLASSES rather than inheriting them from
          this paragraph, and that is not verbosity. Inherited, the anchor came
          out uppercase in the display face and the two buttons came out
          sentence-case in the serif — three controls in a row, two of them
          looking like body text. Stating the class on each one is the only
          version of this that cannot drift.
        */}
        {/* ONE LINE, on a phone as well as a desktop, on the owner's
            instruction. Three actions and the room control is itself two, so
            the row is nowrap with a size that steps down with the viewport and
            stops at the label size — the same clamp the mechanism line above
            uses, and !important for the same reason: .type-meta lives in the
            frozen index.css and beats a Tailwind utility of equal specificity.
            The gap closes by a step on a phone and opens again from sm. One line from sm up, and wrapping
            below it — measured with two rooms remembered, which is when the
            control expands to "Your rooms | Open a room" and the row becomes
            four actions. At 390 that is 478px of content against 342px of
            column, and closing 116px of it means about 8px type. So a phone
            wraps between whole actions, each keeping whitespace-nowrap so no
            label breaks in the middle. A line that runs 116px off the edge is
            not the one line the owner asked for either. */}
        <div className="mt-[var(--s3)] flex flex-wrap items-baseline gap-x-[var(--s2)] gap-y-[var(--s1)] whitespace-nowrap [font-size:clamp(0.66rem,3vw,0.76rem)!important] sm:flex-nowrap sm:gap-x-[var(--s3)]">
          <RoomMenu className={ACTION_LOUD} testId="button-home-open-a-room" />
          <a
            href={BOOK_A_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-home-book-a-call"
            {...booking}
            className={ACTION_QUIET}
          >
            Book a call
          </a>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            data-testid="button-home-leave-a-message"
            className={ACTION_QUIET}
          >
            Message us
          </button>
        </div>
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
