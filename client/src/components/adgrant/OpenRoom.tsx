import { useCallback, useState } from "react";
import { useLocation } from "wouter";

import type { CreateWorkspaceResponse } from "@shared/api";
import { DOOR_BY_ID } from "@shared/doors";
import { roomSource } from "@/components/site/home/doorText";
import { ACTION, ACTION_QUIET } from "@/components/site/doors/quiet";

/* The Ad Grants door, not the door collectSource() would guess from /adgrant.
 * A room opened here has to carry this product: its agent, its corpus, and the
 * legal name that door already prints. */
const DOOR = DOOR_BY_ID["ad-grants"];

const RATE_LIMITED = "That is a lot of rooms from one address. Give it a minute.";
const FAILED = "The room could not be opened. Try again.";
const OFFLINE = "Network error, so no room was opened.";

interface OpenRoomProps {
  /** Distinct per place: the same control rendered twice under one id would make any assertion match both. */
  where: "hero" | "close";
  loud?: boolean;
}

export function OpenRoom({ where, loud = false }: OpenRoomProps) {
  const [, navigate] = useLocation();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: DOOR.firstAgentId ?? undefined,
          source: { ...roomSource(DOOR.id), entered: "direct" },
        }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? RATE_LIMITED : FAILED);
        return;
      }
      const state = (await res.json()) as CreateWorkspaceResponse;
      navigate(`/w/${state.workspace.token}`);
    } catch {
      setError(OFFLINE);
    } finally {
      setOpening(false);
    }
  }, [navigate, opening]);

  return (
    <div>
      <button
        type="button"
        data-testid={`button-adgrant-open-room-${where}`}
        className={loud ? ACTION : ACTION_QUIET}
        onClick={() => void open()}
        disabled={opening}
      >
        {opening ? "Opening a room…" : "Open a room"}
      </button>
      {error ? (
        <p role="alert" className="type-note mt-[var(--s2)] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
