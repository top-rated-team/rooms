import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROOMS_STORAGE_KEY, type StoredWorkspace } from "@/lib/rooms";
import type { ClientEvent, KbStatus, ServerEvent, WorkspaceState } from "@shared/api";
import type { Channel, Member, Message, MessageMeta, Task, TaskStatus } from "@shared/schema";

/**
 * The whole workspace session in one hook.
 *
 * Writes go over REST so they stay idempotent and debuggable; the socket is what
 * actually updates the UI. The REST response is *also* fed through the same
 * reducer — it dedupes by id, so a slow or dropped echo never loses a write.
 */

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";
export type WorkspaceStatus = "loading" | "ready" | "not-found" | "error";

export interface TypingSignal {
  memberKey: string;
  channelId: string;
  /** Epoch ms; signals older than TYPING_TTL_MS are dropped. */
  at: number;
}

export type { StoredWorkspace } from "@/lib/rooms";
const STORAGE_KEY = ROOMS_STORAGE_KEY;
const TYPING_TTL_MS = 4_000;
const PING_INTERVAL_MS = 25_000;
const TYPING_THROTTLE_MS = 3_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

/* ------------------------------ local storage ----------------------------- */

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.lastSeen === "string"
  );
}

/** Newest first. Returns [] rather than throwing when storage is unavailable. */
export function listStoredWorkspaces(): StoredWorkspace[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredWorkspace).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  } catch {
    return [];
  }
}

function rememberWorkspace(token: string, name: string): void {
  try {
    const entry: StoredWorkspace = { token, name, lastSeen: new Date().toISOString() };
    const next = [entry, ...listStoredWorkspaces().filter((w) => w.token !== token)].slice(0, 12);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: remembering the link is a convenience, not a requirement.
  }
}

/* -------------------------------- reducer --------------------------------- */

function upsertById<T extends { id: string }>(list: T[], next: T): T[] {
  const index = list.findIndex((item) => item.id === next.id);
  if (index === -1) return [...list, next];
  return list.map((item, i) => (i === index ? next : item));
}

function byOrder<T extends { orderIndex: number; createdAt: Date }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => a.orderIndex - b.orderIndex || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function applyServerEvent(state: WorkspaceState | null, event: ServerEvent): WorkspaceState | null {
  if (event.type === "hello") return event.state;
  if (!state) return state;

  switch (event.type) {
    case "message": {
      if (state.messages.some((m) => m.id === event.message.id)) return state;
      return { ...state, messages: [...state.messages, event.message] };
    }
    case "message_delta": {
      let hit = false;
      const messages = state.messages.map((m) => {
        if (m.id !== event.id) return m;
        hit = true;
        const meta: MessageMeta = { ...(m.meta ?? {}), streaming: true };
        return { ...m, body: m.body + event.delta, meta };
      });
      return hit ? { ...state, messages } : state;
    }
    case "message_done": {
      let hit = false;
      const messages = state.messages.map((m) => {
        if (m.id !== event.id) return m;
        hit = true;
        const meta: MessageMeta = { ...(m.meta ?? {}), streaming: false };
        if (event.citations) meta.citations = event.citations;
        if (event.error) meta.error = event.error;
        return { ...m, body: event.body, meta };
      });
      return hit ? { ...state, messages } : state;
    }
    case "member": {
      // memberKey, not id, is the stable identity across reconnects.
      const index = state.members.findIndex((m) => m.memberKey === event.member.memberKey);
      const members =
        index === -1 ? [...state.members, event.member] : state.members.map((m, i) => (i === index ? event.member : m));
      return { ...state, members };
    }
    case "channel":
      return { ...state, channels: byOrder(upsertById(state.channels, event.channel)) };
    case "task":
      return { ...state, tasks: byOrder(upsertById(state.tasks, event.task)) };
    case "task_removed":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== event.id) };
    case "presence":
      return {
        ...state,
        members: state.members.map((m) => (m.memberKey === event.memberKey ? { ...m, presence: event.presence } : m)),
      };
    default:
      return state;
  }
}

/* --------------------------------- fetch ---------------------------------- */

