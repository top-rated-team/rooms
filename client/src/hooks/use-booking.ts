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
/**
 * WHY IT WARMS ON THE FIRST INTERACTION WITH THE PAGE, not with the button.
 *
 * Hover works on a desktop. On a phone there is no hover, and touchstart is
 * about fifty milliseconds ahead of the click — nowhere near enough for a
 * third-party script — so a tap would fall through and open a tab every time,
 * which is precisely the behaviour this was meant to replace.
 *
 * So the embed is fetched on the first pointer, key or scroll ANYWHERE on the
 * page, once, and it is ready long before a thumb reaches the button. A visitor
 * who opens the page and leaves still fetches nothing; anyone who interacts at
 * all is somebody who might book.
 */
let warmedOnce = false;

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

  const warm = useCallback(() => {
    void prepareBooking();
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
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
      if (openBooking()) {
        event.preventDefault();
        return;
      }
      /* Not ready — the link does what a link does. Starting the fetch here
         means a second press in the same session opens the popup, and the
         first press still reached the booking page. */
      warm();
    },
    [warm],
  );

  return { onClick, onMouseEnter: warm, onFocus: warm };
}
