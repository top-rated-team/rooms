import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";
import type { Express, Request, RequestHandler, Response } from "express";
import type { ZodError } from "zod";
import { askSchema, createWorkspaceSchema, insertLeadSchema, type Citation, type Lead } from "@shared/schema";
import type { AskEvent, CreateWorkspaceResponse, WorkspaceState } from "@shared/api";
import { ADGRANT_TEMPLATE_FILES_UNAUTHORIZED_LINE } from "@shared/api";
import { DEFAULT_AGENT_ID, answerableAgent } from "@shared/roster";
import { storage } from "./storage";
import {
  deliverLeadRequest,
  inboxHealth,
  inboxKeyConfigured,
  inboxKeyMatches,
  leadInbox,
  recordLeadAttempt,
  recordLeadRequest,
  renderLeadInbox,
  type LeadRequest,
  type LeadRequestInput,
} from "./notify";
import { rateLimit } from "./rateLimit";
import { llmReady, streamAgentAnswer } from "./ai/agentRuntime";
import { kbStatus } from "./ai/kb";
import { routeQuestion } from "./ai/route-question";
import { ASK_LEDGER_KEY, askBudgetUsd, askLedgerKey, claimAgentTurn, recordTurnCost } from "./spend";
import { acceptWhatsAppInbound, bindingStateForToken, completeLinkedIn, hydrateIdentityStore, installIdentityInbound, startLinkedIn, startWhatsApp } from "./identity";
import { connectorMcp, connectorRouter } from "./connector";
import { operatorGate, readOperator, writeOperator } from "./operator";
import { ensureInboundWebhooks, INBOUND_AUTH_HEADER, INBOUND_PATH, RETIRED_INBOUND_PATHS } from "./whatsapp/webhooks";
import {
  acceptInbound,
  dispatchInbound as dispatchWhatsAppInbound,
  inboundSecretHeader,
  WHATSAPP_INBOUND_PATH,
} from "./whatsapp";
import { WORK_END_HOUR, WORK_START_HOUR, getBookingSlots, invalidateSlotsCache, parseSlotsQuery, workingTimes } from "./booking/slots";
import { searchCities } from "./booking/city-search";
import { liveColumns, livePicture, liveTarget } from "./booking/live-block";
import { lookUpZone } from "./booking/zone-lookup";
import { calendarId as bookingCalendarId } from "./booking/gcal";
import {
  VISITOR_CALENDAR_COOKIE,
  VISITOR_CALENDAR_STATE_COOKIE,
  PENDING_VISITOR_CALENDAR_MS,
  dropVisitorCalendar,
  startVisitorCalendarConnect,
  completeVisitorCalendarConnect,
  visitorCalendarCookieOptions,
  visitorCalendarView,
} from "./booking/freebusy";
import { bookingHostEmail, postBooking, changeBooking, cancelBooking, getExistingBooking } from "./booking/calendar";
import { confirmEmailHold, emailHoldStatus, getBookingConfirmed, installBookingInbound } from "./booking/confirm";
import { emailConfirmation } from "./booking/confirm-email";
import { handleInboundEmail } from "./booking/reply-to-book";
import { signAddress } from "./booking/link-sign";
import { isCalendarDate as isSlotDate, liveSlotState, slotImage, slotImageTime } from "./booking/slot-image";
import { isBookingReturnCode, normalizeBookingCode } from "./booking/code";
import {
  bookingLinkedInAvailability,
  completeBookingLinkedIn,
  getBookingLinkedInSession,
  startBookingLinkedIn,
} from "./booking/signin";
import { generateAdGrantStructure, getAdGrantGenerationQuota } from "./adgrant/generate";
import { templateSetupFiles } from "./adgrant/templates";
import { adGrantStats } from "./adgrant/stats";
import { hydrateBookings } from "./booking/hold";
import { adgrantMovedOrigin, adgrantRobotsTxt, adgrantSitemapXml } from "./adgrant/site";
import { rewriteHead } from "./adgrant/head";
import { ADGRANT_ORIGIN } from "@shared/adgrant-site";
import { resolveDistPath } from "./vite";
import { hybridRoomsUrl, registerRoomsMoved } from "./rooms-moved";
import fs from "node:fs";
import path from "node:path";
import { isAdGrantAppHost, isAdGrantHost } from "@shared/adgrant-site";
import { bookLinkTarget, bookingGuests, formatBookLinkHash, widgetRecipient } from "@shared/booking-link";
import { buildBookingWidget, type BookingWidgetShow } from "@shared/booking-widget";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import { isSignInOnlyLink, openRoomAccess, roomAccessAvailability, sendRoomAccessLink, spentPage } from "./room-access";
import {
  completeRoomLoginLinkedIn,
  getRoomLoginWhatsAppConfirmed,
  installRoomLoginInbound,
  loginNonePage,
  roomLoginAvailability,
  startRoomLoginLinkedIn,
  startRoomLoginWhatsApp,
  ROOM_LOGIN_STATE_COOKIE,
  ROOM_LOGIN_STATE_MAX_AGE_MS,
} from "./room-login";
import {
  ROOM_SESSION_COOKIE,
  claimLinkedInSession,
  cookieValue,
  emailProviderId,
  sessionTicketFromLine,
  signInOrAttach,
  claimWhatsAppSession,
  endSession,
  readSessionAccount,
  roomSessionOutcomePath,
  sessionCookieOptions,
  whoAmI,
} from "./room-account";
import { accountIsOperator, listAdminPeople, requireDeploymentOperator } from "./admin/people";

/* ------------------------- /api/ask stream shape -------------------------- */
/* Everything below belongs to the SSE stream at /api/ask. The numbers are the
 * ones a person waiting on a blank panel actually feels, so each says what it
 * is measured against rather than being a round number somebody liked. */

/**
 * Idle gap the stream never exceeds. Ten seconds sits under the shortest
 * connection idle timeout anything in this path enforces, and the visitor is
 * told something real at 8s anyway (ASK_SLOW_NOTICE_MS), so this only carries
 * the quiet stretch between that notice and the first token.
 */
const SSE_HEARTBEAT_MS = 10_000;

/**
 * Padding written once, immediately after the headers, before any work starts.
 *
 * A proxy that waits for a full buffer before forwarding anything will hold a
 * 17-byte comment indefinitely; 4 KiB is one memory page, which is nginx's
 * default `proxy_buffer_size` and larger than any buffer we can name in this
 * path. It is a comment frame, so every SSE client — ours and the browser's
 * own EventSource — drops it without rendering anything.
 *
 * It works together with `no-transform`, not instead of it: 4 KiB of spaces
 * gzips down to a few bytes, so an edge that compresses the stream would
 * squeeze the padding back out of it. `Cache-Control: no-transform` is what
 * stops that, and the header below is why this is 4 KiB rather than 40.
 *
 * Cost: 4 KiB per question, once, against an answer that runs to several KiB.
 */
const SSE_PREAMBLE_BYTES = 4096;
const SSE_PREAMBLE =
  ": padding, so a proxy that waits for a full buffer forwards this response now\n" +
  `:${" ".repeat(SSE_PREAMBLE_BYTES)}\n\n`;

/**
 * When the visitor is told the answer is slow. A reasoning model spends its
 * reasoning tokens before the first visible character, and on a 24k-character
 * context that is routinely 3-8 seconds of nothing — so anything shorter than
 * this cries wolf on a perfectly healthy answer. Past about ten seconds of
 * silence a visitor stops reading the spinner and decides the page is broken.
 */
const ASK_SLOW_NOTICE_MS = 8_000;

/**
 * When we stop waiting for the first chunk and say so.
 *
 * This is a first-chunk deadline only: once tokens are arriving we never cut a
 * good answer off mid-sentence, and `ANSWER_TIMEOUT_MS` in server/ai/agentRuntime.ts
 * (60s) remains the guard against a stalled socket. Thirty seconds is well past
 * any healthy first token and short enough that the visitor is handed a route to
 * a person while they still want one.
 */
const ASK_FIRST_CHUNK_DEADLINE_MS = 30_000;

