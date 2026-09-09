import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { AdGrantGenerateResponse, AdGrantQuotaView, CreateWorkspaceResponse } from "@shared/api";
import { DOOR_BY_ID } from "@shared/doors";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { roomSource } from "@/components/site/home/doorText";
import { ACTION, META, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { Identify } from "@/components/adgrant/Identify";
import { Structure } from "@/components/adgrant/Structure";

const DOOR = DOOR_BY_ID["ad-grants"];
const STORAGE_KEY = "adgrant.generate.v1";

const OPENING =
  "This page produces a Google Ad Grant account structure from the nonprofit's website and shows it here. Nothing is written into a Google Ads account. A person sets up the manager-account link afterwards if you want the structure in the grant account.\n\nWhat does the nonprofit need? A website URL and the country or region the ads should show in is enough.";

const NEED_URL = "I still need the nonprofit website, starting with https://";
const NEED_LOCATION = "Which country or region should the ads show in?";
const RATE_LIMITED = "That is a lot of rooms from one address. Give it a minute.";
const ROOM_FAILED = "A room could not be opened for this generation. Try again.";
const ROOM_OFFLINE = "Network error, so no room was opened.";

const URL_RE = /https?:\/\/[^\s<>"'()]+/i;

interface Draft {
  token: string | null;
  websiteUrl: string | null;
  location: string | null;
}

interface ChatMessage {
  role: "agent" | "visitor";
  text: string;
}

function readDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, websiteUrl: null, location: null };
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      token: typeof parsed.token === "string" ? parsed.token : null,
      websiteUrl: typeof parsed.websiteUrl === "string" ? parsed.websiteUrl : null,
      location: typeof parsed.location === "string" ? parsed.location : null,
    };
  } catch {
    return { token: null, websiteUrl: null, location: null };
  }
}

function writeDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* Private mode: the conversation still works for this visit. */
  }
}

function stripUrlJunk(value: string): string {
  return value.replace(/[.,;:!?)]+$/, "");
}

function extractUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match) return null;
  return stripUrlJunk(match[0]);
}

function remainderAfterUrl(text: string, url: string): string {
  return text
    .replace(url, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(in|at|for|from|of)\s+/i, "")
    .trim();
}

