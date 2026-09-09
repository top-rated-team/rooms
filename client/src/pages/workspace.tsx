import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import { AGENT_BY_ID, BOOK_A_CALL_URL, EXPERTS, MAIN_SITE_URL, type AgentDef, type ExpertDef } from "@shared/roster";
import { useBooking } from "@/hooks/use-booking";
import { DEFAULT_DOOR_ID, DOOR_BY_ID, type DoorContract, type DoorDef } from "@shared/doors";
import type { Channel, Message, TaskStatus } from "@shared/schema";
import { useTheme } from "@/hooks/use-theme";
import { forgetWorkspace, listStoredWorkspaces, useWorkspace } from "@/hooks/use-workspace";
import { AccountsPanel } from "@/components/workspace/AccountsPanel";
import { AdGrantPanel, AD_GRANT_SETUP, type SetupLine } from "@/components/workspace/AdGrantPanel";
import { roomNowLine } from "@shared/room-now";
import { ChannelHeader, type MobileView } from "@/components/workspace/ChannelHeader";
import { Composer } from "@/components/workspace/Composer";
import { IdentifyStrip } from "@/components/workspace/IdentifyStrip";
import { InviteExpertDialog, type HireOffer } from "@/components/workspace/InviteExpertDialog";
import { MemberRail } from "@/components/workspace/MemberRail";
import { MessageList } from "@/components/workspace/MessageList";
import { NewChannelDialog } from "@/components/workspace/NewChannelDialog";
import { RoomArrival } from "@/components/workspace/RoomArrival";
import { RoomFooter } from "@/components/workspace/RoomFooter";
import { ShareLinkBar } from "@/components/workspace/ShareLinkBar";
import { TaskPanel } from "@/components/workspace/TaskPanel";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { ACTION, ACTION_QUIET, CHROME, LABEL, META, READ } from "@/components/workspace/room-style";
import { cn } from "@/lib/utils";

/** How much of an agent's answer goes into a brief before it stops being read. */
const BRIEF_LIMIT = 400;

/* ---------------------------------------------------------------------------
 * WHICH COMPANY THIS ROOM BELONGS TO
 *
 * The door the room was opened through stamped its id into `source.door`, and
 * that stamp is the only thing that says whose legal name, terms, invoice line
 * and contact this room prints. A room can be missing it: it was created before
 * the stamp existed, or it carries a door id no row answers to any more.
 *
 * It used to fall back to the door that pays for the site, which made every
 * such room look like ours — including a room opened through the partner's
 * door, which would then have shown a stranger our name, our terms and our
 * invoice line for work we are not in and take no share of. A wrong company
 * name is worse than no company name, because it is not read as a gap to be
 * chased: it is read, believed, and acted on.
 *
 * So an unstamped room now says it is incomplete. It hands the footer a
 * contract with no name in it, and RoomFooter already has the right words for
 * that case — "This room is not saying which company is answerable for it. That
 * is a fault in the room. Until it is fixed, nothing here is an offer." The
 * same empty contract reaches the member rail, where the lines that would name
 * a company say the room has not named one. Nothing here invents a seller, and
 * the room is visibly broken rather than quietly wrong.
 *
 * server/notify.ts resolves the same stamp the same way — `doorId ?
 * DOOR_BY_ID[doorId] : undefined`, and a null legal name where there is none —
 * so a lead written on disk and a room on screen now agree about which rooms
 * have a company behind them.
 *
 * ANYTHING THAT OPENS A NEW WAY INTO THE ROOM HAS TO STAMP THIS. A room created
 * without `source.door` renders the fault footer, correctly and loudly, which
 * is the right behaviour and a bad first impression. See the handoff.
 * ------------------------------------------------------------------------- */
const UNSTAMPED_ROOM: DoorContract = {
  legalName: "",
  entity: "",
  termsUrl: null,
  invoiceLine: "",
  contact: null,
};

