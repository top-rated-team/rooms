import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ROOMS_STORAGE_KEY } from "@/lib/rooms";
import { Link } from "wouter";

import {
  ROOM_ACCESS_SENT_LINE,
  ROOM_ACCESS_TTL_PHRASE,
  ROOM_ACCESS_UNAVAILABLE_LINE,
  type RoomLoginAvailability,
  type RoomLoginWhatsAppConfirmed,
  type RoomLoginWhatsAppOffer,
  type SendRoomAccessResponse,
} from "@shared/api";
import { isHouseHost } from "@shared/operator";
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

const EXPLAIN_LINE = `A link sent to your email opens that room once, and only for ${ROOM_ACCESS_TTL_PHRASE}.`;

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

type LoginPanelState =
  | { phase: "closed" }
  | { phase: "loading" }
  | { phase: "ready"; ways: RoomLoginAvailability }
  | { phase: "error"; line: string };

type EmailFormState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent"; line: string }
  | { phase: "error"; line: string };

/**
 * Two actions fused into one: get back into a room, or start a new one.
 * With nothing remembered the pair is LOGIN | Open a room, LOGIN first.
 * With rooms remembered it stays Your rooms | Open a room.
 *
 * LOGIN opens the ways that work on this deployment: LinkedIn, WhatsApp on
 * a house host, or a link to an address. After create, the room itself
 * offers the claim. This control does not.
 */
