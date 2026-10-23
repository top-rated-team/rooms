import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Seat } from "@shared/api";
import { EXPERTS } from "@shared/roster";
import { OUTSIDE_AGENT_LIMITS, type MemberDetail } from "@/components/workspace/MemberRail";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, LABEL, META, READ } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * ADMITTING SOMEBODY ELSE'S AGENT
 *
 * A visitor's own ChatGPT, Claude, ClickUp, Slack or HubSpot agent can be let
 * into ONE thread. The address it is given is that thread and nothing else; it
 * is not an account. It arrives watching — read this thread, say nothing —
 * and moving it to draft or act is a second decision, not this sheet.
 *
 * The secret shown at the end is this agent's credential. The room link is a
 * handle for the room. Presenting that link as this agent will not work.
 *
 * The four sentences at the bottom are not settings. There is no screen that
 * turns them on. They are the same four the member rail prints after
 * admission, so they are legible before anyone presses Admit.
 * ------------------------------------------------------------------------- */

const DEFAULT_CALLS_PER_DAY = 20;
const DEFAULT_EXPIRES_DAYS = 7;
const MAX_CALLS_PER_DAY = 100;
const MAX_EXPIRES_DAYS = 90;

export interface AdmitThread {
  id: string;
  slug: string;
  name: string;
}

export interface AdmitParty {
  memberKey: string;
  displayName: string;
}

export interface AdmitAgentInput {
  company: string;
  displayName: string;
  channelId: string;
  boundPartyKey: string;
  callsPerDay: number;
  expiresOn: string;
}

export interface AdmitAgentIssued {
  seat: Seat;
  credential: string;
}

/** What the member rail needs from a public seat. Same numbers, no secret. */
export function detailFromSeat(seat: Seat): Pick<MemberDetail, "company" | "outside" | "revoked"> {
  return {
    company: seat.company,
    outside: {
      company: seat.company,
      mode: seat.mode,
      thread: seat.thread,
      joinedOn: seat.joinedOn,
      expiresOn: seat.expiresOn,
      callsUsed: seat.callsUsed,
      callsPerDay: seat.callsPerDay,
    },
    ...(seat.revoked ? { revoked: seat.revoked } : {}),
  };
}

export interface AdmitAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threads: AdmitThread[];
  /** Who on our side can be answerable. The roster is used when this is empty. */
  parties?: AdmitParty[];
  /** The thread currently open, pre-selected. */
  defaultChannelId?: string;
  /** Who on our side is pre-selected as the named party. */
  defaultPartyKey?: string;
  /** Resolves with the seat and the one-time credential, or an error the sheet can print. */
  onAdmit: (input: AdmitAgentInput) => Promise<AdmitAgentIssued | { error: string } | null>;
}

function localDate(daysFromToday: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return toDateInput(date);
}

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** End of the chosen local day, clamped so the server 90-day cap cannot refuse it. */
function expiryIso(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const end = new Date(year, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 0).getTime();
  const cap = Date.now() + MAX_EXPIRES_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Math.min(end, cap)).toISOString();
}

function maxExpiryDate(): string {
  const cap = Date.now() + MAX_EXPIRES_DAYS * 24 * 60 * 60 * 1000;
  const at = new Date(cap);
  const endOfThatLocalDay = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 23, 59, 59).getTime();
  if (endOfThatLocalDay > cap) at.setDate(at.getDate() - 1);
  return toDateInput(at);
}

const ROSTER_PARTIES: AdmitParty[] = EXPERTS.map((expert) => ({
  memberKey: expert.memberKey,
  displayName: expert.name,
}));

function fieldClassName(kind: "strong" | "quiet" = "strong"): string {
  return cn(
    READ,
    "mt-2 w-full border-b bg-transparent pb-2 outline-none placeholder:text-muted-foreground",
    kind === "strong" ? "border-foreground" : "border-border",
  );
}

