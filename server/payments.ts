/**
 * A price in a thread, paid, and recorded in the room.
 *
 * There is no pricing page, no plan, and no subscription. A person puts one
 * amount in a channel (or under one turn), the visitor pays it, and the room
 * keeps that fact. Two issuers, because the money is two invoices:
 *
 *   - the person doing the work invoices the work
 *   - Top-Rated Team invoices its own fee separately
 *
 * The card has to say which of those a given amount is. A shared invoice would
 * put Top-Rated Team on work it does not sell — see docs/doors.md.
 *
 * THIS SITE DOES NOT TAKE THE MONEY. There is no card processor in this
 * repository. Pressing Pay writes the paid state onto the row and into the
 * thread. The named company still sends the invoice. Nothing a visitor reads
 * claims otherwise.
 *
 * WHERE THIS LIVES. In memory, in this process, with a copy on the message
 * that was posted — the same constraint server/identity.ts has, because this
 * parcel does not own shared/schema.ts. A restart drops the map. Paying after
 * a restart still works when the message is still there, because the row is
 * rebuilt from that message rather than invented. Nothing here promises a
 * payment will survive a restart that also wiped the room.
 */

import { nanoid } from "nanoid";
import { z } from "zod";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import type { ThreadPrice } from "@shared/api";
import type { Message, MessageMeta } from "@shared/schema";
import { storage } from "./storage";
import { broadcast } from "./ws";

/** The company that invoices a house fee. Read off its own door, never retyped. */
export const HOUSE_LEGAL_NAME = DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;

export const MAX_CENTS = 10_000_000;
export const MAX_FOR_LENGTH = 300;
export const MAX_LEGAL_NAME_LENGTH = 160;

const CURRENCY = "USD";

export const issuePriceSchema = z.object({
  channelId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  cents: z.number().int().positive().max(MAX_CENTS),
  currency: z.literal(CURRENCY).optional(),
  for: z.string().min(1).max(MAX_FOR_LENGTH),
  issuer: z.enum(["expert", "house"]),
  legalName: z.string().min(1).max(MAX_LEGAL_NAME_LENGTH).optional(),
});

export type IssuePriceInput = z.infer<typeof issuePriceSchema>;

interface StoredPrice {
  id: string;
  workspaceId: string;
  messageId: string;
  channelId: string;
  parentId: string | null;
  cents: number;
  currency: string;
  for: string;
  issuer: "expert" | "house";
  legalName: string;
  status: "open" | "paid";
  paidAt: string | null;
}

const prices = new Map<string, StoredPrice>();

export function resetPaymentsForTests(): void {
  prices.clear();
}

export function formatPriceAmount(cents: number, currency: string = CURRENCY): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function toPublic(stored: StoredPrice): ThreadPrice {
  return {
    id: stored.id,
    amount: formatPriceAmount(stored.cents, stored.currency),
    currency: stored.currency,
    for: stored.for,
    issuer: stored.issuer,
    legalName: stored.legalName,
    status: stored.status,
    paidAt: stored.paidAt,
    channelId: stored.channelId,
    parentId: stored.parentId,
  };
}

function openBody(price: ThreadPrice): string {
  return `${price.amount} for ${price.for}. Invoiced by ${price.legalName}. Pay records this as paid in the room. This site does not take the money.`;
}

function paidBody(price: ThreadPrice): string {
  return `${price.amount} for ${price.for} is recorded as paid. The invoice is ${price.legalName}'s, sent by them. This site does not take the money.`;
}

function paidNoticeBody(price: ThreadPrice): string {
  return `Recorded as paid: ${price.amount} for ${price.for}. The invoice is ${price.legalName}'s.`;
}

