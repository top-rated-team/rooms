import { useMemo, useState, type ReactNode } from "react";
import { AGENTS, EXPERTS, MAIN_SITE_URL } from "@shared/roster";
import type { Channel, Member } from "@shared/schema";
import type { ConnectionStatus } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, CHROME, FOCUS, LABEL, LINK, META } from "@/components/workspace/room-style";
import { badgeForKey, hoverForKey } from "@/components/workspace/MemberRail";

/* ---------------------------------------------------------------------------
 * The rail of channels, on the sunk ground the front page uses for its panel
 * band. There is no border down its right edge: the change of ground is the
 * separation, which is one fewer line on screen and the same information.
 *
 * The active channel is the one row set on the paper ground — it belongs to the
 * column it opens. Nothing here is a coloured pill, and the unread count is a
 * number rather than a blue disc.
 *
 * WHAT WAS TAKEN OUT. This rail used to list all nine agents in the roster on
 * first paint, seven of which are not in the room and three of which have no
 * body of knowledge to answer from. Now it lists the agents that are actually
 * in this room, and the rest sit behind one line — the same "four questions,
 * not eight" rule the doors are written to.
 * ------------------------------------------------------------------------- */

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Live",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

function GroupLabel({ children }: { children: string }) {
  return <h2 className={cn(LABEL, "px-2 pb-1.5 pt-6 first:pt-0")}>{children}</h2>;
}

interface RowProps {
  active: boolean;
  unread: number;
  onClick: () => void;
  testId: string;
  /* What the member rail says on hover, on the row a phone user is likelier to
     reach. A native title, for the reason MemberRail gives: no state, no portal
     and no decision about touch. */
  title?: string;
  children: ReactNode;
}

function Row({ active, unread, onClick, testId, title, children }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={cn(
        CHROME,
        FOCUS,
        "hover-elevate active-elevate-2 flex w-full items-baseline gap-2 px-2 py-1.5 text-left",
        active ? "bg-background font-medium text-foreground" : "text-muted-foreground",
        !active && unread > 0 && "font-medium text-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {unread > 0 && !active ? (
        <span className={cn(META, "shrink-0 tabular-nums text-muted-foreground")}>{unread > 99 ? "99+" : unread}</span>
      ) : null}
    </button>
  );
}

export interface WorkspaceSidebarProps {
  workspaceName: string;
  channels: Channel[];
  members: Member[];
  activeChannelId: string | null;
  unread: Record<string, number>;
  connection: ConnectionStatus;
  onSelectChannel: (channelId: string) => void;
  onOpenAgent: (agentId: string) => void;
  onOpenDm: (memberKey: string) => void;
  onAddChannel: () => void;
  onInvite: () => void;
  /** Present only when the sidebar is the mobile overlay. */
  onClose?: () => void;
  className?: string;
}

