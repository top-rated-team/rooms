import { useCallback, useEffect, useState } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";

import type { CreateWorkspaceResponse } from "@shared/api";
import {
  DEFAULT_DOOR_ID,
  DOOR_BY_ID,
  DOOR_BY_SLUG,
  DOOR_TIERS,
  doorAgent,
  type DoorDef,
} from "@shared/doors";
import { BOOK_A_CALL_URL } from "@shared/roster";
import AskWidget from "@/components/site/AskWidget";
import { doorBody } from "@/components/site/doors/bodies";
import {
  ACTION,
  ACTION_QUIET,
  DISPLAY,
  HEADING,
  LINK,
  META,
  META_PLAIN,
  PAGE,
  PANEL_CHROME,
  READ,
  READ_MUTED,
} from "@/components/site/doors/quiet";
import Footer from "@/components/site/Footer";
/* Which tiers a stranger reads is decided in one place; this page reads that
 * decision rather than making a second one. */
import { isPublicDoor } from "@/components/site/GatedOffers";
import Header from "@/components/site/Header";
import KeepStrip from "@/components/site/KeepStrip";
import { collectSource } from "@/components/site/LeadDialog";
import { usePanelState, type CreateRoomResult } from "@/hooks/use-panel-state";
import NotFound from "@/pages/not-found";

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
 * One page for every door, in the quiet-studio language.
 *
 * Everything a visitor reads here — the headline, the blurb, the agent's job,
 * the four starters, the tier, the tool where there is one, and the company
 * that will send the invoice — is read out of the row in shared/doors.ts. One
 * door adds a section of its own on top of that; which one, and why that is the
 * only exception, is written down in doors/bodies.tsx.
 *
 * What this page stopped doing, and why:
 *
 * - **No cards, no badges, no tinted initials square, no icons.** The measured
 *   problem was a page of chrome: the tier was a pill, the status was a second
 *   pill, the contract was a bordered box, and the panel floated in another
 *   one. Those are now hairline rules and space, and the tier is a sentence.
 * - **One action in the first screen, not two.** "Ask your question" and "Talk
 *   to a person" stood side by side and split the click. Asking is what this
 *   page is for; the person is offered under the company's name, which is where
 *   a person is what you actually want.
 * - **The panel gets a band of the page.** It is the argument of the whole
 *   site, and it was a card in a column beside a column of chrome.
 * - **The footer no longer outweighs the page.** The pitch was 770 pixels
 *   against 550 of footer with 530 of nothing between; the door now has its
 *   panel, its contract and — on the door that has one — its whole argument
 *   above that footer.
 */
