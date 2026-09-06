import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { DOOR_TIERS, type DoorDef, type DoorTier } from "@shared/doors";
import { BOOK_A_CALL_URL } from "@shared/roster";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;

/* The tier is a fact about who you are buying from, so it gets the same tinted
 * chip vocabulary as everything else: ours reads as primary, the partner's row
 * as a plain outline — a different company should not wear our colour. */
const TIER_VARIANT: Record<DoorTier, "default" | "secondary" | "outline"> = {
  white: "default",
  "light-grey": "secondary",
  grey: "outline",
};

export interface DoorCardProps {
  door: DoorDef;
  /**
   * Opens this door's panel in place. Without it the card links to the door's
   * own page, which is what the overview does; the landing page can pass a
   * handler instead and keep the visitor where they are.
   */
  onAsk?: (door: DoorDef) => void;
  className?: string;
}

export function DoorCard({ door, onAsk, className }: DoorCardProps) {
  const tier = DOOR_TIERS[door.tier];

  // With a handler the panel opens where the visitor already is; without one the
  // card is a link to the door's own page, which is what /work does.
  const askAction = onAsk ? (
    <button type="button" data-testid="button-door-ask" className={BTN_PRIMARY} onClick={() => onAsk(door)}>
      Ask about it
      <ArrowRight />
    </button>
  ) : (
    <Link href={door.path} data-testid="link-door-ask" className={BTN_PRIMARY}>
      Ask about it
      <ArrowRight />
    </Link>
  );

  const bookAction = (
    <a
      href={BOOK_A_CALL_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="link-door-book-call"
      className={BTN_SECONDARY}
    >
      Talk to a person
    </a>
  );

  return (
    <article
      data-testid="card-door"
      className={`rounded-lg border border-card-border bg-card p-5 sm:p-6 ${className ?? ""}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${door.tone}`}
          aria-hidden="true"
        >
          {door.initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold sm:text-lg" data-testid="text-door-headline">
              {door.headline}
            </h3>
            <Badge variant={TIER_VARIANT[door.tier]} data-testid="badge-door-tier">
              {tier.label}
            </Badge>
            {door.status === "coming" ? (
              <Badge variant="outline" data-testid="badge-door-status">
                Not open yet
              </Badge>
            ) : null}
          </div>

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{door.blurb}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{door.agentLine}</p>
          {door.comingLine ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{door.comingLine}</p>
          ) : null}
        </div>
      </div>

      {/* The footer block is the whole point of the table: whoever is named here
          is who the room names, and it is set by the door rather than by a
          person remembering. */}
      <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground" data-testid="text-door-legal-name">
            {door.contract.legalName}
          </p>
          <p className="mt-0.5">{door.contract.invoiceLine}</p>
          <p className="mt-0.5">{tier.meaning}</p>
          {door.contract.termsUrl ? (
            <a
              href={door.contract.termsUrl}
              rel="noopener noreferrer"
              data-testid="link-door-terms"
              className="mt-1 inline-flex items-center gap-1 text-foreground hover:underline"
            >
              Terms
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            // Never offer the terms of the company next door.
            <p className="mt-0.5">
              {door.contract.legalName} has not published terms for this work yet, and this page will not show anybody
              else&rsquo;s.
            </p>
          )}
        </div>

        {/* A door that cannot hold a conversation yet offers the thing that can:
            a person. It never offers a panel that is not there. */}
        <div className="shrink-0">{door.status === "live" ? askAction : bookAction}</div>
      </div>
    </article>
  );
}

export default DoorCard;
