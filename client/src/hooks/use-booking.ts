import {
  createElement,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  isBookingOpen,
  openBooking,
  prepareBooking,
  registerBookingHost,
  setBookingOpen,
  subscribeBookingOpen,
} from "@/lib/booking";

/* Lazily loaded: BookingDialog pulls in Radix, and this hook is imported by
   the header in the landing chunk that paid traffic downloads first. */
const BookingDialog = lazy(() => import("@/components/site/BookingDialog").then((m) => ({ default: m.BookingDialog })));

/**
 * Everything on this site that says "Book a call" uses this, so the behaviour
 * is decided once: press it and our popup opens over the page. The href on the
 * anchor is the no-JS path, not a fallback for a blocked third-party script.
 *
 * The slots request is started on HOVER OR FOCUS rather than on page load, so a
 * visitor who never intends to book never pays for it — and one who is about
 * to press it has already loaded it by the time they do.
 */
/**
 * WHY IT WARMS ON THE FIRST INTERACTION WITH THE PAGE, not with the button.
 *
 * Hover works on a desktop. On a phone there is no hover, and touchstart is
 * about fifty milliseconds ahead of the click — nowhere near enough for a
 * slots fetch — so a tap would open an empty popup every time, which is
 * precisely the behaviour this was meant to replace.
 *
 * So the slots are fetched on the first pointer, key or scroll ANYWHERE on the
 * page, once, and they are ready long before a thumb reaches the button. A
 * visitor who opens the page and leaves still fetches nothing; anyone who
 * interacts at all is somebody who might book.
 */
let warmedOnce = false;
let hostRoot: Root | null = null;

function BookingHost() {
  const [open, setOpen] = useState(isBookingOpen);
  useEffect(() => subscribeBookingOpen(setOpen), []);
  if (!open) return null;
  return createElement(
    Suspense,
    { fallback: null },
    createElement(BookingDialog, { open, onOpenChange: setBookingOpen }),
  );
}

function ensureHost() {
  if (hostRoot) return;
  if (typeof document === "undefined" || !document.body) return;
  const node = document.createElement("div");
  node.setAttribute("data-booking-host", "");
  document.body.appendChild(node);
  hostRoot = createRoot(node);
  hostRoot.render(createElement(BookingHost));
}

registerBookingHost(ensureHost);

function warmOnFirstInteraction() {
  if (warmedOnce) return;
  warmedOnce = true;
  const events = ["pointerdown", "touchstart", "keydown", "scroll"] as const;
  const go = () => {
    for (const name of events) window.removeEventListener(name, go);
    void prepareBooking();
  };
  for (const name of events) window.addEventListener(name, go, { once: true, passive: true });
}

export function useBooking() {
  useEffect(warmOnFirstInteraction, []);
  useEffect(() => {
    ensureHost();
  }, []);

  const warm = useCallback(() => {
    void prepareBooking();
  }, []);

  const onClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    /* Never swallow a click the visitor meant to send elsewhere: a middle
       click, a modified click and a right click are all requests for a new
       tab or a copied address, and the popup is none of those. */
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    openBooking();
  }, []);

  return { onClick, onMouseEnter: warm, onFocus: warm };
}
