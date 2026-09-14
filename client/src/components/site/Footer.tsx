import { lazy, Suspense, useState } from "react";
import { useRoute, Link } from "wouter";
import { RoomMenu } from "@/components/site/RoomMenu";

import { DEFAULT_DOOR_ID, DOOR_BY_ID, DOOR_BY_SLUG, type DoorContract, type DoorDef } from "@shared/doors";
import { GITHUB_URL } from "@shared/roster";

const LeadDialog = lazy(() => import("@/components/site/LeadDialog").then((m) => ({ default: m.LeadDialog })));

/* ---------------------------------------------------------------------------
 * THE FOOTER
 *
 * It was 550 pixels tall and carried seventeen links, nine service names, three
 * social icons, two award badges, a marketing paragraph and a line about
 * contractors in Barcelona and Lisbon — on every page, under every offer,
 * taller than the pitch above it. On a door page the chrome links outnumbered
 * the links belonging to the offer about seven to one.
 *
 * What is left is who runs this website, in the name that would be on a
 * contract, how to reach them, three products of ours that otherwise have no
 * standing link from a page, and the two files an arriving agent reads. The
 * identification line is the one place the legal name is allowed to appear, and
 * it is not edited here. Everything else that used to live in this footer was
 * either a page on another domain that this site's visitor did not come for, or
 * a list of services that is not an offer and cannot be clicked anyway.
 *
 * THE PAGE THAT IS NOT OURS
 *
 * This footer still prints under a door whose work belongs to another company.
 * A footer is where a person looks to find out who they are dealing with, so
 * stripping it there would answer that question with nobody — on a page
 * somebody does publish and is answerable for. It names both instead, and says
 * which is which, with their terms and their address where those exist and a
 * plain statement that ours are not a stand-in where they do not.
 *
 * Which pages those are is not written down here. The footer reads the door out
 * of the address it is standing on and compares its contract with the contract
 * on the door that pays for the site. Hand a door to another company in
 * shared/doors.ts and this appears on it; take it back and it goes. The partner
 * name is read off that row, so correcting a legal name is a change to the row
 * and to nothing else.
 * ------------------------------------------------------------------------- */

/** The contract on the door that runs this site, read off the row rather than typed again. */
const OURS: DoorContract = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;

