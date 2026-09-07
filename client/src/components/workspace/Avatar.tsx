import { useEffect, useState } from "react";
import type { MemberKind, Presence } from "@shared/schema";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * An avatar here is a real photograph, or two letters of ink. Nothing in
 * between: no silhouette, no generated face, no rounded chip. A missing file
 * is a finished monogram, not a gap.
 *
 * It used to be a coloured square — blue for our agents, green for people, grey
 * for anybody else's software — and it was the room's loudest colour on first
 * paint. The colour said "whose is this", which is a real question, but the
 * member rail answers it in a sentence directly underneath, and a sentence is
 * the only place it can be answered honestly. So the square is gone and the
 * sentence stayed. Agents are not drawn here at all: they have a mark of their
 * own, in AgentMark.tsx, so a person and a piece of software are not the same
 * shape.
 *
 * PRESENCE IS NOT DRAWN ANY MORE, AND THAT IS A CORRECTION.
 *
 * Every member is written into a room with `presence: "online"` and nothing in
 * this repository ever changes it — not a disconnect, not a week of silence.
 * server/storage.ts sets it at seed time, server/routes.ts sets it on invite,
 * and there is no code path that sets "away" or "offline" for a person. So the
 * green dot beside four names on first paint said four people are here right
 * now, and none of them were. The room now says the true thing in words, in the
 * member rail: nobody is watching until somebody is asked.
 *
 * The `presence` prop and `PresenceDot` are kept, unrendered, because the fix is
 * on the server: when a disconnect actually writes "offline", this turns back on
 * in one place. Until then the room does not draw a fact it does not have.
 * ------------------------------------------------------------------------- */

export type AvatarSize = "xs" | "sm" | "md" | "lg";

/** Shared box so a photograph, two letters, and an agent mark occupy the same square. */
export const AVATAR_BOX: Record<AvatarSize, string> = {
  xs: "inline-flex h-5 w-5 items-center justify-center text-[11px] leading-none",
  sm: "inline-flex h-6 w-6 items-center justify-center text-[11px] leading-none",
  md: "inline-flex h-7 w-7 items-center justify-center text-[11px] leading-none",
  lg: "inline-flex h-8 w-8 items-center justify-center text-[13px] leading-none",
};

const SIZES = AVATAR_BOX;

/**
 * Kept so callers keep compiling, and so the one thing tone was ever really for
 * — telling our software from somebody else's — has a home if it comes back. It
 * returns the same ink for everybody now: the rail says whose an agent is in a
 * sentence, which is the only place that can be said without a legend.
 */
export function toneFor(_memberKey: string, _kind: MemberKind): string {
  return "text-muted-foreground";
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : parts[0].charAt(1);
  return (first + second).toUpperCase() || "?";
}

export interface AvatarProps {
  initials: string;
  tone?: string;
  size?: AvatarSize;
  /**
   * A real photograph. Absent, or a file that fails to load, means two letters.
   * Never a silhouette.
   */
  photo?: string;
  /** Accepted and not drawn — see the note above. */
  presence?: Presence | null;
  title?: string;
  /** Access that has ended: the row stays readable and stops looking live. */
  dimmed?: boolean;
  className?: string;
}

export function Avatar({ initials, tone, size = "md", photo, title, dimmed, className }: AvatarProps) {
  const src = photo?.trim() || undefined;
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const showPhoto = Boolean(src) && !broken;

  return (
    <span
      className={cn(
        "shrink-0 select-none text-center font-medium tracking-[0.06em] tabular-nums",
        showPhoto && "overflow-hidden",
        SIZES[size],
        tone ?? "text-muted-foreground",
        dimmed && "opacity-60",
        className,
      )}
      title={title}
    >
      {showPhoto ? (
        <img
          src={src}
          alt=""
          className="block h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true" className="uppercase">
          {initials.slice(0, 2)}
        </span>
      )}
      {title ? <span className="sr-only">{title}</span> : null}
    </span>
  );
}

export interface PresenceDotProps {
  presence: Presence;
  className?: string;
}

/**
 * Unrendered for now, for the reason in the note above. It draws in ink rather
 * than in colour when it comes back: filled is here, hollow is away, and
 * somebody who is not here has no mark at all.
 */
export function PresenceDot({ presence, className }: PresenceDotProps) {
  if (presence === "offline") return null;
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        presence === "online" ? "bg-foreground" : "border border-foreground",
        className,
      )}
      aria-hidden="true"
    />
  );
}
