import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, LABEL, META, READ } from "@/components/workspace/room-style";

const SUGGESTIONS = ["google-ads", "ad-grants", "landing-pages", "reporting"];

/** Display-only preview of what the server will slugify the name to. */
function slugPreview(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface NewChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; purpose?: string }) => Promise<boolean>;
}

/** The same edge sheet as the hire, for the same reason — see InviteExpertDialog. */
export function NewChannelDialog({ open, onOpenChange, onCreate }: NewChannelDialogProps) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPurpose("");
    setFailed(null);
  }, [open]);

  const slug = slugPreview(name);

  const submit = useCallback(async () => {
    if (!slug) return;
    setBusy(true);
    setFailed(null);
    const ok = await onCreate({ name: slug, purpose: purpose.trim() || undefined });
    setBusy(false);
    if (ok) onOpenChange(false);
    else setFailed("That channel could not be created. Try a different name.");
  }, [onCreate, onOpenChange, purpose, slug]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-dvh w-[calc(100vw-2rem)] max-w-md flex-col border-l border-border bg-background"
          data-testid="dialog-new-channel"
        >
          <div className="flex shrink-0 items-baseline justify-between gap-4 px-6 pt-6">
            <Dialog.Title className={cn(CHROME, "font-medium")}>Add a channel</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={ACTION_QUIET}>
                Close
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={cn(META, "shrink-0 px-6 pt-2 text-muted-foreground")}>
            One channel per thing you are working on. Everyone in this room, agents included, can read it.
          </Dialog.Description>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <label htmlFor="channel-name" className={cn(LABEL, "block")}>
              Name
            </label>
            <input
              id="channel-name"
              autoFocus
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="google-ads"
              className={cn(
                READ,
                "mt-2 w-full border-b border-foreground bg-transparent pb-2 outline-none placeholder:text-muted-foreground",
              )}
              data-testid="input-channel-name"
            />
            <p className={cn(META, "mt-2", slug ? "text-muted-foreground" : "text-transparent")}>
              Will appear as #{slug || "name"}
            </p>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setName(suggestion)}
                  className={cn(ACTION_QUIET, "normal-case tracking-normal")}
                >
                  #{suggestion}
                </button>
              ))}
            </div>

            <label htmlFor="channel-purpose" className={cn(LABEL, "mt-8 block")}>
              What is it for
            </label>
            <input
              id="channel-purpose"
              value={purpose}
              maxLength={300}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Scaling the search campaigns before Q4"
              className={cn(
                READ,
                "mt-2 w-full border-b border-border bg-transparent pb-2 outline-none placeholder:text-muted-foreground",
              )}
              data-testid="input-channel-purpose"
            />

            {failed ? <p className={cn(CHROME, "mt-4 text-destructive")}>{failed}</p> : null}

            <div className="mt-8 flex items-baseline gap-6">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || slug.length === 0}
                className={ACTION}
                data-testid="button-create-channel"
              >
                {busy ? "Adding" : "Add the channel"}
              </button>
              <Dialog.Close asChild>
                <button type="button" className={ACTION_QUIET}>
                  Cancel
                </button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default NewChannelDialog;