/** First status event: true of what the agent is about to do, not a guess at progress. */
const ASK_STATUS_RETRIEVING = "Looking through the documentation.";
const ASK_STATUS_THINKING = "Putting the answer together.";
const ASK_STATUS_SLOW =
  "Still going. The model has not sent back any of the answer yet.";
/** Reads the number off the constant, so raising the deadline cannot leave this sentence lying about it. */
const ASK_DEADLINE_MESSAGE =
  `Nothing came back from the model within ${Math.round(ASK_FIRST_CHUNK_DEADLINE_MS / 1000)} seconds, so this stopped ` +
  "rather than leaving you watching a spinner. Ask again, or put the question to a person — that route does not queue.";

/**
 * What /api/ask writes on the wire. `status` is deliberately not in
 * `AskEvent` yet: shared/api.ts is another agent's file this week, and a client
 * that does not know the variant ignores the frame, so the server can lead. The
 * handoff asks for it to be moved into the shared contract.
 */
type AskStatusStage = "retrieving" | "slow";
type AskStreamEvent = AskEvent | { type: "status"; stage: AskStatusStage; message: string };

const LLM_UNAVAILABLE_ASK =
  "Live answers are not configured on this deployment — no OPENAI_API_KEY is set, so nothing here will be answered from guesswork. A human on the team can answer the same question today: book a call or ask for the conversion tracking setup.";

const STREAM_INTERRUPTED = "The answer stopped part-way through. Ask again, or bring in a human.";

/* ------------------------------- utilities -------------------------------- */

/**
 * Express 4 does not catch rejected promises from a handler, and an unhandled
 * rejection here would leave the request hanging forever.
 */
