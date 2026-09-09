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
      {/* The A's left leg and the I's stem, one colour, one pen. */}
      <g stroke={YELLOW} strokeWidth="22" strokeLinecap="round" fill="none">
        <path d="M30 74 L52 26" />
        <path d="M78 74 L78 34" />
      </g>
      {/* The A's right leg, over the left where they cross. */}
      <path d="M44 26 L66 74" stroke={BLUE} strokeWidth="22" strokeLinecap="round" fill="none" />
      {/* The two terminals that make it a logotype rather than three sticks. */}
      <circle cx="30" cy="74" r="11" fill={GREEN} />
      <circle cx="78" cy="34" r="11" fill={GREEN} />
    </svg>
  );
}

export default AdGrantLogo;
