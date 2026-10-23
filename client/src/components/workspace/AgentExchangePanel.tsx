import { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, LABEL, META } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * AGENTS ANSWERING EACH OTHER
 *
 * Two agents allowed to answer each other will answer each other while nobody
 * is watching, and every turn of that costs money. The owner's rule is that
 * "until the budget runs out" is not a stopping condition: somebody has to be
 * asked first, told what it costs and what it is billed to, and shown the
 * number of turns before agreeing to it.
 *
 * So this panel is the asking. It shows the number, it shows the card, and it
 * shows how many turns are left — and when there is no card, or nobody has
 * agreed, the agents simply say so in the room and stop.
 *
 * NO CARD FIELD IS RENDERED HERE. "Add a card" leaves for Stripe's own page
 * and comes back with a session id. On a deployment with no Stripe keys this
 * panel renders nothing at all: the feature is not offered rather than
 * half-offered.
 * ------------------------------------------------------------------------- */

interface BillingView {
  configured: boolean;
  card: { brand: string | null; last4: string | null; addedAt: string | null } | null;
  exchange: {
    allowed: boolean;
    turnsAgreed: number | null;
    turnsLeft: number;
    agreedBy: string | null;
    agreedAt: string | null;
    turnsOnOffer: number;
    disclosure: string;
    line: string | null;
  };
}

export interface AgentExchangePanelProps {
  token: string;
  /**
   * Who may attach a card and agree. Defaults off: the server refuses anyone
   * else anyway, and a button that always refuses is worse than no button.
   * The state is still shown, because a room's people should be able to see
   * what their room is allowed to spend.
   */
  canManage?: boolean;
  className?: string;
}

function cardLine(card: BillingView["card"]): string {
  if (!card) return "No card on this room.";
  const brand = card.brand ? card.brand.replace(/^./, (c) => c.toUpperCase()) : "Card";
  return card.last4 ? `${brand} ending ${card.last4}.` : `${brand} on file.`;
}

export function AgentExchangePanel({ token, canManage = false, className }: AgentExchangePanelProps) {
  const [view, setView] = useState<BillingView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setView(await apiRequest<BillingView>("GET", `/api/workspaces/${encodeURIComponent(token)}/billing`, undefined, { signal }));
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        /* A room that cannot read this is a room where the feature is off, and
           saying so in red would be a fault where there is none. */
        setView(null);
      }
    },
    [token],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  /* Coming back from Stripe. The session id is in the URL; it is spent here
     and then taken out of the address so a reload does not replay it. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("card") !== "done") {
      if (params.get("card") === "cancelled") {
        params.delete("card");
        const rest = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
      }
      return;
    }
    const session = params.get("session");
    params.delete("card");
    params.delete("session");
    const rest = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    if (!session) return;
    setBusy(true);
    void apiRequest<BillingView>("POST", `/api/workspaces/${encodeURIComponent(token)}/billing/card/done`, {
      checkoutSessionId: session,
    })
      .then((next) => setView(next))
      .catch((doneError: unknown) => {
        setError(doneError instanceof ApiError ? doneError.message : "That card could not be read back.");
      })
      .finally(() => setBusy(false));
  }, [token]);

  const addCard = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiRequest<{ url: string }>("POST", `/api/workspaces/${encodeURIComponent(token)}/billing/card`, {});
      window.location.assign(url);
    } catch (startError) {
      setError(startError instanceof ApiError ? startError.message : "The card page could not be opened.");
      setBusy(false);
    }
  }, [token]);

  const setConsent = useCallback(
    async (agree: boolean, turnsShown: number) => {
      setBusy(true);
      setError(null);
      try {
        setView(
          await apiRequest<BillingView>("POST", `/api/workspaces/${encodeURIComponent(token)}/billing/agent-exchange`, {
            agree,
            ...(agree ? { turnsShown } : {}),
          }),
        );
      } catch (consentError) {
        setError(consentError instanceof ApiError ? consentError.message : "That could not be saved.");
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  if (!view || !view.configured) return null;

  const { exchange } = view;

  return (
    <div className={cn("border-b border-border px-4 py-4", className)} data-testid="panel-agent-exchange">
      <h2 className={LABEL}>Agents answering each other</h2>

      <p className={cn(CHROME, "mt-1.5 text-muted-foreground")}>{exchange.disclosure}</p>

      <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-exchange-card">
        {cardLine(view.card)}
      </p>

      {exchange.turnsAgreed ? (
        <p className={cn(CHROME, "mt-1")} data-testid="text-exchange-state">
          {exchange.turnsLeft} of {exchange.turnsAgreed} turns left
          {exchange.agreedBy ? `, agreed by ${exchange.agreedBy}` : ""}.
        </p>
      ) : (
        <p className={cn(CHROME, "mt-1")} data-testid="text-exchange-state">
          Off. Agents answer people here, and nobody else.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {canManage && !view.card ? (
          <button type="button" className={ACTION} onClick={() => void addCard()} disabled={busy} data-testid="button-add-card">
            Add a card
          </button>
        ) : null}

        {canManage && view.card && (!exchange.turnsAgreed || exchange.turnsLeft <= 0) ? (
          <button
            type="button"
            className={ACTION}
            onClick={() => void setConsent(true, exchange.turnsOnOffer)}
            disabled={busy}
            data-testid="button-allow-exchange"
          >
            Allow {exchange.turnsOnOffer} turns
          </button>
        ) : null}

        {canManage && exchange.turnsAgreed ? (
          <button
            type="button"
            className={ACTION_QUIET}
            onClick={() => void setConsent(false, exchange.turnsOnOffer)}
            disabled={busy}
            data-testid="button-stop-exchange"
          >
            Turn off
          </button>
        ) : null}
      </div>

      {error ? (
        <p className={cn(META, "mt-2 text-destructive")} data-testid="text-exchange-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default AgentExchangePanel;