function route(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function describe(error: ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${where}${issue.message}`;
  });
  return issues.length > 0 ? issues.join("; ") : "Invalid request body";
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: message });
}

function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? `localhost:${process.env.PORT ?? 5000}`}`;
}

async function requireWorkspace(req: Request, res: Response): Promise<WorkspaceState | null> {
  // Express 5 types a route param as string | string[]; only the first is ours.
  const raw = req.params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const state = token ? await storage.getWorkspaceByToken(token) : null;
  if (!state) {
    notFound(res, "Workspace not found");
    return null;
  }
  return state;
}

/* -------------------------- asking for a human ---------------------------- */

/**
 * THE ONE PATH every request for a human takes — the form on the landing page,
 * the "email me the link" strip and the room's hire sheet alike — so the owner
 * reads one inbox and not three.
 *
 * The order is the whole point:
 *
 *   1. the ledger, synchronously, before anything else can fail;
 *   2. the database copy, whose failure costs the second copy and nothing more;
 *   3. delivery, in the background, because a webhook that hangs for six
 *      seconds must not hold the visitor's request open.
 *
 * By the time this function returns, the request cannot be lost. Everything
 * after step one is a copy of something already safe.
 */
async function captureLead(input: LeadRequestInput): Promise<{ request: LeadRequest; lead: Lead }> {
  const request = recordLeadRequest(input);

  let lead: Lead;
  try {
    lead = await storage.createLead({
      workspaceId: request.workspaceId,
      name: request.name,
      email: request.email,
      company: request.company,
      website: request.website,
      intent: request.intent,
      message: request.message,
      source: request.source,
    });
    recordLeadAttempt(request.id, {
      at: new Date().toISOString(),
      channel: "database",
      ok: true,
      detail: `stored as ${lead.id}`,
    });
  } catch (error) {
    // Already on disk, so a database outage must not become a 500 for a
    // visitor whose request we have in fact got.
    console.error("[lead] the database copy failed:", error);
    recordLeadAttempt(request.id, {
      at: new Date().toISOString(),
      channel: "database",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    lead = {
      id: request.id,
      workspaceId: request.workspaceId,
      name: request.name,
      email: request.email,
      company: request.company,
      website: request.website,
      intent: request.intent,
      message: request.message,
      source: request.source,
      createdAt: new Date(request.receivedAt),
      notifiedAt: null,
    };
  }

  void deliverLeadRequest(request).catch((error: unknown) => {
    console.error("[lead] delivery raised after the request was kept:", error);
  });

  return { request, lead };
}

/** The inbox key may also arrive as `Authorization: Bearer <key>`. */
function bearerKey(req: Request): string | undefined {
  const header = req.get("authorization");
  if (!header) return undefined;
  return /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
}

/* -------------------------------- routes ---------------------------------- */

export function registerRoutes(app: Express): void {
  /*
   * The doors moved from /work to /use-case and then to /services, all on 7
   * September 2026. These redirects exist because the old addresses were
   * published: they were in
   * sitemap.xml, which crawlers had already fetched, and any link somebody
   * saved or sent points at them.
   *
   * A 301 and not a client-side redirect. Everything that is not an API route
   * is served the SPA shell, so /work/google-ads would answer 200 with the
   * whole app and then move the visitor — which works for a person and is a
   * duplicate page for a crawler. A 301 here is the only place the old address
   * can be told, once, that it has permanently become the new one.
   *
   * /services is where they stay, and that is not a third change of mind:
   * top-rated.team has answered on /services for years, so when the apex moves
   * that URL already has standing and this application must not be the reason it
   * stops working. /use-case existed for about an hour and is redirected for the
   * same reason /work is — something may have been fetched in between.
   *
   * Registered before anything else so no later handler can claim them first.
   */
  /*
   * THE SUBDOMAIN HANDS ITS PAGES TO THE APEX.
   *
   * Both hosts point at this one Render service, so the move from
   * ai.top-rated.team to top-rated.team cannot be done in DNS alone — the
   * redirect has to happen here.
   *
   * FOUR THINGS IT DELIBERATELY DOES NOT DO, and each is a way this goes wrong:
   *
   * GET and HEAD only. A 301 on a POST is a trap: many clients re-issue it as a
   * GET and drop the body, so a webhook would arrive empty and succeed.
   *
   * Never /api/. The subdomain keeps its job — WAHA and ChatWoot post to it, the
   * connector answers on it, and the owner asked for ai. to stay the technical
   * address. Those must not move.
   *
   * FROM A NAMED LIST OF HOSTS, not from "anything that is not canonical".
   * render.yaml sets healthCheckPath: /, and Render's checker arrives with its
   * own host — redirecting everything unrecognised would answer that check with
   * a 301 to another domain and could have the service marked unhealthy. The
   * list is the one legacy host and nothing else.
   *
   * And it is INERT until PUBLIC_BASE_URL names somewhere else. Shipping it
   * today changes nothing; it starts working the moment that variable is set to
   * the apex in the Render dashboard, and stops if it is set back. There is no
   * separate switch to remember.
   */
  const LEGACY_HOSTS = new Set(
    (process.env.LEGACY_HOSTS ?? "ai.top-rated.team")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();

    const canonical = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (!canonical) return next();

    let canonicalHost: string;
    try {
      canonicalHost = new URL(canonical).host.toLowerCase();
    } catch {
      return next();
    }

    const seen = (req.get("host") ?? "").toLowerCase();
    if (!seen || seen === canonicalHost || !LEGACY_HOSTS.has(seen)) return next();

    res.redirect(301, `${canonical}${req.originalUrl}`);
  });

  /*
   * ROOMS LIVE ELSEWHERE NOW. /rooms and every room address this site gave
   * out (/w/<token>) are sent on to them, before anything else can answer --
   * see server/rooms-moved.ts. The token does not travel with the redirect.
   */
  registerRoomsMoved(app);

  app.use(operatorGate);

  app.get("/api/operator", route(readOperator));
  app.put("/api/operator", route(writeOperator));

  for (const stale of ["/work", "/use-case"]) {
    app.get(stale, (_req, res) => res.redirect(301, "/services"));
    app.get(`${stale}/:slug`, (req, res) => res.redirect(301, `/services/${encodeURIComponent(req.params.slug)}`));
  }

  /*
   * TWO ADDRESSES FROM THE OLD SITE, ANSWERED EARLY.
   *
   * These are top-rated.team's, not this application's, and they answer here
   * only once the apex moves — see private/apex-migration.md, which lists all
   * fourteen. They are registered now because both destinations have stopped
   * being decisions:
   *
   *   /white-label had no door when the migration was written, and it is now
   *   the eighth, so the page it always was becomes /services/white-label.
   *
   *   /leads sold "FREE leads" and the owner removed the offer. An address for
   *   an offer that no longer exists goes to the front of the house, not to a
   *   404, because agencies have linked to it for years.
   *
   * The rest of that table still needs answers — /team, /roi-calculator and
   * the blog have nowhere to land yet — and they are deliberately not guessed
   * at here. A 301 is the one redirect a crawler treats as permanent, so it is
   * the wrong instrument for a page whose home is undecided.
   */
  app.get("/white-label", (_req, res) => res.redirect(301, "/services/white-label"));
  app.get("/leads", (_req, res) => res.redirect(301, "/"));
  /*
   * /contact goes to the front of the house because the front of the house is
   * now the contact page: the first screen carries the call, the message, the
   * WhatsApp number and the room, and the footer carries the address. There is
   * no thinner page to build that would say more than that.
   */
  app.get("/contact", (_req, res) => res.redirect(301, "/"));
  /*
   * /book opens the booking popup over the front page, with the visitor's
   * address filled in when the link carries one — see shared/booking-link.ts
   * for the shapes it reads and why the address travels in the fragment.
   *
   * A 302 and not a 301 like its neighbours: /book has not moved anywhere, it
   * is an action that lands on the front page, and a browser keeps a 301 with
   * no expiry — if /book ever becomes a page of its own, every browser that
   * had opened it would go on skipping that page. no-store because the
   * Location carries somebody's address. Not on AdGrant hosts, whose site has
   * no booking popup.
   */
  app.get("/book", (req, res, next) => {
    if (isAdGrantHost(req.hostname)) {
      next();
      return;
    }
    const at = req.originalUrl.indexOf("?");
    const query = at < 0 ? "" : req.originalUrl.slice(at + 1);
    res.setHeader("Cache-Control", "no-store");
    /* A BARE /book IS THE PAGE ITSELF, not a hop: it carries nobody's
       address, and a redirect loses the fragment it was opened with — the
       owner's signature link /book# is marked by exactly that empty "#"
       (browsers drop an empty one across a 302). The page opens the popup,
       or for the owner the widget page (client/src/lib/operator-shortcut.ts). */
    if (query.replace(/&/g, "") === "") {
      res.setHeader("X-Robots-Tag", "noindex");
      next();
      return;
    }
    res.redirect(302, bookLinkTarget(query));
  });
  /*
   * A time clicked in a block worked out when the email is opened: "row 1,
   * 10:00" becomes the day row 1 stands for now (server/booking/live-block.ts),
   * and the popup opens on that time with the address filled in — never booked
   * by the click alone, because the pictures the reader saw may be days old.
   * Everything else in the link (the address, its guests, its signature) is
   * passed on as it came.
   */
  const liveLinkLimit = rateLimit({ windowMs: 60_000, max: 120, message: "Too many requests. Wait a moment." });
  app.get("/book/live", liveLinkLimit, (req, res, next) => {
    if (isAdGrantHost(req.hostname)) {
      next();
      return;
    }
    void (async () => {
      const at = req.originalUrl.indexOf("?");
      const raw = at < 0 ? "" : req.originalUrl.slice(at + 1);
      const ours = new Set(["r", "t", "c", "instant", "date", "time"]);
      const rest = raw.split("&").filter((part) => part && !ours.has(part.split("=")[0]!.toLowerCase()));
      const query = req.query as Record<string, unknown>;
      const columns = liveColumns(typeof query.c === "string" ? query.c : "");
      const time = typeof query.t === "string" && /^\d{4}$/.test(query.t) ? `${query.t.slice(0, 2)}:${query.t.slice(2)}` : "";
      const target = await liveTarget({ row: Number(query.r), time, columns });
      const picked = [
        ...(target.date ? [`date=${target.date}`] : []),
        ...(target.time ? [`time=${target.time}`] : []),
      ];
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.redirect(302, bookLinkTarget([...picked, ...rest].join("&")));
    })().catch(next);
  });

  /*
   * The link in the letter that confirms a time picked inside an email
   * (server/booking/confirm-email.ts). It confirms nothing by being opened —
   * a mail scanner opens it first — it opens the popup, which shows the time
   * and asks. The token goes into the fragment for the same reason /book's
   * address does, and the popup takes it off the address bar.
   */
  app.get("/book/confirm/:token", (req, res, next) => {
    if (isAdGrantHost(req.hostname)) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.redirect(302, `/#${formatBookLinkHash({ confirmation: req.params.token, confirmByEmail: true })}`);
  });

  const createWorkspaceLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, message: "Too many workspaces from this address. Try again later, or book a call." });
  const leadLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, message: "Too many requests from this address. Try again later." });
  // Slows a guess at LEAD_INBOX_KEY to something not worth attempting, while
  // leaving the owner enough refreshes to work from.
  const inboxLimit = rateLimit({ windowMs: 60_000, max: 30, message: "Too many requests. Wait a moment." });
  const askLimit = rateLimit({ windowMs: 60_000, max: 20, message: "Too many questions at once. Wait a few seconds and ask again." });
  const identityLimit = rateLimit({
    windowMs: 60 * 60_000,
    max: 20,
    message: "Too many identification attempts from this address. Try again later.",
  });
  const identityWebhookLimit = rateLimit({ windowMs: 60_000, max: 120, message: "Too many requests. Wait a moment." });
  const slotImageLimit = rateLimit({ windowMs: 60_000, max: 600, message: "Too many requests. Wait a moment." });
  const bookingLimit = rateLimit({ windowMs: 60_000, max: 30, message: "Too many booking requests. Wait a moment." });
  const roomAccessSendLimit = rateLimit({
    windowMs: 60 * 60_000,
    max: 10,
    message: "Too many requests from this address. Try again later.",
  });
  const roomAccessOpenLimit = rateLimit({ windowMs: 60_000, max: 30, message: "Too many requests. Wait a moment." });

  /* --------------------------- workspaces --------------------------- */

  app.post(
    "/api/workspaces",
    createWorkspaceLimit,
    route(async (req, res) => {
      const parsed = createWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const input = parsed.data;
      /*
       * ONLY ADGRANT.AI'S GENERATOR. Rooms are not this site's any more
       * (shared/rooms-moved.ts); what is left of them here is the record the
       * Ad Grant generator keeps for one visitor -- who they are and how many
       * structures they have had -- which no person ever opens as a room.
       * Anything else asking for a room is told where rooms are now.
       */
      if (input.source?.door !== "ad-grants") {
        res.status(410).json({ error: "Rooms have moved.", url: hybridRoomsUrl() });
        return;
      }
      if (input.agentId && !answerableAgent(input.agentId)) return badRequest(res, `Unknown agent: ${input.agentId}`);

      const created = await storage.createWorkspace({
        name: input.name,
        visitorName: input.visitorName,
        visitorEmail: input.visitorEmail,
        visitorCompany: input.visitorCompany,
        visitorWebsite: input.visitorWebsite,
        source: input.source,
      });
      const response: CreateWorkspaceResponse = { ...created, url: `${publicBaseUrl(req)}/w/${created.token}` };
      res.status(201).json(response);
    }),
  );









  /* ------------------------------ leads ----------------------------- */

  app.post(
    "/api/leads",
    leadLimit,
    route(async (req, res) => {
      const parsed = insertLeadSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const { request } = await captureLead({
        workspaceId: parsed.data.workspaceId,
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company,
        website: parsed.data.website,
        intent: parsed.data.intent,
        message: parsed.data.message,
        source: parsed.data.source,
      });

      // The reference is the visitor's proof that this exists on our side, and
      // the string the owner searches the inbox for.
      res.status(201).json({ ok: true, reference: request.id });
    }),
  );

  /* --------------------------- the owner's inbox --------------------------- */

  /**
   * Everything that ever came in, newest first, behind LEAD_INBOX_KEY. Plain
   * server-rendered HTML rather than a page in the client bundle: the owner
   * opens it on his phone, and this site has no login to put a page behind.
   *
   * Open it as /api/leads/inbox?key=<LEAD_INBOX_KEY>, or send the same value
   * as `Authorization: Bearer <key>`.
   */
  app.get(
    "/api/leads/inbox",
    inboxLimit,
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      // The page links to room addresses, and a room address is a credential.
      res.setHeader("Referrer-Policy", "no-referrer");

      if (!inboxKeyConfigured()) {
        res
          .status(503)
          .type("text/plain; charset=utf-8")
          .send(
            "The lead inbox is closed: LEAD_INBOX_KEY is not set on this deployment.\nSet it to a long random string, restart, and open this page with ?key=<that string>.\nNothing has been lost in the meantime — requests are kept either way.",
          );
        return;
      }

      const supplied = typeof req.query.key === "string" ? req.query.key : bearerKey(req);
      if (!inboxKeyMatches(supplied)) {
        // Says nothing about whether the route exists.
        res.status(404).type("text/plain; charset=utf-8").send("Not found");
        return;
      }

      res.status(200).type("text/html; charset=utf-8").send(renderLeadInbox(leadInbox(), inboxHealth()));
    },
  );

  /* ------------------------------- ask ------------------------------ */

  app.post(
    "/api/ask",
    askLimit,
    route(async (req, res) => {
      const parsed = askSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));

      const agentId = parsed.data.agentId ?? DEFAULT_AGENT_ID;
      /* answerableAgent, not AGENT_BY_ID: existence was the whole gate here,
         so an unauthenticated POST naming a hidden agent streamed a grounded
         answer with citations to that agent's own corpus. The reply for a
         hidden agent is the same as for one that never existed, because
         telling a stranger which agents we are hiding is itself the leak. */
      const agent = answerableAgent(agentId);
      if (!agent) return badRequest(res, `Unknown agent: ${agentId}`);

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      // Asks nginx not to buffer. Cloudflare strips it before the browser sees
      // it, so it is a request to whatever is directly in front of this process
      // and never something to rely on — hence SSE_PREAMBLE below.
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      /**
       * Two flags, not one, and the distinction is the whole bug this endpoint
       * used to have: `ended` means we finished writing, `disconnected` means
       * the visitor went away. A single flag set from a disconnect handler also
       * suppressed `res.end()`, so the response was never terminated.
       */
      let ended = false;
      let disconnected = false;

      let heartbeat: NodeJS.Timeout | undefined;
      let slowNotice: NodeJS.Timeout | undefined;
      let deadline: NodeJS.Timeout | undefined;

      const stopTimers = (): void => {
        if (heartbeat) clearInterval(heartbeat);
        if (slowNotice) clearTimeout(slowNotice);
        if (deadline) clearTimeout(deadline);
      };

      const write = (frame: string): void => {
        if (ended || disconnected) return;
        res.write(frame);
      };

      const send = (event: AskStreamEvent): void => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const finish = (): void => {
        if (ended) return;
        ended = true;
        stopTimers();
        if (!disconnected) res.end();
      };

      /*
       * `res`, not `req`. Since Node 16 an IncomingMessage emits "close" as soon
       * as the request is complete — which, behind express.json(), is a couple of
       * milliseconds into the handler — so a disconnect handler on `req` fires on
       * every healthy request and silences the stream it is supposed to be
       * protecting. The response is the thing that closes when the visitor
       * leaves. server/routes.ask.test.ts holds this down.
       */
      res.on("close", () => {
        if (!ended) disconnected = true;
        stopTimers();
      });

      // Before anything expensive: fill whatever buffer is between this process
      // and the browser. A comment nobody sees is not a sign of life to a
      // visitor, but it is what makes the frames after it arrive.
      write(SSE_PREAMBLE);

      // Ahead of the status, not after it: a deployment with no key is not about
      // to read anything, and saying it is would be the first lie of the session.
      if (!llmReady()) {
        send({ type: "error", message: LLM_UNAVAILABLE_ASK });
        finish();
        return;
      }

      /*
       * THE PUBLIC PANEL HAS TO BE BOUNDED TOO, and until now it was not.
       *
       * server/spend.ts went in guarding the ROOM path, which is where an agent
       * loop was imagined. It missed the endpoint that actually faces the
       * internet: /api/ask is on every door, needs no token, and anyone can call
       * it. The only thing here was a 20-per-minute rate limit per address,
       * which permits 28,800 answers a day from one IP and has no ceiling at all
       * across many.
       *
       * This was not theoretical. A stale polling loop of my own sat on this
       * endpoint for about five hours, one call every twenty-five seconds, and
       * nothing anywhere noticed or stopped it. That is the exact failure the
       * spend module was written for, on the surface it did not cover.
       *
       * Two claims, because they fail differently: one for this address, so a
       * single caller cannot spend the whole ceiling, and one for the endpoint as
       * a whole, because the real exposure is many addresses rather than one.
       */
      const askIp = typeof req.ip === "string" && req.ip ? req.ip : "unknown";
      const mine = claimAgentTurn(askLedgerKey(askIp));
      const everyone = mine.ok ? claimAgentTurn(ASK_LEDGER_KEY, Date.now(), askBudgetUsd()) : mine;
      if (!everyone.ok) {
        send({ type: "error", message: everyone.message });
        send({ type: "done" });
        finish();
        return;
      }

      send({
        type: "status",
        stage: "retrieving",
        message: agent.useKb ? ASK_STATUS_RETRIEVING : ASK_STATUS_THINKING,
      });

      heartbeat = setInterval(() => write(": keep-alive\n\n"), SSE_HEARTBEAT_MS);

      // Retrieval and the model call both happen inside the generator's first
      // step, so the first chunk is the first thing worth reporting and the only
      // thing worth putting a deadline on. Once tokens are flowing, a slow
      // answer is still an answer.
      const answers = streamAgentAnswer({
        agentId,
        question: parsed.data.question,
        history: parsed.data.history,
      });

      let expired = false;
      const expiry = new Promise<"expired">((resolve) => {
        deadline = setTimeout(() => {
          expired = true;
          resolve("expired");
        }, ASK_FIRST_CHUNK_DEADLINE_MS);
      });

      slowNotice = setTimeout(() => {
        send({ type: "status", stage: "slow", message: ASK_STATUS_SLOW });
      }, ASK_SLOW_NOTICE_MS);

      try {
        let citations: Citation[] | undefined;
        let waitingForFirst = true;

        for (;;) {
          const next = answers.next();
          // The losing side of the race is still a live promise: give it a
          // handler now so a later rejection is caught here rather than by the
          // process-wide unhandledRejection hook.
          next.catch(() => undefined);
          const step = waitingForFirst ? await Promise.race([next, expiry]) : await next;

          if (step === "expired") {
            send({ type: "error", message: ASK_DEADLINE_MESSAGE });
            send({ type: "done" });
            // Best effort: a generator suspended mid-await resumes and stops at
            // its next yield. Cancelling the OpenAI call itself needs an
            // AbortSignal on streamAgentAnswer — see the handoff.
            void answers.return(undefined).catch(() => undefined);
            break;
          }

          if (waitingForFirst) {
            waitingForFirst = false;
            if (slowNotice) clearTimeout(slowNotice);
            if (deadline) clearTimeout(deadline);
          }

          if (step.done) break;
          if (disconnected) break;

          const chunk = step.value;
          if (chunk.error) {
            send({ type: "error", message: chunk.error });
            continue;
          }
          if (chunk.citations && chunk.citations.length > 0) citations = chunk.citations;
          if (chunk.usage) {
            // Both ledgers the claim above read, or the ceilings never move.
            recordTurnCost(askLedgerKey(askIp), agentId, chunk.usage);
            recordTurnCost(ASK_LEDGER_KEY, agentId, chunk.usage);
          }
          if (chunk.delta) send({ type: "delta", delta: chunk.delta });
        }

        if (!expired) send({ type: "done", citations });
      } catch (error) {
        console.error("[ask] stream failed:", error);
        send({ type: "error", message: STREAM_INTERRUPTED });
        send({ type: "done" });
      } finally {
        finish();
      }
    }),
  );

  /* ---------------------------- kb status --------------------------- */

  app.get("/api/kb/status", (_req, res) => {
    res.json({ ...kbStatus(), llmReady: llmReady() });
  });

  /* --------------------- route a home-page question ---------------------- */
  /*
   * The home page is not a door. This looks the question up against the door
   * table and returns a live door, a page, or a choice. It does not call the
   * model: claiming a spend turn here would spend the visitor's allowance on a
   * lookup. When a door's agent then answers, /api/ask claims as it always has.
   * The same per-address rate limit as /api/ask still applies.
   */
  app.post(
    "/api/route-question",
    askLimit,
    route(async (req, res) => {
      const parsed = askSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, describe(parsed.error));
      const picked = typeof req.body?.doorId === "string" ? req.body.doorId : undefined;
      res.json(routeQuestion(parsed.data.question, picked));
    }),
  );

  /* ---------------------- room identity (two routes) ---------------------- */

  installIdentityInbound();
  installRoomLoginInbound();
  void hydrateIdentityStore();
  /* Bookings survive a deploy only if they are read back. Fire and forget,
     beside the identity store, for the same reason: a database briefly away
     must not stop the site answering. */
  void hydrateBookings();

  app.get(
    "/api/workspaces/:token/identity",
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;
      const binding = await bindingStateForToken(state.workspace.token);
      if (!binding) return notFound(res, "Workspace not found");
      res.json(binding);
    }),
  );



  app.get(
    "/api/workspaces/:token/identity/linkedin",
    identityLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;
      const start = startLinkedIn({
        workspaceId: state.workspace.id,
        token: state.workspace.token,
        publicBaseUrl: publicBaseUrl(req),
      });
      if (!start.ok) {
        res.status(503).json({ error: start.line });
        return;
      }
      res.redirect(302, start.url);
    }),
  );

  app.get(
    "/api/identity/linkedin/callback",
    route(async (req, res) => {
      const result = await completeLinkedIn({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      });
      const dest = result.token ? `/w/${result.token}` : "/w";
      res.redirect(302, dest);
    }),
  );

  app.get(
    "/api/workspaces/:token/identity/whatsapp",
    identityLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;
      const start = await startWhatsApp({
        workspaceId: state.workspace.id,
        token: state.workspace.token,
        roomUrl: `${publicBaseUrl(req)}/w/${state.workspace.token}`,
      });
      if (!start.ok) {
        res.status(503).json({ error: start.line });
        return;
      }
      res.json(start.offer);
    }),
  );

  app.post(
    "/api/identity/whatsapp/inbound",
    identityWebhookLimit,
    route(async (req, res) => {
      const result = await acceptWhatsAppInbound(req.body, req.get("x-webhook-secret") ?? undefined);
      if (!result.accepted) {
        res.status(401).json({ error: "Not found" });
        return;
      }
      res.status(200).json({ ok: true });
    }),
  );

  /* ---------------------- room login (three ways) ---------------------- */
  /*
   * LOGIN on the site. GET /api/room-login says which ways work on this
   * deployment. LinkedIn and WhatsApp look up rooms already bound to that
   * person. The address way is the mailed single-use link: POST sends it,
   * GET /api/room-access/:token opens it. An address typed into a room the
   * caller is already inside is POST /api/workspaces/:token/room-address.
   *
   * Defects 1 and 2 that sealed this block are repaired here. Booking
   * LinkedIn is unsealed: a sign-in with no address is a hold, not a
   * calendar write.
   */

  app.get(
    "/api/room-login",
    roomAccessOpenLimit,
    route(async (req, res) => {
      res.json(await roomLoginAvailability({ host: req.hostname }));
    }),
  );

  app.get(
    "/api/room-login/linkedin",
    identityLimit,
    route(async (req, res) => {
      const start = startRoomLoginLinkedIn(req.hostname);
      if (!start.ok) {
        res.status(503).json({ error: start.line });
        return;
      }
      /* The same value that goes to LinkedIn goes into a cookie, so the
         return can be completed only by this browser. See
         ROOM_LOGIN_STATE_COOKIE for what it prevents. */
      res.cookie(ROOM_LOGIN_STATE_COOKIE, start.state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ROOM_LOGIN_STATE_MAX_AGE_MS,
      });
      res.redirect(302, start.url);
    }),
  );

  app.get(
    "/api/room-login/linkedin/callback",
    route(async (req, res) => {
      const result = await completeRoomLoginLinkedIn({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
        cookieState: cookieValue(req.headers.cookie, ROOM_LOGIN_STATE_COOKIE) ?? undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.clearCookie(ROOM_LOGIN_STATE_COOKIE, { path: "/", sameSite: "lax" });
      /* A sign-in that worked is not a 404, and a meta refresh is not a
         redirect. Both were how this read before: every outcome, success
         included, came back as a not-found page carrying an HTML hop. */
      const ticket = sessionTicketFromLine(result.line);
      if (ticket) {
        res.redirect(302, `/api/session/linkedin?ticket=${encodeURIComponent(ticket)}`);
        return;
      }
      res.status(404).type("html").send(loginNonePage(result.line));
    }),
  );

  app.get(
    "/api/room-login/whatsapp",
    identityLimit,
    route(async (req, res) => {
      const start = await startRoomLoginWhatsApp({ host: req.hostname });
      if (!start.ok) {
        res.status(503).json({ error: start.line });
        return;
      }
      res.json(start.offer);
    }),
  );

  app.get(
    "/api/room-login/whatsapp/confirmed",
    roomAccessOpenLimit,
    route(async (req, res) => {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      res.json(getRoomLoginWhatsAppConfirmed(code));
    }),
  );

  /* ---------------------- session (who am I, and sign out) ---------------------- */

  app.get(
    "/api/session",
    roomAccessOpenLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json(await whoAmI(req.headers.cookie));
    }),
  );

  app.post(
    "/api/session/sign-out",
    roomAccessOpenLimit,
    route(async (req, res) => {
      await endSession(req.headers.cookie);
      res.clearCookie(ROOM_SESSION_COOKIE, { path: "/", sameSite: "lax" });
      res.setHeader("Cache-Control", "no-store");
      res.json({ signedIn: false });
    }),
  );

  app.get(
    "/api/session/linkedin",
    identityLimit,
    route(async (req, res) => {
      const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
      const claimed = await claimLinkedInSession({
        ticket,
        cookieHeader: req.headers.cookie,
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      if (claimed.token) {
        res.cookie(ROOM_SESSION_COOKIE, claimed.token, sessionCookieOptions());
      }
      res.redirect(302, claimed.location);
    }),
  );

  app.get(
    "/api/admin/people",
    roomAccessOpenLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      const gate = await requireDeploymentOperator(req);
      if (!gate.ok) {
        res.status(gate.status).json({
          error: gate.error,
          ...(gate.youAre?.length ? { youAre: gate.youAre } : {}),
        });
        return;
      }
      res.json(await listAdminPeople(req));
    }),
  );

  /*
   * The booking times as a block for an email, for the person who runs this
   * deployment. The times are public — the popup shows them to anyone — but
   * the page that makes the block is a tool for sending mail as us, so it sits
   * behind the same gate as the people page.
   */
  /*
   * Whether this browser is signed in as the operator, and nothing else. The
   * owner's signature links (top-rated.team/#, /book#) ask it to open the
   * widget page for him and the site for everyone else. Unlike the gate it
   * logs no refusal: every visitor who clicks such a link asks.
   */
  app.get(
    "/api/admin/operator",
    roomAccessOpenLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      const account = await readSessionAccount(req.headers.cookie);
      res.json({ operator: Boolean(account && (await accountIsOperator(account, req.hostname || ""))) });
    }),
  );

  /* Towns that start with what the owner typed, each with its own clock
     (server/booking/city-search.ts): the widget page's "Where they are". */
  app.get(
    "/api/admin/city-search",
    roomAccessOpenLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      const gate = await requireDeploymentOperator(req);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const q = typeof req.query.q === "string" ? req.query.q.slice(0, 80) : "";
      res.json({ cities: searchCities(q, 8).map(({ place, label, zone }) => ({ place, label, zone })) });
    }),
  );

  /* The recipient's company or town, as the zone to show them times in
     (server/booking/zone-lookup.ts). Operator only: it asks outside services. */
  app.get(
    "/api/admin/zone-lookup",
    roomAccessOpenLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      const gate = await requireDeploymentOperator(req);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const hit = await lookUpZone(q);
      res.json(hit ? { found: true, ...hit } : { found: false });
    }),
  );

  app.get(
    "/api/admin/booking-widget",
    roomAccessOpenLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      const gate = await requireDeploymentOperator(req);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error, ...(gate.youAre?.length ? { youAre: gate.youAre } : {}) });
        return;
      }
      /* Read the calendar now, not the 45-second cache the popup shares: the
         owner has usually just looked at his calendar, and a block made from
         a minute-old answer can offer the meeting he booked a moment ago. */
      invalidateSlotsCache();
      const readAt = new Date().toISOString();
      const query = req.query as Record<string, unknown>;
      /* LIVE IS THE DEFAULT: the days are the nearest free ones whenever the
         email is opened. Fixed dates start from the day asked for, or today. */
      const frame: "live" | "fixed" = query.frame === "fixed" ? "fixed" : "live";
      const fromRaw = typeof query.from === "string" ? query.from.trim() : "";
      const today = new Date().toISOString().slice(0, 10);
      const from = frame === "fixed" && isSlotDate(fromRaw) && fromRaw > today ? fromRaw : "";
      const slots = await getBookingSlots(from, 14);
      if (!slots.ok) {
        res.status(slots.status).json({ error: slots.error });
        return;
      }
      const show: BookingWidgetShow = query.show === "days" ? "days" : "times";
      const number = (value: unknown, fallback: number) => (typeof value === "string" && value.trim() ? Number(value) : fallback);
      const contract = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;
      /* A time is a web link that books on one click (the owner's choice),
         never an email to write: reply to book's addresses are still answered
         for blocks already sent, but no new block makes them. */
      const recipient = widgetRecipient(typeof query.recipient === "string" ? query.recipient : "");
      /* More people for the call: only with an address, never the address itself, signed with it. */
      const guests =
        recipient.kind === "address"
          ? bookingGuests(typeof query.guests === "string" ? query.guests : "").filter(
              (guest) => guest.toLowerCase() !== recipient.value.toLowerCase(),
            )
          : [];
      const recipientSig = recipient.kind === "address" ? (signAddress(recipient.value, guests) ?? undefined) : undefined;
      const widget = buildBookingWidget({
        baseUrl: process.env.PUBLIC_BASE_URL?.trim() || `${req.protocol}://${req.get("host") ?? "localhost"}`,
        slots: slots.body,
        show,
        days: number(query.days, 5),
        timesPerDay: number(query.perDay, 6),
        recipient: typeof query.recipient === "string" ? query.recipient : "",
        ...(recipientSig ? { recipientSig } : {}),
        ...(recipientSig && guests.length > 0 ? { guests } : {}),
        hostName: (contract.displayName ?? contract.legalName).trim(),
        liveImages: true,
        frame,
        workingTimes: workingTimes(),
        /* The recipient's zone, as the owner set it; the builder ignores one that is not a zone. */
        ...(typeof query.tz === "string" && query.tz.trim() ? { viewerZone: query.tz.trim() } : {}),
        /* And their town in it, named in the email: plain words, short. */
        ...(typeof query.place === "string" && query.place.trim()
          ? { viewerPlace: query.place.replace(/[<>"\u0000-\u001f]/g, "").trim().slice(0, 60) }
          : {}),
      });
      const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
      res.json({
        html: widget.html,
        text: widget.text,
        recipient: recipient.kind === "address" ? { ...recipient, signed: Boolean(recipientSig) } : recipient,
        guests: recipientSig ? guests : [],
        host: bookingHostEmail(),
        calendar: { id: bookingCalendarId(), readAt },
        timezone: slots.body.timezone,
        zone: widget.zone,
        frame: show === "times" ? frame : "fixed",
        from: from || null,
        workHours: { from: hour(WORK_START_HOUR), to: hour(WORK_END_HOUR) },
        days: widget.days,
        emailConfirmation: emailConfirmation(),
      });
    }),
  );

  app.post(
    "/api/session/whatsapp",
    identityLimit,
    route(async (req, res) => {
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      const claimed = await claimWhatsAppSession({
        code,
        cookieHeader: req.headers.cookie,
      });
      res.setHeader("Cache-Control", "no-store");
      if (!claimed.ok) {
        res.status(claimed.reason === "not-confirmed" ? 409 : 409).json({
          error: claimed.line,
          rooms: claimed.rooms,
        });
        return;
      }
      res.cookie(ROOM_SESSION_COOKIE, claimed.token, sessionCookieOptions());
      res.json({
        confirmed: true,
        rooms: claimed.rooms,
        attached: claimed.kind === "attached",
      });
    }),
  );

  app.get(
    "/api/room-access",
    roomAccessOpenLimit,
    route(async (_req, res) => {
      res.json(roomAccessAvailability());
    }),
  );

  app.post(
    "/api/room-access",
    roomAccessSendLimit,
    route(async (req, res) => {
      const result = await sendRoomAccessLink({
        email: req.body?.email,
        signedIn: Boolean(await readSessionAccount(req.headers.cookie)),
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.body);
    }),
  );

  app.get(
    "/api/room-access/:token",
    roomAccessOpenLimit,
    route(async (req, res) => {
      const raw = req.params.token;
      const token = Array.isArray(raw) ? raw[0] : raw;
      const opened = await openRoomAccess(token ?? "");
      if (!opened.ok) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
        res.status(404).type("html").send(spentPage(opened.line));
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      /* THE THIRD WAY IN. Opening this link proved possession of the address,
         which is the whole point of mailing it, so it signs the visitor in the
         way LinkedIn and WhatsApp do. A refusal — that address already belongs
         to another account, and this browser is signed into a third — must
         never hold up the room: the link is valid and it was addressed to
         them. It simply is not joined. */
      const signed = await signInOrAttach({
        identity: { provider: "email", providerId: emailProviderId(opened.emailHash) },
        cookieHeader: req.headers.cookie,
      });
      if (signed.ok) res.cookie(ROOM_SESSION_COOKIE, signed.token, sessionCookieOptions());
      /* A sign-in link names no room: back to the front page, which says how it went. */
      if (isSignInOnlyLink(opened.workspaceToken)) {
        res.redirect(302, roomSessionOutcomePath(!signed.ok ? "refused" : signed.kind === "attached" ? "attached" : "signed-in"));
        return;
      }
      res.redirect(302, `/w/${opened.workspaceToken}`);
    }),
  );















  /* The WhatsApp interface owns inbound parse. WHATSAPP_INBOUND_PATH is the
     address a fork points WAHA at. The retired list stays answerable so a
     house webhook that has not moved yet is not a silent 404 — drop a retired
     path only after a boot has been seen to reconcile. */
  app.post(
    Array.from(new Set([WHATSAPP_INBOUND_PATH, INBOUND_PATH, ...RETIRED_INBOUND_PATHS])),
    identityWebhookLimit,
    route(async (req, res) => {
      const provided =
        req.get(inboundSecretHeader()) ??
        req.get(INBOUND_AUTH_HEADER) ??
        req.get("x-webhook-secret") ??
        undefined;
      const result = acceptInbound(req.body, provided);
      if (!result.authorized) {
        res.status(401).json({ error: "Not found" });
        return;
      }
      res.status(200).json({ ok: true });
      dispatchWhatsAppInbound(result);
    }),
  );

  app.get(
    "/api/booking/slots",
    bookingLimit,
    route(async (req, res) => {
      const { from, days } = parseSlotsQuery(req.query);
      const result = await getBookingSlots(from, days, {
        visitorHandle: cookieValue(req.headers.cookie, VISITOR_CALENDAR_COOKIE) ?? undefined,
      });
      /* This answer now carries one visitor's busy times and varies by their
         cookie. It is the one booking route that did not say so. */
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Vary", "Cookie");
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.body);
    }),
  );

  app.post(
    "/api/booking",
    bookingLimit,
    route(async (req, res) => {
      const result = await postBooking(req.body);
      if (!result.ok) {
        if (result.status === 409) {
          res.status(409).json(result.body);
          return;
        }
        res.status(result.status).json({ error: result.error });
        return;
      }
      const handle = cookieValue(req.headers.cookie, VISITOR_CALENDAR_COOKIE);
      if (handle) {
        await dropVisitorCalendar(handle);
        res.clearCookie(VISITOR_CALENDAR_COOKIE, { path: "/", sameSite: "lax" });
      }
      res.status(201).json(result.body);
    }),
  );

  /*
   * One time button of the email booking block, free or crossed out as the
   * calendar stands now (server/booking/slot-image.ts). Never cached: the
   * point is that a mail client asking again gets today's answer. The limit
   * is generous because mail proxies — Gmail's above all — fetch for many
   * readers from few addresses.
   */
  app.get(
    "/api/booking/slot/:date/:file",
    slotImageLimit,
    route(async (req, res) => {
      const date = String(req.params.date ?? "");
      const time = slotImageTime(String(req.params.file ?? ""));
      /* ?label=HHMM draws the reader's own time (a block made for another
         zone); whether it is crossed out is still the calendar slot's. */
      const rawLabel = (req.query as Record<string, unknown>).label;
      const label = typeof rawLabel === "string" ? slotImageTime(`${rawLabel}.png`) : rawLabel === undefined ? time : null;
      if (!isSlotDate(date) || !time || !label) {
        res.status(404).json({ error: "No such time." });
        return;
      }
      const state = await liveSlotState(date, time);
      const image = slotImage(label, state);
      if (!image) {
        res.status(404).json({ error: "No such time." });
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.status(200).end(image);
    }),
  );

  /*
   * The block worked out when the email is opened (server/booking/live-block.ts):
   * row N's weekday, its date, or one of its times, as the calendar stands
   * now. Never cached, like the slot pictures above.
   */
  app.get(
    "/api/booking/live/:row/:file",
    slotImageLimit,
    route(async (req, res) => {
      const row = Number(String(req.params.row ?? ""));
      const file = String(req.params.file ?? "");
      const query = req.query as Record<string, unknown>;
      const columns = liveColumns(typeof query.c === "string" ? query.c : "");
      const readerZone = typeof query.tz === "string" ? query.tz : "";
      const label = typeof query.label === "string" ? slotImageTime(`${query.label}.png`) ?? undefined : undefined;
      const image = Number.isInteger(row) && columns.length > 0
        ? await livePicture({ row, file, columns, readerZone, ...(label ? { label } : {}) })
        : null;
      if (!image) {
        res.status(404).json({ error: "No such picture." });
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.status(200).end(image);
    }),
  );

  /*
   * Reply to book: Resend's email.received webhook for BOOKING_INBOX_DOMAIN
   * (server/booking/reply-to-book.ts). Its fields are not trusted — the email
   * is read back from Resend's API by id — so this needs no secret of its own.
   * 503 asks Resend to try again; everything handled, or deliberately left
   * alone, is 200.
   */
  app.post(
    "/api/booking/inbound-email",
    bookingLimit,
    route(async (req, res) => {
      const result = await handleInboundEmail(req.body);
      if (result.status !== 200 || !["not-a-slot", "ignored"].includes(result.outcome)) {
        console.log(`[booking] inbound email: ${result.outcome}${result.detail ? ` (${result.detail})` : ""}`);
      }
      res.status(result.status).json({ ok: result.status === 200, outcome: result.outcome });
    }),
  );

  app.get(
    "/api/booking/email-confirm",
    bookingLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const token = typeof req.query.token === "string" ? req.query.token : "";
      res.json(emailHoldStatus(token));
    }),
  );

  app.post(
    "/api/booking/email-confirm",
    bookingLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const result = await confirmEmailHold(req.body?.token);
      if (!result.ok) {
        res.status(result.status).json(result.status === 409 ? { error: result.error, days: result.days } : { error: result.error });
        return;
      }
      res.status(result.status).json(result.body);
    }),
  );

  app.get(
    "/api/booking/confirmed",
    bookingLimit,
    route(async (req, res) => {
      /* Reports that the held booking has been proved — the calendar event
         exists — not merely that a WhatsApp message arrived. */
      const code = typeof req.query.code === "string" ? req.query.code : "";
      res.json(getBookingConfirmed(code));
    }),
  );

  app.get(
    "/api/booking",
    bookingLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const code = typeof req.query.code === "string" ? req.query.code : "";
      res.json(getExistingBooking(code));
    }),
  );

  app.post(
    "/api/booking/change",
    bookingLimit,
    route(async (req, res) => {
      const result = await changeBooking(req.body);
      if (!result.ok) {
        if (result.status === 409) {
          res.status(409).json(result.body);
          return;
        }
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.body);
    }),
  );

  app.post(
    "/api/booking/cancel",
    bookingLimit,
    route(async (req, res) => {
      const result = await cancelBooking(req.body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.body);
    }),
  );

  /*
   * https://top-rated.team/<code> — a WhatsApp booking's way back. The code is
   * the credential. A six-character path from the dictatable alphabet cannot
   * collide with any first-level route that exists today (none of them is six
   * characters). We hop to / with a short-lived cookie so the landing page
   * — which mounts the popup — can ask the server; the cookie is a pointer
   * for that hop and is not enough on its own after it expires.
   */
  app.get(/^\/([A-HJ-NP-Z2-9]{6})$/i, (req, res, next) => {
    if (isAdGrantHost(req.hostname)) {
      next();
      return;
    }
    const match = /^\/([A-HJ-NP-Z2-9]{6})$/i.exec(req.path);
    const raw = match?.[1] ?? "";
    if (!isBookingReturnCode(raw)) {
      next();
      return;
    }
    const code = normalizeBookingCode(raw);
    if (!code) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    /* secure in production. The value is the whole credential for reading,
       moving and cancelling this booking, and without the flag it travelled
       in the clear on any http:// request to the origin during its two
       minutes. Not set in development, where there is no https to serve it
       over and the cookie would simply never arrive.

       httpOnly stays FALSE on purpose and is the one exception to the rule
       above: the popup is the reader, it runs in the page, and a cookie the
       page cannot see is a cookie that cannot hand the code over. It is read
       once and cleared in the same breath — see takeBookingCredential. */
    res.cookie("booking_return", code, {
      maxAge: 120_000,
      sameSite: "lax",
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
    res.redirect(302, "/");
  });

  app.get(
    "/api/booking/linkedin",
    bookingLimit,
    route(async (req, res) => {
      const sessionId = typeof req.query.session === "string" ? req.query.session : "";
      if (sessionId) {
        res.setHeader("Cache-Control", "no-store");
        const session = getBookingLinkedInSession(sessionId);
        if (!session) {
          res.status(404).json({ error: "That sign-in has expired. Pick a time again." });
          return;
        }
        res.json(session);
        return;
      }

      const date = typeof req.query.date === "string" ? req.query.date : "";
      const time = typeof req.query.time === "string" ? req.query.time : "";
      if (!date && !time) {
        res.json(bookingLinkedInAvailability());
        return;
      }

      const start = startBookingLinkedIn({
        date,
        time,
        name: typeof req.query.name === "string" ? req.query.name : "",
        topic: typeof req.query.topic === "string" ? req.query.topic : "",
        returnPath: typeof req.query.return === "string" ? req.query.return : "/",
        publicBaseUrl: publicBaseUrl(req),
        host: publicBaseUrl(req),
      });
      if (!start.ok) {
        res.status(503).json({ error: start.line });
        return;
      }
      res.redirect(302, start.url);
    }),
  );

  app.get(
    "/api/booking/linkedin/callback",
    route(async (req, res) => {
      const result = await completeBookingLinkedIn({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
        host: publicBaseUrl(req),
      });
      res.redirect(302, result.redirectTo);
    }),
  );

  /*
   * The visitor's own Google Calendar, for the length of a pick. Two routes
   * a picker uses: connect, and drop. The callback is the return from Google
   * and is not a picker action. GET without connecting is what the picker
   * learns — offered or not, connected or not. A fork has no app, so offered
   * is false and the picker must not mention the option.
   *
   * Drop removes that visitor's own Google account and nothing else. Never
   * dan@top-rated.team, never a LinkedIn or WhatsApp account.
   */
  app.get(
    "/api/booking/calendar",
    bookingLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json(visitorCalendarView(cookieValue(req.headers.cookie, VISITOR_CALENDAR_COOKIE) ?? undefined));
    }),
  );

  app.get(
    "/api/booking/calendar/connect",
    bookingLimit,
    route(async (req, res) => {
      const start = startVisitorCalendarConnect({
        returnPath: typeof req.query.return === "string" ? req.query.return : "/",
        publicBaseUrl: publicBaseUrl(req),
      });
      if (!start.ok) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      /* The same value that goes to Google goes into a cookie, so only this
         browser can complete the return. See VISITOR_CALENDAR_STATE_COOKIE. */
      res.cookie(VISITOR_CALENDAR_STATE_COOKIE, start.state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: PENDING_VISITOR_CALENDAR_MS,
      });
      res.redirect(302, start.url);
    }),
  );

  app.get(
    "/api/booking/calendar/callback",
    route(async (req, res) => {
      const result = await completeVisitorCalendarConnect({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
        cookieState: cookieValue(req.headers.cookie, VISITOR_CALENDAR_STATE_COOKIE) ?? undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.clearCookie(VISITOR_CALENDAR_STATE_COOKIE, { path: "/", sameSite: "lax" });
      if (result.handle) {
        res.cookie(VISITOR_CALENDAR_COOKIE, result.handle, visitorCalendarCookieOptions());
      }
      res.redirect(302, result.redirectTo);
    }),
  );

  app.post(
    "/api/booking/calendar/drop",
    bookingLimit,
    route(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const view = await dropVisitorCalendar(
        cookieValue(req.headers.cookie, VISITOR_CALENDAR_COOKIE) ?? undefined,
      );
      res.clearCookie(VISITOR_CALENDAR_COOKIE, { path: "/", sameSite: "lax" });
      res.json(view);
    }),
  );

  /* The head adgrant.ai serves. An unfurler and most crawlers read the HTML
     as delivered and never run the application, so a title set at runtime by
     Meta.tsx is invisible to exactly the readers a preview exists for — and
     client/index.html is frozen and is the other site's. Substituted on the
     way out, for these hosts only.

     Nothing here answers in development: setupVite owns index.html then, and
     the dist file does not exist. Nothing here answers for a file either —
     the extension test keeps assets, the sitemap and the API on their own
     paths. */
  /* The library moved to its own domain, so the copies under /adgrant are
     duplicates of it. A permanent redirect rather than a canonical: a
     canonical is a request to a crawler and a 301 is an answer, and every
     link ever published keeps working either way.

     Only from our own two names. localhost and the Render address keep
     serving the tree in place, because that is where it is developed and a
     redirect to production would make it impossible to see a change.

     Two destinations since adgrant.ai went back to the product's own
     application: the library goes to the public site, and what only this
     process has — services, terms, privacy — goes to the app's address. See
     adgrantMovedOrigin. */
  const MOVED_FROM = new Set(["top-rated.team", "www.top-rated.team"]);
  app.get(/^\/adgrant(\/.*)?$/, (req, res, next) => {
    if (!MOVED_FROM.has(req.hostname)) return next();
    const rest = req.path.slice("/adgrant".length) || "/";
    const query = req.originalUrl.slice(req.path.length);
    res.redirect(301, `${adgrantMovedOrigin(rest)}${rest}${query}`);
  });

  /* resolveDistPath and not a path of our own: the first version of this
     line had an extra ".." in it, existsSync said no, and the route fell
     through in silence — adgrant.ai served the other site's head for a
     deploy while its redirects, its sitemap and its icon were all correct.
     Resolved once, lazily, because in development there is no dist at all
     and resolveDistPath throws rather than returning nothing. */
  let distIndex: string | null | undefined;
  const adgrantIndexPath = (): string | null => {
    if (distIndex !== undefined) return distIndex;
    try {
      distIndex = path.join(resolveDistPath(), "index.html");
    } catch {
      distIndex = null;
    }
    return distIndex;
  };
  app.get(/.*/, (req, res, next) => {
    if (req.method !== "GET") return next();
    if (!isAdGrantHost(req.hostname)) return next();
    if (path.extname(req.path)) return next();
    if (req.path.startsWith("/api/")) return next();
    if (!req.accepts("html")) return next();
    const index = adgrantIndexPath();
    if (!index || !fs.existsSync(index)) return next();
    /* The card image from the host that was asked, which is one of ours —
       isAdGrantHost said so above — and serves the file. A fixed origin would
       name a host that may be another application by now. */
    const { html, missed } = rewriteHead(fs.readFileSync(index, "utf8"), `https://${req.hostname.toLowerCase()}`);
    if (missed.length > 0) {
      /* The frozen file changed under us. Serving a head that is half one
         site and half the other would look fine and be wrong, so say so. */
      console.error(`[adgrant] head rewrite missed: ${missed.join(" | ")}`);
    }
    res.status(200).type("html").send(html);
  });

  /* One process answers two domains, so these two files cannot be static.
     registerRoutes runs before express.static, so an AdGrant host is answered
     here and ours falls through to client/public untouched. */
  app.get("/robots.txt", (req, res, next) => {
    if (!isAdGrantHost(req.hostname)) return next();
    res.type("text/plain").send(adgrantRobotsTxt(req.hostname));
  });

  app.get("/sitemap.xml", (req, res, next) => {
    if (!isAdGrantHost(req.hostname)) return next();
    /* Not a fall-through on the app's address: what is on disk is
       top-rated.team's sitemap, and the app asks not to be crawled. */
    if (isAdGrantAppHost(req.hostname)) {
      res.status(404).type("text/plain").send(`No sitemap here. The public site's is ${ADGRANT_ORIGIN}/sitemap.xml.\n`);
      return;
    }
    res.type("application/xml").send(adgrantSitemapXml());
  });

  /* Today's figures for the AdGrant.AI home page. A proxy because the source
     sends no CORS header, cached for six hours, and it answers with the
     figures this build shipped with when the source cannot be read — the page
     must never show a spinner where a measured number goes. */
  app.get(
    "/api/adgrant/stats",
    route(async (_req, res) => {
      const { stats, live } = await adGrantStats();
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.json({ stats, live });
    }),
  );

  /* Setup files for one starter template. Behind the same three-way sign-in
     as the rooms. Nothing here writes into a Google Ads account. */
  app.get(
    "/api/adgrant/templates/:slug/files",
    route(async (req, res) => {
      const session = await whoAmI(req.headers.cookie);
      if (!session.signedIn) {
        res.status(401).json({ error: ADGRANT_TEMPLATE_FILES_UNAUTHORIZED_LINE });
        return;
      }
      const slug = typeof req.params.slug === "string" ? req.params.slug : "";
      const result = templateSetupFiles(slug);
      res.status(result.status).json(result.body);
    }),
  );

  app.post(
    "/api/workspaces/:token/adgrant/generate",
    askLimit,
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;
      const result = await generateAdGrantStructure({ workspaceId: state.workspace.id, body: req.body });
      res.status(result.status).json(result.body);
    }),
  );

  app.get(
    "/api/workspaces/:token/adgrant/generations",
    route(async (req, res) => {
      const state = await requireWorkspace(req, res);
      if (!state) return;
      const result = await getAdGrantGenerationQuota(state.workspace.id);
      res.status(result.status).json(result.body);
    }),
  );

  app.use("/api/connector/mcp", connectorMcp);
  app.use("/api/connector", connectorRouter);

  // Anything else under /api is a missing endpoint, not a client route: without
  // this it would fall through to the SPA and answer HTML to a fetch().
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  installBookingInbound();
  void ensureInboundWebhooks();
}
