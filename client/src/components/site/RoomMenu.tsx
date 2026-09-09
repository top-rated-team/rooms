import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ROOMS_STORAGE_KEY } from "@/lib/rooms";
import { Link } from "wouter";

import {
  ROOM_ACCESS_SENT_LINE,
  ROOM_ACCESS_TTL_PHRASE,
  ROOM_ACCESS_UNAVAILABLE_LINE,
  type RoomAccessAvailability,
  type SendRoomAccessResponse,
} from "@shared/api";
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

const FORM_COPY = "type-note [text-transform:none] text-foreground";

const EXPLAIN_LINE = `A link sent here opens that room once, and only for ${ROOM_ACCESS_TTL_PHRASE}. It is not the room's own address.`;

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

type LinkFormState =
  | { phase: "closed" }
  | { phase: "loading" }
  | { phase: "unavailable"; line: string }
  | { phase: "ready" }
  | { phase: "sending" }
  | { phase: "sent"; line: string }
  | { phase: "error"; line: string };

/**
 * Two actions fused into one: get back into a room this browser remembers, or
 * start a new one. Hover opens the list on a pointer device. On a phone there
 * is no hover, so the return half opens the list on tap and the create half
 * creates. With nothing remembered, Open a room stays, and Send a link is how
 * a cleared browser gets back in: an address, a single-use link that lasts
 * one hour.
 *
 * After create, the room itself offers the claim. This control does not.
 */
