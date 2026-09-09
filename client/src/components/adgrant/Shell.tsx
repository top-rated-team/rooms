import type { ReactNode } from "react";
import { Link } from "wouter";

import { DOOR_BY_ID } from "@shared/doors";
import { MAIN_SITE_URL } from "@shared/roster";
import { ADGRANT_ACCENT_WRAP, ADGRANT_MARK } from "@/components/site/doors/adgrant-style";
import { LINK, META, META_PLAIN, PAGE } from "@/components/site/doors/quiet";
import { useTheme } from "@/hooks/use-theme";
import { mountHome } from "@/components/adgrant/links";
import { ADGRANT_SECTIONS } from "@/components/adgrant/sections";

const DOOR = DOOR_BY_ID["ad-grants"];
const CONTRACT = DOOR.contract;

const NAV_LINK = "type-meta draw text-muted-foreground hover:text-foreground";

function contactHref(contact: string): string {
  return /^(https?:\/\/|mailto:|\/)/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * AdGrant.AI's own chrome. It does not import the site header or footer.
 * Internal links go through ADGRANT_MOUNT so the tree can move to its own host
 * without pointing at the other product's home. The menu and footer link back
 * to top-rated.team as a different site, not as this one.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  const year = new Date().getFullYear();

  return (
    <div className={`${ADGRANT_ACCENT_WRAP} flex min-h-screen flex-col bg-background`} data-site-chrome>
      <header
        data-testid="adgrant-header"
        className="sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-sm"
      >
        <div className={`${PAGE} flex flex-wrap items-baseline justify-between gap-x-[var(--s3)] gap-y-[var(--s1)] py-[var(--s2)]`}>
          <Link
            href={mountHome()}
            data-testid="link-adgrant-mark"
            className="font-sans text-[1.0625rem] font-medium tracking-[0.13em] text-foreground [text-transform:none]"
          >
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
            <a
              href={MAIN_SITE_URL}
              data-testid="link-adgrant-top-rated"
              className={NAV_LINK}
            >
              Top-Rated Team
            </a>
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
          <p className={`${META} text-foreground`} data-testid="text-adgrant-legal-name">
            &copy; {year} {CONTRACT.legalName}
          </p>
          <p className={`mt-[var(--s2)] max-w-[46ch] ${META_PLAIN}`}>{CONTRACT.entity}</p>
          <p className={`mt-[var(--s2)] max-w-[46ch] ${META_PLAIN}`}>
            Google and related marks and logos are trademarks of Google LLC. {ADGRANT_MARK} is not affiliated with
            Google and Google does not endorse or sponsor this app.
          </p>
          <p className={`mt-[var(--s2)] ${META_PLAIN}`}>This page is in English.</p>

          <nav
            aria-label={`${ADGRANT_MARK} footer`}
            className="type-meta mt-[var(--s3)] flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]"
          >
            {ADGRANT_SECTIONS.map((section) => (
              <Link key={section.segment} href={section.path} className={LINK}>
                {section.name}
              </Link>
            ))}
            {CONTRACT.termsUrl ? (
              <a
                href={CONTRACT.termsUrl}
                rel="noopener noreferrer"
                data-testid="link-adgrant-terms"
                className={LINK}
              >
                Terms
              </a>
            ) : null}
            {CONTRACT.contact ? (
              <a
                href={contactHref(CONTRACT.contact)}
                rel="noopener noreferrer"
                data-testid="link-adgrant-contact"
                className={LINK}
              >
                {CONTRACT.contactLabel ?? CONTRACT.contact}
              </a>
            ) : null}
            <a href={MAIN_SITE_URL} data-testid="link-adgrant-footer-top-rated" className={LINK}>
              Top-Rated Team
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
