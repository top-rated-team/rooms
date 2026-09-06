import type { Channel, Citation, Member, Message, Task, Workspace } from "./schema";

/** Everything the workspace UI needs in one payload. */
export interface WorkspaceState {
  /**
   * `source` is the visitor's own attribution row — utm parameters, referrer,
   * and the door they came through. The room reads `source.door` to know whose
   * name, terms and invoice line to print in its footer, so it has to travel
   * with the state rather than staying on the server.
   */
  workspace: Pick<Workspace, "id" | "token" | "name" | "visitorName" | "visitorEmail" | "visitorCompany" | "visitorWebsite" | "source" | "createdAt">;
  channels: Channel[];
  members: Member[];
  messages: Message[];
  tasks: Task[];
}

export interface CreateWorkspaceResponse extends WorkspaceState {
  /** Absolute URL the visitor must keep in order to get back in. */
  url: string;
}

/* --------------------------- WebSocket protocol --------------------------- */
/* Client connects to /ws?token=<workspace token>. Server pushes everything;
 * the client only ever sends `ping` and `typing`. All writes go over REST so
 * they stay idempotent and debuggable. */

export type ServerEvent =
  | { type: "hello"; state: WorkspaceState }
  | { type: "message"; message: Message }
  /** Incremental agent output. Append `delta` to the message with `id`. */
  | { type: "message_delta"; id: string; channelId: string; delta: string }
  /** Agent finished: replace the body, attach citations, clear streaming. */
  | { type: "message_done"; id: string; channelId: string; body: string; citations?: Citation[]; error?: string }
  | { type: "member"; member: Member }
  | { type: "task"; task: Task }
  | { type: "task_removed"; id: string }
  | { type: "channel"; channel: Channel }
  | { type: "typing"; memberKey: string; channelId: string }
  | { type: "presence"; memberKey: string; presence: "online" | "away" | "offline" }
  | { type: "error"; message: string };

export type ClientEvent =
  | { type: "ping" }
  | { type: "typing"; channelId: string };

/* ------------------------- Public /api/ask stream ------------------------- */
/* Server-sent events for the landing-page widget, which has no workspace yet.
 * Each SSE `data:` line is one of these JSON objects. */

export type AskEvent =
  | { type: "delta"; delta: string }
  | { type: "done"; citations?: Citation[] }
  | { type: "error"; message: string };

export interface KbStatus {
  ready: boolean;
  /** "embeddings" when semantic search is live, "lexical" when the API key is
   * missing and we fall back to keyword scoring, "empty" when unbuilt. */
  mode: "embeddings" | "lexical" | "empty";
  documents: number;
  chunks: number;
  builtAt: string | null;
  /** True when OPENAI_API_KEY is configured, i.e. agents can actually answer. */
  llmReady: boolean;
}
