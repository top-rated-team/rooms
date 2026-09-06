import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, LoaderCircle, Mail, X } from "lucide-react";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY_SM = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-8 px-3`;
const BTN_SECONDARY_SM = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-8 px-3`;
const BTN_GHOST_SM = `${BTN_BASE} border border-transparent min-h-8 px-3`;

/**
 * Copied from the workspace's ShareLinkBar rather than imported from it: the
 * landing page must not pull anything out of the workspace chunk, which paid
 * traffic never downloads. If a third caller ever needs this, it should move to
 * a shared helper instead of being copied a second time.
 */
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

export interface KeepStripProps {
  /** Absolute URL the visitor must keep in order to get back in. */
  url: string;
  /** The email path posts this and never the token. */
  workspaceId: string;
  /** Opens the room. The button calls it, and so does the timer below. */
  onOpen: () => void;
  /** How long the address stays on screen on its own before the room opens. */
  openAfterMs?: number;
}

/**
 * The strip that appears in place of the panel's footer the moment a
 * conversation is kept: the address, a copy button, and somewhere to send it.
 *
 * The room opens on its own a few seconds later, because that is what was asked
 * for — but the timer is cancelled by the first touch, key or focus inside the
 * strip. Somebody halfway through typing their email address must not have the
 * page pulled out from under them.
 */
export function KeepStrip({ url, workspaceId, onOpen, openAfterMs = 4_500 }: KeepStripProps) {
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"sent" | "failed" | null>(null);
  const [held, setHeld] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // The callback is read through a ref so a new identity from the parent does
  // not restart the countdown.
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (held) return;
    const id = window.setTimeout(() => openRef.current(), openAfterMs);
    return () => window.clearTimeout(id);
  }, [held, openAfterMs]);

  const hold = useCallback(() => setHeld(true), []);

  const onCopy = useCallback(() => {
    void copyText(url).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2_000);
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
    <div
      data-testid="strip-keep"
      // Attached to the bottom of the panel: the conversation did not move, it
      // grew an address. It arrives on the page's one existing keyframe, and
      // only for people who have not asked the browser to stop moving things.
      className="motion-safe:animate-fade-in-up rounded-b-lg border border-card-border bg-card px-4 py-3 shadow-sm sm:px-6"
      onPointerDownCapture={hold}
      onKeyDownCapture={hold}
      onFocusCapture={hold}
    >
      <div className="flex items-start gap-2">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" data-testid="text-keep-kept">
            Kept. This conversation now has an address.
          </p>

          <code
            data-testid="text-keep-url"
            className="mt-2 block truncate rounded border border-card-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground"
          >
            {url}
          </code>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCopy} className={BTN_SECONDARY_SM} data-testid="button-keep-copy">
              {copied ? <Check className="text-accent" /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailOpen((open) => !open);
                setResult(null);
              }}
              className={BTN_GHOST_SM}
              data-testid="button-keep-email"
            >
              <Mail />
              Email it to me
            </button>
            <button type="button" onClick={onOpen} className={`${BTN_PRIMARY_SM} ml-auto`} data-testid="button-keep-open">
              Open the room
              <ArrowRight />
            </button>
          </div>

          {emailOpen ? (
            <div className="mt-2 flex items-center gap-2">
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
                data-testid="input-keep-email"
              />
              <button
                type="button"
                onClick={() => void sendEmail()}
                disabled={busy || email.trim().length === 0}
                className={BTN_PRIMARY_SM}
                data-testid="button-keep-send-email"
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

          {result === "sent" ? (
            <p className="mt-2 text-[11px] text-accent" data-testid="text-keep-email-sent">
              On its way — check your inbox.
            </p>
          ) : null}
          {result === "failed" ? (
            <p className="mt-2 text-[11px] text-destructive">That did not send. Copy the link instead.</p>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">This link is your account.</span> Anyone with it can read this
            workspace.
          </p>
          {!held ? (
            <p className="mt-1 text-xs text-muted-foreground">Opening it for you in a moment.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default KeepStrip;
