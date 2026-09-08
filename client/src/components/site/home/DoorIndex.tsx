import { Link } from "wouter";

import { DOOR_TIERS, type DoorDef } from "@shared/doors";
import { LISTED_DOORS, PUBLIC_DOORS, isPublicDoor } from "@/components/site/GatedOffers";
import { countWord, firstSentence } from "@/components/site/home/doorText";

/* ---------------------------------------------------------------------------
 * THE INDEX
 *
 * All the public services, set as a table of contents rather than as a grid of
 * cards: a number, the name, one sentence.
 *
 * There used to be a fourth column naming the company that would send the
 * invoice. It went on the owner's instruction, and the instruction was right:
 * every row on this page is invoiced by us, so the column printed one name six
 * times — noise wearing the clothes of a disclosure, and paperwork placed in
 * front of the work. The disclosure survives where it is about somebody else:
 * on that door's own page, in the gated list after the email step, and in the
 * footer of the room a conversation becomes.
 *
 * Every row is read off shared/doors.ts. Nothing here is typed out, so a
 * renamed offer renames itself, a corrected legal name corrects itself, and a
 * door that opens stops saying it is shut.
 *
 * A row links to its door only when the row says that door has a page.
 *
 * It lists LISTED_DOORS — all of them — and counts PUBLIC_DOORS, which is the
 * ones we sell. A partner's row is on the page, labelled Partner, and is not
 * counted in a sentence about how many services Top-Rated Team has. Both facts
 * are true at once and the page says both. The tier rule in GatedOffers.tsx is the only
 * place the split may be decided, and this page is open to anyone: printing the
 * grey row here would name the partner and their offer on the front page, which
 * is exactly what the email step on /services exists to withhold — and what the
 * noindex on that door page and its absence from sitemap.xml are also for.
 * ------------------------------------------------------------------------- */

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
          {countWord(PUBLIC_DOORS.length).replace(/^./, (c) => c.toUpperCase())} services. Pick the one that sounds like your
          problem.
        </h2>
        <p className="type-body m-0 text-muted-foreground">
          Most paid ads accounts we open have been handed to the platform&rsquo;s own automation and to agents somebody
          added, and are now optimising against something nobody chose. The free audit is the first row for that
          reason. Each one that is open starts with a question rather than a form, and the agent answering it reads
          only that service&rsquo;s own documentation.
        </p>
      </div>

      <div className="mt-[var(--s4)]">
        {LISTED_DOORS.map((door, index) => {
          const href = doorHref(door);
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

              {/* The fourth column, back — but carrying a relationship rather
                  than an invoice, and only on the rows where there is one to
                  name. A partner's row says Partner and whose it is; ours say
                  nothing, because "Top-Rated Team" on our own site is not
                  information. */}
              <span
                data-testid="text-door-partner"
                className={`type-meta col-start-2 lg:col-start-4 ${shut ? "opacity-60" : ""}`}
              >
                {/* The word and nothing after it. It said "Partner ·
                    <company>" and the owner cut the company: a list is where a
                    reader decides what to read next, and the supplier's name is
                    what they need on the page they open, not before it. */}
                {isPublicDoor(door) ? null : (
                  <span className="text-primary">{DOOR_TIERS[door.tier].label}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default DoorIndex;
