import { useEffect, useRef, useState } from "react";

import { ACTION, ACTION_QUIET, DISPLAY, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { useTheme } from "@/hooks/use-theme";
import type { AdminBookingWidgetResponse } from "@shared/api";
import { bookingGuests, widgetRecipient } from "@shared/booking-link";
import { WIDGET_MAX_DAYS, WIDGET_MAX_TIMES_PER_DAY, type BookingWidgetShow } from "@shared/booking-widget";
import { WhereTheyAre, type KnownPlace, type WhereTheyAreProps } from "@/components/admin/WhereTheyAre";
import { guessZoneFromAddress, isTimeZone } from "@shared/time-zones";

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

function optionsKey(
  show: BookingWidgetShow,
  frame: string,
  from: string,
  days: number,
  perDay: number,
  recipient: string,
  tz: string,
  place: string,
  guests: string,
): string {
  return JSON.stringify([show, frame, from, days, perDay, recipient.trim(), tz, place, guests.trim()]);
}

/* Where each person is — zone and town — kept in this browser so the next
   block for the same person starts there. A convenience only: nothing else
   reads it. Older entries hold only a zone. */
const ZONES_KEY = "booking-widget-zones";

function readRememberedZones(): Record<string, KnownPlace> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ZONES_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, KnownPlace> = {};
    for (const [address, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && isTimeZone(value)) out[address] = { zone: value };
      else if (value && typeof value === "object" && isTimeZone(String((value as KnownPlace).zone))) {
        const row = value as KnownPlace;
        out[address] = {
          zone: row.zone,
          ...(typeof row.place === "string" && row.place.trim() ? { place: row.place.trim().slice(0, 60) } : {}),
          ...(typeof row.how === "string" ? { how: row.how.slice(0, 120) } : {}),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function rememberZone(address: string, known: KnownPlace): Record<string, KnownPlace> {
  const next = { ...readRememberedZones(), [address]: known };
  try {
    window.localStorage.setItem(ZONES_KEY, JSON.stringify(next));
  } catch {
    /* Private window or storage off: the pick still holds for this page. */
  }
  return next;
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
  /* Which days: the nearest free ones whenever the email is opened (the
     default), or fixed dates from a day of the owner's choosing. */
  const [frame, setFrame] = useState<"live" | "fixed">("live");
  const [from, setFrom] = useState("");
  const [days, setDays] = useState(5);
  const [perDay, setPerDay] = useState(6);
  const [recipient, setRecipient] = useState("");
  /* The address box asks the server only once typing stops. */
  const [asked, setAsked] = useState("");
  /* More people for the call, invited when the recipient books; asked for with the address. */
  const [guestsText, setGuestsText] = useState("");
  const [askedGuests, setAskedGuests] = useState("");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  /* Bumped to read the calendar again with the same options. */
  const [reads, setReads] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Where the recipient is: picked or found here, set before for this
     address, guessed from a one-clock country's domain, or else our own. */
  const [remembered, setRemembered] = useState<Record<string, KnownPlace>>(() => readRememberedZones());
  const [calendarZone, setCalendarZone] = useState("");
  const zoneFor = (address: string): WhereTheyAreProps["known"] => {
    const typedAddress = widgetRecipient(address);
    const key = typedAddress.kind === "address" ? typedAddress.value.toLowerCase() : "";
    const kept = key ? remembered[key] : undefined;
    if (kept) return { ...kept, source: "remembered" };
    const guess = key ? guessZoneFromAddress(key) : null;
    if (guess) return { zone: guess.zone, source: "guessed", domain: guess.domain };
    return { zone: calendarZone, source: "own" };
  };
  /* What goes to the server: nothing for our own zone, which is its default. */
  const tzFor = (address: string) => {
    const found = zoneFor(address);
    return found.source === "own" ? "" : found.zone;
  };
  const placeFor = (address: string) => (tzFor(address) ? (zoneFor(address).place ?? "") : "");

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
    const timer = setTimeout(() => {
      setAsked(recipient.trim());
      setAskedGuests(guestsText.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [recipient, guestsText]);

  /* KEPT IN STEP WITH THE CALENDAR while the page is open: read again when the
     owner comes back to the tab — usually from the calendar itself — and every
     two minutes while it is in front of him. */
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") setReads((n) => n + 1);
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    const timer = setInterval(again, 120_000);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const tz = tzFor(asked);
    const place = placeFor(asked);
    const shownFrame = show === "times" ? frame : "fixed";
    const query = new URLSearchParams({
      show,
      frame: shownFrame,
      ...(shownFrame === "fixed" && from ? { from } : {}),
      days: String(days),
      perDay: String(perDay),
      recipient: asked,
      tz,
      place,
      guests: askedGuests,
    });
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
        if (typeof payload.timezone === "string") setCalendarZone(payload.timezone);
        setState({ kind: "ok", data: payload, forKey: optionsKey(show, shownFrame, from, days, perDay, asked, tz, place, askedGuests) });
      } catch (error) {
        if (ac.signal.aborted) return;
        setState({ kind: "failed", line: error instanceof Error ? error.message : "The booking times could not be loaded." });
      }
    })();
    return () => ac.abort();
    /* tzFor reads `remembered`: a zone picked for this address asks again. */
  }, [show, frame, from, days, perDay, asked, askedGuests, reads, remembered]);

  function flash(label: string) {
    setCopied(label);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2500);
  }

  const calendar = state.kind === "ok" ? state.data.calendar : null;
  const readAtLabel = calendar
    ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(calendar.readAt))
    : null;
  const typed = widgetRecipient(recipient);
  const recipientNote =
    recipient.trim() === ""
      ? "Required: the address you are sending these times to. A click on a time books it for that address."
      : typed.kind === "address"
        ? "One address: use this block for this person only."
        : "That is not an email address. A time can only be booked in one click for an address.";

  /* THE BLOCK ON SCREEN MUST BE THE ONE THAT IS COPIED. The address box asks
     the server once typing stops, so for a moment after a keystroke the block
     is the previous one — and a Copy pressed in that moment sent an email
     whose links carried no address, while the page looked finished. Copying
     waits until the block is the one for what is in the boxes. */
  const fresh = state.kind === "ok" && state.forKey === optionsKey(show, show === "times" ? frame : "fixed", from, days, perDay, recipient, tzFor(recipient), placeFor(recipient), guestsText);
  const shownZone = zoneFor(recipient);
  /* What the links carry, said from the server's answer, not from the box. */
  const carriedGuests = fresh && state.kind === "ok" ? (state.data.guests ?? []) : [];
  const host = state.kind === "ok" ? (state.data.host ?? null) : null;
  const hostLine = host ? ` (${host})` : "";
  const typedGuests = bookingGuests(guestsText);
  const guestsNote =
    typed.kind !== "address"
      ? "Put the recipient's address in first."
      : guestsText.trim() === ""
        ? `Optional. More people for the call, who Google invites with them once they book. You are invited to every call${hostLine}.`
        : typedGuests.length === 0
          ? "Not an address. Separate several with commas."
          : carriedGuests.length > 0
            ? `When ${typed.value} books, Google also invites ${carriedGuests.join(", ")}.`
            : "Updating the block for these guests.";
  const carried = state.kind === "ok" ? state.data.recipient : null;
  /* THE ADDRESS IS REQUIRED, and has to be signed: that is what lets one
     click book the call. Without it there is nothing to copy. */
  const ready = fresh && carried?.kind === "address" && carried.signed === true;
  const carriedLine =
    !carried
      ? null
      : carried.kind === "address"
        ? carried.signed
          ? show === "times"
            ? frame === "live"
              ? `Every time opens on the site for ${carried.value}, address filled in: one press of Book books it, and Google sends the invite. The days are the nearest free ones whenever the email is opened.`
              : `Every time books the call for ${carried.value} in one click: the page that opens shows the confirmation, with Change and Cancel, and Google sends the invite.`
            : `Every day opens the times for ${carried.value}, and pressing Book books the call at once, with Google's invite.`
          : `The address cannot be signed: this deployment has none of BOOKING_LINK_SECRET, LEAD_INBOX_KEY or ROOM_HASH_PEPPER. Set one in Render to make blocks that book in one click.`
        : "Put the address you are sending these times to in Recipient. The block can be copied once it has one.";

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
          Your free times, as a block to put in an email. These are the times free now, so make the block again
          for a later email.
        </p>
        <p className={`${READ} mt-[var(--s3)] max-w-[40rem]`}>
          Put in the address you are sending them to. The person clicks a time and it is booked for them: the site
          opens on the confirmation, with Change and Cancel, and Google sends the invite with the Meet link.
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
              <fieldset className="sm:col-span-3">
                <legend className={`${META} mb-[var(--s1)]`}>Which days</legend>
                <div className="flex flex-wrap gap-x-[var(--s3)] gap-y-[var(--s1)]">
                  {(["live", "fixed"] as const).map((value) => (
                    <label key={value} className={`${READ} flex items-center gap-[var(--s1)]`}>
                      <input
                        type="radio"
                        name="frame"
                        value={value}
                        checked={(show === "times" ? frame : "fixed") === value}
                        disabled={show === "days" && value === "live"}
                        onChange={() => setFrame(value)}
                        data-testid={`radio-widget-frame-${value}`}
                      />
                      {value === "live" ? "Nearest when the email is opened" : "Fixed dates"}
                    </label>
                  ))}
                </div>
                <span className="mt-1.5 block text-xs text-muted-foreground" data-testid="text-widget-frame">
                  {show === "times" && frame === "live"
                    ? "The days work themselves out each time the email is opened: always the nearest free ones, however late it is read. A click opens that time on the site, where one press books it — the pictures a mail app shows can be days old, so the real date is confirmed there."
                    : "These exact days, free as they are now; a time taken since shows crossed out. One click books."}
                </span>
                {show === "days" || frame === "fixed" ? (
                  <label className="mt-[var(--s2)] block max-w-[14rem]">
                    <span className={`${META} mb-[var(--s1)] block`}>From</span>
                    <input
                      type="date"
                      className={FIELD}
                      value={from || new Date().toISOString().slice(0, 10)}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => setFrom(event.target.value > new Date().toISOString().slice(0, 10) ? event.target.value : "")}
                      data-testid="input-widget-from"
                    />
                  </label>
                ) : null}
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
                  placeholder="the person's email address"
                  type="email"
                  required
                  aria-required="true"
                  spellCheck={false}
                  data-testid="input-widget-recipient"
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">{recipientNote}</span>
                {/* Every copy of one email carries the same links, and nothing
                    tells the site who clicked. */}
                <span className="mt-1 block text-xs text-foreground" data-testid="text-widget-one-person">
                  Send this block to that person alone: anyone else who gets the same email (in Cc, or forwarded)
                  could book in their name with one click. For several people, make one block each. Only the first
                  click books; later clicks are shown that booking and cannot change or cancel it.
                </span>
              </label>
              <label className="block sm:col-span-3">
                <span className={`${META} mb-[var(--s1)] block`}>Also invite</span>
                <input
                  className={FIELD}
                  value={guestsText}
                  onChange={(event) => setGuestsText(event.target.value)}
                  placeholder="colleague@their-company.com, partner@example.com"
                  disabled={typed.kind !== "address"}
                  spellCheck={false}
                  data-testid="input-widget-guests"
                />
                <span className="mt-1.5 block text-xs text-muted-foreground" data-testid="text-widget-guests">
                  {guestsNote}
                </span>
              </label>
              {show === "times" ? (
                <WhereTheyAre
                  address={typed.kind === "address" ? typed.value.toLowerCase() : null}
                  known={{ ...shownZone, zone: shownZone.zone || (state.kind === "ok" ? state.data.zone : "") }}
                  onChoose={(choice) => {
                    if (typed.kind !== "address") return;
                    setRemembered(rememberZone(typed.value.toLowerCase(), choice));
                  }}
                  labelClassName={`${META} mb-[var(--s1)] block`}
                  fieldClassName={FIELD}
                />
              ) : (
                <p className="text-xs text-muted-foreground sm:col-span-3" data-testid="text-widget-zone">
                  Days only: the page that opens lists the times, on your clock, and names the zone.
                </p>
              )}
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
                disabled={!ready}
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
                disabled={!ready}
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
                disabled={!ready}
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

            {calendar ? (
              <p className={`${READ_MUTED} mt-[var(--s4)] max-w-[40rem]`} data-testid="text-widget-calendar">
                Free times from the calendar <span className="text-foreground">{calendar.id || "(none set)"}</span>, read at{" "}
                {readAtLabel}: weekdays{" "}
                {state.kind === "ok" ? `${state.data.workHours.from}–${state.data.workHours.to}` : ""} in{" "}
                {state.kind === "ok" ? state.data.timezone : ""}, less everything
                busy there. An event marked Free does not block a time.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setReads((n) => n + 1)}
                  data-testid="button-widget-reread"
                >
                  Read again
                </button>
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