/** The company that runs this site, read off its own door rather than typed again. */
const OUR_LEGAL_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

/**
 * THE SAME COMPANY, IN CHROME.
 *
 * "Top-Rated Team (Danylo Burykin SZČO)" is the name a person needs when they
 * are deciding who they are dealing with: the room footer, the invoice line,
 * the line under a badge that answers "who do I complain to". It is not the
 * name a window frame needs, and this room put it in one — the top bar of a
 * room opened through another company's door read "Call Top-Rated Team (Danylo
 * Burykin SZČO)", which is a legal form doing the work of a label.
 *
 * So chrome says the trading name and the footer says the legal one, and both
 * are on screen at once in the rooms where it matters. The trading name is
 * `contract.displayName` on our own door row, not a string typed again here.
 */
const OUR_DISPLAY_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.displayName ?? "Top-Rated Team";

/**
 * The brief is read by a person, in a sheet and then in a notification, so the
 * agent's markdown has to come off it first. An answer that says
 * "`OPENAI_API_KEY` is not set" arrived in the hire sheet with the backticks
 * still on, which reads as somebody pasted the wrong thing.
 *
 * Deliberately small: fences, inline code, bold, italic and link syntax, and
 * nothing else. This is not a markdown parser and must not become one — the
 * text is going into a textarea a person can edit, and mangling it is worse
 * than leaving a stray asterisk.
 */
