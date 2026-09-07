import { useRoute, Link } from "wouter";

import { DEFAULT_DOOR_ID, DOOR_BY_ID, DOOR_BY_SLUG, type DoorContract, type DoorDef } from "@shared/doors";

/* ---------------------------------------------------------------------------
 * THE FOOTER
 *
 * It was 550 pixels tall and carried seventeen links, nine service names, three
 * social icons, two award badges, a marketing paragraph and a line about
 * contractors in Barcelona and Lisbon — on every page, under every offer,
 * taller than the pitch above it. On a door page the chrome links outnumbered
 * the links belonging to the offer about seven to one.
 *
 * What is left is the two things a footer is for: who runs this website, in the
 * name that would be on a contract, and how to reach them. Terms and an address
 * are the two links. Everything removed was either a page on another domain
 * that this site's visitor did not come for, or a list of services that is not
 * an offer and cannot be clicked anyway.
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
 * shared/doors.ts and this appears on it; take it back and it goes. No door is
 * named in this file, and neither is any company: every name below is read off
 * a row, so correcting a legal name is a change to that row and to nothing
 * else.
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
  const [onDoorPage, params] = useRoute<{ slug: string }>("/use-case/:slug");
  if (!onDoorPage || !params) return null;
  const door: DoorDef | undefined = DOOR_BY_SLUG[params.slug];
  if (!door) return null;
  return door.contract.legalName === OURS.legalName ? null : door.contract;
}

const LINK = "draw draw-on text-muted-foreground hover:text-foreground";

export function Footer() {
  const theirs = useSomebodyElsesDoor();
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

        <div className="flex flex-wrap items-baseline justify-between gap-x-[var(--s4)] gap-y-[var(--s2)]">
          <p className="type-meta text-muted-foreground" data-testid="text-footer-operator">
            &copy; {year} {OURS.legalName} &mdash; Prague, Madeira, Kyiv, Bratislava, Batumi
          </p>
          <nav className="type-meta flex items-baseline gap-[var(--s3)]">
            {/* The way back to a room you already kept. One place, in words, at
                the end of the scroll — the site's only standing link to /w. The
                page itself explains, in one sentence, why there are none when a
                browser remembers none. */}
            <Link href="/w" data-testid="link-footer-rooms" className={LINK}>
              Rooms you have kept
            </Link>
            {OURS.termsUrl ? (
              <a
                href={OURS.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-footer-terms"
                className={LINK}
              >
                Terms
              </a>
            ) : null}
            {OURS.contact ? (
              <a href={contactHref(OURS.contact)} rel="noopener noreferrer" data-testid="link-footer-contact" className={LINK}>
                Contact
              </a>
            ) : null}
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
