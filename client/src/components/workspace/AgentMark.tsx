import type { ReactNode } from "react";
import { Avatar, AVATAR_BOX, type AvatarSize } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * A mark, not a logo. One geometric glyph per agent, in the same hairline the
 * door illustration uses (Plate.tsx: strokeWidth 1, currentColor, no fill).
 *
 * Colour is how the old badges told agents apart, and it needed a legend
 * nobody had. These are one ink, and the difference is the shape: a triangle
 * and a diamond still read as two things when printed at 20 pixels. A coloured
 * chip would be a brand, and a brand implies a vendor you could buy separately.
 * These are our own software.
 *
 * An agent with no mark yet keeps the two letters already on its roster row.
 * ------------------------------------------------------------------------- */

const SIZE_PX: Record<AvatarSize, string> = {
  xs: "h-5 w-5",
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-8 w-8",
};

/**
 * Named shapes, not brands. The string on AgentDef.mark is a key into this
 * map. Unknown names fall through to initials, same as a missing mark.
 */
const AGENT_GLYPHS: Record<string, () => ReactNode> = {
  pixel: () => <rect x="4.5" y="4.5" width="11" height="11" />,
  rings: () => (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
    </>
  ),
  wedge: () => <polygon points="10,3.5 16.5,16.5 3.5,16.5" />,
  diamond: () => <polygon points="10,3.5 16.5,10 10,16.5 3.5,10" />,
  hex: () => <polygon points="10,3.5 16.2,6.75 16.2,13.25 10,16.5 3.8,13.25 3.8,6.75" />,
  plus: () => (
    <>
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </>
  ),
  peak: () => <polyline points="3.5,15 10,4.5 16.5,15" />,
  lines: () => (
    <>
      <line x1="4" y1="6" x2="16" y2="6" />
      <line x1="4" y1="10" x2="16" y2="10" />
      <line x1="4" y1="14" x2="16" y2="14" />
    </>
  ),
  bracket: () => <polyline points="7,4 14,10 7,16" />,
  cycle: () => <polyline points="15,5 5,5 5,15 15,15" />,
  nest: () => (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" />
      <rect x="7" y="7" width="6" height="6" />
    </>
  ),
};

export interface AgentMarkProps {
  /** Key into AGENT_GLYPHS. Unknown or absent draws `initials` instead. */
  mark?: string;
  initials: string;
  size?: AvatarSize;
  title?: string;
  dimmed?: boolean;
  className?: string;
}

export function AgentMark({ mark, initials, size = "md", title, dimmed, className }: AgentMarkProps) {
  const draw = mark ? AGENT_GLYPHS[mark] : undefined;
  if (!draw) {
    return <Avatar initials={initials} size={size} title={title} dimmed={dimmed} className={className} />;
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-muted-foreground",
        AVATAR_BOX[size],
        dimmed && "opacity-60",
        className,
      )}
      title={title}
    >
      <svg
        viewBox="0 0 20 20"
        className={cn("block", SIZE_PX[size])}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        {draw()}
      </svg>
      {title ? <span className="sr-only">{title}</span> : null}
    </span>
  );
}

export default AgentMark;
