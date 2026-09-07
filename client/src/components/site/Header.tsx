import { Link } from "wouter";

import { useTheme } from "@/hooks/use-theme";

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

const LINK = "draw text-muted-foreground hover:text-foreground";

export function Header() {
  const { resolvedTheme, setTheme } = useTheme();
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
      <div className="mx-auto flex max-w-[var(--page)] items-center justify-between gap-[var(--s3)] px-[var(--s3)] py-[var(--s2)]">
        <Link
          href="/"
          data-testid="link-logo"
          className="type-meta flex items-baseline gap-2 font-medium tracking-[0.13em] text-foreground"
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

            1.55em is the mark's height (20px at this 13px size, unchanged), and
            0.72em is the cap height of the sans face. Verified by measuring both
            top edges in a browser rather than by eye.
          */}
          <img
            src="/assets/top-rated-logo.png"
            alt=""
            aria-hidden="true"
            className="h-[1.55em] w-[1.55em] shrink-0 translate-y-[0.83em]"
          />
          Top-Rated Team
        </Link>

        <nav className="type-meta flex items-center gap-[var(--s3)]">
          <Link href="/services" data-testid="link-nav-services" className={LINK}>
            Services
          </Link>
          <Link href="/pricing" data-testid="link-nav-pricing" className={LINK}>
            Pricing
          </Link>
          <button
            type="button"
            data-testid="button-theme-toggle"
            onClick={() => setTheme(next)}
            className={LINK}
          >
            {next === "dark" ? "Dark" : "Light"}
            <span className="sr-only"> theme</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
