import { useCallback, useState } from "react";
import { useLocation } from "wouter";

import type { CreateWorkspaceResponse } from "@shared/api";
import { GENERAL_ROOM_ID } from "@shared/playbook";
import { roomSource } from "@/components/site/home/doorText";

/**
 * Open a room with nothing asked first.
 *
 * WHY THIS EXISTS AS A HOOK. The first screen's "Open a room" used to scroll to
 * the ask section, which the owner spotted and objected to: the button says
 * open, so it should open. The creation call itself already lived in two other
 * places — HouseAsk, which can also carry a conversation into the room, and the
 * door page, which goes through usePanelState — and the first screen needs
 * neither of those, only the plain case. So the plain case is here, once.
 *
 * POST /api/workspaces takes no question. The door stamp is GENERAL_ROOM_ID
 * rather than the default door: a room opened from the front page is not a
 * conversion-tracking room, and stamping it as one gave it that door's
 * checklist and that door's name. See shared/playbook.ts.
 *
 * `entered: "direct"` is the same marker HouseAsk sets: the lead inbox should
 * not have to guess whether somebody walked in or kept an answer.
 */
const RATE_LIMITED = "That is a lot of rooms from one address. Give it a minute, or book a call instead.";
const FAILED = "The room could not be opened. Try again, or write to us.";
const OFFLINE = "Network error, so no room was opened.";

export function useOpenRoom() {
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
          source: { ...roomSource(GENERAL_ROOM_ID), entered: "direct" },
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

  return { open, opening, error };
}
