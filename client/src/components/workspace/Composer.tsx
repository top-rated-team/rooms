import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { CornerDownLeft, SendHorizontal } from "lucide-react";
import { AGENTS, BOOK_A_CALL_URL, DEFAULT_AGENT_ID, EXPERTS } from "@shared/roster";
import type { Channel, Member } from "@shared/schema";
import type { ConnectionStatus } from "@/hooks/use-workspace";
import { Avatar, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";

const MAX_TEXTAREA_PX = 200; // ~8 rows before the textarea starts scrolling.

interface MentionOption {
  key: string;
  handle: string;
  label: string;
  detail: string;
  initials: string;
  tone: string;
}

const SLASH_HINTS = [
  { command: "/ask ", label: "/ask", detail: "ask the ChatGPT Ads agent" },
  { command: "/task ", label: "/task", detail: "add a task" },
  { command: "/invite", label: "/invite", detail: "bring in a human" },
  { command: "/call", label: "/call", detail: "book a call" },
];

function mentionOptions(members: Member[]): MentionOption[] {
  const agents: MentionOption[] = AGENTS.map((agent) => ({
    key: `agent:${agent.id}`,
    handle: agent.handle,
    label: agent.name,
    detail: agent.title,
    initials: agent.initials,
    tone: agent.tone,
  }));
  const experts: MentionOption[] = EXPERTS.map((expert) => ({
    key: expert.memberKey,
    handle: expert.name.toLowerCase().split(" ")[0].replace(/[^a-z0-9-]/g, ""),
    label: expert.name,
    detail: expert.title,
    initials: expert.initials,
    tone: toneFor(expert.memberKey, "expert"),
  }));
  // Anyone already in the workspace who is neither a roster agent nor a roster expert.
  const known = new Set([...agents, ...experts].map((o) => o.key));
  const extras: MentionOption[] = members
    .filter((m) => m.kind !== "visitor" && m.kind !== "system" && !known.has(m.memberKey))
    .map((m) => ({
      key: m.memberKey,
      handle: m.displayName.toLowerCase().split(" ")[0].replace(/[^a-z0-9-]/g, ""),
      label: m.displayName,
      detail: m.role ?? "",
      initials: m.initials,
      tone: toneFor(m.memberKey, m.kind),
    }));
  return [...agents, ...experts, ...extras];
}

/** The `@word` immediately behind the caret, or null when there isn't one. */
function activeMentionQuery(value: string, caret: number): { query: string; start: number } | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)@([\w-]*)$/.exec(before);
  if (!match) return null;
  return { query: match[2].toLowerCase(), start: caret - match[2].length - 1 };
}

function mentionKeysIn(body: string, options: MentionOption[]): string[] {
  const handles = new Set<string>();
  const pattern = /(^|\s)@([\w-]+)/g;
  let match = pattern.exec(body);
  while (match !== null) {
    handles.add(match[2].toLowerCase());
    match = pattern.exec(body);
  }
  const keys: string[] = [];
  for (const option of options) {
    if (handles.has(option.handle.toLowerCase()) && !keys.includes(option.key)) keys.push(option.key);
  }
  return keys.slice(0, 8);
}

export interface ComposerProps {
  channel: Channel | null;
  members: Member[];
  connection: ConnectionStatus;
  sending: boolean;
  onSend: (body: string, mentions: string[]) => void;
  onTyping: () => void;
  onCreateTask: (title: string) => void;
  onInvite: () => void;
}

