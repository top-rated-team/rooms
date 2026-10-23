/**
 * Attribution is the whole bridge.
 *
 * One WhatsApp number and one ChatWoot inbox carry many speakers: Dan, each
 * contractor, and any agent either side has added. WhatsApp shows the client
 * one sender for all of them. So every outbound message names who is speaking
 * before it says anything else, and that name is taken from the room's member
 * record rather than from whoever typed it. A convention a person has to
 * remember is a convention that fails on a Friday.
 *
 * The six badges already exist and are already held to in MemberRail.tsx. They
 * are copied here rather than imported from the client, so the server cannot
 * drift into "AI", "Bot" or "Human". A person is a person. An agent says it is
 * an agent. An agent's message must never arrive looking like a person's —
 * the same rule as the room, and it matters more here because WhatsApp strips
 * every other cue.
 *
 * Inbound is the mirror problem: a WhatsApp group tells you a phone number,
 * not which of three people on the client's side wrote. Map what you can.
 * Where you cannot, say so in the room rather than guessing. A wrongly
 * attributed client message is worse than an unattributed one.
 */

import { EXPERTS } from "@shared/roster";
import type { Member, MemberKind } from "@shared/schema";

/** The room's own vocabulary. A seventh needs an argument. */
export type RoomBadge = "Owner" | "Contractor" | "Client" | "Partner team" | "Guest" | "Agent";

export const ROOM_BADGES: RoomBadge[] = ["Owner", "Contractor", "Client", "Partner team", "Guest", "Agent"];

const OWNER_KEYS = new Set(EXPERTS.filter((row) => row.badge === "Owner").map((row) => row.memberKey));

export const UNATTRIBUTED_AUTHOR_KEY = "unattributed";

export type BridgeSource = "whatsapp" | "chatwoot" | "slack" | "clickup";

export interface MemberRef {
  memberKey: string;
  kind: MemberKind;
  displayName: string;
}

export interface AttributionLine {
  displayName: string;
  badge: RoomBadge;
  /** First line of the outbound message, before anything else is said. */
  header: string;
}

/**
 * What must not leave the room over a bridge. The panel prints the same
 * facts. A link in a group chat is the account.
 */
export const MUST_NOT_CROSS = [
  "the room token — a /w/ link in a group chat is the account",
  "passwords, API keys, cookies and session tokens",
  "anything outside the one WhatsApp chat, one Slack channel or one ClickUp list this bridge is connected to",
] as const;

const WITHHELD = "[room address withheld]";

/**
 * The badge a member carries on the wire. An agent is Agent even when the
 * display name looks like a person, even when the kind field has been
 * tampered with, even when the memberKey is the only honest signal.
 */
export function badgeForMember(member: Pick<MemberRef, "memberKey" | "kind">): RoomBadge {
  if (member.kind === "agent" || member.memberKey.startsWith("agent:")) return "Agent";
  if (member.kind === "visitor") return "Guest";
  if (OWNER_KEYS.has(member.memberKey)) return "Owner";
  return "Contractor";
}

export function attributionFor(member: MemberRef): AttributionLine {
  const badge = badgeForMember(member);
  const displayName = member.displayName.trim() || (badge === "Agent" ? "Agent" : "Someone");
  return { displayName, badge, header: `${displayName} · ${badge}` };
}

/**
 * The outbound body. The header is always first, always from the member
 * record, and always carries the badge so WhatsApp cannot strip the only cue.
 */
export function formatOutboundText(member: MemberRef, body: string): string {
  const { header } = attributionFor(member);
  const text = body.trim();
  return text.length > 0 ? `${header}\n${text}` : header;
}

export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The room token is a bearer credential. It does not go out, including when
 * somebody pastes the room address into a message they think is staying here.
 */
