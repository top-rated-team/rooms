import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Hash, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["google-ads", "meta-ads", "seo", "landing-pages", "reporting"];

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
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-popover-border bg-popover text-popover-foreground shadow-lg"
          data-testid="dialog-new-channel"
        >
          <div className="flex items-start justify-between gap-4 border-b border-card-border px-4 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Add a channel</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                One channel per thing you are working on. Everyone in this workspace, agents included, can see it.
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

          <div className="px-4 py-3">
            <label htmlFor="channel-name" className="mb-1 block text-xs font-medium text-muted-foreground">
              Name
            </label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 focus-within:ring-1 focus-within:ring-ring">
              <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
                data-testid="input-channel-name"
              />
            </div>
            <p className={cn("mt-1 text-[11px]", slug ? "text-muted-foreground" : "text-transparent")}>
              Will appear as #{slug || "name"}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setName(suggestion)}
                  className="hover-elevate active-elevate-2 rounded-md border border-card-border bg-card px-2 py-1 text-[11px] text-muted-foreground"
                >
                  #{suggestion}
                </button>
              ))}
            </div>

            <label htmlFor="channel-purpose" className="mb-1 mt-4 block text-xs font-medium text-muted-foreground">
              What is it for? (optional)
            </label>
            <input
              id="channel-purpose"
              value={purpose}
              maxLength={300}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Scaling the search campaigns before Q4"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-channel-purpose"
            />

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
                disabled={busy || slug.length === 0}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2"
                data-testid="button-create-channel"
              >
                {busy ? <LoaderCircle className="animate-spin" /> : null}
                Create channel
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default NewChannelDialog;
