import { CODE, DISPLAY, HEADING, META, META_PLAIN, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * THE CHATGPT ADS DOOR'S OWN PAGE.
 *
 * This is the argument that used to be the home page: the conversion-tracking
 * pitch, the seven places an engagement goes wrong, the four steps, the two
 * results, and the six objections including the two that end with us telling
 * somebody not to hire us. It moved because the home page became the landing
 * for all the doors, and a pitch for one of seven offers cannot also be the
 * front of the house.
 *
 * The copy is carried over from what those sections said on the home page —
 * WhyHuman.tsx, HowItWorks.tsx, ProofBand.tsx and Faq.tsx, which were the home
 * page before the redesign and have since been deleted, since this file and the
 * new home page had between them taken everything they said. They are in the
 * history if the wording is ever wanted; the paths no longer exist. Three
 * deliberate changes were made carrying it over:
 *
 * - The four statistics, the trainer badge and the star-rating vocabulary are
 *   gone. They are the marketplace-profile furniture the direction deletes, and
 *   none of them was an argument.
 * - Every card, tinted chip and warning icon is gone. The seven are a numbered
 *   index and the objections are a list, because that is what they are.
 * - Step one used to say "the agent in the hero". The panel is above this on
 *   the door page, so it says so.
 *
 * Nothing here is a claim this repository cannot stand behind: the identifiers
 * are the ones in the official documentation, and the two results carry the
 * sentence admitting they are Google Ads accounts.
 * ------------------------------------------------------------------------- */

interface HumanStep {
  title: string;
  /** Why an API or an agent cannot finish this one alone. */
  why: string;
  /** The specific thing that goes wrong when nobody owns it. */
  failure: string;
  /** Real identifiers from the documentation, so the claim is checkable. */
  identifiers: string[];
}

/** Section 6 of docs/ADS-DOCS-BRIEF.md, which is itself drawn from the official docs. */
const STEPS: HumanStep[] = [
  {
    title: "Deciding what counts as a conversion",
    why: "There is no endpoint for a business decision, and this one is close to irreversible: the optimisation event cannot be changed after a campaign is created, and custom events are not eligible goals at all.",
    failure:
      "Optimising on lead_created when the money is in appointment_scheduled — and a campaign rebuild, plus a second learning period, to correct it.",
    identifiers: ['bidding_type: "conversions"', "ces_…"],
  },
  {
    title: "Touching a live template or tag manager",
    why: "The snippet belongs near the top of <head> on every measured page of a real codebase or a real container, which means deploy access, a staging pass, a Content Security Policy change reviewed by whoever owns security, and a rollback plan.",
    failure: "A checkout broken by a tag, or a CSP that silently blocks the SDK on the one page that mattered.",
    identifiers: ['oaiq("init")', "script-src"],
  },
  {
    title: "Building and deploying a server endpoint",
    why: "The Conversions API is server-only, so someone stands up a real endpoint in your stack that keeps the key in a secret manager, fires on the right webhook, and respects the seven-days-past, ten-minutes-future timestamp window.",
    failure:
      "An API key shipped to the browser, where anyone can write conversions into your account — or a batch of 1,000 events rejected because one of them was malformed.",
    identifiers: ["POST /v1/events", "timestamp_ms"],
  },
  {
    title: "Event ID strategy across two systems",
    why: "Deduplication keys on pixel ID plus event name plus event ID, and the first event received wins, so the browser and the server must agree on one string generated somewhere both can reach — before either half is written.",
    failure:
      "Every purchase counted twice, or the rich server event with amount and hashed user data discarded in favour of the thin browser one that arrived first.",
    identifiers: ["event_id", "id"],
  },
  {
    title: "Consent gating",
    why: "Consent must be set before init, blocked events are never replayed, and the image tag has no consent command at all — so gating moves into render logic and has to match what your policy actually promises.",
    failure: "Conversions deleted in bulk by a consent banner that resolves a moment after the pixel has already fired.",
    identifiers: ['oaiq("consent", …)', "__obref"],
  },
  {
    title: "CRM and offline conversion plumbing",
    why: "The API accepts offline, phone_call, physical_store and email as action sources, but nothing ships the data: the stage has to be chosen, identifiers normalised and hashed correctly, backfills kept inside the timestamp window, and the job kept running after handover.",
    failure: "Bidding trained on form fills while the actual revenue sits in a CRM nobody connected.",
    identifiers: ['action_source: "offline"', "emails_sha256"],
  },
  {
    title: "Verifying real events, not preview events",
    why: "A 200 response confirms the event reached the ingestion pipeline, not that it completed downstream, and validate_only deliberately saves nothing — so proving a setup works means real conversions on the real site, reconciled against Ads Manager over days.",
    failure: "A setup that looks green in a debug console on Tuesday and reports nothing by Friday.",
    identifiers: ["GET /conversions/events", "validate_only"],
  },
];

interface Stage {
  title: string;
  meta: string;
  body: string;
}

const STAGES: Stage[] = [
  {
    title: "Ask",
    meta: "Instant, free",
    body: "Put a real question to the agent in the panel above. It answers from the official ChatGPT Ads documentation and cites the page it used. If your question turns out to be a five-minute fix, you will have it in five minutes and we will have cost you nothing.",
  },
  {
    title: "Scope",
    meta: "Shared room, no signup",
    body: "Keep the answer and it becomes a room. Your stack, your money event, and the checklist of what actually has to happen, in one shared space with our agents and our people in it. The link in the address bar is the whole account — bookmark it, or send it to your developer.",
  },
  {
    title: "Implement",
    meta: "Our engineer, your stack",
    body: "Pixel in the real template, Conversions API endpoint in your own backend with the key in your secret manager, one event ID agreed across both halves, consent wired to the banner you already run, CRM stages mapped if the money closes offline.",
  },
  {
    title: "Verify and hand over",
    meta: "Documented, with a rollback note",
    body: "Real conversions fired on the real site and reconciled in Ads Manager over days, not a debug console screenshot. Then a written map of what fires where, and a rollback note for whoever touches the site next.",
  },
];

interface CaseLine {
  headline: string;
  context: string;
  note: string;
}

const CASES: CaseLine[] = [
  {
    headline: "+180% conversion growth",
    context: "Commercial proxies. Offline conversions only.",
    note: "Nothing was bought on the website. Every conversion that mattered came back from the CRM, which meant the measurement had to be built before the bidding was worth touching.",
  },
  {
    headline: "+477% conversion growth, −81% cost per conversion",
    context: "An account previously run with incorrectly configured conversions.",
    note: "The campaigns were not the problem. The account had been optimising against conversions that were counted wrong, so the auction had been buying the wrong clicks with real budget for months. Fixing the measurement is what moved the numbers.",
  },
];

interface FaqItem {
  q: string;
  a: string;
}

/** Verbatim from the objections section of docs/ADS-DOCS-BRIEF.md. */
const FAQS: FaqItem[] = [
  {
    q: "The documentation is public and it's only a snippet. Why would I pay anyone?",
    a: "Because the snippet is the easy hour. The hard parts are deciding which event is your money event — a choice you cannot change after the campaign is created — getting the tag into a live template without breaking checkout, standing up the server endpoint the Conversions API requires, and proving that real conversions, not test fires, are landing in Ads Manager. If your team already has those four covered, you genuinely do not need us.",
  },
  {
    q: "Can't your AI agent just do the whole thing?",
    a: "No, and we would rather say so than sell you a demo. The agent is very good at the documentation: which event names exist, which data shape each one takes, how deduplication keys work, what belongs in your Content Security Policy. It cannot deploy to your site, hold your API key, decide what a conversion is worth to your business, or watch Ads Manager for three days to confirm the numbers are real. That is what the humans are for.",
  },
  {
    q: "We already run Tag Manager and we have a developer.",
    a: "Then this is probably a short engagement, and we will tell you that on the call. The usual gap is not GTM skill — it is that the Conversions API cannot be called from the browser at all, so the server half needs backend work and a secret store, and that browser and server events must share one event ID agreed before either half is written. We can do only that piece and leave the rest with your developer.",
  },
  {
    q: "We don't sell online. Deals close on the phone weeks later.",
    a: "Then the browser is the wrong place to measure and half the industry's advice does not apply to you. ChatGPT Ads accepts server-side events with action_source set to offline or phone_call, so the real work is connecting your CRM: defining which stage counts, hashing the identifiers correctly, and sending the event inside the platform's timestamp window. That is a build, and it is the kind we do.",
  },
  {
    q: "What access do you need, and what happens to our customers' data?",
    a: "Site or tag manager access to install, and ad account access to define the conversion and verify it. Personal data never leaves your systems in the clear — emails, phone numbers, names and customer IDs are normalised and SHA-256 hashed before they are sent, which the platform requires and we implement. We will never ask you to paste an API key or a password into a chat window; access is arranged through proper invite flows.",
  },
  {
    q: "How long does it take, and how do I know it's finished?",
    a: "A typical setup is days, not weeks, and most of the elapsed time is waiting for real conversions to accumulate so we can check them rather than guess. Done means: events firing on the real site, the server-side path live, browser and server deduplicating to one conversion, consent behaving the way your policy says it should, numbers reconciled in Ads Manager, and a written map of what fires where — including a rollback note for whoever touches the site next.",
  },
];

/** Escaped so no answer text can close the script element early. */
const FAQ_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
}).replace(/</g, "\\u003c");

