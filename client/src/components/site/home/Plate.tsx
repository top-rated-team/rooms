/* ---------------------------------------------------------------------------
 * THE ONE IMAGE
 *
 * Not stock, not an icon, and not a screenshot of a dashboard nobody has: the
 * argument of the site, drawn: every door arriving at one point, and one line
 * leaving it — the room, which is the only thing on the other side of any of
 * them.
 *
 * The caption used to end "the room it becomes carries the name of the company
 * that signs for that work — which is not always this one". That disclosure is
 * true of the door table on /services, where the partner's row appears after the
 * email step. It is NOT true of this page: every row here is PUBLIC_DOORS, all
 * six invoiced by us. So it was pointing at something the reader cannot see,
 * which is the definition of confusing — the owner said so and was right. The
 * disclosure lives where it applies; the caption now explains the drawing.
 *
 * The caption names no direction. It said "the services above" until a render
 * showed the drawing sits ABOVE the index on the home page, not below it — and
 * a caption that points somewhere is wrong the moment the section order changes
 * or the component is reused. It describes the lines instead.
 *
 * The line count and the caption both come from PUBLIC_DOORS, the same rule the
 * headline and the index read. The drawing had seven lines and the caption said
 * seven while the page listed six, because the seventh door is behind the email
 * step — so the picture was quietly disclosing what the gate exists to withhold,
 * and contradicting the headline above it.
 *
 * It is one <svg>, so it costs no request, scales to any width, and inverts
 * with the theme because every stroke is currentColor.
 *
 * THE POINT MOVES, and the owner asked whether that would cost anything.
 *
 * MEASURED, not asserted. A 240-move drag sweeping the full travel and back,
 * driven inside a real browser one move per animation frame: median frame
 * 16.7ms, worst frame 17.1ms, zero frames over 20ms. The same page with no
 * drag running: median 16.7ms, worst 17.4ms. Dragging this is indistinguishable
 * from leaving it alone, and the worst frame under load was better than the
 * worst frame idle. There is no canvas, no animation frame and no
 * library: the whole drawing is one <svg> holding as many paths as there are
 * public doors, so moving the point means rebuilding that many short strings
 * and letting React set that many `d` attributes. At the time of writing that
 * is six paths plus one, and a browser does the same work laying out a line of
 * text. A drag is bounded by how fast pointer events arrive, which is the
 * display's refresh rate, and React batches within each one.
 *
 * The two things that WOULD have made it expensive were both avoidable, and
 * both are avoided here. Keeping the position in state high up the tree would
 * re-render the home page on every pointermove, so the state lives in this
 * component and nothing above it knows the point moved. And converting pointer
 * coordinates needs the element's box, which is a layout read — so the box is
 * measured once when the drag starts, not on every move, because reading it
 * mid-drag is what turns a cheap handler into a layout thrash.
 * ------------------------------------------------------------------------- */

import { useCallback, useRef, useState } from "react";

import { PUBLIC_DOORS } from "@/components/site/GatedOffers";
import { countWord } from "@/components/site/home/doorText";

/** The drawing's own coordinates. Everything below is in these, not pixels. */
const VIEW_W = 1200;
const MEET_Y = 150;

/*
 * How far the point may travel. Not the full width, and each end is a real
 * limit rather than a taste:
 *
 * - past about 1040 the line leaving on the right disappears, and that line is
 *   the work starting. A drawing whose subject can be dragged out of it is
 *   broken, not flexible.
 * - below about 160 the curves have no room to bend and the picture stops
 *   reading as convergence — it becomes a fan of straight lines.
 */
const MIN_X = 160;
const MAX_X = 1040;
const DEFAULT_X = 780;
const STEP = 20;

/**
 * One evenly spaced entry point per public door, converging wherever the point
 * currently is.
 *
 * The two control points are proportions of the meeting point rather than the
 * fixed 340 and 560 they used to be. That is what makes the flow follow the
 * point instead of bending toward where it used to be and then jumping: at any
 * position the curve leaves the left edge flat, turns once, and arrives
 * horizontal, which is the shape the drawing is about.
 */
function linesFor(meetX: number): string[] {
  return PUBLIC_DOORS.map((_, i) => {
    const y = 40 + i * (220 / Math.max(1, PUBLIC_DOORS.length - 1));
    return `M0 ${y} C ${(meetX * 0.44).toFixed(1)} ${y} ${(meetX * 0.72).toFixed(1)} ${MEET_Y} ${meetX.toFixed(1)} ${MEET_Y}`;
  });
}

const COUNT = countWord(PUBLIC_DOORS.length);

