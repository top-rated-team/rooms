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
import { AGENTS, AGENT_BY_ID, BOOK_A_CALL_URL, EXPERTS } from "@shared/roster";
import type { Channel, Member } from "@shared/schema";
import type { ConnectionStatus } from "@/hooks/use-workspace";
import { Avatar, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, META, READ } from "@/components/workspace/room-style";

const MAX_TEXTAREA_PX = 200; // ~8 rows before the textarea starts scrolling.

/* ---------------------------------------------------------------------------
 * The composer is a rule with words on it, not a box with a blue button in the
 * corner. It is the same shape the front page's panel uses: a line under what
 * you are typing, and the action as a word at the end of it.
 *
 * Everything below the line is unchanged behaviour — the four slash commands,
 * the @ menu, Enter to send — restated as words instead of icons.
 * ------------------------------------------------------------------------- */

interface MentionOption {
  key: string;
  handle: string;
  label: string;
  detail: string;
  initials: string;
  tone: string;
}

const SLASH_HINTS = [
  { command: "/task ", label: "/task", detail: "add a line to the list" },
  { command: "/invite", label: "/invite", detail: "bring in a person" },
  { command: "/call", label: "/call", detail: "book a call" },
];

function mentionOptions(members: Member[]): MentionOption[] {
  const agents: MentionOption[] = AGENTS.map((agent) => ({
    key: `agent:${agent.id}`,
    handle: agent.handle,
    label: agent.name,
    detail: agent.title,
    initials: agent.initials,
    tone: toneFor(`agent:${agent.id}`, "agent"),
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
  /**
   * Which agent `/ask` summons. The channel's counterpart in an agent thread,
   * otherwise the door's first agent. Null when no agent of ours answers here,
   * so the command is not offered and does not quietly call the ChatGPT Ads one.
   */
  askAgentId?: string | null;
  onSend: (body: string, mentions: string[]) => void;
  onTyping: () => void;
  onCreateTask: (title: string) => void;
  onInvite: () => void;
  /** Set by the page so the arrival panel's one action can land the cursor here. */
  focusRef?: { current: (() => void) | null };
}

export function Composer({
  channel,
  members,
  connection,
  sending,
  askAgentId,
  onSend,
  onTyping,
  onCreateTask,
  onInvite,
  focusRef,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const options = useMemo(() => mentionOptions(members), [members]);
  const askAgent = askAgentId ? AGENT_BY_ID[askAgentId] : undefined;
  const slashHints = useMemo(() => {
    const ask = askAgent
      ? [{ command: "/ask ", label: "/ask", detail: `ask ${askAgent.name}` }]
      : [];
    return [...ask, ...SLASH_HINTS];
  }, [askAgent]);
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
      ? "Connecting to the room…"
      : connection === "reconnecting"
        ? "Reconnecting — your message would not reach anyone yet."
        : connection === "closed"
          ? "Disconnected. Reload the page to get back in."
          : null;
  const disabledIsFault = connection === "reconnecting" || connection === "closed";

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  useEffect(() => {
    setMenuIndex(0);
  }, [mention?.query]);

  /* The arrival panel's only action is "say what you are working on", and this
   * is where that lands. Handing the page a function rather than a ref to the
   * element keeps the focus behaviour in the component that owns it. */
  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => textareaRef.current?.focus();
    return () => {
      focusRef.current = null;
    };
  }, [focusRef]);

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
      if (!question || !askAgent) return;
      setValue("");
      onSend(question, [`agent:${askAgent.id}`]);
      return;
    }

    setValue("");
    onSend(raw, mentionKeysIn(raw, options));
  }, [askAgent, channel, offline, onCreateTask, onInvite, onSend, options, value]);

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

  /* Short enough to be read on a phone. The long version — "Enter sends, Shift
     and Enter starts a new line" — was clipped mid-sentence at 390 wide, and it
     said twice what the line under the rule already says once. */
  const placeholder = channel
    ? channel.kind === "agent"
      ? "Ask a question."
      : `Write to #${channel.name}. Type @ for a person or an agent.`
    : "Pick a channel to start.";

  return (
    <div className="shrink-0 border-t border-border">
      <div className="mx-auto w-full max-w-[42rem] px-5 py-5 sm:px-8">
        <div className="relative">
          {mention && matches.length > 0 ? (
            /* A menu floating over prose has to be bounded or it cannot be
               read. One hairline and the room's ground — no shadow, no radius. */
            <div
              className="absolute bottom-full left-0 z-20 mb-3 w-full max-w-sm border border-border bg-background"
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
                        "flex w-full items-baseline gap-3 px-3 py-2 text-left",
                        index === menuIndex ? "bg-muted" : "hover-elevate",
                      )}
                    >
                      <Avatar initials={option.initials} tone={option.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className={cn(CHROME, "block truncate font-medium")}>@{option.handle}</span>
                        <span className={cn(META, "block truncate text-muted-foreground")}>{option.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={cn("flex items-end gap-5 border-b border-foreground pb-2", offline && "opacity-60")}>
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
              className={cn(
                READ,
                "scrollbar-thin max-h-[200px] min-h-[1.75rem] flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
              )}
              data-testid="input-composer"
            />
            <button
              type="button"
              onClick={submit}
              disabled={offline || !channel || value.trim().length === 0 || sending}
              className={cn(ACTION, "mb-0.5")}
              data-testid="button-send"
            >
              {sending ? "Sending" : "Send"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          {disabledReason ? (
            <span
              className={cn(META, disabledIsFault ? "text-destructive" : "text-muted-foreground")}
              data-testid="text-composer-disabled"
            >
              {disabledReason}
            </span>
          ) : (
            <>
              {slashHints.map((hint) => (
                <button
                  key={hint.label}
                  type="button"
                  onClick={() => {
                    setValue(hint.command);
                    setMenuOpen(false);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className={cn(ACTION_QUIET, "normal-case tracking-normal")}
                >
                  <span className="font-mono">{hint.label}</span>
                  <span>{hint.detail}</span>
                </button>
              ))}
              <span className={cn(META, "ml-auto hidden text-muted-foreground sm:inline")}>Enter sends</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Composer;
