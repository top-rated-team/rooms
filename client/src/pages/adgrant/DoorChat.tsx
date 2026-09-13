import { useCallback } from "react";
import { useLocation } from "wouter";

import type { CreateWorkspaceResponse } from "@shared/api";
import type { DoorDef } from "@shared/doors";
import AskWidget from "@/components/site/AskWidget";
import KeepStrip from "@/components/site/KeepStrip";
import { ACTION, ACTION_QUIET, META_PLAIN, PANEL_CHROME, READ } from "@/components/site/doors/quiet";
import { roomSource } from "@/components/site/home/doorText";
import { usePanelState, type CreateRoomResult } from "@/hooks/use-panel-state";

/**
 * The door's own chat, reused from the Top-Rated Team door page rather than
 * rewritten with the same words. The door comes from the catalogue, so the
 * agent, the starters and the room stamp are the nonprofit row.
 */
export function DoorChat({ door }: { door: DoorDef }) {
  const [, navigate] = useLocation();

  const createRoom = useCallback(
    async (firstMessage?: string): Promise<CreateRoomResult> => {
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: door.firstAgentId ?? undefined,
            firstMessage,
            source: { ...roomSource(door.id), entered: "panel" },
          }),
        });
        if (!res.ok) {
          return {
            ok: false,
            error:
              res.status === 429
                ? "That is a lot of rooms from one address. Give it a minute."
                : "The room could not be opened. Try again.",
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
        return { ok: false, error: "Network error, so no room was opened." };
      }
    },
    [door],
  );

  const panel = usePanelState({ createRoom });
  const keepFromPanel = useCallback(
    async (opts?: { agentId?: string; firstMessage?: string }): Promise<string | null> => {
      await panel.keep(opts?.firstMessage);
      return null;
    },
    [panel],
  );

  const room = panel.stage === "kept" ? panel.room : null;

  return (
    <div className={PANEL_CHROME} data-testid="block-adgrant-door-chat">
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
          <div data-testid="row-adgrant-panel-keep" data-trigger={panel.trigger ?? undefined}>
            {panel.stage === "asking" ? (
              <div className="motion-safe:animate-fade-in-up">
                <p className={READ} data-testid="text-adgrant-panel-question">
                  That is yours, so this is worth keeping. Keep it, or stay anonymous?
                </p>
                <div className="mt-[var(--s2)] flex flex-wrap items-baseline gap-[var(--s3)]">
                  <button
                    type="button"
                    data-testid="button-adgrant-panel-keep-it"
                    className={ACTION}
                    onClick={() => void panel.keep()}
                    disabled={panel.keeping}
                  >
                    {panel.keeping ? "Keeping…" : "Keep it"}
                  </button>
                  <button
                    type="button"
                    data-testid="button-adgrant-panel-stay-anonymous"
                    className={ACTION_QUIET}
                    onClick={panel.stayAnonymous}
                  >
                    No, stay anonymous
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline justify-between gap-x-[var(--s3)] gap-y-[var(--s1)]">
                <p className={META_PLAIN} data-testid="text-adgrant-panel-promise">
                  <span className="text-foreground">Nothing is saved yet.</span> Close this tab and it is gone.
                </p>
                {panel.messageCount > 0 ? (
                  <button
                    type="button"
                    data-testid="button-adgrant-panel-keep-this"
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
  );
}