function doorIdOf(source: Record<string, string> | null | undefined): string | undefined {
  const raw = source?.door?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * A house fee belongs only in a room whose door is already invoiced by
 * Top-Rated Team. Putting one in a partner room would print our name on work
 * we do not sell. An unstamped room has not named a company at all, so it
 * cannot carry ours either.
 */
export function houseFeeAllowed(doorId: string | undefined): boolean {
  if (!doorId) return false;
  const door = DOOR_BY_ID[doorId];
  return door?.contract.legalName === HOUSE_LEGAL_NAME;
}

function expertNameAllowed(legalName: string, doorId: string | undefined): boolean {
  if (!doorId) return true;
  const door = DOOR_BY_ID[doorId];
  if (!door) return true;
  if (door.contract.legalName === HOUSE_LEGAL_NAME) return true;
  return legalName !== HOUSE_LEGAL_NAME;
}

function priceMeta(stored: StoredPrice): MessageMeta {
  return { price: toPublic(stored), priceCents: stored.cents };
}

function storedFromMessage(workspaceId: string, message: Message): StoredPrice | null {
  const meta = message.meta ?? {};
  const raw = meta.price;
  if (raw === null || typeof raw !== "object") return null;
  const price = raw as Record<string, unknown>;
  if (typeof price.id !== "string" || !price.id) return null;
  if (price.issuer !== "expert" && price.issuer !== "house") return null;
  if (price.status !== "open" && price.status !== "paid") return null;
  if (typeof price.for !== "string" || !price.for) return null;
  if (typeof price.legalName !== "string" || !price.legalName) return null;
  const cents = typeof meta.priceCents === "number" && Number.isInteger(meta.priceCents) ? meta.priceCents : null;
  if (cents === null || cents <= 0 || cents > MAX_CENTS) return null;
  const parentId = typeof price.parentId === "string" ? price.parentId : price.parentId === null ? null : message.parentId;
  return {
    id: price.id,
    workspaceId,
    messageId: message.id,
    channelId: typeof price.channelId === "string" ? price.channelId : message.channelId,
    parentId,
    cents,
    currency: typeof price.currency === "string" && price.currency ? price.currency : CURRENCY,
    for: price.for,
    issuer: price.issuer,
    legalName: price.legalName,
    status: price.status,
    paidAt: typeof price.paidAt === "string" ? price.paidAt : null,
  };
}

export type IssuePriceResult =
  | { ok: true; price: ThreadPrice; message: Message }
  | { ok: false; error: string };

export type PayPriceResult =
  | { ok: true; price: ThreadPrice; message: Message; notice: Message }
  | { ok: false; error: string };

export type ReadPriceResult =
  | { ok: true; price: ThreadPrice }
  | { ok: false; error: string };

async function loadStored(token: string, priceId: string): Promise<StoredPrice | null> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;

  const fromMem = prices.get(priceId);
  if (fromMem && fromMem.workspaceId === state.workspace.id) return fromMem;

  for (const message of state.messages) {
    const stored = storedFromMessage(state.workspace.id, message);
    if (stored && stored.id === priceId) {
      prices.set(stored.id, stored);
      return stored;
    }
  }
  return null;
}

/**
 * Puts one price in a channel. The message body already names the amount and
 * the issuer, so a room that has not yet rendered the card still tells the
 * truth.
 */
