/* ---------------------------------------------------------------------------
 * THE ROOM'S VISUAL SYSTEM
 *
 * One file, because a system that lives in thirteen files is not a system. The
 * room is the quiet-studio front page turned into a working surface, and the
 * translation is these five decisions:
 *
 * 1. THREE TYPE SIZES. A reading size, a chrome size, a metadata size. That is
 *    the whole scale. The room used ten. If something needs a fourth size, the
 *    answer is that it needs less to say, not another size.
 *
 * 2. TWO FACES. Words a person wrote — a question, an answer, a brief — are set
 *    in the reading serif. Everything the software says about itself — channel
 *    names, badges, counts, buttons — is set in the interface sans. You can tell
 *    the argument from the furniture without reading either.
 *
 * 3. A RULE, NEVER A BOX. Nothing in this room is enclosed on four sides. No
 *    card, no drop shadow, no rounded pill, no chip. Regions are separated by a
 *    hairline or by a change of ground, which is what the front page does.
 *
 * 4. NO COLOUR. Ink on paper, soft ink for anything secondary. The only
 *    saturated colour left in the room is `destructive`, and it appears on
 *    exactly two things: a room that cannot say which company is answerable for
 *    it, and a company with no terms. Red means a fault, and nothing else, so
 *    red is still read.
 *
 * 5. NO ICONS. Every icon in this room was replaced by the word it stood for.
 *    The one shape left is the caret that blinks while an agent is still
 *    writing, and a caret is not an icon.
 *
 * ON TOKENS. Only `background`, `foreground`, `muted`, `muted-foreground`,
 * `border` and `destructive` are referenced anywhere in this parcel. That is
 * deliberate: the token layer still carries the old blue-and-white palette, and
 * this parcel does not own it. Referencing nothing but the neutral six means the
 * room is ink-on-ground today, and becomes warm paper the day the token layer is
 * retuned — with no change in here. There is no hard-coded colour in this
 * parcel, and no class that names a hue.
 * ------------------------------------------------------------------------- */

/**
 * Words somebody wrote. The reading serif, generous, the only size worth
 * reading at.
 *
 * The family comes from `--font-read` in the token layer rather than from
 * Tailwind's default serif stack, so the room reads in the same face as the
 * front page. Tailwind's `fontFamily` map has `sans` and `mono` and no `serif`
 * entry pointing at that token, and this parcel does not own that file — see
 * the handoff. Georgia is the fallback the concept itself names, so the room
 * still reads correctly if the token ever goes away.
 */
export const READ = "[font-family:var(--font-read,Georgia,serif)] text-[17px] leading-[1.65]";

/** The interface talking about itself: names, controls, labels. */
export const CHROME = "text-[13px] leading-5";

/** Metadata: times, counts, the small print that has to stay true. */
export const META = "text-[11px] leading-4";

/** The same size as META, set as a section label. The only uppercase in the room. */
export const LABEL = "text-[11px] uppercase tracking-[0.09em] leading-4 text-muted-foreground";

/**
 * The front page's focus outline, in ink rather than in the accent it does not
 * have here. Every control in the room carries it; nothing relies on a colour
 * to say where the keyboard is.
 */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The drawn underline from the front page: a hairline that grows from the left
 * on hover. It is the room's only decorative motion, it is made of the text's
 * own colour, and it disappears entirely under prefers-reduced-motion because
 * the transition is the only thing animated.
 */
export const DRAW =
  "relative no-underline after:absolute after:inset-x-0 after:-bottom-px after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 hover:after:scale-x-100 focus-visible:after:scale-x-100";

/**
 * The room's one action shape, taken from the front page's single quiet button:
 * a word, at the metadata size, with a hairline under it. There is no filled
 * button anywhere in this room. Weight and position say which action matters,
 * the way they do in a printed page.
 */
export const ACTION = `${META} inline-flex items-center gap-1.5 whitespace-nowrap border-b border-foreground pb-0.5 font-medium uppercase tracking-[0.09em] text-foreground disabled:cursor-default disabled:border-transparent disabled:text-muted-foreground ${FOCUS}`;

/** The same action, said more quietly: soft ink, and the rule only on hover. */
export const ACTION_QUIET = `${META} inline-flex items-center gap-1.5 whitespace-nowrap border-b border-transparent pb-0.5 uppercase tracking-[0.09em] text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-default disabled:text-muted-foreground ${FOCUS}`;

/** A text link inside prose: the drawn underline, in ink. */
export const LINK = `${DRAW} text-foreground ${FOCUS}`;
