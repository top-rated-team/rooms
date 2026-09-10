import { useCallback, useMemo, useState } from "react";
import { DEFAULT_DOOR_ID, DOOR_BY_ID, type DoorContract } from "@shared/doors";
import { AGENT_BY_ID, EXPERT_BY_KEY, EXPERTS, type AgentDef } from "@shared/roster";
import type { Member, MemberKind } from "@shared/schema";
import { AgentMark } from "@/components/workspace/AgentMark";
import { Avatar } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, CHROME, LABEL, META } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * THE BADGE RULE
 *
 * A badge says what someone does here and who answers for them. It never says
 * what they are made of. Six words, and a seventh needs an argument:
 *
 *   Owner         it is their room and their bill
 *   Contractor    a specialist engaged and paid by the company answerable here
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
 *
 * THE BADGE IS NO LONGER A PILL, AND THE LINE UNDER IT IS NO LONGER FURNITURE.
 *
 * The six words are unchanged and so are the six lines. A badge is a word set
 * beside the name at the metadata size instead of a bordered chip. The
 * accountability line is the part that answers "who do I complain to". When it
 * names another company, another door, or a fact a reader would not assume, it
 * stays in view at the chrome size. When it only repeats what this room already
 * says — our people, in a room we sign for — it waits behind a press, not a
 * hover: a phone has no hover, and the words have to stay in the page so they
 * can be copied.
 *
 * WHICH COMPANY A LINE MAY NAME
 *
 * Two of those lines answer "who do I complain to" with a company: a
 * contractor is paid by somebody, and an agent is run by somebody. Neither
 * company is this file's to know. The room was opened through a door, the door
 * carries the contract — `DoorDef.contract` in shared/doors.ts — and the rail
 * is handed the same one the room footer prints. A room opened through the
 * partner's door therefore reads the partner's name here, and never ours.
 *
 * Where the room has not said which door it came through, the line says that
 * it has not. It never fills the gap with the company that happens to run the
 * site, because a wrong company in an accountability line is worse than a
 * missing one: it is an answer to "who do I complain to" that sends the person
 * to a company with no part in the work.
 * ------------------------------------------------------------------------- */

export type RoomBadge = "Owner" | "Contractor" | "Client" | "Partner team" | "Guest" | "Agent";

/** The whole vocabulary, in the order it is explained to people. */
export const ROOM_BADGES: RoomBadge[] = ["Owner", "Contractor", "Client", "Partner team", "Guest", "Agent"];

/**
 * One accountability line per badge, for a room that has not said which company
 * is answerable for it. The two lines that would otherwise name a company —
 * Contractor and Agent — name none here and say so; `accountabilityFor` puts
 * the room's own company into them when the room carries one.
 */
export const BADGE_LINE: Record<RoomBadge, string> = {
  Owner: "Signs the contract.",
  Contractor: "Paid by whichever company is answerable for this room. This room has not said which.",
  Client: "Pays the invoice.",
  "Partner team": "A different company — separate contract, separate bill.",
  Guest: "Holds a link. Can read this thread and nothing else.",
  Agent: "Reads this thread, writes drafts, posts nothing anywhere.",
};

export const BADGE_RULE = "A badge says what someone does here and who answers for them. It never says what they are made of.";

/**
 * Said once, at the top of the list, because the list itself implies the
 * opposite. Four names sit in a new room before anybody has been told it
 * exists, and until this line was written the room let a visitor believe they
 * were being watched.
 */
export const WHO_IS_WATCHING =
  "Listed here because this is the work they do. Nobody is told about this room until you ask for a person.";

/**
 * The company that runs this site and the agents in the roster, read off the
 * door that pays for it rather than typed in again — the same lookup
 * client/src/pages/door.tsx makes, for the same reason. It is only ever used to
 * say whose software an agent is, including where that is not the company
 * answerable for the room it is sitting in.
 */
const OUR_LEGAL_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

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

/**
 * `company` is the legal name on the room's door contract, or null where the
 * room has not said which door it came through. Nothing in here defaults it.
 */
