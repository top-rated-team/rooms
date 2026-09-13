import type { ReactNode } from "react";
import { Link } from "wouter";

import { DOOR_BY_ID } from "@shared/doors";
import { MAIN_SITE_URL } from "@shared/roster";
import { ADGRANT_ACCENT_WRAP, ADGRANT_MARK } from "@/components/site/doors/adgrant-style";
import { LINK, META, META_PLAIN, PAGE } from "@/components/site/doors/quiet";
import { useTheme } from "@/hooks/use-theme";
import { AdGrantLogo } from "@/components/adgrant/Logo";
import { mountHome } from "@/components/adgrant/links";
import { ADGRANT_MOUNT } from "@/components/adgrant/mount";
import { ADGRANT_SECTIONS } from "@/components/adgrant/sections";

const DOOR = DOOR_BY_ID["ad-grants"];
const CONTRACT = DOOR.contract;

const NAV_LINK = "type-meta draw text-muted-foreground hover:text-foreground";
const FOOTER_MARK = "h-[1.15em] w-[1.15em] translate-y-[0.19em] fill-current";


/**
 * AdGrant.AI's own chrome. It does not import the site header or footer.
 * Internal links go through ADGRANT_MOUNT so the tree can move to its own host
 * without pointing at the other product's home. The menu and footer link back
 * to top-rated.team as a different site, not as this one.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  /* The year this product started publishing. A copyright line that reads
     only the current year claims nothing about the years before it, which is
     the opposite of what the line is for. */
  const FIRST_YEAR = 2025;
  const year = new Date().getFullYear();
  const years = year > FIRST_YEAR ? `${FIRST_YEAR}\u2013${year}` : String(FIRST_YEAR);

  return (
    <div className={`${ADGRANT_ACCENT_WRAP} flex min-h-screen flex-col bg-background`} data-site-chrome>
      <header
        data-testid="adgrant-header"
        className="sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-sm"
      >
        <div /* items-baseline. The wordmark carries an image that hangs below the
       line, so centring the boxes moved the words relative to the menu; the
       baseline is what a reader actually compares. The mark's own offset is
       set on the image. */
          className={`${PAGE} flex flex-wrap items-baseline justify-between gap-x-[var(--s3)] gap-y-[var(--s1)] py-[var(--s2)]`}>
          <Link
            href={mountHome()}
            data-testid="link-adgrant-mark"
            className="inline-flex items-center gap-[0.45em] font-sans text-[1.0625rem] font-medium tracking-[0.13em] text-foreground [text-transform:none]"
          >
            {/* Sized in em so it tracks the wordmark at every viewport, and
                nudged down because the wordmark sits on a baseline and a
                square box does not. */}
            <AdGrantLogo className="h-[1.15em] w-[1.15em] shrink-0 translate-y-[0.06em]" />
            {ADGRANT_MARK}
          </Link>
          <nav aria-label={ADGRANT_MARK} className="flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]">
            {ADGRANT_SECTIONS.map((section) => (
              <Link
                key={section.segment}
                href={section.path}
                data-testid={`link-adgrant-nav-${section.segment}`}
                className={NAV_LINK}
              >
                {section.name}
              </Link>
            ))}
            {/* The link to Top-Rated Team used to sit here. It is in the
                footer and nowhere else now, on the owner's instruction: the
                top menu is this product's own sections, and a way out of it
                does not belong beside them. */}
            <button
              type="button"
              data-testid="button-adgrant-theme"
              onClick={() => setTheme(next)}
              className={`${NAV_LINK} [text-transform:none!important]`}
            >
              {next === "dark" ? "Dark" : "Light"}
              <span className="sr-only"> theme</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer data-testid="adgrant-footer" className="mt-[var(--s6)] border-t border-border">
        <div className={`${PAGE} pb-[var(--s5)] pt-[var(--s3)]`}>
          {/* The row first, then who is answerable. A footer is read for its
              links; putting three paragraphs of disclaimer above them made
              the reader scroll past the answer to reach it. */}
          <nav
            aria-label={`${ADGRANT_MARK} footer`}
            className="type-meta flex flex-wrap items-center gap-x-[var(--s3)] gap-y-[var(--s1)]"
          >
            {/* STILL TOP-RATED TEAM'S, and that is the honest state rather
                than the intended one. This product needs its own — the owner
                asked for it and a fork needs the same — but they do not exist
                in this tree yet, and a footer link to a page that answers 404
                is the exact defect this repository was caught with before.
                They move to ${ADGRANT_MOUNT}/privacy and /terms in the wave
                that writes them. */}
            <a
              href={`${MAIN_SITE_URL}/privacy`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-adgrant-privacy"
              className={LINK}
            >
              Privacy
            </a>
            <a
              href={`${MAIN_SITE_URL}/terms`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-adgrant-terms"
              className={LINK}
            >
              Terms
            </a>
            <a
              href="https://www.linkedin.com/company/ad-grant-ai"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-adgrant-linkedin"
              className={LINK}
              aria-label={`${ADGRANT_MARK} on LinkedIn`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className={FOOTER_MARK}>
                <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05c.53-.95 1.82-1.95 3.75-1.95C21.4 8.69 22 11.1 22 14.24V21h-4v-6c0-1.43-.03-3.27-2-3.27-2 0-2.3 1.56-2.3 3.17V21h-4V9Z" />
              </svg>
            </a>
            <a
              href={MAIN_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-adgrant-footer-top-rated"
              className={`${LINK} inline-flex items-center gap-[0.4em]`}
            >
              <img
                src="/assets/top-rated-logo.png"
                alt=""
                aria-hidden="true"
                className="h-[1.15em] w-[1.15em] translate-y-[0.06em] object-contain"
              />
              Top-Rated Team
            </a>
          </nav>

          <p className={`mt-[var(--s3)] ${META} text-foreground`} data-testid="text-adgrant-legal-name">
            &copy; {years} {CONTRACT.legalName}
          </p>
          {/* Full width, not a measure: this is an identification line, not
              prose, and wrapping it at 46 characters made three short ragged
              lines where one sentence belongs. "This page is in English" is
              gone with them — it told a reader something the page itself had
              already told them in the first word they read. */}
          <p className={`mt-[var(--s2)] ${META_PLAIN}`}>{CONTRACT.entity}</p>
          <p className={`mt-[var(--s2)] ${META_PLAIN}`}>
            Google and related marks and logos are trademarks of Google LLC. {ADGRANT_MARK} is not affiliated with
            Google and Google does not endorse or sponsor this app.
          </p>
        </div>
      </footer>
    </div>
  );
}
