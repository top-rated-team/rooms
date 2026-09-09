import { pgTable, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { z } from "zod";

/**
 * Who owns a room. The first binding on a workspace is the owner; later
 * bindings do not replace it. Shape matches server/identity.ts's stored row:
 * workspaceId, provider, providerId, displayName, boundAt. No token, no phone.
 *
 * drizzle-kit follows the re-export in shared/schema.ts. The table does not
 * exist on a deployment until someone runs `npm run db:push` against a
 * DATABASE_URL. Without that, a claim lives only in process memory.
 */
export const roomBindings = pgTable(
  "room_bindings",
  {
    workspaceId: text("workspace_id").primaryKey(),
    provider: text("provider").$type<"linkedin" | "whatsapp">().notNull(),
    /** Opaque. LinkedIn `sub`, or a hash of a WhatsApp chat id. Never a phone, never a token. */
    providerId: text("provider_id").notNull(),
    displayName: text("display_name").notNull(),
    boundAt: timestamp("bound_at").notNull(),
  },
  (t) => ({ providerIdx: index("room_bindings_provider_idx").on(t.provider, t.providerId) }),
);

/**
 * A WhatsApp number someone typed into a room. A note, not a proof: we have
 * not had a message from it. Stored separately from room_bindings so the two
 * cannot be printed as the same fact.
 */
export const roomWhatsappNotes = pgTable("room_whatsapp_notes", {
  workspaceId: text("workspace_id").primaryKey(),
  number: text("number").notNull(),
  addedAt: timestamp("added_at").notNull(),
});

/** Beside createWorkspaceSchema, which already caps a name at 120. */
export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

/** A number typed by hand. Not a verification. */
export const claimNoteSchema = z.object({
  number: z.string().trim().min(1).max(40),
});

/**
 * An address that has earned a room. Hashed. Not workspaces.visitorEmail —
 * that field is self-asserted by whoever opened the room.
 *
 * The room token is stored so a later send can mint a single-use access link
 * without putting that token in the mail. A stolen dump of hashes does not
 * yield a working address or a working link.
 */
export const roomAddressBindings = pgTable(
  "room_address_bindings",
  {
    emailHash: text("email_hash").notNull(),
    workspaceId: text("workspace_id").notNull(),
    workspaceToken: text("workspace_token").notNull(),
    boundAt: timestamp("bound_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.emailHash, t.workspaceId] }),
    emailIdx: index("room_address_bindings_email_idx").on(t.emailHash),
  }),
);

/**
 * A mailed way back into a room. The token in the URL is hashed before it is
 * stored, spent when it is used, and dead after an hour. It is not the room's
 * own address.
 */
export const roomAccessLinks = pgTable(
  "room_access_links",
  {
    tokenHash: text("token_hash").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    workspaceToken: text("workspace_token").notNull(),
    emailHash: text("email_hash").notNull(),
    createdAt: timestamp("created_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    spentAt: timestamp("spent_at"),
  },
  (t) => ({ expiresIdx: index("room_access_links_expires_idx").on(t.expiresAt) }),
);

export type RoomBindingRow = typeof roomBindings.$inferSelect;
export type RoomWhatsappNoteRow = typeof roomWhatsappNotes.$inferSelect;
export type RoomAddressBindingRow = typeof roomAddressBindings.$inferSelect;
export type RoomAccessLinkRow = typeof roomAccessLinks.$inferSelect;
