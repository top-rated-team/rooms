import { useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Award, Loader2 } from "lucide-react";

import { BOOK_A_CALL_URL, PROOF } from "@shared/roster";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import type { CreateWorkspaceResponse } from "@shared/api";
import AskWidget from "@/components/site/AskWidget";
import KeepStrip from "@/components/site/KeepStrip";
import { collectSource, type LeadPrefill } from "@/components/site/LeadDialog";
import { usePanelState, type CreateRoomResult } from "@/hooks/use-panel-state";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY_SM = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-8 rounded-md px-3 text-xs`;
const BTN_GHOST_SM = `${BTN_BASE} border border-transparent min-h-8 rounded-md px-3 text-xs`;

/**
 * This page is the ChatGPT Ads door. The row is what decides which agent speaks
 * first and which four questions the panel opens with, so it is read here
 * rather than restated — see shared/doors.ts.
 *
 * Whether a conversation becomes a room is not AskWidget's business: that rule
 * lives in use-panel-state.ts, so the panel reports the messages the visitor
 * sends and this file decides.
 */
const PANEL_DOOR = DOOR_BY_ID[DEFAULT_DOOR_ID];

export interface HeroProps {
  /**
   * Button one. Since the panel became the fastest free answer on the page this
   * puts the cursor in it rather than opening a form; landing.tsx falls back to
   * the form when the panel is not in the DOM.
   */
  onTalkToHuman: (prefill?: LeadPrefill) => void;
}

export function Hero({ onTalkToHuman }: HeroProps) {
  const [, navigate] = useLocation();

  /**
   * Mints the room and deliberately does not navigate — that is the whole
   * difference from landing.tsx's startWorkspace. "Kept. This conversation now
   * has an address" is only true if the address is on screen before the page
   * moves, so this needs the response rather than a redirect.
   */
  const createRoom = useCallback(async (firstMessage?: string): Promise<CreateRoomResult> => {
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: PANEL_DOOR.firstAgentId ?? undefined,
          firstMessage,
          // collectSource() stamps the door on the room. The room's footer reads
          // it back to say which company is answerable for what happens there.
          source: collectSource(),
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
      return { ok: false, error: "Network error creating the workspace. Book a call and we will pick it up from there." };
    }
  }, []);

  const panel = usePanelState({ createRoom });

  /**
   * The panel's own "Start a workspace" button is a deliberate press, so it is
   * trigger (c) and goes through the same Keep flow as everything else. It is
   * awaited so the button keeps its spinner, and it reports nothing back: the
   * row under the panel is where this whole flow speaks, and saying it twice
   * would be worse than saying it once.
   */
  const keepFromPanel = useCallback(
    async (opts?: { agentId?: string; firstMessage?: string }): Promise<string | null> => {
      await panel.keep(opts?.firstMessage);
      return null;
    },
    [panel],
  );

  const room = panel.stage === "kept" ? panel.room : null;

  return (
    <section id="hero" className="pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[85vh] items-center gap-12 py-16 lg:grid-cols-[1.08fr_1fr] lg:gap-16 lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Award className="h-4 w-4 text-primary" />
              Official Google Ads Trainers · Google Partner Top 10%
            </div>

            {/* Two lines at 60px, matching top-rated.team's hero rhythm. Keep it
                short enough to stay two lines — a six-line headline is the fastest
                way to lose a paid click. */}
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Conversion tracking{" "}
              <span className="text-primary">for ChatGPT Ads</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              The one part of paid ads an API still can&rsquo;t finish for you. Pixel, Conversions API, deduplication and
              consent — installed on your real site, verified against live conversions, and documented before we hand it
              back.
            </p>

            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              There is no magic: just expertise, dedicated hours, and a systematic approach.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="button-hero-primary"
                className={BTN_PRIMARY}
                onClick={() => onTalkToHuman({ intent: "conversion-tracking" })}
              >
                Ask about my setup
                <ArrowRight />
              </button>
              <a
                href={BOOK_A_CALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-hero-book-call"
                // Booking a call is the explicit form of trigger (a): they asked
                // for a person. The call opens in its own tab, so the question
                // about keeping the conversation is waiting when they come back.
                onClick={panel.noteAskedForAPerson}
                className={BTN_SECONDARY}
              >
                Book a call
              </a>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-6">
              {PROOF.map((item) => (
                <div key={item.label} className="flex items-baseline gap-2">
                  <dt className="sr-only">{item.label}</dt>
                  <dd className="text-base font-semibold tabular-nums">{item.value}</dd>
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </dl>
          </div>

          {/* The panel and the line under it are one card: the promise about what
              is saved belongs to the thing doing the saving, not to a caption
              floating near it. The first child is the panel; its bottom edge is
              removed so the row below continues it. */}
          <div className="lg:pl-4">
            <div className="[&>div:first-child]:rounded-b-none [&>div:first-child]:border-b-0">
              <AskWidget
                door={PANEL_DOOR}
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
                    // Which of the four fired, readable in the DOM: the rule is
                    // meant to be checked rather than trusted.
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
                          <span className="font-medium text-foreground">Nothing is saved yet.</span> Close this tab and
                          it is gone.
                        </p>
                        {/* Nothing to keep until something has been said. A room
                            is a place to come back to, and there is no point
                            offering one before there is anything in it. */}
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
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