function accountabilityFor(
  member: Member,
  badge: RoomBadge,
  detail: MemberDetail | undefined,
  company: string | null,
): string {
  if (detail?.accountability) return detail.accountability;
  if (detail?.outside) {
    return `${possessive(detail.outside.company)}. Joined ${dayLabel(detail.outside.joinedOn)}. May read #${detail.outside.thread} and nothing else.`;
  }
  if (badge === "Partner team" && detail?.company) return `${detail.company} — separate contract, separate bill.`;
  // The visitor named themselves, so the name proves nothing and we say so.
  if (badge === "Guest" && member.kind === "visitor") return "You typed this name yourself.";
  // Who pays a contractor is the room's contract, never this file. In a room
  // opened through the partner's door, "Paid through Top-Rated Team" names a
  // company that is not in that chain at all.
  if (badge === "Contractor") return company ? `Paid through ${endSentence(company)}` : BADGE_LINE.Contractor;
  // An agent of ours stays ours whichever door the room came through, so the
  // line names the company that runs it — and, in a room somebody else is
  // answerable for, says that it is not that company.
  if (badge === "Agent") {
    if (!company) return `Run by ${endSentence(OUR_LEGAL_NAME)} ${BADGE_LINE.Agent}`;
    return company === OUR_LEGAL_NAME
      ? `Ours. ${BADGE_LINE.Agent}`
      : `Run by ${OUR_LEGAL_NAME}, not by ${endSentence(company)} ${BADGE_LINE.Agent}`;
  }
  return BADGE_LINE[badge];
}

/**
 * A legal name can end in its own full stop — "Top-Rated Team s.r.o." — and a
 * second one after it reads as a typo, which is a bad look on the line that
 * says who to complain to.
 */
function endSentence(text: string): string {
  return /\.$/.test(text) ? text : `${text}.`;
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
    /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
    if (agent && !agent.hidden) return agent.title;
  }
  return "";
}

/**
 * A line that names another company, sits on somebody else's door, or says
 * something a reader would not assume, stays in view. The ordinary case — our
 * own people, in a room we are answerable for — repeats the footer, so it
 * waits behind a press. A hover is not a way in; a phone has none.
 */
function lineStaysOpen(
  line: string,
  badge: RoomBadge,
  company: string | null,
  outside?: OutsideAgent,
): boolean {
  if (outside) return true;
  if (badge === "Partner team" || badge === "Guest") return true;
  if (company !== OUR_LEGAL_NAME) return true;
  const ordinary = new Set([
    BADGE_LINE.Owner,
    BADGE_LINE.Client,
    `Paid through ${endSentence(OUR_LEGAL_NAME)}`,
    `Ours. ${BADGE_LINE.Agent}`,
  ]);
  return !ordinary.has(line);
}

function MemberGlyph({ member, dimmed }: { member: Member; dimmed?: boolean }) {
  if (member.kind === "agent") {
    const agent: AgentDef | undefined = AGENT_BY_ID[member.memberKey.replace(/^agent:/, "")];
    return (
      <AgentMark
        mark={agent?.mark}
        initials={agent?.initials ?? member.initials}
        size="xs"
        dimmed={dimmed}
      />
    );
  }
  const expert = EXPERT_BY_KEY[member.memberKey];
  return (
    <Avatar
      initials={member.initials}
      photo={expert?.photo}
      size="xs"
      dimmed={dimmed}
    />
  );
}

