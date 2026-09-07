import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BOOK_A_CALL_URL, EXPERTS, type ExpertDef } from "@shared/roster";
import { badgeForKey } from "@/components/workspace/MemberRail";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, FOCUS, LABEL, LINK, META, READ } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * HIRING A REAL PERSON IN TWO CLICKS
 *
 * Click one is a button where the need appeared — under the message in which an
 * agent said what it cannot finish. Click two is this sheet: the person is
 * already chosen, the brief is already written from the thread, and the only
 * button asks for a quote.
 *
 * This sheet deliberately does not ask for a company name, a budget, a phone
 * number, a team size, how you heard about us, or an email address. The room
 * already has the door, the question and the whole transcript; whatever it
 * knows is sent with the request rather than typed again. Asking twice is what
 * loses the hire.
 *
 * Nobody is charged here. A name and a way to be invoiced is asked for once, at
 * the moment a quote is accepted, and not before.
 *
 * ON THE SHAPE. The room has no cards, and a modal is the one place that rule
 * has to bend: something floating over prose must be bounded or it cannot be
 * read. So it is a sheet against the edge of the window rather than a card in
 * the middle of it — the room's ground, one hairline where it meets the page,
 * no shadow and no rounded corner. The two clicks are unchanged, which is the
 * only part of this that is load-bearing.
 * ------------------------------------------------------------------------- */

const DEFAULT_EXPERT = EXPERTS.find((e) => e.leadsConversionTracking) ?? EXPERTS[0];

/** What the room already knows, so this sheet can open with the answer in it. */
export interface HireOffer {
  /** Who to offer. Defaults to the person who leads this kind of work. */
  memberKey?: string;
  /** One sentence saying why this person and not another. Shown as written. */
  reason?: string;
  /** The brief, lifted from the thread. Editable, never demanded blank. */
  brief?: string;
  /** Read out of the thread — used with the rate to show the estimate. */
  hours?: number;
  /** The expert's own hourly rate and its currency. They set it, not us. */
  rate?: number;
  currency?: string;
  /** "Free from Thursday" — as the room knows it, never a guess. */
  availability?: string;
  /** Member keys the door makes available. Absent means the whole roster. */
  pool?: string[];
}

function firstNameOf(expert: ExpertDef): string {
  return expert.name.split(/\s+/)[0] ?? expert.name;
}

/**
 * The room's own address, read off the page it is already on. It is the answer
 * to "how do I get back to this conversation" and there is no other one: the
 * link is the whole account.
 */
function roomAddress(): string | null {
  if (typeof window === "undefined") return null;
  return `${window.location.origin}${window.location.pathname}`;
}

function moneyLine(offer: HireOffer | undefined): string | null {
  if (!offer?.rate || !offer.currency) return null;
  return `${offer.currency} ${offer.rate} an hour — their own rate.`;
}

function estimateOf(offer: HireOffer | undefined): string | null {
  if (!offer?.rate || !offer.hours || !offer.currency) return null;
  return `${offer.currency} ${Math.round(offer.rate * offer.hours)}`;
}

export interface InviteExpertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when the person has actually been pinged. */
  onInvite: (input: { memberKey: string; note?: string; email?: string; name?: string }) => Promise<boolean>;
  defaultEmail?: string | null;
  defaultName?: string | null;
  /** What the room knows about this particular need. */
  offer?: HireOffer;
}

