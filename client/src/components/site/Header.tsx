import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { BOOK_A_CALL_URL, MAIN_SITE_URL } from "@shared/roster";

interface NavItem {
  label: string;
  href: string;
  testid: string;
  /** Renders in the "you are here" style the main site gives its active tab. */
  current?: boolean;
}

/**
 * The main site's nav, in its order, plus one entry: this section. Everything
 * else is absolute to top-rated.team because that is a different origin — only
 * the ChatGPT Ads entry and the logo stay on this site.
 */
const NAV_ITEMS: NavItem[] = [
  { label: "ChatGPT Ads", href: "/", testid: "link-nav-chatgpt-ads", current: true },
  { label: "Home", href: `${MAIN_SITE_URL}/`, testid: "link-nav-home" },
  { label: "Services", href: `${MAIN_SITE_URL}/services`, testid: "link-nav-services" },
  { label: "Case Studies", href: `${MAIN_SITE_URL}/case-studies`, testid: "link-nav-case-studies" },
  { label: "White-Label", href: `${MAIN_SITE_URL}/white-label`, testid: "link-nav-white-label" },
  { label: "FREE leads", href: `${MAIN_SITE_URL}/leads`, testid: "link-nav-free-leads" },
  { label: "AdGrant.AI", href: "https://adgrant.ai", testid: "link-nav-adgrant.ai" },
  { label: "Team", href: `${MAIN_SITE_URL}/team`, testid: "link-nav-team" },
  { label: "Blog", href: `${MAIN_SITE_URL}/blog`, testid: "link-nav-blog" },
  { label: "Contact", href: `${MAIN_SITE_URL}/contact`, testid: "link-nav-contact" },
];

function isInternal(href: string): boolean {
  return href.startsWith("/");
}

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link href="/" data-testid="link-logo" className="flex items-center gap-2">
            <img src="/assets/top-rated-logo.png" alt="Top-Rated Team" className="h-10 w-10" />
            <span className="font-semibold text-lg">Top-Rated Team</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const button = (
                <Button
                  variant={item.current ? "secondary" : "ghost"}
                  size="sm"
                  data-testid={item.testid}
                >
                  {item.label}
                </Button>
              );
              return isInternal(item.href) ? (
                <Link key={item.testid} href={item.href}>
                  {button}
                </Link>
              ) : (
                <a key={item.testid} href={item.href}>
                  {button}
                </a>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href={BOOK_A_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:block"
            >
              <Button data-testid="button-book-call">Book A Call</Button>
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
              data-testid="button-mobile-menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="sr-only">Toggle menu</span>
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-border py-3" data-testid="nav-mobile">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const button = (
                  <Button
                    variant={item.current ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    data-testid={`${item.testid}-mobile`}
                  >
                    {item.label}
                  </Button>
                );
                return isInternal(item.href) ? (
                  <Link
                    key={item.testid}
                    href={item.href}
                    className="block"
                    onClick={() => setMobileOpen(false)}
                  >
                    {button}
                  </Link>
                ) : (
                  <a key={item.testid} href={item.href} className="block">
                    {button}
                  </a>
                );
              })}
              <a
                href={BOOK_A_CALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block sm:hidden mt-2"
              >
                <Button className="w-full" data-testid="button-book-call-mobile">
                  Book A Call
                </Button>
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

export default Header;
