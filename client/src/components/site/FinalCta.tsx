import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { BOOK_A_CALL_URL } from "@shared/roster";
import type { LeadPrefill } from "@/components/site/LeadDialog";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;
const BTN_GHOST = `${BTN_BASE} border border-transparent min-h-9 px-4 py-2`;

export interface FinalCtaProps {
  onTalkToHuman: (prefill?: LeadPrefill) => void;
  onStartWorkspace: (opts?: { agentId?: string; firstMessage?: string }) => Promise<string | null>;
}

export function FinalCta({ onTalkToHuman, onStartWorkspace }: FinalCtaProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const failure = await onStartWorkspace({ agentId: "conversion-tracking" });
    setPending(false);
    if (failure) setError(failure);
  }

  return (
    <section id="start" className="py-20 lg:py-28 bg-card border-y border-card-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">
            Start where it costs nothing: open a workspace.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            No signup and no card. The link becomes yours, the agents are in it, and our people join when the work turns
            into hands on a live system. If a call is faster, take the call instead.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="button-final-start-workspace"
              className={BTN_PRIMARY}
              onClick={() => void start()}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              Start a workspace
              {pending ? null : <ArrowRight />}
            </button>
            <a
              href={BOOK_A_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-final-book-call"
              className={BTN_SECONDARY}
            >
              Book a call
            </a>
            <button
              type="button"
              data-testid="button-final-message"
              className={BTN_GHOST}
              onClick={() => onTalkToHuman({ intent: "conversion-tracking" })}
            >
              Send a message instead
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <p className="mt-8 text-sm text-muted-foreground">
            There is no magic: just expertise, dedicated hours, and a systematic approach.
          </p>
        </div>
      </div>
    </section>
  );
}

export default FinalCta;
