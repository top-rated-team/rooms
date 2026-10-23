import { useCallback, useEffect, useState } from "react";
import { useRoute } from "wouter";
import type { ThreadPrice } from "@shared/api";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { ACTION, CHROME, LABEL, META, READ } from "@/components/workspace/room-style";

/**
 * One invoice sitting in a thread.
 *
 * Not a card in the four-sided sense: a rule, the amount, whose invoice it is,
 * and Pay. The room does not enclose things. The file is called PriceCard
 * because that is the name the parcel owns.
 *
 * Two issuers, because the money is two invoices. The expert invoices the
 * work; Top-Rated Team invoices its own fee separately. The legal name is
 * plain selectable text — someone copying it into their accounts has to be
 * able to select it, and a hover does not exist on a phone.
 *
 * Pay records the amount as paid in this room. This site does not take the
 * money; the named company sends the invoice. The sentence under the button
 * says that, because a button that implied a card charge would be a lie.
 */

export interface PriceCardProps {
  price: ThreadPrice;
  /** The room token. Taken from the URL when omitted, which is the usual case. */
  token?: string;
}

const HOUSE_LINE = "This is Top-Rated Team's own fee, billed separately from the work.";
const EXPERT_LINE = "This is the invoice for the work.";

function isThreadPrice(value: unknown): value is ThreadPrice {
  if (value === null || typeof value !== "object") return false;
  const price = value as Record<string, unknown>;
  return (
    typeof price.id === "string" &&
    price.id.length > 0 &&
    typeof price.amount === "string" &&
    typeof price.currency === "string" &&
    typeof price.for === "string" &&
    (price.issuer === "expert" || price.issuer === "house") &&
    typeof price.legalName === "string" &&
    price.legalName.length > 0 &&
    (price.status === "open" || price.status === "paid") &&
    (price.paidAt === null || typeof price.paidAt === "string") &&
    typeof price.channelId === "string" &&
    (price.parentId === null || typeof price.parentId === "string")
  );
}

/** The price sitting on a message, or nothing. For the transcript to render this. */
export function threadPriceFromMeta(meta: { price?: unknown } | null | undefined): ThreadPrice | null {
  return isThreadPrice(meta?.price) ? meta.price : null;
}

function priceFromResponse(value: unknown): ThreadPrice | null {
  if (isThreadPrice(value)) return value;
  if (value !== null && typeof value === "object" && isThreadPrice((value as { price?: unknown }).price)) {
    return (value as { price: ThreadPrice }).price;
  }
  return null;
}

function paidOn(paidAt: string): string {
  const date = new Date(paidAt);
  if (Number.isNaN(date.getTime())) return "Recorded as paid.";
  const when = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `Recorded as paid on ${when}.`;
}

export function PriceCard({ price, token: tokenProp }: PriceCardProps) {
  const [, params] = useRoute<{ token: string }>("/w/:token");
  const token = tokenProp ?? params?.token ?? "";

  const [current, setCurrent] = useState<ThreadPrice>(price);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent((prev) => {
      if (prev.id !== price.id) return price;
      if (prev.status === "paid" && price.status !== "paid") return prev;
      return price;
    });
  }, [price]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || !current.id) return;
      try {
        const next = await apiRequest<unknown>(
          "GET",
          `/api/workspaces/${encodeURIComponent(token)}/prices/${encodeURIComponent(current.id)}`,
          undefined,
          { signal },
        );
        const price = priceFromResponse(next);
        if (price) setCurrent(price);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        // An unreachable route is a missing handoff, not a lock. The figure
        // already on the message is still shown.
      }
    },
    [current.id, token],
  );

  useEffect(() => {
    if (current.status === "paid" || !token) return;
    const ac = new AbortController();
    void load(ac.signal);
    const id = window.setInterval(() => void load(), 8_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      ac.abort();
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [current.status, load, token]);

  const onPay = useCallback(async () => {
    if (!token || paying || current.status === "paid") return;
    setPaying(true);
    setError(null);
    try {
      const next = await apiRequest<unknown>(
        "POST",
        `/api/workspaces/${encodeURIComponent(token)}/prices/${encodeURIComponent(current.id)}/pay`,
      );
      const paidPrice = priceFromResponse(next);
      if (paidPrice) {
        setCurrent(paidPrice);
        return;
      }
      setError("The room recorded a reply this card could not read.");
    } catch (caught) {
      const line =
        caught instanceof ApiError && caught.message.trim()
          ? caught.message.trim()
          : "This room could not record the payment.";
      setError(line);
    } finally {
      setPaying(false);
    }
  }, [current.id, current.status, paying, token]);

  const issuerLine = current.issuer === "house" ? HOUSE_LINE : EXPERT_LINE;
  const paid = current.status === "paid";

  return (
    <div className="mt-4 border-t border-border pt-4" data-testid={`card-price-${current.id}`}>
      <p className={LABEL}>{paid ? "Paid" : "Price"}</p>

      <p className={cn(READ, "mt-2 text-foreground")} data-testid="text-price-amount">
        {current.amount}
      </p>
      <p className={cn(CHROME, "mt-1 text-foreground")} data-testid="text-price-for">
        {current.for}
      </p>

      <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-price-issuer">
        {issuerLine}
      </p>
      <p className={cn(CHROME, "mt-1.5 text-foreground")}>
        Invoiced by{" "}
        <span className="font-medium" data-testid="text-price-legal-name">
          {current.legalName}
        </span>
        .
      </p>

      {paid ? (
        <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-price-paid">
          {current.paidAt ? paidOn(current.paidAt) : "Recorded as paid."} The invoice is {current.legalName}'s, sent
          by them. This site does not take the money.
        </p>
      ) : (
        <>
          <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-price-status">
            Pay records this as paid in the room. {current.legalName} sends the invoice. This site does not take the
            money.
          </p>
          {token ? (
            <button
              type="button"
              onClick={() => void onPay()}
              disabled={paying}
              className={cn(ACTION, "mt-3")}
              data-testid="button-price-pay"
            >
              {/* "Record as paid", not "Pay". The sentence above already says
                  this site does not take the money — but a button is read
                  before the paragraph above it, and a control has to say what
                  pressing it does. Whoever presses this has paid, or is
                  recording that someone did; neither of them is paying here. */}
              {paying ? "Recording" : "Record as paid"}
            </button>
          ) : (
            <p className={cn(META, "mt-3 text-muted-foreground")}>Open this from the room to record a payment.</p>
          )}
        </>
      )}

      {error ? (
        <p className={cn(CHROME, "mt-3 text-muted-foreground")} data-testid="text-price-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default PriceCard;
