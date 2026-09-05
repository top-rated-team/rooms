import { ChevronDown } from "lucide-react";

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

export function Faq() {
  return (
    <section id="faq" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-16">
          <div className="lg:col-span-1">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">Objections</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">The questions people actually ask.</h2>
            <p className="mt-5 text-muted-foreground">
              Including the two that end with us telling you not to hire us. We would rather lose the engagement than
              take one where we add nothing.
            </p>
          </div>

          <div className="lg:col-span-2">
            <div className="divide-y divide-border border-y border-border">
              {FAQS.map((item) => (
                <details key={item.q} data-testid="item-faq" className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <span>{item.q}</span>
                    <ChevronDown
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }} />
    </section>
  );
}

export default Faq;
