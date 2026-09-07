import { useState, type FormEvent } from "react";

import DoorCard from "@/components/site/DoorCard";
import { ACTION, ACTION_QUIET, HEADING, LINK, META, META_PLAIN, READ_MUTED } from "@/components/site/doors/quiet";
import { collectSource } from "@/components/site/LeadDialog";
import { DEFAULT_DOOR_ID, DOORS, DOOR_BY_ID, type DoorContract, type DoorDef, type DoorTier } from "@shared/doors";

/**
 * Everything a visitor only sees after telling us who they are, and the step
 * that asks.
 *
 * The open page carries the doors we are happy for a stranger to read — the
 * tiers in PUBLIC_TIERS. Everything else lives here: two products of ours that
 * are not doors, and the doors that belong to a different company.
 *
 * The split is a data decision and this file is the only place it is made.
 * Change a door's tier in shared/doors.ts and the door moves between the two
 * lists with no code change; hand a door to the partner and its name, terms,
 * invoice line and contact travel with it, because they live on the door's own
 * contract and this file never writes any of them down.
 *
 * What the step is not: an account. There is no user system in this repository
 * and this does not pretend to be one. It posts one lead to /api/leads — the
 * route the rest of the site already uses — and remembers the answer in this
 * browser so a returning visitor is not asked twice. It is not a lock either:
 * what is below is ordinary page content, and nothing here says otherwise.
 *
 * This round restyled it and changed nothing it does. The card is gone, the
 * field is a rule rather than a box, and the words are shorter — but the tier
 * rule, the request, the storage key, the "show them anyway" path and the
 * refusal to name a gated door before the step are exactly as they were. A
 * restyle that quietly weakened a gate would be the worst kind of redesign.
 */

const FIELD =
  "type-body w-full border-0 border-b border-input bg-transparent px-0 py-[var(--s1)] text-foreground placeholder:text-muted-foreground focus:border-foreground focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50";

/* ------------------------------- the split -------------------------------- */

/* THE PARTNER ROW IS NO LONGER WITHHELD, and the reason is the owner's.
 *
 * It used to sit behind the email step, on his earlier instruction, so that a
 * stranger saw only the white and light-grey rows. Then two things came out.
 *
 * First, the gate was never a gate. shared/doors.ts is imported by the client,
 * so the whole table — the partner's name included — ships in the JavaScript
 * bundle whatever the page chooses to render. Withholding it in the browser
 * kept it off the page and out of search, and kept it from nobody who opened
 * the bundle. Making that real would mean serving that row from an API after
 * the step, which is a structural change.
 *
 * Second, and better: the owner decided it does not need to be secret. It is
 * not "non-public", it is a PARTNER service — so it is listed like the rest and
 * labelled for what it is. A visible label is a stronger disclosure than a
 * hidden row, and it is honest about a thing the bundle was telling anyway.
 *
 * So `isPublicDoor` now answers a different question — whose service is this,
 * not may you see it — and the split below is between what WE sell and what a
 * partner sells. Both are listed.
 */

/** Every row a stranger sees, which is now all of them. */
export const LISTED_DOORS: DoorDef[] = DOORS;

/** Tiers we contract and invoice ourselves. */
export const PUBLIC_TIERS: DoorTier[] = ["white", "light-grey"];

/** True when this is our own service rather than a partner's. */
export function isPublicDoor(door: DoorDef): boolean {
  return PUBLIC_TIERS.includes(door.tier);
}

/**
 * Ours, and therefore what a count of OUR services means. A partner row is
 * listed and reachable but is not one of the services Top-Rated Team sells, so
 * it is not counted in a sentence that says how many we have.
 */
export const PUBLIC_DOORS: DoorDef[] = DOORS.filter(isPublicDoor);

/** A partner's. Listed, labelled, and not counted as ours. */
export const PARTNER_DOORS: DoorDef[] = DOORS.filter((door) => !isPublicDoor(door));

/**
 * Kept so the email step below still compiles and still guards the two products
 * on other domains, which the owner has not asked to open. It is empty of doors
 * now, and the step's own copy no longer promises any.
 */
export const GATED_DOORS: DoorDef[] = [];

/** Counts written out, so a sentence about how many offers there are cannot go stale. */
export function countWord(count: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  return words[count] ?? String(count);
}

/* ------------------------------ our own two ------------------------------- */

