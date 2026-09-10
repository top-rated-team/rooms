/**
 * AdGrant.AI's mark: the owner's own file, served as it is.
 *
 * It was briefly a hand-drawn SVG here. That was wrong — the mark is settled,
 * it is an agreed asset, and redrawing an agreed asset from a picture of it is
 * how a brand quietly drifts. The file is the same one adgrant.ai serves as
 * /logo.png, 944x944 with a transparent ground, so it sits on either theme
 * without a plate behind it.
 *
 * Decorative wherever the wordmark is beside it, which is everywhere it is
 * used today: the words already carry the name, and a second announcement of
 * it is noise to a screen reader. Pass a title only if it ever stands alone.
 */

export function AdGrantLogo({ className, title }: { className?: string; title?: string }) {
  return (
    <img
      src="/assets/adgrant-logo.png"
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={className}
      width={944}
      height={944}
      decoding="async"
      data-testid="adgrant-logo"
    />
  );
}

export default AdGrantLogo;
