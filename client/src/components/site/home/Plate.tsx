/* ---------------------------------------------------------------------------
 * THE ONE IMAGE
 *
 * Not stock, not an icon, and not a screenshot of a dashboard nobody has: the
 * argument of the site, drawn: every door arriving at one point, and one line
 * leaving it — the room, which is the only thing on the other side of any of
 * them.
 *
 * The line count and the caption both come from PUBLIC_DOORS, the same rule the
 * headline and the index read. The drawing had seven lines and the caption said
 * seven while the page listed six, because the seventh door is behind the email
 * step — so the picture was quietly disclosing what the gate exists to withhold,
 * and contradicting the headline above it.
 *
 * It is one <svg>, so it costs no request, scales to any width, and inverts
 * with the theme because every stroke is currentColor.
 * ------------------------------------------------------------------------- */

import { PUBLIC_DOORS } from "@/components/site/GatedOffers";
import { countWord } from "@/components/site/home/doorText";

/** One evenly spaced entry point per public door, converging on the room. */
const DOOR_LINES = PUBLIC_DOORS.map((_, i) => {
  const y = 40 + i * (220 / Math.max(1, PUBLIC_DOORS.length - 1));
  return `M0 ${y} C 340 ${y} 560 150 780 150`;
});

const COUNT = countWord(PUBLIC_DOORS.length);

export function Plate() {
  return (
    <figure className="m-0">
      <div className="w-full overflow-hidden border-t border-card-border text-foreground">
        <svg
          viewBox="0 0 1200 300"
          role="img"
          aria-label={`${COUNT} lines entering from the left, converging on a single point, and one line leaving it.`}
          className="block h-auto w-full"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.42">
            {DOOR_LINES.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g className="text-primary">
            <circle cx="780" cy="150" r="3.5" fill="currentColor" />
            <path d="M780 150 H1200" stroke="currentColor" strokeWidth="2" fill="none" />
          </g>
        </svg>
      </div>
      <figcaption className="mx-auto max-w-[var(--page)] px-[var(--s3)] pt-[var(--s2)]">
        <span className="type-note text-muted-foreground">
          {COUNT.replace(/^./, (c) => c.toUpperCase())} ways in and one room behind them. A conversation started at any
          of these doors can be kept, and the room it becomes carries the name of the company that signs for that work —
          which is not always this one.
        </span>
      </figcaption>
    </figure>
  );
}

export default Plate;
