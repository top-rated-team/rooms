import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomBindingState, RoomClaimState } from "@shared/api";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, FOCUS, LABEL, META, READ } from "@/components/workspace/room-style";
import { WhatsAppQr } from "@/components/WhatsAppQr";

/**
 * The strip that asks a visitor to bind the room once the room holds something
 * of theirs — an account, a site, numbers.
 *
 * It is a request, not a gate. The address in the URL remains a bearer
 * credential; binding adds a second fact about the room and does not stop
 * anyone who has the link from opening it. Two routes, and the strip will not
 * render a button for a route that cannot work: if WhatsApp is down, LinkedIn
 * stays, with a sentence saying why.
 *
 * IT USED TO DISAPPEAR ENTIRELY until the visitor had pasted something of
 * their own, and that was a dead end with no way out of it. Binding a room is
 * the ONLY thing that makes a room somebody's, and everything that follows —
 * renaming it, putting a card on it, admitting an agent, signing in from
 * another browser and finding it again — waits on that. So a visitor who
 * simply wanted their room to be theirs had nowhere to say so, and the owner
 * hit exactly that: signed in with LinkedIn on the site, opened a room, and
 * found no way to make it his. Now the offer is always reachable; what the
 * paste changes is whether it is already open or sits on one quiet line.
 *
 * THE THIRD ROUTE IS NOT A FOURTH WAY TO OWN THE ROOM. An email address here
 * is a way BACK IN — a link, once, for an hour — and it is labelled as that.
 * It is not a proof of who anybody is, so it does not mark the room as theirs,
 * and this file must not imply that it does.
 */

export interface IdentifyStripProps {
  token: string;
}

const PURPOSE =
  "Bind this room to you so we know it holds your account and numbers, and so the link lands in a place you will still have next week.";

const BEARER =
  "The address is still the whole credential: anyone who has it can still open the room.";

const LINKEDIN_LINE =
  "This opens LinkedIn's own sign-in. We keep an id and the name on your profile. LinkedIn does not endorse this room or this company.";

/** The one-line form when nothing has asked for the strip yet. */
const UNCLAIMED_LINE = "This room is not marked as anyone's yet.";

const EMAIL_PURPOSE =
  "So you can get back in from another browser: we send a link to this address, good once and for an hour. It is not a proof of who you are, so it does not mark the room as yours — LinkedIn or WhatsApp does that.";

const EMAIL_KEPT_LINE = "Kept for this room. A link can be sent to it from Open a room.";

interface WhatsAppOffer {
  url: string;
  qrSvg: string | null;
  warning: string;
}

function providerLabel(provider: RoomBindingState["provider"]): string {
  if (provider === "linkedin") return "LinkedIn";
  if (provider === "whatsapp") return "WhatsApp";
  return "them";
}

