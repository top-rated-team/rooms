import { Link } from "wouter";

import { DEFAULT_DOOR_ID, DOOR_BY_ID, DOOR_TIERS, type DoorDef } from "@shared/doors";
import { HEADING, META, META_PLAIN, NUMERAL } from "@/components/site/doors/quiet";

/** Ours. A row naming this company is telling the reader nothing new. */
const OUR_LEGAL_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

/**
 * One door, as a line in an index rather than as a card.
 *
 * It used to be a bordered box with a tinted initials square, two chips, an
 * agent line, a contract block, a terms link and a button — eleven things, on a
 * page that repeated them six times. Everything a stranger needs in a list is
 * four: what it is called, what it is, whether it is open, and the company that
 * and, when that is somebody else, the company that would invoice it. The rest
 * is on the door's own page, one click away,
 * and that click is the row's name.
 *
 * The file keeps its name because it is the one this parcel owns. What it draws
 * is a row.
 */
export interface DoorCardProps {
  door: DoorDef;
  /**
   * Its position in the list it is being printed in, from 1. Printed in the
   * margin, which is what makes a list of offers read as a table of contents
   * rather than as a stack of adverts. Omitted where a list is too short to
   * number.
   */
  index?: number;
  className?: string;
}

export function DoorCard({ door, index, className }: DoorCardProps) {
  const tier = DOOR_TIERS[door.tier];
  const shut = door.status !== "live";

  return (
    <article
      data-testid="card-door"
      className={`grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)_minmax(0,18ch)] ${className ?? ""}`}
    >
      <span className={NUMERAL} aria-hidden="true">
        {index === undefined ? "" : String(index).padStart(2, "0")}
      </span>

      {/* The name is the row's way in, on every row, whatever its status: a
          door that is not open yet still has a page, and that page opens with
          the same two sentences, the same line about why it is shut and the
          company that would invoice, when it is not us. One link and no second button — a row with
          two ways in has neither. */}
      <h3 className={`${HEADING} ${shut ? "text-muted-foreground" : ""}`} data-testid="text-door-headline">
        <Link
          href={door.path}
          data-testid="link-door-page"
          className="draw draw-on focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {door.headline}
        </Link>
      </h3>

      <div className="lg:col-start-3">
        <p className={`type-body ${shut ? "text-muted-foreground/70" : "text-muted-foreground"}`}>{door.blurb}</p>
        {shut && door.comingLine ? <p className={`mt-[var(--s1)] ${META_PLAIN}`}>{door.comingLine}</p> : null}
      </div>

      {/* The company is named only when it is NOT us.
          On the owner's instruction, who sends the invoice is not a thing this
          site says on a list — it belongs in the room, in its footer, next to
          whose terms apply. But a row delivered, contracted and invoiced by a
          DIFFERENT company is a different matter: that is a disclosure a person
          choosing a supplier is owed before they choose, not after. So the name
          appears on exactly the rows where it tells the reader something they
          would not otherwise assume. */}
      <div className="lg:col-start-4 lg:text-right">
        {door.contract.legalName !== OUR_LEGAL_NAME ? (
          <p className={META} data-testid="text-door-legal-name">
            {door.contract.legalName}
          </p>
        ) : null}
        <p className={`mt-[var(--s1)] ${META}`} data-testid="text-door-tier">
          {tier.label}
        </p>
        {shut ? (
          <p className={`mt-[var(--s1)] ${META}`} data-testid="text-door-status">
            Not open yet
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default DoorCard;
