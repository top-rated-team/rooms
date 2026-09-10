import { lazy, Suspense, useState } from "react";
import { Link } from "wouter";

import { CASES } from "@shared/cases";
import { BOOK_A_CALL_URL } from "@shared/roster";
import { LINK, META, PAGE, READ_MUTED } from "@/components/site/doors/quiet";
import { useBooking } from "@/hooks/use-booking";

/* ---------------------------------------------------------------------------
 * THREE WAYS THAT ARE NOT THE PANEL
 *
 * Every surface on this site funnels to one thing: ask an agent a question, and
 * keep the answer if it is worth keeping. That is a good funnel and it is the
 * wrong funnel for some of the people arriving.
 *
 * A visitor may simply want a person. They may want to send something and read
 * a reply tomorrow. They may want to see what we have actually done before they
 * talk to anybody at all. None of those is served by a box that answers
 * questions, and a site that offers only the box tells that visitor to leave.
 *
 * So: book a call, leave a message, read the cases. It sits on the home page and
 * on every door, ABOVE the panel — before the room, not after it, because
 * somebody who wanted a human should not have to work out that the chat is not
 * the only door.
 *
 * The message form is the LeadDialog the redesign unmounted from six places. It
 * still works and still lands in the one inbox, so this is a re-mount rather
 * than a second mechanism — and a form beats a mailto here, because a mailto
 * needs a mail client the visitor may not have and leaves us no record.
 *
 * It is lazily loaded: LeadDialog pulls in Radix, and the landing chunk is what
 * paid traffic downloads first.
 * ------------------------------------------------------------------------- */


const ACTION_LINE = "type-body font-medium";

export interface TalkToUsProps {
  /** Set on a door page, where this sits inside the page's own rhythm. */
  className?: string;
}

export function TalkToUs({ className = "" }: TalkToUsProps) {
  const booking = useBooking();

  return (
    <section className={`${PAGE} ${className}`} data-testid="block-talk-to-us">
      <div className="grid gap-[var(--s3)] border-t border-border pt-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
        <div>
          <p className={META}>Or skip the agent</p>
          <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
            The panel is free and it answers from documentation, but it is not the only way in. If you would rather
            talk to a person, or send something and read a reply tomorrow, do that instead.
          </p>
        </div>

        <div className="flex flex-col gap-[var(--s2)]">
          <p className={ACTION_LINE}>
            <a
              href={BOOK_A_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-book-a-call"
              className={LINK}
              {...booking}
            >
              Book a call
            </a>
            <span className={`ml-[var(--s2)] ${META}`}>20 minutes, free, with a person who does the work</span>
          </p>

          {/* "Message us" is the footer's Contact now, everywhere — the
              owner's instruction. Worth knowing that this block is the one
              place whose whole job was to list the ways to reach a person, so
              it is now shorter by the one that reaches an inbox. Say the word
              and it comes back here alone. */}

          {/* A fourth way, on the owner's instruction, and it is the only one
              here that reaches a person in a minute rather than a day. The
              number is shown rather than hidden behind a word: it is what
              somebody recognises, and on a desktop it is what they copy. */}
          <p className={ACTION_LINE}>
            <Link href="/case-studies" data-testid="link-case-studies" className={LINK}>
              Read the cases
            </Link>
            {/* Counted rather than written: it said "two real accounts" for as
                long as there were two, and there are twenty-two. */}
            <span className={`ml-[var(--s2)] ${META}`}>What the work did to {CASES.length} real accounts</span>
          </p>
        </div>
      </div>

    </section>
  );
}

export default TalkToUs;