export function Composer({
  channel,
  members,
  connection,
  sending,
  onSend,
  onTyping,
  onCreateTask,
  onInvite,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const options = useMemo(() => mentionOptions(members), [members]);
  const mention = menuOpen ? activeMentionQuery(value, caret) : null;
  const matches = useMemo(() => {
    if (!mention) return [];
    return options
      .filter(
        (option) =>
          option.handle.toLowerCase().startsWith(mention.query) ||
          option.label.toLowerCase().includes(mention.query),
      )
      .slice(0, 6);
  }, [mention, options]);

  const offline = connection !== "open";
  const disabledReason =
    connection === "connecting"
      ? "Connecting to the workspace…"
      : connection === "reconnecting"
        ? "Reconnecting — your message would not reach anyone yet."
        : connection === "closed"
          ? "Disconnected. Reload the page to get back in."
          : null;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  useEffect(() => {
    setMenuIndex(0);
  }, [mention?.query]);

  const insertMention = useCallback(
    (option: MentionOption) => {
      const current = activeMentionQuery(value, caret);
      if (!current) return;
      const next = `${value.slice(0, current.start)}@${option.handle} ${value.slice(caret)}`;
      const nextCaret = current.start + option.handle.length + 2;
      setValue(next);
      setMenuOpen(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
        setCaret(nextCaret);
      });
    },
    [caret, value],
  );

  const submit = useCallback(() => {
    const raw = value.trim();
    if (!raw || offline || !channel) return;

    // Slash commands never reach the transcript: they are local shortcuts.
    if (raw === "/invite" || raw.startsWith("/invite ")) {
      setValue("");
      onInvite();
      return;
    }
    if (raw === "/call" || raw.startsWith("/call ")) {
      setValue("");
      window.open(BOOK_A_CALL_URL, "_blank", "noopener,noreferrer");
      return;
    }
    // A bare command is still being typed: keep it in the box rather than posting it.
    if (raw === "/ask" || raw === "/task") return;
    if (raw.startsWith("/task ")) {
      const title = raw.slice("/task ".length).trim();
      if (!title) return;
      setValue("");
      onCreateTask(title);
      return;
    }
    if (raw.startsWith("/ask ")) {
      const question = raw.slice("/ask ".length).trim();
      if (!question) return;
      setValue("");
      onSend(question, [`agent:${DEFAULT_AGENT_ID}`]);
      return;
    }

    setValue("");
    onSend(raw, mentionKeysIn(raw, options));
  }, [channel, offline, onCreateTask, onInvite, onSend, options, value]);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(event.target.value);
      setCaret(event.target.selectionStart);
      setMenuOpen(true);
      if (event.target.value.trim().length > 0) onTyping();
    },
    [onTyping],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mention && matches.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setMenuIndex((i) => (i + 1) % matches.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setMenuIndex((i) => (i - 1 + matches.length) % matches.length);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          insertMention(matches[menuIndex] ?? matches[0]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setMenuOpen(false);
          return;
        }
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    },
    [insertMention, matches, menuIndex, mention, submit],
  );

  const syncCaret = useCallback((event: { currentTarget: HTMLTextAreaElement }) => {
    setCaret(event.currentTarget.selectionStart);
  }, []);

  const placeholder = channel
    ? channel.kind === "agent"
      ? "Ask a question. Enter sends, Shift+Enter starts a new line."
      : `Message #${channel.name}. Type @ to reach an agent or a person.`
    : "Pick a channel to start.";

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-4">
        <div className="relative">
          {mention && matches.length > 0 ? (
            <div
              className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-md border border-popover-border bg-popover shadow-lg"
              data-testid="menu-mentions"
            >
              <ul role="listbox" aria-label="Mentions">
                {matches.map((option, index) => (
                  <li key={option.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === menuIndex}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(option);
                      }}
                      onMouseEnter={() => setMenuIndex(index)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left",
                        index === menuIndex ? "bg-secondary" : "hover-elevate",
                      )}
                    >
                      <Avatar initials={option.initials} tone={option.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">@{option.handle}</span>
                        <span className="block truncate text-xs text-muted-foreground">{option.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            className={cn(
              "flex items-end gap-2 rounded-md border border-input bg-background px-2 py-2 focus-within:ring-1 focus-within:ring-ring",
              offline && "opacity-60",
            )}
          >
            <textarea
              ref={textareaRef}
              value={value}
              rows={1}
              disabled={offline || !channel}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onKeyUp={syncCaret}
              onClick={syncCaret}
              onBlur={() => setMenuOpen(false)}
              placeholder={placeholder}
              aria-label="Message"
              className="scrollbar-thin max-h-[200px] min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              data-testid="input-composer"
            />
            <button
              type="button"
              onClick={submit}
              disabled={offline || !channel || value.trim().length === 0 || sending}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2"
              data-testid="button-send"
            >
              <SendHorizontal />
              <span className="sr-only sm:not-sr-only">Send</span>
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {disabledReason ? (
            <span className="text-destructive" data-testid="text-composer-disabled">
              {disabledReason}
            </span>
          ) : (
            <>
              {SLASH_HINTS.map((hint) => (
                <button
                  key={hint.label}
                  type="button"
                  onClick={() => {
                    setValue(hint.command);
                    setMenuOpen(false);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className="hover-elevate active-elevate-2 rounded px-1 py-0.5"
                >
                  <span className="font-mono text-foreground">{hint.label}</span> {hint.detail}
                </button>
              ))}
              <span className="ml-auto hidden items-center gap-1 sm:inline-flex">
                <CornerDownLeft className="h-3 w-3" /> to send
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Composer;