/**
 * Whose name is on these two. They are our own work on the same paper as the
 * white doors, so the contract is read off a door rather than typed again here:
 * one legal name in the repository, in shared/doors.ts, and this file cannot
 * drift from it.
 */
const OURS: DoorContract = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;

/**
 * A product of ours that is not a door: it has its own site, its own panel and
 * no room here. If one of these ever needs an agent and four starter questions,
 * it stops being a row in this file and becomes a row in shared/doors.ts.
 */
interface GatedProduct {
  id: string;
  name: string;
  /** The site it runs on. Printed as the address, not as a naked link. */
  href: string;
  domain: string;
  /** What it does, in the words a buyer would use. One or two sentences. */
  line: string;
  contract: DoorContract;
}

/**
 * The two that are ours.
 *
 * These two lines describe products the owner runs and this page does not: keep
 * them to what is true on the day they are read, and check them against the
 * sites themselves before changing a word. No result is promised here, for the
 * same reason no door promises one.
 */
const GATED_PRODUCTS: GatedProduct[] = [
  {
    id: "top-voice",
    name: "Top-Voice",
    href: "https://top-voice.ai",
    domain: "top-voice.ai",
    line: "Engagement on LinkedIn from profiles you already own — commenting and replying where the people you sell to are reading, instead of buying impressions in front of them. It runs today, and what it does is written out in full on its own site.",
    contract: OURS,
  },
  {
    id: "warmlike",
    name: "Warmlike",
    href: "https://warmlike.com",
    domain: "warmlike.com",
    line: "The same kind of work pointed at a list you bring: warming up the people on it before anyone sends them a pitch. It runs today, and what it does is written out in full on its own site.",
    contract: OURS,
  },
];

/* --------------------------- remembering the visitor ---------------------- */

/** One key, this browser only. Nothing here is sent anywhere on a later visit. */
const ACCESS_KEY = "tr-offers-access";

interface StoredAccess {
  email: string;
  /** ISO date, so the section can say when they told us. */
  at: string;
  /** False when the address never reached us — the section says so rather than implying somebody has it. */
  delivered: boolean;
}

function recallAccess(): StoredAccess | null {
  try {
    const raw = window.localStorage.getItem(ACCESS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.email !== "string" || typeof candidate.at !== "string") return null;
    return { email: candidate.email, at: candidate.at, delivered: candidate.delivered !== false };
  } catch {
    // Private mode, blocked storage, or somebody else's JSON under our key.
    // Then the step is asked once more, which is the honest failure.
    return null;
  }
}

function rememberAccess(access: StoredAccess): void {
  try {
    window.localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
  } catch {
    // Not being asked twice is a convenience, not a requirement.
  }
}

function forgetAccess(): void {
  try {
    window.localStorage.removeItem(ACCESS_KEY);
  } catch {
    /* Nothing to undo if it was never stored. */
  }
}

/** Deliberately permissive: the server validates, and a rejected typo costs a lead. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * `contact` on a door is either an email address or the address of a page, and
 * a link has to know which — the same rule door.tsx and the room footer apply.
 * Without it a row that switches to a bare address renders a relative link that
 * goes nowhere, on the one line whose whole job is reaching a person.
 */