function AccountabilityLine({
  line,
  staysOpen,
  memberKey,
}: {
  line: string;
  staysOpen: boolean;
  memberKey: string;
}) {
  const text = (
    <p className={cn(CHROME, "mt-1 select-text text-muted-foreground")} data-testid={`accountability-${memberKey}`}>
      {line}
    </p>
  );
  if (staysOpen) return text;
  return (
    <details className="mt-1">
      <summary
        className={cn(ACTION_QUIET, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
        data-testid={`button-accountability-${memberKey}`}
      >
        Who answers
      </summary>
      {text}
    </details>
  );
}

interface MemberRowProps {
  member: Member;
  detail?: MemberDetail;
  viewer: RailViewer;
  /** The room's company, or null where the room has not said. Never defaulted. */
  company: string | null;
  onOpenDm: (memberKey: string) => void;
  onRevoke?: (memberKey: string) => void;
}

/**
 * What a hover says about a person, and it is the roster's own words.
 *
 * The owner asked to see "a short description of their expertise" on hover.
 * ExpertDef already carries `title` and `specialties`, which is exactly that
 * and is already true — so this reads them rather than inventing a sentence.
 *
 * A native title attribute rather than a floating card: it needs no state, no
 * portal and no decision about touch, and the room's interface is the one place
 * in this project with a standing instruction not to complicate it. The same
 * text is on the person's DM, where a phone can read it.
 */
export function hoverForKey(memberKey: string, kind: MemberKind): string | undefined {
  if (kind === "agent") {
    const agent = AGENT_BY_ID[memberKey.replace(/^agent:/, "")];
    /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
    return agent && !agent.hidden ? agent.title : undefined;
  }
  const expert = EXPERT_BY_KEY[memberKey];
  if (!expert) return undefined;
  const specialties = expert.specialties?.length ? ` — ${expert.specialties.join(", ")}` : "";
  return `${expert.title}${specialties}`;
}

function hoverFor(member: Member): string | undefined {
  return hoverForKey(member.memberKey, member.kind);
}

function MemberRow({ member, detail, viewer, company, onOpenDm, onRevoke }: MemberRowProps) {
  const [limitsOpen, setLimitsOpen] = useState(false);
  const badge = badgeFor(member, detail);
  const line = accountabilityFor(member, badge, detail, company);
  const role = roleFor(member);
  const outside = detail?.outside;
  const revoked = detail?.revoked;
  const canDm = member.kind === "expert" && !revoked;
  // A guest sees names and jobs. Usage numbers belong to whoever pays for them.
  const showUsage = viewer === "owner" || viewer === "client";
  const budgetSpent = outside ? outside.callsUsed >= outside.callsPerDay : false;
  const expired = outside ? isExpired(outside) : false;
  const control = controlFor(badge, member, outside);
  const staysOpen = lineStaysOpen(line, badge, company, outside);

  return (
    <li className={cn("border-t border-border py-3", revoked && "opacity-60")} data-testid={`member-${member.memberKey}`}>
      <div className="flex items-start gap-2.5">
        <MemberGlyph member={member} dimmed={Boolean(revoked)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2" title={hoverFor(member)}>
              {canDm ? (
                <button
                  type="button"
                  onClick={() => onOpenDm(member.memberKey)}
                  className={cn(CHROME, "truncate font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline")}
                  data-testid={`button-dm-${member.memberKey}`}
                >
                  {member.displayName}
                </button>
              ) : (
                <span className={cn(CHROME, "truncate font-medium")}>{member.displayName}</span>
              )}
              <span className={LABEL} data-testid={`badge-${member.memberKey}`}>
                {badge}
              </span>
              {/* The role IN THIS ROOM — client, contractor, booster — beside the
                  name and only where the room set one. A room that has not
                  decided says nothing rather than falling back to a job title. */}
              {member.role && member.kind !== "agent" ? (
                <span className={cn(LABEL, "text-muted-foreground")} data-testid={`role-${member.memberKey}`}>
                  {member.role}
                </span>
              ) : null}
            </div>

            {viewer === "owner" && !revoked && onRevoke && control ? (
              <button
                type="button"
                onClick={() => onRevoke(member.memberKey)}
                className={cn(ACTION_QUIET, "shrink-0")}
                data-testid={`button-revoke-${member.memberKey}`}
              >
                {control}
              </button>
            ) : null}
          </div>

          <AccountabilityLine line={line} staysOpen={staysOpen} memberKey={member.memberKey} />
          {detail?.note ? <p className={cn(META, "mt-1 text-muted-foreground")}>{detail.note}</p> : null}
          {/*
            THE ROOM ROLE LEFT THIS LINE. It used to print under the name for
            every person, which meant a roster job title — "Founder & Lead
            Strategist" — sat in every room whether or not it told the reader
            anything. What is worth saying there is the role IN THIS ROOM:
            client, contractor, booster. That is `member.role`, it is set only
            where a room has decided one, and it is now a right-aligned label
            beside the name — see the header of the row above.
          */}
          {!detail?.note && role && member.kind !== "agent" && !member.role ? (
            <p className={cn(META, "mt-1 truncate text-muted-foreground")}>{role}</p>
          ) : null}

          {outside && !revoked ? (
            <div className="mt-2 space-y-1.5">
              <p className={cn(META, "text-muted-foreground")}>
                <span className="font-medium text-foreground">{OUTSIDE_MODE_LABEL[outside.mode]}.</span>{" "}
                {OUTSIDE_MODE_LINE[outside.mode]}
              </p>
              {showUsage ? (
                <p className={cn(META, budgetSpent || expired ? "text-destructive" : "text-muted-foreground")}>
                  {budgetSpent
                    ? `Budget spent — ${outside.callsPerDay} calls today. It stopped, and said so in the thread.`
                    : `${outside.callsUsed} of ${outside.callsPerDay} calls today.`}{" "}
                  {expired
                    ? `Expired ${dayLabel(outside.expiresOn)}. It has to be re-added.`
                    : `Expires ${dayLabel(outside.expiresOn)}.`}
                </p>
              ) : null}
              <p className={cn(META, "text-muted-foreground")}>Name supplied by their tool, unchecked.</p>
              <button
                type="button"
                onClick={() => setLimitsOpen((v) => !v)}
                className={ACTION_QUIET}
                aria-expanded={limitsOpen}
                data-testid={`button-limits-${member.memberKey}`}
              >
                {limitsOpen ? "Hide what it can never do" : "What it can never do"}
              </button>
              {limitsOpen ? (
                <ul className="space-y-1 border-l border-border pl-3">
                  {OUTSIDE_AGENT_LIMITS.map((limit) => (
                    <li key={limit} className={cn(META, "text-muted-foreground")}>
                      {limit}
                    </li>
                  ))}
                  <li className={cn(META, "text-muted-foreground")}>
                    These four are not settings. There is no screen that turns them on.
                  </li>
                </ul>
              ) : null}
            </div>
          ) : null}

          {revoked ? (
            <p className={cn(META, "mt-1.5 text-muted-foreground")}>
              Revoked {dayLabel(revoked.on)} by {revoked.by} — reason: {revoked.reason}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export interface MemberRailProps {
  members: Member[];
  /**
   * The room's legal identity: the door contract the room footer prints, put
   * there by the door the room was opened through. It decides which company an
   * accountability line is allowed to name. Left out — or carrying an empty
   * `legalName`, which is what an unstamped room hands down — the lines say the
   * room has not named one instead of borrowing the site's own.
   */
  contract?: DoorContract;
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
  contract,
  detail,
  viewer = "owner",
  onInvite,
  onOpenDm,
  onAddAgent,
  onRevoke,
  className,
}: MemberRailProps) {
  const detailFor = useCallback((memberKey: string) => detail?.[memberKey], [detail]);

  /* An empty name is the unstamped room, not a company called "". */
  const company = contract?.legalName?.trim() || null;

  const { people, agents } = useMemo(() => {
    const visible = members.filter((m) => m.kind !== "system");
    const byName = (a: Member, b: Member) => a.displayName.localeCompare(b.displayName);
    return {
      /*
       * The visitor stays first — the first row of this list is themselves, and
       * that rule predates the rest of it. Then the owner, pinned, on his own
       * instruction: he is in every room of ours and a client looking for
       * somebody to hold answerable should not have to read down an
       * alphabetical list for the name on the contract.
       */
      people: [
        ...visible.filter((m) => m.kind === "visitor"),
        ...visible.filter((m) => m.kind === "expert" && OWNER_KEYS.has(m.memberKey)).sort(byName),
        ...visible.filter((m) => m.kind === "expert" && !OWNER_KEYS.has(m.memberKey)).sort(byName),
      ],
      // Ours first, then agents somebody else brought, each group by name.
      /* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
      agents: visible
        .filter((m) => m.kind === "agent")
        .filter((m) => !AGENT_BY_ID[m.memberKey.replace(/^agent:/, "")]?.hidden)
        .sort((a, b) => Number(Boolean(detail?.[a.memberKey]?.outside)) - Number(Boolean(detail?.[b.memberKey]?.outside)) || byName(a, b)),
    };
  }, [members, detail]);

  const total = people.length + agents.length;

  return (
    <div className={cn("px-4 py-4", className)} data-testid="rail-members">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={LABEL}>In this room</h2>
        <span className={cn(META, "text-muted-foreground")}>{total}</span>
      </div>

      <p className={cn(META, "mt-1.5 text-muted-foreground")}>{WHO_IS_WATCHING}</p>

      {people.length > 0 ? (
        <>
          <h3 className={cn(LABEL, "mt-5")}>Experts</h3>
          <ul className="mt-1">
            {people.map((member) => (
              <MemberRow
                key={member.memberKey}
                member={member}
                detail={detailFor(member.memberKey)}
                viewer={viewer}
                company={company}
                onOpenDm={onOpenDm}
                onRevoke={onRevoke}
              />
            ))}
          </ul>
        </>
      ) : null}

      {agents.length > 0 ? (
        <>
          <h3 className={cn(LABEL, "mt-5")}>Agents</h3>
          <ul className="mt-1">
            {agents.map((member) => (
              <MemberRow
                key={member.memberKey}
                member={member}
                detail={detailFor(member.memberKey)}
                viewer={viewer}
                company={company}
                onOpenDm={onOpenDm}
                onRevoke={onRevoke}
              />
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <button type="button" onClick={onInvite} className={ACTION_QUIET} data-testid="button-rail-invite">
          Add a person
        </button>
        {onAddAgent ? (
          <button type="button" onClick={onAddAgent} className={ACTION_QUIET} data-testid="button-rail-add-agent">
            Add an agent
          </button>
        ) : null}
      </div>

      {/* Printed where anybody can hold us to it. */}
      <p className={cn(META, "mt-4 border-t border-border pt-3 text-muted-foreground")}>{BADGE_RULE}</p>
    </div>
  );
}

export default MemberRail;
