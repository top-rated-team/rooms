import { useCallback, useEffect, useMemo, useRef } from "react";
import { AGENT_BY_ID, DEFAULT_AGENT_ID, EXPERT_BY_KEY, type AgentDef, type ExpertDef } from "@shared/roster";
import type { Channel, Member, Message } from "@shared/schema";
import type { TypingSignal } from "@/hooks/use-workspace";
import { MessageItem } from "@/components/workspace/MessageItem";
import { cn } from "@/lib/utils";
import { CHROME, FOCUS, LABEL, META, READ } from "@/components/workspace/room-style";

/** Messages closer together than this from one author render as a single run. */
const RUN_WINDOW_MS = 5 * 60 * 1000;
const PIN_THRESHOLD_PX = 120;

function dayKey(value: Date | string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toDateString();
}

function dayLabel(value: Date | string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function agentForChannel(channel: Channel | null): AgentDef | undefined {
  if (!channel || channel.kind !== "agent" || !channel.counterpartKey) return undefined;
  const agent: AgentDef | undefined = AGENT_BY_ID[channel.counterpartKey.replace(/^agent:/, "")];
  return agent;
}

interface Starter {
  question: string;
  /** Which agent the question is aimed at, so a project channel can summon it. */
  agentId: string;
}

function startersFor(agent: AgentDef | undefined, count: number): Starter[] {
  if (!agent) return [];
  return agent.starters.slice(0, count).map((question) => ({ question, agentId: agent.id }));
}

function starterQuestions(channel: Channel | null): Starter[] {
  const channelAgent = agentForChannel(channel);
  if (channelAgent) return startersFor(channelAgent, 4);
  return [
    ...startersFor(AGENT_BY_ID[DEFAULT_AGENT_ID], 2),
    ...startersFor(AGENT_BY_ID["conversion-tracking"], 2),
  ];
}

function nameForKey(key: string, members: Member[]): string {
  const member = members.find((m) => m.memberKey === key);
  if (member) return member.displayName;
  if (key.startsWith("agent:")) {
    const agent: AgentDef | undefined = AGENT_BY_ID[key.slice("agent:".length)];
    if (agent) return agent.name;
  }
  const expert: ExpertDef | undefined = EXPERT_BY_KEY[key];
  return expert?.name ?? "Someone";
}

export interface MessageListProps {
  channel: Channel | null;
  messages: Message[];
  members: Member[];
  typing: TypingSignal[];
  /** null while /api/kb/status is still in flight. */
  llmReady: boolean | null;
  onStarter: (question: string, agentId: string) => void;
  /** Click one of the two-click hire. Offered under the newest agent turn only. */
  onGetPerson?: (message: Message) => void;
  /**
   * Where the column opens.
   *
   * "newest" is the chat default and what every later visit wants. "question"
   * is the arrival, and it exists because the arrival panel says "the question
   * you asked on the way in is here" — and, measured at 1440x900, it was not:
   * the panel took the top 300 pixels, the transcript opened pinned to the
   * newest message, and the visitor's own sentence sat 90 pixels above the
   * window saying that. A promise made in the same frame that hides the thing
   * promised is the one kind of copy this room cannot print.
   *
   * On "question" the column opens on the visitor's first sentence with the
   * answer growing underneath it, and following-the-newest is off — there is
   * exactly one answer coming, it starts directly below, and nothing should
   * pull the reader off their own words while it arrives.
   */
  anchor?: "newest" | "question";
  className?: string;
}

export function MessageList({
  channel,
  messages,
  members,
  typing,
  llmReady,
  onStarter,
  onGetPerson,
  anchor = "newest",
  className,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const channelId = channel?.id ?? null;

  const ordered = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id),
      ),
    [messages],
  );

  const memberByKey = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of members) map.set(member.memberKey, member);
    return map;
  }, [members]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    /* Nothing re-arms following-the-newest while the column is being held on
       the visitor's question — including the scroll event the anchor itself
       fires. Setting `scrollTop` emits a scroll, that scroll landed 98 pixels
       from the bottom, 98 is inside the 120-pixel pin threshold, and the next
       token of the streaming answer handed the column straight back to the
       bottom. The anchor looked as though it had never run. */
    if (anchor === "question") return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
  }, [anchor]);

  // Switching channel always lands at the newest message — and so does coming
  // back into view. On a phone the page hides this list while the arrival panel
  // has the column, and a hidden element has no scroll height to set: without
  // `className` in here, dismissing the panel handed back a transcript sitting
  // at the top of the day with the newest message off the bottom of it.
  //
  // The one exception is the arrival — see `anchor`. Measured off rectangles
  // rather than `offsetTop` because the message sits two elements inside the
  // scroller and neither of them is positioned, so an offset parent here is
  // whatever the page happens to be doing above it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (anchor === "question") {
      const asked = ordered.find((message) => message.authorKind === "visitor");
      const node = asked ? el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(asked.id)}"]`) : null;
      if (node) {
        pinnedRef.current = false;
        el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
        return;
      }
    }
    pinnedRef.current = true;
    el.scrollTop = el.scrollHeight;
    // `ordered.length` and not `ordered`: the answer streams into a message
    // that already exists, and re-anchoring on every delta would fight it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, channelId, className, ordered.length]);

  // Follow new output only when the reader has not scrolled back, and never
  // while the column is anchored to the question.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || anchor === "question" || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [anchor, ordered]);

  const typingNames = typing
    .filter((t) => t.channelId === channelId)
    .map((t) => nameForKey(t.memberKey, members))
    .filter((name, index, all) => all.indexOf(name) === index);

  const starters = starterQuestions(channel);
  const channelAgent = agentForChannel(channel);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto", className)}
      data-testid="list-messages"
    >
      <div className="mx-auto w-full max-w-[42rem] px-5 py-8 sm:px-8">
        {llmReady === false ? (
          <p className={cn(CHROME, "mb-8 border-l border-border pl-4 text-muted-foreground")}>
            Live agent answers are not configured on this deployment, so the agents will tell you that rather than
            guess. The people on the team still read this room and reply here.
          </p>
        ) : null}

        {ordered.length === 0 ? (
          <div className="pb-4">
            <h2 className={cn(CHROME, "font-medium")}>
              {channelAgent ? channelAgent.name : channel ? `#${channel.name}` : "This room"}
            </h2>
            <p className={cn(READ, "mt-2 text-muted-foreground")}>
              {channelAgent?.blurb ??
                channel?.purpose ??
                "Nothing here yet. Say what you are running ads for, and what counts as a conversion."}
            </p>
            {starters.length > 0 ? (
              <div className="mt-7">
                <p className={LABEL}>Ask one of these</p>
                <ul className="mt-2">
                  {starters.map((starter) => (
                    <li key={starter.question} className="border-t border-border last:border-b">
                      <button
                        type="button"
                        onClick={() => onStarter(starter.question, starter.agentId)}
                        className={cn(READ, FOCUS, "block w-full py-3 text-left hover:text-muted-foreground")}
                        data-testid="button-starter"
                      >
                        {starter.question}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {ordered.map((message, index) => {
          const previous = index > 0 ? ordered[index - 1] : undefined;
          const sameDay = previous ? dayKey(previous.createdAt) === dayKey(message.createdAt) : false;
          const isEvent = Boolean(message.meta?.event);
          const previousWasEvent = Boolean(previous?.meta?.event);
          const withinRun =
            previous !== undefined &&
            !isEvent &&
            !previousWasEvent &&
            previous.authorKey === message.authorKey &&
            new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < RUN_WINDOW_MS;

          return (
            <div key={message.id}>
              {!sameDay ? (
                <div className="flex items-center gap-3 py-6">
                  <span className="h-px flex-1 bg-border" />
                  <span className={LABEL}>{dayLabel(message.createdAt)}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <MessageItem
                message={message}
                member={memberByKey.get(message.authorKey)}
                showAuthor={!withinRun}
                // Only the last message carries it. The need appears at the
                // live edge of the thread, and a button under every answer is
                // a nag rather than an offer.
                onGetPerson={index === ordered.length - 1 ? onGetPerson : undefined}
              />
            </div>
          );
        })}

        <div className={cn(META, "h-6 pt-4 text-muted-foreground", typingNames.length === 0 && "invisible")}>
          {typingNames.length > 0
            ? `${typingNames.slice(0, 3).join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…`
            : " "}
        </div>
      </div>
    </div>
  );
}

export default MessageList;
