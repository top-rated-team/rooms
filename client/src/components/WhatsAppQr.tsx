/**
 * The WhatsApp QR, drawn so that it scans.
 *
 * server/waha.ts emits the dark modules ONLY — `fill="currentColor"`, one rect
 * per module, and no ground of its own. Rendered with `text-foreground` on the
 * page it therefore takes the page's own ink on the page's own paper: tinted
 * cream in the light theme, and in the dark theme pale modules on near-black,
 * which is a photographic negative of a QR code. No scanner accepts that. It
 * needs dark modules on a light square with a quiet zone around them, which is
 * what this puts under it.
 *
 * AND IT IS NOT DRAWN ON A PHONE. A QR is an instruction to a second device;
 * on the device that is already in your hand it is a picture of a link you are
 * being shown next to the link itself. Every caller puts "Open WhatsApp with
 * the message written" above this, so hiding it there costs nothing.
 *
 * There were four copies of this and the fix reached one of them. Now there is
 * one, so the fifth caller cannot get it wrong.
 */

/** A pointer that cannot hover and is not precise: a finger. */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

interface WhatsAppQrProps {
  /** Our own SVG: modules only, no visitor text in the markup. */
  svg: string | null;
  /** The same address the link above it opens, so the picture and the link agree. */
  href: string;
  label: string;
  className?: string;
  testId?: string;
}

export function WhatsAppQr({ svg, href, label, className, testId }: WhatsAppQrProps) {
  if (!svg || isCoarsePointer()) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block bg-white p-[var(--s2)] text-black ${className ?? ""}`}
      aria-label={label}
      data-testid={testId}
    >
      <div className="w-36" role="img" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
    </a>
  );
}