export function RoomMenu({ className, doorId, agentId, testId, layout = "dropdown" }: RoomMenuProps) {
  const { open: create, opening, error } = useOpenRoom({ doorId, agentId });
  const [rooms, setRooms] = useState<RememberedRoom[]>(listRememberedRooms);
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState<LoginPanelState>({ phase: "closed" });
  const [email, setEmail] = useState("");
  const [emailForm, setEmailForm] = useState<EmailFormState>({ phase: "idle" });
  const [whatsapp, setWhatsapp] = useState<RoomLoginWhatsAppOffer | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappLine, setWhatsappLine] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const emailId = useId();
  const loginOpen = login.phase !== "closed";

  const refresh = () => setRooms(listRememberedRooms());

  useEffect(() => {
    const sync = () => setRooms(listRememberedRooms());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!open && !loginOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setLogin({ phase: "closed" });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setLogin({ phase: "closed" });
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loginOpen]);

  useEffect(() => {
    if (!whatsapp?.code) return;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/room-login/whatsapp/confirmed?code=${encodeURIComponent(whatsapp.code)}`,
          { headers: { Accept: "application/json" }, credentials: "same-origin" },
        );
        if (!res.ok) return;
        const body = (await res.json()) as RoomLoginWhatsAppConfirmed;
        if (!body.confirmed) {
          if (body.expired) setWhatsappLine("That login code has expired. Open WhatsApp again.");
          return;
        }
        if (body.rooms.length === 1) {
          window.location.assign(`/w/${body.rooms[0].token}`);
          return;
        }
        if (body.rooms.length === 0) {
          setWhatsappLine("No room is bound to this WhatsApp chat.");
          return;
        }
        window.location.assign(`/w/${body.rooms[0].token}`);
      } catch {
        /* The panel stays. A missed poll is not a failed login. */
      }
    };
    const id = window.setInterval(() => void tick(), 3_000);
    return () => window.clearInterval(id);
  }, [whatsapp]);

  /* Inline is the phone burger, where there is no hover and nothing to open:
     the rooms are simply there, under the control, the moment the sheet is.
     Everywhere else the list belongs to the "Open a room" half's hover. */
  const showList = rooms.length > 0 && (layout === "inline" || open);

  const openLogin = async () => {
    /* setOpen(false), not true. It used to force the remembered-room list open
       alongside the ways in, from when one control opened one panel. Now each
       half owns its own hover, and showing somebody their rooms because they
       asked how to sign in is answering a question they did not ask. */
    setOpen(false);
    setLogin({ phase: "loading" });
    setEmailForm({ phase: "idle" });
    setWhatsapp(null);
    setWhatsappError(null);
    setWhatsappLine(null);
    try {
      const res = await fetch("/api/room-login", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) {
        setLogin({
          phase: "error",
          line: res.status === 429 ? "Too many requests. Wait a moment." : "The ways in could not be checked.",
        });
        return;
      }
      const body = (await res.json()) as RoomLoginAvailability;
      setLogin({ phase: "ready", ways: body });
    } catch {
      setLogin({
        phase: "error",
        line: "The page could not reach the server, so the ways in cannot be shown.",
      });
    }
  };

  const onSendEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (emailForm.phase === "sending") return;
    setEmailForm({ phase: "sending" });
    try {
      const res = await fetch("/api/room-access", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      if (res.status === 503) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setEmailForm({
          phase: "error",
          line: body?.error?.trim() || ROOM_ACCESS_UNAVAILABLE_LINE,
        });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const line =
          body?.error?.trim() ||
          (res.status === 429 ? "Too many requests. Wait a moment." : "The link could not be sent. Try again.");
        setEmailForm({ phase: "error", line });
        return;
      }
      const body = (await res.json()) as SendRoomAccessResponse;
      setEmailForm({ phase: "sent", line: body.line?.trim() || ROOM_ACCESS_SENT_LINE });
    } catch {
      setEmailForm({
        phase: "error",
        line: "The page could not reach the server, so no link was sent.",
      });
    }
  };

  const onWhatsApp = async () => {
    setWhatsappLoading(true);
    setWhatsappError(null);
    setWhatsappLine(null);
    try {
      const res = await fetch("/api/room-login/whatsapp", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setWhatsappError(body?.error?.trim() || "WhatsApp is not a way into a room from this page.");
        setWhatsapp(null);
        return;
      }
      setWhatsapp((await res.json()) as RoomLoginWhatsAppOffer);
    } catch {
      setWhatsappError("The page could not reach the server, so WhatsApp cannot be opened from here.");
      setWhatsapp(null);
    } finally {
      setWhatsappLoading(false);
    }
  };

  const list = showList ? (
    <ul
      id={listId}
      role="menu"
      data-testid={`${testId}-list`}
      className={
        layout === "inline"
          ? "mt-[var(--s2)] flex min-w-[16rem] flex-col border-t border-border pt-[var(--s2)]"
          : "flex w-[min(22rem,calc(100vw-3.5rem))] flex-col"
      }
    >
      {rooms.map((room) => {
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
                setLogin({ phase: "closed" });
              }}
            >
              <span className="type-note min-w-0 truncate font-medium">{roomLabel(room.name)}</span>
              {when ? <span className="type-note shrink-0 text-muted-foreground">{when}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  ) : null;

  const house = typeof window !== "undefined" && isHouseHost(window.location.hostname);
  const ways = login.phase === "ready" ? login.ways : null;
  const showLinkedIn = ways?.linkedin.available === true;
  /* LinkedIn is listed even when it is not on yet, with the reason, because a
     way in that simply is not drawn reads as a way in that does not exist —
     and the owner wants a person to see that it is coming. Compare WhatsApp,
     which is not drawn at all off a house host: that is not "not yet", it is
     "never here", because the number belongs to one deployment. */
  const linkedInLine = ways?.linkedin.available === false ? ways.linkedin.unavailableLine : null;
  const showWhatsApp = house && ways?.whatsapp.available === true;
  const emailAvailable = ways?.email.available === true;
  const emailUnavailable = ways && ways.email.available === false ? ways.email.unavailableLine : null;

  const loginPanel =
    loginOpen ? (
      <div
        data-testid={`${testId}-login`}
        className={
          layout === "inline"
            ? `mt-[var(--s2)] max-w-[22rem] border-t border-border pt-[var(--s2)] ${FORM_COPY}`
            /* w- and not max-w-: on a 390px phone 22rem plus the panel's own
               padding is wider than the screen, and the login copy ran off the
               right edge. Clamped to the viewport with a gutter. */
            : `w-[min(22rem,calc(100vw-3.5rem))] px-[var(--s2)] py-[var(--s2)] ${FORM_COPY} ${showList ? "border-t border-border" : ""}`
        }
      >
        {login.phase === "loading" ? <p>Checking the ways in.</p> : null}
        {login.phase === "error" ? (
          <p role="alert" className="text-destructive">
            {login.line}
          </p>
        ) : null}
        {login.phase === "ready" ? (
          /* A real list, with a rule between the rows. They were a stack of
             links and the owner read them as steps rather than as three ways
             to do one thing — which is what a list of alternatives has to
             announce before anything else. */
          <ul
            data-testid={`${testId}-login-ways`}
            className="m-0 flex list-none flex-col gap-[var(--s2)] p-0 [&>li+li]:border-t [&>li+li]:border-border [&>li+li]:pt-[var(--s2)]"
          >
            <li>
              {showLinkedIn ? (
                <a
                  href="/api/room-login/linkedin"
                  data-testid={`${testId}-login-linkedin`}
                  className="self-start border-b border-primary pb-[var(--s1)] text-primary no-underline hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Sign in with LinkedIn
                </a>
              ) : (
                <>
                  <p className="text-muted-foreground">Sign in with LinkedIn</p>
                  {linkedInLine ? <p className="mt-[var(--s1)]">{linkedInLine}</p> : null}
                </>
              )}
            </li>
            {showWhatsApp ? (
              <li>
              <button
                type="button"
                data-testid={`${testId}-login-whatsapp`}
                onClick={() => void onWhatsApp()}
                disabled={whatsappLoading}
                className={`${INNER} self-start disabled:opacity-50`}
              >
                {whatsappLoading ? "Opening WhatsApp" : "WhatsApp"}
              </button>
            {whatsappError ? (
              <p role="alert" className="text-destructive">
                {whatsappError}
              </p>
            ) : null}
            {whatsappLine ? <p data-testid={`${testId}-login-whatsapp-line`}>{whatsappLine}</p> : null}
            {whatsapp ? (
              <div data-testid={`${testId}-login-whatsapp-offer`}>
                <p>{whatsapp.warning}</p>
                <a
                  href={whatsapp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-[var(--s2)] inline-block border-b border-primary pb-[var(--s1)] text-primary no-underline hover:border-foreground hover:text-foreground"
                >
                  Open WhatsApp with the message written
                </a>
                {whatsapp.qrSvg ? (
                  <div
                    className="mt-[var(--s2)] w-36 text-foreground"
                    role="img"
                    aria-label="QR code that opens WhatsApp with the login code already written"
                    data-testid={`${testId}-login-whatsapp-qr`}
                    dangerouslySetInnerHTML={{ __html: whatsapp.qrSvg }}
                  />
                ) : null}
              </div>
            ) : null}
              </li>
            ) : null}

            <li>
            {emailUnavailable ? <p className="text-muted-foreground">A link to your email</p> : null}
            {emailUnavailable ? <p className="mt-[var(--s1)]">{emailUnavailable}</p> : null}
            {emailAvailable ? (
              <>
                <p>A link to your email</p>
                {emailForm.phase === "sent" ? (
                  <p data-testid={`${testId}-send-line`}>{emailForm.line}</p>
                ) : (
                  <>
                    <p>{EXPLAIN_LINE}</p>
                    {emailForm.phase === "error" ? (
                      <p role="alert" className="text-destructive">
                        {emailForm.line}
                      </p>
                    ) : null}
                    <form className="flex flex-col gap-[var(--s2)]" onSubmit={(event) => void onSendEmail(event)}>
                      {/* The label and its field are one thing, so they sit
                          closer to each other than either sits to the button.
                          They used to share the form's gap, which put a whole
                          step of nothing between the word and the line under it. */}
                      <div className="flex flex-col gap-[var(--s1)]">
                      <label htmlFor={emailId} className="text-muted-foreground">
                        Email
                      </label>
                      <input
                        id={emailId}
                        data-testid={`${testId}-send-email`}
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        value={email}
                        disabled={emailForm.phase === "sending"}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full border-b border-border bg-transparent pb-[var(--s1)] pt-0 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none disabled:opacity-50"
                      />
                      </div>
                      <button
                        type="submit"
                        data-testid={`${testId}-send-submit`}
                        disabled={emailForm.phase === "sending"}
                        className="self-start border-b border-primary pb-[var(--s1)] text-primary hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                      >
                        {emailForm.phase === "sending" ? "Sending the link" : "Send the link"}
                      </button>
                    </form>
                  </>
                )}
              </>
            ) : null}
            </li>
            {!showLinkedIn && !showWhatsApp && !emailAvailable && !emailUnavailable ? (
              <li>No way in is configured on this deployment.</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    ) : null;

  /* whitespace-normal is not cosmetic. This control sits inside the hero's
     action row, which is whitespace-nowrap so no label breaks in the middle,
     and the panel inherited it — a paragraph of login copy became one 411px
     line that widened the whole document to 456 on a 390px phone. That is the
     "the text does not fit" the owner reported.

     3.5rem is the page's two gutters at 390. The panel is absolutely
     positioned in a box whose overflow is visible, so anything wider than the
     column it hangs under does not merely look wrong — it widens the document
     and the whole page scrolls sideways. Measured: 22rem here took the page
     from 390 to 456. */
  const dropdownPanel =
    layout === "dropdown" && (showList || loginOpen) ? (
      <div className="absolute left-0 top-full z-50 w-[min(22rem,calc(100vw-3.5rem))] whitespace-normal pt-[var(--s1)]">
        {/* pt- and not mt-: a margin here is 8px of nothing between the
            trigger and the panel, and the root's mouseleave fires while the
            pointer crosses it. Padding keeps the gap inside the hit area. */}
        <div className="relative border border-border bg-background">
          {list}
          {loginPanel}
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={layout === "inline" ? "relative flex flex-col items-stretch" : "relative inline-flex flex-col items-start"}
      /* Opening belongs to the halves; the root only tidies up on the way
         out, and it closes BOTH — a login panel left open because the pointer
         went to the other half is the bug this replaced. */
      onMouseLeave={() => {
        if (isCoarsePointer()) return;
        setOpen(false);
        setLogin({ phase: "closed" });
      }}
    >
      {/* ONE PAIR IN EVERY STATE, and each half owns its own hover.
          Hovering "Open a room" drops the rooms this browser remembers;
          hovering "Login" shows the ways in. The old "Your rooms" label is
          gone: it was a third name for a gesture the reader already had, and
          the list it opened is now under the half that is about rooms.

          A coarse pointer has no hover, so there a tap on Login opens the
          ways and a tap on Open a room creates. The remembered list is not
          lost on a phone — the burger renders this control with
          layout="inline", which shows it without needing to hover at all. */}
      <span className={`relative inline-flex items-baseline gap-[var(--s2)] ${className}`}>
        <button
          type="button"
          data-testid={`${testId}-login-open`}
          aria-expanded={loginOpen}
          onMouseEnter={() => {
            if (isCoarsePointer()) return;
            setOpen(false);
            if (!loginOpen) void openLogin();
          }}
          onClick={() => {
            if (loginOpen) setLogin({ phase: "closed" });
            else void openLogin();
          }}
          className={`${INNER} disabled:opacity-50`}
        >
          Login
        </button>
        <span aria-hidden="true" className="text-muted-foreground">
          |
        </span>
        <button
          type="button"
          data-testid={testId}
          aria-haspopup={rooms.length > 0 ? "menu" : undefined}
          aria-expanded={rooms.length > 0 ? showList : undefined}
          aria-controls={rooms.length > 0 ? listId : undefined}
          onMouseEnter={() => {
            if (isCoarsePointer()) return;
            const next = listRememberedRooms();
            setRooms(next);
            setLogin({ phase: "closed" });
            if (next.length > 0) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && rooms.length > 0) {
              event.preventDefault();
              refresh();
              setOpen(true);
            }
          }}
          onClick={() => void create()}
          disabled={opening}
          className={`${INNER} disabled:opacity-50`}
        >
          {opening ? "Opening a room…" : "Open a room"}
        </button>
        {dropdownPanel}
      </span>
      {layout === "inline" ? (
        <>
          {list}
          {loginPanel}
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
