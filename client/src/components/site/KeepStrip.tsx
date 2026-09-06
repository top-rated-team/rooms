import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Mail, Share2 } from "lucide-react";

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

/**
 * Whether this browser has a share sheet of its own — every mainstream phone,
 * and some desktops. Read once when the strip mounts: it cannot change while
 * the page is open.
 *
 * The same two helpers are in ShareLinkBar, for the same reason copyText is:
 * one offer in two places, and the landing page must not import the workspace.
 */
function hasShareSheet(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * A pre-filled draft in the visitor's own mail client, for browsers with no
 * share sheet. Nothing is sent from here: they press send, from their own
 * account, and the message lands in their own Sent folder. That is the whole
 * difference between this and the button it replaces, which said the mail was
 * on its way and sent nothing.
 */
function mailtoHref(url: string): string {
  const subject = "The link back to my workspace";
  const body = `${url}\n\nThis link is the account. Anyone with it can read the workspace.`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface KeepStripProps {
  /** Absolute URL the visitor must keep in order to get back in. */
  url: string;
  /**
   * No longer read. It fed the "email it to me" request, which this strip does
   * not make any more because nothing in this repository sends a visitor mail.
   * Kept optional so the callers can drop it without a change here first.
   */
  workspaceId?: string;
  /** Opens the room. The button calls it, and so does the timer below. */
  onOpen: () => void;
  /** How long the address stays on screen on its own before the room opens. */
  openAfterMs?: number;
}

/**
 * The strip that appears in place of the panel's footer the moment a
 * conversation is kept: the address, in full and selectable, and the two ways
 * the browser itself can put it somewhere that survives — the clipboard, and
 * the share sheet or a mail draft the visitor sends themselves.
 *
 * It does not offer to email the address, because no code here can: the mail
 * that server/notify.ts sends goes to the owner, and the room token is kept out
 * of every outbound payload on purpose. An offer to send it would be a promise
 * made by a button and kept by nobody.
 *
 * The room opens on its own a few seconds later, because that is what was asked
 * for — but the timer is cancelled by the first touch, key or focus inside the
 * strip. Somebody halfway through reading the address must not have the page
 * pulled out from under them.
 */
export function KeepStrip({ url, onOpen, openAfterMs = 4_500 }: KeepStripProps) {
  const [copied, setCopied] = useState(false);
  const [held, setHeld] = useState(false);
  const [shareSheet] = useState(hasShareSheet);
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

  const onShare = useCallback(() => {
    void navigator.share({ title: "Your workspace", url }).catch(() => {
      // A sheet the visitor closed rejects here. There is nothing to report:
      // the address is on screen either way, and Copy link is beside this.
    });
  }, [url]);

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

          {/* A real link, and whole rather than truncated. On a phone a long
              press on it is the browser's own menu — copy, share, bookmark —
              which is the one route to keeping it that needs nothing from us.
              A plain click opens the room the same way the button does. */}
          <a
            href={url}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onOpen();
            }}
            data-testid="text-keep-url"
            className="mt-2 block break-all rounded border border-card-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {url}
          </a>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCopy} className={BTN_SECONDARY_SM} data-testid="button-keep-copy">
              {copied ? <Check className="text-accent" /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </button>
            {shareSheet ? (
              <button type="button" onClick={onShare} className={BTN_GHOST_SM} data-testid="button-keep-share">
                <Share2 />
                Save or send it
              </button>
            ) : (
              <a href={mailtoHref(url)} className={BTN_GHOST_SM} data-testid="button-keep-share">
                <Mail />
                Email it to yourself
              </a>
            )}
            <button type="button" onClick={onOpen} className={`${BTN_PRIMARY_SM} ml-auto`} data-testid="button-keep-open">
              Open the room
              <ArrowRight />
            </button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">This link is your account.</span> Anyone with it can read this
            workspace.
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="text-keep-no-email">
            We do not email it to you. Save it now — until you do, this tab is the record.
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
