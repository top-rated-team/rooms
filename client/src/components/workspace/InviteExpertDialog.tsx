import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, LoaderCircle, X } from "lucide-react";
import { BOOK_A_CALL_URL, EXPERTS, type ExpertDef } from "@shared/roster";
import { Avatar, toneFor } from "@/components/workspace/Avatar";
import { badgeForKey } from "@/components/workspace/MemberRail";
import { cn } from "@/lib/utils";

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

const PRIMARY_BUTTON =
  "inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2";

const QUIET_BUTTON =
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover-elevate active-elevate-2 border border-transparent min-h-8 px-2";

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
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-popover-border bg-popover text-popover-foreground shadow-lg"
          data-testid="dialog-invite-expert"
        >
          <div className="flex items-start justify-between gap-4 border-b border-card-border px-4 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Get a person on this</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Nothing is asked for twice. The brief below is lifted from this thread, and the answer comes back here.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="hover-elevate active-elevate-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </div>

          {sent ? (
            <div className="px-4 py-6" data-testid="state-invite-sent">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Check className="h-4 w-4 text-accent" />
                Asked of {expert.name}, and written down.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {expert.name} — {expert.title} — answers in this room, with the brief attached, within one working day.
                Nothing has been agreed and nobody has been charged.
              </p>
              {address ? (
                <p className="mt-3 text-xs text-muted-foreground" data-testid="text-invite-room-address">
                  This room is the address, and the only way back into it. Keep it:{" "}
                  <code className="break-all rounded border border-card-border bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    {address}
                  </code>
                </p>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">
                If it cannot wait a day,{" "}
                <a
                  href={BOOK_A_CALL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  book a call
                </a>{" "}
                — it reaches the same people.
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={cn(PRIMARY_BUTTON, "mt-4 w-auto")}
                data-testid="button-back-to-room"
              >
                Back to the room
              </button>
            </div>
          ) : picking ? (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="state-invite-pool">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">Someone else on this work</h3>
                <button type="button" onClick={() => setPicking(false)} className={QUIET_BUTTON}>
                  Back
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {pool.map((candidate) => {
                  const offered = candidate.memberKey === memberKey;
                  return (
                    <li key={candidate.memberKey}>
                      <button
                        type="button"
                        onClick={() => {
                          setMemberKey(candidate.memberKey);
                          setPicking(false);
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-md border p-3 text-left",
                          offered ? "border-primary bg-primary/5" : "border-card-border hover-elevate active-elevate-2",
                        )}
                        data-testid={`button-pick-${candidate.memberKey}`}
                      >
                        <Avatar initials={candidate.initials} tone={toneFor(candidate.memberKey, "expert")} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium">{candidate.name}</span>
                            <span className="rounded border border-card-border bg-muted px-1 text-[10px] font-medium leading-4 text-muted-foreground">
                              {badgeForKey(candidate.memberKey, "expert")}
                            </span>
                            {offered ? <span className="text-[11px] text-primary">Offered now</span> : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">{candidate.title}</span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {candidate.specialties.join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="state-invite-offer">
              <div className="flex items-start gap-3" data-testid={`offered-${expert.memberKey}`}>
                <Avatar initials={expert.initials} tone={toneFor(expert.memberKey, "expert")} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">{expert.name}</span>
                    <span className="rounded border border-card-border bg-muted px-1 text-[10px] font-medium leading-4 text-muted-foreground">
                      {badgeForKey(expert.memberKey, "expert")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{expert.specialties.join(" · ")}</p>
                  {offer?.availability ? <p className="text-xs text-muted-foreground">{offer.availability}</p> : null}
                  {rateLine ? <p className="text-xs text-muted-foreground">{rateLine}</p> : null}
                  {reason ? <p className="mt-1 text-[11px] text-muted-foreground">{reason}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className={cn(QUIET_BUTTON, "shrink-0 text-muted-foreground")}
                  data-testid="button-someone-else"
                >
                  Someone else
                </button>
              </div>

              <div className="mt-4">
                <label htmlFor="invite-brief" className="mb-1 block text-xs font-medium text-muted-foreground">
                  {offer?.brief
                    ? `What ${first} is being asked to do — lifted from this thread, edit if wrong`
                    : `What ${first} is being asked to do`}
                </label>
                <textarea
                  id="invite-brief"
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  rows={4}
                  placeholder="Shopify checkout, we need purchase events in ChatGPT Ads and GA4 to agree."
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="input-invite-brief"
                />
              </div>

              {failed ? (
                <div className="mt-3 text-xs text-destructive" role="alert">
                  <p>{failed}</p>
                  <p className="mt-1 text-muted-foreground">
                    Or{" "}
                    <a
                      href={BOOK_A_CALL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      book a call
                    </a>{" "}
                    and bring this room's link with you.
                  </p>
                </div>
              ) : null}

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className={PRIMARY_BUTTON}
                  data-testid="button-submit-invite"
                >
                  {busy ? <LoaderCircle className="animate-spin" /> : null}
                  {estimate ? `Ask ${first} for a quote — about ${estimate}` : `Ask ${first} for a quote`}
                </button>
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
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
