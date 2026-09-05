import { MessageSquare } from "lucide-react";
import { EXPERTS } from "@shared/roster";
import type { LeadPrefill } from "@/components/site/LeadDialog";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_SECONDARY_SM = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-8 rounded-md px-3 text-xs`;

export interface ExpertsBandProps {
  onTalkToHuman: (prefill?: LeadPrefill) => void;
}

export function ExpertsBand({ onTalkToHuman }: ExpertsBandProps) {
  return (
    <section id="experts" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Who does the work</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">
            Four people, named, with the hours behind them.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Conversion tracking engagements are led by Ihor. The others come in when the answer turns out to be about
            campaigns, feeds or the site rather than the measurement.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXPERTS.map((expert) => (
            <article
              key={expert.id}
              data-testid="card-expert"
              className={`flex flex-col rounded-lg border border-card-border bg-card p-5 ${
                expert.leadsConversionTracking ? "ring-1 ring-primary/30" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    expert.leadsConversionTracking ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {expert.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{expert.name}</h3>
                  <p className="text-xs leading-snug text-muted-foreground">{expert.title}</p>
                </div>
              </div>

              {expert.leadsConversionTracking ? (
                <p className="mt-4 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  Leads conversion-tracking setups
                </p>
              ) : null}

              <ul className="mt-4 flex flex-wrap gap-1.5">
                {expert.specialties.map((specialty) => (
                  <li
                    key={specialty}
                    className="rounded-md border border-card-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {specialty}
                  </li>
                ))}
              </ul>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {expert.badges.map((badge) => (
                  <li key={badge} className="text-[11px] font-medium text-accent">
                    {badge}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex-1" />
              <button
                type="button"
                data-testid="button-expert-message"
                className={BTN_SECONDARY_SM}
                onClick={() =>
                  onTalkToHuman({
                    intent: expert.leadsConversionTracking ? "conversion-tracking" : undefined,
                    expertName: expert.name,
                    message: `I'd like ${expert.name} to look at this. `,
                  })
                }
              >
                <MessageSquare />
                Message
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ExpertsBand;
