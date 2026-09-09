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
  /**
   * False when this deployment is holding rooms in process memory, which is
   * what happens with no DATABASE_URL: the next restart or deploy loses every
   * room and every address handed out with it.
   *
   * It travels with the state because the ROOM is what has to say it. The boot
   * log has always said it and nobody reads a boot log — meanwhile the room
   * tells its visitor the link is the whole account, which is a promise the
   * deployment cannot keep in that mode.
   */
  durable: boolean;
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
  | { type: "error"; message: string }
  /** The owner renamed the room. Other people in it see the new name without reloading. */
  | { type: "workspace"; workspace: { name: string } };

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

/**
 * Whether this room has an owner, and whether a number on it is a note or a
 * proof. A typed number is never the same fact as a number that messaged us.
 */
export interface RoomClaimState {
  bound: boolean;
  /** True only when a claim exists. An unclaimed room has no owner, so it cannot be renamed. */
  canRename: boolean;
  owner: {
    provider: RoomBindingProvider;
    displayName: string;
  } | null;
  /**
   * A number someone typed. Shown as a note. Null when none has been added.
   * A WhatsApp proof is `owner.provider === "whatsapp"` and never appears here.
   */
  whatsappNote: string | null;
}

export interface RenameWorkspaceInput {
  name: string;
}

