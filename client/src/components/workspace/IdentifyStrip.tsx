import { useCallback, useEffect, useState } from "react";
import type { RoomBindingState } from "@shared/api";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, LABEL, META, READ } from "@/components/workspace/room-style";

/**
 * The strip that asks a visitor to bind the room once the room holds something
 * of theirs — an account, a site, numbers.
 *
 * It is a request, not a gate. The address in the URL remains a bearer
 * credential; binding adds a second fact about the room and does not stop
 * anyone who has the link from opening it. Two routes, and the strip will not
 * render a button for a route that cannot work: if WAHA is down, LinkedIn
 * stays, with a sentence saying why.
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

  if (!state) return null;
  if (!state.bound && !state.needsIdentify) return null;

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
              {whatsapp.qrSvg ? (
                <div
                  className="mt-4 w-36 text-foreground"
                  role="img"
                  aria-label="QR code that opens WhatsApp with the room address already written"
                  data-testid="img-identify-whatsapp-qr"
                  // Our own SVG: modules only, no visitor text in the markup.
                  dangerouslySetInnerHTML={{ __html: whatsapp.qrSvg }}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default IdentifyStrip;
