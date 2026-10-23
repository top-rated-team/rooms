/**
 * A proposed change in a thread, approved or declined, and recorded.
 *
 * The product's compliance posture is that a person approves anything that
 * leaves the room. This file is the record that posture needs: what would
 * change, what is there now, who decided, and when. The shape is the
 * Top-Voice proposal card — a New/Edit heading, a before and after per
 * field, two buttons — not a new invention.
 *
 * APPROVING DOES NOT WRITE TO AN ACCOUNT. There is no Google Ads connection
 * in this repository, no OAuth grant, no job runner. Pressing Approve writes
 * a name and a time onto the row and into the thread. The same object is
 * what a later visit reads. Nothing a visitor reads claims a write happened.
 *
 * WHERE THIS LIVES. In memory, in this process, with a copy on the message
 * that was posted — the same constraint server/payments.ts has, because this
 * parcel does not own shared/schema.ts. A restart drops the map. Deciding
 * after a restart still works when the message is still there, because the
 * row is rebuilt from that message rather than invented.
 */

import { nanoid } from "nanoid";
import { z } from "zod";
import type { ThreadApproval, ThreadApprovalStatus, ApprovalChange } from "@shared/api";
import type { Message, MessageMeta } from "@shared/schema";
import { storage } from "./storage";
import { broadcast } from "./ws";

export const MAX_CHANGES = 40;
export const MAX_FIELD_LENGTH = 80;
export const MAX_SUMMARY_LENGTH = 400;
export const MAX_KIND_LENGTH = 80;
export const MAX_TARGET_NAME_LENGTH = 160;
export const MAX_NAME_LENGTH = 120;

const STATUSES: ThreadApprovalStatus[] = ["pending", "approved", "declined"];

const changeInputSchema = z.object({
  field: z.string().min(1).max(MAX_FIELD_LENGTH),
  from: z.unknown().optional(),
  to: z.unknown().optional(),
});

export const proposeApprovalSchema = z.object({
  channelId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  summary: z.string().min(1).max(MAX_SUMMARY_LENGTH),
  kind: z.string().min(1).max(MAX_KIND_LENGTH),
  creates: z.boolean().optional(),
  targetName: z.string().max(MAX_TARGET_NAME_LENGTH).nullable().optional(),
  changes: z.array(changeInputSchema).min(1).max(MAX_CHANGES),
  proposedBy: z.string().min(1).max(MAX_NAME_LENGTH),
});

export type ProposeApprovalInput = z.infer<typeof proposeApprovalSchema>;

export const decideApprovalSchema = z.object({
  by: z.string().min(1).max(MAX_NAME_LENGTH),
  action: z.enum(["approve", "decline"]),
});

export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

