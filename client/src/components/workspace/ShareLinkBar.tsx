import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, LoaderCircle, Mail, X } from "lucide-react";
import { cn } from "@/lib/utils";

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export interface ShareLinkBarProps {
  url: string;
  workspaceId: string;
  defaultEmail?: string | null;
}

export function ShareLinkBar({ url, workspaceId, defaultEmail }: ShareLinkBarProps) {
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"sent" | "failed" | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = useCallback(() => {
    void copyText(url).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2_000);
    });
  }, [url]);

  const sendEmail = useCallback(async () => {
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setResult(null);
    try {
      // The token never leaves this tab: the server rebuilds the link from the
      // workspace id, so a lead webhook can never carry the credential.
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          workspaceId,
          email: address,
          intent: "workspace-link",
          message: "Email me the link back to my workspace.",
        }),
      });
      setResult(res.ok ? "sent" : "failed");
      if (res.ok) setEmailOpen(false);
    } catch {
      setResult("failed");
    } finally {
      setBusy(false);
    }
  }, [email, workspaceId]);

  return (
    <div className="shrink-0 border-b border-card-border bg-card" data-testid="bar-share-link">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs sm:px-4">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">This link is your account.</span> Anyone with it can read this
          workspace.
        </p>

        <code className="hidden max-w-[22rem] truncate rounded border border-card-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground lg:inline">
          {url}
        </code>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-secondary text-secondary-foreground border border-secondary-border min-h-8 px-3"
            data-testid="button-copy-link"
          >
            {copied ? <Check className="text-accent" /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEmailOpen((v) => !v);
              setResult(null);
            }}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-transparent min-h-8 px-3"
            data-testid="button-email-link"
          >
            <Mail />
            Email it to me
          </button>
        </div>

        {result === "sent" ? (
          <span className="w-full text-[11px] text-accent sm:w-auto" data-testid="text-email-sent">
            On its way — check your inbox.
          </span>
        ) : null}
        {result === "failed" ? (
          <span className="w-full text-[11px] text-destructive sm:w-auto">
            That did not send. Copy the link instead.
          </span>
        ) : null}
      </div>

      {emailOpen ? (
        <div className="flex items-center gap-2 border-t border-card-border px-3 py-2 sm:px-4">
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void sendEmail();
              }
              if (event.key === "Escape") setEmailOpen(false);
            }}
            placeholder="you@company.com"
            aria-label="Email address"
            className="min-w-0 max-w-sm flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="input-email-link"
          />
          <button
            type="button"
            onClick={() => void sendEmail()}
            disabled={busy || email.trim().length === 0}
            className={cn(
              "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-8 px-3",
            )}
            data-testid="button-send-email-link"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            Send it
          </button>
          <button
            type="button"
            onClick={() => setEmailOpen(false)}
            className="hover-elevate active-elevate-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cancel</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ShareLinkBar;
