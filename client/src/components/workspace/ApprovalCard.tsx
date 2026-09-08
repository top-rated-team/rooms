import { useCallback, useEffect, useState } from "react";
import { useRoute } from "wouter";
import type { ApprovalChange, ThreadApproval } from "@shared/api";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, FOCUS, LABEL, META, READ } from "@/components/workspace/room-style";

/**
 * One proposed change sitting in a thread.
 *
 * Not a card in the four-sided sense: a heading, a before and after, and two
 * buttons. The room does not enclose things. The file is called ApprovalCard
 * because that is the name the parcel owns.
 *
 * The shape is ported from Top-Voice's proposal cards. A person reads the
 * verb and the name first — New or Edit, and which thing — then each field
 * as it is now, struck through, then what it would become. Approving records
 * a name and a time. It does not write the change to any account; there is
 * no connection here that could.
 */

export interface ApprovalCardProps {
  approval: ThreadApproval;
  /** The room token. Taken from the URL when omitted, which is the usual case. */
  token?: string;
}

function isApprovalChange(value: unknown): value is ApprovalChange {
  if (value === null || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  return (
    typeof change.field === "string" &&
    change.field.length > 0 &&
    Object.prototype.hasOwnProperty.call(change, "from") &&
    Object.prototype.hasOwnProperty.call(change, "to")
  );
}

function isThreadApproval(value: unknown): value is ThreadApproval {
  if (value === null || typeof value !== "object") return false;
  const approval = value as Record<string, unknown>;
  return (
    typeof approval.id === "string" &&
    approval.id.length > 0 &&
    typeof approval.heading === "string" &&
    typeof approval.summary === "string" &&
    typeof approval.kind === "string" &&
    typeof approval.creates === "boolean" &&
    (approval.targetName === null || typeof approval.targetName === "string") &&
    Array.isArray(approval.changes) &&
    approval.changes.every(isApprovalChange) &&
    (approval.status === "pending" || approval.status === "approved" || approval.status === "declined") &&
    typeof approval.proposedBy === "string" &&
    typeof approval.proposedAt === "string" &&
    (approval.decidedBy === null || typeof approval.decidedBy === "string") &&
    (approval.decidedAt === null || typeof approval.decidedAt === "string") &&
    typeof approval.channelId === "string" &&
    (approval.parentId === null || typeof approval.parentId === "string")
  );
}

/** The approval sitting on a message, or nothing. For the transcript to render this. */
export function threadApprovalFromMeta(meta: { approval?: unknown } | null | undefined): ThreadApproval | null {
  return isThreadApproval(meta?.approval) ? meta.approval : null;
}

function approvalFromResponse(value: unknown): ThreadApproval | null {
  if (isThreadApproval(value)) return value;
  if (value !== null && typeof value === "object" && isThreadApproval((value as { approval?: unknown }).approval)) {
    return (value as { approval: ThreadApproval }).approval;
  }
  return null;
}

/**
 * How a value is printed in a before/after row. Same rules as Top-Voice
 * `formatValue` and as server/approvals.ts `formatApprovalValue`: empty is an
 * em-dash, booleans are on/off. The two copies have to agree, because this is
 * the text someone reads before they approve.
 */
export function formatApprovalValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((entry) => formatApprovalValue(entry)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function decidedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(status: ThreadApproval["status"]): string {
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  return "Proposed change";
}

export function ApprovalCard({ approval, token: tokenProp }: ApprovalCardProps) {
  const [, params] = useRoute<{ token: string }>("/w/:token");
  const token = tokenProp ?? params?.token ?? "";

  const [current, setCurrent] = useState<ThreadApproval>(approval);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent((prev) => {
      if (prev.id !== approval.id) return approval;
      if (prev.status !== "pending" && approval.status === "pending") return prev;
      return approval;
    });
  }, [approval]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || !current.id) return;
      try {
        const next = await apiRequest<unknown>(
          "GET",
          `/api/workspaces/${encodeURIComponent(token)}/approvals/${encodeURIComponent(current.id)}`,
          undefined,
          { signal },
        );
        const approval = approvalFromResponse(next);
        if (approval) setCurrent(approval);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        // An unreachable route is a missing handoff, not a lock. The proposal
        // already on the message is still shown.
      }
    },
    [current.id, token],
  );

  useEffect(() => {
    if (current.status !== "pending" || !token) return;
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

  const onDecide = useCallback(
    async (action: "approve" | "decline") => {
      if (!token || busy || current.status !== "pending") return;
      const by = name.trim();
      if (!by) {
        setError("A name is needed so this record says who decided.");
        return;
      }
      setBusy(action);
      setError(null);
      try {
        const next = await apiRequest<unknown>(
          "POST",
          `/api/workspaces/${encodeURIComponent(token)}/approvals/${encodeURIComponent(current.id)}/${action}`,
          { by },
        );
        const decided = approvalFromResponse(next);
        if (decided) {
          setCurrent(decided);
          return;
        }
        setError("The room recorded a reply this card could not read.");
      } catch (caught) {
        const line =
          caught instanceof ApiError && caught.message.trim()
            ? caught.message.trim()
            : action === "approve"
              ? "This room could not record the approval."
              : "This room could not record the decline.";
        setError(line);
      } finally {
        setBusy(null);
      }
    },
    [busy, current.id, current.status, name, token],
  );

  const pending = current.status === "pending";
  const decidedLine =
    current.status === "approved" && current.decidedBy && current.decidedAt
      ? `Approved by ${current.decidedBy} on ${decidedOn(current.decidedAt)}. The same before and after is what this room keeps. Nothing was written to an account from this room.`
      : current.status === "approved"
        ? "Recorded as approved. Nothing was written to an account from this room."
        : current.status === "declined" && current.decidedBy && current.decidedAt
          ? `Declined by ${current.decidedBy} on ${decidedOn(current.decidedAt)}.`
          : current.status === "declined"
            ? "Recorded as declined."
            : null;

  return (
    <div className="mt-4 border-t border-border pt-4" data-testid={`card-approval-${current.id}`}>
      <p className={LABEL}>{statusLabel(current.status)}</p>

      <p className={cn(READ, "mt-2 text-foreground")} data-testid="text-approval-heading">
        {current.heading}
      </p>
      <p className={cn(CHROME, "mt-1 text-muted-foreground")} data-testid="text-approval-summary">
        {current.summary}
      </p>
      <p className={cn(META, "mt-1.5 text-muted-foreground")}>Proposed by {current.proposedBy}.</p>

      <div className="mt-3 space-y-1" data-testid="list-approval-changes">
        {current.changes.map((change, index) => (
          <p
            key={`${change.field}-${index}`}
            className={cn(META, "flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground")}
            data-testid={`text-approval-change-${index}`}
          >
            <span className="font-medium text-foreground">{change.field}</span>
            <span className="line-through">{formatApprovalValue(change.from)}</span>
            <span aria-hidden="true">→</span>
            <span className="font-medium text-foreground">{formatApprovalValue(change.to)}</span>
          </p>
        ))}
      </div>

      {pending ? (
        <>
          <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-approval-status">
            Approve records your name and the time against this change. It does not write the change to any
            account.
          </p>
          {token ? (
            <>
              <label className="mt-3 block">
                <span className={LABEL}>Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  placeholder="The name this record should carry"
                  className={cn(
                    CHROME,
                    FOCUS,
                    "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground placeholder:text-muted-foreground",
                  )}
                  data-testid="input-approval-name"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <button
                  type="button"
                  onClick={() => void onDecide("decline")}
                  disabled={busy !== null}
                  className={ACTION_QUIET}
                  data-testid="button-approval-decline"
                >
                  {busy === "decline" ? "Recording" : "Decline"}
                </button>
                <button
                  type="button"
                  onClick={() => void onDecide("approve")}
                  disabled={busy !== null}
                  className={ACTION}
                  data-testid="button-approval-approve"
                >
                  {busy === "approve" ? "Recording" : "Approve"}
                </button>
              </div>
            </>
          ) : (
            <p className={cn(META, "mt-3 text-muted-foreground")}>Open this from the room to approve or decline.</p>
          )}
        </>
      ) : (
        <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-approval-decided">
          {decidedLine}
        </p>
      )}

      {error ? (
        <p className={cn(CHROME, "mt-3 text-muted-foreground")} data-testid="text-approval-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default ApprovalCard;
