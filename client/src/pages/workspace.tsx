import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Calendar, LoaderCircle, Moon, Sun } from "lucide-react";
import { AGENT_BY_ID, BOOK_A_CALL_URL, EXPERTS, MAIN_SITE_URL, type AgentDef, type ExpertDef } from "@shared/roster";
import type { Channel, TaskStatus } from "@shared/schema";
import { listStoredWorkspaces, useWorkspace } from "@/hooks/use-workspace";
import { ChannelHeader, type MobileView } from "@/components/workspace/ChannelHeader";
import { Composer } from "@/components/workspace/Composer";
import { InviteExpertDialog } from "@/components/workspace/InviteExpertDialog";
import { MemberRail } from "@/components/workspace/MemberRail";
import { MessageList } from "@/components/workspace/MessageList";
import { NewChannelDialog } from "@/components/workspace/NewChannelDialog";
import { ShareLinkBar } from "@/components/workspace/ShareLinkBar";
import { TaskPanel } from "@/components/workspace/TaskPanel";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-transparent h-9 w-9";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2";

function ThemeToggle() {
  const [dark, setDark] = useState<boolean>(() => document.documentElement.classList.contains("dark"));

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      window.localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Theme preference is a nicety; the class on <html> is what matters now.
    }
  }, []);

  return (
    <button type="button" onClick={toggle} className={ICON_BUTTON} data-testid="button-theme-toggle">
      {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

function TopBar({ workspaceName }: { workspaceName: string | null }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
      <a href={MAIN_SITE_URL} className="flex items-center gap-2" data-testid="link-logo">
        <img src="/assets/top-rated-logo.png" alt="Top-Rated Team" className="h-6 w-6" />
        <span className="hidden text-sm font-semibold sm:inline">Top-Rated Team</span>
      </a>
      {workspaceName ? (
        <>
          <span className="h-4 w-px bg-border" />
          <span className="min-w-0 truncate text-sm text-muted-foreground" data-testid="text-workspace-name">
            {workspaceName}
          </span>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <a href={BOOK_A_CALL_URL} target="_blank" rel="noopener noreferrer" className="hidden sm:block">
          <button type="button" className={PRIMARY_BUTTON} data-testid="button-book-call">
            <Calendar />
            Book A Call
          </button>
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}

function Shell({ workspaceName, children }: { workspaceName: string | null; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar workspaceName={workspaceName} />
      {children}
    </div>
  );
}

export default function WorkspacePage() {
  const [, params] = useRoute<{ token: string }>("/w/:token");
  const [, navigate] = useLocation();
  const token = params?.token ?? "";

  const {
    state,
    status,
    connection,
    error,
    typing,
    kb,
    sending,
    sendMessage,
    createChannel,
    createTask,
    updateTask,
    inviteExpert,
    notifyTyping,
  } = useWorkspace(token);

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [mobileView, setMobileView] = useState<MobileView>("chat");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const messageCountsRef = useRef<Record<string, number> | null>(null);

  /* Workspace URLs are bearer credentials: they must never be indexed. */
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = state ? `${state.workspace.name} — Top-Rated Team` : "Workspace — Top-Rated Team";
    return () => {
      document.title = previous;
    };
  }, [state]);

  const messages = useMemo(() => state?.messages ?? [], [state]);
  const channels = useMemo(() => state?.channels ?? [], [state]);
  const members = useMemo(() => state?.members ?? [], [state]);
  const tasks = useMemo(() => state?.tasks ?? [], [state]);

  const activeChannel: Channel | null = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [activeChannelId, channels],
  );

  // Land on the channel the workspace exists for, and never on a stale id.
  useEffect(() => {
    if (channels.length === 0) return;
    if (channels.some((c) => c.id === activeChannelId)) return;
    // Prefer wherever the conversation actually is: a visitor who asked a question
    // on the landing page must land on the answer, not on an empty default channel.
    const lastVisitor = [...messages].reverse().find((m) => m.authorKind === "visitor");
    const target =
      channels.find((c) => c.id === lastVisitor?.channelId) ??
      channels.find((c) => c.kind === "project") ??
      channels[0];
    setActiveChannelId(target.id);
  }, [activeChannelId, channels, messages]);

  // Unread is client-side: the server has no read receipts, and a bold channel
  // name is worth more than a round trip.
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const message of messages) counts[message.channelId] = (counts[message.channelId] ?? 0) + 1;
    const previous = messageCountsRef.current;
    messageCountsRef.current = counts;
    if (!previous) return;
    setUnread((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [channelId, count] of Object.entries(counts)) {
        if (channelId === activeChannelId) continue;
        const delta = count - (previous[channelId] ?? 0);
        if (delta > 0) {
          next[channelId] = (next[channelId] ?? 0) + delta;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeChannelId, messages]);

  useEffect(() => {
    if (!activeChannelId) return;
    setUnread((prev) => (prev[activeChannelId] ? { ...prev, [activeChannelId]: 0 } : prev));
  }, [activeChannelId, messages]);

  const channelMessages = useMemo(
    () => messages.filter((m) => m.channelId === activeChannelId),
    [activeChannelId, messages],
  );

  const selectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    setSidebarOpen(false);
    setMobileView("chat");
  }, []);

  const openAgent = useCallback(
    async (agentId: string) => {
      const agent: AgentDef | undefined = AGENT_BY_ID[agentId];
      if (!agent) return;
      const counterpartKey = `agent:${agent.id}`;
      const existing = channels.find((c) => c.kind === "agent" && c.counterpartKey === counterpartKey);
      if (existing) {
        selectChannel(existing.id);
        return;
      }
      const created = await createChannel({
        name: agent.handle,
        purpose: agent.title,
        kind: "agent",
        counterpartKey,
      });
      if (created) selectChannel(created.id);
    },
    [channels, createChannel, selectChannel],
  );

  const openDm = useCallback(
    async (memberKey: string) => {
      const existing = channels.find((c) => c.kind === "dm" && c.counterpartKey === memberKey);
      if (existing) {
        selectChannel(existing.id);
        return;
      }
      const expert: ExpertDef | undefined = EXPERTS.find((e) => e.memberKey === memberKey);
      const member = members.find((m) => m.memberKey === memberKey);
      const label = expert?.name ?? member?.displayName ?? memberKey;
      const created = await createChannel({
        name: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        purpose: `Direct messages with ${label}`,
        kind: "dm",
        counterpartKey: memberKey,
      });
      if (created) selectChannel(created.id);
    },
    [channels, createChannel, members, selectChannel],
  );

  const onSend = useCallback(
    (body: string, mentions: string[]) => {
      if (!activeChannelId) return;
      void sendMessage({ channelId: activeChannelId, body, mentions });
    },
    [activeChannelId, sendMessage],
  );

  const onStarter = useCallback(
    (question: string, agentId: string) => {
      if (!activeChannelId) return;
      // Inside an agent channel the counterpart is implicit; elsewhere it is summoned.
      const mentions = activeChannel?.kind === "agent" ? [] : [`agent:${agentId}`];
      void sendMessage({ channelId: activeChannelId, body: question, mentions });
    },
    [activeChannel, activeChannelId, sendMessage],
  );

  const onCreateTask = useCallback(
    (title: string) => {
      void createTask({ title });
    },
    [createTask],
  );

  const onUpdateTask = useCallback(
    (id: string, patch: { status?: TaskStatus }) => {
      void updateTask(id, patch);
    },
    [updateTask],
  );

  const onInvite = useCallback(
    async (input: { memberKey: string; note?: string; email?: string; name?: string }) => {
      const member = await inviteExpert(input);
      return member !== null;
    },
    [inviteExpert],
  );

  const onCreateChannel = useCallback(
    async (input: { name: string; purpose?: string }) => {
      const channel = await createChannel({ ...input, kind: "project" });
      if (channel) selectChannel(channel.id);
      return channel !== null;
    },
    [createChannel, selectChannel],
  );

  const onTyping = useCallback(() => {
    if (activeChannelId) notifyTyping(activeChannelId);
  }, [activeChannelId, notifyTyping]);

  /* ------------------------------ non-ready states ------------------------- */

  if (status === "loading") {
    return (
      <Shell workspaceName={null}>
        <div className="flex flex-1 items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Opening your workspace…
          </p>
        </div>
      </Shell>
    );
  }

  if (status === "not-found") {
    const stored = listStoredWorkspaces().filter((w) => w.token !== token);
    return (
      <Shell workspaceName={null}>
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <h1 className="text-xl font-semibold">This workspace link isn&apos;t valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The link is the whole credential, so a typo or an expired copy leaves nothing to open. Starting a new
              workspace takes one message.
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className={cn(PRIMARY_BUTTON, "mt-5")}
              data-testid="button-start-workspace"
            >
              <ArrowLeft />
              Start a new workspace
            </button>

            {stored.length > 0 ? (
              <div className="mt-8 text-left">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Workspaces on this device
                </h2>
                <ul className="mt-2 space-y-1">
                  {stored.map((workspace) => (
                    <li key={workspace.token}>
                      <button
                        type="button"
                        onClick={() => navigate(`/w/${workspace.token}`)}
                        className="hover-elevate active-elevate-2 flex w-full items-center justify-between gap-3 rounded-md border border-card-border bg-card px-3 py-2 text-left text-sm"
                      >
                        <span className="truncate">{workspace.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(workspace.lastSeen).toLocaleDateString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </Shell>
    );
  }

  if (status === "error" || !state) {
    return (
      <Shell workspaceName={null}>
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <h1 className="text-xl font-semibold">The workspace did not load</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error ?? "Something went wrong on the way here."}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={cn(PRIMARY_BUTTON, "mt-5")}
              data-testid="button-retry"
            >
              Try again
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  /* --------------------------------- ready --------------------------------- */

  const shareUrl = `${window.location.origin}/w/${state.workspace.token}`;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  const sidebar = (onClose?: () => void) => (
    <WorkspaceSidebar
      workspaceName={state.workspace.name}
      channels={channels}
      members={members}
      activeChannelId={activeChannelId}
      unread={unread}
      connection={connection}
      onSelectChannel={selectChannel}
      onOpenAgent={(agentId) => void openAgent(agentId)}
      onOpenDm={(memberKey) => void openDm(memberKey)}
      onAddChannel={() => {
        setChannelDialogOpen(true);
        setSidebarOpen(false);
      }}
      onInvite={() => {
        setInviteOpen(true);
        setSidebarOpen(false);
      }}
      onClose={onClose}
      className={onClose ? "h-full" : "hidden lg:flex"}
    />
  );

  return (
    <Shell workspaceName={state.workspace.name}>
      <div className="flex min-h-0 flex-1">
        {sidebar()}

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Channels">
            <div className="relative z-10 h-full shadow-xl">{sidebar(() => setSidebarOpen(false))}</div>
            <button
              type="button"
              aria-label="Close channels"
              onClick={() => setSidebarOpen(false)}
              className="h-full flex-1 bg-background/70 backdrop-blur-sm"
            />
          </div>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ShareLinkBar
            url={shareUrl}
            workspaceId={state.workspace.id}
            defaultEmail={state.workspace.visitorEmail}
          />
          <ChannelHeader
            channel={activeChannel}
            memberCount={members.length}
            doneCount={doneCount}
            taskCount={tasks.length}
            railOpen={railOpen}
            mobileView={mobileView}
            onMobileView={setMobileView}
            onToggleSidebar={() => setSidebarOpen(true)}
            onToggleRail={() => setRailOpen((v) => !v)}
          />

          <div className="flex min-h-0 flex-1">
            <section
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col lg:flex",
                mobileView === "chat" ? "flex" : "hidden",
              )}
            >
              <MessageList
                channel={activeChannel}
                messages={channelMessages}
                members={members}
                typing={typing}
                llmReady={kb ? kb.llmReady : null}
                onStarter={onStarter}
              />
              <Composer
                channel={activeChannel}
                members={members}
                connection={connection}
                sending={sending}
                onSend={onSend}
                onTyping={onTyping}
                onCreateTask={onCreateTask}
                onInvite={() => setInviteOpen(true)}
              />
            </section>

            <aside
              className={cn(
                "min-h-0 w-full shrink-0 flex-col border-border bg-background lg:w-[320px] lg:border-l xl:flex",
                mobileView === "tasks" ? "flex" : "hidden",
                railOpen ? "lg:flex" : "lg:hidden",
              )}
              data-testid="rail-right"
            >
              <MemberRail
                members={members}
                onInvite={() => setInviteOpen(true)}
                onOpenDm={(memberKey) => void openDm(memberKey)}
                className="scrollbar-thin max-h-[38vh] overflow-y-auto border-b border-card-border"
              />
              <TaskPanel
                tasks={tasks}
                members={members}
                onCreate={onCreateTask}
                onUpdate={onUpdateTask}
                className="flex-1"
              />
            </aside>
          </div>
        </main>
      </div>

      <InviteExpertDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={onInvite}
        defaultEmail={state.workspace.visitorEmail}
        defaultName={state.workspace.visitorName}
      />
      <NewChannelDialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen} onCreate={onCreateChannel} />
    </Shell>
  );
}
