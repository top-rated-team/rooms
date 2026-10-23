import { useEffect, useState } from "react";
import type { BoosterInventory, BoosterState, RoomBooster } from "@shared/api";
import { apiRequest, ApiError } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { CHROME, LABEL, META } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * BOOSTERS, AS INVENTORY
 *
 * Rented accounts are capacity, not people. They do not appear in the member
 * rail or the @mention list, because the rail prints who pays whom under every
 * name, and an account listed there would tell a client a person is on their
 * team when none is. The contract says a rented account "is not your employee,
 * your colleague, or a person endorsing you, and you should not describe it as
 * one." This panel is the place that list belongs.
 *
 * The names here are call signs mapped from an account id. The API's `name`
 * field is a real person and never reaches this file.
 * ------------------------------------------------------------------------- */

const STATE_LABEL: Record<BoosterState, string> = {
  live: "Live",
  restricted: "Restricted",
  under_appeal: "Under appeal",
  rental_ending: "Rental ending",
  unknown: "State not given",
};

type View =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ok"; boosters: RoomBooster[] };

function isInventory(value: unknown): value is BoosterInventory {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as { status?: unknown; boosters?: unknown };
  if (rec.status === "unavailable") return true;
  return rec.status === "ok" && Array.isArray(rec.boosters);
}

function dayLabel(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export interface AccountsPanelProps {
  token: string;
  className?: string;
}

export function AccountsPanel({ token, className }: AccountsPanelProps) {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    setView({ kind: "loading" });

    void apiRequest<unknown>("GET", `/api/workspaces/${token}/boosters`, undefined, { signal: ac.signal })
      .then((payload) => {
        if (!isInventory(payload) || payload.status === "unavailable") {
          setView({ kind: "unavailable" });
          return;
        }
        setView({ kind: "ok", boosters: payload.boosters });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 0 && ac.signal.aborted) return;
        setView({ kind: "unavailable" });
      });

    return () => ac.abort();
  }, [token]);

  return (
    <div className={cn("border-b border-border px-4 py-4", className)} data-testid="panel-boosters">
      <h2 className={LABEL}>Boosters</h2>
      <p className={cn(CHROME, "mt-1.5 text-muted-foreground")}>
        Rented accounts, listed as capacity. They are not members of this room.
      </p>

      {view.kind === "loading" ? (
        <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-boosters-loading">
          Reading the inventory.
        </p>
      ) : null}

      {view.kind === "unavailable" ? (
        <div className="mt-3" data-testid="text-boosters-unavailable">
          <p className={cn(CHROME, "font-medium")}>Not available.</p>
          <p className={cn(META, "mt-1 text-muted-foreground")}>
            The inventory could not be read. That is not the same as holding none.
          </p>
        </div>
      ) : null}

      {view.kind === "ok" && view.boosters.length === 0 ? (
        <p className={cn(CHROME, "mt-3 text-muted-foreground")} data-testid="text-boosters-empty">
          None held.
        </p>
      ) : null}

      {view.kind === "ok" && view.boosters.length > 0 ? (
        <ul className="mt-3" data-testid="list-boosters">
          {view.boosters.map((booster) => (
            <li key={booster.callSign} className="border-t border-border py-3" data-testid={`booster-${booster.number}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn(CHROME, "font-medium")}>{booster.callSign}</span>
                <span className={cn(META, "shrink-0 text-muted-foreground")}>{STATE_LABEL[booster.state]}</span>
              </div>
              {booster.location ? (
                <p className={cn(META, "mt-1 text-muted-foreground")}>Proxy location {booster.location}</p>
              ) : null}
              {booster.rentalEndsAt && dayLabel(booster.rentalEndsAt) ? (
                <p className={cn(META, "mt-1 text-muted-foreground")}>Rental ends {dayLabel(booster.rentalEndsAt)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className={cn(META, "mt-3 text-muted-foreground")}>
        A rented account is not an employee, a colleague, or a person endorsing anyone here, and it should not be
        described as one.
      </p>
    </div>
  );
}

export default AccountsPanel;
