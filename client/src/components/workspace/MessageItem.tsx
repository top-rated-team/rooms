import { AGENT_BY_ID, EXPERT_BY_KEY, type AgentDef, type ExpertDef } from "@shared/roster";
import type { Citation, Member, Message } from "@shared/schema";
import { badgeForKey } from "@/components/workspace/MemberRail";
import { Markdown } from "@/components/workspace/Markdown";
import { cn } from "@/lib/utils";
import { ACTION, CHROME, LABEL, LINK, META, READ } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * A turn in the transcript, set like something written rather than something
 * posted. There is no avatar, no bubble and no background wash: a name at the
 * chrome size, and under it the words at the reading size, in the serif.
 *
 * The one distinction the column draws is between a question and an answer,
 * and it draws it the way the front page draws it — the question is soft ink
 * behind a rule, the answer is full ink. Same size for both, because whose
 * words they are is not a matter of importance.
 * ------------------------------------------------------------------------- */

function relativeTime(value: Date | string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 7200) return "1 hour ago";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function agentFor(memberKey: string): AgentDef | undefined {
  if (!memberKey.startsWith("agent:")) return undefined;
  const agent: AgentDef | undefined = AGENT_BY_ID[memberKey.slice("agent:".length)];
  return agent;
}

function expertFor(memberKey: string): ExpertDef | undefined {
  const expert: ExpertDef | undefined = EXPERT_BY_KEY[memberKey];
  return expert;
}

/**
 * Citations used to be bordered chips. They are a line now, under a rule, the
 * way the front page prints what an answer used — and they are the only
 * underlined thing in an answer, so they are still the first thing the eye
 * finds after the last sentence.
 */
function Citations({ citations }: { citations: Citation[] }) {
  return (
    <p className={cn(META, "mt-4 border-t border-border pt-2 text-muted-foreground")} data-testid="list-citations">
      <span className={cn(LABEL, "mr-2")}>Read from</span>
      {citations.map((citation, index) => (
        <span key={`${citation.url}-${index}`}>
          {index > 0 ? <span className="px-1.5 text-muted-foreground">·</span> : null}
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            title={citation.snippet ?? citation.url}
            className={LINK}
          >
            {citation.title}
          </a>
        </span>
      ))}
    </p>
  );
}

export interface MessageItemProps {
  message: Message;
  member: Member | undefined;
  /** False when this message continues a run from the same author. */
  showAuthor: boolean;
  /**
   * Click one of the two-click hire. Rendered under an agent's turn, because
   * that is where the need appears — the agent has just said what it cannot
   * finish. Absent on every other message, and on older agent turns: one button
   * at the live edge of the thread, not one per answer.
   */
  onGetPerson?: (message: Message) => void;
}

/**
 * Error codes are for the log, not the reader. A code with no entry here is shown
 * as-is rather than swallowed — an unexplained failure is worse than a raw string.
 * `null` means the message body already explains it, so a red box would just nag.
 */
const ERROR_COPY: Record<string, string | null> = {
  llm_not_configured: null,
  rate_limited: "The agent is being asked a lot right now. Try again in a moment.",
  context_too_long: "That thread got too long for one answer. Start a new channel for this question.",
  timeout: "The agent took too long and was stopped. Try a narrower question.",
  upstream_error: "The model provider returned an error. A human on the team can still answer this.",
};

function errorNoticeFor(code: string | undefined): string | null {
  if (!code) return null;
  return code in ERROR_COPY ? ERROR_COPY[code] : code;
}

export function MessageItem({ message, member, showAuthor, onGetPerson }: MessageItemProps) {
  const meta = message.meta ?? {};
  const errorNotice = errorNoticeFor(meta.error);

  // System events are the workspace narrating itself. Most are one-liners and read
  // best as a single line between rules; the opening briefing is real prose and
  // has to keep its markdown.
  if (meta.event === "workspace_created") {
    return (
      <div className="border-y border-border py-5" data-testid="event-workspace_created">
        <Markdown className={cn(READ, "text-foreground")}>{message.body}</Markdown>
      </div>
    );
  }

  if (meta.event) {
    return (
      <div className="flex items-center gap-3 py-4" data-testid={`event-${meta.event}`}>
        <span className="h-px flex-1 bg-border" />
        <span className={cn(META, "text-muted-foreground")}>{message.body}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  const agent = agentFor(message.authorKey);
  const expert = expertFor(message.authorKey);
  const name = member?.displayName ?? agent?.name ?? expert?.name ?? "Someone";
  const role = member?.role ?? agent?.title ?? expert?.title ?? null;
  const isVisitor = message.authorKind === "visitor";
  const isAgent = message.authorKind === "agent";
  const citations = meta.citations ?? [];

  return (
    /* `data-message-id` is read by MessageList when the column has to open on
       this turn rather than on the newest one — see its `anchor` prop. It is a
       separate attribute from the test id on purpose: one is a hook for tests
       and can be renamed, the other is behaviour. */
    <div
      className={cn(showAuthor ? "mt-7 first:mt-0" : "mt-3")}
      data-message-id={message.id}
      data-testid={`message-${message.id}`}
    >
      {showAuthor ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={cn(CHROME, "font-medium")}>{name}</span>
          {/* The badge rule holds in the transcript too: a badge says what
              someone does here, never what they are made of. "AI" is not a
              job — see MemberRail.tsx, where the vocabulary lives. */}
          {isAgent ? (
            <span className={LABEL} data-testid={`badge-message-${message.id}`}>
              {badgeForKey(message.authorKey, "agent")}
            </span>
          ) : null}
          {role ? <span className={cn(META, "text-muted-foreground")}>{role}</span> : null}
          <span className={cn(META, "text-muted-foreground")}>{relativeTime(message.createdAt)}</span>
        </div>
      ) : null}

      <div className={cn(isVisitor && "border-l border-border pl-4")}>
        <Markdown className={cn(READ, "mt-1.5", isVisitor ? "text-muted-foreground" : "text-foreground")}>
          {message.body}
        </Markdown>

        {meta.streaming ? (
          <span
            className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-cursor-blink bg-foreground align-middle"
            aria-label="Still writing"
          />
        ) : null}
      </div>

      {errorNotice ? (
        <p className={cn(CHROME, "mt-3 border-l border-destructive pl-3 text-destructive")}>{errorNotice}</p>
      ) : null}

      {citations.length > 0 ? <Citations citations={citations} /> : null}

      {isAgent && onGetPerson && !meta.streaming ? (
        <div className="mt-4">
          <button type="button" onClick={() => onGetPerson(message)} className={ACTION} data-testid="button-get-person">
            Get a person on this
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default MessageItem;