export function RoomMenu({ className, doorId, agentId, testId, layout = "dropdown" }: RoomMenuProps) {
  const { open: create, opening, error } = useOpenRoom({ doorId, agentId });
  const [rooms, setRooms] = useState<RememberedRoom[]>(listRememberedRooms);
  const [open, setOpen] = useState(false);
  const [linkForm, setLinkForm] = useState<LinkFormState>({ phase: "closed" });
  const [email, setEmail] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const emailId = useId();
  const linkFormOpen = linkForm.phase !== "closed";

  const refresh = () => setRooms(listRememberedRooms());

  useEffect(() => {
    const sync = () => setRooms(listRememberedRooms());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!open && !linkFormOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setLinkForm({ phase: "closed" });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setLinkForm({ phase: "closed" });
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, linkFormOpen]);

  const showList = open && rooms.length > 0;
  const newest = rooms[0];

  const openLinkForm = async () => {
    setOpen(true);
    setLinkForm({ phase: "loading" });
    try {
      const res = await fetch("/api/room-access", { headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (!res.ok) {
        setLinkForm({
          phase: "unavailable",
          line: res.status === 429 ? "Too many requests. Wait a moment." : ROOM_ACCESS_UNAVAILABLE_LINE,
        });
        return;
      }
      const body = (await res.json()) as RoomAccessAvailability;
      if (body.available === false) {
        setLinkForm({ phase: "unavailable", line: body.unavailableLine });
        return;
      }
      setLinkForm({ phase: "ready" });
    } catch {
      setLinkForm({
        phase: "error",
        line: "The page could not reach the server, so no link can be sent.",
      });
    }
  };

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (linkForm.phase !== "ready" && linkForm.phase !== "error") return;
    setLinkForm({ phase: "sending" });
    try {
      const res = await fetch("/api/room-access", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      if (res.status === 503) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setLinkForm({
          phase: "unavailable",
          line: body?.error?.trim() || ROOM_ACCESS_UNAVAILABLE_LINE,
        });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const line =
          body?.error?.trim() ||
          (res.status === 429 ? "Too many requests. Wait a moment." : "The link could not be sent. Try again.");
        setLinkForm({ phase: "error", line });
        return;
      }
      const body = (await res.json()) as SendRoomAccessResponse;
      setLinkForm({ phase: "sent", line: body.line?.trim() || ROOM_ACCESS_SENT_LINE });
    } catch {
      setLinkForm({
        phase: "error",
        line: "The page could not reach the server, so no link was sent.",
      });
    }
  };

  const roomItems = rooms.map((room) => {
    const when = formatLastSeen(room.lastSeen);
    return (
      <li key={room.token} className="border-t border-border first:border-t-0">
        <Link
          href={`/w/${room.token}`}
          role="menuitem"
          data-testid={`${testId}-entry`}
          className="flex w-full items-baseline justify-between gap-[var(--s3)] px-[var(--s2)] py-[var(--s2)] text-left text-foreground no-underline [text-transform:none] hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => {
            setOpen(false);
            setLinkForm({ phase: "closed" });
          }}
        >
          <span className="type-note min-w-0 truncate font-medium">{roomLabel(room.name)}</span>
          {when ? (
            <span className="type-note shrink-0 text-muted-foreground">{when}</span>
          ) : null}
        </Link>
      </li>
    );
  });

  const list = showList ? (
    <ul
      id={listId}
      role="menu"
      data-testid={`${testId}-list`}
      className={
        layout === "inline"
          ? "mt-[var(--s2)] flex min-w-[16rem] flex-col border-t border-border pt-[var(--s2)]"
          : "flex min-w-[18rem] flex-col"
      }
    >
      {roomItems}
    </ul>
  ) : null;

  const sendControl = (
    <button
      type="button"
      data-testid={`${testId}-send-link`}
      aria-expanded={linkFormOpen}
      aria-controls={emailId}
      onClick={() => {
        if (linkFormOpen) setLinkForm({ phase: "closed" });
        else void openLinkForm();
      }}
      className={`${INNER} disabled:opacity-50`}
    >
      Send a link
    </button>
  );

  const form =
    linkFormOpen ? (
      <div
        data-testid={`${testId}-send-form`}
        className={
          layout === "inline"
            ? `mt-[var(--s2)] max-w-[22rem] border-t border-border pt-[var(--s2)] ${FORM_COPY}`
            : `max-w-[22rem] px-[var(--s2)] py-[var(--s2)] ${FORM_COPY} ${showList ? "border-t border-border" : ""}`
        }
      >
        {linkForm.phase === "unavailable" ? <p>{linkForm.line}</p> : null}
        {linkForm.phase === "sent" ? <p data-testid={`${testId}-send-line`}>{linkForm.line}</p> : null}
        {linkForm.phase === "error" ? (
          <p role="alert" className="text-destructive">
            {linkForm.line}
          </p>
        ) : null}
        {linkForm.phase === "ready" || linkForm.phase === "sending" || linkForm.phase === "error" ? (
          <>
            <p>{EXPLAIN_LINE}</p>
            <form className="mt-[var(--s2)] flex flex-col gap-[var(--s2)]" onSubmit={(event) => void onSend(event)}>
              <label htmlFor={emailId} className="text-muted-foreground">
                Address
              </label>
              <input
                id={emailId}
                data-testid={`${testId}-send-email`}
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                disabled={linkForm.phase === "sending"}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border-b border-border bg-transparent py-[var(--s1)] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                data-testid={`${testId}-send-submit`}
                disabled={linkForm.phase === "sending"}
                className="self-start border-b border-primary pb-[var(--s1)] text-primary hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                {linkForm.phase === "sending" ? "Sending the link…" : "Send the link"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    ) : null;

  const dropdownPanel =
    layout === "dropdown" && (showList || linkFormOpen) ? (
      <div className="absolute left-0 top-full z-50 min-w-[18rem] pt-[var(--s1)]">
        {/* pt- and not mt-: a margin here is 8px of nothing between the
            trigger and the panel, and the root's mouseleave fires while the
            pointer crosses it. Padding keeps the gap inside the hit area. */}
        <div className="relative border border-border bg-background">
          {list}
          {form}
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={layout === "inline" ? "relative flex flex-col items-stretch" : "relative inline-flex flex-col items-start"}
      onMouseEnter={() => {
        const next = listRememberedRooms();
        setRooms(next);
        if (next.length > 0 && !isCoarsePointer() && !linkFormOpen) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!isCoarsePointer() && !linkFormOpen) setOpen(false);
      }}
    >
      {rooms.length === 0 ? (
        <span className={`relative inline-flex items-baseline gap-[var(--s2)] ${className}`}>
          <button
            type="button"
            data-testid={testId}
            onClick={() => void create()}
            disabled={opening}
            className={`${INNER} disabled:opacity-50`}
          >
            {opening ? "Opening a room…" : "Open a room"}
          </button>
          <span aria-hidden="true" className="text-muted-foreground">
            |
          </span>
          {sendControl}
          {dropdownPanel}
        </span>
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
          <span aria-hidden="true" className="text-muted-foreground">
            |
          </span>
          {sendControl}
          {dropdownPanel}
        </span>
      ) : null}
      {layout === "inline" ? (
        <>
          {list}
          {form}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="type-note mt-[var(--s1)] max-w-[28ch] text-destructive [text-transform:none]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default RoomMenu;