function DoorPage({ door }: { door: DoorDef }) {
  const [, navigate] = useLocation();
  const tier = DOOR_TIERS[door.tier];
  const agent = doorAgent(door);
  const Body = doorBody(door.id);

  /* Two things have to be true before a panel is honest: the row says the door
   * is open, and it names an agent that exists in the roster. The partner's row
   * names nobody on purpose, and a row pointing at a missing agent would post a
   * question the server rejects — both get the block below rather than a
   * composer with nobody behind it. */
  const panelIsOpen = door.status === "live" && agent !== undefined;
  const oursToAnswer = door.contract.legalName === OUR_LEGAL_NAME;

  // Same approach as /use-case and the home page: no helmet dependency, and the
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
  }, [door, oursToAnswer]);

  /* A door that /use-case only names after the email step must not arrive from a
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

  // Arriving from a row halfway down /use-case otherwise lands the visitor halfway
  // down the door, below the headline they just clicked.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [door.id]);

  /**
   * Mints the room and deliberately does not navigate — the same contract the
   * home page's panel has, and for the same reason: "Kept. This conversation
   * now has an address" is only true if the address is on screen before the
   * page moves. The one caller that does navigate is openRoom below, which has
   * no address to show because there is no conversation yet.
   *
   * collectSource() reads the door off the path, which resolves correctly from
   * /use-case/<slug> because that is what the row's `path` says. The door is
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
   * trigger (c) and goes through the same Keep flow as everything else.
   */
  const keepFromPanel = useCallback(
    async (opts?: { agentId?: string; firstMessage?: string }): Promise<string | null> => {
      await panel.keep(opts?.firstMessage);
      return null;
    },
    [panel],
  );

  /** The panel is the fastest free answer on the page, so the action puts the cursor in it. */
  const askInPanel = useCallback(() => {
    const field = document.getElementById("ask-question");
    if (!(field instanceof HTMLTextAreaElement)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    field.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    field.focus({ preventScroll: true });
  }, []);

  /* ------------------------- the way through to a room -------------------
   *
   * The room is the product and it had no visible entrance: it existed only
   * as the far end of the Keep flow, so somebody who read the page without
   * typing anything never found out it was there. This is the entrance —
   * one line of text at the bottom of the page, under the sentence that
   * explains what a room is, in the quietest thing on the page that is still
   * a link. It is deliberately not a second button beside the first: the
   * page's one action is asking, and this is where a person who has finished
   * reading goes next.
   *
   * It mints through the same createRoom as the Keep flow, so the room is
   * stamped with this door and its footer names this door's company. It is
   * only offered where a panel is open — a room opened from a door with no
   * agent is an empty room, and on the partner's door it would be one of our
   * rooms wearing their name.
   */
  const [openingRoom, setOpeningRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  const openRoom = useCallback(async () => {
    if (openingRoom) return;
    setOpeningRoom(true);
    setRoomError(null);
    const result = await createRoom();
    setOpeningRoom(false);
    if (!result.ok) {
      setRoomError(result.error);
      return;
    }
    navigate(result.room.path);
  }, [createRoom, navigate, openingRoom]);

  const room = panel.stage === "kept" ? panel.room : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* ------------------------- the first screen ------------------------ */}
        <div className={`${PAGE} pt-[var(--s5)]`}>
          <p className={META}>
            <Link href="/use-case" data-testid="link-door-back" className="draw hover:text-foreground">
              Index
            </Link>
            <span aria-hidden="true"> · </span>
            <span data-testid="text-door-tier">{tier.label}</span>
            {door.status === "coming" ? (
              <>
                <span aria-hidden="true"> · </span>
                <span data-testid="text-door-status">Not open yet</span>
              </>
            ) : null}
          </p>

          <div className="mt-[var(--s4)] grid items-end gap-[var(--s4)] pb-[var(--s6)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
            <h1 className={DISPLAY} data-testid="text-door-headline">
              {door.headline}
            </h1>

            <div>
              <p className={READ_MUTED} data-testid="text-door-blurb">
                {door.blurb}
              </p>

              {/* One action on the page, and it is the thing the page is for.
                  A door with no panel has nothing to ask, so it has no action
                  here either — the call is offered once, below, beside the
                  sentence that says why there is no panel. Two "talk to a
                  person" links on one screen is the second call to action this
                  direction exists to delete. */}
              {panelIsOpen ? (
                <div className="mt-[var(--s4)]">
                  <button type="button" data-testid="button-door-ask" className={ACTION} onClick={askInPanel}>
                    Put a question to the agent
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* --------------------------- the panel band ------------------------ */}
        <div className="border-y border-border bg-card py-[var(--s5)] lg:py-[var(--s6)]">
          <div className={`${PAGE} grid gap-[var(--s4)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]`}>
            <div>
              {panelIsOpen ? (
                <>
                  <h2 className={HEADING}>Ask it something before you decide anything.</h2>
                  {/* The panel prints the agent's job itself, beside the agent
                      it is about, so saying it here as well would put the same
                      sentence twice in one screen. It is wanted only on a door
                      with no panel, where it is the only place a visitor is
                      told who would have answered. */}
                  <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
                    It is free, it does not need your name, and it will tell you when your question is a five-minute
                    fix.
                  </p>
                </>
              ) : (
                <>
                  <h2 className={HEADING} data-testid="text-door-shut">
                    {door.status === "live" ? "No agent of ours answers in this door." : "This door is not open yet."}
                  </h2>
                  <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
                    {door.status === "live"
                      ? "There is no panel here, and this page will not stand one of our agents in front of somebody else's work."
                      : (door.comingLine ??
                        "The offer is real and this page is not finished. A person is the shorter path.")}
                  </p>
                  <p className={`mt-[var(--s2)] ${META_PLAIN}`} data-testid="text-door-agent-line">
                    {door.agentLine}
                  </p>
                </>
              )}
            </div>

            <div>
              {panelIsOpen ? (
                <div className={PANEL_CHROME}>
                  <AskWidget
                    door={door}
                    onStartWorkspace={keepFromPanel}
                    onVisitorMessage={panel.noteVisitorMessage}
                    onAskedForAPerson={panel.noteAskedForAPerson}
                  />

                  <div aria-live="polite" className="mt-[var(--s4)] border-t border-border pt-[var(--s2)]">
                    {room ? (
                      <KeepStrip url={room.url} workspaceId={room.workspaceId} onOpen={() => navigate(room.path)} />
                    ) : (
                      <div
                        data-testid="row-panel-keep"
                        // Which of the four fired, readable in the DOM: the
                        // rule is meant to be checked rather than trusted.
                        data-trigger={panel.trigger ?? undefined}
                      >
                        {panel.stage === "asking" ? (
                          <div className="motion-safe:animate-fade-in-up">
                            <p className={READ} data-testid="text-panel-question">
                              That is yours, so this is worth keeping. Keep it, or stay anonymous?
                            </p>
                            <div className="mt-[var(--s2)] flex flex-wrap items-baseline gap-[var(--s3)]">
                              <button
                                type="button"
                                data-testid="button-panel-keep-it"
                                className={ACTION}
                                onClick={() => void panel.keep()}
                                disabled={panel.keeping}
                              >
                                {panel.keeping ? "Keeping…" : "Keep it"}
                              </button>
                              <button
                                type="button"
                                data-testid="button-panel-stay-anonymous"
                                className={ACTION_QUIET}
                                onClick={panel.stayAnonymous}
                              >
                                No, stay anonymous
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-baseline justify-between gap-x-[var(--s3)] gap-y-[var(--s1)]">
                            <p className={META_PLAIN} data-testid="text-panel-promise">
                              <span className="text-foreground">Nothing is saved yet.</span> Close this tab and it is
                              gone.
                            </p>
                            {panel.messageCount > 0 ? (
                              <button
                                type="button"
                                data-testid="button-panel-keep-this"
                                className={ACTION_QUIET}
                                onClick={() => void panel.keep()}
                                disabled={panel.keeping}
                              >
                                {panel.keeping ? "Keeping…" : "Keep this"}
                              </button>
                            ) : null}
                          </div>
                        )}

                        {panel.error ? (
                          <p role="alert" className="type-note mt-[var(--s2)] text-destructive">
                            {panel.error}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* A door that cannot hold a conversation says so on the left
                   and offers the thing that can. It never renders a panel that
                   is not there. */
                <div>
                  <p className={READ}>
                    A call covers the same ground, and it is with a person who can say what this would actually
                    involve.
                  </p>
                  <a
                    href={BOOK_A_CALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-door-book-call"
                    className={`${ACTION} mt-[var(--s3)]`}
                  >
                    Talk to a person
                  </a>
                  {!oursToAnswer ? (
                    // Our calendar on somebody else's door has to say whose
                    // calendar it is.
                    <p className={`mt-[var(--s3)] ${META_PLAIN}`}>
                      That call is with {OUR_LEGAL_NAME}, not with {door.contract.legalName}.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ----------------------- what this door has to say ------------------ */}
        {Body ? <Body /> : null}

        {/* ------------------------------ the tool --------------------------- */}
        {/* Where software does part of the work, it is named, linked and given
            its limit — a buyer choosing a supplier is entitled to know which
            half is a program. Only the rows that carry a tool print this. */}
        {door.tool ? (
          <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-door-tool">
            <div className="grid gap-[var(--s3)] border-t border-border pt-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
              <div>
                <p className={META}>The tool</p>
                <h2 className={`mt-[var(--s2)] ${HEADING}`}>
                  <a
                    href={door.tool.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-door-tool"
                    className={LINK}
                  >
                    {door.tool.name}
                  </a>
                </h2>
              </div>
              <p className={READ_MUTED} data-testid="text-door-tool-line">
                {door.tool.line}
              </p>
            </div>
          </section>
        ) : null}

        {/* -------------------- who you would be buying from ------------------ */}
        {/* Whoever is named here is who the room names. It is set by the row,
            not by a person remembering. */}
        <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-door-contract">
          <div className="grid gap-[var(--s3)] border-t border-border pt-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
            <div>
              <p className={META}>Who you would be buying from</p>
              <p className={`mt-[var(--s2)] ${HEADING}`} data-testid="text-door-legal-name">
                {door.contract.legalName}
              </p>
            </div>

            <div>
              <p className={READ_MUTED}>{door.contract.entity}</p>
              <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{door.contract.invoiceLine}</p>
              <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{tier.meaning}</p>

              <p className={`mt-[var(--s4)] ${META_PLAIN}`}>
                {door.contract.termsUrl ? (
                  <a
                    href={door.contract.termsUrl}
                    rel="noopener noreferrer"
                    data-testid="link-door-terms"
                    className={`${LINK} text-foreground`}
                  >
                    Terms
                  </a>
                ) : (
                  // Never offer the terms of the company next door.
                  <span>
                    {door.contract.legalName} has not published terms for this work yet, and this page will not show
                    anybody else&rsquo;s.
                  </span>
                )}
                <span aria-hidden="true"> · </span>
                {door.contract.contact ? (
                  <a
                    href={contactHref(door.contract.contact)}
                    rel="noopener noreferrer"
                    data-testid="link-door-contact"
                    className={`${LINK} text-foreground`}
                  >
                    {door.contract.contactLabel ?? door.contract.contact}
                  </a>
                ) : (
                  // Same rule as the terms: their address or none, never ours.
                  <span>
                    {door.contract.legalName} has not given an address for this door yet, and this page will not show
                    anybody else&rsquo;s.
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* --------------------------- the way out --------------------------- */}
        <section className={`${PAGE} pt-[var(--s6)]`}>
          <div className="max-w-[46ch]">
            {/* "Ask first" is only true where there is something to ask. A door
                with no panel closes on the sentence that is true of every door
                we run, and offers no second way in — the call above is the way
                in, and it was offered once. */}
            {panelIsOpen ? (
              <>
                <p className={READ}>
                  Ask first. It costs nothing, and it is the fastest way to find out whether you need us at all.
                </p>
                <p className={`mt-[var(--s3)] ${READ_MUTED}`}>
                  A kept answer becomes a room: one address, our agents and our people in it, and no signup — the link
                  in your browser is the whole account.
                </p>
                <button
                  type="button"
                  data-testid="button-door-open-room"
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
              </>
            ) : (
              <p className={READ_MUTED}>
                There is no magic: just expertise, dedicated hours, and a systematic approach.
              </p>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

/**
 * /use-case/:slug — the address every door answers on, all seven of them.
 *
 * The ChatGPT Ads row used to say `path: "/"` and this route redirected there.
 * It does not any more: the home page is the landing for every door, and this
 * one answers at /use-case/chatgpt-ads like its neighbours. The redirect stays for
 * any row whose `path` is moved somewhere else in future, so no branch here
 * names a door.
 */
export function Door() {
  const [, params] = useRoute<{ slug: string }>("/use-case/:slug");
  const door = params ? DOOR_BY_SLUG[params.slug] : undefined;

  if (!door) return <NotFound />;
  if (door.path !== `/use-case/${door.slug}`) return <Redirect to={door.path} replace />;

  // Keyed on the row, so moving between two doors remounts the panel instead of
  // carrying one door's conversation into the next.
  return <DoorPage key={door.id} door={door} />;
}

export default Door;
