import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";

import type { CreateWorkspaceResponse } from "@shared/api";
import { BOOK_A_CALL_URL } from "@shared/roster";
import DoorCard from "@/components/site/DoorCard";
import { ACTION_QUIET, DISPLAY, LINK, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import Footer from "@/components/site/Footer";
import GatedOffers, { LISTED_DOORS, PUBLIC_DOORS, countWord } from "@/components/site/GatedOffers";
import Header from "@/components/site/Header";
import { collectSource } from "@/components/site/LeadDialog";

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

/** The count, in the index's own words, so the heading cannot outlive the list. */
const INDEX_HEADLINE = `${countWord(PUBLIC_DOORS.length).charAt(0).toUpperCase()}${countWord(
  PUBLIC_DOORS.length,
).slice(1)} services. Pick the one that sounds like your problem.`;

/**
 * The index: one line per door, rendered straight from shared/doors.ts.
 *
 * Not every row, though — the list here is the doors a stranger reads, and the
 * rest sit under it behind one email field. Which is which is decided in
 * GatedOffers.tsx and nowhere else, so moving a row between the two is a tier
 * change in shared/doors.ts rather than an edit to this page.
 *
 * It used to be six bordered cards with two chips and two buttons each. It is
 * now a table of contents: a number, a name, what it is, and the company that
 * would send the invoice. Nothing here imports from the workspace chunk — a
 * visitor choosing which conversation to have should not pay for a room they
 * may never open — except the one line at the bottom that opens one, which is
 * a fetch and a redirect rather than an import.
 */
export function Doors() {
  const [, navigate] = useLocation();
  const [openingRoom, setOpeningRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Same approach as the door pages: no helmet dependency, and the previous
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

  /**
   * The one visible way through to the room from this page, and the same
   * sentence a door page uses. There is no door to stamp it with here, so
   * collectSource() falls back to the door that runs the site — which is the
   * company whose name the room will print, and it is the right one.
   */
  const openRoom = useCallback(async () => {
    if (openingRoom) return;
    setOpeningRoom(true);
    setRoomError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: collectSource() }),
      });
      if (!res.ok) {
        setRoomError(
          res.status === 429
            ? "That is a lot of workspaces from one address. Give it a minute, or book a call."
            : "The workspace could not be created. Book a call and we will pick it up from there.",
        );
        return;
      }
      const state = (await res.json()) as CreateWorkspaceResponse;
      navigate(`/w/${state.workspace.token}`);
    } catch {
      setRoomError("Network error creating the workspace. Book a call and we will pick it up from there.");
    } finally {
      setOpeningRoom(false);
    }
  }, [navigate, openingRoom]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className={`${PAGE} pt-[var(--s5)]`}>
          <p className={META}>Index</p>

          <div className="mt-[var(--s4)] grid items-end gap-[var(--s4)] pb-[var(--s5)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
            <h1 className={DISPLAY}>{INDEX_HEADLINE}</h1>
            <p className={READ_MUTED}>
              Each one opens a conversation rather than a form. Where a service is contracted, delivered and invoiced by
              a different company, its own page says so and the room you keep repeats it in the footer — which is where
              that belongs rather than in a column on a list.
            </p>
          </div>

          <div>
            {LISTED_DOORS.map((door, position) => (
              <DoorCard key={door.id} door={door} index={position + 1} />
            ))}
          </div>

          {/* Under the list, and under nothing else: the rows above stay whole
              for somebody who never fills this in. */}
          <GatedOffers className="mt-[var(--s6)]" />

          <div className="max-w-[46ch] pt-[var(--s6)]">
            <p className={READ}>
              If none of these sounds like your problem, a person is the shorter path.{" "}
              <a
                href={BOOK_A_CALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-doors-book-call"
                className={LINK}
              >
                Take a call
              </a>
              .
            </p>

            <p className={`mt-[var(--s3)] ${READ_MUTED}`}>
              Whichever row you pick, the answer can become a room: one address, our agents and our people in it, and no
              signup — the link in your browser is the whole account.
            </p>
            <button
              type="button"
              data-testid="button-doors-open-room"
              className={`${ACTION_QUIET} mt-[var(--s3)]`}
              onClick={() => void openRoom()}
              disabled={openingRoom}
            >
              {openingRoom ? "Opening a room…" : "Open one without asking anything first"}
            </button>
            {roomError ? (
              <p role="alert" className="type-note mt-[var(--s2)] text-destructive">
                {roomError}
              </p>
            ) : null}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Doors;
