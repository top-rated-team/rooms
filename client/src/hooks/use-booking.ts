import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { openBooking, prepareBooking } from "@/lib/booking";

/**
 * Everything on this site that says "Book a call" uses this, so the behaviour
 * is decided once: press it and the popup opens over the page; if the embed is
 * blocked or slow, the click falls through and the link navigates as it always
 * did.
 *
 * The embed is fetched on HOVER OR FOCUS rather than on page load, so a visitor
 * who never intends to book never pays for a third-party script — and one who
 * is about to press it has already loaded it by the time they do.
 */
export function useBooking() {
  const [, setReady] = useState(false);

  // Nothing on mount. The warm-up is deliberately an intent signal.
  const warm = useCallback(() => {
    void prepareBooking().then(setReady);
  }, []);

  const onClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    /* Never swallow a click the visitor meant to send elsewhere: a middle
       click, a modified click and a right click are all requests for a new tab
       or a copied address, and the popup is none of those. */
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (openBooking()) {
      event.preventDefault();
      return;
    }
    /* Not ready: let the link do what a link does, and start the embed so a
       second press in the same session opens the popup. */
    warm();
  }, [warm]);

  useEffect(() => () => setReady(false), []);

  return { onClick, onMouseEnter: warm, onFocus: warm, onTouchStart: warm };
}
