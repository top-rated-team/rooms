/**
 * Google's appointment popup, opened from our own link.
 *
 * WHY NOT JUST LINK TO IT. A booking link sends the visitor to calendar.google.com
 * and the site is over. The popup keeps them here, which matters most on the
 * one action the whole page is for.
 *
 * WHY NOT GOOGLE'S OWN BUTTON. Because it looks like Google's own button:
 * `.qxCTlb` is a filled 4px-radius rectangle in Google Sans with white text on
 * whatever colour you pass it. Dropping that into this design would be the one
 * loudest object on a page that has almost no colour. So Google's button is
 * loaded, hidden, and clicked programmatically when the visitor presses ours.
 *
 * WHY THE LINK STILL HAS AN href. Because calendar.google.com is a common
 * target for blockers and corporate proxies. `open()` returns false when the
 * embed is not there, and every caller lets the click fall through to plain
 * navigation. The booking never becomes unreachable because a script did not
 * load — that is the difference between an enhancement and a dependency.
 *
 * WHY IT IS INJECTED HERE RATHER THAN IN index.html. Two reasons: that file is
 * frozen while parcels are in flight, and nothing should fetch a third-party
 * script on a page view where nobody intends to book.
 */

const CSS_URL = "https://calendar.google.com/calendar/scheduling-button-script.css";
const JS_URL = "https://calendar.google.com/calendar/scheduling-button-script.js";

/** The schedule this books. Resolved from calendar.app.google/ucoG2E1L6KV7BPUD7. */
const SCHEDULE_URL =
  "https://calendar.google.com/calendar/appointments/schedules/" +
  "AcZssZ3NOMh7SMtLzvAepTJeOomMnMneNJ9lpwBef4p5whZvfp02rajf3csuijL5U0ePbqVRaqm5obfU?gv=true";

interface SchedulingButton {
  load(options: { url: string; color?: string; label?: string; target: HTMLElement }): void;
}
declare global {
  interface Window {
    calendar?: { schedulingButton?: SchedulingButton };
  }
}

type State = "idle" | "loading" | "ready" | "unavailable";
let state: State = "idle";
let host: HTMLElement | null = null;
let waiting: Array<(ok: boolean) => void> = [];

function settle(next: "ready" | "unavailable") {
  state = next;
  const listeners = waiting;
  waiting = [];
  for (const listener of listeners) listener(next === "ready");
}

function asset(tag: "link" | "script", url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`[data-gcal="${url}"]`);
    if (existing) return resolve();
    const element = document.createElement(tag);
    element.setAttribute("data-gcal", url);
    element.addEventListener("load", () => resolve());
    element.addEventListener("error", () => reject(new Error(url)));
    if (tag === "link") {
      const link = element as HTMLLinkElement;
      link.rel = "stylesheet";
      link.href = url;
    } else {
      const script = element as HTMLScriptElement;
      script.src = url;
      script.async = true;
    }
    document.head.appendChild(element);
  });
}

/**
 * Fetch the embed and let Google build its button into a hidden host. Resolves
 * false rather than throwing: a blocked script is an ordinary thing to meet.
 */
export function prepareBooking(): Promise<boolean> {
  if (state === "ready") return Promise.resolve(true);
  if (state === "unavailable") return Promise.resolve(false);
  const settled = new Promise<boolean>((resolve) => waiting.push(resolve));
  if (state === "loading") return settled;

  state = "loading";
  void (async () => {
    try {
      await Promise.all([asset("link", CSS_URL), asset("script", JS_URL)]);
      const button = window.calendar?.schedulingButton;
      if (!button) return settle("unavailable");

      /*
       * A WRAPPER, AND THE TARGET INSIDE IT — because of how their load() works.
       *
       * Their code is: `var b = a.target; a = I(a); b.insertAdjacentElement("afterend", a)`.
       * The button is inserted as the target's NEXT SIBLING, not as its child.
       * My first version passed a clipped div and then looked for the button
       * INSIDE it, so it never found one: the poll timed out, openBooking()
       * returned false, and every click fell through to the link — which is
       * exactly the new tab the owner saw.
       *
       * So the clip goes on a wrapper and the target is a span within it. The
       * button lands beside the span, inside the wrapper, and the wrapper hides
       * it. The popup itself is unaffected: their onclick appends the overlay to
       * document.body, so it is never inside anything we clipped.
       */
      host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";
      const anchor = document.createElement("span");
      host.appendChild(anchor);
      document.body.appendChild(host);

      /*
       * `color` is not optional in practice. Their I() does B(a.color) and B
       * validates against /^#(?:[0-9a-f]{3}){1,2}$/ — pass nothing and it
       * throws inside load(), which was the second reason this never worked.
       * The value is irrelevant because the button is never seen; it is our own
       * clay so that if their script ever reveals it, it is not Google blue.
       */
      button.load({ url: SCHEDULE_URL, color: "#9A4A22", label: "Book a call", target: anchor });

      // The button is built synchronously inside load(), but poll anyway: the
      // script is theirs to change, and a poll that succeeds on its first tick
      // costs nothing.
      const deadline = Date.now() + 4000;
      const poll = () => {
        if (host?.querySelector("button")) return settle("ready");
        if (Date.now() > deadline) return settle("unavailable");
        window.setTimeout(poll, 60);
      };
      poll();
    } catch {
      settle("unavailable");
    }
  })();

  return settled;
}

/**
 * Open the popup. Returns false when the embed is not available, and the caller
 * must then let the browser follow the link.
 */
export function openBooking(): boolean {
  if (state !== "ready") return false;
  const button = host?.querySelector("button");
  if (!button) return false;
  button.click();
  return true;
}

/** True once the popup can be opened, so a caller can decide before a click. */
export function bookingReady(): boolean {
  return state === "ready";
}
