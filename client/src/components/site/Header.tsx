import { lazy, Suspense, useState } from "react";
import { Link } from "wouter";

import { BOOK_A_CALL_URL } from "@shared/roster";
import { useTheme } from "@/hooks/use-theme";
import { useBooking } from "@/hooks/use-booking";

/* Lazily loaded: LeadDialog pulls in Radix, and this header is in the landing
   chunk that paid traffic downloads first. */
const LeadDialog = lazy(() => import("@/components/site/LeadDialog").then((m) => ({ default: m.LeadDialog })));

/* ---------------------------------------------------------------------------
 * THE MASTHEAD
 *
 * It carried thirteen things: a logo, ten nav items — one of them "FREE leads"
 * — a theme control and a booking button, on every page, above every offer.
 * Three are left.
 *
 * The minimum is: the name, which is the way back to the page that lists all
 * the work; one link to that list, for the pages that are not it; and the
 * theme, because a person reading at night has to be able to say so. Everything
 * else that used to live here — Services, Case Studies, White-Label, Team,
 * Blog, Contact, AdGrant.AI, Book a call — is either a page on top-rated.team
 * that a visitor did not come here for, or an offer, and an offer belongs on
 * the door that makes it rather than in the furniture above every door.
 *
 * It is not sticky any more, and that is deliberate. A bar pinned over the page
 * is a permanent object on a design whose whole argument is that there are
 * almost none; the pages are short, and the footer carries the same two links
 * at the end of the scroll.
 *
 * data-site-chrome is load-bearing, not decoration: client/src/index.css keys
 * the site's three-size type scale off it, so the pages that carry this header
 * get the scale and the workspace does not.
 * ------------------------------------------------------------------------- */

/*
 * `type-meta` is on every item explicitly rather than inherited from the <nav>.
 * A <button> does not take the browser's font from its parent the way an <a>
 * does, so the two buttons in this bar — the theme and "Leave a message" —
 * rendered at the user-agent's own button size and in mixed case while the
 * links beside them were small-caps. The owner spotted it; it is the same
 * defect in both, and naming the class here fixes both and anything added next.
 */
const LINK = "type-meta draw text-muted-foreground hover:text-foreground";

/*
 * "OPEN A ROOM" IS OUT OF THIS BAR, on the owner's instruction, and the helper
 * that scrolled to it went with it — it had no other caller.
 *
 * It was here for one turn and the objection is fair: a nav item is a wayfinder,
 * and this one pointed at a section rather than a place, which made it the odd
 * one out among six labels for pages and actions. Where it belongs is where the
 * offer is, so it is now in the door pages' own sections, repeated, and on the
 * first screen — see client/src/pages/door.tsx.
 */

