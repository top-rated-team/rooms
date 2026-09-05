# Reference: top-rated.team header & footer (captured from production DOM)

Reproduce these in React exactly. Nav order, labels, `data-testid` values, icon
choices, class strings and copy are all load-bearing — the point is that a visitor
cannot tell this section apart from the main site.

Deltas allowed:
- `href="/services"` → `https://top-rated.team/services` (cross-origin section).
- Logo `src` → `/assets/top-rated-logo.png` (already downloaded).
- Icons come from `lucide-react` (Sun, Moon, Menu, Mail, MapPin, Award, Star).
  Upwork / LinkedIn / YouTube glyphs are inline `<svg>` paths, reproduced below.

## Header

```html
<header class="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
  <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16 gap-4">
      <a data-testid="link-logo" href="/" class="flex items-center gap-2">
        <img src="/assets/top-rated-logo.png" alt="Top-Rated Team" class="h-10 w-10">
        <span class="font-semibold text-lg">Top-Rated Team</span>
      </a>
      <div class="hidden lg:flex items-center gap-1">
        <!-- Home is the "current section" state: bg-secondary … border-secondary-border -->
        <a href="/"><button data-testid="link-nav-home" class="… hover-elevate active-elevate-2 bg-secondary text-secondary-foreground border border-secondary-border min-h-8 rounded-md px-3 text-xs">Home</button></a>
        <a href="/services"><button data-testid="link-nav-services"     class="… border border-transparent min-h-8 rounded-md px-3 text-xs">Services</button></a>
        <a href="/case-studies"><button data-testid="link-nav-case-studies" class="…">Case Studies</button></a>
        <a href="/white-label"><button data-testid="link-nav-white-label"   class="…">White-Label</button></a>
        <a href="/leads"><button data-testid="link-nav-free-leads"          class="…">FREE leads</button></a>
        <a href="https://adgrant.ai"><button data-testid="link-nav-adgrant.ai" class="…">AdGrant.AI</button></a>
        <a href="/team"><button data-testid="link-nav-team"       class="…">Team</button></a>
        <a href="/blog"><button data-testid="link-nav-blog"       class="…">Blog</button></a>
        <a href="/contact"><button data-testid="link-nav-contact" class="…">Contact</button></a>
      </div>
      <div class="flex items-center gap-2">
        <button data-testid="button-theme-toggle" class="… h-9 w-9">
          <!-- lucide Sun: h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 -->
          <!-- lucide Moon: absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 -->
          <span class="sr-only">Toggle theme</span>
        </button>
        <a href="https://calendar.app.google/ucoG2E1L6KV7BPUD7" target="_blank" rel="noopener noreferrer" class="hidden sm:block">
          <button data-testid="button-book-call" class="… bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2">Book A Call</button>
        </a>
        <button data-testid="button-mobile-menu" class="… h-9 w-9 lg:hidden"><!-- lucide Menu h-5 w-5 --></button>
      </div>
    </div>
  </nav>
</header>
```

Full nav button base class (used by every nav button; the three variants only differ
in the trailing background/border segment):

```
inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none
[&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2
```

Nav model (order matters):

| Label | href | testid |
|---|---|---|
| Home | `/` | `link-nav-home` |
| Services | `/services` | `link-nav-services` |
| Case Studies | `/case-studies` | `link-nav-case-studies` |
| White-Label | `/white-label` | `link-nav-white-label` |
| FREE leads | `/leads` | `link-nav-free-leads` |
| AdGrant.AI | `https://adgrant.ai` | `link-nav-adgrant.ai` |
| Team | `/team` | `link-nav-team` |
| Blog | `/blog` | `link-nav-blog` |
| Contact | `/contact` | `link-nav-contact` |

The header is `fixed`, so page content starts with `pt-16`.

Mobile (`lg:hidden`): the menu button opens the same nav list stacked vertically
inside the header shell.

## Footer

