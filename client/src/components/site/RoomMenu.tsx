import { useEffect, useId, useRef, useState } from "react";
import { ROOMS_STORAGE_KEY } from "@/lib/rooms";
import { Link } from "wouter";

import { useOpenRoom } from "@/hooks/use-open-room";

/**
 * The remembered-room list, read the same way the room page reads it.
 *
 * STORAGE_KEY and the shape must stay in step with listStoredWorkspaces() in
 * client/src/hooks/use-workspace.ts. That file is the workspace chunk (~198KB);
 * this component is on the landing page paid traffic downloads, so it reads
 * localStorage itself behind the same try/catch rather than importing the
 * reader and pulling the room in with it.
 */
const STORAGE_KEY = ROOMS_STORAGE_KEY;

export interface RememberedRoom {
  token: string;
  name: string;
  lastSeen: string;
}

function isRememberedRoom(value: unknown): value is RememberedRoom {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.lastSeen === "string"
  );
}

/** Newest first. Returns [] rather than throwing when storage is unavailable. */
export function listRememberedRooms(): RememberedRoom[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRememberedRoom).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  } catch {
    return [];
  }
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roomLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "A room";
}

const INNER =
  "bg-transparent p-0 font-[inherit] text-inherit no-underline [text-transform:inherit] " +
  "hover:text-inherit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-[2px]";

export interface RoomMenuProps {
  /** The classes the old Open-a-room control carried — loud, quiet, or a nav link. */
  className: string;
  /** When set, the new room is this door's room, not the general one. */
  doorId?: string;
  agentId?: string | null;
  /** Distinct per place: the same control rendered twice must not share one id. */
  testId: string;
  /**
   * In the phone burger the list has to sit in the sheet, not float over it.
   * Everywhere else it drops below the control.
   */
  layout?: "dropdown" | "inline";
}

/**
 * Two actions fused into one: get back into a room this browser remembers, or
 * start a new one. Hover opens the list on a pointer device. On a phone there
 * is no hover, so the return half opens the list on tap and the create half
 * creates. With nothing remembered, there is no menu — only the create action.
 *
 * After create, the room itself offers the claim. This control does not.
 */
export function RoomMenu({ className, doorId, agentId, testId, layout = "dropdown" }: RoomMenuProps) {
  const { open: create, opening, error } = useOpenRoom({ doorId, agentId });
  const [rooms, setRooms] = useState<RememberedRoom[]>(listRememberedRooms);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const refresh = () => setRooms(listRememberedRooms());

  useEffect(() => {
    const sync = () => setRooms(listRememberedRooms());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showList = open && rooms.length > 0;
  const newest = rooms[0];

  const list = showList ? (
    <ul
      id={listId}
      role="menu"
      data-testid={`${testId}-list`}
      className={
        layout === "inline"
          ? "mt-[var(--s2)] flex min-w-[16rem] flex-col border-t border-border pt-[var(--s2)]"
          /* pt- and not mt-: a margin here is 8px of nothing between the
             trigger and the list, and the root's mouseleave fires while the
             pointer crosses it, so the menu shut before it could be reached.
             Padding keeps the same visual gap inside the hit area. The border
             and ground move to an inner wrapper so the padding stays invisible. */
          : "absolute left-0 top-full z-50 min-w-[18rem] pt-[var(--s1)]"
      }
    >
      {/* The visible box, so the hover bridge above it carries no border. */}
      <li aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-[var(--s1)] -z-10 border border-border bg-background" />
      {rooms.map((room) => {
        const when = formatLastSeen(room.lastSeen);
        return (
          <li key={room.token} className="border-t border-border first:border-t-0">
            <Link
              href={`/w/${room.token}`}
              role="menuitem"
              data-testid={`${testId}-entry`}
              className="flex w-full items-baseline justify-between gap-[var(--s3)] px-[var(--s2)] py-[var(--s2)] text-left text-foreground no-underline [text-transform:none] hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => setOpen(false)}
            >
              <span className="type-note min-w-0 truncate font-medium">{roomLabel(room.name)}</span>
              {when ? (
                <span className="type-note shrink-0 text-muted-foreground">{when}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={layout === "inline" ? "relative flex flex-col items-stretch" : "relative inline-flex flex-col items-start"}
      onMouseEnter={() => {
        const next = listRememberedRooms();
        setRooms(next);
        if (next.length > 0 && !isCoarsePointer()) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!isCoarsePointer()) setOpen(false);
      }}
    >
      {rooms.length === 0 ? (
        <button
          type="button"
          data-testid={testId}
          onClick={() => void create()}
          disabled={opening}
          className={`${className} disabled:opacity-50`}
        >
          {opening ? "Opening a room…" : "Open a room"}
        </button>
      ) : newest ? (
        <span className={`relative inline-flex items-baseline gap-[var(--s2)] ${className}`}>
          <Link
            href={`/w/${newest.token}`}
            data-testid={`${testId}-return`}
            aria-haspopup="menu"
            aria-expanded={showList}
            aria-controls={listId}
            className={INNER}
            onClick={(event) => {
              refresh();
              if (isCoarsePointer()) {
                event.preventDefault();
                setOpen((was) => !was);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                refresh();
                setOpen(true);
              }
            }}
          >
            Your rooms
          </Link>
          <span aria-hidden="true" className="text-muted-foreground">
            |
          </span>
          <button
            type="button"
            data-testid={testId}
            onClick={() => void create()}
            disabled={opening}
            className={`${INNER} disabled:opacity-50`}
          >
            {opening ? "Opening a room…" : "Open a room"}
          </button>
          {layout === "dropdown" ? list : null}
        </span>
      ) : null}
      {layout === "inline" ? list : null}
      {error ? (
        <p role="alert" className="type-note mt-[var(--s1)] max-w-[28ch] text-destructive [text-transform:none]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default RoomMenu;