export function Conversation() {
  const fieldId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [draft] = useState(readDraft);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = readDraft();
    const start: ChatMessage[] = [{ role: "agent", text: OPENING }];
    if (saved.websiteUrl && saved.location) {
      start.push({
        role: "agent",
        text: `A structure will be produced from ${saved.websiteUrl} for ads shown in ${saved.location}. It will be shown on this page. Nothing is written into a Google Ads account.`,
      });
    }
    return start;
  });
  const [input, setInput] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(draft.websiteUrl);
  const [location, setLocation] = useState<string | null>(draft.location);
  const [token, setToken] = useState<string | null>(draft.token);
  const [openingRoom, setOpeningRoom] = useState(false);
  const [bound, setBound] = useState(false);
  const [quota, setQuota] = useState<AdGrantQuotaView | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [result, setResult] = useState<AdGrantGenerateResponse | null>(null);

  const ready = Boolean(websiteUrl && location);

  useEffect(() => {
    writeDraft({ token, websiteUrl, location });
  }, [location, token, websiteUrl]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, result]);

  const pushAgent = useCallback((text: string) => {
    setMessages((current) => [...current, { role: "agent", text }]);
  }, []);

  const onBound = useCallback(() => {
    setBound(true);
  }, []);

  const loadQuota = useCallback(async (roomToken: string, signal?: AbortSignal) => {
    try {
      const view = await apiRequest<AdGrantQuotaView>(
        "GET",
        `/api/workspaces/${encodeURIComponent(roomToken)}/adgrant/generations`,
        undefined,
        { signal },
      );
      setQuota(view);
      setQuotaError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setQuota(null);
      setQuotaError(
        error instanceof ApiError && error.message.trim()
          ? error.message.trim()
          : "The remaining count could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    if (!token || !bound) return;
    const ac = new AbortController();
    void loadQuota(token, ac.signal);
    return () => ac.abort();
  }, [bound, loadQuota, token]);

  useEffect(() => {
    if (!ready || token) return;
    let cancelled = false;
    setOpeningRoom(true);
    void (async () => {
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: DOOR.firstAgentId ?? undefined,
            source: { ...roomSource(DOOR.id), entered: "direct" },
          }),
        });
        if (cancelled) return;
        if (!res.ok) {
          pushAgent(res.status === 429 ? RATE_LIMITED : ROOM_FAILED);
          return;
        }
        const state = (await res.json()) as CreateWorkspaceResponse;
        setToken(state.workspace.token);
      } catch {
        if (!cancelled) pushAgent(ROOM_OFFLINE);
      } finally {
        if (!cancelled) setOpeningRoom(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pushAgent, ready, token]);

  const replyTo = useCallback(
    (text: string) => {
      let nextUrl = websiteUrl;
      let nextLocation = location;
      const found = extractUrl(text);
      if (found) {
        nextUrl = found;
        setWebsiteUrl(found);
        const leftover = remainderAfterUrl(text, found);
        if (!nextLocation && leftover.length >= 2) {
          nextLocation = leftover;
          setLocation(leftover);
        }
      } else if (nextUrl && !nextLocation) {
        nextLocation = text.trim();
        setLocation(nextLocation);
      }

      if (!nextUrl) {
        pushAgent(NEED_URL);
        return;
      }
      if (!nextLocation) {
        pushAgent(NEED_LOCATION);
        return;
      }
      pushAgent(
        `A structure will be produced from ${nextUrl} for ads shown in ${nextLocation}. It will be shown on this page. Nothing is written into a Google Ads account.`,
      );
    },
    [location, pushAgent, websiteUrl],
  );

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || generating) return;
    setInput("");
    setMessages((current) => [...current, { role: "visitor", text }]);
    replyTo(text);
  }, [generating, input, replyTo]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const generate = useCallback(async () => {
    if (!token || !websiteUrl || !location || generating) return;
    if (quota && quota.remaining <= 0) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const body = await apiRequest<AdGrantGenerateResponse>(
        "POST",
        `/api/workspaces/${encodeURIComponent(token)}/adgrant/generate`,
        { websiteUrl, location },
      );
      setResult(body);
      setQuota({
        remaining: body.remaining,
        cap: body.cap,
        capReason: body.capReason,
        durable: body.durable,
        durableLine: body.durableLine,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setGenerateError(error.message);
        if (token) void loadQuota(token);
      } else {
        setGenerateError("The structure could not be generated. Try again.");
      }
    } finally {
      setGenerating(false);
    }
  }, [generating, loadQuota, location, quota, token, websiteUrl]);

  return (
    <section id="generate" className="max-w-[46ch]" data-testid="block-adgrant-conversation">
      <p className={META}>The conversation</p>
      <div ref={listRef} className="mt-[var(--s3)] space-y-[var(--s3)]" data-testid="list-adgrant-conversation">
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={`${message.role === "agent" ? READ : READ_MUTED} whitespace-pre-wrap`}
            data-testid={message.role === "agent" ? "text-adgrant-agent" : "text-adgrant-visitor"}
          >
            {message.text}
          </p>
        ))}
      </div>

      {ready && openingRoom && !token ? (
        <p className={`mt-[var(--s4)] ${READ_MUTED}`}>Opening a room for this generation…</p>
      ) : null}

      {ready && token ? (
        <div className="mt-[var(--s4)]">
          <Identify token={token} onBound={onBound} />
        </div>
      ) : null}

      {ready && token && bound ? (
        <div className="mt-[var(--s4)]" data-testid="block-adgrant-quota">
          {quota ? (
            <>
              <p className={READ} data-testid="text-adgrant-remaining">
                {quota.remaining} of {quota.cap} generations remaining.
              </p>
              <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{quota.capReason}</p>
              {quota.durableLine ? <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{quota.durableLine}</p> : null}
              {quota.remaining > 0 ? (
                <button
                  type="button"
                  className={`${ACTION} mt-[var(--s3)]`}
                  onClick={() => void generate()}
                  disabled={generating}
                  data-testid="button-adgrant-generate"
                >
                  {generating ? "Producing the structure…" : "Generate the structure"}
                </button>
              ) : null}
            </>
          ) : quotaError ? (
            <p role="alert" className="type-note text-destructive">
              {quotaError}
            </p>
          ) : (
            <p className={READ_MUTED}>Loading the remaining count…</p>
          )}
        </div>
      ) : null}

      {generateError ? (
        <p role="alert" className="type-note mt-[var(--s3)] text-destructive">
          {generateError}
        </p>
      ) : null}

      {result ? (
        <div className="mt-[var(--s5)]">
          <Structure result={result} />
        </div>
      ) : null}

      {!result ? (
        <form onSubmit={onSubmit} className="mt-[var(--s4)]">
          <label htmlFor={fieldId} className={META}>
            Your reply
          </label>
          <textarea
            id={fieldId}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKey}
            rows={3}
            className="mt-[var(--s2)] w-full resize-y border-0 border-b border-border bg-transparent type-body text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
            placeholder="Website and country, in your own words"
            data-testid="input-adgrant-conversation"
          />
          <button type="submit" className={`${ACTION} mt-[var(--s3)]`} disabled={!input.trim()} data-testid="button-adgrant-send">
            Send
          </button>
        </form>
      ) : null}
    </section>
  );
}