export function Header() {
  const { resolvedTheme, setTheme } = useTheme();
  const [messageOpen, setMessageOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const booking = useBooking();
  const close = () => setMenuOpen(false);
  /* Two states rather than three. "System" is still what a visitor who never
     presses this gets, because that is what the theme starts as; pressing it is
     the moment they have an opinion, and an opinion is not a menu. */
  const next = resolvedTheme === "dark" ? "light" : "dark";

  return (
    /*
      STICKY AGAIN, and the reason it was not is worth recording because it has
      expired rather than been overruled.

      The redesign unpinned it deliberately: a bar held over the page is a
      permanent object on a design whose argument is that there are almost none,
      and the pages were short enough that the footer's repeat of the links was
      enough. Then the ChatGPT Ads door became one page 6,262 pixels tall, and a
      reader six screens down has no way back but scrolling.

      So it is pinned, but it stays a hairline: the same ground as the page, no
      shadow, no shrink-on-scroll, no reappear-on-scroll-up. The thing that went
      out of fashion is the tall header that follows you, not the slim one that
      is simply there. `backdrop-blur` earns its place only because the page
      scrolls under it; without a background the type would collide with the
      text passing beneath.
    */
    <header
      data-site-chrome
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[var(--page)] items-center justify-between gap-[var(--s3)] px-[var(--s3)] py-[var(--s2)] pb-[calc(var(--s2)+0.5rem)]">
        <Link
          href="/"
          data-testid="link-logo"
          className="type-meta flex items-baseline gap-2 text-[1.0625rem] font-medium tracking-[0.13em] text-foreground"
        >
          {/*
            ALIGNED TO THE CAP, NOT THE MIDDLE. The mark is taller than the line
            it sits on, so centring it made it stick out above the T as well as
            below. The owner wants its top edge level with the top of the T and
            is happy for it to hang below.

            So: `items-baseline` puts the image's BOTTOM on the text baseline,
            and the translate pushes it back down by its own height minus the
            cap height — leaving the top exactly at the cap and the rest hanging
            under the line. Both numbers are in em, so the alignment survives the
            type scale changing; a px nudge would not.

            AND IT IS THE MARK'S STRAIGHT EDGE THAT MATCHES, not its full
            height. The mark is a chevron: its sides run straight for about the
            first 65% and then come to a point. Matching the T to the whole
            image left the T looking short beside a shape whose bottom two
            thirds are empty space narrowing to nothing. So the T is set against
            the straight part.

            THE MARK IS BIGGER NOW, and getting there meant giving up the
            stricter of two readings of the owner's original instruction.

            He said the T's height should answer to the mark's vertical edge,
            and this file read that as "equal heights". That reading pins the
            size: the straight part is 0.65 of the image, so matching a 17px
            cap to it FORCES an 18px mark and no larger. Then he asked for the
            mark to be at least as big as the favicon, which the 18px version
            is not — not really by box, since a tab renders a favicon at 16px,
            but plainly by ink. The favicon fills its square; this chevron's
            bottom third is empty space narrowing to a point, so the same box
            carries visibly less mark.

            Both wishes cannot hold at once. The one kept is the alignment he
            described rather than the arithmetic this file inferred from it: the
            mark's TOP EDGE is level with the top of the T, which is what
            `translate-y = height - cap` does at any size. So the mark grew to
            1.45em — about 25px against a 17px wordmark — and hangs further
            below the line, which he had already said he was happy with.

            The header's own padding grew with it. A mark hanging 0.75em under
            the baseline in a bar padded for a 17px line would have sat on the
            bottom border.

            Verified on a 4x screenshot, not by eye.
          */}
          <img
            src="/assets/top-rated-logo.png"
            alt=""
            aria-hidden="true"
            className="h-[1.45em] w-[1.45em] shrink-0 translate-y-[0.75em]"
          />
          Top-Rated Team
        </Link>

        {/*
          SIX ITEMS DO NOT FIT A PHONE, and until now they were asked to.

          There was no breakpoint in this file at all. On a 390px screen the bar
          put the wordmark, Services, Pricing, Book a call, Leave a message and
          the theme on one row, so "BOOK A CALL" broke onto three lines and
          "LEAVE A MESSAGE" onto two, and the whole header grew to a third of
          the screen. That is what the owner photographed.

          So the row is the desktop layout and the phone gets a sheet. A burger
          is still the standard on a phone in 2026 — what changed is that it
          should open a panel with room to breathe, not a cramped dropdown, and
          that the actions worth taking should also exist somewhere a thumb can
          reach without opening anything. The first screen carries Book a call
          and Leave a message on a phone for exactly that reason.
        */}
        <nav className="type-meta hidden items-center gap-[var(--s3)] sm:flex">
          <Link href="/services" data-testid="link-nav-services" className={LINK}>
            Services
          </Link>
          <Link href="/case-studies" data-testid="link-nav-cases" className={LINK}>
            Case studies
          </Link>
          <Link href="/pricing" data-testid="link-nav-pricing" className={LINK}>
            Pricing
          </Link>
          <Link href="/services/white-label" data-testid="link-nav-white-label" className={LINK}>
            White label
          </Link>
          <a
            href={BOOK_A_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-nav-book-a-call"
            className={LINK}
            {...booking}
          >
            Book a call
          </a>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            data-testid="button-nav-leave-a-message"
            className={LINK}
          >
            Leave a message
          </button>
          {/*
            THE THEME IS THE ONE ITEM IN SENTENCE CASE, on the owner's
            instruction, and the distinction it draws is real: the six items
            before it are LABELS for places and actions, where this one is the
            current STATE of the page.

            `[text-transform:none!important]` rather than `normal-case`: .type-meta rides
            on this button through LINK, so both rules are one class deep and
            the winner is whichever the stylesheet emits last. A screenshot
            showed DARK still shouting after the first attempt.
          */}
          <button
            type="button"
            data-testid="button-theme-toggle"
            onClick={() => setTheme(next)}
            className={`${LINK} [text-transform:none!important]`}
          >
            {next === "dark" ? "Dark" : "Light"}
            <span className="sr-only"> theme</span>
          </button>
        </nav>

        {/* The phone: one control, and it says what it is to a screen reader. */}
        <button
          type="button"
          data-testid="button-nav-menu"
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => setMenuOpen((was) => !was)}
          className="type-meta -mr-[var(--s1)] p-[var(--s1)] text-muted-foreground hover:text-foreground sm:hidden"
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      {menuOpen ? (
        <div
          id="site-menu"
          data-testid="nav-menu-sheet"
          className="mx-auto flex max-w-[var(--page)] flex-col gap-[var(--s2)] border-t border-border px-[var(--s3)] py-[var(--s3)] sm:hidden"
        >
          <Link href="/services" onClick={close} data-testid="link-menu-services" className={LINK}>
            Services
          </Link>
          <Link href="/pricing" onClick={close} data-testid="link-menu-pricing" className={LINK}>
            Pricing
          </Link>
          <Link href="/case-studies" onClick={close} data-testid="link-menu-cases" className={LINK}>
            Case studies
          </Link>
          <Link href="/services/white-label" onClick={close} data-testid="link-menu-white-label" className={LINK}>
            White label
          </Link>
          <a
            href={BOOK_A_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            data-testid="link-menu-book-a-call"
            className={LINK}
          >
            Book a call
          </a>
          <button
            type="button"
            onClick={() => {
              close();
              setMessageOpen(true);
            }}
            data-testid="button-menu-leave-a-message"
            className={`${LINK} text-left`}
          >
            Leave a message
          </button>
          <button
            type="button"
            onClick={() => {
              setTheme(next);
              close();
            }}
            data-testid="button-menu-theme"
            className={`${LINK} [text-transform:none!important] text-left`}
          >
            {next === "dark" ? "Dark" : "Light"}
            <span className="sr-only"> theme</span>
          </button>
        </div>
      ) : null}

      {messageOpen ? (
        <Suspense fallback={null}>
          <LeadDialog open={messageOpen} onOpenChange={setMessageOpen} prefill={null} />
        </Suspense>
      ) : null}
    </header>
  );
}

export default Header;
