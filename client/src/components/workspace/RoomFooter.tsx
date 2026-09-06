import { TriangleAlert } from "lucide-react";
import type { DoorContract } from "@shared/doors";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * The room's legal identity: which company is answerable for what happens here,
 * whose terms apply, who sends the invoice, and where a person writes when
 * something goes wrong.
 *
 * The door sets it once — `DoorDef.contract` in shared/doors.ts — and the room
 * carries it from then on. That is the mechanism that keeps the partner
 * business genuinely separate on a shared site: somebody who came in through
 * the partner door reads the partner's name here, the partner's terms and the
 * partner's address, and never a Top-Rated Team one.
 *
 * So a room must not be able to render without one. `contract` is required, and
 * where a field is missing this footer says which one, in the room, rather than
 * rendering nothing or borrowing ours. A door with no terms of its own shows
 * that it has none — never the terms of the company next to it.
 *
 * This is design, not legal advice.
 * ------------------------------------------------------------------------- */

export interface RoomFooterProps {
  /**
   * The door's contract row: the legal name, the terms, who invoices and where
   * to write. Required — see the note above about rooms with nobody behind them.
   */
  contract: DoorContract;
  className?: string;
}

export function RoomFooter({ contract, className }: RoomFooterProps) {
  const legalName = contract?.legalName?.trim() ?? "";

  if (!legalName) {
    // A room with no name behind it is a fault, not a tidy default, and the
    // person reading it is the one who needs to know.
    return (
      <div className={cn("border-t border-card-border px-3 py-3", className)} data-testid="room-footer-missing">
        <p className="flex items-start gap-2 text-[11px] leading-4 text-destructive">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            This room is not saying which company is answerable for it. That is a fault in the room. Until it is fixed,
            nothing here is an offer.
          </span>
        </p>
      </div>
    );
  }

  const termsUrl = contract.termsUrl?.trim() || null;
  const externalTerms = termsUrl ? /^https?:\/\//i.test(termsUrl) : false;
  const address = contract.contact?.trim() || null;
  const isEmail = address ? address.includes("@") && !/^https?:\/\//i.test(address) : false;
  const contactHref = address ? (isEmail ? `mailto:${address}` : address) : null;
  const contactText = contract.contactLabel ?? (isEmail ? `Write to ${address}` : "Write to them");

  return (
    <div className={cn("border-t border-card-border px-3 py-3", className)} data-testid="room-footer">
      <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">This room</h2>

      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        <span className="font-medium text-foreground" data-testid="text-room-legal-name">
          {legalName}
        </span>{" "}
        is answerable for this room.
      </p>

      {contract.entity ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{contract.entity}</p>
      ) : null}

      {contract.invoiceLine ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground" data-testid="text-room-invoice-line">
          {contract.invoiceLine}
        </p>
      ) : null}

      {termsUrl || contactHref ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4">
          {termsUrl ? (
            <a
              href={termsUrl}
              target={externalTerms ? "_blank" : undefined}
              rel={externalTerms ? "noreferrer" : undefined}
              className="rounded underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="link-room-terms"
            >
              Their terms
            </a>
          ) : null}
          {termsUrl && contactHref ? <span className="text-muted-foreground">·</span> : null}
          {contactHref ? (
            <a
              href={contactHref}
              target={isEmail ? undefined : "_blank"}
              rel={isEmail ? undefined : "noreferrer"}
              className="rounded underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="link-room-contact"
            >
              {contactText}
            </a>
          ) : null}
        </p>
      ) : null}

      {/* Never fall back to the terms of the company next door. */}
      {termsUrl ? null : (
        <p className="mt-1 text-[11px] leading-4 text-destructive" data-testid="text-room-terms-missing">
          {legalName} has not published terms for this work yet, and this room will not show anybody else's. Nothing
          here is an offer until it does.
        </p>
      )}

      {contactHref ? null : (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground" data-testid="text-room-contact-missing">
          There is no address on file for writing to {legalName} about this room.
        </p>
      )}

      {/* The other half of "who is behind this": who can read it. */}
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        Private. The link is the only way in. Nothing here is public.
      </p>
    </div>
  );
}

export default RoomFooter;
