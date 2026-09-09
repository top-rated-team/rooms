import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
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

export type RoomBindingRow = typeof roomBindings.$inferSelect;
export type RoomWhatsappNoteRow = typeof roomWhatsappNotes.$inferSelect;
