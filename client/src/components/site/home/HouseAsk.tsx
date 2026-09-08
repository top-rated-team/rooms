import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "wouter";

import type { AskEvent, CreateWorkspaceResponse, KbStatus } from "@shared/api";
import type { Citation } from "@shared/schema";
import { BOOK_A_CALL_URL } from "@shared/roster";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import { ANSWERING_DOORS, roomSource, shortName } from "@/components/site/home/doorText";
import { useBooking } from "@/hooks/use-booking";

const importAnswerMarkdown = () => import("@/components/site/AnswerMarkdown");
const AnswerMarkdown = lazy(importAnswerMarkdown);
const LeadDialog = lazy(() => import("@/components/site/LeadDialog").then((m) => ({ default: m.LeadDialog })));

/* ---------------------------------------------------------------------------
 * THE HOUSE ASK
 *
 * The home page is not a door. A question asked here does not know which
 * agent's corpus it belongs to, and guessing would cite the wrong
 * documentation. This panel routes first, says which door it picked and why,
 * and only then lets that door's agent answer. When it cannot tell, it offers
 * two or three live doors and waits. When the question is the price or a
 * person, it points at the page rather than at a model.
 * ------------------------------------------------------------------------- */

type KbState = "loading" | "ready" | "unconfigured" | "unreachable";
type AskStatus = "idle" | "streaming" | "done" | "error";

type RouteChoice = { doorId: string; label: string };

type RouteResult =
  | { kind: "door"; doorId: string; agentId: string | null; reason: string }
  | { kind: "choices"; reason: string; choices: RouteChoice[] }
  | { kind: "page"; page: "pricing" | "contact"; reason: string; href?: string };

type AskStreamEvent = AskEvent | { type: "status"; stage: "retrieving" | "slow"; message: string };

const CONNECTING_LABEL = "Connecting to the agent.";
const RATE_LIMITED = "Too many questions from this address for the moment. Give it a minute, or talk to a person below.";
const UNREACHABLE = "The agent could not be reached. The people below are still available.";
const OFFLINE = "Network error, so nothing was sent. The people below are still available.";
const ROOM_RATE_LIMITED = "That is a lot of rooms from one address. Give it a minute, or ask the question here instead.";
const ROOM_FAILED = "The room could not be opened. The answer above is unaffected — ask again here, or write to us.";
const ROOM_OFFLINE = "Network error, so no room was opened. The answer above is unaffected.";

