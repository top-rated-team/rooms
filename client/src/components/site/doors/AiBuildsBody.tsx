import { HEADING, LINK, META, META_PLAIN, NUMERAL, PAGE, READ_MUTED } from "@/components/site/doors/quiet";
import { BUILDS, type Build } from "@shared/builds";

/* ---------------------------------------------------------------------------
 * THE CUSTOM-AI DOOR'S OWN PAGE.
 *
 * The row in shared/doors.ts already says we build these. shared/cases.ts
 * records that this door has no client case — which is true. This is the
 * evidence the door can actually offer: the six rows in shared/builds.ts,
 * as a portfolio. There is no client and no metric. Inventing either is
 * the one thing this repository has a test for.
 *
 * Each block is: what it is, what we built in it, and a link where there
 * is a public page. Two have none — this application (the apex does not
 * serve it; unverifiedClaims says so) and the Upwork proposal agent
 * (url is null) — and they are not given one.
 *
 * Sentences below are taken from `oneLine`, `what` and `built`. Nothing
 * listed in `unverifiedClaims` is printed: those are claims a second
 * agent could not confirm against the live product. Do not restore:
 *
 *   that this application answers at ai.top-rated.team, or at the apex
 *   that it is live, or in use, or has a price
 *   any client name, engagement, sector, result, metric or date
 *   "official Google Ads API" (the live AdGrant.AI site does not write that)
 *   AdGrant.AI trust badges, account counts, CTR or conversion examples
 *   Top Voice prices, trial terms, 12x, impression tiles, demo personas
 *   reaction-timing figures; WarmLike slider projections or a dollar figure
 *   "100% secured", "ban free", rented-account-pool on WarmLike's own page
 *   a public URL for the Upwork skill; reply, hire or time-saved figures
 *   Being. as therapy, a GPT Store listing, "ultimate privacy" as a fact
 *   being.marketing/l/being as the link — the owner said the root domain
 * ------------------------------------------------------------------------- */

interface Shown {
  what: string;
  built: string[];
}

/**
 * Visitor-facing copy keyed to the generated rows, already stripped of
 * what unverifiedClaims forbids. The order of BUILDS is the order here.
 */
const SHOWN: Record<string, Shown> = {
  "top-rated-team": {
    what: "Several service doors sit in front of one workspace. A visitor asks a question on the door that matches their problem, and when the conversation turns out to be worth keeping it becomes a room at an address of its own, where the client, our people and subject-matter AI agents talk in the same channels. This page is that application. The panel above is it, not a picture of it.",
    built: [
      "Offers as data, not pages: a row decides which agent opens the conversation, which corpus that agent reads, and whose legal name, terms, invoice line and contact the resulting room prints.",
      "A no-signup room at /w/:token where the URL is the entire credential — channels, a message column, a task panel, a member rail of people and agents — loaded as a separate JavaScript chunk the door pages never download.",
      "Per-agent grounding with no fallback. An agent retrieves from the one namespace named on it and can reach no other; with no key, no corpus, or nothing matching, it says what it is missing instead of answering from memory.",
      "Three bounds on what one room may spend on agent answers, checked before the model is called: a count of turns, a clock on one unbroken run, and a monthly budget that warns and then pauses the room. A separate ceiling covers the public panel, which needs no token.",
      "An answer streamed to a door page is signed by the server that produced it, so text handed back by a browser cannot be passed off as ours.",
      "The whole thing runs with an empty .env. No key and the agents say live answers are not configured; no database and storage is in-memory with the same interface. Nothing is faked in either state.",
    ],
  },
  "adgrant-ai": {
    what: "A web tool for nonprofits that already hold a Google Ad Grant. It takes the nonprofit's website URL, the Google Ads Customer ID, and the target languages and locations, reads the website, and generates campaigns, ad groups, keywords, ads and extensions. The structure can be reviewed and downloaded as CSV files, or written into the nonprofit's own Google Ads account through the Google Ads API, under a manager-account link the Terms say can be revoked. Free use is capped; LinkedIn sign-in is there only to apply that cap, and reads only the profile URL.",
    built: [
      "The generator itself: website in, a full account structure out, with the Customer ID checked against the form's own pattern.",
      "Upload through the Google Ads API into the nonprofit's account, under the Top-Rated Team manager account, or a CSV export if they would rather upload by hand.",
      "LinkedIn sign-in used only to limit free generations, with a message to LinkedIn as the other way to send a Customer ID.",
      "A content library on the same domain — glossary, templates, tricks, and nonprofit guides — kept there rather than copied here.",
    ],
  },
  "top-voice": {
    what: "A LinkedIn visibility platform built around reactions rather than outreach. You describe the business and who it sells to; it builds a feed of those people's posts and reacts to them from a profile or company page. LinkedIn then shows those posts to the author and to the author's connections, so the profile earns inbound visits instead of sending cold messages. The page is explicit about what it refuses: no bulk cold outreach or DMs, no engagement pods, and no AI comments.",
    built: [
      "A setup that takes four fields and produces an Influence Flow, a content campaign and a boosting campaign.",
      "Influence Flows: synthesised influencer voices, including custom ones from a LinkedIn profile URL.",
      "A Content Studio with Autopilot — post copy, images, carousel PDFs and video, published to profiles or company pages on a schedule.",
      "A LinkedIn Booster: boolean searches that assemble a targeted posts feed, and a reaction engine with human-like pacing and selectable reaction types.",
      "A pool of dedicated in-house LinkedIn accounts, so a campaign can run without the client handing over their own login.",
      "MCP connectors — Add to ChatGPT and Add to Claude — alongside in-app, web-chat and LinkedIn DM entry points.",
    ],
  },
  warmlike: {
    what: "A LinkedIn visibility service around a second, managed company page rather than the client's own account. You tell them the profile and the niche, over a LinkedIn message or a short call. They spin up a company page from the business — name, logo and description — that points people at the client's profile. That page engages the posts of the people the client sells to, and reshares the client's own posts so those people are sent on. Suggested posts are reviewed from a private link, published to the client's own profile, and then reshared by the managed page. There is no dashboard to log into and no password to share.",
    built: [
      "The managed company page — a pre-lander — run as the service, not as access to the client's LinkedIn login.",
      "Daily suggested posts, reviewed and approved from a private link, published to the client's own profile and reshared by that page.",
      "The public site at warmlike.com, which is how the work is started: a message or a call, not a checkout.",
    ],
  },
  "upwork-auto-apply": {
    what: "A Claude Code skill that finds and scores Google Ads jobs on Upwork, drafts the cover letter and screening answers, and fills the proposal form. The proposal is submitted only after the user confirms that specific one. It drives the user's own logged-in Chrome session — there is no cloud browser and no shared Upwork account.",
    built: [
      "The skill itself, with modes for a round, for scheduled drafting, and for the inbox, plus a page-and-form map of Upwork.",
      "Incremental scanning against a seen log and an applied log, so a listing is not triaged or applied to twice.",
      "The proposal form filled field by field — rate or milestones, letter, each screening question, attachment — and then a stop. Sending requires confirmation of that specific proposal in that session.",
      "Scheduled and background runs that never open the proposal form, and leave drafts as files for review.",
      "State kept outside the skill folder, because a plugin update overwrites that folder: a personal profile, a case library, and the logs.",
    ],
  },
  "being-existential-coach": {
    what: "A quiet companion for rest from anxious purpose-hunting, tasks, and roles, and a clear mirror for your inner language. The listing invites you to lay down a concern or identity like a stone. It is offered two ways: as a custom ChatGPT, or from the web without logging in to ChatGPT. The page also says a dialogue can seed a custom ChatGPT to share, so others can sit beside it as well. It is listed on the being.marketing storefront.",
    built: [
      "A custom ChatGPT, offered as that option on the listing.",
      "A web version usable without a ChatGPT login.",
      "Published on the being.marketing storefront.",
    ],
  },
};

