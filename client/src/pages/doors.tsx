import { useEffect } from "react";

import DoorCard from "@/components/site/DoorCard";
import Footer from "@/components/site/Footer";
import GatedOffers, { PUBLIC_DOORS, countWord } from "@/components/site/GatedOffers";
import Header from "@/components/site/Header";
import { BOOK_A_CALL_URL } from "@shared/roster";

/* How many doors a stranger reads, written out. Derived rather than typed, so
 * moving a door behind the email step — a tier change in shared/doors.ts — does
 * not leave a page counting doors it no longer shows. */
const WAYS_IN = `${countWord(PUBLIC_DOORS.length)} ways in`;

const PAGE_TITLE = `${WAYS_IN.charAt(0).toUpperCase() + WAYS_IN.slice(1)} | Top-Rated Team`;
/* Named offers are deliberately left out of this sentence. Which company sits
 * on which row is a data decision, and a description that lists them by name
 * would keep naming a row the day it moves out of the public list. */
const PAGE_DESCRIPTION =
  "Paid ads, measurement and custom AI builds, as one offer per row and one workspace behind all of them. Each row says which company signs the contract and sends the invoice, and each one starts a conversation rather than a form.";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;

/**
 * The overview: one row per door, rendered straight from shared/doors.ts.
 *
 * Not every row, though — the list here is the doors a stranger reads, and the
 * rest sit under it behind one email field. Which is which is decided in
 * GatedOffers.tsx and nowhere else, so moving a row between the two is a tier
 * change in shared/doors.ts rather than an edit to this page.
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
            <p className="text-sm font-medium uppercase tracking-wide text-primary">{WAYS_IN}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">
              Each one starts a conversation, not a form.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Pick the one that sounds like your problem. If none of them do, there is a person at the bottom of this
              page.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Every row says who signs the contract and sends the invoice, because that is the part worth reading before
              you pick one.
            </p>
          </div>

          <div className="mt-12 grid max-w-4xl gap-4">
            {PUBLIC_DOORS.map((door) => (
              <DoorCard key={door.id} door={door} />
            ))}
          </div>

          {/* Under the list, and under nothing else: the rows above stay whole
              for somebody who never fills this in. */}
          <GatedOffers className="mt-12" />

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
