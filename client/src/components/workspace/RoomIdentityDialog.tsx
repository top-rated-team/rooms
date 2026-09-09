import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { RoomBindingProvider, RoomBindingState, RoomClaimState } from "@shared/api";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, FOCUS, LABEL, META, READ } from "@/components/workspace/room-style";

/**
 * The popup a newly created room shows to offer the claim. login-create-room
 * opens it from the site; this file does not know how.
 *
 * Three routes, and they are not the same fact:
 *   - LinkedIn, official Sign In with LinkedIn. That is a proof of who they are.
 *   - WhatsApp, a wa.me link that messages us. That is a proof they reached us.
 *   - A number typed by hand. That is a note. The room must not print it the
 *     same way as a number that messaged us.
 *
 * Binding is not a gate. Closing this leaves the room as it was.
 */

export interface RoomIdentityDialogProps {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TITLE_UNBOUND = "This room can be yours";
const TITLE_BOUND = "This room";

const PURPOSE =
  "Bind it to you so we know it is yours, and so the address lands in a place you will still have next week.";

const BEARER = "The address is still the whole credential: anyone who has it can still open the room.";

const LINKEDIN_LINE =
  "This opens LinkedIn's own sign-in. We keep an id and the name on your profile. LinkedIn does not endorse this room or this company.";

const NOTE_LINE =
  "We do not know a person's WhatsApp, so a number can be added by hand. That is a note on the room, not a proof. A number that messages us is a proof. The two are not the same.";

interface WhatsAppOffer {
  url: string;
  qrSvg: string | null;
  warning: string;
}

function providerLabel(provider: RoomBindingProvider): string {
  if (provider === "linkedin") return "LinkedIn";
  if (provider === "whatsapp") return "WhatsApp";
  return "them";
}

export function RoomIdentityDialog({ token, open, onOpenChange }: RoomIdentityDialogProps) {
  const [claim, setClaim] = useState<RoomClaimState | null>(null);
  const [identity, setIdentity] = useState<RoomBindingState | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsAppOffer | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [nextClaim, nextIdentity] = await Promise.all([
          apiRequest<RoomClaimState>("GET", `/api/workspaces/${encodeURIComponent(token)}/claim`, undefined, { signal }),
          apiRequest<RoomBindingState>("GET", `/api/workspaces/${encodeURIComponent(token)}/identity`, undefined, {
            signal,
          }),
        ]);
        setClaim(nextClaim);
        setIdentity(nextIdentity);
        setNote(nextClaim.whatsappNote ?? "");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    },
    [token],
  );

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    void load(ac.signal);
    const id = window.setInterval(() => void load(), 8_000);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, [load, open]);

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

  const onSaveNote = useCallback(async () => {
    const value = note.trim();
    if (!value) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const next = await apiRequest<RoomClaimState>("POST", `/api/workspaces/${encodeURIComponent(token)}/claim`, {
        number: value,
      });
      setClaim(next);
      setNote(next.whatsappNote ?? value);
    } catch (error) {
      const line =
        error instanceof ApiError && error.message.trim()
          ? error.message.trim()
          : "That number was not saved. Try again.";
      setNoteError(line);
    } finally {
      setNoteSaving(false);
    }
  }, [note, token]);

  const bound = claim?.bound === true;
  const showLinkedIn = identity?.linkedin.available === true;
  const showWhatsApp = identity?.whatsapp.available === true;
  const linkedinHref = `/api/workspaces/${encodeURIComponent(token)}/identity/linkedin`;
  const whatsappDownLine = !showWhatsApp ? identity?.whatsapp.unavailableLine : whatsappError;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-dvh w-[calc(100vw-2rem)] max-w-md flex-col border-l border-border bg-background"
          data-testid="dialog-room-identity"
        >
          <div className="flex shrink-0 items-baseline justify-between gap-4 px-6 pt-6">
            <Dialog.Title className={cn(CHROME, "font-medium")}>{bound ? TITLE_BOUND : TITLE_UNBOUND}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={ACTION_QUIET}>
                Close
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {bound && claim?.owner ? (
              <p className={cn(READ, "text-foreground")} data-testid="text-claim-bound">
                Marked as {claim.owner.displayName}'s, via {providerLabel(claim.owner.provider)}. {BEARER}
                {claim.owner.provider === "whatsapp" ? " A message from them reached us." : ""}
              </p>
            ) : (
              <>
                <p className={cn(READ, "text-foreground")}>{PURPOSE}</p>
                <p className={cn(META, "mt-2 text-muted-foreground")}>{BEARER}</p>

                <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-3">
                  {showLinkedIn ? (
                    <a href={linkedinHref} className={ACTION} data-testid="button-claim-linkedin">
                      Bind with LinkedIn
                    </a>
                  ) : null}
                  {showWhatsApp ? (
                    <button
                      type="button"
                      onClick={() => void onWhatsApp()}
                      className={showLinkedIn ? ACTION_QUIET : ACTION}
                      disabled={whatsappLoading}
                      data-testid="button-claim-whatsapp"
                    >
                      {whatsappLoading ? "Opening WhatsApp" : "Bind with WhatsApp"}
                    </button>
                  ) : null}
                </div>

                {showLinkedIn ? (
                  <p className={cn(META, "mt-3 text-muted-foreground")}>{LINKEDIN_LINE}</p>
                ) : identity?.linkedin.unavailableLine ? (
                  <p className={cn(META, "mt-3 text-muted-foreground")}>{identity.linkedin.unavailableLine}</p>
                ) : null}

                {whatsappDownLine ? (
                  <p className={cn(META, "mt-2 text-muted-foreground")}>{whatsappDownLine}</p>
                ) : null}

                {whatsapp ? (
                  <div className="mt-4" data-testid="claim-whatsapp-offer">
                    <p className={cn(CHROME, "text-foreground")}>{whatsapp.warning}</p>
                    <a
                      href={whatsapp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(ACTION, "mt-3")}
                      data-testid="link-claim-whatsapp"
                    >
                      Open WhatsApp with the message written
                    </a>
                    {whatsapp.qrSvg ? (
                      <div
                        className="mt-4 w-36 text-foreground"
                        role="img"
                        aria-label="QR code that opens WhatsApp with the room address already written"
                        dangerouslySetInnerHTML={{ __html: whatsapp.qrSvg }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            <div className="mt-10 border-t border-border pt-6">
              <p className={LABEL}>A number by hand</p>
              {claim?.whatsappNote ? (
                <p className={cn(READ, "mt-2 text-foreground")} data-testid="text-claim-note">
                  Note on this room: {claim.whatsappNote}. Added by hand, not verified — we have not had a message
                  from it.
                </p>
              ) : (
                <p className={cn(META, "mt-2 text-muted-foreground")}>{NOTE_LINE}</p>
              )}
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onSaveNote();
                }}
              >
                <label className={cn(META, "text-muted-foreground")} htmlFor="claim-whatsapp-note">
                  WhatsApp number (a note)
                </label>
                <input
                  id="claim-whatsapp-note"
                  type="text"
                  inputMode="tel"
                  autoComplete="tel"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={40}
                  className={cn(
                    CHROME,
                    FOCUS,
                    "mt-1.5 w-full border-b border-border bg-transparent pb-1 text-foreground",
                  )}
                  data-testid="input-claim-note"
                />
                <button
                  type="submit"
                  className={cn(ACTION, "mt-4")}
                  disabled={noteSaving || !note.trim()}
                  data-testid="button-claim-note"
                >
                  {noteSaving ? "Saving" : "Save as a note"}
                </button>
              </form>
              {noteError ? <p className={cn(META, "mt-2 text-muted-foreground")}>{noteError}</p> : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default RoomIdentityDialog;
