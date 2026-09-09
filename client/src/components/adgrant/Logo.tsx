/**
 * AdGrant.AI's mark, drawn rather than fetched: an "A" of two crossed bars with
 * a stroke "I" beside it, in Google's own three brand colours.
 *
 * Inline SVG and not a PNG because this sits in a sticky header at one size on
 * a phone and another on a desktop, it has to hold up on both grounds, and a
 * raster of it would be a second request for eleven shapes. currentColor is
 * deliberately NOT used: the whole point of the mark is those three hues, and
 * a mark that changes colour with the theme is a different mark.
 *
 * A WORD ON WHAT THIS RESEMBLES. It is close to Google Ads' own logo, which is
 * the reference the owner supplied. The footer already carries the disclaimer
 * that Google's marks are Google's and that this product is neither affiliated
 * with nor endorsed by them, and that sentence is load-bearing while it stands
 * this close. If the resemblance is ever narrowed, narrow it here — every
 * surface reads this one file.
 */

const YELLOW = "#FBBC04";
const BLUE = "#4285F4";
const GREEN = "#34A853";

export function AdGrantLogo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-testid="adgrant-logo"
    >
      {/* Geometry read off the reference at 940px and scaled to this 96 grid:
          bar 19 wide, the A's feet at x=16 and x=58 with the apex at 37, the I
          at x=79. The first pass put the feet at 30 and 66 with a 22 bar, and
          at header size the two legs merged into one blob with no counter —
          the letter has to survive at 18 pixels, which is the only size it is
          ever actually used at. */}
      <g strokeWidth="19" strokeLinecap="round" fill="none">
        {/* The A's left leg, and the I's stem. */}
        <g stroke={YELLOW}>
          <path d="M37 27 L16 67" />
          <path d="M79 67 L79 31" />
        </g>
        {/* The A's right leg, over the left where they cross. */}
        <path d="M31 27 L58 67" stroke={BLUE} />
      </g>
      {/* Terminals exactly half the bar wide, so they read as caps on the
          strokes rather than as circles beside them. */}
      <circle cx="16" cy="67" r="9.5" fill={GREEN} />
      <circle cx="79" cy="31" r="9.5" fill={GREEN} />
    </svg>
  );
}

export default AdGrantLogo;