export function stripRoomToken(text: string, token: string): string {
  if (!token) return text;
  const escaped = escapeForRegExp(token);
  return text
    .replace(new RegExp(`https?:\\/\\/\\S*\\/w\\/${escaped}\\b`, "gi"), WITHHELD)
    .replace(new RegExp(`\\/w\\/${escaped}\\b`, "g"), WITHHELD)
    .replace(new RegExp(`\\b${escaped}\\b`, "g"), WITHHELD);
}

export interface OutboundPayload {
  /** Attributed body, with the room token already stripped. */
  text: string;
  /** Destination on that bridge. Never a room token. */
  to: string;
}

export function buildOutboundPayload(member: MemberRef, body: string, token: string, to: string): OutboundPayload {
  return {
    text: stripRoomToken(formatOutboundText(member, body), token),
    to,
  };
}

/** True when a payload about to be POSTed still carries the room token. */
export function payloadContainsToken(payload: unknown, token: string): boolean {
  if (!token) return false;
  try {
    return JSON.stringify(payload).includes(token);
  } catch {
    return String(payload).includes(token);
  }
}

export interface InboundSender {
  source: BridgeSource;
  /**
   * A phone in digits, a ChatWoot user id, a Slack user id. Not a display
   * name — matching on a name is guessing.
   */
  senderId: string | null;
  /** A WhatsApp group, a Slack channel, a shared inbox: several people, one destination. */
  shared: boolean;
  /** The chat, conversation, channel or list this arrived on. */
  target: string;
}

export interface InboundAttribution {
  kind: "mapped" | "unattributed";
  memberKey: string | null;
  reason: string;
}

export function normalizeSender(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const beforeAt = trimmed.includes("@") ? trimmed.slice(0, trimmed.indexOf("@")) : trimmed;
  const digits = beforeAt.replace(/\D/g, "");
  if (digits.length >= 8) return digits;
  return trimmed.toLowerCase();
}

/**
 * Map an inbound sender onto a room member. The only maps that count are an
 * explicit sender→member table, and a one-to-one chat that was connected as
 * this client's. A display name is not consulted. A group with one visitor in
 * the room is still a group.
 */
export function mapInboundSender(
  inbound: InboundSender,
  members: ReadonlyArray<Pick<Member, "memberKey">>,
  senderMap: ReadonlyMap<string, string>,
  oneToOneVisitorKey?: string | null,
): InboundAttribution {
  const keys = new Set(members.map((row) => row.memberKey));

  if (inbound.senderId) {
    const mapped = senderMap.get(normalizeSender(inbound.senderId));
    if (mapped && keys.has(mapped)) {
      return { kind: "mapped", memberKey: mapped, reason: "explicit map" };
    }
  }

  if (!inbound.shared && oneToOneVisitorKey && keys.has(oneToOneVisitorKey)) {
    return { kind: "mapped", memberKey: oneToOneVisitorKey, reason: "one-to-one bound chat" };
  }

  return {
    kind: "unattributed",
    memberKey: null,
    reason: "unmapped",
  };
}

export function unattributedLine(source: BridgeSource): string {
  if (source === "whatsapp") {
    return "From WhatsApp, sender not identified. A phone number is not enough to tell which of the people on their side wrote this.";
  }
  if (source === "chatwoot") {
    return "From ChatWoot, sender not identified. This inbox is shared, and the sender was not mapped to a member of this room.";
  }
  if (source === "slack") {
    return "From Slack, sender not identified. The user was not mapped to a member of this room.";
  }
  return "From ClickUp, sender not identified. The user was not mapped to a member of this room.";
}

export const DELIVERY_FAILED: Record<BridgeSource, string> = {
  whatsapp: "This was not delivered to WhatsApp. WhatsApp could not be reached.",
  chatwoot: "This was not delivered to ChatWoot. ChatWoot could not be reached.",
  slack: "This was not delivered to Slack. Slack could not be reached.",
  clickup: "This was not delivered to ClickUp. ClickUp could not be reached.",
};
