import { useMemo, useState } from "react";
import { ArrowRight, Loader2, MessageSquare } from "lucide-react";
import { SERVICES, SERVICE_GROUPS } from "@shared/roster";
import type { LeadPrefill } from "@/components/site/LeadDialog";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_GHOST_SM = `${BTN_BASE} border border-transparent min-h-8 rounded-md px-3 text-xs -ml-3`;

export interface ServicesUpsellProps {
  onTalkToHuman: (prefill?: LeadPrefill) => void;
  onStartWorkspace: (opts?: { agentId?: string; firstMessage?: string }) => Promise<string | null>;
}

export function ServicesUpsell({ onTalkToHuman, onStartWorkspace }: ServicesUpsellProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(
    () => SERVICE_GROUPS.map((group) => ({ group, items: SERVICES.filter((service) => service.group === group) })),
    [],
  );

  async function askAgent(serviceId: string, agentId: string) {
    setPendingId(serviceId);
    setError(null);
    const failure = await onStartWorkspace({ agentId });
    setPendingId(null);
    if (failure) setError(failure);
  }

  return (
    <section id="services" className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">The rest of it</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">
            The same team already does the rest of your marketing.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Conversion tracking is one service, and it is often the one that reveals the real problem. Everything below
            is work we do ourselves — not a referral network. Where an agent knows the subject, you can put a question to
            it right now instead of booking anything.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <h3 className="border-b border-border pb-3 text-sm font-semibold uppercase tracking-wide">{group}</h3>
              <ul className="mt-4 space-y-5">
                {items.map((service) => {
                  // Bound to a const so the narrowing survives into the click handler.
                  const agentId = service.agentId;
                  return (
                    <li key={service.id} data-testid="item-service">
                      <p className="text-sm font-medium">{service.name}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{service.blurb}</p>
                      {agentId ? (
                        <button
                          type="button"
                          data-testid="button-service-ask-agent"
                          className={`${BTN_GHOST_SM} mt-1.5 text-primary`}
                          disabled={pendingId !== null}
                          onClick={() => void askAgent(service.id, agentId)}
                        >
                          {pendingId === service.id ? <Loader2 className="animate-spin" /> : null}
                          Ask the agent
                          {pendingId === service.id ? null : <ArrowRight />}
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid="button-service-talk"
                          className={`${BTN_GHOST_SM} mt-1.5 text-muted-foreground`}
                          onClick={() => onTalkToHuman({ intent: service.id })}
                        >
                          <MessageSquare />
                          Talk to us
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-8 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default ServicesUpsell;
