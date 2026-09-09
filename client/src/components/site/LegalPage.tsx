import { useEffect, type ReactNode } from "react";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import { DISPLAY, HEADING, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * THE SHELL THE TWO LEGAL PAGES SHARE
 *
 * /privacy and /terms both 404'd for months. The footer linked to /terms and
 * every door's contract row linked to it too, and the single-page shell
 * answers 200 on any address, so a link checker saw a page and a reader saw
 * "Page not found". Google's brand review saw the same thing and reported it
 * as "does not have sufficient content", which was generous.
 *
 * These pages are read linearly rather than scanned, so they hold one measure
 * rather than the two-column grid the rest of the site uses. Nothing here is
 * a card, an accordion or a modal: a policy somebody has to expand to read is
 * a policy written to be skipped.
 *
 * The date is the one thing that must not be automatic. A "last updated" that
 * follows the clock tells a reader the document changed when it did not.
 * ------------------------------------------------------------------------- */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-[var(--s5)]">
      <h2 className={HEADING}>{title}</h2>
      <div className="mt-[var(--s2)] space-y-[var(--s2)]">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className={`${READ} m-0`}>{children}</p>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className={`${READ_MUTED} m-0`}>{children}</p>;
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl className="m-0 mt-[var(--s2)] grid gap-[var(--s2)]">{children}</dl>;
}

export function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-[var(--s1)] border-t border-border pt-[var(--s2)] sm:grid-cols-[16rem_1fr] sm:gap-[var(--s3)]">
      <dt className={`${META} sm:pt-[0.15em]`}>{term}</dt>
      <dd className={`${READ} m-0`}>{children}</dd>
    </div>
  );
}

interface LegalPageProps {
  title: string;
  updated: string;
  documentTitle: string;
  description: string;
  standfirst: ReactNode;
  children: ReactNode;
}

export function LegalPage({ title, updated, documentTitle, description, standfirst, children }: LegalPageProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = documentTitle;

    let element = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = element === null;
    const previousDescription = element?.content ?? "";
    if (!element) {
      element = document.createElement("meta");
      element.name = "description";
      document.head.appendChild(element);
    }
    element.content = description;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, [documentTitle, description]);

  return (
    <div className="min-h-screen bg-background" data-site-chrome>
      <Header />
      <main>
        <section className={`${PAGE} pt-[var(--s5)]`}>
          <div className="max-w-[68ch]">
            <p className={META}>Legal</p>
            <h1 className={`${DISPLAY} m-0 mt-[var(--s2)]`}>{title}</h1>
            <p className={`${META} mt-[var(--s2)]`}>Last updated {updated}</p>
            <div className="mt-[var(--s3)] space-y-[var(--s2)]">{standfirst}</div>
            {children}
          </div>
        </section>
        <div className="pb-[var(--s6)]" />
      </main>
      <Footer />
    </div>
  );
}