export function InviteExpertDialog({
  open,
  onOpenChange,
  onInvite,
  defaultEmail,
  defaultName,
  offer,
}: InviteExpertDialogProps) {
  const [memberKey, setMemberKey] = useState(offer?.memberKey ?? DEFAULT_EXPERT.memberKey);
  const [brief, setBrief] = useState(offer?.brief ?? "");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const pool = useMemo(
    () => (offer?.pool ? EXPERTS.filter((e) => offer.pool?.includes(e.memberKey)) : EXPERTS),
    [offer?.pool],
  );

  const expert = useMemo(
    () => pool.find((e) => e.memberKey === memberKey) ?? EXPERTS.find((e) => e.memberKey === memberKey) ?? DEFAULT_EXPERT,
    [memberKey, pool],
  );

  useEffect(() => {
    if (!open) return;
    // Reopening starts from what the room knows, not from the last attempt.
    setSent(false);
    setFailed(null);
    setPicking(false);
    setMemberKey(offer?.memberKey ?? DEFAULT_EXPERT.memberKey);
    setBrief(offer?.brief ?? "");
  }, [open, offer?.memberKey, offer?.brief]);

  const submit = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    const ok = await onInvite({
      memberKey,
      note: brief.trim() || undefined,
      // Sent, never asked for: if the room has these already, typing them again
      // is the step that loses people.
      email: defaultEmail?.trim() || undefined,
      name: defaultName?.trim() || undefined,
    });
    setBusy(false);
    if (ok) setSent(true);
    // Deliberately not "nothing was sent": a reply that got lost on the way
    // back looks identical from here. Asking twice is cheap; assuming it
    // arrived is not.
    else setFailed("That did not come back. Send it again — a duplicate is easy for us to sort out, a request that never arrived is not.");
  }, [brief, defaultEmail, defaultName, memberKey, onInvite]);

  const first = firstNameOf(expert);
  const address = roomAddress();
  const estimate = estimateOf(offer);
  const rateLine = moneyLine(offer);
  const reason =
    offer?.reason ??
    (expert.leadsConversionTracking ? `Offered because this room is about conversion tracking, and ${first} leads that work.` : null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-dvh w-[calc(100vw-2rem)] max-w-md flex-col border-l border-border bg-background"
          data-testid="dialog-invite-expert"
        >
          <div className="flex shrink-0 items-baseline justify-between gap-4 px-6 pt-6">
            <Dialog.Title className={cn(CHROME, "font-medium")}>Get a person on this</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={ACTION_QUIET}>
                Close
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={cn(META, "shrink-0 px-6 pt-2 text-muted-foreground")}>
            Nothing is asked for twice. The brief below is lifted from this thread, and the answer comes back here.
          </Dialog.Description>

          {sent ? (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6" data-testid="state-invite-sent">
              <p className={cn(READ, "text-foreground")}>Asked of {expert.name}, and written down.</p>
              <p className={cn(READ, "mt-3 text-muted-foreground")}>
                {expert.name} — {expert.title} — answers in this room, with the brief attached, within one working day.
              </p>
              {address ? (
                <p className={cn(META, "mt-4 text-muted-foreground")} data-testid="text-invite-room-address">
                  This room is the address, and the only way back into it. Keep it:{" "}
                  <span className="break-all font-mono text-foreground">{address}</span>
                </p>
              ) : null}
              <p className={cn(META, "mt-3 text-muted-foreground")}>
                If it cannot wait a day,{" "}
                <a href={BOOK_A_CALL_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                  book a call
                </a>{" "}
                — it reaches the same people.
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={cn(ACTION, "mt-6")}
                data-testid="button-back-to-room"
              >
                Back to the room
              </button>
            </div>
          ) : picking ? (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6" data-testid="state-invite-pool">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className={LABEL}>Someone else on this work</h3>
                <button type="button" onClick={() => setPicking(false)} className={ACTION_QUIET}>
                  Back
                </button>
              </div>
              <ul className="mt-2">
                {pool.map((candidate) => {
                  const offered = candidate.memberKey === memberKey;
                  return (
                    <li key={candidate.memberKey} className="border-t border-border last:border-b">
                      <button
                        type="button"
                        onClick={() => {
                          setMemberKey(candidate.memberKey);
                          setPicking(false);
                        }}
                        className={cn(FOCUS, "hover-elevate active-elevate-2 block w-full py-3 text-left")}
                        data-testid={`button-pick-${candidate.memberKey}`}
                      >
                        <span className="flex flex-wrap items-baseline gap-x-3">
                          <span className={cn(CHROME, "font-medium")}>{candidate.name}</span>
                          <span className={LABEL}>{badgeForKey(candidate.memberKey, "expert")}</span>
                          {offered ? <span className={cn(META, "text-foreground")}>Offered now</span> : null}
                        </span>
                        <span className={cn(META, "mt-1 block text-muted-foreground")}>{candidate.title}</span>
                        <span className={cn(META, "mt-0.5 block text-muted-foreground")}>
                          {candidate.specialties.join(" · ")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6" data-testid="state-invite-offer">
              <div className="flex items-baseline justify-between gap-3" data-testid={`offered-${expert.memberKey}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className={cn(CHROME, "font-medium")}>{expert.name}</span>
                    <span className={LABEL}>{badgeForKey(expert.memberKey, "expert")}</span>
                  </div>
                  <p className={cn(META, "mt-1 text-muted-foreground")}>{expert.specialties.join(" · ")}</p>
                  {offer?.availability ? (
                    <p className={cn(META, "mt-0.5 text-muted-foreground")}>{offer.availability}</p>
                  ) : null}
                  {rateLine ? <p className={cn(META, "mt-0.5 text-muted-foreground")}>{rateLine}</p> : null}
                  {reason ? <p className={cn(META, "mt-1 text-muted-foreground")}>{reason}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className={cn(ACTION_QUIET, "shrink-0")}
                  data-testid="button-someone-else"
                >
                  Someone else
                </button>
              </div>

              <div className="mt-6">
                <label htmlFor="invite-brief" className={cn(LABEL, "block")}>
                  {offer?.brief ? `What ${first} is being asked to do — edit if wrong` : `What ${first} is being asked to do`}
                </label>
                <textarea
                  id="invite-brief"
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  rows={8}
                  placeholder="Shopify checkout, we need purchase events in ChatGPT Ads and GA4 to agree."
                  className={cn(
                    READ,
                    "scrollbar-thin mt-2 max-h-[46vh] w-full resize-y border-b border-foreground bg-transparent pb-2 outline-none placeholder:text-muted-foreground",
                  )}
                  data-testid="input-invite-brief"
                />
              </div>

              {failed ? (
                <div className="mt-4" role="alert">
                  <p className={cn(CHROME, "text-destructive")}>{failed}</p>
                  <p className={cn(META, "mt-1.5 text-muted-foreground")}>
                    Or{" "}
                    <a href={BOOK_A_CALL_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                      book a call
                    </a>{" "}
                    and bring this room&apos;s link with you.
                  </p>
                </div>
              ) : null}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className={ACTION}
                  data-testid="button-submit-invite"
                >
                  {busy ? "Asking" : estimate ? `Ask ${first} for a quote — about ${estimate}` : `Ask ${first} for a quote`}
                </button>
                <p className={cn(META, "mt-3 text-muted-foreground")}>
                  No account and no card at this step. The answer comes back in this thread, and if the estimate is
                  wrong {first} says so before anybody owes anything.
                </p>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default InviteExpertDialog;