/**
 * A public page to open. Null for the two that have none, and never a URL
 * unverifiedClaims says is not this product. Being. links at the root,
 * not at the product permalink a second agent read the copy from.
 */
function hrefOf(build: Build): string | null {
  if (build.slug === "top-rated-team") return null;
  if (build.slug === "upwork-auto-apply") return null;
  if (build.slug === "being-existential-coach") return "https://being.marketing";
  return build.url;
}

function hostOf(url: string): string {
  return url.replace(/^https:\/\//, "");
}

function BuildName({ build, href }: { build: Build; href: string | null }) {
  const isBeing = build.slug === "being-existential-coach";
  const label = isBeing ? (
    <>
      Being.<s className="line-through">Marketing</s>
    </>
  ) : build.slug === "top-rated-team" ? (
    "This application"
  ) : (
    build.name
  );

  if (!href) return <>{label}</>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`link-ai-build-${build.slug}`}
      className={LINK}
      aria-label={isBeing ? "Being.Marketing" : undefined}
    >
      {label}
    </a>
  );
}

export function AiBuildsBody() {
  return (
    <section id="ai-builds-portfolio" className={`${PAGE} pt-[var(--s6)]`} data-testid="block-ai-builds">
      <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
        <h2 className={HEADING}>What we have built.</h2>
        <p className={READ_MUTED}>
          This door has no client case. The six below are things we have built. They are a portfolio, not case
          studies: there is no client on any of them, and no metric, because these are ours.
        </p>
      </div>

      <ol className="mt-[var(--s5)]">
        {BUILDS.map((build, index) => {
          const shown = SHOWN[build.slug];
          if (!shown) return null;
          const href = hrefOf(build);
          return (
            <li
              key={build.slug}
              data-testid="item-ai-build"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="lg:col-start-2">
                <h3 className={HEADING}>
                  <BuildName build={build} href={href} />
                </h3>
                {href ? <p className={`mt-[var(--s1)] ${META}`}>{hostOf(href)}</p> : null}
                {build.slug === "being-existential-coach" ? (
                  <p className={`mt-[var(--s1)] ${META}`}>Your Existential Coach</p>
                ) : null}
              </div>
              <div className="lg:col-start-3 lg:row-start-1">
                <p className="type-body text-muted-foreground">{shown.what}</p>
                <div className="mt-[var(--s2)] flex flex-col gap-[var(--s1)]">
                  {shown.built.map((line) => (
                    <p key={line} className={META_PLAIN}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default AiBuildsBody;
