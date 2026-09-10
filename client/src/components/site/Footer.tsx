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
  if (!door) return null;
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

        <nav
          aria-label="Products"
          className="type-note mb-[var(--s2)] flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]"
        >
          <Link href="/services/google-ads" data-testid="link-footer-google-ads" className={LINK}>
            Google Ads
          </Link>
          <a
            href="https://adgrant.ai"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-adgrant"
            className={LINK}
          >
            AdGrant.AI
          </a>
          <a
            href="https://being.marketing"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-being"
            className={LINK}
          >
            Being.<s className="line-through">Marketing</s>
          </a>
          {/* The source, as the mark rather than as a word — the white-label
              offer is "run this yourself" and this is where you go and do it.
              Inline SVG so it inherits the theme and costs no request. */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-footer-github"
            className={`${MARK_LINK} inline-flex items-center`}
            aria-label="This site's source on GitHub"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[1.15em] w-[1.15em] translate-y-[0.19em] fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </nav>

        <div className="flex flex-wrap items-baseline justify-between gap-x-[var(--s4)] gap-y-[var(--s2)]">
          <p className="type-meta text-muted-foreground" data-testid="text-footer-operator">
            &copy; 2017&ndash;{year} {OURS.legalName} &mdash; Prague, Madeira, Kyiv, Bratislava, Batumi
          </p>
          <nav className="type-meta flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]">
            {/* The way back to a room you already kept. One place, in words, at
                the end of the scroll — the site's only standing link to /w. The
                page itself explains, in one sentence, why there are none when a
                browser remembers none. */}
            {/* The same control the masthead and the hero carry, so the way
                back into a room is one thing with one name everywhere rather
                than a link here and a menu there. */}
            <RoomMenu className={LINK} testId="button-footer-open-a-room" />
            {/* Our own two pages, so they are Links rather than anchors with a
                target: they were external URLs back when this application did
                not serve them, and both answered with a 404 page under a 200
                status until they were written. A door whose contract belongs to
                somebody else still points at THEIR terms, elsewhere in this
                file, and that one stays an anchor. */}
            <Link href="/terms" data-testid="link-footer-terms" className={LINK}>
              Terms
            </Link>
            <Link href="/privacy" data-testid="link-footer-privacy" className={LINK}>
              Privacy
            </Link>
            {/* Contact is the popup now, not an address. It is the same
                LeadDialog every "Message us" in the action rows used to open,
                and those are gone — one way to write to us, in the place a
                person looks for one, instead of the same button repeated in
                every row on every page. A door whose contract is somebody
                else's still shows THEIR address, elsewhere in this file, and
                that one stays a real link. */}
            <button
              type="button"
              onClick={() => setMessageOpen(true)}
              data-testid="link-footer-contact"
              className={LINK}
            >
              Contact
            </button>
            {/* Real <a>, not a wouter Link: these are files in client/public, and
                a client-side route would 404 them. Filenames as written, so they
                sit in this row without looking like a fourth legal page. */}
            <a href="/llms.txt" data-testid="link-footer-llms" className={LINK_QUIET}>
              llms.txt
            </a>
            <a href="/llms-full.txt" data-testid="link-footer-llms-full" className={LINK_QUIET}>
              llms-full.txt
            </a>
          </nav>
        </div>
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