/** `contact` is either an email address or the address of a page, and a link has to know which. */
function contactHref(contact: string): string {
  return /^(https?:\/\/|mailto:|\/)/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * The contract of the door this page is, when that door belongs to somebody
 * else. `null` on our own doors and on every page that is not a door.
 */
function useSomebodyElsesDoor(): DoorContract | null {
  const [onDoorPage, params] = useRoute<{ slug: string }>("/services/:slug");
  if (!onDoorPage || !params) return null;
  const door: DoorDef | undefined = DOOR_BY_SLUG[params.slug];
  /* A hidden door's page answers "Page not found", and the footer still runs
     under it — so without this test the 404 for a withheld partner door
     printed that partner's contract block, which is the one thing the door
     was hidden to stop. */
  if (!door || door.hidden) return null;
  return door.contract.legalName === OURS.legalName ? null : door.contract;
}

const LINK = "draw draw-on text-muted-foreground hover:text-foreground";
/**
 * A mark, not a word: `.draw` under a glyph reads as a strikethrough rather
 * than as a link, which the owner saw and asked to stop. Colour instead —
 * muted at rest, the accent on hover and on keyboard focus, with the focus ring
 * drawn explicitly because dropping `.draw` also drops the state it carried.
 * The same class exists in Header.tsx for the same mark.
 */
const MARK_LINK =
  "text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-[2px]";

/** Same row as Terms, without the always-on underline — filenames, not labels. */
const LINK_QUIET = "draw text-muted-foreground hover:text-foreground [text-transform:none]";
/* One constant for all four marks, so "a little lower" is one number and not
   four. The GitHub one was already nudged to sit on the row's centre line;
   the others line up to it. */
/*
 * THE NUDGE IS GONE AND THE MARKS ARE BIGGER.
 *
 * translate-y-[0.19em] was measured when this row was laid out on the
 * baseline; the row is items-center now, so the flexbox was already centring
 * them and the nudge only pushed all four down by a fifth of an em. That is
 * what "not in one line" looked like.
 *
 * 1.45em rather than 1.15: a glyph in a face this size reads at about its
 * cap-height, an icon reads at its full box, so an icon set to the same em as
 * the text looks smaller than the words beside it.
 */
const MARK = "h-[1.45em] w-[1.45em] fill-current";
/* The four marks are one thing in the row, so they sit closer to each other
   than to the words on either side. */
const MARKS = "inline-flex items-center gap-x-[var(--s2)]";

export function Footer() {
  const theirs = useSomebodyElsesDoor();
  const [messageOpen, setMessageOpen] = useState(false);
  /* The year a person is reading in, not the year this was written in. */
  const year = new Date().getFullYear();

  return (
    <footer data-testid="site-footer" className="mt-[var(--s6)] border-t border-border">
      <div className="mx-auto max-w-[var(--page)] px-[var(--s3)] pb-[var(--s5)] pt-[var(--s3)]">
        {theirs ? (
          <div data-testid="block-footer-not-ours" className="mb-[var(--s3)] max-w-[68ch]">
            <p className="type-note text-muted-foreground" data-testid="text-footer-their-work">
              The work on this page is {theirs.legalName}&rsquo;s. {theirs.invoiceLine} Everything below is{" "}
              {OURS.legalName}, which publishes this website and does not sign that work, invoice it or answer for it.
            </p>
            <p className="type-note mt-[var(--s1)] text-muted-foreground">
              {theirs.termsUrl ? (
                <>
                  <a
                    href={theirs.termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-footer-their-terms"
                    className={LINK}
                  >
                    {theirs.legalName}&rsquo;s terms
                  </a>{" "}
                  cover it.
                </>
              ) : (
                <>
                  {theirs.legalName} has not published terms for it yet, and this site will not show anybody else&rsquo;s
                  in their place.
                </>
              )}{" "}
              {theirs.contact ? (
                <>
                  Write to them at{" "}
                  <a
                    href={contactHref(theirs.contact)}
                    rel="noopener noreferrer"
                    data-testid="link-footer-their-contact"
                    className={LINK}
                  >
                    {theirs.contactLabel ?? theirs.contact}
                  </a>
                  . The address below is ours and is not a way to reach them.
                </>
              ) : (
                <>
                  {theirs.legalName} has not given an address for it yet, and the address below is ours rather than a way
                  to reach them.
                </>
              )}
            </p>
          </div>
        ) : null}

        {/* ONE ROW, above the identification line, on the owner's order. It
            was two navs a paragraph apart — products in the first, legal and
            files in the second — so a reader looking for terms had to find
            the one further down. Marks sit where a word would, and each is a
            real destination rather than a badge. Inline SVG: they inherit the
            theme and cost no request, which is why the GitHub one already
            was one. */}
        <nav
          aria-label="Top-Rated Team"
          className="type-note mb-[var(--s2)] flex flex-wrap items-center gap-x-[var(--s3)] gap-y-[var(--s1)]"
        >
          <a
            href="https://partnersdirectory.withgoogle.com/partners/6664496343"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-google-partner"
            className={LINK}
          >
            Google Partner
          </a>
          <a
            href="https://adgrant.ai"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-adgrant"
            className={LINK}
          >
            AdGrant.AI
          </a>
          <Link href="/terms" data-testid="link-footer-terms" className={LINK}>
            Terms
          </Link>
          <Link href="/privacy" data-testid="link-footer-privacy" className={LINK}>
            Privacy
          </Link>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            data-testid="link-footer-contact"
            className={LINK}
          >
            Contact
          </button>
          <span className={MARKS}>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-github"
            className={`${MARK_LINK} inline-flex items-center`}
            aria-label="This site's source on GitHub"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className={MARK}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <a
            href="https://www.upwork.com/ag/google"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-upwork"
            className={`${MARK_LINK} inline-flex items-center`}
            aria-label="Top-Rated Team on Upwork"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className={MARK}>
              <path d="M18.56 5.1c-2.2 0-3.93 1.43-4.63 3.78-1.07-1.6-1.87-3.53-2.34-5.15H9.13v6.22a2.23 2.23 0 1 1-4.46 0V3.73H2.21v6.22a4.69 4.69 0 0 0 9.38 0V8.9c.46.96 1.03 1.96 1.71 2.84l-1.46 6.86h2.51l1.05-4.97c.93.6 1.99.96 3.16.96 2.57 0 4.66-2.1 4.66-4.74 0-2.64-2.09-4.75-4.66-4.75Zm0 7.02c-.89 0-1.77-.38-2.49-1l.24-.96v-.02c.17-1 .71-2.68 2.25-2.68 1.16 0 2.1.94 2.1 2.33 0 1.28-.94 2.33-2.1 2.33Z" />
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/company/googler"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-linkedin"
            className={`${MARK_LINK} inline-flex items-center`}
            aria-label="Top-Rated Team on LinkedIn"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className={MARK}>
              <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05c.53-.95 1.82-1.95 3.75-1.95C21.4 8.69 22 11.1 22 14.24V21h-4v-6c0-1.43-.03-3.27-2-3.27-2 0-2.3 1.56-2.3 3.17V21h-4V9Z" />
            </svg>
          </a>
          <a
            href="https://www.youtube.com/@TopRatedTeam"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-youtube"
            className={`${MARK_LINK} inline-flex items-center`}
            aria-label="Top-Rated Team on YouTube"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className={MARK}>
              <path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2C0 8.09 0 12 0 12s0 3.91.5 5.8a3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14C24 15.91 24 12 24 12s0-3.91-.5-5.8ZM9.6 15.57V8.43L15.82 12 9.6 15.57Z" />
            </svg>
          </a>
          </span>
          {/* Real anchors, not wouter Links: these are files in client/public
              and a client-side route would 404 them. */}
          <a href="/llms.txt" data-testid="link-footer-llms" className={LINK_QUIET}>
            llms.txt
          </a>
          <a href="/llms-full.txt" data-testid="link-footer-llms-full" className={LINK_QUIET}>
            llms-full.txt
          </a>
        </nav>

        <p className="type-meta text-muted-foreground" data-testid="text-footer-operator">
          &copy; 2017&ndash;{year} {OURS.legalName} &mdash; Prague, Madeira, Kyiv, Bratislava, Batumi
        </p>
      </div>
      {/* Lazy, like every other caller: the footer is on every page and this
          dialog is opened on almost none of them. */}
      {messageOpen ? (
        <Suspense fallback={null}>
          <LeadDialog open={messageOpen} onOpenChange={setMessageOpen} prefill={null} />
        </Suspense>
      ) : null}
    </footer>
  );
}

export default Footer;
