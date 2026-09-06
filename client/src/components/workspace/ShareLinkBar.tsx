import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Mail, Share2 } from "lucide-react";

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
 * and some desktops. Read once when the bar mounts: it cannot change while the
 * page is open.
 *
 * This and mailtoHref are duplicated in the landing page's KeepStrip, for the
 * same reason copyText is: it is one offer in two places, and the landing page
 * must not import anything out of the workspace chunk. The two must stay
 * word-for-word the same — they are the same promise, and they drifted once.
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

export interface ShareLinkBarProps {
  url: string;
  /**
   * No longer read. It fed the "email it to me" request, which this bar does
   * not make any more because nothing in this repository sends a visitor mail.
   * Kept optional so the page can drop it without a change here first.
   */
  workspaceId?: string;
  /** Also no longer read: it pre-filled the address field that has gone. */
  defaultEmail?: string | null;
}

/**
 * The room's own address, at the top of the room: shown in full, and the two
 * ways the browser itself can put it somewhere that survives — the clipboard,
 * and the share sheet or a mail draft the visitor sends themselves.
 *
 * It does not offer to email the address, because no code here can: the mail
 * server/notify.ts sends goes to the owner, and the room token is kept out of
 * every outbound payload on purpose. An offer to send it would be a promise
 * made by a button and kept by nobody.
 */
export function ShareLinkBar({ url }: ShareLinkBarProps) {
  const [copied, setCopied] = useState(false);
  const [shareSheet] = useState(hasShareSheet);
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

  const onShare = useCallback(() => {
    void navigator.share({ title: "Your workspace", url }).catch(() => {
      // A sheet the visitor closed rejects here. There is nothing to report:
      // the address is on screen either way, and Copy link is beside this.
    });
  }, [url]);

  return (
    <div className="shrink-0 border-b border-card-border bg-card" data-testid="bar-share-link">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs sm:px-4">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">This link is your account.</span> Anyone with it can read this
          workspace. We do not email it to you. Save it now — until you do, this tab is the record.
        </p>

        {/* Shown at every width, not just on a wide screen: the phone is where
            the address is hardest to get back, and a long press on a real link
            is the browser's own copy, share and bookmark menu. The click is
            stopped because this link is the page it is on. */}
        <a
          href={url}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
          }}
          data-testid="text-share-url"
          className="w-full min-w-0 break-all rounded border border-card-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground lg:w-auto lg:max-w-[22rem] lg:truncate"
        >
          {url}
        </a>

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
          {shareSheet ? (
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-transparent min-h-8 px-3"
              data-testid="button-share-link"
            >
              <Share2 />
              Save or send it
            </button>
          ) : (
            <a
              href={mailtoHref(url)}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-transparent min-h-8 px-3"
              data-testid="button-share-link"
            >
              <Mail />
              Email it to yourself
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareLinkBar;
