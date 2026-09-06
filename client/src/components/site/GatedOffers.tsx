import { useState, type FormEvent } from "react";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";

import DoorCard from "@/components/site/DoorCard";
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
 */

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_GHOST = `${BTN_BASE} border border-transparent min-h-8 rounded-md px-3 text-xs`;

const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

/* ------------------------------- the split -------------------------------- */

/** The tiers a stranger reads without telling us anything. */
export const PUBLIC_TIERS: DoorTier[] = ["white", "light-grey"];

export function isPublicDoor(door: DoorDef): boolean {
  return PUBLIC_TIERS.includes(door.tier);
}

/** The list on the open page. */
export const PUBLIC_DOORS: DoorDef[] = DOORS.filter(isPublicDoor);

/** The doors that are somebody else's business, shown after the email step. */
export const GATED_DOORS: DoorDef[] = DOORS.filter((door) => !isPublicDoor(door));

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
  initials: string;
  tone: string;
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
    initials: "TV",
    tone: "bg-chart-3/10 text-chart-3",
    line: "Engagement on LinkedIn from profiles you already own — commenting and replying where the people you sell to are reading, instead of buying impressions in front of them. It runs today, and what it does is written out in full on its own site.",
    contract: OURS,
  },
  {
    id: "warmlike",
    name: "Warmlike",
    href: "https://warmlike.com",
    domain: "warmlike.com",
    initials: "WL",
    tone: "bg-chart-1/10 text-chart-1",
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
          message: "Asked to see the LinkedIn engagement offers on /work.",
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
      <section
        id="more-offers"
        data-testid="section-offers-gate"
        className={`max-w-4xl scroll-mt-24 ${className ?? ""}`}
      >
        <div className="rounded-lg border border-card-border bg-card p-5 sm:p-6">
          <h2 className="text-base font-semibold sm:text-lg" data-testid="text-offers-gate-headline">
            There are more offers than the ones above, and they are not on the open page.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Behind this: {behindLine} What they have in common today is LinkedIn — activity carried out on real
            profiles, ours or yours, rather than through an ad account. Ours are a cheaper way in than a managed
            campaign, and they carry a different kind of risk, because they run on somebody&rsquo;s personal account.
            That is why we would rather show them to people we can reply to than print them on an open page.
          </p>

          <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <label htmlFor="offers-email" className="mb-1.5 block text-sm font-medium">
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
                className={FIELD}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
              />
              {emailError ? (
                <p id="offers-email-error" className="mt-1.5 text-xs text-destructive">
                  {emailError}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              data-testid="button-offers-reveal"
              className={`${BTN_PRIMARY} sm:mt-7`}
              disabled={sending}
            >
              {sending ? <Loader2 className="animate-spin" /> : null}
              Show the offers
              {sending ? null : <ArrowRight />}
            </button>
          </form>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            This sends us your address and nothing else. It is not an account, there is no password, and the only thing
            that happens next is that a person may write back. This browser remembers it, so you are not asked again.
            The offers above stay open to everyone whether you fill this in or not.
          </p>

          {sendError ? (
            <div role="alert" className="mt-4 rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm text-destructive">{sendError}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Nobody on our side has your address. You can try again, or read the offers without giving us one — they
                are not being kept from you.
              </p>
              <button
                type="button"
                data-testid="button-offers-anyway"
                className={`${BTN_GHOST} mt-2 -ml-3 text-foreground`}
                onClick={() => reveal(email.trim(), false)}
              >
                Show them anyway
              </button>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      id="more-offers"
      data-testid="section-gated-offers"
      className={`max-w-4xl scroll-mt-24 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">The rest of the offers</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight" data-testid="text-gated-offers-headline">
            {behindLine.charAt(0).toUpperCase() + behindLine.slice(1)}
          </h2>
        </div>
        <button
          type="button"
          data-testid="button-offers-hide"
          className={`${BTN_GHOST} text-muted-foreground`}
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

      {access.delivered ? null : (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground" data-testid="text-offers-not-delivered">
          Your address never reached us, so nobody on our side has it. If you want an answer,{" "}
          {OURS.contact ? (
            <a href={OURS.contact} rel="noopener noreferrer" className="text-foreground hover:underline">
              {OURS.contactLabel ?? "write to us"}
            </a>
          ) : (
            "write to us"
          )}
          .
        </p>
      )}

      {/* Ours first. The owner's order, and the only one that is honest: our own
          work carries our own name, and the company below is not us. */}
      <div className="mt-8 grid gap-4">
        {GATED_PRODUCTS.map((product) => (
          <article
            key={product.id}
            data-testid="card-gated-product"
            className="rounded-lg border border-card-border bg-card p-5 sm:p-6"
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${product.tone}`}
                aria-hidden="true"
              >
                {product.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold sm:text-lg" data-testid="text-gated-product-name">
                    {product.name}
                  </h3>
                  <a
                    href={product.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-gated-product"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                  >
                    {product.domain}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.line}</p>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground" data-testid="text-gated-product-legal-name">
                {product.contract.legalName}
              </p>
              <p className="mt-0.5">{product.contract.invoiceLine}</p>
              {product.contract.termsUrl ? (
                <a
                  href={product.contract.termsUrl}
                  rel="noopener noreferrer"
                  data-testid="link-gated-product-terms"
                  className="mt-1 inline-flex items-center gap-1 text-foreground hover:underline"
                >
                  Terms
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="mt-0.5">
                  {product.contract.legalName} has not published terms for this work yet, and this page will not show
                  anybody else&rsquo;s.
                </p>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        They act on real LinkedIn accounts, and LinkedIn has rules about that which it enforces. Nothing here says
        otherwise. If you want what is and is not allowed where you are written down before anything runs, that is the
        LinkedIn automation door above — a lawyer writes the assessment first, and bills it separately.
      </p>

      {GATED_DOORS.length > 0 ? (
        <div className="mt-12 border-t border-border pt-10">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Not Top-Rated Team</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight" data-testid="text-gated-partner-headline">
            {theirs === 1 ? "One offer from a different company." : "Offers from different companies."}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {theirs === 1 ? "Its own name, its own contract, its own invoice." : "Their own names, contracts and invoices."}{" "}
            Top-Rated Team is not in that chain and takes no share of it, so if you buy this and something of ours you
            get two of everything. The card names the company you would be buying from.
          </p>
          {/* True for as long as the row is not open: a door that is not live
              offers a call, and that call is ours. Say so rather than letting a
              visitor assume the button reaches them. */}
          {GATED_DOORS.some((door) => door.status !== "live") ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The call on that card books time with Top-Rated Team, not with them. We would introduce you; we would not
              be selling it to you.
            </p>
          ) : null}

          <div className="mt-6 grid gap-4">
            {GATED_DOORS.map((door) => (
              <DoorCard key={door.id} door={door} />
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Remembered in this browser{since ? ` since ${since}` : ""}, so you are not asked again. Clearing your browser
        data clears it, and so does &ldquo;Hide these again&rdquo;.
      </p>
    </section>
  );
}

export default GatedOffers;