export async function issuePrice(token: string, input: IssuePriceInput): Promise<IssuePriceResult> {
  const parsed = issuePriceSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? `${first.path.join(".") || "body"}: ${first.message}` : "That is not a price this room can hold." };
  }

  const state = await storage.getWorkspaceByToken(token);
  if (!state) return { ok: false, error: "Workspace not found" };

  const data = parsed.data;
  const channel = state.channels.find((candidate) => candidate.id === data.channelId);
  if (!channel) return { ok: false, error: "Unknown channel for this workspace" };

  if (data.parentId) {
    const parent = state.messages.find((message) => message.id === data.parentId);
    if (!parent || parent.channelId !== data.channelId) {
      return { ok: false, error: "Unknown thread for this channel" };
    }
  }

  const what = data.for.trim();
  if (!what) return { ok: false, error: "A price has to say what it is for." };

  const doorId = doorIdOf(state.workspace.source);
  let legalName: string;
  if (data.issuer === "house") {
    if (!houseFeeAllowed(doorId)) {
      return {
        ok: false,
        error:
          "Top-Rated Team cannot put its own fee in this room. The company that invoices this room is not Top-Rated Team, and a house fee here would print our name on their work.",
      };
    }
    legalName = HOUSE_LEGAL_NAME;
  } else {
    const name = data.legalName?.trim() ?? "";
    if (!name) return { ok: false, error: "An expert price needs the legal name of the person or company that invoices it." };
    if (!expertNameAllowed(name, doorId)) {
      return {
        ok: false,
        error:
          "This room is not Top-Rated Team's. An invoice in it cannot carry Top-Rated Team's name.",
      };
    }
    legalName = name;
  }

  const stored: StoredPrice = {
    id: nanoid(),
    workspaceId: state.workspace.id,
    messageId: "",
    channelId: data.channelId,
    parentId: data.parentId ?? null,
    cents: data.cents,
    currency: data.currency ?? CURRENCY,
    for: what,
    issuer: data.issuer,
    legalName,
    status: "open",
    paidAt: null,
  };

  const publicPrice = toPublic(stored);
  const message = await storage.addMessage(state.workspace.id, {
    channelId: data.channelId,
    parentId: stored.parentId,
    authorKey: "system",
    authorKind: "system",
    body: openBody(publicPrice),
    meta: priceMeta(stored),
  });
  stored.messageId = message.id;
  prices.set(stored.id, stored);

  broadcast(token, { type: "message", message });
  return { ok: true, price: toPublic(stored), message };
}

/**
 * Records that this price is paid. Synchronous on the map so two clicks in
 * the same tick cannot both think they were first. Already-paid is returned
 * as success with the existing notice omitted — the clicker sees paid, the
 * thread is not given a second line for the same fact.
 */
export async function payPrice(token: string, priceId: string): Promise<PayPriceResult> {
  const id = priceId.trim();
  if (!id) return { ok: false, error: "Unknown price" };

  const stored = await loadStored(token, id);
  if (!stored) return { ok: false, error: "Unknown price" };

  const alreadyPaid = stored.status === "paid";
  if (!alreadyPaid) {
    stored.status = "paid";
    stored.paidAt = new Date().toISOString();
    prices.set(stored.id, stored);
  }

  const publicPrice = toPublic(stored);
  const message = await storage.updateMessage(stored.messageId, {
    body: paidBody(publicPrice),
    meta: priceMeta(stored),
  });
  if (!message) return { ok: false, error: "Unknown price" };

  // message_done updates the existing turn's body for anyone already looking.
  // A new `message` event would be ignored: the client skips ids it already has.
  broadcast(token, {
    type: "message_done",
    id: message.id,
    channelId: message.channelId,
    body: message.body,
  });

  if (alreadyPaid) {
    return { ok: true, price: publicPrice, message, notice: message };
  }

  const notice = await storage.addMessage(stored.workspaceId, {
    channelId: stored.channelId,
    parentId: stored.parentId,
    authorKey: "system",
    authorKind: "system",
    body: paidNoticeBody(publicPrice),
    meta: { priceId: stored.id, paid: true },
  });
  broadcast(token, { type: "message", message: notice });
  return { ok: true, price: publicPrice, message, notice };
}

export async function readPrice(token: string, priceId: string): Promise<ReadPriceResult> {
  const stored = await loadStored(token, priceId);
  if (!stored) return { ok: false, error: "Unknown price" };
  return { ok: true, price: toPublic(stored) };
}

export async function listPrices(token: string): Promise<ThreadPrice[] | null> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;
  const found = new Map<string, StoredPrice>();
  for (const message of state.messages) {
    const stored = storedFromMessage(state.workspace.id, message);
    if (stored) found.set(stored.id, stored);
  }
  for (const stored of prices.values()) {
    if (stored.workspaceId === state.workspace.id) found.set(stored.id, stored);
  }
  return Array.from(found.values()).map(toPublic);
}