interface StoredApproval {
  id: string;
  workspaceId: string;
  messageId: string;
  channelId: string;
  parentId: string | null;
  summary: string;
  kind: string;
  creates: boolean;
  targetName: string | null;
  changes: ApprovalChange[];
  status: ThreadApprovalStatus;
  proposedBy: string;
  proposedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

const approvals = new Map<string, StoredApproval>();

export function resetApprovalsForTests(): void {
  approvals.clear();
}

/**
 * The one line that says what approving this would do.
 *
 * Ported from Top-Voice `proposalHeading`: "New campaign «Spring launch»" or
 * "Edit campaign «Spring launch»" — the verb and the name are the two facts
 * a person needs before pressing Approve. The summary the proposer wrote
 * does not reliably state either.
 */
export function approvalHeading(creates: boolean, kind: string, targetName: string | null): string {
  const noun = kind.trim() || "change";
  const name = typeof targetName === "string" && targetName.trim() ? targetName.trim() : null;
  const head = `${creates ? "New" : "Edit"} ${noun}`;
  return name ? `${head} «${name}»` : head;
}

/**
 * How a value is printed in a before/after row. Ported from Top-Voice
 * `formatValue`: empty is an em-dash, not a blank, so a missing current
 * value and an actually-empty field cannot be mistaken for each other on
 * the screen. Booleans are on/off.
 */
export function formatApprovalValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((entry) => formatApprovalValue(entry)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function toPublic(stored: StoredApproval): ThreadApproval {
  return {
    id: stored.id,
    heading: approvalHeading(stored.creates, stored.kind, stored.targetName),
    summary: stored.summary,
    kind: stored.kind,
    creates: stored.creates,
    targetName: stored.targetName,
    changes: stored.changes,
    status: stored.status,
    proposedBy: stored.proposedBy,
    proposedAt: stored.proposedAt,
    decidedBy: stored.decidedBy,
    decidedAt: stored.decidedAt,
    channelId: stored.channelId,
    parentId: stored.parentId,
  };
}

function changeLines(changes: ApprovalChange[]): string {
  return changes.map((change) => `${change.field}: ${formatApprovalValue(change.from)} → ${formatApprovalValue(change.to)}`).join(". ");
}

function pendingBody(approval: ThreadApproval): string {
  return `${approval.heading}. ${approval.summary} ${changeLines(approval.changes)}. Approve records who agreed, and when. It does not write this change to any account.`;
}

function approvedBody(approval: ThreadApproval): string {
  const when = approval.decidedAt ? dayLabel(approval.decidedAt) : "an unknown date";
  const who = approval.decidedBy ?? "someone in this room";
  return `${approval.heading} was approved by ${who} on ${when}. The same before and after is what this room keeps. Nothing was written to an account from this room.`;
}

function declinedBody(approval: ThreadApproval): string {
  const when = approval.decidedAt ? dayLabel(approval.decidedAt) : "an unknown date";
  const who = approval.decidedBy ?? "someone in this room";
  return `${approval.heading} was declined by ${who} on ${when}.`;
}

function noticeBody(approval: ThreadApproval): string {
  if (approval.status === "approved") {
    const when = approval.decidedAt ? dayLabel(approval.decidedAt) : "an unknown date";
    const who = approval.decidedBy ?? "someone in this room";
    return `Approved by ${who} on ${when}: ${approval.heading}.`;
  }
  const when = approval.decidedAt ? dayLabel(approval.decidedAt) : "an unknown date";
  const who = approval.decidedBy ?? "someone in this room";
  return `Declined by ${who} on ${when}: ${approval.heading}.`;
}

function bodyFor(approval: ThreadApproval): string {
  if (approval.status === "approved") return approvedBody(approval);
  if (approval.status === "declined") return declinedBody(approval);
  return pendingBody(approval);
}

function approvalMeta(stored: StoredApproval): MessageMeta {
  return { approval: toPublic(stored) };
}

function isChange(value: unknown): value is ApprovalChange {
  if (value === null || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  if (typeof change.field !== "string" || !change.field.trim()) return false;
  return Object.prototype.hasOwnProperty.call(change, "from") && Object.prototype.hasOwnProperty.call(change, "to");
}

function storedFromMessage(workspaceId: string, message: Message): StoredApproval | null {
  const meta = message.meta ?? {};
  const raw = meta.approval;
  if (raw === null || typeof raw !== "object") return null;
  const approval = raw as Record<string, unknown>;
  if (typeof approval.id !== "string" || !approval.id) return null;
  if (typeof approval.summary !== "string" || !approval.summary) return null;
  if (typeof approval.kind !== "string" || !approval.kind) return null;
  if (typeof approval.creates !== "boolean") return null;
  if (approval.targetName !== null && typeof approval.targetName !== "string") return null;
  if (!Array.isArray(approval.changes) || approval.changes.length === 0) return null;
  const changes = approval.changes.filter(isChange);
  if (changes.length !== approval.changes.length) return null;
  if (typeof approval.status !== "string" || !STATUSES.includes(approval.status as ThreadApprovalStatus)) return null;
  if (typeof approval.proposedBy !== "string" || !approval.proposedBy) return null;
  if (typeof approval.proposedAt !== "string" || !approval.proposedAt) return null;
  if (approval.decidedBy !== null && typeof approval.decidedBy !== "string") return null;
  if (approval.decidedAt !== null && typeof approval.decidedAt !== "string") return null;
  const parentId =
    typeof approval.parentId === "string" ? approval.parentId : approval.parentId === null ? null : message.parentId;
  return {
    id: approval.id,
    workspaceId,
    messageId: message.id,
    channelId: typeof approval.channelId === "string" ? approval.channelId : message.channelId,
    parentId,
    summary: approval.summary,
    kind: approval.kind,
    creates: approval.creates,
    targetName: typeof approval.targetName === "string" ? approval.targetName : null,
    changes,
    status: approval.status as ThreadApprovalStatus,
    proposedBy: approval.proposedBy,
    proposedAt: approval.proposedAt,
    decidedBy: typeof approval.decidedBy === "string" ? approval.decidedBy : null,
    decidedAt: typeof approval.decidedAt === "string" ? approval.decidedAt : null,
  };
}

export type ProposeApprovalResult =
  | { ok: true; approval: ThreadApproval; message: Message }
  | { ok: false; error: string };

export type DecideApprovalResult =
  | { ok: true; approval: ThreadApproval; message: Message; notice: Message }
  | { ok: false; error: string; missing?: boolean };

export type ReadApprovalResult =
  | { ok: true; approval: ThreadApproval }
  | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  const first = error.issues[0];
  return first ? `${first.path.join(".") || "body"}: ${first.message}` : "That is not an approval this room can hold.";
}

function hasOwnFrom(change: { from?: unknown }): boolean {
  return Object.prototype.hasOwnProperty.call(change, "from");
}

function normalizeChanges(
  input: ProposeApprovalInput["changes"],
  creates: boolean,
): { ok: true; changes: ApprovalChange[] } | { ok: false; error: string } {
  const changes: ApprovalChange[] = [];
  for (const raw of input) {
    const field = raw.field.trim();
    if (!field) return { ok: false, error: "A change has to name the field." };
    if (!Object.prototype.hasOwnProperty.call(raw, "to")) {
      return { ok: false, error: "A change has to say what it would become." };
    }
    if (!creates && !hasOwnFrom(raw)) {
      return {
        ok: false,
        error: "A change has to show what is there now. Approving a direction is not the same as approving a diff.",
      };
    }
    changes.push({
      field,
      from: hasOwnFrom(raw) ? raw.from : null,
      to: raw.to,
    });
  }
  return { ok: true, changes };
}

async function loadStored(token: string, approvalId: string): Promise<StoredApproval | null> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;

  const fromMem = approvals.get(approvalId);
  if (fromMem && fromMem.workspaceId === state.workspace.id) return fromMem;

  for (const message of state.messages) {
    const stored = storedFromMessage(state.workspace.id, message);
    if (stored && stored.id === approvalId) {
      approvals.set(stored.id, stored);
      return stored;
    }
  }
  return null;
}

/**
 * Puts one proposed change in a channel. The message body already names the
 * heading, the before and after, and that approving does not write to an
 * account, so a room that has not yet rendered the card still tells the truth.
 */
export async function proposeApproval(token: string, input: ProposeApprovalInput): Promise<ProposeApprovalResult> {
  const parsed = proposeApprovalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

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

  const summary = data.summary.trim();
  if (!summary) return { ok: false, error: "A proposal has to say why." };
  const kind = data.kind.trim();
  if (!kind) return { ok: false, error: "A proposal has to say what kind of thing this is." };
  const proposedBy = data.proposedBy.trim();
  if (!proposedBy) return { ok: false, error: "A proposal has to say who put it here." };

  const creates = data.creates === true;
  const targetName = data.targetName?.trim() ? data.targetName.trim() : null;
  const normalized = normalizeChanges(data.changes, creates);
  if (!normalized.ok) return normalized;

  const stored: StoredApproval = {
    id: nanoid(),
    workspaceId: state.workspace.id,
    messageId: "",
    channelId: data.channelId,
    parentId: data.parentId ?? null,
    summary,
    kind,
    creates,
    targetName,
    changes: normalized.changes,
    status: "pending",
    proposedBy,
    proposedAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
  };

  const publicApproval = toPublic(stored);
  const message = await storage.addMessage(state.workspace.id, {
    channelId: data.channelId,
    parentId: stored.parentId,
    authorKey: "system",
    authorKind: "system",
    body: pendingBody(publicApproval),
    meta: approvalMeta(stored),
  });
  stored.messageId = message.id;
  approvals.set(stored.id, stored);

  broadcast(token, { type: "message", message });
  return { ok: true, approval: toPublic(stored), message };
}

/**
 * Records who approved or declined, and when. Synchronous on the map so two
 * clicks in the same tick cannot both think they were first. A second click
 * of the same decision is returned as success without a second notice. The
 * opposite decision is refused: an approval is not something this room
 * silently reverses.
 */
export async function decideApproval(
  token: string,
  approvalId: string,
  input: DecideApprovalInput,
): Promise<DecideApprovalResult> {
  const parsed = decideApprovalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const id = approvalId.trim();
  if (!id) return { ok: false, error: "Unknown approval", missing: true };

  const by = parsed.data.by.trim();
  if (!by) return { ok: false, error: "A name is needed so this record says who decided." };

  const stored = await loadStored(token, id);
  if (!stored) return { ok: false, error: "Unknown approval", missing: true };

  const wanted: ThreadApprovalStatus = parsed.data.action === "approve" ? "approved" : "declined";

  if (stored.status !== "pending") {
    if (stored.status === wanted) {
      const publicApproval = toPublic(stored);
      const message = await storage.updateMessage(stored.messageId, {
        body: bodyFor(publicApproval),
        meta: approvalMeta(stored),
      });
      if (!message) return { ok: false, error: "Unknown approval", missing: true };
      return { ok: true, approval: publicApproval, message, notice: message };
    }
    return {
      ok: false,
      error:
        stored.status === "approved"
          ? "This was already approved. The record is the name and time on this message."
          : "This was already declined. The record is the name and time on this message.",
    };
  }

  stored.status = wanted;
  stored.decidedBy = by;
  stored.decidedAt = new Date().toISOString();
  approvals.set(stored.id, stored);

  const publicApproval = toPublic(stored);
  const message = await storage.updateMessage(stored.messageId, {
    body: bodyFor(publicApproval),
    meta: approvalMeta(stored),
  });
  if (!message) return { ok: false, error: "Unknown approval", missing: true };

  broadcast(token, {
    type: "message_done",
    id: message.id,
    channelId: message.channelId,
    body: message.body,
  });

  const notice = await storage.addMessage(stored.workspaceId, {
    channelId: stored.channelId,
    parentId: stored.parentId,
    authorKey: "system",
    authorKind: "system",
    body: noticeBody(publicApproval),
    meta: { approvalId: stored.id, decided: true },
  });
  broadcast(token, { type: "message", message: notice });
  return { ok: true, approval: publicApproval, message, notice };
}

export async function readApproval(token: string, approvalId: string): Promise<ReadApprovalResult> {
  const stored = await loadStored(token, approvalId);
  if (!stored) return { ok: false, error: "Unknown approval" };
  return { ok: true, approval: toPublic(stored) };
}

export async function listApprovals(token: string): Promise<ThreadApproval[] | null> {
  const state = await storage.getWorkspaceByToken(token);
  if (!state) return null;
  const found = new Map<string, StoredApproval>();
  for (const message of state.messages) {
    const stored = storedFromMessage(state.workspace.id, message);
    if (stored) found.set(stored.id, stored);
  }
  for (const stored of approvals.values()) {
    if (stored.workspaceId === state.workspace.id) found.set(stored.id, stored);
  }
  return Array.from(found.values()).map(toPublic);
}