export function WorkspaceSidebar({
  workspaceName,
  channels,
  members,
  activeChannelId,
  unread,
  connection,
  onSelectChannel,
  onOpenAgent,
  onOpenDm,
  onAddChannel,
  onInvite,
  onClose,
  className,
}: WorkspaceSidebarProps) {
  const [allAgents, setAllAgents] = useState(false);

  const projectChannels = useMemo(() => channels.filter((c) => c.kind === "project"), [channels]);
  const dmChannels = useMemo(() => channels.filter((c) => c.kind === "dm"), [channels]);
  const agentChannels = useMemo(() => channels.filter((c) => c.kind === "agent"), [channels]);

  const memberByKey = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of members) map.set(member.memberKey, member);
    return map;
  }, [members]);

  const dmRows = useMemo(() => {
    const rows = dmChannels.map((channel) => ({
      channel,
      memberKey: channel.counterpartKey ?? "",
    }));
    const covered = new Set(rows.map((r) => r.memberKey));
    const extras = members
      .filter((m) => m.kind === "expert" && !covered.has(m.memberKey))
      .map((m) => ({ channel: null as Channel | null, memberKey: m.memberKey }));
    /* Whoever signs the room's contract is the first name in this list. It
       holds no visitor — the extras are experts — so the owner is the top row
       rather than the second one the member rail prints. The rest keep the
       order their channels arrived in. */
    const all = [...rows, ...extras];
    const owner = (row: { memberKey: string }) => badgeForKey(row.memberKey, "expert") === "Owner";
    return [...all.filter(owner), ...all.filter((row) => !owner(row))];
  }, [dmChannels, members]);

  /* The agents in this room, and — behind one line — the rest of the roster. */
  const { here, elsewhere } = useMemo(() => {
    const inRoom = new Set<string>();
    for (const member of members) if (member.kind === "agent") inRoom.add(member.memberKey);
    for (const channel of agentChannels) if (channel.counterpartKey) inRoom.add(channel.counterpartKey);
    return {
      here: AGENTS.filter((agent) => inRoom.has(`agent:${agent.id}`)),
      elsewhere: AGENTS.filter((agent) => !inRoom.has(`agent:${agent.id}`)),
    };
  }, [agentChannels, members]);

  /*
   * SIX BY DEFAULT, on the owner's instruction. It used to show only the agents
   * already in the room — one in a general room, two in a door's — so the rest
   * of the roster existed behind a button labelled with a number, and a visitor
   * had no reason to press it.
   *
   * Six rather than all of them for the reason the seed is two: every agent
   * channel a visitor opens renders four one-click starters, and each click
   * spends one of the room's thirty turns an hour. Six names is a menu; twelve
   * is an invitation to spend the hour reading it.
   */
  const AGENTS_SHOWN = 6;
  const agentsShown = allAgents
    ? [...here, ...elsewhere]
    : [...here, ...elsewhere.slice(0, Math.max(0, AGENTS_SHOWN - here.length))];
  const hidden = allAgents ? 0 : Math.max(0, here.length + elsewhere.length - agentsShown.length);

  return (
    <aside className={cn("flex w-[15rem] shrink-0 flex-col bg-muted", className)} data-testid="sidebar-workspace">
      <div className="flex shrink-0 items-baseline gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className={cn(CHROME, "truncate font-medium")} title={workspaceName}>
            {workspaceName}
          </p>
          <p className={cn(META, "mt-0.5 text-muted-foreground")}>{CONNECTION_LABEL[connection]}</p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className={ACTION_QUIET} data-testid="button-close-sidebar">
            Close
          </button>
        ) : null}
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <GroupLabel>Channels</GroupLabel>
        {projectChannels.map((channel) => (
          <Row
            key={channel.id}
            active={channel.id === activeChannelId}
            unread={unread[channel.id] ?? 0}
            onClick={() => onSelectChannel(channel.id)}
            testId={`link-channel-${channel.slug}`}
          >
            #{channel.name}
          </Row>
        ))}
        <button type="button" onClick={onAddChannel} className={cn(ACTION_QUIET, "mx-2 mt-2")} data-testid="button-add-channel">
          Add a channel
        </button>

        <GroupLabel>Experts</GroupLabel>
        {dmRows.map(({ channel, memberKey }) => {
          const member = memberByKey.get(memberKey);
          const expert = EXPERTS.find((e) => e.memberKey === memberKey);
          const name = member?.displayName ?? expert?.name ?? memberKey;
          return (
            <Row
              key={channel?.id ?? memberKey}
              active={channel !== null && channel.id === activeChannelId}
              unread={channel ? (unread[channel.id] ?? 0) : 0}
              onClick={() => (channel ? onSelectChannel(channel.id) : onOpenDm(memberKey))}
              testId={`link-dm-${memberKey}`}
              title={hoverForKey(memberKey, "expert")}
            >
              {name}
            </Row>
          );
        })}
        <button type="button" onClick={onInvite} className={cn(ACTION_QUIET, "mx-2 mt-2")} data-testid="button-invite-expert">
          Add a person
        </button>

        <GroupLabel>Agents</GroupLabel>
        {agentsShown.map((agent) => {
          const channel = agentChannels.find((c) => c.counterpartKey === `agent:${agent.id}`);
          return (
            <Row
              key={agent.id}
              active={channel !== undefined && channel.id === activeChannelId}
              unread={channel ? (unread[channel.id] ?? 0) : 0}
              onClick={() => (channel ? onSelectChannel(channel.id) : onOpenAgent(agent.id))}
              testId={`link-agent-${agent.id}`}
            >
              {agent.name}
            </Row>
          );
        })}
        {hidden > 0 || allAgents ? (
          <button
            type="button"
            onClick={() => setAllAgents((v) => !v)}
            className={cn(ACTION_QUIET, "mx-2 mt-2")}
            aria-expanded={allAgents}
            data-testid="button-more-agents"
          >
            {allAgents ? "Fewer" : `${hidden} more`}
          </button>
        ) : null}
      </nav>

      <div className="shrink-0 px-4 py-3">
        <p className={cn(META, "flex items-baseline justify-between gap-3 text-muted-foreground")}>
          <span>{CONNECTION_LABEL[connection]}</span>
          <a href={MAIN_SITE_URL} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="link-main-site">
            top-rated.team
          </a>
        </p>
      </div>
    </aside>
  );
}

export default WorkspaceSidebar;
