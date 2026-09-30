import { useEffect, useRef, useState } from "react";

import { ACTION, ACTION_QUIET, DISPLAY, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { useTheme } from "@/hooks/use-theme";
import type { AdminBookingWidgetResponse } from "@shared/api";
import { widgetRecipient } from "@shared/booking-link";
import { WIDGET_MAX_DAYS, WIDGET_MAX_TIMES_PER_DAY, type BookingWidgetShow } from "@shared/booking-widget";

/**
 * The booking times as a block for an email — /admin/booking-widget.
 *
 * The block is made on the server from the times free right now
 * (shared/booking-widget.ts) and this page shows it and copies it. Two ways
 * out, because mail is written in two kinds of place: a mail client, where a
 * pasted block has to arrive already drawn, and a mail tool that takes HTML,
 * where it has to arrive as source with the tool's merge tag in the links.
 */

type LoadState =
  | { kind: "loading" }
  /* signedIn: a 403 (signed in, not the operator) rather than a 401. */
  | { kind: "refused"; line: string; youAre: string[]; signedIn: boolean }
  | { kind: "failed"; line: string }
  /* forKey: the options and recipient this block was made for. */
  | { kind: "ok"; data: AdminBookingWidgetResponse; forKey: string };

function optionsKey(show: BookingWidgetShow, days: number, perDay: number, recipient: string): string {
  return JSON.stringify([show, days, perDay, recipient.trim()]);
}

const FIELD =
  "w-full border-b border-border bg-transparent pb-[var(--s1)] pt-0 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none";

async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    /* Refused, or not offered: the selection below still works in every browser. */
  }
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const ok = document.execCommand("copy");
  selection?.removeAllRanges();
  holder.remove();
  return ok;
}

