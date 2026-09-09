import { HEADING, LINK, META, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { PARTNER_BUILDS, type Build } from "@shared/builds";
import { DOOR_BY_ID } from "@shared/doors";

/* ---------------------------------------------------------------------------
 * THE PARTNER DOOR'S OWN PAGE.
 *
 * The row in shared/doors.ts already names the company and the invoice. This
 * is the rest of what a buyer needs before they decide: what the work actually
 * runs on. That is two products, in PARTNER_BUILDS, described from each
 * build's `forPartner` field — the field that was written for this page.
 *
 * The invoice fact is said once, below the two products, which is where a
 * buyer looks for money. It is not said a second time here. The door page
 * still repeats it in the contract block; that file is not this parcel's to edit.
 *
 * No figure. shared/pricing.ts resolves this door to no row, and publishing
 * one would make Top-Rated Team the seller of work it does not invoice.
 * WarmLike's `forPartner` states a dollar amount their own page publishes;
 * that sentence is omitted here for the same reason, and the rest of the
 * field is what is printed.
 *
 * Body copy uses the trading name. The legal form belongs in the footer
 * identification line, the Terms, the room footer and invoices — not here.
 * ------------------------------------------------------------------------- */

const DOOR = DOOR_BY_ID["linkedin-growth"];

/**
 * WarmLike's `forPartner` opens with sales language and states a dollar
 * figure. The figure cannot be printed on this door. The sentences below are
 * the rest of that field: the pre-lander, the content, the engagement, that
 * nothing is connected to the buyer's account, and that the work starts with
 * a message or a call.
 */
const WARMLIKE_LINE =
  "A fully-managed LinkedIn company page — a pre-lander — that engages the posts of the people you sell to, with no pods and no bots, and reshares your content so those people are channelled to your own profile. You do not log in and nothing is connected to your account. Daily on-brand posts go out with automatic reshares. The work starts with a message or a call on their site, not a checkout. That site's footer says it is powered by Top Voice.";

function partnerLine(build: Build): string | null {
  if (!build.forPartner) return null;
  if (build.slug === "warmlike") return WARMLIKE_LINE;
  return build.forPartner;
}

function hostOf(url: string): string {
  return url.replace(/^https:\/\//, "");
}

export function PartnerBody() {
  return (
    <>
      <section id="partner-products" className={`${PAGE} pt-[var(--s6)]`} data-testid="block-partner-products">
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>Two products, on their own sites.</h2>
          <p className={READ_MUTED}>
            LinkedIn growth on this door runs on these two. What each one does is taken from that product&rsquo;s own
            page.
          </p>
        </div>

        <ol className="mt-[var(--s5)]">
          {PARTNER_BUILDS.map((build, index) => {
            const line = partnerLine(build);
            if (!line) return null;
            const href = build.url;
            return (
              <li
                key={build.slug}
                data-testid="item-partner-build"
                className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
              >
                <span className={NUMERAL} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="lg:col-start-2">
                  <h3 className={`${HEADING} flex items-baseline gap-[var(--s2)]`}>
                    {/* Each product's own mark, taken from its own site rather
                        than redrawn, at the size the wordmark beside it sets.
                        aria-hidden with an empty alt: the name is right there,
                        and a screen reader announcing "Top Voice logo, Top
                        Voice" says it twice. */}
                    <img
                      src={`/assets/products/${build.slug}.png`}
                      alt=""
                      aria-hidden="true"
                      className="inline-block h-[1.1em] w-[1.1em] shrink-0 translate-y-[0.12em] object-contain"
                    />
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-partner-${build.slug}`}
                        className={LINK}
                      >
                        {build.name}
                      </a>
                    ) : (
                      build.name
                    )}
                  </h3>
                  {href ? <p className={`mt-[var(--s1)] ${META}`}>{hostOf(href)}</p> : null}
                </div>
                <p className="type-body text-muted-foreground lg:col-start-3 lg:row-start-1">{line}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/*
        THE "WHO INVOICES" SECTION WAS HERE AND IS GONE. door.tsx prints exactly
        this — the contract block at the foot of every door page renders
        contract.invoiceLine on any door that is not ours — so keeping it here
        put the same sentence on the page twice, under two headings, four lines
        apart. The parcel that wrote this file could not see that: the block it
        duplicates lives in a file it did not own.
      */}
    </>
  );
}

export default PartnerBody;
