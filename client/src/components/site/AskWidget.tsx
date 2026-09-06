import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, CornerDownLeft, ExternalLink, Loader2, Send } from "lucide-react";

import type { AskEvent, KbStatus } from "@shared/api";
import type { Citation } from "@shared/schema";
import { DEFAULT_DOOR_ID, DOOR_BY_ID, doorAgent, type DoorDef } from "@shared/doors";
import { BOOK_A_CALL_URL } from "@shared/roster";

const importAnswerMarkdown = () => import("@/components/site/AnswerMarkdown");
const AnswerMarkdown = lazy(importAnswerMarkdown);

/** The door that pays for the site. The panel is the same component on all of them. */
const DEFAULT_DOOR = DOOR_BY_ID[DEFAULT_DOOR_ID];

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY_SM = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-8 rounded-md px-3 text-xs`;
const BTN_GHOST_SM = `${BTN_BASE} border border-transparent min-h-8 rounded-md px-3 text-xs`;

/** A blinking caret glued to the last rendered block while tokens are still arriving. */
const CARET =
  "[&>*:last-child]:after:ml-1 [&>*:last-child]:after:inline-block [&>*:last-child]:after:h-[1em] [&>*:last-child]:after:w-[2px] [&>*:last-child]:after:bg-primary [&>*:last-child]:after:align-[-0.15em] [&>*:last-child]:after:content-[''] [&>*:last-child]:after:animate-cursor-blink";

type AskStatus = "idle" | "streaming" | "done" | "error";
type KbState = "loading" | "ready" | "unconfigured" | "unreachable";


function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface AskWidgetProps {
  /** Creates a workspace seeded with this conversation. Resolves to an error message, or null on success. */
  onStartWorkspace: (opts?: { agentId?: string; firstMessage?: string }) => Promise<string | null>;
  /**
   * Which offer this panel is answering for: the agent that speaks first, the
   * four questions it opens with, and the row a kept conversation is stamped
   * with. Defaults to the ChatGPT Ads door, whose starters this component used
   * to carry as a local constant.
   */
  door?: DoorDef;
  /**
   * Every message the visitor sends. The rule about what that means lives in
   * use-panel-state.ts, not here.
   */
  onVisitorMessage?: (text: string) => void;
  /** Pressed "Book a call" from inside the conversation: they asked for a person. */
  onAskedForAPerson?: () => void;
}

export function AskWidget({ onStartWorkspace, door = DEFAULT_DOOR, onVisitorMessage, onAskedForAPerson }: AskWidgetProps) {
  // Which agent speaks first is the door's decision, not this component's.
  // Door 6 names none — nobody of ours answers in the partner's door — so the
  // chip falls back to the door's own initials rather than wearing an agent
  // who is not there.
  const agent = doorAgent(door);
  const agentId = door.firstAgentId;

  const [kbState, setKbState] = useState<KbState>("loading");
  const [kbMode, setKbMode] = useState<KbStatus["mode"]>("empty");
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [status, setStatus] = useState<AskStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showAllStarters, setShowAllStarters] = useState(false);
  const [startingWorkspace, setStartingWorkspace] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kb/status", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as KbStatus;
        setKbMode(body.mode);
        setKbState(body.llmReady ? "ready" : "unconfigured");
      })
      .catch(() => {
        if (!controller.signal.aborted) setKbState("unreachable");
      });
    return () => controller.abort();
  }, []);

  // Any in-flight stream dies with the component; the server sees the disconnect.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (status !== "streaming") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [answer, status]);

  const ask = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    // Reported before the request goes out: whether this conversation is worth
    // keeping is decided in use-panel-state.ts, and it is decided on what the
    // visitor said, not on what came back.
    onVisitorMessage?.(text);
    if (!agentId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAsked(text);
    setQuestion("");
    setAnswer("");
    setCitations([]);
    setError(null);
    setStatus("streaming");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, agentId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setStatus("error");
        setError(
          res.status === 429
            ? "Too many questions from this address for the moment. Give it a minute, or talk to a human below."
            : "The agent could not be reached. The people below are still available.",
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const payload = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!payload || payload === "[DONE]") continue;

          let event: AskEvent;
          try {
            event = JSON.parse(payload) as AskEvent;
          } catch {
            continue; // Keep-alives and comments are not our business.
          }

          if (event.type === "delta") {
            setAnswer((prev) => prev + event.delta);
          } else if (event.type === "done") {
            setCitations(event.citations ?? []);
            setStatus("done");
            finished = true;
          } else if (event.type === "error") {
            setError(event.message);
            setStatus("error");
            finished = true;
          }
        }
      }

      // A terminal frame means we stop reading; release the connection rather than idling on it.
      if (finished) await reader.cancel().catch(() => undefined);

      // A stream that ends without a terminal frame is a truncated answer, not a finished one.
      if (!finished) {
        setError("The answer stopped early. Ask again, or put it to a human below.");
        setStatus("error");
      }
    } catch {
      if (controller.signal.aborted) return;
      setError("Network error while streaming the answer. The human CTAs below still work.");
      setStatus("error");
    }
  }, [agentId, onVisitorMessage]);

  async function startWorkspace() {
    setStartingWorkspace(true);
    const failure = await onStartWorkspace({
      agentId: agentId ?? undefined,
      firstMessage: asked ?? undefined,
    });
    setStartingWorkspace(false);
    if (failure) setError(failure);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(question);
    }
  }

  // A door that names no agent of ours has no panel to offer, and the composer
  // says so instead of accepting a question nobody is going to answer.
  const disabled = !agentId || kbState === "unconfigured" || kbState === "unreachable";
  const busy = status === "streaming";
  const hasThread = asked !== null;
  const starters = door.starters;
  const visibleStarters = showAllStarters ? starters : starters.slice(0, 4);

  return (
    <div
      data-testid="widget-ask"
      className="rounded-lg border border-card-border bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3 border-b border-card-border pb-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${agent?.tone ?? door.tone}`}
          aria-hidden="true"
        >
          {agent?.initials ?? door.initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{agent?.name ?? door.headline}</p>
          <p className="text-xs text-muted-foreground">
            {/* One corpus is built, so only the door pointed at it can promise
                where its answers come from. Every other door says what its
                agent does instead — see kbNamespace in shared/doors.ts. */}
            {door.kbNamespace === "chatgpt-ads" ? (
              <>
                Answers from{" "}
                <a
                  href="https://developers.openai.com/ads/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  developers.openai.com/ads
                </a>{" "}
                and cites the page it used.
              </>
            ) : (
              door.agentLine
            )}
          </p>
        </div>
      </div>

      {disabled ? (
        <div className="mt-4 rounded-md border border-card-border bg-muted/40 p-4">
          {agentId ? (
            <>
              <p className="text-sm font-medium">
                {kbState === "unconfigured"
                  ? "Live answers aren't configured on this deployment yet."
                  : "Live answers aren't reachable right now."}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We would rather say that than generate something that looks like an answer. The people are the real
                product anyway — ask them directly.
              </p>
            </>
          ) : (
            // The partner's door is this case: whose room it is, said in the
            // door's own words, rather than one of our agents standing in it.
            <p className="text-sm text-muted-foreground">{door.agentLine}</p>
          )}
        </div>
      ) : null}

      {!hasThread && !disabled ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Start with one of these</p>
          <div className="flex flex-wrap gap-2">
            {visibleStarters.map((starter) => (
              <button
                key={starter}
                type="button"
                data-testid="button-ask-starter"
                onClick={() => void ask(starter)}
                className="rounded-md border border-card-border bg-background px-2.5 py-1.5 text-left text-xs text-muted-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {starter}
              </button>
            ))}
            {starters.length > 4 ? (
              <button type="button" className={BTN_GHOST_SM} onClick={() => setShowAllStarters((v) => !v)}>
                {showAllStarters ? "Fewer" : `${starters.length - 4} more`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasThread ? (
        <div className="mt-4">
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">{asked}</p>
          <div
            ref={scrollRef}
            className="mt-3 max-h-[22rem] overflow-y-auto pr-1 scrollbar-thin"
            aria-live="polite"
            aria-busy={busy}
          >
            {answer ? (
              <div
                className={`prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed ${
                  busy ? CARET : ""
                }`}
              >
                <Suspense fallback={<p className="whitespace-pre-wrap text-sm">{answer}</p>}>
                  <AnswerMarkdown>{answer}</AnswerMarkdown>
                </Suspense>
              </div>
            ) : busy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading the documentation.
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {citations.length > 0 ? (
            <div className="mt-4 border-t border-card-border pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sources</p>
              <div className="flex flex-wrap gap-2">
                {citations.map((citation) => (
                  <a
                    key={`${citation.url}-${citation.title}`}
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-ask-citation"
                    title={citation.snippet ?? citation.url}
                    className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background px-2 py-1 text-xs hover-elevate active-elevate-2"
                  >
                    <span className="font-medium">{citation.title}</span>
                    <span className="text-muted-foreground">{hostOf(citation.url)}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {status === "done" ? (
            <div className="mt-4 rounded-md border border-card-border bg-muted/40 p-3">
              <p className="text-sm">
                Want this implemented on your stack? The agent stops where your codebase starts.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="button-ask-start-workspace"
                  className={BTN_SECONDARY_SM}
                  onClick={() => void startWorkspace()}
                  disabled={startingWorkspace}
                >
                  {startingWorkspace ? <Loader2 className="animate-spin" /> : null}
                  Start a workspace
                  {startingWorkspace ? null : <ArrowRight />}
                </button>
                {/* Asking for a person from inside the answer is the trigger the
                    design cares about most: they read what the agent could do
                    and decided it was not enough. */}
                <a
                  href={BOOK_A_CALL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onAskedForAPerson}
                  className={BTN_GHOST_SM}
                >
                  Book a call
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <label htmlFor="ask-question" className="sr-only">
          {agent ? `Ask ${agent.name} a question` : "Ask a question"}
        </label>
        <textarea
          id="ask-question"
          ref={textareaRef}
          data-testid="input-ask-question"
          rows={3}
          value={question}
          disabled={disabled || busy}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          // Warm the markdown chunk while they type, so the first streamed token
          // never waits on a network round trip for the renderer.
          onFocus={() => void importAnswerMarkdown()}
          placeholder={
            disabled
              ? "Live answers are unavailable on this deployment."
              : "Ask about the pixel, the Conversions API, events, deduplication, consent…"
          }
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {kbState === "loading"
              ? "Checking whether live answers are available…"
              : kbState === "ready" && kbMode === "empty"
                ? "The documentation index is not built here, so answers will not carry citations."
                : "No signup. Answers are pre-sales help, not an engagement."}
          </p>
          <div className="flex items-center gap-2">
            {hasThread && !busy ? (
              <button
                type="button"
                className={BTN_GHOST_SM}
                onClick={() => {
                  setAsked(null);
                  setAnswer("");
                  setCitations([]);
                  setError(null);
                  setStatus("idle");
                  textareaRef.current?.focus();
                }}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              data-testid="button-ask-submit"
              className={BTN_PRIMARY}
              disabled={disabled || busy || question.trim().length === 0}
              onClick={() => void ask(question)}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Send />}
              Ask
              <CornerDownLeft className="opacity-60" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AskWidget;
