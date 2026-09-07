/**
 * The quiet studio, as the door pages use it.
 *
 * The vocabulary itself is not defined here. `client/src/index.css` carries it —
 * the warm-paper tokens, the six-step spacing scale, the three type classes
 * (`type-display`, `type-body`, `type-meta`, `type-note`) and the drawn
 * underline (`draw`, `draw-on`) — and this file is the doors' agreed way of
 * spelling those, so /use-case, a door page and the index row cannot each invent a
 * fourth size or a fifth margin.
 *
 * Three rules are baked in, and they are the measured problems from the
 * research rather than taste:
 *
 * - **Three text sizes.** The site used ten. Everything below resolves to
 *   display, body or meta, and there is no fourth. An element with no size
 *   class at all renders at the browser's 16px and is a fourth size by
 *   accident, so every text node on these pages carries one.
 * - **No card, border box, drop shadow, badge, icon or pill.** Structure is
 *   hairline rules and space. The door page had a tinted initials square, two
 *   chips, a bordered contract box and a panel floating in another box; a page
 *   that says "important" with a tint has not said anything.
 * - **No colour that is not a token.** `primary` is the one accent the token
 *   layer keeps, and it is now the clay rather than the blue that direction
 *   deleted — so these classes were retuned by that change without one of them
 *   being edited, which is the whole point of spelling colours as tokens.
 */

/** One measure for every page, the same one the header and the footer use. */
export const PAGE = "mx-auto w-full max-w-[var(--page)] px-[var(--s3)]";

/** Size one. Used once per page, on the thing the page is. */
export const DISPLAY = "type-display";

/** Size two: everything a person reads, set in the reading face. */
export const READ = "type-body";
export const READ_MUTED = "type-body text-muted-foreground";

/**
 * Size two again, at the weight of a heading and in the display face. A section
 * heading differs from a sentence by weight and family, never by size — five
 * sections opening with a big bold line was the repetition the research found.
 *
 * `font-sans` is explicit rather than inherited: index.css sets the reading face
 * on `p, li, dd, blockquote, figcaption` for site pages, and a heading inside a
 * list item — every numbered index on these pages — would otherwise inherit the
 * serif from the `li` around it and quietly become a fourth face.
 */
export const HEADING = "font-sans text-lg font-medium leading-snug tracking-tight";

/** Size three: the label that says what a thing is. */
export const META = "type-meta text-muted-foreground";

/** Size three without the shouting, for a sentence rather than a label. */
export const META_PLAIN = "type-note text-muted-foreground";

/** A number in the margin of an index. Tabular, so a column of them lines up. */
export const NUMERAL = "type-meta tabular-nums text-muted-foreground";

/** A link inside a sentence: the rule under the words, already drawn. */
export const LINK = "draw draw-on";

/**
 * The one thing on these pages that looks pressable, and it is a line of text
 * with a rule under it rather than a filled rectangle. At most twice on a page:
 * once for what the page is for, once for the way through to a room.
 */
export const ACTION =
  "type-meta inline-flex items-center gap-2 border-b border-primary pb-[var(--s1)] font-medium text-primary hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** The same at the weight of an aside, so a second action never shouts beside the first. */
export const ACTION_QUIET =
  "type-meta inline-flex items-center gap-2 border-b border-border pb-[var(--s1)] text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** An identifier out of the documentation, printed so it can be checked. */
export const CODE = "font-mono text-xs text-muted-foreground";

/**
 * The panel, out of its box.
 *
 * `AskWidget` still draws itself as a card — border, fill, shadow, bordered
 * starter chips, bordered citations — because it is shared with pages that are
 * not in this direction and no parcel this round owns it. `index.css` carries
 * one block that unwraps it, addressed by that component's stable test ids, and
 * this is that class. It is named for the home page because the home page
 * needed it first; the door pages want exactly the same thing, so they use it
 * rather than writing a second copy of the same overrides. A rename is in the
 * handoffs. If the class or those ids ever change, the panel keeps its own card
 * and the page is plainer than intended rather than broken.
 */
export const PANEL_CHROME = "home-panel";
