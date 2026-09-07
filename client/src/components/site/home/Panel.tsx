import { useCallback, useState } from "react";
import { useLocation } from "wouter";

import type { CreateWorkspaceResponse } from "@shared/api";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import AskWidget from "@/components/site/AskWidget";
import { ANSWERING_DOORS, countWord, roomSource, shortName } from "@/components/site/home/doorText";

/* ---------------------------------------------------------------------------
 * THE PANEL, AND THE ONE WAY INTO THE ROOM
 *
 * The panel used to be a card in the corner of the hero, beside a badge row,
 * four statistics, two buttons and a ten-link menu. Here it has a band of the
 * page to itself, because a stranger asking a real question and getting an
 * answer that cites the page it came from is the best thing this company owns.
 *
 * THE HOOK. The owner's complaint about this design was specific: he pressed
 * around it and could not find any way through to the collaborative room. So
 * there is exactly one, and it is the line under the panel — not a button in
 * the masthead, and not a link in the footer.
 *
 * It belongs here because the room IS this conversation, continued. In the
 * masthead it would be a product nobody has met yet, competing with the doors;
 * in the footer it would be filed under paperwork. Under the panel it is the
 * next thing to do, at the moment it first makes sense, and it is a line of
 * text rather than a second button shouting beside the first.
 *
 * What a visitor sees when they press it, honestly: a room opens at an address
 * of its own. If they have asked something, that question is already in it and
 * the agent is answering. If they have not, the room is not empty either — it
 * opens with its two channels, the welcome, and the checklist that says what
 * the work actually involves. The URL is the whole credential; there is no
 * signup and no password, which is also why the line says what it says.
 * ------------------------------------------------------------------------- */

const RATE_LIMITED = "That is a lot of rooms from one address. Give it a minute, or ask the question here instead.";
const FAILED = "The room could not be opened. The answer above is unaffected — ask again here, or write to us.";
const OFFLINE = "Network error, so no room was opened. The answer above is unaffected.";

export function Panel() {
  const [, navigate] = useLocation();
  /* Which documentation answers. The home page is not a door, so the visitor
     picks one, and the room they keep is stamped with that door rather than
     with a default — the room reads it back to decide whose name goes in its
     footer. */
  const [doorId, setDoorId] = useState<string>(ANSWERING_DOORS[0]?.id ?? DEFAULT_DOOR_ID);
  const door = DOOR_BY_ID[doorId] ?? DOOR_BY_ID[DEFAULT_DOOR_ID];

  /** The first thing the visitor said, which is what a kept room opens with. */
  const [firstMessage, setFirstMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asked = firstMessage !== null;

  /**
   * Mints the room and goes there. Also handed to AskWidget, so its own
   * "Start a workspace" after an answer and the line below this panel do
   * exactly the same thing and land in the same room — one way in, offered at
   * the two moments it makes sense, rather than two designs competing.
   */
  const openRoom = useCallback(
    async (opts?: { agentId?: string; firstMessage?: string }): Promise<string | null> => {
      setOpening(true);
      setError(null);
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: opts?.agentId ?? door.firstAgentId ?? undefined,
            firstMessage: opts?.firstMessage ?? firstMessage ?? undefined,
            source: roomSource(door.id),
          }),
        });
        if (!res.ok) {
          const message = res.status === 429 ? RATE_LIMITED : FAILED;
          setError(message);
          return message;
        }
        const state = (await res.json()) as CreateWorkspaceResponse;
        navigate(`/w/${state.workspace.token}`);
        return null;
      } catch {
        setError(OFFLINE);
        return OFFLINE;
      } finally {
        setOpening(false);
      }
    },
    [door, firstMessage, navigate],
  );

  return (
    <section id="panel" className="home-panel mt-[var(--s5)] bg-card py-[var(--s5)] lg:mt-[var(--s6)]">
      <div className="mx-auto grid max-w-[var(--page)] grid-cols-1 items-start gap-[var(--s4)] px-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
        <div>
          <h2 className="type-body m-0 font-display font-medium">Ask it something before you decide anything.</h2>
          <p className="type-body mt-[var(--s2)]">
            It is free, it does not need your name, and it will tell you when your question is a five-minute fix.
          </p>

          {/* Which subjects actually have documentation behind them, read off
              the door rows rather than typed here. A door whose corpus is not
              built is not offered, because an agent with nothing to read gives
              a confident answer citing somebody else's product. */}
          {ANSWERING_DOORS.length > 1 && !asked ? (
            <p className="type-note mt-[var(--s3)] text-muted-foreground" data-testid="row-panel-subjects">
              {countWord(ANSWERING_DOORS.length).replace(/^./, (c) => c.toUpperCase())} subjects have documentation
              behind them today.{" "}
              {ANSWERING_DOORS.map((option, index) => (
                <span key={option.id}>
                  {index > 0 ? " · " : ""}
                  <button
                    type="button"
                    data-testid="button-panel-subject"
                    aria-pressed={option.id === door.id}
                    onClick={() => setDoorId(option.id)}
                    className={
                      option.id === door.id
                        ? "draw draw-on text-foreground"
                        : "draw text-muted-foreground hover:text-foreground"
                    }
                  >
                    {shortName(option.headline)}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <div>
          {/* Keyed on the door: changing the subject changes which agent and
              which four questions are on screen, and a thread from the previous
              subject would be answered by an agent that never said it. */}
          <AskWidget
            key={door.id}
            door={door}
            onStartWorkspace={openRoom}
            onVisitorMessage={(text) => setFirstMessage((current) => current ?? text)}
          />

          <p className="type-note mt-[var(--s3)] text-muted-foreground" data-testid="text-panel-keep">
            <span className="font-medium text-foreground">Nothing is saved yet.</span> Close this tab and it is gone.{" "}
            {asked ? (
              <>
                <button
                  type="button"
                  data-testid="button-open-room"
                  onClick={() => void openRoom()}
                  disabled={opening}
                  className="draw draw-on font-medium text-foreground disabled:opacity-50"
                >
                  Keep this conversation
                </button>{" "}
                and it becomes a room instead: an address of its own, the answer already in it, and somewhere to put a
                person.
              </>
            ) : (
              <>
                A conversation worth keeping becomes a room instead: an address of its own, the work written out as a
                checklist, and somewhere to put a person.{" "}
                <button
                  type="button"
                  data-testid="button-open-room"
                  onClick={() => void openRoom()}
                  disabled={opening}
                  className="draw draw-on font-medium text-foreground disabled:opacity-50"
                >
                  Open one
                </button>{" "}
                to see what that looks like.
              </>
            )}
          </p>

          {error ? (
            <p role="alert" className="type-note mt-[var(--s1)] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default Panel;
