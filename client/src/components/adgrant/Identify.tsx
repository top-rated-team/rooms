import { useCallback, useEffect, useState } from "react";

import type { RoomBindingState } from "@shared/api";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { ACTION, ACTION_QUIET, META_PLAIN, READ, READ_MUTED } from "@/components/site/doors/quiet";

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

/**
 * The two identification routes that already exist, in this chrome. LinkedIn
 * opens in another tab so this page can keep polling; the callback lands in
 * the room, which this parcel does not own.
 */
export function Identify({ token, onBound }: { token: string; onBound: () => void }) {
  const [state, setState] = useState<RoomBindingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsAppOffer | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await apiRequest<RoomBindingState>(
          "GET",
          `/api/workspaces/${encodeURIComponent(token)}/identity`,
          undefined,
          { signal },
        );
        setState(next);
        setLoadError(null);
        if (next.bound) onBound();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(
          error instanceof ApiError && error.message.trim()
            ? error.message.trim()
            : "Identity could not be checked. Try again.",
        );
      }
    },
    [onBound, token],
  );

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
      const offer = await apiRequest<WhatsAppOffer>(
        "GET",
        `/api/workspaces/${encodeURIComponent(token)}/identity/whatsapp`,
      );
      setWhatsapp(offer);
    } catch (error) {
      setWhatsappError(
        error instanceof ApiError && error.message.trim()
          ? error.message.trim()
          : "WhatsApp is not reachable from this page right now, so LinkedIn is the way to identify.",
      );
      setWhatsapp(null);
      void load();
    } finally {
      setWhatsappLoading(false);
    }
  }, [load, token]);

  if (loadError && !state) {
    return (
      <p role="alert" className="type-note mt-[var(--s2)] text-destructive">
        {loadError}
      </p>
    );
  }

  if (!state) {
    return <p className={READ_MUTED}>Checking whether this room is already bound…</p>;
  }

  if (state.bound) {
    return (
      <p className={READ} data-testid="text-adgrant-bound">
        Bound as {state.displayName}, via {providerLabel(state.provider)}.
      </p>
    );
  }

  const linkedinHref = `/api/workspaces/${encodeURIComponent(token)}/identity/linkedin`;
  const showLinkedIn = state.linkedin.available;
  const showWhatsApp = state.whatsapp.available;
  const downLine = !showWhatsApp ? state.whatsapp.unavailableLine : whatsappError;

  return (
    <div data-testid="block-adgrant-identify">
      <p className={READ}>
        A generation needs this room bound to you, through LinkedIn sign-in or a WhatsApp message to us. Those are the
        two identification routes that already exist; there is not a third.
      </p>
      <div className="mt-[var(--s3)] flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s2)]">
        {showLinkedIn ? (
          <a
            href={linkedinHref}
            target="_blank"
            rel="noopener noreferrer"
            className={ACTION}
            data-testid="link-adgrant-identify-linkedin"
          >
            Identify with LinkedIn
          </a>
        ) : null}
        {showWhatsApp ? (
          <button
            type="button"
            onClick={() => void onWhatsApp()}
            className={showLinkedIn ? ACTION_QUIET : ACTION}
            disabled={whatsappLoading}
            data-testid="button-adgrant-identify-whatsapp"
          >
            {whatsappLoading ? "Opening WhatsApp" : "Identify with WhatsApp"}
          </button>
        ) : null}
      </div>
      {!showLinkedIn && !showWhatsApp ? (
        <p className={`mt-[var(--s3)] ${READ_MUTED}`}>
          Neither identification route is available on this deployment, so a structure cannot be generated yet.
        </p>
      ) : (
        <>
          {showLinkedIn ? (
            <p className={`mt-[var(--s3)] ${READ_MUTED}`}>
              LinkedIn opens in another tab. This page stays here and checks until the sign-in is done. We keep an id
              and the name on the profile. LinkedIn does not endorse this page.
            </p>
          ) : state.linkedin.unavailableLine ? (
            <p className={`mt-[var(--s3)] ${READ_MUTED}`}>{state.linkedin.unavailableLine}</p>
          ) : null}
          {downLine ? <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{downLine}</p> : null}
        </>
      )}
      {whatsapp ? (
        <div className="mt-[var(--s3)]" data-testid="block-adgrant-whatsapp-offer">
          <p className={READ}>{whatsapp.warning}</p>
          <a
            href={whatsapp.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ACTION} mt-[var(--s3)]`}
            data-testid="link-adgrant-identify-whatsapp"
          >
            Open WhatsApp with the message written
          </a>
          {whatsapp.qrSvg ? (
            <div
              className="mt-[var(--s3)] w-36 text-foreground"
              role="img"
              aria-label="QR code that opens WhatsApp with the room address already written"
              dangerouslySetInnerHTML={{ __html: whatsapp.qrSvg }}
            />
          ) : null}
        </div>
      ) : null}
      {showLinkedIn || showWhatsApp ? (
        <p className={`mt-[var(--s3)] ${META_PLAIN}`}>This page checks every few seconds, and when you come back to it.</p>
      ) : null}
    </div>
  );
}
