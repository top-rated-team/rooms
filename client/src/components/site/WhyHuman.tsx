import { AlertTriangle } from "lucide-react";

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

export function WhyHuman() {
  return (
    <section id="why-human" className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Where the work actually is</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">
            Most of paid ads is now automatable. This part is not.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            We will not pretend otherwise. Creating the pixel, the API key and the event setting is three API calls.
            Generating the snippet, the hashing code, the batching loop and the retry logic is code generation, and an
            agent does it well. Answering &ldquo;which event, which data shape, which field name&rdquo; is retrieval —
            that is what the agent above is for, and it is free.
          </p>
          <p className="mt-4 text-lg font-medium">
            None of that is where engagements go wrong. These seven are.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <article
              key={step.title}
              data-testid="card-why-human"
              className="flex flex-col rounded-lg border border-card-border bg-card p-5"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-base font-semibold leading-snug">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.why}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {step.identifiers.map((identifier) => (
                  <code
                    key={identifier}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {identifier}
                  </code>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2 border-t border-card-border pt-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" aria-hidden="true" />
                <p className="leading-relaxed">
                  <span className="font-medium">Prevents: </span>
                  <span className="text-muted-foreground">{step.failure}</span>
                </p>
              </div>
            </article>
          ))}

          <article className="flex flex-col justify-center rounded-lg border border-primary/30 bg-background p-5">
            <h3 className="text-base font-semibold">The honest summary</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The documentation is good and public. The API surface is small. What you are paying for is the decision at
              the top, the hands on a live system in the middle, and the verification at the end.
            </p>
            <p className="mt-3 text-sm font-medium leading-relaxed">
              There is no magic: just expertise, dedicated hours, and a systematic approach.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default WhyHuman;