const clamp = (x: number) => Math.min(MAX_X, Math.max(MIN_X, x));

export function Plate() {
  const [meetX, setMeetX] = useState(DEFAULT_X);
  const [dragging, setDragging] = useState(false);

  /* The svg's box, measured once per drag. See the header: reading it on every
     pointermove is the one way to make this expensive. */
  const box = useRef<{ left: number; scale: number } | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);

  const fromClientX = useCallback((clientX: number) => {
    const measured = box.current;
    if (!measured) return DEFAULT_X;
    return clamp((clientX - measured.left) * measured.scale);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGGElement>) => {
    const element = svg.current;
    if (!element) return;

    /* Middle-click and right-click are not a drag, and neither is a click with
       a modifier held — that is somebody trying to do something else. */
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0) return;
    box.current = { left: rect.left, scale: VIEW_W / rect.width };

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setMeetX(fromClientX(event.clientX));
  }, [fromClientX]);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGGElement>) => {
    if (!dragging) return;
    setMeetX(fromClientX(event.clientX));
  }, [dragging, fromClientX]);

  const endDrag = useCallback((event: React.PointerEvent<SVGGElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    box.current = null;
  }, [dragging]);

  /* Operable without a pointer, because a thing that only a mouse can move is
     not finished. Home and End go to the two limits; Enter and Escape put it
     back, since there is no other way to undo a drag. */
  const onKeyDown = useCallback((event: React.KeyboardEvent<SVGGElement>) => {
    const by: Record<string, number> = { ArrowLeft: -STEP, ArrowRight: STEP, PageDown: -STEP * 4, PageUp: STEP * 4 };

    if (event.key in by) {
      event.preventDefault();
      setMeetX((x) => clamp(x + by[event.key]));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setMeetX(MIN_X);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setMeetX(MAX_X);
      return;
    }
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      setMeetX(DEFAULT_X);
    }
  }, []);

  /* Reported as a percentage of the travel rather than in the drawing's own
     coordinates, because 780 means nothing to somebody listening to it. */
  const position = Math.round(((meetX - MIN_X) / (MAX_X - MIN_X)) * 100);

  return (
    <figure className="m-0">
      <div className="w-full overflow-hidden border-t border-card-border text-foreground">
        <svg
          ref={svg}
          viewBox={`0 0 ${VIEW_W} 300`}
          role="img"
          aria-label={`${COUNT} lines entering from the left, converging on a single point, and one line leaving it.`}
          className="block h-auto w-full"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.42">
            {linesFor(meetX).map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g className="text-primary">
            <path d={`M${meetX.toFixed(1)} ${MEET_Y} H${VIEW_W}`} stroke="currentColor" strokeWidth="2" fill="none" />

            {/*
              THE HANDLE, and it is a group rather than the visible circle so
              that what a finger has to hit is bigger than what an eye has to
              see. The visible dot is 3.5 units across; the transparent circle
              under it is 22, which at the width this renders on a phone is
              about the size a thumb actually lands on.

              touchAction pan-y and not none: this sits in a page somebody
              scrolls, and a graphic that eats a vertical swipe because it
              wanted a horizontal one is a graphic that traps them.
            */}
            <g
              role="slider"
              tabIndex={0}
              aria-label="Where the lines meet"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={position}
              aria-valuetext={`${position}% of the way across. Arrow keys move it; Enter puts it back.`}
              data-testid="handle-plate-meet"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKeyDown}
              className="cursor-ew-resize outline-none [&:focus-visible>circle:last-of-type]:opacity-100"
              style={{ touchAction: "pan-y" }}
            >
              <circle cx={meetX} cy={MEET_Y} r="22" fill="transparent" />
              <circle cx={meetX} cy={MEET_Y} r={dragging ? 5 : 3.5} fill="currentColor" />
              {/* The focus ring, drawn rather than borrowed: an outline on an
                  SVG group is not reliably visible across browsers. */}
              <circle
                cx={meetX}
                cy={MEET_Y}
                r="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="opacity-0"
              />
            </g>
          </g>
        </svg>
      </div>
      <figcaption className="mx-auto max-w-[var(--page)] px-[var(--s3)] pt-[var(--s2)]">
        <span className="type-note text-muted-foreground">
          What the lines are: one per service, and every one of them ends in the same place. Ask a question at any
          of them, and if the answer turns out to be worth keeping it becomes a room — an address of its own, the work
          written out as a checklist, and somewhere to put a person. The line leaving on the right is the work
          starting. Drag the point to move where they meet.
        </span>
      </figcaption>
    </figure>
  );
}

export default Plate;