function asPlainText(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cuts prose to a readable length without slicing a word in half. */
function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** One key per room: hiding the arrival panel in one room says nothing about another. */
function arrivalKey(token: string): string {
  return `tr-room-arrival:${token}`;
}

function readDismissed(token: string): boolean {
  try {
    return window.localStorage.getItem(arrivalKey(token)) === "done";
  } catch {
    // Private mode. The panel shows again next visit, which is the safe way round.
    return false;
  }
}

/**
 * The site's own theme state, not a second one. This used to toggle the `dark`
 * class by hand and write the choice to `localStorage["theme"]` — a key nothing
 * reads. `client/index.html` and `@/hooks/use-theme` both use `tr-theme`, so a
 * visitor who switched the room to light got it back dark on the next load, and
 * the rest of the site never heard about the choice at all.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={ACTION_QUIET}
      data-testid="button-theme-toggle"
    >
      {dark ? "Light" : "Dark"}
      <span className="sr-only">Switch colour theme</span>
    </button>
  );
}

/**
 * The calendar behind this link is ours in every room, so in a room another
 * company is answerable for it has to say whose it is: a bare "Book a call"
 * there reads as that company's calendar, which is our contact standing in for
 * theirs. door.tsx says the same thing in a sentence under its own booking
 * button.
 *
 * `ours` is `null` until the room has loaded and said which door it came
 * through. Nothing on screen claims a company yet at that point, so the link
 * keeps its plain label rather than changing under the reader a moment later.
 *
 * It used to be a filled blue button, and it was the loudest thing in the room
 * — louder than the two-click hire, which is the path that actually works. It
 * is a word now. The hire is the button.
 */
function TopBar({ workspaceName, ours }: { workspaceName: string | null; ours: boolean | null }) {
  /* IN THE ROOM TOO, on the owner's instruction. The embed loads into a page whose URL is the whole account, so registerRoutes sets Referrer-Policy: no-referrer for /w/ — the address does not leave as a Referer */
  const booking = useBooking();
  return (
    <header className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-2 px-5 py-4 sm:px-8">
      <a href={MAIN_SITE_URL} className="flex items-baseline gap-2" data-testid="link-logo">
        <img src="/assets/top-rated-logo.png" alt="" aria-hidden="true" className="h-4 w-4 translate-y-0.5" />
        <span className={LABEL}>{OUR_DISPLAY_NAME}</span>
      </a>
      {/* Not on a phone. At 390 wide the bar wrapped to three lines — mark,
          room name, actions — and with the address strip under it the room's
          own first sentence started 600 pixels down an 844-pixel screen. The
          name is still the tab title, still the heading of the channel list,
          and still the first line of the sidebar; the top of a small screen is
          the one place it was costing more than it said. */}
      {workspaceName ? (
        <span className={cn(CHROME, "hidden min-w-0 truncate text-muted-foreground sm:inline")} data-testid="text-workspace-name">
          {workspaceName}
        </span>
      ) : null}
      <div className="ml-auto flex items-baseline gap-x-5">
        <a href={BOOK_A_CALL_URL} target="_blank" rel="noopener noreferrer" className={ACTION_QUIET} data-testid="button-book-call" {...booking}>
          {ours === false ? `Call ${OUR_DISPLAY_NAME}` : "Book a call"}
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}

function Shell({
  workspaceName,
  ours = null,
  children,
}: {
  workspaceName: string | null;
  /* Left out on the states that have no room yet: not known, rather than false. */
  ours?: boolean | null;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar workspaceName={workspaceName} ours={ours} />
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
  const [hireOffer, setHireOffer] = useState<HireOffer | undefined>(undefined);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const messageCountsRef = useRef<Record<string, number> | null>(null);
  /* The composer hands this back a function that puts the cursor in it. It is
   * what the arrival panel's one action does, and the only thing it does. */
  const focusComposerRef = useRef<(() => void) | null>(null);

  /* The stamp, resolved once and never guessed at — see the note at the top of
   * this file. `undefined` is a room that did not say which door it came
   * through, or one that named a door no row answers to. */
  const door = useMemo<DoorDef | undefined>(() => {
    const stamp = state?.workspace.source?.door?.trim();
    return stamp ? DOOR_BY_ID[stamp] : undefined;
  }, [state]);

  /* Whether this room is one of ours. Three answers, not two: yes, no, and — for
   * a room that never said which door it came through — not known. It used to
   * collapse the third into "no", which made the top bar disambiguate our
   * calendar from a company the room does not name and the footer says is
   * missing. Nothing on screen should imply a seller the room cannot produce. */
  const ours = door ? door.contract.legalName === OUR_LEGAL_NAME : null;
  const doorAgentId = door?.firstAgentId ?? null;

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

  /* Our name goes on our own rooms. A room opened through a door another
   * company signs and invoices for is that room's name and nothing else, so a
   * tab, a history entry and a bookmark stop filing another company's work
   * under ours — the same rule door.tsx applies to a door page's title. A room
   * that has not said which door it came through is filed under nobody. */
  useEffect(() => {
    const previous = document.title;
    const name = state?.workspace.name;
    document.title = name ? (ours ? `${name} — ${OUR_DISPLAY_NAME}` : name) : "Workspace";
    return () => {
      document.title = previous;
    };
  }, [ours, state]);

  /* Read once per room, not once per render: a panel that reappears halfway
   * through a session is worse than one that never showed. */
  useEffect(() => {
    if (!token) return;
    setArrivalDismissed(readDismissed(token));
  }, [token]);

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

  /* ------------------------------- the arrival ------------------------------
   * A room is new while the only things in it are the visitor's own opening
   * question and the answer to it. The seeded system message does not count:
   * the room narrating itself is not somebody using the room.
   * ----------------------------------------------------------------------- */
  const written = useMemo(() => messages.filter((m) => m.authorKind !== "system"), [messages]);
  const hasQuestion = useMemo(() => written.some((m) => m.authorKind === "visitor"), [written]);
  const showArrival = !arrivalDismissed && written.length <= 2;

  const dismissArrival = useCallback(() => {
    setArrivalDismissed(true);
    try {
      window.localStorage.setItem(arrivalKey(token), "done");
    } catch {
      // It closes for this visit either way.
    }
  }, [token]);

  const startWriting = useCallback(() => {
    focusComposerRef.current?.();
  }, []);

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

  /**
   * The Ad Grants setup, put on the list as five real lines. One at a time on
   * purpose: the server reads `state.tasks.length` to decide where a new line
   * goes, so five at once would land in an order nobody chose.
   */
  const addSetup = useCallback(
    async (lines: SetupLine[]) => {
      for (const line of lines) {
        await createTask({ title: line.title, detail: line.detail, assigneeKey: line.assigneeKey });
      }
    },
    [createTask],
  );

  const setupAlreadyAdded = useMemo(
    () => tasks.some((task) => task.title === AD_GRANT_SETUP[0].title),
    [tasks],
  );

  /**
   * The sheet opens either cold — "Add a person" from the rail, the sidebar
   * or the composer — or carrying what the thread already said. Going through
   * one function is what stops a cold invite arriving pre-filled with the brief
   * from a conversation somebody had ten minutes ago.
   */
  const openInvite = useCallback((offer?: HireOffer) => {
    setHireOffer(offer);
    setInviteOpen(true);
  }, []);

  /**
   * Click one of the two-click hire. The brief is lifted from the thread: what
   * the visitor asked, and where the agent stopped. Nobody retypes it, and it
   * stays editable in the sheet because a lifted brief is sometimes wrong.
   */
  const onGetPerson = useCallback(
    (message: Message) => {
      const index = channelMessages.findIndex((candidate) => candidate.id === message.id);
      const asked = [...(index === -1 ? channelMessages : channelMessages.slice(0, index))]
        .reverse()
        .find((candidate) => candidate.authorKind === "visitor");
      const stopped = trimTo(asPlainText(message.body), BRIEF_LIMIT);
      const question = asked ? asPlainText(asked.body) : "";
      openInvite({
        brief: question ? `${question}\n\nWhere the agent stopped: ${stopped}` : stopped,
      });
    },
    [channelMessages, openInvite],
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
        <div className="flex flex-1 items-center justify-center px-5">
          <p className={cn(META, "text-muted-foreground")}>Opening the room…</p>
        </div>
      </Shell>
    );
  }

  if (status === "not-found") {
    /* This address is not a room, so stop offering it. The list is this
       browser's memory of where its rooms are, and an entry that lands back on
       this very page is an offer to go nowhere — which is what the owner hit
       when three remembered rooms had been destroyed by a deploy: he clicked
       them, the page did not change, and it read as a dead button rather than
       as a room that no longer exists. Forgetting is the honest answer, and it
       happens before the list below is read so the row disappears with it. */
    if (token) forgetWorkspace(token);
    const stored = listStoredWorkspaces().filter((w) => w.token !== token);
    /* ----------------------------- the way back in ---------------------------
     * `/w` with nothing after it is not a broken link — it is somebody looking
     * for a room they already have. The address IS the account, this browser is
     * the only thing that remembers which addresses exist, and until now there
     * was no page that would tell them. The site can now point one quiet link
     * here, and the answer is either their rooms or the one true sentence about
     * why they have none.
     *
     * Nothing is created here and nothing is looked up on the server: the list
     * comes out of this browser's own storage, and a room opened on a phone has
     * never been on this device and correctly does not appear.
     * --------------------------------------------------------------------- */
    const noAddress = token === "";
    return (
      <Shell workspaceName={null}>
        <div className="flex flex-1 items-start justify-center overflow-y-auto px-5 py-12 sm:px-8">
          <div className="w-full max-w-[34rem]">
            <h1 className={cn(CHROME, "font-medium")}>{noAddress ? "Rooms on this device" : "This link is not a room"}</h1>
            <p className={cn(READ, "mt-3 text-muted-foreground")}>
              {noAddress
                ? stored.length > 0
                  ? "A room lives at its own address, and the address is the whole account. This browser is the only thing that remembers which ones you have — these are the ones it remembers."
                  : "There is no room on this device yet. A room is made when a conversation turns out to be worth keeping: ask a question on any of the doors, and keep the answer. That is the whole step."
                : "The link is the whole credential, so a typo or an expired copy leaves nothing to open. Starting a new room takes one message."}
            </p>
            <button type="button" onClick={() => navigate("/")} className={cn(ACTION, "mt-6")} data-testid="button-start-workspace">
              {noAddress ? "Go to the doors" : "Start a new room"}
            </button>

            {stored.length > 0 ? (
              <div className="mt-12">
                <h2 className={LABEL}>{noAddress ? "Kept here" : "Rooms on this device"}</h2>
                <ul className="mt-2">
                  {stored.map((workspace) => (
                    <li key={workspace.token} className="border-t border-border last:border-b">
                      <button
                        type="button"
                        onClick={() => navigate(`/w/${workspace.token}`)}
                        className={cn(CHROME, "hover-elevate active-elevate-2 flex w-full items-baseline justify-between gap-4 py-3 text-left")}
                      >
                        <span className="truncate">{workspace.name}</span>
                        <span className={cn(META, "shrink-0 text-muted-foreground")}>
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
        <div className="flex flex-1 items-start justify-center px-5 py-12 sm:px-8">
          <div className="w-full max-w-[34rem]">
            <h1 className={cn(CHROME, "font-medium")}>The room did not load</h1>
            <p className={cn(READ, "mt-3 text-muted-foreground")}>{error ?? "Something went wrong on the way here."}</p>
            <button type="button" onClick={() => window.location.reload()} className={cn(ACTION, "mt-6")} data-testid="button-retry">
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
  /*
   * NOT a useMemo, and that is the fix rather than a style choice. I put one
   * here first and it sat AFTER the early returns above — so on a render that
   * bailed out early the hook count differed, and React threw "Rendered more
   * hooks than during the previous render". The room went blank.
   *
   * roomNowLine is a pure pass over a handful of tasks. Memoising it was never
   * worth a hook; calling it is cheaper than the bug.
   */
  const nowLine = roomNowLine(tasks, members);

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
        openInvite();
        setSidebarOpen(false);
      }}
      onClose={onClose}
      className={onClose ? "h-full" : "hidden lg:flex"}
    />
  );

  return (
    <Shell workspaceName={state.workspace.name} ours={ours}>
      <div className="flex min-h-0 flex-1">
        {sidebar()}

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Channels">
            <div className="relative z-10 h-full border-r border-border">{sidebar(() => setSidebarOpen(false))}</div>
            <button
              type="button"
              aria-label="Close channels"
              onClick={() => setSidebarOpen(false)}
              className="h-full flex-1 bg-background/70 backdrop-blur-sm"
            />
          </div>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <ShareLinkBar
            url={shareUrl}
            workspaceId={state.workspace.id}
            defaultEmail={state.workspace.visitorEmail}
            verbose={showArrival}
          />
          <ChannelHeader
            channel={activeChannel}
            memberCount={members.length}
            doneCount={doneCount}
            taskCount={tasks.length}
            nowLine={nowLine}
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
              {/* Above the transcript and outside its scroller: the transcript
                  opens pinned to the newest message, so anything inside it is
                  already scrolled past by the time the room is painted.
                  On a phone it takes the column instead of sharing it — the
                  first render of this gave the transcript a sixty-pixel window
                  showing half a sentence, which is worse than not showing it.
                  Hiding it, sending anything, or writing a second message all
                  hand the column straight back. */}
              {showArrival ? (
                <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto border-b border-border lg:flex-none lg:overflow-visible">
                  <div className="mx-auto w-full max-w-[42rem] px-5 py-7 sm:px-8">
                    <RoomArrival
                      hasQuestion={hasQuestion}
                      onStart={startWriting}
                      onDismiss={dismissArrival}
                      durable={state.durable}
                    />
                  </div>
                </div>
              ) : null}
              <MessageList
                channel={activeChannel}
                messages={channelMessages}
                members={members}
                typing={typing}
                llmReady={kb ? kb.llmReady : null}
                doorAgentId={doorAgentId}
                onStarter={onStarter}
                onGetPerson={onGetPerson}
                /* The arrival opens the column on the visitor's own question,
                   because the panel directly above it says the question is
                   there. Every other visit opens on the newest message. */
                anchor={showArrival ? "question" : "newest"}
                className={showArrival ? "hidden lg:block" : undefined}
              />
              {/* Above the composer, not on arrival: the strip asks once the
                  room already holds something of theirs, which is the moment
                  they are about to paste more of it. IdentifyStrip hides
                  itself until that is true. Remounting on a new visitor turn
                  is what makes it appear after the paste rather than eight
                  seconds later on its own poll. */}
              <IdentifyStrip
                key={`${state.workspace.token}:${written.filter((m) => m.authorKind === "visitor").length}`}
                token={state.workspace.token}
              />
              <Composer
                channel={activeChannel}
                members={members}
                connection={connection}
                sending={sending}
                askAgentId={
                  activeChannel?.kind === "agent" && activeChannel.counterpartKey
                    ? activeChannel.counterpartKey.replace(/^agent:/, "")
                    : doorAgentId
                }
                onSend={onSend}
                onTyping={onTyping}
                onCreateTask={onCreateTask}
                onInvite={() => openInvite()}
                focusRef={focusComposerRef}
              />
            </section>

            <aside
              className={cn(
                "min-h-0 w-full shrink-0 flex-col bg-muted lg:w-[19rem] xl:flex",
                mobileView === "tasks" ? "flex" : "hidden",
                railOpen ? "lg:flex" : "lg:hidden",
              )}
              data-testid="rail-right"
            >
              {/* Who is here, the working panels, and the company answerable
                  for the room. The member list and the footer are capped so
                  they cannot push the other off the fold — quieter is not the
                  same as gone. Boosters sit in the scrolling middle, as
                  inventory, never in the member list. */}
              <MemberRail
                members={members}
                /* The same contract the footer prints: a line under a badge
                   that names a company must name this room's, not the site's. */
                contract={door?.contract ?? UNSTAMPED_ROOM}
                onInvite={() => openInvite()}
                onOpenDm={(memberKey) => void openDm(memberKey)}
                className="scrollbar-thin max-h-[28vh] shrink-0 overflow-y-auto border-b border-border"
              />
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                {/* ABOVE THE LIST, NOT UNDER IT. It was under it, on the
                    argument that the tool ends up on the list anyway — and in
                    an Ad Grants room rendered at 1440x900 it was below six
                    seeded task rows and never once on screen. A thing the owner
                    asked for that nobody can see has not been built. It is two
                    lines and a disclosure, it appears in two rooms out of
                    seven, and in those two it is the first thing in the column
                    that is not a name. */}
                <AdGrantPanel doorId={door?.id} alreadyAdded={setupAlreadyAdded} onAddSetup={addSetup} />
                {/* Our rented accounts, as inventory, never as names. A room
                    another company invoices does not show this list: the
                    accounts are ours, and putting them in that room would
                    tell their client they had our capacity on their team. */}
                {ours === true ? <AccountsPanel token={state.workspace.token} /> : null}
                <TaskPanel tasks={tasks} members={members} onCreate={onCreateTask} onUpdate={onUpdateTask} />
              </div>
              {/* A room must not be able to render without saying which company
                  is answerable for it and whose terms apply. This is the only
                  place that is said — and where the room cannot say it, this is
                  where it says that, rather than borrowing a name. */}
              <RoomFooter
                contract={door?.contract ?? UNSTAMPED_ROOM}
                className="scrollbar-thin max-h-[30vh] shrink-0 overflow-y-auto"
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
        doorId={door?.id}
        offer={hireOffer}
      />
      <NewChannelDialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen} onCreate={onCreateChannel} />
    </Shell>
  );
}
