import { useCallback, useState } from "react";
import { useLocation } from "wouter";

import type { CreateWorkspaceResponse } from "@shared/api";

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
 * POST /api/workspaces takes no question. The default door stamp is `general`
 * (GENERAL_ROOM_ID in shared/playbook.ts) rather than the site's default door:
 * a room opened from the front page is not a conversion-tracking room, and
 * stamping it as one gave it that door's checklist and that door's name. A
 * door page passes its own id so the room that opens is that door's room.
 *
 * The id is written here as a literal so this hook can sit in the site header
 * without pulling shared/playbook.ts — and the campaign keys are written here
 * rather than imported from doorText.ts, for the same reason. Both must stay
 * in step with those files.
 *
 * `entered: "direct"` is the same marker HouseAsk sets: the lead inbox should
 * not have to guess whether somebody walked in or kept an answer.
 */
const GENERAL_ROOM_ID = "general";
const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "oppref"];

const RATE_LIMITED = "That is a lot of rooms from one address. Give it a minute, or book a call instead.";
const FAILED = "The room could not be opened. Try again, or write to us.";
const OFFLINE = "Network error, so no room was opened.";

function roomSource(doorId: string): Record<string, string> {
  if (typeof window === "undefined") return { door: doorId };
  const out: Record<string, string> = {};
  const params = new URLSearchParams(window.location.search);
  for (const key of SOURCE_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 200);
  }
  out.landing = window.location.pathname;
  out.door = doorId;
  if (document.referrer) out.referrer = document.referrer.slice(0, 300);
  return out;
}

export function useOpenRoom(options?: { doorId?: string; agentId?: string | null }) {
  const doorId = options?.doorId ?? GENERAL_ROOM_ID;
  const agentId = options?.agentId ?? undefined;
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
          ...(agentId ? { agentId } : {}),
          source: { ...roomSource(doorId), entered: "direct" },
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
  }, [agentId, doorId, navigate, opening]);

  return { open, opening, error };
}
