import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, LoaderCircle, X } from "lucide-react";
import { EXPERTS } from "@shared/roster";
import { Avatar, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";

const DEFAULT_EXPERT = EXPERTS.find((e) => e.leadsConversionTracking) ?? EXPERTS[0];

export interface InviteExpertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when the person has actually been pinged. */
  onInvite: (input: { memberKey: string; note?: string; email?: string; name?: string }) => Promise<boolean>;
  defaultEmail?: string | null;
  defaultName?: string | null;
}

export function InviteExpertDialog({ open, onOpenChange, onInvite, defaultEmail, defaultName }: InviteExpertDialogProps) {
  const [memberKey, setMemberKey] = useState(DEFAULT_EXPERT.memberKey);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setFailed(null);
    setEmail(defaultEmail ?? "");
    setName(defaultName ?? "");
  }, [open, defaultEmail, defaultName]);

  const submit = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    const ok = await onInvite({
      memberKey,
      note: note.trim() || undefined,
      email: email.trim() || undefined,
      name: name.trim() || undefined,
    });
    setBusy(false);
    if (ok) {
      setSent(true);
      setNote("");
    } else {
      setFailed("That did not go through. Try again, or book a call instead.");
    }
  }, [email, memberKey, name, note, onInvite]);

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
              <Dialog.Title className="text-base font-semibold">Bring in a human</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                This pings a real person on the team. They reply in this workspace, so keep the link — it is how you get
                back to the conversation.
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
            <div className="px-4 py-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Check className="h-4 w-4 text-accent" />
                Request sent.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                They have the context from this workspace and will answer here. Typical reply time is within one working
                day.
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mt-4 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2"
              >
                Back to the workspace
              </button>
            </div>
          ) : (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">Who should we ping?</legend>
                <div className="space-y-2">
                  {EXPERTS.map((expert) => {
                    const active = expert.memberKey === memberKey;
                    return (
                      <label
                        key={expert.memberKey}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-md border p-3",
                          active ? "border-primary bg-primary/5" : "border-card-border hover-elevate",
                        )}
                      >
                        <input
                          type="radio"
                          name="expert"
                          value={expert.memberKey}
                          checked={active}
                          onChange={() => setMemberKey(expert.memberKey)}
                          className="sr-only"
                        />
                        <Avatar initials={expert.initials} tone={toneFor(expert.memberKey, "expert")} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium">{expert.name}</span>
                            {expert.leadsConversionTracking ? (
                              <span className="rounded border border-accent/30 bg-accent/10 px-1 py-px text-[10px] font-medium text-accent">
                                Leads conversion tracking
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">{expert.title}</span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {expert.specialties.join(" · ")}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="invite-note" className="mb-1 block text-xs font-medium text-muted-foreground">
                    What do you need? (optional)
                  </label>
                  <textarea
                    id="invite-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Shopify checkout, we need purchase events in ChatGPT Ads and GA4 to agree."
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="input-invite-note"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="invite-name" className="mb-1 block text-xs font-medium text-muted-foreground">
                      Your name (optional)
                    </label>
                    <input
                      id="invite-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      data-testid="input-invite-name"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-muted-foreground">
                      Email (optional)
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="So we can reach you outside this tab"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      data-testid="input-invite-email"
                    />
                  </div>
                </div>
              </div>

              {failed ? <p className="mt-3 text-xs text-destructive">{failed}</p> : null}

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-card-border pt-3">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover-elevate active-elevate-2 border border-transparent min-h-8 px-3"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2"
                  data-testid="button-submit-invite"
                >
                  {busy ? <LoaderCircle className="animate-spin" /> : null}
                  Send the request
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default InviteExpertDialog;
