import { useEffect } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "wouter";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { MAIN_SITE_URL } from "@shared/roster";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none " +
  "disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";

const PRIMARY_BUTTON = `${BUTTON_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const SECONDARY_BUTTON = `${BUTTON_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;

export default function NotFound() {
  useEffect(() => {
    // Restored on unmount so client-side navigation back to the landing page
    // does not leave the browser tab claiming the page is missing.
    const previous = document.title;
    document.title = "Page not found | Top-Rated Team";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 pt-16">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground" data-testid="text-404-code">
              404
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight" data-testid="text-404-title">
              Page not found
            </h1>
            <p className="mt-4 text-muted-foreground">
              Sorry — there is nothing at this address. The link may be out of date, or a character
              may have gone missing on the way here.
            </p>
            <p className="mt-4 text-muted-foreground">
              If you were opening a workspace, copy the whole link. Everything after{" "}
              <code className="font-mono text-sm text-foreground">/w/</code> is what gets you back
              in, so a link that was cut short lands on this page.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/" className={PRIMARY_BUTTON} data-testid="link-404-home">
                <ArrowLeft />
                Back to the start
              </Link>
              <a
                href={MAIN_SITE_URL}
                className={SECONDARY_BUTTON}
                data-testid="link-404-main-site"
                rel="noopener noreferrer"
              >
                Go to top-rated.team
                <ExternalLink />
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
