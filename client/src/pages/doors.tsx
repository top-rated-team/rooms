import { useEffect } from "react";

import DoorCard from "@/components/site/DoorCard";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import { DOORS } from "@shared/doors";
import { BOOK_A_CALL_URL } from "@shared/roster";

const PAGE_TITLE = "Seven ways in | Top-Rated Team";
const PAGE_DESCRIPTION =
  "Seven offers, one workspace: ChatGPT Ads conversion tracking, Google Ads, Google Ad Grants, LinkedIn Ads, LinkedIn automation with a written legal assessment, LinkedIn growth run by a separate company, and custom AI builds. Each one starts a conversation, not a form.";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;

/**
 * The overview: one row per door, rendered straight from shared/doors.ts.
 *
 * Nothing here imports from the workspace chunk. A visitor landing on this page
 * is choosing which conversation to have, and they should not pay for a room
 * they may never open.
 */
export function Doors() {
  // Same approach as the landing page: no helmet dependency, and the previous
  // title and description are put back when the visitor navigates away.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;

    let created = false;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
      created = true;
    }
    const element = meta;
    const previousDescription = element.content;
    element.content = PAGE_DESCRIPTION;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 pt-16">
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">Seven ways in</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">
              Each one starts a conversation, not a form.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Pick the one that sounds like your problem. If none of them do, the last row is a person.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Every row says who you would actually be buying from, because that is not the same company on every row.
            </p>
          </div>

          <div className="mt-12 grid max-w-4xl gap-4">
            {DOORS.map((door) => (
              <DoorCard key={door.id} door={door} />
            ))}
          </div>

          <div className="mt-10 flex max-w-4xl flex-wrap items-center gap-4">
            <p className="text-sm text-muted-foreground">None of these?</p>
            <a
              href={BOOK_A_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-doors-book-call"
              className={BTN_SECONDARY}
            >
              Talk to a person
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Doors;