export function ChatGptAdsBody() {
  return (
    <>
      {/* ---------------------------- the argument --------------------------- */}
      <section id="why-human" className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={DISPLAY}>Most of paid ads is now automatable. This part is not.</h2>
          <div>
            <p className={READ_MUTED}>
              We will not pretend otherwise. Creating the pixel, the API key and the event setting is three API calls.
              Generating the snippet, the hashing code, the batching loop and the retry logic is code generation, and an
              agent does it well. Answering &ldquo;which event, which data shape, which field name&rdquo; is retrieval —
              that is what the agent above is for, and it is free.
            </p>
            <p className={`mt-[var(--s3)] ${READ}`}>None of that is where engagements go wrong. These seven are.</p>
          </div>
        </div>

        <ol className="mt-[var(--s5)]">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              data-testid="item-why-human"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${HEADING} lg:col-start-2`}>{step.title}</h3>
              <div className="lg:col-start-3 lg:row-start-1">
                <p className="type-body text-muted-foreground">{step.why}</p>
                <p className={`mt-[var(--s1)] ${META_PLAIN}`}>
                  <span className="text-foreground">Prevents:</span> {step.failure}
                </p>
                <p className={`mt-[var(--s1)] ${CODE}`}>{step.identifiers.join("  ·  ")}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-[var(--s4)] max-w-[46ch]">
          <p className={READ_MUTED}>
            The documentation is good and public. The API surface is small. What you are paying for is the decision at
            the top, the hands on a live system in the middle, and the verification at the end.
          </p>
          <p className={`mt-[var(--s2)] ${READ} lg:whitespace-nowrap`}>
            There is no magic: just expertise, dedicated hours, and a systematic approach.
          </p>
        </div>
      </section>

      {/* ------------------------------ the four ----------------------------- */}
      <section id="how-it-works" className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>Four steps, and the first two are free.</h2>
          <p className={READ_MUTED}>
            The work starts when you have seen the answer and still want hands on it.
          </p>
        </div>

        <ol className="mt-[var(--s4)]">
          {STAGES.map((stage, index) => (
            <li
              key={stage.title}
              data-testid="item-how-it-works"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="lg:col-start-2">
                <h3 className={HEADING}>{stage.title}</h3>
                <p className={`mt-[var(--s1)] ${META}`}>{stage.meta}</p>
              </div>
              <p className="type-body text-muted-foreground lg:col-start-3 lg:row-start-1">{stage.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ----------------------------- two results --------------------------- */}
      <section id="proof" className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-2 lg:gap-[var(--s5)]">
          {CASES.map((entry) => (
            <div key={entry.headline} data-testid="item-case">
              <h3 className={HEADING}>{entry.headline}</h3>
              <p className={`mt-[var(--s1)] ${META}`}>{entry.context}</p>
              <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{entry.note}</p>
            </div>
          ))}
        </div>
        <p className={`mt-[var(--s4)] max-w-[62ch] ${META_PLAIN}`}>
          Both of those are Google Ads accounts, because ChatGPT Ads conversion tracking shipped in mid-2026 and anyone
          claiming years of results on it is selling you something. The measurement work is the same work: decide the
          event, install it properly, prove it in the platform.
        </p>
      </section>

      {/* ---------------------------- the objections ------------------------- */}
      <section id="faq" className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>The questions people actually ask.</h2>
          <p className={READ_MUTED}>
            Including the two that end with us telling you not to hire us. We would rather lose the engagement than take
            one where we add nothing.
          </p>
        </div>

        <div className="mt-[var(--s4)]">
          {FAQS.map((item) => (
            <details key={item.q} data-testid="item-faq" className="group border-t border-border py-[var(--s3)] last:border-b">
              <summary className="type-body cursor-pointer list-none hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {item.q}
              </summary>
              <p className={`mt-[var(--s2)] max-w-[68ch] ${READ_MUTED}`}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }} />
    </>
  );
}

export default ChatGptAdsBody;
