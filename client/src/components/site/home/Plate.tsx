/* ---------------------------------------------------------------------------
 * THE ONE IMAGE
 *
 * Not stock, not an icon, and not a screenshot of a dashboard nobody has: the
 * argument of the site, drawn. Seven doors arriving at one point, and one line
 * leaving it — the room, which is the only thing on the other side of any of
 * them.
 *
 * It is one <svg>, so it costs no request, scales to any width, and inverts
 * with the theme because every stroke is currentColor.
 * ------------------------------------------------------------------------- */

/** Seven evenly spaced entry points down the left edge, converging on the room. */
const DOOR_LINES = [20, 60, 100, 140, 180, 220, 260].map(
  (y) => `M0 ${y} C 340 ${y} 560 150 780 150`,
);

export function Plate() {
  return (
    <figure className="m-0">
      <div className="w-full overflow-hidden border-t border-card-border text-foreground">
        <svg
          viewBox="0 0 1200 300"
          role="img"
          aria-label="Seven lines entering from the left, converging on a single point, and one line leaving it."
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
          Seven ways in and one room behind them. A conversation started at any of these doors can be kept, and the room
          it becomes carries the name of the company that signs for that work — which is not always this one.
        </span>
      </figcaption>
    </figure>
  );
}

export default Plate;
