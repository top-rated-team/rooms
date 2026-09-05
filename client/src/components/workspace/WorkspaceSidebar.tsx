import { useMemo, type ReactNode } from "react";
import { Bot, Hash, Plus, UserPlus, X } from "lucide-react";
import { AGENTS, EXPERTS, MAIN_SITE_URL } from "@shared/roster";
import type { Channel, Member } from "@shared/schema";
import type { ConnectionStatus } from "@/hooks/use-workspace";
import { Avatar, PresenceDot, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Live",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

const CONNECTION_TONE: Record<ConnectionStatus, string> = {
  connecting: "bg-status-away",
  open: "bg-status-online",
  reconnecting: "bg-status-away",
  closed: "bg-status-offline",
};

function GroupLabel({ children }: { children: string }) {
  return (
    <h2 className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

interface RowProps {
  active: boolean;
  unread: number;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}

function Row({ active, unread, onClick, testId, children }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "hover-elevate active-elevate-2 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-accent-border font-medium" : "text-sidebar-foreground",
        !active && unread > 0 && "font-semibold",
      )}
    >
      {children}
      {unread > 0 && !active ? (
        <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
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
    return [...rows, ...extras];
  }, [dmChannels, members]);

  return (
    <aside
      className={cn("flex w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar", className)}
      data-testid="sidebar-workspace"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", CONNECTION_TONE[connection])} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={workspaceName}>
            {workspaceName}
          </p>
          <p className="text-[11px] leading-none text-muted-foreground">{CONNECTION_LABEL[connection]}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="hover-elevate active-elevate-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent"
            data-testid="button-close-sidebar"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        ) : null}
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <GroupLabel>Channels</GroupLabel>
        {projectChannels.map((channel) => (
          <Row
            key={channel.id}
            active={channel.id === activeChannelId}
            unread={unread[channel.id] ?? 0}
            onClick={() => onSelectChannel(channel.id)}
            testId={`link-channel-${channel.slug}`}
          >
            <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{channel.name}</span>
          </Row>
        ))}
        <button
          type="button"
          onClick={onAddChannel}
          className="hover-elevate active-elevate-2 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm text-muted-foreground"
          data-testid="button-add-channel"
        >
          <Plus className="h-4 w-4 shrink-0" />
          Add channel
        </button>

        <GroupLabel>Direct messages</GroupLabel>
        {dmRows.map(({ channel, memberKey }) => {
          const member = memberByKey.get(memberKey);
          const expert = EXPERTS.find((e) => e.memberKey === memberKey);
          const name = member?.displayName ?? expert?.name ?? memberKey;
          const initials = member?.initials ?? expert?.initials ?? "??";
          return (
            <Row
              key={channel?.id ?? memberKey}
              active={channel !== null && channel.id === activeChannelId}
              unread={channel ? (unread[channel.id] ?? 0) : 0}
              onClick={() => (channel ? onSelectChannel(channel.id) : onOpenDm(memberKey))}
              testId={`link-dm-${memberKey}`}
            >
              <Avatar
                initials={initials}
                tone={toneFor(memberKey, "expert")}
                size="sm"
                presence={member?.presence ?? "offline"}
              />
              <span className="truncate">{name}</span>
            </Row>
          );
        })}
        <button
          type="button"
          onClick={onInvite}
          className="hover-elevate active-elevate-2 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm text-muted-foreground"
          data-testid="button-invite-expert"
        >
          <UserPlus className="h-4 w-4 shrink-0" />
          Invite an expert
        </button>

        <GroupLabel>AI agents</GroupLabel>
        {AGENTS.map((agent) => {
          const channel = agentChannels.find((c) => c.counterpartKey === `agent:${agent.id}`);
          return (
            <Row
              key={agent.id}
              active={channel !== undefined && channel.id === activeChannelId}
              unread={channel ? (unread[channel.id] ?? 0) : 0}
              onClick={() => (channel ? onSelectChannel(channel.id) : onOpenAgent(agent.id))}
              testId={`link-agent-${agent.id}`}
            >
              <Avatar initials={agent.initials} tone={agent.tone} size="sm" />
              <span className="truncate">{agent.name}</span>
              {channel ? null : <Bot className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </Row>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <PresenceDot presence={connection === "open" ? "online" : connection === "closed" ? "offline" : "away"} />
          <span>{CONNECTION_LABEL[connection]}</span>
          <a
            href={MAIN_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto hover:text-foreground"
            data-testid="link-main-site"
          >
            top-rated.team
          </a>
        </div>
      </div>
    </aside>
  );
}

export default WorkspaceSidebar;
