import { ArrowRight, Award } from "lucide-react";
import { BOOK_A_CALL_URL, PROOF } from "@shared/roster";
import AskWidget from "@/components/site/AskWidget";
import type { LeadPrefill } from "@/components/site/LeadDialog";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;

export interface HeroProps {
  onTalkToHuman: (prefill?: LeadPrefill) => void;
  onStartWorkspace: (opts?: { agentId?: string; firstMessage?: string }) => Promise<string | null>;
}

export function Hero({ onTalkToHuman, onStartWorkspace }: HeroProps) {
  return (
    <section id="hero" className="pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[85vh] items-center gap-12 py-16 lg:grid-cols-[1.08fr_1fr] lg:gap-16 lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Award className="h-4 w-4 text-primary" />
              Official Google Ads Trainers · Google Partner Top 10%
            </div>

            {/* Two lines at 60px, matching top-rated.team's hero rhythm. Keep it
                short enough to stay two lines — a six-line headline is the fastest
                way to lose a paid click. */}
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Conversion tracking{" "}
              <span className="text-primary">for ChatGPT Ads</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              The one part of paid ads an API still can&rsquo;t finish for you. Pixel, Conversions API, deduplication and
              consent — installed on your real site, verified against live conversions, and documented before we hand it
              back.
            </p>

            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              There is no magic: just expertise, dedicated hours, and a systematic approach.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="button-hero-primary"
                className={BTN_PRIMARY}
                onClick={() => onTalkToHuman({ intent: "conversion-tracking" })}
              >
                Set up my conversion tracking
                <ArrowRight />
              </button>
              <a
                href={BOOK_A_CALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-hero-book-call"
                className={BTN_SECONDARY}
              >
                Book a call
              </a>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-6">
              {PROOF.map((item) => (
                <div key={item.label} className="flex items-baseline gap-2">
                  <dt className="sr-only">{item.label}</dt>
                  <dd className="text-base font-semibold tabular-nums">{item.value}</dd>
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:pl-4">
            <AskWidget onStartWorkspace={onStartWorkspace} />
            <p className="mt-3 text-center text-xs text-muted-foreground lg:text-left">
              Ask first. It costs nothing, and it is the fastest way to find out whether you need us at all.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
