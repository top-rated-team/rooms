import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  ROOM_ACCESS_SENT_LINE,
  ROOM_ACCESS_TTL_PHRASE,
  ROOM_ACCESS_UNAVAILABLE_LINE,
  ROOM_SESSION_OUTCOME_LINES,
  ROOM_SESSION_OUTCOME_QUERY,
  ROOM_SESSION_QUERY,
  type RoomLoginAvailability,
  type RoomLoginWhatsAppConfirmed,
  type RoomLoginWhatsAppOffer,
  type RoomSession,
  type RoomSessionOutcome,
  type SendRoomAccessResponse,
} from "@shared/api";
import { isHouseHost } from "@shared/operator";
import { OPEN_A_ROOM, ROOMS_PATH } from "@shared/rooms-moved";
import { WhatsAppQr, isCoarsePointer } from "@/components/WhatsAppQr";
import { rememberSignInReturn } from "@/lib/signin-return";

function readSigninOutcome(): RoomSessionOutcome | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.get(ROOM_SESSION_QUERY)) return null;
    const raw = params.get(ROOM_SESSION_OUTCOME_QUERY);
    if (!raw) return null;
    return raw in ROOM_SESSION_OUTCOME_LINES ? (raw as RoomSessionOutcome) : null;
  } catch {
    return null;
  }
}

function stripSigninQuery(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(ROOM_SESSION_QUERY) && !url.searchParams.has(ROOM_SESSION_OUTCOME_QUERY)) return;
    url.searchParams.delete(ROOM_SESSION_QUERY);
    url.searchParams.delete(ROOM_SESSION_OUTCOME_QUERY);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* The panel still opens. */
  }
}

const WAY_LINK =
  "self-start border-b border-primary pb-[var(--s1)] text-primary no-underline hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const SESSION_EVENT = "room-session";

async function fetchSession(): Promise<RoomSession> {
  try {
    const res = await fetch("/api/session", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) return { signedIn: false };
    return (await res.json()) as RoomSession;
  } catch {
    return { signedIn: false };
  }
}

const INNER =
  "bg-transparent p-0 font-[inherit] text-inherit no-underline [text-transform:inherit] " +
  "hover:text-inherit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-[2px]";

const FORM_COPY = "type-note [text-transform:none] text-foreground";

const EXPLAIN_LINE = `A link sent to your email opens that room once, and only for ${ROOM_ACCESS_TTL_PHRASE}.`;
/* Signed in, the email row is for adding an address to this account: the link
   comes whether or not a room has it. */
const EXPLAIN_SIGNED_IN_LINE = `A link sent to your email adds it to this account, so it signs you in too. It works once, and only for ${ROOM_ACCESS_TTL_PHRASE}.`;

