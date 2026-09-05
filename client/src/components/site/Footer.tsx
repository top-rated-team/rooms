import { Link } from "wouter";
import { Award, Mail, MapPin, Star } from "lucide-react";

import { MAIN_SITE_URL } from "@shared/roster";

interface FooterLink {
  label: string;
  href: string;
  testid: string;
}

/** The main site's footer nav, made absolute because this is a different origin. */
const QUICK_LINKS: FooterLink[] = [
  { label: "Home", href: `${MAIN_SITE_URL}/`, testid: "link-footer-home" },
  { label: "Services", href: `${MAIN_SITE_URL}/services`, testid: "link-footer-services" },
  { label: "Case Studies", href: `${MAIN_SITE_URL}/case-studies`, testid: "link-footer-case-studies" },
  { label: "White-Label", href: `${MAIN_SITE_URL}/white-label`, testid: "link-footer-white-label" },
  { label: "FREE leads", href: `${MAIN_SITE_URL}/leads`, testid: "link-footer-free-leads" },
  { label: "Google Ad Grant AI", href: "https://adgrant.ai", testid: "link-footer-adgrant" },
  { label: "Team", href: `${MAIN_SITE_URL}/team`, testid: "link-footer-team" },
  { label: "Blog", href: `${MAIN_SITE_URL}/blog`, testid: "link-footer-blog" },
  { label: "Contact", href: `${MAIN_SITE_URL}/contact`, testid: "link-footer-contact" },
];

/** The catalogue, unlinked on the main site too — this is a list, not a menu. */
const SERVICES = [
  "Google Ads Management",
  "Performance Max Campaigns",
  "Local Service Ads",
  "Lead Generation",
  "B2B SaaS Marketing",
  "eCommerce Advertising",
  "White-Label PPC",
  "FREE leads",
  "Google Ad Grants",
];

interface SocialLink {
  label: string;
  href: string;
  testid: string;
  /** lucide has no brand marks, so the glyphs are inline 24×24 paths. */
  path: string;
}

const SOCIALS: SocialLink[] = [
  {
    label: "Upwork",
    href: "https://www.upwork.com/agencies/1190237004117893120/",
    testid: "link-social-upwork",
    path: "M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06 1.492 0 2.703 1.212 2.703 2.703-.001 1.489-1.212 2.702-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112c-.002 1.406-1.141 2.546-2.547 2.548-1.405-.002-2.543-1.143-2.545-2.548V3.492H0v7.112c0 2.914 2.37 5.303 5.281 5.303 2.913 0 5.283-2.389 5.283-5.303v-1.19c.529 1.107 1.182 2.229 1.974 3.221l-1.673 7.873h2.797l1.213-5.71c1.063.679 2.285 1.109 3.686 1.109 3 0 5.439-2.452 5.439-5.45 0-3-2.439-5.439-5.439-5.439z",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/googler/",
    testid: "link-social-linkedin",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/channel/UCuVlgtYmRpxa7SbLzdZlsFg",
    testid: "link-social-youtube",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
];

export function Footer() {
  return (
    <footer className="bg-card border-t border-card-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4" data-testid="link-footer-logo">
              <img src="/assets/top-rated-logo.png" alt="Top-Rated Team" className="h-5 w-5" />
              <h4 className="font-semibold">Top-Rated Team</h4>
            </Link>
            <p className="text-sm text-muted-foreground mb-4">
              Expert Google Ads management with 8+ years of experience. No magic, just expertise and
              dedicated hours.
            </p>
            <div className="flex items-center gap-3 mb-4">
              {SOCIALS.map((social) => (
                <a
                  key={social.testid}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  data-testid={social.testid}
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover-elevate"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              {QUICK_LINKS.map((link) => (
                <li key={link.testid}>
                  <a
                    href={link.href}
                    data-testid={link.testid}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Services</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  data-testid="link-footer-chatgpt-ads"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ChatGPT Ads Conversion Tracking
                </Link>
              </li>
              {SERVICES.map((service) => (
                <li key={service}>
                  <span className="text-sm text-muted-foreground">{service}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                <a
                  href={`${MAIN_SITE_URL}/api/email/contact`}
                  data-testid="link-footer-email"
                  className="hover:text-foreground transition-colors"
                >
                  Email us
                </a>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Prague, Kyiv, Madeira</span>
              </li>
            </ul>
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Award className="h-4 w-4 text-primary" />
                <span>Google Ads Partner Top 10%</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>Official Google Ads Trainers</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">© 2026 Top-Rated Team. All rights reserved.</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Google Barcelona &amp; Lisbon Contractors</span>
              <span className="hidden sm:inline">|</span>
              <span>Founded 2017</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