export interface ClaimNoteInput {
  number: string;
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

/* ------------------------- thread approval cards -------------------------- */
/* One proposed change sitting in a thread. A person approves or declines it;
 * the room keeps who and when. Nothing here writes to an ad account — that
 * write is later work. The shape is the Top-Voice proposal card: a heading
 * that says New or Edit, a before and after per field, and two buttons. */

export type ThreadApprovalStatus = "pending" | "approved" | "declined";

/**
 * One field that would change. `from` is what is there now — including null
 * or "" when the field is empty today, which the card prints as an em-dash.
 * Omitting `from` is not the same as empty: that is a missing current value.
 */
export interface ApprovalChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * A proposed change in a thread, approved or not. `heading` is derived from
 * `creates`, `kind` and `targetName` on the server, never typed twice.
 * `decidedBy` / `decidedAt` are who pressed the button and when; both are
 * null while pending. The same object is what a later visit reads.
 */
export interface ThreadApproval {
  id: string;
  /** The line the visitor reads first: "New campaign «Spring»" or "Edit campaign «Spring»". */
  heading: string;
  /** Why this was proposed, in one sentence. */
  summary: string;
  /** What kind of thing this acts on, in the buyer's words — "campaign", "ad group". */
  kind: string;
  /** True when applying this would create something, rather than edit what exists. */
  creates: boolean;
  /** The named thing it acts on, or the name it would get. Null when unnamed. */
  targetName: string | null;
  changes: ApprovalChange[];
  status: ThreadApprovalStatus;
  /** Who put this in the thread — an agent or a person, as a display name. */
  proposedBy: string;
  proposedAt: string;
  /** Who approved or declined; null while pending. */
  decidedBy: string | null;
  /** ISO timestamp of the decision; null while pending. */
  decidedAt: string | null;
  channelId: string;
  /** Thread root, when this sits under a specific turn. */
  parentId: string | null;
}

/* ----------------------------- room bridges ------------------------------- */
/* One WhatsApp chat, one ChatWoot conversation, one Slack channel or one
 * ClickUp list, connected to a room. Secrets and the room token are not in
 * this shape. A restart forgets the connections; the panel says so. */

export type BridgeKind = "whatsapp" | "chatwoot" | "slack" | "clickup";

/**
 * A bridge as the room is allowed to see it. The destination is a label the
 * visitor typed, never a chat id, never a webhook URL, never the room token.
 */
export interface RoomBridge {
  kind: BridgeKind;
  connected: boolean;
  /** What it writes into, in the visitor's words. */
  targetLabel: string;
  connectedAt: string | null;
}

/* ------------------------------- booking ---------------------------------- */
/* Fixed in docs/specs/unipile-rooms-and-booking.md §3 so booking-server and
 * booking-dialog can build in parallel. Slots are local wall-clock times in
 * `timezone`. email is the only optional field on the create body. */

export interface BookingDay {
  date: string;
  slots: string[];
}

export interface BookingSlotsResponse {
  timezone: string;
  slotMinutes: number;
  days: BookingDay[];
}

export interface CreateBookingRequest {
  date: string;
  time: string;
  /** The only optional field. With it, Google emails an invite. Without it the event is still created and `invited` is false. */
  email?: string;
  name: string;
  topic: string;
}

export interface CreateBookingResponse {
  booked: true;
  startsAt: string;
  timezone: string;
  meetUrl: string | null;
  invited: boolean;
  whatsapp: { url: string; code: string };
}

/**
 * POST /api/booking with no address, on a house host with WhatsApp configured.
 * A hold is not a booking: nothing is on the calendar until WhatsApp proves it.
 * `booked` is the literal false so nothing can call this a booking by accident.
 */
export interface HoldBookingResponse {
  booked: false;
  held: true;
  startsAt: string;
  timezone: string;
  meetUrl: null;
  invited: false;
  whatsapp: { url: string; code: string };
  expiresAt: string;
}

export type PostBookingResponse = CreateBookingResponse | HoldBookingResponse;

export interface BookingConflictResponse {
  error: string;
  days: BookingDay[];
}

/**
 * GET /api/booking/confirmed reports that the booking exists, not that a
 * message arrived. `expired` is set when a hold ran out unproven — nothing
 * was booked. Meet and start fields are present only once the event exists.
 */
export type BookingConfirmedResponse =
  | {
      confirmed: true;
      at: string;
      meetUrl?: string | null;
      startsAt?: string;
      timezone?: string;
      invited?: boolean;
    }
  | { confirmed: false; expired?: boolean };

/**
 * GET /api/booking/linkedin — whether the button can work, and after the
 * callback, what the popup learns about the signed-in booker.
 *
 * `email` is null when LinkedIn omitted the optional claim. That is a booked
 * call without an invite, not an error: the event is created with
 * attendees: [] and notify: false, the same write as no address at all.
 *
 * `profileUrl` is null when userinfo did not carry a LinkedIn profile page.
 * It is never built from a name.
 */
export type BookingLinkedInAvailability =
  | { available: true }
  | { available: false; unavailableLine: string };

export interface BookingLinkedInBooker {
  name: string | null;
  email: string | null;
  profileUrl: string | null;
}

export type BookingLinkedInResult =
  | {
      booked: true;
      startsAt: string;
      timezone: string;
      meetUrl: string | null;
      invited: boolean;
    }
  | {
      booked: false;
      invited: false;
      error?: string;
      days?: BookingDay[];
    };

export interface BookingLinkedInSession {
  draft: { date: string; time: string; name: string; topic: string };
  booker: BookingLinkedInBooker;
  result: BookingLinkedInResult;
}

/** Query the callback puts on the return URL so the popup can restore the pick. */
export const BOOKING_LINKEDIN_SESSION_QUERY = "booking_signin";

/* -------------------- Ad Grant structure (generate, do not upload) -------------------- */
/* Product A in docs/specs/adgrant-and-dev-agents.md section 2: a policy-checked
 * account structure the nonprofit can see and take to Google Ads Editor. Nothing
 * here is a write into a Google Ads account. There is no customer id. */

export type AdGrantBidStrategy =
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "TARGET_CPA"
  | "TARGET_ROAS"
  | "MAXIMIZE_CLICKS"
  | "MANUAL_CPC";

export type AdGrantKeywordMatchType = "EXACT" | "PHRASE" | "BROAD";

export interface AdGrantKeyword {
  text: string;
  matchType: AdGrantKeywordMatchType;
}

export interface AdGrantResponsiveSearchAd {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1?: string;
  path2?: string;
}

export interface AdGrantAdGroup {
  name: string;
  keywords: AdGrantKeyword[];
  ads: AdGrantResponsiveSearchAd[];
  /** Only meaningful when the campaign uses MANUAL_CPC. */
  maxCpcUsd?: number;
}

export interface AdGrantSitelink {
  text: string;
  finalUrl: string;
  description1?: string;
  description2?: string;
}

export interface AdGrantCampaign {
  name: string;
  dailyBudgetUsd: number;
  bidStrategy: AdGrantBidStrategy;
  /** Geo-targets. Empty is a policy failure. */
  locations: string[];
  language: string;
  adGroups: AdGrantAdGroup[];
  sitelinks: AdGrantSitelink[];
}

export interface AdGrantAccountStructure {
  organisationName: string;
  /** Host ads may land on, no scheme. www and the apex are treated as one domain. */
  authorisedDomain: string;
  dailyBudgetUsd: number;
  /**
   * Accounts created on or after 22 April 2019 must use conversion-based Smart
   * bidding. A structure we generate is always in that set.
   */
  smartBiddingRequired: boolean;
  campaigns: AdGrantCampaign[];
}

export interface AdGrantGenerateRequest {
  websiteUrl: string;
  /** Country or region the ads should show in. Required so every campaign has a geo-target. */
  location: string;
  organisationName?: string;
}

export interface AdGrantQuotaView {
  remaining: number;
  cap: number;
  /** Why the cap is three, in one paragraph. */
  capReason: string;
  /**
   * True when the count is in the adgrant_generations table. False when this
   * process is holding it in memory, which is what happens with no DATABASE_URL:
   * a restart forgets the count.
   */
  durable: boolean;
  /** Set when durable is false; the sentence the page should print. */
  durableLine?: string;
}

export interface AdGrantGenerateResponse extends AdGrantQuotaView {
  structure: AdGrantAccountStructure;
  /** CSV for Google Ads Editor. Import it there. Nothing was written into an account. */
  csv: string;
  editorLine: string;
}

export interface AdGrantGenerateError extends Partial<AdGrantQuotaView> {
  error: string;
}

/* ------------------------- room access (email link) ------------------------ */
/* A mailed way back into a room. The token in the link is not the room's own
 * address: that address is a bearer credential, and putting it in an email
 * would make the email one too. The mailed token is single-use and lasts one
 * hour. The sentence the form prints is the same whether or not a room was
 * found, so the form cannot be used to ask whether a given person is a
 * customer here. */

/** How long a mailed room-access link remains valid. */
export const ROOM_ACCESS_TTL_MS = 60 * 60 * 1000;

/** The duration, in the words a visitor reads. Must match ROOM_ACCESS_TTL_MS. */
export const ROOM_ACCESS_TTL_PHRASE = "one hour";

/** Printed after submit, found or not, known address or not. */
export const ROOM_ACCESS_SENT_LINE = "If that address has a room, the link is on its way.";

/** Printed when RESEND_API_KEY or LEAD_EMAIL_FROM is missing. */
export const ROOM_ACCESS_UNAVAILABLE_LINE =
  "A link cannot be sent from this deployment: email is not configured.";

export type RoomAccessAvailability =
  | { available: true }
  | { available: false; unavailableLine: string };

export interface SendRoomAccessRequest {
  email: string;
}

/** What the site learns after it asks to send a link. */
export interface SendRoomAccessResponse {
  line: string;
}
