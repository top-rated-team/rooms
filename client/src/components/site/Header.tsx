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
    <header data-site-chrome data-testid="site-header">
      <div className="mx-auto flex max-w-[var(--page)] items-center justify-between gap-[var(--s3)] px-[var(--s3)] pt-[var(--s3)]">
        <Link
          href="/"
          data-testid="link-logo"
          className="type-meta flex items-center gap-2 font-medium tracking-[0.13em] text-foreground"
        >
          <img src="/assets/top-rated-logo.png" alt="" aria-hidden="true" className="h-5 w-5" />
          Top-Rated Team
        </Link>

        <nav className="type-meta flex items-center gap-[var(--s3)]">
          <Link href="/use-case" data-testid="link-nav-work" className={LINK}>
            Work
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