const EXAMPLES = ANSWERING_DOORS.slice(0, 3).map((door) => door.starters[0]).filter(Boolean);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function HouseAsk() {
  const [, navigate] = useLocation();
  const booking = useBooking();

  const [kbState, setKbState] = useState<KbState>("loading");
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [status, setStatus] = useState<AskStatus>("idle");
  const [stage, setStage] = useState(CONNECTING_LABEL);
  const [error, setError] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kb/status", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as KbStatus;
        setKbState(body.llmReady ? "ready" : "unconfigured");
      })
      .catch(() => {
        if (!controller.signal.aborted) setKbState("unreachable");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (status !== "streaming") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [answer, status]);

  const routedDoorId = route?.kind === "door" ? route.doorId : null;
  const routedAgentId = route?.kind === "door" ? route.agentId : null;
  const routedDoor = routedDoorId ? DOOR_BY_ID[routedDoorId] : undefined;

  /**
   * Open a room. `carry` says whether the conversation on screen comes with it.
   *
   * IT NO LONGER NEEDS A ROUTED DOOR, and that is the whole change. It used to
   * return immediately unless a question had already been asked and routed,
   * which made asking the toll for getting in — the owner: "нет по прежнему на
   * єтой секции именно кнопку войти в комнату, без того чтобі сначала играться
   * с чат ботом и вопросами". He is right, and it was the wrong way round in a
   * second way too: the room is the part of this that nobody else sells, so
   * putting a chat bot in front of it hid the product behind the demo.
   *
   * With no door routed it opens on the default agent — the server resolves
   * that from DEFAULT_AGENT_ID when agentId is absent — and the room's own
   * roster is editable from inside, so arriving on a default costs nothing.
   * `entered` records which way somebody came in, because "opened a room
   * without asking anything" and "kept an answer" are different intents and
   * the lead inbox should not have to guess.
   */
  const openRoom = useCallback(async (options?: { carry?: boolean }) => {
    const carry = options?.carry ?? false;
    if (carry && !routedDoor) return;

    setOpening(true);
    setRoomError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: carry ? (routedAgentId ?? undefined) : undefined,
          firstMessage: carry ? (asked ?? undefined) : undefined,
          firstAnswer: carry && receipt && answer && status === "done" ? { body: answer, receipt } : undefined,
          source: {
            ...roomSource(routedDoor?.id ?? DEFAULT_DOOR_ID),
            entered: carry ? "kept" : "direct",
          },
        }),
      });
      if (!res.ok) {
        setRoomError(res.status === 429 ? ROOM_RATE_LIMITED : ROOM_FAILED);
        return;
      }
      const state = (await res.json()) as CreateWorkspaceResponse;
      navigate(`/w/${state.workspace.token}`);
    } catch {
      setRoomError(ROOM_OFFLINE);
    } finally {
      setOpening(false);
    }
  }, [answer, asked, navigate, receipt, routedAgentId, routedDoor, status]);

  const streamAsk = useCallback(async (text: string, agentId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnswer("");
    setReceipt(null);
    setCitations([]);
    setError(null);
    setStatus("streaming");
    setStage(CONNECTING_LABEL);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, agentId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setStatus("error");
        setError(res.status === 429 ? RATE_LIMITED : UNREACHABLE);
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
          let event: AskStreamEvent;
          try {
            event = JSON.parse(payload) as AskStreamEvent;
          } catch {
            continue;
          }
          if (event.type === "status") {
            setStage(event.message);
          } else if (event.type === "delta") {
            setAnswer((prev) => prev + event.delta);
          } else if (event.type === "done") {
            setCitations(event.citations ?? []);
            setReceipt(event.receipt ?? null);
            setStatus("done");
            finished = true;
          } else if (event.type === "error") {
            setError(event.message);
            setStatus("error");
            finished = true;
          }
        }
      }
      if (finished) await reader.cancel().catch(() => undefined);
      if (!finished) {
        setError("The answer stopped early. Ask again, or put it to a person below.");
        setStatus("error");
      }
    } catch {
      if (controller.signal.aborted) return;
      setError(OFFLINE);
      setStatus("error");
    }
  }, []);

  const submit = useCallback(
    async (raw: string, pickedDoorId?: string) => {
      const text = raw.trim();
      if (!text) return;

      abortRef.current?.abort();
      setAsked(text);
      setQuestion("");
      setAnswer("");
      setReceipt(null);
      setCitations([]);
      setError(null);
      setRoomError(null);
      setStatus("idle");
      setRoute(null);
      setRouting(true);

      try {
        const res = await fetch("/api/route-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, doorId: pickedDoorId }),
        });
        if (!res.ok) {
          setRouting(false);
          setError(res.status === 429 ? RATE_LIMITED : UNREACHABLE);
          setStatus("error");
          return;
        }
        const result = (await res.json()) as RouteResult;
        setRoute(result);
        setRouting(false);

        if (result.kind !== "door") return;
        if (!result.agentId) return;
        if (kbState === "unconfigured" || kbState === "unreachable") return;
        await streamAsk(text, result.agentId);
      } catch {
        setRouting(false);
        setError(OFFLINE);
        setStatus("error");
      }
    },
    [kbState, streamAsk],
  );

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(question);
    }
  }

  function clearThread() {
    abortRef.current?.abort();
    setAsked(null);
    setRoute(null);
    setAnswer("");
    setReceipt(null);
    setCitations([]);
    setError(null);
    setRoomError(null);
    setStatus("idle");
    setRouting(false);
    textareaRef.current?.focus();
  }

  const busy = routing || status === "streaming";
  const hasThread = asked !== null;
  const showUnconfigured =
    route?.kind === "door" &&
    Boolean(route.agentId) &&
    (kbState === "unconfigured" || kbState === "unreachable") &&
    status === "idle" &&
    !routing;

  return (
    <section
      id="panel"
      data-testid="section-house-ask"
      className="mt-[var(--s5)] scroll-mt-[var(--s4)] bg-card py-[var(--s5)] lg:mt-[var(--s6)]"
    >
      <div className="mx-auto grid max-w-[var(--page)] grid-cols-1 items-start gap-[var(--s4)] px-[var(--s3)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]">
        <div>
          <h2 className="type-body m-0 font-display font-medium">Ask before you pick a door.</h2>
          <p className="type-body mt-[var(--s2)]">
            You do not have to know which service this is. Ask, and this page will say which agent is answering, or
            ask you to pick if it cannot tell.
          </p>
        </div>

        <div>
          {!hasThread && EXAMPLES.length > 0 ? (
            <div className="mb-[var(--s3)]">
              <p className="type-meta mb-[var(--s2)] text-muted-foreground">Start with one of these</p>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  data-testid="button-house-ask-example"
                  onClick={() => void submit(example)}
                  className="block w-full border-t border-border py-[var(--s2)] text-left type-body last:border-b hover:text-primary"
                >
                  {example}
                </button>
              ))}
            </div>
          ) : null}

          {hasThread ? (
            <div>
              <p className="type-body m-0 font-medium">{asked}</p>

              {routing ? (
                <p className="type-note mt-[var(--s2)] text-muted-foreground">Looking at which service this is.</p>
              ) : null}

              {route ? (
                <p className="type-note mt-[var(--s2)] text-muted-foreground" data-testid="text-house-ask-route">
                  {route.reason}
                </p>
              ) : null}

              {route?.kind === "choices" ? (
                <div className="mt-[var(--s3)]" data-testid="list-house-ask-choices">
                  {route.choices.map((choice) => (
                    <button
                      key={choice.doorId}
                      type="button"
                      data-testid="button-house-ask-choice"
                      onClick={() => void submit(asked ?? "", choice.doorId)}
                      className="block w-full border-t border-border py-[var(--s2)] text-left type-body last:border-b hover:text-primary"
                    >
                      {shortName(choice.label)}
                    </button>
                  ))}
                </div>
              ) : null}

              {route?.kind === "page" && route.page === "pricing" ? (
                <p className="type-body mt-[var(--s3)]">
                  <Link href="/pricing" data-testid="link-house-ask-pricing" className="draw draw-on">
                    Open the pricing page
                  </Link>
                </p>
              ) : null}

              {route?.kind === "page" && route.page === "contact" ? (
                <p className="type-meta mt-[var(--s3)] flex flex-wrap items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)]">
                  <a
                    href={BOOK_A_CALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-house-ask-book-a-call"
                    {...booking}
                    className="border-b border-primary pb-[var(--s1)] font-medium text-primary hover:border-foreground hover:text-foreground"
                  >
                    Book a call
                  </a>
                  <button
                    type="button"
                    onClick={() => setMessageOpen(true)}
                    data-testid="button-house-ask-leave-a-message"
                    className="border-b border-border pb-[var(--s1)] text-muted-foreground hover:border-foreground hover:text-foreground"
                  >
                    Leave a message
                  </button>
                </p>
              ) : null}

              {route?.kind === "door" && !route.agentId && routedDoor ? (
                <p className="type-body mt-[var(--s3)]">
                  <Link href={routedDoor.path} data-testid="link-house-ask-door" className="draw draw-on">
                    Open {shortName(routedDoor.headline)}
                  </Link>
                </p>
              ) : null}

              {showUnconfigured ? (
                <div className="mt-[var(--s3)] border-t border-border pt-[var(--s3)]">
                  <p className="type-body m-0 font-medium">
                    {kbState === "unconfigured"
                      ? "Live answers aren't configured on this deployment yet."
                      : "Live answers aren't reachable right now."}
                  </p>
                  <p className="type-body mt-[var(--s2)] text-muted-foreground">
                    We would rather say that than generate something that looks like an answer. The people are the real
                    product anyway — ask them directly.
                  </p>
                </div>
              ) : null}

              {route?.kind === "door" && route.agentId && (answer || status === "streaming" || error) ? (
                <div
                  ref={scrollRef}
                  className="mt-[var(--s3)] max-h-[22rem] overflow-y-auto pr-1"
                  aria-live="polite"
                  aria-busy={status === "streaming"}
                >
                  {answer ? (
                    <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed">
                      <Suspense fallback={<p className="type-body whitespace-pre-wrap">{answer}</p>}>
                        <AnswerMarkdown>{answer}</AnswerMarkdown>
                      </Suspense>
                    </div>
                  ) : status === "streaming" ? (
                    <p className="type-note text-muted-foreground">{stage}</p>
                  ) : null}

                  {error ? (
                    <p role="alert" className="type-note mt-[var(--s2)] text-destructive">
                      {error}
                    </p>
                  ) : null}

                  {citations.length > 0 ? (
                    <div className="mt-[var(--s3)] border-t border-border pt-[var(--s2)]">
                      <p className="type-meta mb-[var(--s2)] text-muted-foreground">Sources</p>
                      {citations.map((citation) => (
                        <a
                          key={`${citation.url}-${citation.title}`}
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="link-house-ask-citation"
                          title={citation.snippet ?? citation.url}
                          className="mr-[var(--s2)] inline-flex items-baseline gap-[var(--s1)] type-note hover:text-foreground"
                        >
                          <span className="font-medium">{citation.title}</span>
                          <span className="text-muted-foreground">{hostOf(citation.url)}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error && route?.kind !== "door" ? (
                <p role="alert" className="type-note mt-[var(--s2)] text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={hasThread ? "mt-[var(--s4)]" : undefined}>
            <label htmlFor="house-ask-question" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="house-ask-question"
              ref={textareaRef}
              data-testid="input-house-ask-question"
              rows={3}
              value={question}
              disabled={busy}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => void importAnswerMarkdown()}
              placeholder="Ask about the work. You do not have to name the service."
              className="w-full resize-y border-0 border-b border-foreground bg-transparent px-0 py-2 type-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
            />
            <div className="mt-[var(--s3)] flex flex-wrap items-center justify-between gap-[var(--s2)]">
              <p className="type-note m-0 text-muted-foreground">No signup, and Enter sends.</p>
              <div className="flex items-baseline gap-[var(--s3)]">
                {hasThread && !busy ? (
                  <button
                    type="button"
                    data-testid="button-house-ask-clear"
                    onClick={clearThread}
                    className="type-meta text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="button-house-ask-submit"
                  disabled={busy || question.trim().length === 0}
                  onClick={() => void submit(question)}
                  className="border-b border-primary pb-[var(--s1)] type-meta font-medium text-primary hover:border-foreground hover:text-foreground disabled:opacity-50"
                >
                  {busy ? "Asking" : "Ask"}
                </button>
              </div>
            </div>
          </div>

          {hasThread && route?.kind === "door" && route.agentId ? (
            <p className="type-note mt-[var(--s3)] text-muted-foreground" data-testid="text-house-ask-keep">
              <span className="font-medium text-foreground">Nothing is saved yet.</span> Close this tab and it is gone.{" "}
              <button
                type="button"
                data-testid="button-house-ask-keep"
                onClick={() => void openRoom({ carry: true })}
                disabled={opening}
                className="draw draw-on font-medium text-foreground disabled:opacity-50"
              >
                Keep this conversation
              </button>{" "}
              and it becomes a room instead: an address of its own, the question already in it, and somewhere to put a
              person.
            </p>
          ) : (
            <p className="type-note mt-[var(--s3)] text-muted-foreground">
              Nothing is saved. Close this tab and it is gone.
            </p>
          )}

          {/*
            THE DOOR THAT IS NOT A QUESTION.
            
            This block is on the page unconditionally, and it is the second half
            of the same correction as openRoom above: the sentence that used to
            sit here said a conversation "can become a room after you ask",
            which told a reader the only way in was through the chat. It is not,
            and it never was — the API takes no question.
            
            It is a border and a heading rather than a link in a paragraph
            because it is the more valuable of the two actions in this section.
            The panel demonstrates; the room is the thing being sold.
          */}
          <div className="mt-[var(--s4)] border-t border-border pt-[var(--s3)]">
            <p className="type-body m-0 font-display font-medium">Or go straight in.</p>
            <p className="type-body mt-[var(--s2)]">
              A room of your own with no question first: its own address, an agent and our people already in it, and
              the work written out as a checklist. No signup — the link in your browser is the account.
            </p>
            <button
              type="button"
              data-testid="button-house-open-room"
              onClick={() => void openRoom()}
              disabled={opening}
              className="mt-[var(--s3)] border-b border-primary pb-[var(--s1)] type-meta font-medium text-primary hover:border-foreground hover:text-foreground disabled:opacity-50"
            >
              {opening ? "Opening a room…" : "Open a room"}
            </button>
          </div>

          {roomError ? (
            <p role="alert" className="type-note mt-[var(--s1)] text-destructive">
              {roomError}
            </p>
          ) : null}
        </div>
      </div>

      {messageOpen ? (
        <Suspense fallback={null}>
          <LeadDialog open={messageOpen} onOpenChange={setMessageOpen} prefill={null} />
        </Suspense>
      ) : null}
    </section>
  );
}

export default HouseAsk;