function parseServerEvent(data: unknown): ServerEvent | null {
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof (parsed as { type?: unknown }).type !== "string") return null;
    return parsed as ServerEvent;
  } catch {
    return null;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // Non-JSON error body.
  }
  return `Request failed (${res.status})`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Network error";
}

/* --------------------------------- hook ----------------------------------- */

export interface SendMessageInput {
  channelId: string;
  body: string;
  mentions?: string[];
}

export interface CreateChannelInput {
  name: string;
  purpose?: string;
  kind?: "project" | "dm" | "agent";
  counterpartKey?: string;
}

export interface CreateTaskInput {
  title: string;
  detail?: string;
  assigneeKey?: string;
  status?: TaskStatus;
}

export interface UpdateTaskInput {
  title?: string;
  detail?: string;
  status?: TaskStatus;
  assigneeKey?: string | null;
}

export interface InviteExpertInput {
  memberKey: string;
  note?: string;
  email?: string;
  name?: string;
}

interface InviteResponse {
  member: Member;
}

export interface UseWorkspace {
  state: WorkspaceState | null;
  status: WorkspaceStatus;
  connection: ConnectionStatus;
  error: string | null;
  actionError: string | null;
  typing: TypingSignal[];
  kb: KbStatus | null;
  sending: boolean;
  sendMessage: (input: SendMessageInput) => Promise<Message | null>;
  createChannel: (input: CreateChannelInput) => Promise<Channel | null>;
  createTask: (input: CreateTaskInput) => Promise<Task | null>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<Task | null>;
  inviteExpert: (input: InviteExpertInput) => Promise<Member | null>;
  notifyTyping: (channelId: string) => void;
  clearActionError: () => void;
}

