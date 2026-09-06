import { useCallback, useEffect, useMemo, useRef } from "react";
import { Info, Sparkles } from "lucide-react";
import { AGENT_BY_ID, DEFAULT_AGENT_ID, EXPERT_BY_KEY, type AgentDef, type ExpertDef } from "@shared/roster";
import type { Channel, Member, Message } from "@shared/schema";
import type { TypingSignal } from "@/hooks/use-workspace";
import { MessageItem } from "@/components/workspace/MessageItem";
import { cn } from "@/lib/utils";

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
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
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
}

export function MessageList({ channel, messages, members, typing, llmReady, onStarter, onGetPerson }: MessageListProps) {
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
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
  }, []);

  // Switching channel always lands at the newest message.
  useEffect(() => {
    pinnedRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [channelId]);

  // Follow new output only when the reader has not scrolled back.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [ordered]);

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
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
      data-testid="list-messages"
    >
      <div className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-4">
        {llmReady === false ? (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-card-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-px h-4 w-4 shrink-0" />
            <span>
              Live agent answers are not configured on this deployment, so the agents will tell you that rather than
              guess. The people on the team still read this workspace and reply here.
            </span>
          </div>
        ) : null}

        {ordered.length === 0 ? (
          <div className="py-6">
            <h2 className="text-lg font-semibold">
              {channelAgent ? channelAgent.name : channel ? `#${channel.name}` : "Workspace"}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {channelAgent?.blurb ??
                channel?.purpose ??
                "Nothing here yet. Say what you are running ads for and what counts as a conversion."}
            </p>
            {starters.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Start with one of these
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {starters.map((starter) => (
                    <button
                      key={starter.question}
                      type="button"
                      onClick={() => onStarter(starter.question, starter.agentId)}
                      className="hover-elevate active-elevate-2 rounded-md border border-card-border bg-card px-3 py-2 text-left text-sm text-foreground sm:max-w-[19rem]"
                      data-testid="button-starter"
                    >
                      {starter.question}
                    </button>
                  ))}
                </div>
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
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {dayLabel(message.createdAt)}
                  </span>
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

        <div className={cn("h-6 px-2 pt-2 text-xs text-muted-foreground", typingNames.length === 0 && "invisible")}>
          {typingNames.length > 0
            ? `${typingNames.slice(0, 3).join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…`
            : " "}
        </div>
      </div>
    </div>
  );
}

export default MessageList;