export function IdentifyStrip({ token }: IdentifyStripProps) {
  const [state, setState] = useState<RoomBindingState | null>(null);
  /* Opened by hand from the quiet line. The paste still opens it on its own. */
  const [asked, setAsked] = useState(false);
  const [email, setEmail] = useState("");
  const [emailPhase, setEmailPhase] = useState<"idle" | "saving" | "kept">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsAppOffer | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await apiRequest<RoomBindingState>("GET", `/api/workspaces/${encodeURIComponent(token)}/identity`, undefined, {
        signal,
      });
      setState(next);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 404) {
        setState(null);
        return;
      }
      // The room still works. A strip that cannot load is not a lock.
    }
  }, [token]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    if (!state || state.bound) return;
    const id = window.setInterval(() => void load(), 8_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, state]);

  const onWhatsApp = useCallback(async () => {
    setWhatsappLoading(true);
    setWhatsappError(null);
    try {
      const offer = await apiRequest<WhatsAppOffer>("GET", `/api/workspaces/${encodeURIComponent(token)}/identity/whatsapp`);
      setWhatsapp(offer);
    } catch (error) {
      const line =
        error instanceof ApiError && error.message.trim()
          ? error.message.trim()
          : "WhatsApp is not reachable from this page right now, so LinkedIn is the way to bind this room.";
      setWhatsappError(line);
      setWhatsapp(null);
      void load();
    } finally {
      setWhatsappLoading(false);
    }
  }, [load, token]);

  /**
   * Keep an address against this room.
   *
   * The endpoint has existed since the mailed-link parcel and had no caller in
   * the client at all, which is why "If that email has a room, the link is on
   * its way" was true of no email anybody could type: nothing ever gave a room
   * an address. The server stores a HASH of it — this is the only moment the
   * address itself is in play.
   */
  const onSaveEmail = useCallback(async () => {
    const value = email.trim();
    if (!value) return;
    setEmailPhase("saving");
    setEmailError(null);
    try {
      await apiRequest("POST", `/api/workspaces/${encodeURIComponent(token)}/room-address`, { email: value });
      setEmailPhase("kept");
    } catch (error) {
      setEmailPhase("idle");
      setEmailError(
        error instanceof ApiError && error.message.trim() ? error.message.trim() : "That address could not be kept.",
      );
    }
  }, [email, token]);

  if (!state) return null;

  /* Bound rooms say so. Unbound ones either ask — because the visitor has put
     something of their own in here — or wait on one line until asked. */
  const offering = !state.bound && (state.needsIdentify || asked);

  if (!state.bound && !offering) {
    return (
      <div className="shrink-0 border-b border-border px-5 py-2.5 sm:px-8" data-testid="strip-identify-quiet">
        <p className={cn(META, "text-muted-foreground")}>
          {UNCLAIMED_LINE}{" "}
          <button
            type="button"
            onClick={() => setAsked(true)}
            className={cn(ACTION_QUIET, "align-baseline")}
            data-testid="button-identify-open"
          >
            Make it yours
          </button>
        </p>
      </div>
    );
  }

  const linkedinHref = `/api/workspaces/${encodeURIComponent(token)}/identity/linkedin`;
  const showLinkedIn = state.linkedin.available;
  const showWhatsApp = state.whatsapp.available;
  const wahaDownLine = !showWhatsApp ? state.whatsapp.unavailableLine : whatsappError;

  return (
    <div className="shrink-0 border-b border-border px-5 py-3 sm:px-8" data-testid="strip-identify">
      <p className={LABEL}>{state.bound ? "This room" : "For confidentiality"}</p>

      {state.bound ? (
        <p className={cn(READ, "mt-2 text-foreground")} data-testid="text-identify-bound">
          Marked as {state.displayName}'s, via {providerLabel(state.provider)}. {BEARER}
          {state.provider === "whatsapp" ? " The address is also in that WhatsApp chat." : ""}
        </p>
      ) : (
        <>
          <p className={cn(READ, "mt-2 text-foreground")} data-testid="text-identify-purpose">
            {PURPOSE}
          </p>
          <p className={cn(META, "mt-1.5 text-muted-foreground")}>{BEARER}</p>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            {showLinkedIn ? (
              <a href={linkedinHref} className={ACTION} data-testid="button-identify-linkedin">
                Bind with LinkedIn
              </a>
            ) : null}
            {showWhatsApp ? (
              <button
                type="button"
                onClick={() => void onWhatsApp()}
                className={showLinkedIn ? ACTION_QUIET : ACTION}
                disabled={whatsappLoading}
                data-testid="button-identify-whatsapp"
              >
                {whatsappLoading ? "Opening WhatsApp" : "Bind with WhatsApp"}
              </button>
            ) : null}
          </div>

          {showLinkedIn ? (
            <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-identify-linkedin-line">
              {LINKEDIN_LINE}
            </p>
          ) : state.linkedin.unavailableLine ? (
            <p className={cn(META, "mt-3 text-muted-foreground")}>{state.linkedin.unavailableLine}</p>
          ) : null}

          {wahaDownLine ? (
            <p className={cn(META, "mt-2 text-muted-foreground")} data-testid="text-identify-waha-down">
              {wahaDownLine}
            </p>
          ) : null}

          {whatsapp ? (
            <div className="mt-4" data-testid="identify-whatsapp-offer">
              <p className={cn(CHROME, "text-foreground")} data-testid="text-identify-whatsapp-warning">
                {whatsapp.warning}
              </p>
              <a
                href={whatsapp.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(ACTION, "mt-3")}
                data-testid="link-identify-whatsapp"
              >
                Open WhatsApp with the message written
              </a>
              <WhatsAppQr
                svg={whatsapp.qrSvg}
                href={whatsapp.url}
                label="QR code that opens WhatsApp with the room address already written"
                className="mt-4"
                testId="img-identify-whatsapp-qr"
              />
            </div>
          ) : null}

          {/* A WAY BACK, WHICH IS NOT A WAY TO OWN IT. Kept visually apart
              from the two buttons above for that reason: those mark the room
              as somebody's, this one only means a link can reach you. */}
          <div className="mt-5 border-t border-border pt-4">
            <p className={cn(META, "text-muted-foreground")} data-testid="text-identify-email-purpose">
              {EMAIL_PURPOSE}
            </p>
            {emailPhase === "kept" ? (
              <p className={cn(CHROME, "mt-2 text-foreground")} data-testid="text-identify-email-kept">
                {EMAIL_KEPT_LINE}
              </p>
            ) : (
              <form
                className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onSaveEmail();
                }}
              >
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={emailPhase === "saving"}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email for a link back to this room"
                  data-testid="input-identify-email"
                  className={cn(
                    READ,
                    FOCUS,
                    "min-w-[16rem] flex-1 border-b border-border bg-transparent pb-1 text-foreground placeholder:text-muted-foreground disabled:opacity-50",
                  )}
                />
                <button
                  type="submit"
                  className={ACTION_QUIET}
                  disabled={emailPhase === "saving" || email.trim().length === 0}
                  data-testid="button-identify-email"
                >
                  {emailPhase === "saving" ? "Keeping" : "Keep this address"}
                </button>
              </form>
            )}
            {emailError ? (
              <p role="alert" className={cn(META, "mt-2 text-destructive")} data-testid="text-identify-email-error">
                {emailError}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default IdentifyStrip;

/**
 * The room name the owner already reads, made editable in place once a claim
 * exists. An unclaimed room keeps the name it was given at creation. No panel,
 * no settings screen, no modal for one text field.
 *
 * Wired from the sidebar and the desktop top bar — those files are not this
 * parcel's, so callers pass token and the current name.
 */
export function RoomNameControl({
  token,
  name,
  className,
}: {
  token: string;
  name: string;
  className?: string;
}) {
  const [claim, setClaim] = useState<RoomClaimState | null>(null);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(name);
  }, [name]);

  useEffect(() => {
    const ac = new AbortController();
    void apiRequest<RoomClaimState>("GET", `/api/workspaces/${encodeURIComponent(token)}/claim`, undefined, {
      signal: ac.signal,
    })
      .then((next) => setClaim(next))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setClaim(null);
      });
    return () => ac.abort();
  }, [token]);

  const save = useCallback(async () => {
    const next = draft.trim();
    if (!claim?.canRename) return;
    if (!next || next === name) {
      setDraft(name);
      return;
    }
    setSaving(true);
    try {
      const renamed = await apiRequest<{ name: string }>("PATCH", `/api/workspaces/${encodeURIComponent(token)}`, {
        name: next,
      });
      setDraft(renamed.name);
    } catch {
      setDraft(name);
    } finally {
      setSaving(false);
    }
  }, [claim?.canRename, draft, name, token]);

  if (!claim?.canRename) {
    return (
      <p className={cn(CHROME, "truncate font-medium", className)} title={name}>
        {name}
      </p>
    );
  }

  return (
    <form
      className={cn("min-w-0", className)}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="sr-only" htmlFor={`room-name-${token}`}>
        Room name
      </label>
      <input
        id={`room-name-${token}`}
        type="text"
        value={draft}
        maxLength={120}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          void save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft(name);
            (event.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          CHROME,
          FOCUS,
          "w-full truncate bg-transparent font-medium text-foreground",
        )}
        data-testid="input-room-name"
      />
    </form>
  );
}
