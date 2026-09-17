import { pgTable, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";

/**
 * A room connected to somewhere its people already are: a WhatsApp group, a
 * Slack channel, a ChatWoot inbox, a ClickUp list.
 *
 * IT LIVED IN A MAP. server/bridge/index.ts held every connection in one
 * process's memory and this service redeploys several times a day, so a
 * connected group died silently and often — the room simply stopped being
 * reachable from outside and nothing said so. That is the fourth parcel in
 * this repository to ship that shape, which is why it is a table now.
 *
 * ONE ROW PER ROOM PER KIND, which is the rule the code already enforced with
 * a Map keyed by kind: connecting a second Slack channel to a room replaces
 * the first rather than adding to it.
 *
 * WHAT IS IN `secret`. A ChatWoot access token or a Slack signing secret, as
 * the room's operator pasted it. It cannot be hashed: it is replayed on every
 * outbound message, so a one-way hash would be a connection that works until
 * the next restart, which is the bug this table exists to fix. It is a
 * third-party credential scoped to one room, given to us to use, and it is
 * never sent to a browser — `toPublic` in server/bridge/index.ts is what a
 * visitor sees, and it carries no secret at all.
 */
export const roomBridges = pgTable(
  "room_bridges",
  {
    workspaceId: text("workspace_id").notNull(),
    kind: text("kind").$type<"whatsapp" | "chatwoot" | "slack" | "clickup">().notNull(),
    /** The room's own address, so an inbound webhook can reach the room without a second lookup. */
    token: text("token").notNull(),
    /** The chat, channel, conversation or list on the other side. */
    target: text("target").notNull(),
    targetLabel: text("target_label").notNull(),
    secret: text("secret"),
    accountId: text("account_id"),
    inboxId: text("inbox_id"),
    inboxIdentifier: text("inbox_identifier"),
    contactIdentifier: text("contact_identifier"),
    baseUrl: text("base_url"),
    channelId: text("channel_id"),
    /** sender id -> member key, as JSON. Who on the other side is whom in here. */
    senderMap: text("sender_map"),
    connectedAt: timestamp("connected_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.kind] }),
    targetIdx: index("room_bridges_target_idx").on(t.kind, t.target),
  }),
);

export type RoomBridgeRow = typeof roomBridges.$inferSelect;
