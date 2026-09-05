import { ExternalLink, TriangleAlert } from "lucide-react";
import { AGENT_BY_ID, EXPERT_BY_KEY, type AgentDef, type ExpertDef } from "@shared/roster";
import type { Citation, Member, Message } from "@shared/schema";
import { Avatar, initialsFor, toneFor } from "@/components/workspace/Avatar";
import { Markdown } from "@/components/workspace/Markdown";
import { cn } from "@/lib/utils";

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

function clockTime(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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

function CitationChips({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="list-citations">
      {citations.map((citation, index) => (
        <a
          key={`${citation.url}-${index}`}
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          title={citation.snippet ?? citation.url}
          className="hover-elevate active-elevate-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-card-border bg-card px-2 py-1 text-xs text-muted-foreground"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{citation.title}</span>
        </a>
      ))}
    </div>
  );
}

export interface MessageItemProps {
  message: Message;
  member: Member | undefined;
  /** False when this message continues a run from the same author. */
  showAuthor: boolean;
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

export function MessageItem({ message, member, showAuthor }: MessageItemProps) {
  const meta = message.meta ?? {};
  const errorNotice = errorNoticeFor(meta.error);

  // System events are the workspace narrating itself. Most are one-liners and read
  // best as a chip; the opening briefing is real prose and has to keep its markdown.
  if (meta.event === "workspace_created") {
    return (
      <div className="py-2" data-testid="event-workspace_created">
        <div className="rounded-lg border border-card-border bg-card px-5 py-4">
          <Markdown>{message.body}</Markdown>
        </div>
      </div>
    );
  }

  if (meta.event) {
    return (
      <div className="flex justify-center py-2" data-testid={`event-${meta.event}`}>
        <span className="rounded-full border border-card-border bg-card px-3 py-1 text-xs text-muted-foreground">
          {message.body}
        </span>
      </div>
    );
  }

  const agent = agentFor(message.authorKey);
  const expert = expertFor(message.authorKey);
  const name = member?.displayName ?? agent?.name ?? expert?.name ?? "Someone";
  const role = member?.role ?? agent?.title ?? expert?.title ?? null;
  const initials = member?.initials ?? agent?.initials ?? expert?.initials ?? initialsFor(name);
  const tone = toneFor(message.authorKey, message.authorKind);
  const isVisitor = message.authorKind === "visitor";
  const isAgent = message.authorKind === "agent";
  const citations = meta.citations ?? [];

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-md px-2 py-1.5",
        showAuthor && "mt-4 first:mt-0",
        // Visitor turns get a wash rather than an alignment flip: this is a
        // group chat, not a two-party thread.
        isVisitor && "bg-secondary/40",
      )}
      data-testid={`message-${message.id}`}
    >
      <div className="w-8 shrink-0 pt-0.5">
        {showAuthor ? (
          <Avatar initials={initials} tone={tone} size="md" title={name} />
        ) : (
          <span className="block select-none text-center text-[10px] leading-7 text-muted-foreground opacity-0 group-hover:opacity-100">
            {clockTime(message.createdAt)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showAuthor ? (
          <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{name}</span>
            {isAgent ? (
              <span className="rounded border border-primary-border bg-primary/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                AI
              </span>
            ) : null}
            {role ? <span className="text-xs text-muted-foreground">{role}</span> : null}
            <span className="text-xs text-muted-foreground">{relativeTime(message.createdAt)}</span>
          </div>
        ) : null}

        <Markdown>{message.body}</Markdown>

        {meta.streaming ? (
          <span
            className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-cursor-blink bg-foreground align-middle"
            aria-label="Still writing"
          />
        ) : null}

        {errorNotice ? (
          <p className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
            <span>{errorNotice}</span>
          </p>
        ) : null}

        {citations.length > 0 ? <CitationChips citations={citations} /> : null}
      </div>
    </div>
  );
}

export default MessageItem;
