/* ---------------------------------------------------------------------------
 * THE LADDER
 *
 * The first thing on this site that makes a commercial promise, so it is the
 * first thing that has to be one number in one place. Every figure below is
 * read off shared/pricing.ts. Nothing here is typed out, which is the whole
 * point: a price somebody retyped is a price that will disagree with the other
 * copy of itself, and the disagreement is always found by the person who paid
 * the higher one.
 *
 * Three shapes, because a price is read in three places:
 *
 *   Ladder        the whole ladder, low on the home page
 *   DoorPrice     one row, on a door page — its own row and never the table
 *   BeforeYouBuy  the call and the record, which belong beside both
 *
 * WHAT THIS DELIBERATELY IS NOT. The design has three type sizes and one
 * accent, and a pricing table is where that discipline is most likely to be
 * abandoned, so: no cards, no ring around a recommended row, no monthly/annual
 * toggle, no crossed-out figure, no badge, no tint. Structure is hairline rules
 * and space, the same as the door index above it. A row that needed a ring to
 * be chosen would be telling you something the words should have said.
 *
 * AND THERE IS NO CHECKOUT. Nothing in this repository takes a payment, so
 * nothing here offers to. The action beside a price is the free call, which is
 * what the owner asked for and also the only thing that is true.
 * ------------------------------------------------------------------------- */
import { type DoorDef } from "@shared/doors";
import { PRICES, priceForDoor, type PriceRow } from "@shared/pricing";
import { BOOK_A_CALL_URL, EXPERTS } from "@shared/roster";
import { ACTION, ACTION_QUIET, META, META_PLAIN, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";

/**
 * The person who signs, read off the roster rather than typed here, so a change
 * of owner is a change of one row in shared/roster.ts. The badge is stated on
 * that row on purpose — who signs a contract is not something to infer from a
 * job title.
 */
const OWNER = EXPERTS.find((expert) => expert.badge === "Owner");

/**
 * The agency profile, which is where three of the four figures on the first
 * screen come from. It is the same URL FirstScreen.tsx links, and it is here
 * for the same reason: a record a visitor can read beats one they are asked to
 * take on trust.
 *
 * The owner's specification asks for the individual Upwork profile of Dan and
 * of the assigned contractor. Neither URL exists anywhere in this repository,
 * and inventing a link to somebody's profile is worse than linking the record
 * that does exist — so this links the agency and the handoff asks for the two
 * profiles. When `ExpertDef` carries them, this block prints them per person.
 */
const UPWORK_AGENCY_URL = "https://www.upwork.com/agencies/google/";

/* ------------------------------- one row ---------------------------------- */

/**
 * A price, what it buys, and the condition that makes it true.
 *
 * The condition is printed beside the price rather than under an asterisk,
 * because on three of these rows it is the difference between a true sentence
 * and a false one — what "not metered" is measured on, what "free" is
 * conditional on, and which of two things the setup row buys. A price whose
 * condition is in the small print has been quoted, not published.
 */
function Row({ row }: { row: PriceRow }) {
  return (
    <div
      data-testid="row-price"
      className="grid grid-cols-1 items-baseline gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[minmax(0,20ch)_minmax(0,1fr)] lg:gap-[var(--s3)]"
    >
      <span data-testid="text-price" className={`${READ} font-display font-medium tabular-nums`}>
        {row.price}
      </span>

      <div>
        <p className={`m-0 ${READ}`}>{row.buys}</p>
        {row.condition ? <p className={`mt-[var(--s1)] m-0 ${META_PLAIN}`}>{row.condition}</p> : null}
      </div>
    </div>
  );
}

/* --------------------------- before you pay ------------------------------- */

/**
 * What a buyer sees before paying, and again inside the room once they have.
 *
 * The owner asked for this explicitly and called it the trust half of the
 * offer: a person's name against the price, and a public record of the work
 * behind it, before any money is discussed rather than after.
 *
 * Exported because the room has to print it too. Nothing here depends on
 * having bought anything, so the same component serves both places.
 */
export function BeforeYouBuy({ className = "" }: { className?: string }) {
  return (
    <div data-testid="block-before-you-buy" className={className}>
      <p className={META}>Before you pay</p>

      <p className={`mt-[var(--s2)] ${READ}`}>
        The introductory call costs nothing and two people are on it:{" "}
        {OWNER ? `${OWNER.name}, who owns the company that signs,` : "the owner of the company that signs,"} and the
        contractor who would do the work. You meet the person doing it before you agree to anything, not after.
      </p>

      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
        The team&rsquo;s record on Upwork is public, and it is where the hours and the job-success score on this site
        come from. Read it before the call rather than taking either on trust.
      </p>

      <p className="mt-[var(--s3)] flex flex-wrap items-center gap-x-[var(--s3)] gap-y-[var(--s2)]">
        <a
          href={BOOK_A_CALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-price-call"
          className={ACTION}
        >
          Book the introductory call
        </a>
        <a
          href={UPWORK_AGENCY_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-price-upwork"
          className={ACTION_QUIET}
        >
          Read the record on Upwork
        </a>
      </p>
    </div>
  );
}

/* ------------------------------ the home page ----------------------------- */

/**
 * The whole ladder, low on the home page.
 *
 * The partner row is in this list and carries no figure. It is a disclosure
 * rather than an offer — it names no company, so it withholds nothing the
 * email step on /services exists to withhold — and leaving it out would let the
 * table imply that every row on the site is ours to price. It is not.
 */
export function Ladder() {
  return (
    <section
      id="pricing"
      data-testid="section-pricing"
      className={`${PAGE} scroll-mt-[var(--s3)] pt-[var(--s6)]`}
    >
      <div className="grid grid-cols-1 items-baseline gap-[var(--s3)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
        <h2 className={`m-0 ${READ} font-display font-medium`}>What it costs, and what the price is for.</h2>
        <p className={`m-0 ${READ_MUTED}`}>
          Which row you are on follows the work rather than a plan you pick, so there is nothing here to compare and
          nothing to upgrade. There is no checkout either: a figure below is what the work is sold at, and it is agreed
          with a person on a call that costs nothing.
        </p>
      </div>

      <div className="mt-[var(--s4)]">
        {PRICES.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </div>

      <BeforeYouBuy className="mt-[var(--s4)]" />
    </section>
  );
}

/* ------------------------------ a door page ------------------------------- */

/**
 * One door's price, on that door's page.
 *
 * It takes a door and asks shared/pricing.ts which row that door is sold on, so
 * this component never has more than one row in its hands and structurally
 * cannot print a neighbour's. That is the whole of "a door shows its own tier,
 * not the whole ladder" — enforced by what the function is given rather than by
 * a filter somebody has to keep correct. server/pricing.test.ts holds the
 * resolution itself down for all seven doors.
 */
export function DoorPrice({ door }: { door: DoorDef }) {
  const row = priceForDoor(door);

  return (
    <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-door-price">
      <div className="grid gap-[var(--s3)] border-t border-border pt-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
        <div>
          <p className={META}>What this one costs</p>
          <p data-testid="text-door-price" className={`mt-[var(--s2)] ${READ} font-display font-medium tabular-nums`}>
            {row.price}
          </p>
        </div>

        <div>
          <p className={`m-0 ${READ}`}>{row.buys}</p>
          {row.condition ? <p className={`mt-[var(--s2)] m-0 ${READ_MUTED}`}>{row.condition}</p> : null}
          <BeforeYouBuy className="mt-[var(--s4)]" />
        </div>
      </div>
    </section>
  );
}

export default Ladder;