export function useWorkspace(token: string): UseWorkspace {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>("loading");
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [typing, setTyping] = useState<TypingSignal[]>([]);
  const [kb, setKb] = useState<KbStatus | null>(null);
  const [sending, setSending] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<WorkspaceStatus>("loading");
  const lastTypingSentRef = useRef(0);

  const base = useMemo(() => `/api/workspaces/${encodeURIComponent(token)}`, [token]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /* ------------------------- state + socket lifecycle ---------------------- */

  useEffect(() => {
    if (!token) {
      setStatus("not-found");
      setConnection("closed");
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let attempt = 0;

    setStatus("loading");
    setConnection("connecting");
    setState(null);
    setError(null);

    const loadState = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/workspaces/${encodeURIComponent(token)}`, {
          headers: { accept: "application/json" },
        });
        if (disposed) return;
        if (res.status === 404) {
          statusRef.current = "not-found";
          setStatus("not-found");
          return;
        }
        if (!res.ok) {
          const detail = await readError(res);
          if (disposed) return;
          setError(detail);
          setStatus((prev) => (prev === "ready" ? prev : "error"));
          return;
        }
        const data = (await res.json()) as WorkspaceState;
        if (disposed) return;
        setState(data);
        setError(null);
        statusRef.current = "ready";
        setStatus("ready");
        rememberWorkspace(data.workspace.token, data.workspace.name);
      } catch (err) {
        if (disposed) return;
        setError(messageOf(err));
        // A failed refetch during a reconnect must not blank an already-loaded workspace.
        setStatus((prev) => (prev === "ready" ? prev : "error"));
      }
    };

    const openSocket = (): void => {
      if (disposed) return;
      if (statusRef.current === "not-found") {
        setConnection("closed");
        return;
      }
      setConnection(attempt === 0 ? "connecting" : "reconnecting");

      const wsUrl = `${window.location.origin.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      socket = ws;
      socketRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnection("open");
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const ping: ClientEvent = { type: "ping" };
            ws.send(JSON.stringify(ping));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (raw: MessageEvent<unknown>) => {
        if (disposed) return;
        const event = parseServerEvent(raw.data);
        if (!event) return;

        if (event.type === "typing") {
          setTyping((prev) => [
            ...prev.filter((t) => !(t.memberKey === event.memberKey && t.channelId === event.channelId)),
            { memberKey: event.memberKey, channelId: event.channelId, at: Date.now() },
          ]);
          return;
        }
        if (event.type === "error") {
          setError(event.message);
          return;
        }
        setState((prev) => applyServerEvent(prev, event));
        if (event.type === "hello") {
          setError(null);
          statusRef.current = "ready";
          setStatus("ready");
          rememberWorkspace(event.state.workspace.token, event.state.workspace.name);
        }
      };

      ws.onclose = () => {
        if (pingTimer !== undefined) {
          window.clearInterval(pingTimer);
          pingTimer = undefined;
        }
        if (socketRef.current === ws) socketRef.current = null;
        if (disposed) return;
        if (statusRef.current === "not-found") {
          setConnection("closed");
          return;
        }
        setConnection("reconnecting");
        const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
        attempt += 1;
        reconnectTimer = window.setTimeout(() => {
          // Refetch first: anything that happened while we were offline is only in REST.
          void loadState();
          openSocket();
        }, delay);
      };

      ws.onerror = () => {
        // `close` always follows; reconnection is handled there.
      };
    };

    void loadState();
    openSocket();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (pingTimer !== undefined) window.clearInterval(pingTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, [token]);

  /* ---------------------------- transient typing --------------------------- */

  useEffect(() => {
    if (typing.length === 0) return;
    const timer = window.setInterval(() => {
      setTyping((prev) => prev.filter((t) => Date.now() - t.at < TYPING_TTL_MS));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [typing.length]);

  /* ------------------------------- kb status ------------------------------- */

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const res = await fetch("/api/kb/status", { headers: { accept: "application/json" } });
        if (!res.ok || disposed) return;
        const data = (await res.json()) as KbStatus;
        if (!disposed) setKb(data);
      } catch {
        // Status is decoration; the agents themselves say what they cannot do.
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  /* -------------------------------- actions -------------------------------- */

  const request = useCallback(async function request<T>(path: string, init: RequestInit): Promise<T | null> {
    try {
      const res = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", accept: "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        setActionError(await readError(res));
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      setActionError(messageOf(err));
      return null;
    }
  }, []);

  const sendMessage = useCallback(
    async (input: SendMessageInput): Promise<Message | null> => {
      setActionError(null);
      setSending(true);
      try {
        const message = await request<Message>(`${base}/messages`, {
          method: "POST",
          body: JSON.stringify(input),
        });
        if (message) setState((prev) => applyServerEvent(prev, { type: "message", message }));
        return message;
      } finally {
        setSending(false);
      }
    },
    [base, request],
  );

  const createChannel = useCallback(
    async (input: CreateChannelInput): Promise<Channel | null> => {
      setActionError(null);
      const channel = await request<Channel>(`${base}/channels`, { method: "POST", body: JSON.stringify(input) });
      if (channel) setState((prev) => applyServerEvent(prev, { type: "channel", channel }));
      return channel;
    },
    [base, request],
  );

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task | null> => {
      setActionError(null);
      const task = await request<Task>(`${base}/tasks`, { method: "POST", body: JSON.stringify(input) });
      if (task) setState((prev) => applyServerEvent(prev, { type: "task", task }));
      return task;
    },
    [base, request],
  );

  const updateTask = useCallback(
    async (id: string, input: UpdateTaskInput): Promise<Task | null> => {
      setActionError(null);
      const task = await request<Task>(`${base}/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      if (task) setState((prev) => applyServerEvent(prev, { type: "task", task }));
      return task;
    },
    [base, request],
  );

  const inviteExpert = useCallback(
    async (input: InviteExpertInput): Promise<Member | null> => {
      setActionError(null);
      const result = await request<InviteResponse>(`${base}/invite`, { method: "POST", body: JSON.stringify(input) });
      if (result?.member) setState((prev) => applyServerEvent(prev, { type: "member", member: result.member }));
      return result?.member ?? null;
    },
    [base, request],
  );

  const notifyTyping = useCallback((channelId: string): void => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    const event: ClientEvent = { type: "typing", channelId };
    ws.send(JSON.stringify(event));
  }, []);

  const clearActionError = useCallback(() => setActionError(null), []);

  return {
    state,
    status,
    connection,
    error,
    actionError,
    typing,
    kb,
    sending,
    sendMessage,
    createChannel,
    createTask,
    updateTask,
    inviteExpert,
    notifyTyping,
    clearActionError,
  };
}
