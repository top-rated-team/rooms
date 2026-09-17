import { pgTable, text, integer, index } from "drizzle-orm/pg-core";

import type { SeatMode } from "./api";

/**
 * Somebody else's agent, admitted to one thread of one room.
 *
 * IT LIVED IN A MAP, and said so out loud: the line this file makes obsolete
 * was "This admission is remembered in this process. A restart forgets the
 * credential." This service redeploys several times a day, so a partner who
 * was given a credential on Tuesday had a dead one by Wednesday, and the only
 * notice was their agent quietly failing to authenticate. That is the fifth
 * parcel here to ship durable state in a Map, which is why it is a table.
 *
 * WHAT IS IN `credential_hash`. A SHA-256 of the secret minted at admission
 * and shown once. The secret itself is never stored and never leaves the
 * response that minted it, which is why revoking is the only way back and why
 * losing it means being re-admitted.
 *
 * THE ROOM TOKEN IS HERE AND IS NOT A CREDENTIAL. It is kept so an inbound
 * call from the agent can be broadcast into the right room without a second
 * lookup. server/seats.ts refuses a room token presented as a seat secret.
 */
export const roomSeats = pgTable(
  "room_seats",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    /** The room's own address, used only to broadcast. Never a seat credential. */
    roomToken: text("room_token").notNull(),
    memberKey: text("member_key").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    company: text("company").notNull(),
    mode: text("mode").$type<SeatMode>().notNull(),
    thread: text("thread").notNull(),
    channelId: text("channel_id").notNull(),
    joinedOn: text("joined_on").notNull(),
    expiresOn: text("expires_on").notNull(),
    callsUsed: integer("calls_used").notNull().default(0),
    callsPerDay: integer("calls_per_day").notNull(),
    /** UTC day `calls_used` belongs to, YYYY-MM-DD. */
    day: text("day").notNull(),
    boundParty: text("bound_party").notNull(),
    boundPartyKey: text("bound_party_key").notNull(),
    credentialHash: text("credential_hash").notNull(),
    /** Set once and never cleared: a revocation is a fact about the past. */
    revokedOn: text("revoked_on"),
    revokedBy: text("revoked_by"),
    revokedReason: text("revoked_reason"),
    budgetNoticeDay: text("budget_notice_day"),
  },
  (t) => ({
    hashIdx: index("room_seats_hash_idx").on(t.credentialHash),
    workspaceIdx: index("room_seats_workspace_idx").on(t.workspaceId),
  }),
);

export type RoomSeatRow = typeof roomSeats.$inferSelect;
