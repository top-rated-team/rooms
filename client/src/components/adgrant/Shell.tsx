import type { ReactNode } from "react";
import { Link } from "wouter";

import { DOOR_BY_ID } from "@shared/doors";
import { ADGRANT_ACCENT_WRAP, ADGRANT_MARK } from "@/components/site/doors/adgrant-style";
import { LINK, META, META_PLAIN, PAGE } from "@/components/site/doors/quiet";
import { useTheme } from "@/hooks/use-theme";
import { ADGRANT_MOUNT } from "@/components/adgrant/mount";

const DOOR = DOOR_BY_ID["ad-grants"];
const CONTRACT = DOOR.contract;

const NAV_LINK = "type-meta draw text-muted-foreground hover:text-foreground";

function contactHref(contact: string): string {
  return /^(https?:\/\/|mailto:|\/)/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * AdGrant.AI's own chrome. It does not import the site header or footer: those
 * name Top-Rated Team's other offers, and this front has to be able to move to
 * its own host without dragging them with it.
 *
 * `data-site-chrome` is the type scale. `--primary` is remapped to `--chart-2`
 * here and only here, which is the accent adgrant-style.ts already set.
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
        <div className={`${PAGE} flex items-center justify-between gap-[var(--s3)] py-[var(--s2)]`}>
          <Link
            href={ADGRANT_MOUNT}
            data-testid="link-adgrant-mark"
            className="font-sans text-[1.0625rem] font-medium tracking-[0.13em] text-foreground [text-transform:none]"
          >
            {ADGRANT_MARK}
          </Link>
          <button
            type="button"
            data-testid="button-adgrant-theme"
            onClick={() => setTheme(next)}
            className={`${NAV_LINK} [text-transform:none!important]`}
          >
            {next === "dark" ? "Dark" : "Light"}
            <span className="sr-only"> theme</span>
          </button>
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
            aria-label="AdGrant.AI"
            className="type-meta mt-[var(--s3)] flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]"
          >
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
            <Link href="/w" data-testid="link-adgrant-rooms" className={LINK}>
              Rooms you have kept
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
