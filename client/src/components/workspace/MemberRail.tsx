import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, UserPlus } from "lucide-react";
import { AGENT_BY_ID, EXPERTS, type AgentDef } from "@shared/roster";
import type { Member, MemberKind } from "@shared/schema";
import { Avatar, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * THE BADGE RULE
 *
 * A badge says what someone does here and who answers for them. It never says
 * what they are made of. Six words, and a seventh needs an argument:
 *
 *   Owner         it is their room and their bill
 *   Contractor    a specialist we engage and invoice for
 *   Client        someone on the buying side of this work
 *   Partner team  a person from another company — the company is named
 *   Guest         holds a link, limited, revocable
 *   Agent         software that takes turns here — whose it is, is named
 *
 * "AI", "Bot", "Human", "Verified", "Pro" and "Premium" are never used. A badge
 * that says what someone is made of answers a question nobody asked, and it
 * turns this column into a ladder where "AI" quietly means cheap. The two
 * questions people do ask are "can this one do the thing" and "who do I
 * complain to", and only a job answers those.
 * ------------------------------------------------------------------------- */

export type RoomBadge = "Owner" | "Contractor" | "Client" | "Partner team" | "Guest" | "Agent";

/** The whole vocabulary, in the order it is explained to people. */
export const ROOM_BADGES: RoomBadge[] = ["Owner", "Contractor", "Client", "Partner team", "Guest", "Agent"];

/** One accountability line per badge — who answers for this row. */
export const BADGE_LINE: Record<RoomBadge, string> = {
  Owner: "Signs the contract.",
  Contractor: "Paid through Top-Rated Team.",
  Client: "Pays the invoice.",
  "Partner team": "A different company — separate contract, separate bill.",
  Guest: "Holds a link. Can read this thread and nothing else.",
  Agent: "Ours. Reads this thread, writes drafts, posts nothing anywhere.",
};

export const BADGE_RULE = "A badge says what someone does here and who answers for them. It never says what they are made of.";

/* ---------------------------------------------------------------------------
 * ADMITTING SOMEBODY ELSE'S AGENT — the design this rail renders the state of.
 *
 * A visitor's own ChatGPT, Claude, ClickUp, Slack or HubSpot agent can be let
 * into ONE thread. The address it is given is that thread and nothing else; it
 * is not an account. It arrives in `watch` mode — read this thread, say nothing
 * — and moving it to `suggest` (drafts a person approves) or `act` (a short
 * list, inside a budget) is a deliberate second decision, never the default.
 *
 * Every admission carries four numbers a person can check without asking us:
 * whose it is, when it joined, when it expires, and how much of its call budget
 * is spent. Every turn it takes is a message in the thread with its handle and
 * the time on it, so there is no place an agent can act quietly. Revoke is
 * visible on the row, and revoking writes a line in the thread with a reason,
 * because a timestamp alone cannot tell you whether something was tidied up or
 * caught.
 *
 * The four sentences below are not settings. There is no screen that turns them
 * on. They are rendered on the row so the limits are legible after admission,
 * the same way the add-agent sheet makes them legible before it.
 *
 * This component renders that state. It does not build the connection: the
 * address, the budget accounting and the expiry sweep are server work.
 * ------------------------------------------------------------------------- */

export const OUTSIDE_AGENT_LIMITS: string[] = [
  "It cannot see another room, or anything in this room outside this thread.",
  "It cannot post, message or email as a person unless that person approved it.",
  "It cannot see a connected account's password, cookie or token.",
  "It cannot invite anybody, or make another key.",
];

const OUTSIDE_MODE_LABEL: Record<OutsideAgent["mode"], string> = {
  watch: "Watching",
  suggest: "Suggesting",
  act: "Acting",
};

const OUTSIDE_MODE_LINE: Record<OutsideAgent["mode"], string> = {
  watch: "Reads this one thread. Says nothing.",
  suggest: "Reads, and posts drafts a person has to approve.",
  act: "Reads, and does a short list inside a budget. Every action is written into the thread.",
};

export interface OutsideAgent {
  /** Whose tool it is, in their own words — supplied by that tool, unchecked. */
  company: string;
  /** Watch is the default: read one thread, say nothing. */
  mode: "watch" | "suggest" | "act";
  /** The single thread it was admitted to. */
  thread: string;
  /** ISO dates. Expiry is not optional: an admission that never ends is a key. */
  joinedOn: string;
  expiresOn: string;
  callsUsed: number;
  callsPerDay: number;
}

/** Kept with the row, because a date alone cannot say why access ended. */
export interface Revocation {
  on: string;
  by: string;
  reason: string;
}

/**
 * What the room knows about a member beyond its row in the members table.
 * Everything here is optional: with none of it the rail still renders a badge
 * and an accountability line for every member it is given.
 */
export interface MemberDetail {
  badge?: RoomBadge;
  /** Overrides the default line under the badge. */
  accountability?: string;
  /** Named for a Partner team row, and for an agent that is not ours. */
  company?: string;
  /** A second line: availability, what they cover, what they may approve. */
  note?: string;
  outside?: OutsideAgent;
  revoked?: Revocation;
}

/** Who is looking. It decides which controls and which numbers a row carries. */
export type RailViewer = "owner" | "client" | "guest";

/**
 * Until a member carries its own badge from the server, the badge comes off the
 * roster row, which now says it outright — `ExpertDef.badge` in shared/roster.ts.
 * Who signs the contract is not something to guess from a job title.
 */
const OWNER_KEYS = new Set(EXPERTS.filter((e) => e.badge === "Owner").map((e) => e.memberKey));

export function badgeForKey(memberKey: string, kind: MemberKind): RoomBadge {
  if (kind === "agent") return "Agent";
  if (kind === "visitor") return "Guest";
  if (OWNER_KEYS.has(memberKey)) return "Owner";
  return "Contractor";
}

export function badgeFor(member: Member, detail?: MemberDetail): RoomBadge {
  return detail?.badge ?? badgeForKey(member.memberKey, member.kind);
}

function accountabilityFor(member: Member, badge: RoomBadge, detail?: MemberDetail): string {
  if (detail?.accountability) return detail.accountability;
  if (detail?.outside) {
    return `${possessive(detail.outside.company)}. Joined ${dayLabel(detail.outside.joinedOn)}. May read #${detail.outside.thread} and nothing else.`;
  }
  if (badge === "Partner team" && detail?.company) return `${detail.company} — separate contract, separate bill.`;
  // The visitor named themselves, so the name proves nothing and we say so.
  if (badge === "Guest" && member.kind === "visitor") return "You typed this name yourself.";
  return BADGE_LINE[badge];
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function dayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function isExpired(outside: OutsideAgent): boolean {
  const at = new Date(outside.expiresOn).getTime();
  return !Number.isNaN(at) && at < Date.now();
}

/**
 * One control per row, or none. Revoke is for access somebody granted and can
 * take back; a contractor's engagement ends in a contract, not in a rail, and
 * the owner's row has no control at all.
 */
function controlFor(badge: RoomBadge, member: Member, outside?: OutsideAgent): string | null {
  if (member.kind === "visitor") return null;
  if (badge === "Owner" || badge === "Contractor") return null;
  if (badge === "Agent") return outside ? "Revoke" : "Remove";
  return "Revoke";
}

function roleFor(member: Member): string {
  if (member.role) return member.role;
  if (member.kind === "agent") {
    const agent: AgentDef | undefined = AGENT_BY_ID[member.memberKey.replace(/^agent:/, "")];
    if (agent) return agent.title;
  }
  return "";
}

const CONTROL_BUTTON =
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-[11px] font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover-elevate active-elevate-2 border border-transparent min-h-6 px-1.5";

const RAIL_BUTTON =
  "inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-secondary text-secondary-foreground border border-secondary-border min-h-8 px-3";

interface MemberRowProps {
  member: Member;
  detail?: MemberDetail;
  viewer: RailViewer;
  onOpenDm: (memberKey: string) => void;
  onRevoke?: (memberKey: string) => void;
}

function MemberRow({ member, detail, viewer, onOpenDm, onRevoke }: MemberRowProps) {
  const [limitsOpen, setLimitsOpen] = useState(false);
  const badge = badgeFor(member, detail);
  const line = accountabilityFor(member, badge, detail);
  const role = roleFor(member);
  const outside = detail?.outside;
  const revoked = detail?.revoked;
  const canDm = member.kind === "expert" && !revoked;
  // A guest sees names and jobs. Usage numbers belong to whoever pays for them.
  const showUsage = viewer === "owner" || viewer === "client";
  const budgetSpent = outside ? outside.callsUsed >= outside.callsPerDay : false;
  const expired = outside ? isExpired(outside) : false;
  const control = controlFor(badge, member, outside);
  const Chevron = limitsOpen ? ChevronDown : ChevronRight;

  return (
    <li
      className={cn("rounded-md px-1.5 py-1", revoked && "opacity-60")}
      data-testid={`member-${member.memberKey}`}
    >
      <div className="flex items-start gap-2">
        <Avatar
          initials={member.initials}
          tone={toneFor(member.memberKey, member.kind)}
          size="sm"
          presence={member.kind === "agent" || revoked ? null : member.presence}
          dimmed={Boolean(revoked)}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            {canDm ? (
              <button
                type="button"
                onClick={() => onOpenDm(member.memberKey)}
                className="truncate rounded text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid={`button-dm-${member.memberKey}`}
              >
                {member.displayName}
              </button>
            ) : (
              <span className="truncate text-xs font-medium">{member.displayName}</span>
            )}
            <span
              className="shrink-0 rounded border border-card-border bg-muted px-1 text-[10px] font-medium leading-4 text-muted-foreground"
              data-testid={`badge-${member.memberKey}`}
            >
              {badge}
            </span>
          </div>

          <p className="text-[11px] leading-4 text-muted-foreground">{line}</p>
          {detail?.note ? <p className="text-[11px] leading-4 text-muted-foreground">{detail.note}</p> : null}
          {!detail?.note && role && member.kind !== "agent" ? (
            <p className="truncate text-[11px] leading-4 text-muted-foreground">{role}</p>
          ) : null}

          {outside && !revoked ? (
            <div className="mt-1 space-y-1">
              <p className="text-[11px] leading-4 text-muted-foreground">
                <span className="font-medium text-foreground">{OUTSIDE_MODE_LABEL[outside.mode]}.</span>{" "}
                {OUTSIDE_MODE_LINE[outside.mode]}
              </p>
              {showUsage ? (
                <p
                  className={cn("text-[11px] leading-4", budgetSpent || expired ? "text-destructive" : "text-muted-foreground")}
                >
                  {budgetSpent
                    ? `Budget spent — ${outside.callsPerDay} calls today. It stopped, and said so in the thread.`
                    : `${outside.callsUsed} of ${outside.callsPerDay} calls today.`}{" "}
                  {expired
                    ? `Expired ${dayLabel(outside.expiresOn)}. It has to be re-added.`
                    : `Expires ${dayLabel(outside.expiresOn)}.`}
                </p>
              ) : null}
              <p className="text-[11px] leading-4 text-muted-foreground">Name supplied by their tool, unchecked.</p>
              <button
                type="button"
                onClick={() => setLimitsOpen((v) => !v)}
                className="-ml-1 inline-flex items-center gap-0.5 rounded px-1 text-[11px] text-muted-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-expanded={limitsOpen}
                data-testid={`button-limits-${member.memberKey}`}
              >
                <Chevron className="h-3 w-3" />
                What it can never do
              </button>
              {limitsOpen ? (
                <ul className="space-y-0.5 border-l border-card-border pl-2">
                  {OUTSIDE_AGENT_LIMITS.map((limit) => (
                    <li key={limit} className="text-[11px] leading-4 text-muted-foreground">
                      {limit}
                    </li>
                  ))}
                  <li className="pt-0.5 text-[11px] leading-4 text-muted-foreground">
                    These four are not settings. There is no screen that turns them on.
                  </li>
                </ul>
              ) : null}
            </div>
          ) : null}

          {revoked ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Revoked {dayLabel(revoked.on)} by {revoked.by} — reason: {revoked.reason}
            </p>
          ) : null}
        </div>

        {viewer === "owner" && !revoked && onRevoke && control ? (
          <button
            type="button"
            onClick={() => onRevoke(member.memberKey)}
            className={cn(CONTROL_BUTTON, "shrink-0 text-muted-foreground")}
            data-testid={`button-revoke-${member.memberKey}`}
          >
            {control}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export interface MemberRailProps {
  members: Member[];
  /** Keyed by memberKey. Anything the members table does not carry yet. */
  detail?: Record<string, MemberDetail>;
  /** Default "owner": today the person holding the link owns the room. */
  viewer?: RailViewer;
  onInvite: () => void;
  onOpenDm: (memberKey: string) => void;
  /** Opens the sheet that admits somebody else's agent. Hidden when absent. */
  onAddAgent?: () => void;
  /** Revoking writes a dated line with a reason into the thread. */
  onRevoke?: (memberKey: string) => void;
  className?: string;
}

export function MemberRail({
  members,
  detail,
  viewer = "owner",
  onInvite,
  onOpenDm,
  onAddAgent,
  onRevoke,
  className,
}: MemberRailProps) {
  const detailFor = useCallback((memberKey: string) => detail?.[memberKey], [detail]);

  const { people, agents } = useMemo(() => {
    const visible = members.filter((m) => m.kind !== "system");
    const byName = (a: Member, b: Member) => a.displayName.localeCompare(b.displayName);
    return {
      // The visitor stays at the top: the first row of the list is themselves.
      people: [
        ...visible.filter((m) => m.kind === "visitor"),
        ...visible.filter((m) => m.kind === "expert").sort(byName),
      ],
      // Ours first, then agents somebody else brought, each group by name.
      agents: visible
        .filter((m) => m.kind === "agent")
        .sort((a, b) => Number(Boolean(detail?.[a.memberKey]?.outside)) - Number(Boolean(detail?.[b.memberKey]?.outside)) || byName(a, b)),
    };
  }, [members, detail]);

  const total = people.length + agents.length;

  return (
    <div className={cn("shrink-0 px-3 py-3", className)} data-testid="rail-members">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">In this room</h2>
        <span className="text-xs text-muted-foreground">{total}</span>
      </div>

      {people.length > 0 ? (
        <>
          <h3 className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">People</h3>
          <ul className="mt-1 space-y-1.5">
            {people.map((member) => (
              <MemberRow
                key={member.memberKey}
                member={member}
                detail={detailFor(member.memberKey)}
                viewer={viewer}
                onOpenDm={onOpenDm}
                onRevoke={onRevoke}
              />
            ))}
          </ul>
        </>
      ) : null}

      {agents.length > 0 ? (
        <>
          <h3 className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Agents</h3>
          <ul className="mt-1 space-y-1.5">
            {agents.map((member) => (
              <MemberRow
                key={member.memberKey}
                member={member}
                detail={detailFor(member.memberKey)}
                viewer={viewer}
                onOpenDm={onOpenDm}
                onRevoke={onRevoke}
              />
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-3 space-y-2">
        <button type="button" onClick={onInvite} className={RAIL_BUTTON} data-testid="button-rail-invite">
          <UserPlus />
          Add a person
        </button>
        {onAddAgent ? (
          <button type="button" onClick={onAddAgent} className={RAIL_BUTTON} data-testid="button-rail-add-agent">
            <Plus />
            Add an agent
          </button>
        ) : null}
      </div>

      {/* Printed where anybody can hold us to it. */}
      <p className="mt-3 border-t border-card-border pt-2 text-[11px] leading-4 text-muted-foreground">{BADGE_RULE}</p>
    </div>
  );
}

export default MemberRail;
