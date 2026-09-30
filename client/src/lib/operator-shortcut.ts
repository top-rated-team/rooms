import { openBooking } from "@/lib/booking";

/**
 * THE OWNER'S SIGNATURE LINKS. https://top-rated.team/# and
 * https://top-rated.team/book# look like the site to anyone who clicks them,
 * and are the site to anyone who clicks them — except the operator, signed in
 * in this browser (LinkedIn, WhatsApp or email, whichever is on the account),
 * who is taken to the widget page instead. The empty "#" is the whole mark:
 * nothing a reader sees, and nothing the server can see either, which is why
 * the page asks. A bare /book is served as the page itself (see the route),
 * because a redirect would drop that "#"; this turns it into the popup.
 *
 * Runs once, as this module is imported: main.tsx imports it first, because
 * the popup's host registers while its own module is imported and reads the
 * address then.
 */
export const OPERATOR_SHORTCUT_TARGET = "/admin/booking-widget";

async function signedInAsOperator(): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/operator", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!res.ok) return false;
    const body = (await res.json()) as { operator?: unknown };
    return body.operator === true;
  } catch {
    return false;
  }
}

/** The popup, once the page has registered it. */
function openBookingSoon(triesLeft = 60): void {
  if (openBooking() || triesLeft <= 0) return;
  setTimeout(() => openBookingSoon(triesLeft - 1), 50);
}

export function takeOperatorShortcut(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, href, hash } = window.location;
  const bareBook = /^\/book\/?$/i.test(pathname);
  if (pathname !== "/" && !bareBook) return;
  const markedForOwner = hash === "" && href.endsWith("#");
  if (!bareBook && !markedForOwner) return;
  try {
    /* Plain /book: the front page with the popup, which reads #book as it registers. */
    window.history.replaceState(window.history.state, "", markedForOwner ? `/${search}` : `/${search}#book`);
  } catch {
    /* The address stays as it came; the rest still works. */
  }
  if (!markedForOwner) return;
  void signedInAsOperator().then((operator) => {
    if (operator) window.location.replace(OPERATOR_SHORTCUT_TARGET);
    else if (bareBook) openBookingSoon();
  });
}

takeOperatorShortcut();
