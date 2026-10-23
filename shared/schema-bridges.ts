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
 * WHAT IS IN `secret`. What this room SENDS with: a ChatWoot access token, a
 * Slack incoming-webhook URL or a ClickUp API token, as the room's operator
 * pasted it. It cannot be hashed: it is replayed on every
 * outbound message, so a one-way hash would be a connection that works until
 * the next restart, which is the bug this table exists to fix. It is a
 * third-party credential scoped to one room, given to us to use, and it is
 * never sent to a browser — `toPublic` in server/bridge/index.ts is what a
 * visitor sees, and it carries no secret at all.
 *
 * DO NOT ADD A COLUMN HERE without changing how it is read. Drizzle names
 * every column of this table in each insert and in `select()`, so a column the
 * database does not have yet fails every connect and the load at boot, and a
 * failed load is every connected room gone until the next restart. New
 * per-connection data goes in a table of its own, like the one below.
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

/**
 * What a room's INBOUND is checked with, when the room brought its own: the
 * signing secret of its own Slack app, or the secret ClickUp returned for its
 * own webhook. A room with no row here is checked with the deployment's
 * SLACK_SIGNING_SECRET or CLICKUP_WEBHOOK_SECRET; a room with a row is checked
 * with that secret and nothing else.
 *
 * It is a secret we must be able to read back, for the reason `secret` above
 * is: a signature is checked against it on every delivery.
 *
 * A TABLE OF ITS OWN, NOT A COLUMN on room_bridges (see the warning there). It
 * is read and written apart from the connection, so a database `npm run
 * db:push` has not reached yet loses nothing: every connection still loads,
 * and rooms are checked with the deployment's secrets until it has.
 */
export const roomBridgeSecrets = pgTable(
  "room_bridge_secrets",
  {
    workspaceId: text("workspace_id").notNull(),
    kind: text("kind").$type<"slack" | "clickup">().notNull(),
    inboundSecret: text("inbound_secret").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.kind] }),
  }),
);