async function copyPlain(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-10000px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export default function AdminBookingWidget() {
  const { resolvedTheme, setTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const [show, setShow] = useState<BookingWidgetShow>("times");
  const [days, setDays] = useState(5);
  const [perDay, setPerDay] = useState(6);
  const [recipient, setRecipient] = useState("");
  /* The address box asks the server only once typing stops. */
  const [asked, setAsked] = useState("");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = "Booking times for an email";
    const robots = document.createElement("meta");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "noindex, nofollow, noarchive");
    document.head.appendChild(robots);
    return () => {
      document.title = previous;
      robots.remove();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setAsked(recipient.trim()), 400);
    return () => clearTimeout(timer);
  }, [recipient]);

  useEffect(() => {
    const ac = new AbortController();
    const query = new URLSearchParams({ show, days: String(days), perDay: String(perDay), recipient: asked });
    void (async () => {
      try {
        const res = await fetch(`/api/admin/booking-widget?${query.toString()}`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          signal: ac.signal,
        });
        const payload = (await res.json()) as AdminBookingWidgetResponse & { error?: string; youAre?: string[] };
        if (res.status === 401 || res.status === 403) {
          setState({
            kind: "refused",
            line: payload.error?.trim() || "This page is only for the person who runs this deployment.",
            youAre: Array.isArray(payload.youAre) ? payload.youAre.filter((line) => typeof line === "string") : [],
            signedIn: res.status === 403,
          });
          return;
        }
        if (!res.ok || typeof payload.html !== "string") {
          setState({ kind: "failed", line: payload.error?.trim() || "The booking times could not be loaded." });
          return;
        }
        setState({ kind: "ok", data: payload, forKey: optionsKey(show, days, perDay, asked) });
      } catch (error) {
        if (ac.signal.aborted) return;
        setState({ kind: "failed", line: error instanceof Error ? error.message : "The booking times could not be loaded." });
      }
    })();
    return () => ac.abort();
  }, [show, days, perDay, asked]);

  function flash(label: string) {
    setCopied(label);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2500);
  }

  const typed = widgetRecipient(recipient);
  const recipientNote =
    recipient.trim() === ""
      ? "Empty: the person types their address in the popup."
      : typed.kind === "tag"
        ? "A merge tag: only a mail-merge tool fills it in when it sends."
        : typed.kind === "address"
          ? "One address: use this block for this person only."
          : "That is not an email address or a merge tag, so it would be left out of the links.";

  /* THE BLOCK ON SCREEN MUST BE THE ONE THAT IS COPIED. The address box asks
     the server once typing stops, so for a moment after a keystroke the block
     is the previous one — and a Copy pressed in that moment sent an email
     whose links carried no address, while the page looked finished. Copying
     waits until the block is the one for what is in the boxes. */
  const fresh = state.kind === "ok" && state.forKey === optionsKey(show, days, perDay, recipient);
  const carried = state.kind === "ok" ? state.data.recipient : null;
  const carriedLine =
    !carried
      ? null
      : carried.kind === "address"
        ? `Every link carries ${carried.value}, so the popup opens with it filled in.`
        : carried.kind === "tag"
          ? `Every link carries ${carried.value}. A mail-merge tool (Mailchimp, Brevo, HubSpot, GMass, YAMM and the like) puts each person's address there when it sends. Sent straight from Gmail or Outlook it stays ${carried.value}, and the person types their address in the popup.`
          : "The links carry no address, so the person types theirs in the popup. Put their address in Recipient to have it filled in.";

  return (
    <div className="min-h-screen bg-background text-foreground" data-site-chrome data-testid="page-admin-booking-widget">
      <header className="border-b border-border">
        <div className={`${PAGE} flex items-baseline justify-between gap-[var(--s3)] py-[var(--s2)]`}>
          <p className={META}>
            This deployment ·{" "}
            <a href="/admin" className="underline underline-offset-2 hover:text-foreground">
              People
            </a>
          </p>
          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            className={`${META} [text-transform:none!important] hover:text-foreground`}
          >
            {nextTheme === "dark" ? "Dark" : "Light"}
            <span className="sr-only"> theme</span>
          </button>
        </div>
      </header>

      <main className={`${PAGE} py-[var(--s5)]`}>
        <h1 className={`${DISPLAY} m-0`}>Booking times for an email</h1>
        <p className={`${READ_MUTED} mt-[var(--s3)] max-w-[40rem]`}>
          Your free times, as a block to put in an email. A person who picks one lands in the booking popup with
          that time chosen, and confirms it from a link we send to their address. Nothing goes into your calendar
          until they do. These are the times free now, so make the block again for a later email.
        </p>

        {state.kind === "refused" ? (
          <div className="mt-[var(--s5)]">
            <p className={READ} role="alert" data-testid="text-widget-refused">
              {state.line}
            </p>
            {/* The way in, on the page where the wall is. The operator is
                whoever signs in with the address in OPERATOR_EMAIL (on a
                house host also LEAD_NOTIFY_EMAIL) or the LinkedIn account in
                OPERATOR_LINKEDIN_SUB — see server/admin/people.ts. */}
            {!state.signedIn ? (
              <p className={`${READ_MUTED} mt-[var(--s3)] max-w-[40rem]`}>
                Sign in on the{" "}
                <a href="/" className="underline underline-offset-2 hover:text-foreground">
                  front page
                </a>{" "}
                (Sign in, at the top, then LinkedIn), and open this page again.
              </p>
            ) : null}
            {state.youAre.length > 0 ? (
              <>
                <p className={`${READ} mt-[var(--s3)] max-w-[40rem]`}>
                  To make this account the operator, add this in Render (the top-rated-team service, Environment),
                  let it redeploy, and open this page again:
                </p>
                <pre
                  className="mt-[var(--s2)] overflow-x-auto rounded-md border border-border bg-muted p-[var(--s2)] text-sm"
                  data-testid="text-widget-you-are"
                >
                  {state.youAre.join("\n")}
                </pre>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-[var(--s5)] grid max-w-[40rem] grid-cols-1 gap-[var(--s3)] sm:grid-cols-3">
              <fieldset className="sm:col-span-3">
                <legend className={`${META} mb-[var(--s1)]`}>Show</legend>
                <div className="flex gap-[var(--s3)]">
                  {(["times", "days"] as const).map((value) => (
                    <label key={value} className={`${READ} flex items-center gap-[var(--s1)]`}>
                      <input
                        type="radio"
                        name="show"
                        value={value}
                        checked={show === value}
                        onChange={() => setShow(value)}
                        data-testid={`radio-widget-${value}`}
                      />
                      {value === "times" ? "Days and times" : "Days only"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className={`${META} mb-[var(--s1)] block`}>Days</span>
                <select className={FIELD} value={days} onChange={(event) => setDays(Number(event.target.value))}>
                  {Array.from({ length: WIDGET_MAX_DAYS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {show === "times" ? (
                <label className="block">
                  <span className={`${META} mb-[var(--s1)] block`}>Times a day</span>
                  <select className={FIELD} value={perDay} onChange={(event) => setPerDay(Number(event.target.value))}>
                    {Array.from({ length: WIDGET_MAX_TIMES_PER_DAY - 1 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n === WIDGET_MAX_TIMES_PER_DAY ? `${n} (all)` : n}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block sm:col-span-3">
                <span className={`${META} mb-[var(--s1)] block`}>Recipient</span>
                <input
                  className={FIELD}
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="their address, or your mail tool's merge tag, such as {{email}}"
                  spellCheck={false}
                  data-testid="input-widget-recipient"
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">{recipientNote}</span>
              </label>
            </div>

            {state.kind === "ok" && !state.data.emailConfirmation.on ? (
              <p className={`${READ} mt-[var(--s4)] max-w-[40rem] text-destructive`} role="alert" data-testid="text-widget-confirmation-off">
                {state.data.emailConfirmation.line}
              </p>
            ) : null}

            <div className="mt-[var(--s4)] flex flex-wrap gap-[var(--s2)]">
              <button
                type="button"
                className={ACTION}
                disabled={!fresh}
                onClick={async () => {
                  if (state.kind === "ok" && (await copyRich(state.data.html, state.data.text))) flash("Copied. Paste it into the email.");
                }}
                data-testid="button-widget-copy-rich"
              >
                Copy for Gmail or Outlook
              </button>
              <button
                type="button"
                className={ACTION_QUIET}
                disabled={!fresh}
                onClick={async () => {
                  if (state.kind === "ok" && (await copyPlain(state.data.html))) flash("HTML copied. Paste it into your mail tool's HTML block.");
                }}
                data-testid="button-widget-copy-html"
              >
                Copy HTML
              </button>
              <button
                type="button"
                className={ACTION_QUIET}
                disabled={!fresh}
                onClick={async () => {
                  if (state.kind === "ok" && (await copyPlain(state.data.text))) flash("Text copied, one link a time.");
                }}
                data-testid="button-widget-copy-text"
              >
                Copy as text
              </button>
            </div>
            <p className={`${READ_MUTED} mt-[var(--s2)] min-h-[1.5em]`} aria-live="polite" data-testid="text-widget-copy-status">
              {state.kind === "ok" && !fresh ? "Updating the block for what you typed." : copied}
            </p>
            {carriedLine ? (
              <p className={`${READ} mt-[var(--s2)] max-w-[40rem]`} data-testid="text-widget-carries">
                {carriedLine}
              </p>
            ) : null}

            <p className={`${META} mt-[var(--s4)]`}>What the recipient sees</p>
            {state.kind === "loading" ? (
              <p className={`${READ_MUTED} mt-[var(--s2)]`}>Looking up your free times.</p>
            ) : state.kind === "failed" ? (
              <p className={`${READ} mt-[var(--s2)] text-destructive`} role="alert">
                {state.line}
              </p>
            ) : state.kind === "ok" ? (
              /* The block is ours, built on the server with every value escaped.
                 Drawn on white because that is what most inboxes are. */
              <div
                className="mt-[var(--s2)] rounded-md border border-border bg-white p-[var(--s3)]"
                data-testid="preview-widget"
                dangerouslySetInnerHTML={{ __html: state.data.html }}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
