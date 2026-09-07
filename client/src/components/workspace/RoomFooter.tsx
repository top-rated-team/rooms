import { useState } from "react";
import type { DoorContract } from "@shared/doors";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, CHROME, LABEL, LINK, META } from "@/components/workspace/room-style";

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
 * WHAT THE RESTYLE DID TO IT. The block lost its card and its warning triangle
 * and got bigger, not smaller: the line naming the company moved up from 11px
 * to the chrome size, and the fault state now opens with the word FAULT in the
 * one colour left in this room. A restyle that made this harder to notice would
 * have been a worse room, not a quieter one.
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

/** Long enough that it would push the invoice line and the terms out of sight. */
const ENTITY_CLAMP = 180;

export function RoomFooter({ contract, className }: RoomFooterProps) {
  const [entityOpen, setEntityOpen] = useState(false);
  const legalName = contract?.legalName?.trim() ?? "";
  const entity = contract?.entity?.trim() ?? "";
  const entityLong = entity.length > ENTITY_CLAMP;

  if (!legalName) {
    // A room with no name behind it is a fault, not a tidy default, and the
    // person reading it is the one who needs to know.
    return (
      <div className={cn("border-t border-border px-4 py-4", className)} data-testid="room-footer-missing">
        <p className={cn(LABEL, "text-destructive")}>Fault</p>
        <p className={cn(CHROME, "mt-1.5 text-destructive")}>
          This room is not saying which company is answerable for it. That is a fault in the room. Until it is fixed,
          nothing here is an offer.
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
    <div className={cn("border-t border-border px-4 py-4", className)} data-testid="room-footer">
      <h2 className={LABEL}>This room</h2>

      <p className={cn(CHROME, "mt-1.5 text-muted-foreground")}>
        <span className="font-medium text-foreground" data-testid="text-room-legal-name">
          {legalName}
        </span>{" "}
        is answerable for this room.
      </p>

      {entity ? (
        <>
          <p className={cn(META, "mt-1.5 text-muted-foreground", entityLong && !entityOpen && "line-clamp-2")}>
            {entity}
          </p>
          {entityLong ? (
            <button type="button" onClick={() => setEntityOpen((v) => !v)} className={cn(ACTION_QUIET, "mt-1")}>
              {entityOpen ? "Less" : "More"}
            </button>
          ) : null}
        </>
      ) : null}

      {contract.invoiceLine ? (
        <p className={cn(META, "mt-1.5 text-muted-foreground")} data-testid="text-room-invoice-line">
          {contract.invoiceLine}
        </p>
      ) : null}

      {termsUrl || contactHref ? (
        <p className={cn(META, "mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1")}>
          {termsUrl ? (
            <a
              href={termsUrl}
              target={externalTerms ? "_blank" : undefined}
              rel={externalTerms ? "noreferrer" : undefined}
              className={LINK}
              data-testid="link-room-terms"
            >
              Their terms
            </a>
          ) : null}
          {contactHref ? (
            <a
              href={contactHref}
              target={isEmail ? undefined : "_blank"}
              rel={isEmail ? undefined : "noreferrer"}
              className={LINK}
              data-testid="link-room-contact"
            >
              {contactText}
            </a>
          ) : null}
        </p>
      ) : null}

      {/* Never fall back to the terms of the company next door. */}
      {termsUrl ? null : (
        <p className={cn(CHROME, "mt-2 text-destructive")} data-testid="text-room-terms-missing">
          {legalName} has not published terms for this work yet, and this room will not show anybody else&apos;s.
          Nothing here is an offer until it does.
        </p>
      )}

      {contactHref ? null : (
        <p className={cn(META, "mt-1.5 text-muted-foreground")} data-testid="text-room-contact-missing">
          There is no address on file for writing to {legalName} about this room.
        </p>
      )}

      {/* The other half of "who is behind this": who can read it. */}
      <p className={cn(META, "mt-3 text-muted-foreground")}>
        Private. The link is the only way in. Nothing here is public.
      </p>
    </div>
  );
}

export default RoomFooter;
