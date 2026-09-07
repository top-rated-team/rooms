import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, FOCUS, LABEL, META } from "@/components/workspace/room-style";

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
  /**
   * Whether to print the sentence explaining what the link is. True for as long
   * as the arrival panel is up, which is the minute somebody is deciding
   * whether to keep the address; after that the address stays and the
   * explanation stops taking two lines off the top of every screen for good.
   */
  verbose?: boolean;
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
 *
 * It used to be a bordered card at the top of the room. It is a line now, and
 * it says the same thing.
 */
export function ShareLinkBar({ url, verbose = true }: ShareLinkBarProps) {
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
    void navigator.share({ title: "Your room", url }).catch(() => {
      // A sheet the visitor closed rejects here. There is nothing to report:
      // the address is on screen either way, and Copy is beside this.
    });
  }, [url]);

  return (
    <div className="shrink-0 border-b border-border px-5 py-3 sm:px-8" data-testid="bar-share-link">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <span className={LABEL}>The address</span>

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
          className={cn(META, FOCUS, "min-w-0 max-w-full break-all font-mono text-muted-foreground lg:max-w-[26rem] lg:truncate")}
        >
          {url}
        </a>

        <div className="ml-auto flex items-baseline gap-x-5">
          <button type="button" onClick={onCopy} className={ACTION_QUIET} data-testid="button-copy-link">
            {copied ? "Copied" : "Copy"}
          </button>
          {shareSheet ? (
            <button type="button" onClick={onShare} className={ACTION_QUIET} data-testid="button-share-link">
              Save or send it
            </button>
          ) : (
            <a href={mailtoHref(url)} className={ACTION_QUIET} data-testid="button-share-link">
              Email it to yourself
            </a>
          )}
        </div>
      </div>

      {verbose ? (
        <p className={cn(META, "mt-1.5 text-muted-foreground")}>
          This link is the account. Anyone with it can read this room. We do not email it to you — until you save it,
          this tab is the record.
        </p>
      ) : null}
    </div>
  );
}

export default ShareLinkBar;
