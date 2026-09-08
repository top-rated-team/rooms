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
  /**
   * `receipt` is an HMAC of the answer text, proving this server wrote it. Hand
   * it back with the text when keeping the conversation and the room shows the
   * exchange instead of re-asking; see server/answer-receipt.ts for why the
   * text alone is not enough.
   */
  | { type: "done"; citations?: Citation[]; receipt?: string }
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

/* ----------------------------- room identity ------------------------------ */
/* Binding is a second fact about a room. The address in /w/:token remains a
 * bearer credential: identifying someone does not turn that token into a
 * password, and a bound room still opens for anyone who has the link. */

/** How identified the visitor in this room is. Anonymous is the default. */
export type RoomAccessLevel = "anonymous" | "signed-in";

export type RoomBindingProvider = "linkedin" | "whatsapp";

/**
 * What the room will say about who it is bound to, and which of the two
 * identification routes can be offered right now. Nothing in this shape is a
 * credential: no token, no phone number, no provider id.
 */
export interface RoomBindingState {
  level: RoomAccessLevel;
  bound: boolean;
  /**
   * True when a visitor has put something of their own into the room — a link,
   * a snippet, a long paste — and the room is not bound yet. That is the only
   * moment this product asks them to identify themselves.
   */
  needsIdentify: boolean;
  provider: RoomBindingProvider | null;
  /** The name they chose to give, or null when the room is not bound. */
  displayName: string | null;
  linkedin: {
    available: boolean;
    /** Set when LinkedIn cannot be offered; the sentence the strip prints. */
    unavailableLine?: string;
  };
  whatsapp: {
    available: boolean;
    /** Set when WhatsApp cannot be offered; the strip keeps LinkedIn and prints this. */
    unavailableLine?: string;
  };
}

/* ---------------------- rented accounts (boosters) ---------------------- */
/* Capacity, not people. The room never receives the API's `name` field: that
 * is the real name of the person whose account is rented. What leaves the
 * server is this shape and only this shape — an allowlist, so a field flygen
 * adds later cannot leak by default. */

/** Operational state as the room is allowed to see it. */
export type BoosterState = "live" | "restricted" | "under_appeal" | "rental_ending" | "unknown";

/**
 * A rented account as the room sees it. Not a member: no avatar, no badge, no
 * presence, no memberKey. The call sign is assigned from the account id and
 * is the only name this object carries.
 */
export interface RoomBooster {
  /** Stable label, e.g. `Booster 03 · Basalt`. */
  callSign: string;
  /** 1-based register number, for order. */
  number: number;
  state: BoosterState;
  /** Proxy country code. Identifies nobody. */
  location: string | null;
  /** ISO timestamp if the API exposes a rental end date; otherwise null. */
  rentalEndsAt: string | null;
}

/**
 * `unavailable` is a different fact from an empty list: we could not ask, so
 * the panel must not read as "no boosters".
 */
export type BoosterInventory =
  | { status: "ok"; boosters: RoomBooster[] }
  | { status: "unavailable" };

/* ----------------------------- thread prices ------------------------------ */
/* One invoice sitting in a thread. Not a plan, not a subscription, not a
 * page of prices. The person doing the work invoices the work; Top-Rated Team
 * invoices its own fee separately; the card says which of those this is. */

/**
 * A price put in a thread, paid or not. The figure is a display string derived
 * from cents on the server, never typed twice. `legalName` is who invoices this
 * amount, as it must appear on paper.
 */
export interface ThreadPrice {
  id: string;
  /** The figure the visitor reads, derived from cents on the server. */
  amount: string;
  currency: string;
  /** What this invoice is for. */
  for: string;
  /**
   * Who sends this invoice. `expert` is the person doing the work. `house` is
   * Top-Rated Team's own fee, billed separately.
   */
  issuer: "expert" | "house";
  /** Legal name on the invoice. Plain selectable text, never a hover. */
  legalName: string;
  status: "open" | "paid";
  /** ISO timestamp when the room recorded payment; null while open. */
  paidAt: string | null;
  channelId: string;
  /** Thread root, when this price sits under a specific turn. */
  parentId: string | null;
}

/* ---------------------- admitted outside-agent seats ---------------------- */
/* Somebody else's agent, let into one thread. The secret that authenticates
 * it is not this shape: that credential is shown once at admission and never
 * stored on the client. The room link is a state handle. It is not a seat
 * credential, and presenting it as one must not work. */

export type SeatMode = "watch" | "suggest" | "act";

export interface SeatRevocation {
  on: string;
  by: string;
  reason: string;
}

/**
 * An admitted outside agent as the room is allowed to see it. The member rail
 * already renders `company`, `mode`, `thread`, `joinedOn`, `expiresOn`,
 * `callsUsed` and `callsPerDay`. `boundParty` is who on our roster is
 * answerable for the admission. The authenticating secret is never in here.
 */
export interface Seat {
  id: string;
  memberKey: string;
  /** @handle in the thread. Not a roster id. */
  handle: string;
  displayName: string;
  company: string;
  mode: SeatMode;
  /** The single thread it was admitted to, as the channel slug. */
  thread: string;
  channelId: string;
  joinedOn: string;
  expiresOn: string;
  callsUsed: number;
  callsPerDay: number;
  /** Display name of the person on our side this seat is bound to. */
  boundParty: string;
  boundPartyKey: string;
  revoked?: SeatRevocation;
}
