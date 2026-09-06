import { AGENTS } from "@shared/roster";
import type { MemberKind, Presence } from "@shared/schema";
import { cn } from "@/lib/utils";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  xs: "h-5 w-5 rounded text-[9px]",
  sm: "h-6 w-6 rounded-md text-[10px]",
  md: "h-8 w-8 rounded-md text-[11px]",
  lg: "h-10 w-10 rounded-md text-xs",
};

const DOT_SIZES: Record<AvatarSize, string> = {
  xs: "h-1.5 w-1.5",
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

const PRESENCE_TONE: Record<Presence, string> = {
  online: "bg-status-online",
  away: "bg-status-away",
  offline: "bg-status-offline",
};

/**
 * Agents carry the tone declared in the roster so an avatar always means the
 * same thing across the sidebar, the transcript and the task panel.
 *
 * An agent we do not run — somebody's ClickUp, Slack or HubSpot agent admitted
 * to one thread — has no roster entry, and must not be dressed in our colour.
 * It gets the neutral tone, so "whose is this" is answerable at a glance.
 */
export function toneFor(memberKey: string, kind: MemberKind): string {
  if (kind === "agent") {
    const agent = AGENTS.find((a) => `agent:${a.id}` === memberKey);
    return agent?.tone ?? "bg-muted text-muted-foreground";
  }
  if (kind === "expert") return "bg-accent/10 text-accent";
  if (kind === "system") return "bg-muted text-muted-foreground";
  return "bg-secondary text-secondary-foreground";
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
  presence?: Presence | null;
  title?: string;
  /** Access that has ended: the row stays readable, and stops looking live. */
  dimmed?: boolean;
  className?: string;
}

export function Avatar({ initials, tone, size = "md", presence, title, dimmed, className }: AvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", dimmed && "opacity-60", className)} title={title}>
      <span
        className={cn(
          "inline-flex items-center justify-center font-semibold uppercase leading-none",
          SIZES[size],
          tone ?? "bg-secondary text-secondary-foreground",
        )}
        aria-hidden="true"
      >
        {initials.slice(0, 2)}
      </span>
      {presence ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-background",
            DOT_SIZES[size],
            PRESENCE_TONE[presence],
          )}
          aria-hidden="true"
        />
      ) : null}
      {title ? <span className="sr-only">{title}</span> : null}
    </span>
  );
}

export interface PresenceDotProps {
  presence: Presence;
  className?: string;
}

export function PresenceDot({ presence, className }: PresenceDotProps) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", PRESENCE_TONE[presence], className)} aria-hidden="true" />;
}