function contactHref(contact: string): string {
  return /^(https?:\/\/|mailto:|\/)/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * Not a SERVICES id: there is no service row for this work yet, and inventing
 * one in the lead would make the inbox lie about which catalogue it came from.
 * The source block carries the rest of the story.
 */
const GATE_INTENT = "linkedin-engagement";

/* --------------------------------- the section ---------------------------- */

export interface GatedOffersProps {
  className?: string;
}

export function GatedOffers({ className }: GatedOffersProps) {
  const [access, setAccess] = useState<StoredAccess | null>(() => recallAccess());
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Nothing behind the step, nothing to ask for. Keeps an empty section off the
  // page if every row is ever made public.
  if (GATED_PRODUCTS.length === 0 && GATED_DOORS.length === 0) return null;

  function reveal(address: string, delivered: boolean) {
    const next: StoredAccess = { email: address, at: new Date().toISOString(), delivered };
    rememberAccess(next);
    setAccess(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_RE.test(address)) {
      setEmailError("Enter an email address we can reply to.");
      return;
    }
    setEmailError(null);
    setSendError(null);
    setSending(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: address,
          intent: GATE_INTENT,
          message: "Asked to see the LinkedIn engagement offers on /services.",
          source: { ...collectSource(), gate: "offers" },
        }),
      });
      if (!res.ok) {
        setSendError("We could not record that just now.");
        return;
      }
      reveal(address, true);
    } catch {
      setSendError("Network error, so nothing was sent.");
    } finally {
      setSending(false);
    }
  }

  // A stored value that is not a date says nothing rather than "Invalid Date".
  const storedAt = access ? new Date(access.at) : null;
  const since = storedAt && !Number.isNaN(storedAt.getTime()) ? storedAt.toLocaleDateString() : null;

  const ours = GATED_PRODUCTS.length;
  const theirs = GATED_DOORS.length;
  const behindLine = `${countWord(ours)} product${ours === 1 ? "" : "s"} of ours, and ${countWord(theirs)} offer${
    theirs === 1 ? "" : "s"
  } from ${theirs === 1 ? "another company" : "other companies"}.`;

  if (!access) {
    return (
      <section id="more-offers" data-testid="section-offers-gate" className={`scroll-mt-24 ${className ?? ""}`}>
        <div className="grid gap-[var(--s3)] border-t border-border pt-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
          <div>
            <p className={META}>Not on the open page</p>
            <h2 className={`mt-[var(--s1)] ${HEADING}`} data-testid="text-offers-gate-headline">
              There are more offers than the ones above.
            </h2>
          </div>

          <div>
            <p className={READ_MUTED}>
              Behind this: {behindLine} What they have in common today is LinkedIn — activity carried out on real
              profiles, ours or yours, rather than through an ad account. Ours are a cheaper way in than a managed
              campaign, and they carry a different kind of risk, because they run on somebody&rsquo;s personal account.
              That is why we would rather show them to people we can reply to than print them on an open page.
            </p>

            <form onSubmit={submit} noValidate className="mt-[var(--s4)] max-w-md">
              <label htmlFor="offers-email" className={META}>
                Email
              </label>
              <input
                id="offers-email"
                data-testid="input-offers-email"
                type="email"
                required
                autoComplete="email"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "offers-email-error" : undefined}
                className={`mt-[var(--s1)] ${FIELD}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
              />
              {emailError ? (
                <p id="offers-email-error" className="type-note mt-[var(--s1)] text-destructive">
                  {emailError}
                </p>
              ) : null}
              <button type="submit" data-testid="button-offers-reveal" className={`${ACTION} mt-[var(--s3)]`} disabled={sending}>
                {sending ? "Sending…" : "Show the offers"}
              </button>
            </form>

            <p className={`mt-[var(--s4)] max-w-[62ch] ${META_PLAIN}`}>
              {/* Whatever this sentence says is sent has to be what the request
                  above actually carries: collectSource() puts the page, the
                  referrer and any campaign parameters in the URL into it, and a
                  line promising an address and nothing else was describing a
                  smaller request than the one being made. */}
              This sends us your address, the page you are on and where you came from. It is not an account, there is no
              password, and the only thing that happens next is that a person may write back. This browser remembers it,
              so you are not asked again. The offers above stay open to everyone whether you fill this in or not.
            </p>

            {sendError ? (
              <div role="alert" className="mt-[var(--s4)] border-t border-border pt-[var(--s2)]">
                <p className="type-body text-destructive">{sendError}</p>
                <p className={`mt-[var(--s1)] max-w-[62ch] ${META_PLAIN}`}>
                  Nobody on our side has your address. You can try again, or read the offers without giving us one —
                  they are not being kept from you.
                </p>
                <button
                  type="button"
                  data-testid="button-offers-anyway"
                  className={`${ACTION_QUIET} mt-[var(--s2)]`}
                  onClick={() => reveal(email.trim(), false)}
                >
                  Show them anyway
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="more-offers" data-testid="section-gated-offers" className={`scroll-mt-24 ${className ?? ""}`}>
      <div className="grid gap-[var(--s3)] border-t border-border pt-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
        <div>
          <p className={META}>The rest of the offers</p>
          <h2 className={`mt-[var(--s1)] ${HEADING}`} data-testid="text-gated-offers-headline">
            {behindLine.charAt(0).toUpperCase() + behindLine.slice(1)}
          </h2>
          <button
            type="button"
            data-testid="button-offers-hide"
            className={`${ACTION_QUIET} mt-[var(--s3)]`}
            onClick={() => {
              forgetAccess();
              setAccess(null);
              setEmail("");
              setSendError(null);
            }}
          >
            Hide these again
          </button>
        </div>

        <div>
          {access.delivered ? null : (
            <p className={`mb-[var(--s4)] max-w-[62ch] ${META_PLAIN}`} data-testid="text-offers-not-delivered">
              Your address never reached us, so nobody on our side has it. If you want an answer,{" "}
              {OURS.contact ? (
                <a href={contactHref(OURS.contact)} rel="noopener noreferrer" className={`${LINK} text-foreground`}>
                  {OURS.contactLabel ?? "write to us"}
                </a>
              ) : (
                "write to us"
              )}
              .
            </p>
          )}

          {/* Ours first. The owner's order, and the only one that is honest: our
              own work carries our own name, and the company below is not us. */}
          <div>
            {GATED_PRODUCTS.map((product) => (
              <article
                key={product.id}
                data-testid="card-gated-product"
                className="border-t border-border py-[var(--s3)] first:border-t-0 first:pt-0"
              >
                <h3 className={HEADING} data-testid="text-gated-product-name">
                  {product.name}
                </h3>
                <p className={`mt-[var(--s1)] ${META}`}>
                  <a
                    href={product.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-gated-product"
                    className="draw hover:text-foreground"
                  >
                    {product.domain}
                  </a>
                </p>
                <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{product.line}</p>
                <p className={`mt-[var(--s2)] ${META_PLAIN}`} data-testid="text-gated-product-legal-name">
                  {product.contract.invoiceLine}{" "}
                  {product.contract.termsUrl ? (
                    <a
                      href={product.contract.termsUrl}
                      rel="noopener noreferrer"
                      data-testid="link-gated-product-terms"
                      className={`${LINK} text-foreground`}
                    >
                      Terms
                    </a>
                  ) : (
                    <span>
                      {product.contract.legalName} has not published terms for this work yet, and this page will not
                      show anybody else&rsquo;s.
                    </span>
                  )}
                </p>
              </article>
            ))}
          </div>

          <p className={`mt-[var(--s4)] max-w-[62ch] ${READ_MUTED}`}>
            They act on real LinkedIn accounts, and LinkedIn has rules about that which it enforces. Nothing here says
            otherwise. If you want what is and is not allowed where you are written down before anything runs, that is
            the LinkedIn automation door above — a lawyer writes the assessment first, and bills it separately.
          </p>
        </div>
      </div>

      {GATED_DOORS.length > 0 ? (
        <div className="mt-[var(--s5)] grid gap-[var(--s3)] border-t border-border pt-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
          <div>
            <p className={META}>Not Top-Rated Team</p>
            <h3 className={`mt-[var(--s1)] ${HEADING}`} data-testid="text-gated-partner-headline">
              {theirs === 1 ? "One offer from a different company." : "Offers from different companies."}
            </h3>
          </div>

          <div>
            <p className={READ_MUTED}>
              {theirs === 1
                ? "Its own name, its own contract, its own invoice."
                : "Their own names, contracts and invoices."}{" "}
              Top-Rated Team is not in that chain and takes no share of it, so if you buy this and something of ours you
              get two of everything. The row names the company you would be buying from.
            </p>
            {/* True for as long as the row is not open: a door that is not live
                offers a call, and that call is ours. Say so rather than letting
                a visitor assume the button reaches them. */}
            {GATED_DOORS.some((door) => door.status !== "live") ? (
              <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
                The call on that page books time with Top-Rated Team, not with them. We would introduce you; we would
                not be selling it to you.
              </p>
            ) : null}
          </div>

          <div className="lg:col-span-2">
            {GATED_DOORS.map((door, position) => (
              <DoorCard key={door.id} door={door} index={PUBLIC_DOORS.length + position + 1} />
            ))}
          </div>
        </div>
      ) : null}

      <p className={`mt-[var(--s4)] max-w-[62ch] ${META_PLAIN}`}>
        Remembered in this browser{since ? ` since ${since}` : ""}, so you are not asked again. Clearing your browser
        data clears it, and so does &ldquo;Hide these again&rdquo;.
      </p>
    </section>
  );
}

export default GatedOffers;