export function AdmitAgentDialog({
  open,
  onOpenChange,
  threads,
  parties = [],
  defaultChannelId,
  defaultPartyKey,
  onAdmit,
}: AdmitAgentDialogProps) {
  const resolvedParties = parties.length > 0 ? parties : ROSTER_PARTIES;
  const firstThread = defaultChannelId && threads.some((thread) => thread.id === defaultChannelId)
    ? defaultChannelId
    : threads[0]?.id ?? "";
  const firstParty = defaultPartyKey && resolvedParties.some((party) => party.memberKey === defaultPartyKey)
    ? defaultPartyKey
    : resolvedParties[0]?.memberKey ?? "";

  const [company, setCompany] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [channelId, setChannelId] = useState(firstThread);
  const [boundPartyKey, setBoundPartyKey] = useState(firstParty);
  const [callsPerDay, setCallsPerDay] = useState(String(DEFAULT_CALLS_PER_DAY));
  const [expiresOn, setExpiresOn] = useState(localDate(DEFAULT_EXPIRES_DAYS));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [issued, setIssued] = useState<AdmitAgentIssued | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompany("");
    setDisplayName("");
    setChannelId(firstThread);
    setBoundPartyKey(firstParty);
    setCallsPerDay(String(DEFAULT_CALLS_PER_DAY));
    setExpiresOn(localDate(DEFAULT_EXPIRES_DAYS));
    setBusy(false);
    setFailed(null);
    setIssued(null);
  }, [open, firstThread, firstParty]);

  const thread = useMemo(
    () => threads.find((row) => row.id === channelId) ?? threads[0],
    [channelId, threads],
  );
  const party = useMemo(
    () => resolvedParties.find((row) => row.memberKey === boundPartyKey) ?? resolvedParties[0],
    [boundPartyKey, resolvedParties],
  );

  const latestExpiry = maxExpiryDate();
  const calls = Number.parseInt(callsPerDay, 10);
  const callsOk = Number.isInteger(calls) && calls >= 1 && calls <= MAX_CALLS_PER_DAY;
  const expiryOk = /^\d{4}-\d{2}-\d{2}$/.test(expiresOn) && expiresOn >= localDate() && expiresOn <= latestExpiry;
  const canSubmit =
    company.trim().length > 0 &&
    displayName.trim().length > 0 &&
    Boolean(thread) &&
    Boolean(party) &&
    callsOk &&
    expiryOk &&
    !busy;

  const submit = useCallback(async () => {
    if (!canSubmit || !thread || !party) return;
    setBusy(true);
    setFailed(null);
    const result = await onAdmit({
      company: company.trim(),
      displayName: displayName.trim(),
      channelId: thread.id,
      boundPartyKey: party.memberKey,
      callsPerDay: calls,
      expiresOn: expiryIso(expiresOn),
    });
    setBusy(false);
    if (result && "credential" in result) setIssued(result);
    else {
      setFailed(
        result && "error" in result
          ? result.error
          : "That admission did not come back. Send it again — a duplicate is easy to revoke, an agent that was never admitted is not.",
      );
    }
  }, [canSubmit, calls, company, displayName, expiresOn, onAdmit, party, thread]);

  const missing =
    threads.length === 0
      ? "This room has no thread to admit an agent into."
      : resolvedParties.length === 0
        ? "An admission has to be bound to a named person on our side, and this room has not named one."
        : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-dvh w-[calc(100vw-2rem)] max-w-md flex-col border-l border-border bg-background"
          data-testid="dialog-admit-agent"
        >
          <div className="flex shrink-0 items-baseline justify-between gap-4 px-6 pt-6">
            <Dialog.Title className={cn(CHROME, "font-medium")}>Add an agent</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={ACTION_QUIET}>
                Close
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={cn(META, "shrink-0 px-6 pt-2 text-muted-foreground")}>
            Somebody else&apos;s agent, into one thread, watching. The room link will not admit it.
          </Dialog.Description>

          {issued ? (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6" data-testid="state-admit-credential">
              <p className={cn(READ, "text-foreground")}>
                {issued.seat.displayName} can read #{issued.seat.thread}. It cannot post.
              </p>
              <p className={cn(READ, "mt-3 text-muted-foreground")}>
                Bound to {issued.seat.boundParty} on our side. {issued.seat.callsPerDay} calls a day. Expires{" "}
                {new Date(issued.seat.expiresOn).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.
              </p>
              <p className={cn(LABEL, "mt-6")}>Its credential</p>
              <p
                className={cn(META, "mt-2 break-all font-mono select-text text-foreground")}
                data-testid="text-admit-credential"
              >
                {issued.credential}
              </p>
              <p className={cn(META, "mt-3 text-muted-foreground")}>
                This is the only copy. It is not shown again, not written into the thread, and not the room&apos;s
                link. Anyone with the room link can open the room; only this string can act as this agent. A restart
                of this process forgets it.
              </p>
              <p className={cn(META, "mt-3 text-muted-foreground")}>
                Letting it draft or act is a second decision, not this one. This sheet only admits it watching.
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={cn(ACTION, "mt-6")}
                data-testid="button-admit-done"
              >
                Back to the room
              </button>
            </div>
          ) : missing ? (
            <div className="px-6 py-6">
              <p className={cn(READ, "text-muted-foreground")}>{missing}</p>
            </div>
          ) : (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6" data-testid="state-admit-form">
              <label htmlFor="admit-company" className={cn(LABEL, "block")}>
                Whose tool it is
              </label>
              <input
                id="admit-company"
                value={company}
                maxLength={160}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="The company that runs it, as they call themselves"
                className={fieldClassName()}
                data-testid="input-admit-company"
              />
              <p className={cn(META, "mt-2 text-muted-foreground")}>Name supplied by their tool, unchecked.</p>

              <label htmlFor="admit-name" className={cn(LABEL, "mt-8 block")}>
                What to call it here
              </label>
              <input
                id="admit-name"
                value={displayName}
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Acme Bot"
                className={fieldClassName()}
                data-testid="input-admit-name"
              />

              <label htmlFor="admit-thread" className={cn(LABEL, "mt-8 block")}>
                The one thread it may read
              </label>
              <select
                id="admit-thread"
                value={thread?.id ?? ""}
                onChange={(event) => setChannelId(event.target.value)}
                className={cn(fieldClassName(), "text-foreground")}
                data-testid="select-admit-thread"
              >
                {threads.map((row) => (
                  <option key={row.id} value={row.id} className="bg-background text-foreground">
                    #{row.slug}
                    {row.name !== row.slug ? ` — ${row.name}` : ""}
                  </option>
                ))}
              </select>

              <label htmlFor="admit-party" className={cn(LABEL, "mt-8 block")}>
                Who on our side is answerable
              </label>
              <select
                id="admit-party"
                value={party?.memberKey ?? ""}
                onChange={(event) => setBoundPartyKey(event.target.value)}
                className={cn(fieldClassName(), "text-foreground")}
                data-testid="select-admit-party"
              >
                {resolvedParties.map((row) => (
                  <option key={row.memberKey} value={row.memberKey} className="bg-background text-foreground">
                    {row.displayName}
                  </option>
                ))}
              </select>
              <p className={cn(META, "mt-2 text-muted-foreground")}>
                The credential is bound to this person. It is not bound to the room link.
              </p>

              <label htmlFor="admit-calls" className={cn(LABEL, "mt-8 block")}>
                Calls a day
              </label>
              <input
                id="admit-calls"
                type="number"
                min={1}
                max={MAX_CALLS_PER_DAY}
                value={callsPerDay}
                onChange={(event) => setCallsPerDay(event.target.value)}
                className={cn(fieldClassName("quiet"), "text-foreground")}
                data-testid="input-admit-calls"
              />
              <p className={cn(META, "mt-2 text-muted-foreground")}>
                Its own counter. The room&apos;s visitor rate limit keys on an IP address, and this agent has none.
              </p>

              <label htmlFor="admit-expires" className={cn(LABEL, "mt-8 block")}>
                Expires
              </label>
              <input
                id="admit-expires"
                type="date"
                min={localDate()}
                max={latestExpiry}
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
                className={cn(fieldClassName("quiet"), "text-foreground")}
                data-testid="input-admit-expires"
              />
              <p className={cn(META, "mt-2 text-muted-foreground")}>
                An admission that never ends is a key. It arrives watching, and it cannot post from this sheet.
              </p>

              {failed ? (
                <p className={cn(CHROME, "mt-4 text-destructive")} role="alert">
                  {failed}
                </p>
              ) : null}

              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSubmit}
                  className={ACTION}
                  data-testid="button-submit-admit"
                >
                  {busy ? "Admitting" : "Admit, watching"}
                </button>
              </div>

              <p className={cn(LABEL, "mt-10")}>What it can never do</p>
              <ul className="mt-2 space-y-1 border-l border-border pl-3" data-testid="list-admit-limits">
                {OUTSIDE_AGENT_LIMITS.map((limit) => (
                  <li key={limit} className={cn(META, "text-muted-foreground")}>
                    {limit}
                  </li>
                ))}
                <li className={cn(META, "text-muted-foreground")}>
                  These four are not settings. There is no screen that turns them on.
                </li>
              </ul>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default AdmitAgentDialog;