export interface RoomMenuProps {
  /** The classes the control carries — loud, quiet, or a nav link. */
  className: string;
  /** Distinct per place: the same control rendered twice must not share one id. */
  testId: string;
  /**
   * In the phone burger the panel has to sit in the sheet, not float over it.
   * Everywhere else it drops below the control.
   */
  layout?: "dropdown" | "inline";
  /** Sign in and nothing else: the operator's own pages, where a room is beside the point. */
  signInOnly?: boolean;
  /**
   * Where to come back to once signed in. Every way in lands on the front page
   * (server/room-account.ts); a page that is not the front page names itself here.
   */
  returnTo?: string;
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
 * Sign in | Open a room, and Sign out | Open a room once there is a session.
 *
 * Only AdGrant.AI's pages and the operator's pages carry this now. Rooms are
 * MakeHybrid's Hybrid Rooms, with their own sign-in (shared/rooms-moved.ts),
 * so "Open a room" is a plain link there, and this site's sign-in is for what
 * is still this site's: AdGrant.AI's generator and templates, and the
 * operator's booking pages. Top-Rated Team's own pages carry RoomsLink.
 *
 * The left half opens the ways that work on this deployment: LinkedIn,
 * WhatsApp on a house host, or a link to an email. Hovering Sign out offers
 * the other ways in, so they can be attached to this account.
 */
export function RoomMenu({ className, testId, layout = "dropdown", signInOnly = false, returnTo }: RoomMenuProps) {
  const [login, setLogin] = useState<LoginPanelState>({ phase: "closed" });
  const [session, setSession] = useState<RoomSession>({ signedIn: false });
  const [outcome, setOutcome] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailForm, setEmailForm] = useState<EmailFormState>({ phase: "idle" });
  const [whatsapp, setWhatsapp] = useState<RoomLoginWhatsAppOffer | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappLine, setWhatsappLine] = useState<string | null>(null);
  const [whatsappDone, setWhatsappDone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const emailId = useId();
  const loginOpen = login.phase !== "closed";

  const signedIn = session.signedIn;
  const applySession = (next: RoomSession) => setSession(next);
  /* Before any way in is taken: LinkedIn and the email link come back to the
     front page, and this is how the front page knows to send them on. */
  const leaving = () => {
    if (returnTo) rememberSignInReturn(returnTo);
  };

  useEffect(() => {
    let cancelled = false;
    void fetchSession().then((next) => {
      if (!cancelled) applySession(next);
    });
    const onSession = () => {
      void fetchSession().then((next) => {
        if (!cancelled) applySession(next);
      });
    };
    window.addEventListener(SESSION_EVENT, onSession);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EVENT, onSession);
    };
  }, []);

  useEffect(() => {
    const found = readSigninOutcome();
    if (!found) return;
    stripSigninQuery();
    setOutcome(ROOM_SESSION_OUTCOME_LINES[found]);
    void openLogin();
  }, []);

  useEffect(() => {
    if (!loginOpen) return;
    const onPointer = (event: PointerEvent) => {
      /*
       * A CLICK ON THE BROWSER IS NOT A CLICK ON THE PAGE. Reaching for the
       * autofill or password bubble the browser puts above the page took this
       * menu away mid-typing: the bubble is browser furniture, the page is not
       * focused while it is up, and whatever event arrives has a target
       * outside this menu. So the only pointerdown that dismisses is one the
       * page was actually focused for.
       *
       * The same guard covers a target that has already left the document —
       * clicking something that removes itself is not a click outside.
       */
      if (!document.hasFocus()) return;
      const target = event.target as Node | null;
      if (target instanceof Element && !target.isConnected) return;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setLogin({ phase: "closed" });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLogin({ phase: "closed" });
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [loginOpen]);

  useEffect(() => {
    if (!whatsapp?.code || whatsappDone) return;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/room-login/whatsapp/confirmed?code=${encodeURIComponent(whatsapp.code)}`,
          { headers: { Accept: "application/json" }, credentials: "same-origin" },
        );
        if (!res.ok) return;
        const body = (await res.json()) as RoomLoginWhatsAppConfirmed;
        if (!body.confirmed) {
          if (body.expired) setWhatsappLine("That sign-in code has expired. Open WhatsApp again.");
          return;
        }
        const claim = await fetch("/api/session/whatsapp", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ code: whatsapp.code }),
        });
        const claimed = (await claim.json().catch(() => null)) as
          | { confirmed?: boolean; error?: string; attached?: boolean }
          | null;
        setWhatsappDone(true);
        if (!claim.ok) {
          setWhatsappLine(claimed?.error?.trim() || ROOM_SESSION_OUTCOME_LINES.refused);
          return;
        }
        window.dispatchEvent(new Event(SESSION_EVENT));
        setWhatsappLine(ROOM_SESSION_OUTCOME_LINES["whatsapp-confirmed"]);
      } catch {
        /* The panel stays. A missed poll is not a failed sign-in. */
      }
    };
    const id = window.setInterval(() => void tick(), 3_000);
    return () => window.clearInterval(id);
  }, [whatsapp, whatsappDone]);

  /* Inline is the phone burger, where there is no hover. When someone is
     signed in, the ways in stay in the sheet so a second way can be attached
     without a hover. */
  useEffect(() => {
    if (layout !== "inline" || !signedIn) return;
    if (login.phase === "closed") void openLogin();
  }, [layout, signedIn]);

  const openLogin = async () => {
    setLogin({ phase: "loading" });
    setEmailForm({ phase: "idle" });
    setWhatsapp(null);
    setWhatsappError(null);
    setWhatsappLine(null);
    setWhatsappDone(false);
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
    leaving();
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

  const onSignOut = async () => {
    try {
      await fetch("/api/session/sign-out", {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
    } catch {
      /* The cookie may still be there. The next who-am-I will say so. */
    }
    setSession({ signedIn: false });
    setOutcome(null);
    setLogin({ phase: "closed" });
    setWhatsapp(null);
    setWhatsappLine(null);
    window.dispatchEvent(new Event(SESSION_EVENT));
  };

  const onWhatsApp = async () => {
    leaving();
    setWhatsappLoading(true);
    setWhatsappError(null);
    setWhatsappLine(null);
    setWhatsappDone(false);
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
            : `w-[min(22rem,calc(100vw-3.5rem))] px-[var(--s2)] py-[var(--s2)] ${FORM_COPY}`
        }
      >
        {outcome && login.phase !== "ready" ? (
          <p data-testid={`${testId}-signin-outcome`} className="mb-[var(--s2)]">
            {outcome}
          </p>
        ) : null}
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
            {outcome ? (
              <li>
                <p data-testid={`${testId}-signin-outcome`}>{outcome}</p>
              </li>
            ) : null}
            <li>
              {signedIn && session.signedIn && session.attached.linkedin ? (
                <p className="text-muted-foreground">LinkedIn is already on this account.</p>
              ) : showLinkedIn ? (
                <a
                  href="/api/room-login/linkedin"
                  data-testid={`${testId}-login-linkedin`}
                  onClick={leaving}
                  className={WAY_LINK}
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
              {signedIn && session.signedIn && session.attached.whatsapp ? (
                <p className="text-muted-foreground">WhatsApp is already on this account.</p>
              ) : (
              <button
                type="button"
                data-testid={`${testId}-login-whatsapp`}
                onClick={() => void onWhatsApp()}
                disabled={whatsappLoading}
                className={`${WAY_LINK} disabled:opacity-50`}
              >
                {whatsappLoading ? "Opening WhatsApp" : "Sign in with WhatsApp"}
              </button>
              )}
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
                  className={`mt-[var(--s2)] inline-block ${WAY_LINK}`}
                >
                  Open WhatsApp with the message written
                </a>
                <WhatsAppQr
                  svg={whatsapp.qrSvg}
                  href={whatsapp.url}
                  label="QR code that opens WhatsApp with the sign-in code already written"
                  className="mt-[var(--s2)]"
                  testId={`${testId}-login-whatsapp-qr`}
                />
              </div>
            ) : null}
              </li>
            ) : null}

            <li>
            {/* NO HEADING. It read "A link to your email" and then a sentence
                beginning "A link sent to your email…", which is the same words
                twice, one line apart. The sentence says everything the heading
                said and says it in a sentence. */}
            {emailUnavailable ? <p className="mt-[var(--s1)]">{emailUnavailable}</p> : null}
            {emailAvailable && signedIn && session.signedIn && session.attached.email ? (
              <p className="text-muted-foreground">Email is already on this account.</p>
            ) : emailAvailable ? (
              <>
                {emailForm.phase === "sent" ? (
                  <p data-testid={`${testId}-send-line`}>{emailForm.line}</p>
                ) : (
                  <>
                    <p>{signedIn ? EXPLAIN_SIGNED_IN_LINE : EXPLAIN_LINE}</p>
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
            {signedIn && isCoarsePointer() ? (
              <li>
                <button
                  type="button"
                  data-testid={`${testId}-signin-end`}
                  onClick={() => void onSignOut()}
                  className={WAY_LINK}
                >
                  Sign out
                </button>
              </li>
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
    layout === "dropdown" && loginOpen ? (
      <div className="absolute left-0 top-full z-50 w-[min(22rem,calc(100vw-3.5rem))] whitespace-normal pt-[var(--s1)]">
        {/* pt- and not mt-: a margin here is 8px of nothing between the
            trigger and the panel, and the root's mouseleave fires while the
            pointer crosses it. Padding keeps the gap inside the hit area. */}
        <div className="relative border border-border bg-background">{loginPanel}</div>
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
        /*
         * NOT WHILE SOMETHING IN HERE IS BEING TYPED IN.
         *
         * This is what actually took the form away when the owner reached for
         * the browser's saved-address list. That list is a native layer drawn
         * OVER the page: the moment the pointer moves onto it the page is no
         * longer under the pointer, so the browser fires mouseleave here and
         * the menu closed — on hover alone, before any click. The pointerdown
         * guard could not see it, because no pointerdown ever reached us.
         *
         * A field somebody is typing in must survive the pointer wandering
         * off, whatever it wandered onto. Escape and a click outside still
         * close it, and a menu with nothing focused still closes on the way
         * out as it always did.
         */
        const root = rootRef.current;
        const focused = root && document.activeElement instanceof HTMLElement && root.contains(document.activeElement);
        if (focused && document.activeElement instanceof HTMLInputElement) return;
        setLogin({ phase: "closed" });
      }}
    >
      {/* ONE PAIR IN EVERY STATE. Hovering Sign in or Sign out shows the
          ways in; "Open a room" is a link to the rooms, which are elsewhere
          now. The label is read from the server.

          A coarse pointer has no hover, so there a tap on Sign in opens the
          ways. When signed in on a phone burger the ways stay in the sheet so
          a second way can be attached without a hover. */}
      <span className={`relative inline-flex items-baseline gap-[var(--s2)] ${className}`}>
        <button
          type="button"
          data-testid={`${testId}-login-open`}
          aria-expanded={loginOpen}
          onMouseEnter={() => {
            if (isCoarsePointer()) return;
            if (!loginOpen) void openLogin();
          }}
          onClick={() => {
            if (signedIn && layout === "dropdown" && !isCoarsePointer()) {
              void onSignOut();
              return;
            }
            if (signedIn && layout === "inline") {
              void onSignOut();
              return;
            }
            if (loginOpen) setLogin({ phase: "closed" });
            else void openLogin();
          }}
          className={`${INNER} disabled:opacity-50`}
        >
          {signedIn ? "Sign out" : "Sign in"}
        </button>
        {signInOnly ? null : (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              |
            </span>
            <a href={ROOMS_PATH} data-testid={testId} className={INNER}>
              {OPEN_A_ROOM}
            </a>
          </>
        )}
        {dropdownPanel}
      </span>
      {layout === "inline" ? loginPanel : null}
    </div>
  );
}

export default RoomMenu;
