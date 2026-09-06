import { useCallback, useEffect } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, ExternalLink, Loader2 } from "lucide-react";

import type { CreateWorkspaceResponse } from "@shared/api";
import {
  DEFAULT_DOOR_ID,
  DOOR_BY_ID,
  DOOR_BY_SLUG,
  DOOR_TIERS,
  doorAgent,
  type DoorDef,
  type DoorTier,
} from "@shared/doors";
import { BOOK_A_CALL_URL } from "@shared/roster";
import AskWidget from "@/components/site/AskWidget";
import Footer from "@/components/site/Footer";
/* Which tiers a stranger reads is decided in one place; this page reads that
 * decision rather than making a second one. */
import { isPublicDoor } from "@/components/site/GatedOffers";
import Header from "@/components/site/Header";
import KeepStrip from "@/components/site/KeepStrip";
import { collectSource } from "@/components/site/LeadDialog";
import { Badge } from "@/components/ui/badge";
import { usePanelState, type CreateRoomResult } from "@/hooks/use-panel-state";
import NotFound from "@/pages/not-found";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY_SM = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-8 rounded-md px-3 text-xs`;
const BTN_GHOST_SM = `${BTN_BASE} border border-transparent min-h-8 rounded-md px-3 text-xs`;

/* Same mapping as DoorCard.tsx, for the same reason: a different company does
 * not wear our colour. Duplicated rather than exported, because two callers is
 * not yet a shared module. */
const TIER_VARIANT: Record<DoorTier, "default" | "secondary" | "outline"> = {
  white: "default",
  "light-grey": "secondary",
  grey: "outline",
};

/**
 * The company that runs this site, read off the door that pays for it rather
 * than typed in again. Any door whose contract names somebody else is a door
 * where our booking link has to say whose calendar it is.
 */
const OUR_LEGAL_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

/** `contact` is either an email address or the address of a page, and a link has to know which. */
function contactHref(contact: string): string {
  return /^(https?:\/\/|mailto:|\/)/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * One page for every door. Everything a visitor reads here — the headline, the
 * blurb, the agent's job, the four starters, the tier and the company that will
 * send the invoice — is read out of the row in shared/doors.ts. There is no
 * per-door component and no per-door sentence in this file: opening a door is
 * editing a row, and nothing else.
 */
function DoorPage({ door }: { door: DoorDef }) {
  const [, navigate] = useLocation();
  const tier = DOOR_TIERS[door.tier];
  const agent = doorAgent(door);

  /* Two things have to be true before a panel is honest: the row says the door
   * is open, and it names an agent that exists in the roster. The partner's row
   * names nobody on purpose, and a row pointing at a missing agent would post a
   * question the server rejects — both get the block below rather than a
   * composer with nobody behind it. */
  const panelIsOpen = door.status === "live" && agent !== undefined;
  const oursToAnswer = door.contract.legalName === OUR_LEGAL_NAME;

  // Same approach as /work and the landing page: no helmet dependency, and the
  // previous title and description are put back on the way out.
  useEffect(() => {
    const previousTitle = document.title;
    // Our name goes on our own doors. On a door whose contract names somebody
    // else, the tab, the history entry and the bookmark say the offer and stop
    // there rather than filing another company's work under ours.
    document.title = oursToAnswer ? `${door.headline} | Top-Rated Team` : door.headline;

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
    element.content = door.blurb;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, [door]);

  /* A door that /work only names after the email step must not arrive from a
   * search result instead. sitemap.xml leaves those rows out for the same
   * reason and says so; this is the other half of it, because a URL that is
   * merely unlisted is still indexable. The page keeps answering for anyone who
   * has the address — the gate was never a lock, and this does not make it one.
   * Which rows this covers is the tier rule in GatedOffers.tsx, so a door that
   * moves between the two lists takes its indexing with it and no branch here
   * names a door. */
  useEffect(() => {
    if (isPublicDoor(door)) return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, [door]);

  // Arriving from a row halfway down /work otherwise lands the visitor halfway
  // down the door, below the headline they just clicked.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [door.id]);

  /**
   * Mints the room and deliberately does not navigate — the same contract
   * Hero.tsx's createRoom has, and for the same reason: "Kept. This
   * conversation now has an address" is only true if the address is on screen
   * before the page moves.
   *
   * collectSource() reads the door off the path, which resolves correctly from
   * /work/<slug> because that is what the row's `path` says. The door is
   * stamped again here anyway: this page already knows which row it rendered,
   * and a room carrying the wrong door prints the wrong company in its footer.
   */
  const createRoom = useCallback(
    async (firstMessage?: string): Promise<CreateRoomResult> => {
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: door.firstAgentId ?? undefined,
            firstMessage,
            source: { ...collectSource(), door: door.id },
          }),
        });
        if (!res.ok) {
          return {
            ok: false,
            error:
              res.status === 429
                ? "That is a lot of workspaces from one address. Give it a minute, or book a call."
                : "The workspace could not be created. Book a call and we will pick it up from there.",
          };
        }
        const state = (await res.json()) as CreateWorkspaceResponse;
        return {
          ok: true,
          room: {
            url: state.url,
            workspaceId: state.workspace.id,
            path: `/w/${state.workspace.token}`,
          },
        };
      } catch {
        return {
          ok: false,
          error: "Network error creating the workspace. Book a call and we will pick it up from there.",
        };
      }
    },
    [door],
  );

  const panel = usePanelState({ createRoom });

  /**
   * The panel's own "Start a workspace" button is a deliberate press, so it is
   * trigger (c) and goes through the same Keep flow as everything else. Copied
   * from Hero.tsx rather than shared with it: the landing page must keep its
   * own hero, and a third caller is when this moves into a component of its
   * own.
   */
  const keepFromPanel = useCallback(
    async (opts?: { agentId?: string; firstMessage?: string }): Promise<string | null> => {
      await panel.keep(opts?.firstMessage);
      return null;
    },
    [panel],
  );

  /** The panel is the fastest free answer on the page, so the button puts the cursor in it. */
  const askInPanel = useCallback(() => {
    const field = document.getElementById("ask-question");
    if (!(field instanceof HTMLTextAreaElement)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    field.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    field.focus({ preventScroll: true });
  }, []);

  const room = panel.stage === "kept" ? panel.room : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 pt-16">
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Link
            href="/work"
            data-testid="link-door-back"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All doors
          </Link>

          <div className="mt-8 grid items-start gap-12 lg:grid-cols-[1.08fr_1fr] lg:gap-16">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${door.tone}`}
                  aria-hidden="true"
                >
                  {door.initials}
                </div>
                <Badge variant={TIER_VARIANT[door.tier]} data-testid="badge-door-tier">
                  {tier.label}
                </Badge>
                {door.status === "coming" ? (
                  <Badge variant="outline" data-testid="badge-door-status">
                    Not open yet
                  </Badge>
                ) : null}
              </div>

              <h1
                className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
                data-testid="text-door-headline"
              >
                {door.headline}
              </h1>

              <p className="mt-6 max-w-xl text-lg text-muted-foreground" data-testid="text-door-blurb">
                {door.blurb}
              </p>

              {/* The panel prints this line itself, beside the agent it is
                  about, so it is only wanted here on a door that has no panel
                  — where it is the only place a visitor is told who answers. */}
              {panelIsOpen ? null : (
                <p className="mt-4 max-w-xl text-sm text-muted-foreground" data-testid="text-door-agent-line">
                  {door.agentLine}
                </p>
              )}

              {panelIsOpen ? (
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    data-testid="button-door-ask"
                    className={BTN_PRIMARY}
                    onClick={askInPanel}
                  >
                    Ask your question
                    <ArrowRight />
                  </button>
                  <a
                    href={BOOK_A_CALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-door-book-call"
                    // The explicit form of trigger (a): they asked for a person.
                    // The call opens in its own tab, so the question about
                    // keeping the conversation is waiting when they come back.
                    onClick={panel.noteAskedForAPerson}
                    className={BTN_SECONDARY}
                  >
                    Talk to a person
                  </a>
                </div>
              ) : null}

              {/* Whoever is named here is who the room names. It is set by the
                  row, not by a person remembering. */}
              <div
                data-testid="block-door-contract"
                className="mt-10 max-w-xl rounded-lg border border-card-border bg-card p-5 sm:p-6"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Who you would be buying from
                </p>
                <p className="mt-2 text-sm font-medium" data-testid="text-door-legal-name">
                  {door.contract.legalName}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{door.contract.entity}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{door.contract.invoiceLine}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tier.meaning}</p>

                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
                  {door.contract.termsUrl ? (
                    <a
                      href={door.contract.termsUrl}
                      rel="noopener noreferrer"
                      data-testid="link-door-terms"
                      className="inline-flex w-fit items-center gap-1 text-foreground hover:underline"
                    >
                      Terms
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    // Never offer the terms of the company next door.
                    <p>
                      {door.contract.legalName} has not published terms for this work yet, and this page will not show
                      anybody else&rsquo;s.
                    </p>
                  )}

                  {door.contract.contact ? (
                    <a
                      href={contactHref(door.contract.contact)}
                      rel="noopener noreferrer"
                      data-testid="link-door-contact"
                      className="inline-flex w-fit items-center gap-1 text-foreground hover:underline"
                    >
                      {door.contract.contactLabel ?? door.contract.contact}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    // Same rule as the terms: their address or none, never ours.
                    <p>
                      {door.contract.legalName} has not given an address for this door yet, and this page will not show
                      anybody else&rsquo;s.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* The panel and the line under it are one card: the promise about
                what is saved belongs to the thing doing the saving. The first
                child is the panel; its bottom edge is removed so the row below
                continues it. Same arrangement as the hero on /. */}
            <div className="lg:pl-4">
              {panelIsOpen ? (
                <>
                  <div className="[&>div:first-child]:rounded-b-none [&>div:first-child]:border-b-0">
                    <AskWidget
                      door={door}
                      onStartWorkspace={keepFromPanel}
                      onVisitorMessage={panel.noteVisitorMessage}
                      onAskedForAPerson={panel.noteAskedForAPerson}
                    />

                    <div aria-live="polite">
                      {room ? (
                        <KeepStrip url={room.url} workspaceId={room.workspaceId} onOpen={() => navigate(room.path)} />
                      ) : (
                        <div
                          data-testid="row-panel-keep"
                          // Which of the four fired, readable in the DOM: the
                          // rule is meant to be checked rather than trusted.
                          data-trigger={panel.trigger ?? undefined}
                          className="rounded-b-lg border border-card-border bg-card px-4 py-3 shadow-sm sm:px-6"
                        >
                          {panel.stage === "asking" ? (
                            <div className="motion-safe:animate-fade-in-up">
                              <p className="text-sm" data-testid="text-panel-question">
                                That is yours, so this is worth keeping. Keep it, or stay anonymous?
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  data-testid="button-panel-keep-it"
                                  className={BTN_SECONDARY_SM}
                                  onClick={() => void panel.keep()}
                                  disabled={panel.keeping}
                                >
                                  {panel.keeping ? <Loader2 className="animate-spin" /> : null}
                                  Keep it
                                </button>
                                <button
                                  type="button"
                                  data-testid="button-panel-stay-anonymous"
                                  className={BTN_GHOST_SM}
                                  onClick={panel.stayAnonymous}
                                >
                                  No, stay anonymous
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                              <p className="text-xs text-muted-foreground" data-testid="text-panel-promise">
                                <span className="font-medium text-foreground">Nothing is saved yet.</span> Close this
                                tab and it is gone.
                              </p>
                              {panel.messageCount > 0 ? (
                                <button
                                  type="button"
                                  data-testid="button-panel-keep-this"
                                  className={BTN_GHOST_SM}
                                  onClick={() => void panel.keep()}
                                  disabled={panel.keeping}
                                >
                                  {panel.keeping ? <Loader2 className="animate-spin" /> : null}
                                  Keep this
                                  {panel.keeping ? null : <ArrowRight />}
                                </button>
                              ) : null}
                            </div>
                          )}

                          {panel.error ? (
                            <p role="alert" className="mt-2 text-xs text-destructive">
                              {panel.error}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-center text-xs text-muted-foreground lg:text-left">
                    Ask first. It costs nothing, and it is the fastest way to find out whether you need us at all.
                  </p>
                </>
              ) : (
                /* A door that cannot hold a conversation says so and offers the
                   thing that can: a person. It never renders a panel that is
                   not there. */
                <div
                  data-testid="block-door-shut"
                  className="rounded-lg border border-card-border bg-card p-4 shadow-sm sm:p-6"
                >
                  <p className="text-sm font-medium" data-testid="text-door-shut">
                    {door.status === "live"
                      ? "No agent of ours answers in this door."
                      : "This door is not open yet."}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {door.status === "live"
                      ? "There is no panel here, and this page will not stand one of our agents in front of somebody else's work."
                      : (door.comingLine ??
                        "The offer is real and this page is not finished. A person is the shorter path.")}
                  </p>

                  {/* One action, not two: the address to write to is already
                      in the block on the left, under the name of the company
                      it belongs to, which is where it means something. */}
                  <a
                    href={BOOK_A_CALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-door-book-call"
                    className={`${BTN_PRIMARY} mt-4`}
                  >
                    Talk to a person
                  </a>

                  {!oursToAnswer ? (
                    // Our calendar on somebody else's door has to say whose
                    // calendar it is.
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      That call is with {OUR_LEGAL_NAME}, not with {door.contract.legalName}.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

/**
 * /work/:slug — the address every door answers on.
 *
 * A row whose `path` is somewhere else is redirected there rather than rendered
 * twice: the ChatGPT Ads row says `path: "/"`, so /work/chatgpt-ads sends the
 * visitor to the landing page, which is that door's own richer page. Move a
 * door's `path` and the redirect moves with it; no branch here names a door.
 */
export function Door() {
  const [, params] = useRoute<{ slug: string }>("/work/:slug");
  const door = params ? DOOR_BY_SLUG[params.slug] : undefined;

  if (!door) return <NotFound />;
  if (door.path !== `/work/${door.slug}`) return <Redirect to={door.path} replace />;

  // Keyed on the row, so moving between two doors remounts the panel instead of
  // carrying one door's conversation into the next.
  return <DoorPage key={door.id} door={door} />;
}

export default Door;