```html
<footer class="bg-card border-t border-card-border">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">

      <!-- col 1 -->
      <div class="col-span-2 md:col-span-1">
        <a href="/" class="flex items-center gap-2 mb-4">
          <img src="/assets/top-rated-logo.png" alt="Top-Rated Team" class="h-5 w-5">
          <h4 class="font-semibold">Top-Rated Team</h4>
        </a>
        <p class="text-sm text-muted-foreground mb-4">Expert Google Ads management with 8+ years of experience. No magic, just expertise and dedicated hours.</p>
        <div class="flex items-center gap-3 mb-4">
          <!-- each: w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover-elevate, svg h-4 w-4 -->
          <a href="https://www.upwork.com/agencies/1190237004117893120/" aria-label="Upwork"   data-testid="link-social-upwork">…</a>
          <a href="https://www.linkedin.com/company/googler/"            aria-label="LinkedIn" data-testid="link-social-linkedin">…</a>
          <a href="https://www.youtube.com/channel/UCuVlgtYmRpxa7SbLzdZlsFg" aria-label="YouTube" data-testid="link-social-youtube">…</a>
        </div>
      </div>

      <!-- col 2 --> <div><h4 class="font-semibold mb-4">Quick Links</h4><ul class="space-y-2">…</ul></div>
      <!-- col 3 --> <div><h4 class="font-semibold mb-4">Services</h4><ul class="space-y-2">…</ul></div>
      <!-- col 4 --> <div><h4 class="font-semibold mb-4">Contact</h4><ul class="space-y-3">…</ul>…</div>
    </div>

    <div class="mt-12 pt-8 border-t border-border">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-sm text-muted-foreground">© 2026 Top-Rated Team. All rights reserved.</p>
        <div class="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Google Barcelona &amp; Lisbon Contractors</span>
          <span class="hidden sm:inline">|</span>
          <span>Founded 2017</span>
        </div>
      </div>
    </div>
  </div>
</footer>
```

**Quick Links** (`text-sm text-muted-foreground hover:text-foreground transition-colors`):
Home `/`, Services `/services`, Case Studies `/case-studies`, White-Label `/white-label`,
FREE leads `/leads`, Google Ad Grant AI `https://adgrant.ai`, Team `/team`, Blog `/blog`,
Contact `/contact`.

**Services** — all plain `<span class="text-sm text-muted-foreground">` except "FREE leads"
which links to `/leads`: Google Ads Management, Performance Max Campaigns, Local Service Ads,
Lead Generation, B2B SaaS Marketing, eCommerce Advertising, White-Label PPC, FREE leads,
Google Ad Grants.

**Contact** — `<ul class="space-y-3">`:
- lucide `Mail` (`h-4 w-4 mt-0.5 shrink-0`) + link "Email us" → `https://top-rated.team/api/email/contact`
- lucide `MapPin` (same classes) + `Prague, Kyiv, Madeira`

then `<div class="mt-6 space-y-2">` with two `flex items-center gap-2 text-xs text-muted-foreground` rows:
- lucide `Award` `h-4 w-4 text-primary` + "Google Ads Partner Top 10%"
- lucide `Star` `h-4 w-4 text-yellow-500` + "Official Google Ads Trainers"

## Brand social glyphs (inline SVG paths, `viewBox="0 0 24 24"`, `fill="currentColor"`)

**Upwork**

```
M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06 1.492 0 2.703 1.212 2.703 2.703-.001 1.489-1.212 2.702-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112c-.002 1.406-1.141 2.546-2.547 2.548-1.405-.002-2.543-1.143-2.545-2.548V3.492H0v7.112c0 2.914 2.37 5.303 5.281 5.303 2.913 0 5.283-2.389 5.283-5.303v-1.19c.529 1.107 1.182 2.229 1.974 3.221l-1.673 7.873h2.797l1.213-5.71c1.063.679 2.285 1.109 3.686 1.109 3 0 5.439-2.452 5.439-5.45 0-3-2.439-5.439-5.439-5.439z
```

**LinkedIn**

```
M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z
```

**YouTube**

```
M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z
```
