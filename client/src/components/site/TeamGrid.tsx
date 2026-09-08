import { EXPERTS } from "@shared/roster";
import { HEADING, META, PAGE, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * THE PEOPLE, WITHOUT THE NAMES
 *
 * NAMES ARE OFF THIS PAGE. That is the conservative reading of a decision
 * docs/specs/team.md left open, and it is the parcel's instruction rather than
 * the spec's fallback.
 *
 * The spec records four personal names as they stand on production (already
 * half-redacted: "Dan B.") and three options, then says the rebuild should
 * carry the names through until the owner rules. The parcel overrules that
 * default: the owner does not want his full legal name across the internet,
 * and the identification rule (docs/doors.md; the footer) confines the legal
 * form to the footer, Terms and invoices. Publishing even an abbreviated
 * personal name on a public page is the thing that rule exists to stop.
 *
 * So this grid is the spec's option (b): role and specialties, read off
 * shared/roster.ts's EXPERTS — the same four people a room can invite. No
 * name, no initials disc derived from a name, no photograph (none exist in
 * client/public/assets/people, and this file will not invent one), no
 * per-person Upwork URL. The outbound profile links went with the names;
 * an Upwork URL is a full identity sitting one click behind a half-redacted
 * one.
 *
 * Production fetched these people from /api/team. This application has no
 * such route. EXPERTS is the deliberate migration: one list, the room and
 * this page, so a person added to the roster appears here without a second
 * table to forget.
 * ------------------------------------------------------------------------- */

export function TeamGrid() {
  return (
    <section className={`${PAGE} pt-[var(--s5)]`} data-testid="list-team">
      <p className={META}>The work</p>
      <ul className="mt-[var(--s3)] list-none p-0">
        {EXPERTS.map((person) => (
          <li
            key={person.id}
            className="border-t border-border py-[var(--s3)] last:border-b"
            data-testid="item-team-role"
          >
            <h2 className={`${HEADING} m-0`}>{person.title}</h2>
            <p className={`mt-[var(--s1)] ${READ_MUTED}`}>{person.specialties.join(" · ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TeamGrid;
