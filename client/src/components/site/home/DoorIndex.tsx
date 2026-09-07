import { Link } from "wouter";

import { DEFAULT_DOOR_ID, DOOR_BY_ID, type DoorDef } from "@shared/doors";
import { PUBLIC_DOORS } from "@/components/site/GatedOffers";
import { countWord, firstSentence } from "@/components/site/home/doorText";

/* ---------------------------------------------------------------------------
 * THE INDEX
 *
 * All the offers, set as a table of contents rather than as a grid of cards:
 * a number, the name, one sentence, and the company that would send the
 * invoice. That last column is the reason this is a table and not a menu —
 * one of these rows is a different company's business, and a person choosing a
 * supplier is entitled to see that in the list rather than in a footnote on
 * page four.
 *
 * Every row is read off shared/doors.ts. Nothing here is typed out, so a
 * renamed offer renames itself, a corrected legal name corrects itself, and a
 * door that opens stops saying it is shut.
 *
 * A row links to its door only when the row says that door has a page.
 *
 * It lists PUBLIC_DOORS, not DOORS — which is also why the paragraph above the
 * table cannot claim that one of these rows belongs to another company. Every
 * public row is invoiced by us; the only row that is not is the gated one, and
 * it is not on this page. Saying otherwise here would be a disclosure about
 * something the visitor cannot see.
 *
 * It lists PUBLIC_DOORS, not DOORS. The tier rule in GatedOffers.tsx is the only
 * place the split may be decided, and this page is open to anyone: printing the
 * grey row here would name the partner and their offer on the front page, which
 * is exactly what the email step on /work exists to withhold — and what the
 * noindex on that door page and its absence from sitemap.xml are also for.
 * ------------------------------------------------------------------------- */

const OUR_LEGAL_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

function doorHref(door: DoorDef): string | null {
  if (door.status !== "live") return null;
  return door.path;
}

const NUMBER = "type-meta tabular-nums text-muted-foreground";

export function DoorIndex() {
  return (
    <section id="doors" className="mx-auto max-w-[var(--page)] scroll-mt-[var(--s3)] px-[var(--s3)] pt-[var(--s6)]">
      <div className="grid grid-cols-1 items-baseline gap-[var(--s3)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
        <h2 className="type-body m-0 font-display font-medium">
          {countWord(PUBLIC_DOORS.length).replace(/^./, (c) => c.toUpperCase())} things, and who sends the invoice for each.
        </h2>
        <p className="type-body m-0 text-muted-foreground">
          Whoever sets the price is the seller, so every row says which company would send the invoice — before you pick
          one, rather than in a footnote afterwards. On this page that is the same company six times. Some work is
          delivered by a different company entirely, under its own contract; where that is true the row says so.
        </p>
      </div>

      <div className="mt-[var(--s4)]">
        {PUBLIC_DOORS.map((door, index) => {
          const href = doorHref(door);
          const theirs = door.contract.legalName !== OUR_LEGAL_NAME;
          const shut = door.status !== "live";
          const name = <span className="type-body font-display font-medium leading-tight">{door.headline}</span>;

          return (
            <div
              key={door.id}
              data-testid="row-door"
              className="grid grid-cols-[2.5rem_1fr] items-baseline gap-x-[var(--s2)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[4rem_minmax(0,26ch)_minmax(0,1fr)_minmax(0,17ch)] lg:gap-[var(--s3)]"
            >
              <span className={NUMBER}>{String(index + 1).padStart(2, "0")}</span>

              <div className={shut ? "opacity-60" : undefined}>
                {href ? (
                  <Link href={href} data-testid="link-door" className="draw">
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </div>

              <p className={`col-start-2 m-0 text-muted-foreground lg:col-start-3 ${shut ? "opacity-60" : ""}`}>
                <span className="type-body">
                  {firstSentence(door.blurb)}
                  {shut ? " Not open yet." : ""}
                </span>
              </p>

              <span
                data-testid="text-door-invoices"
                className={`type-meta col-start-2 lg:col-start-4 ${theirs ? "text-primary" : "text-muted-foreground"}`}
              >
                {door.contract.legalName}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default DoorIndex;
