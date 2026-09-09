import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod";

/**
 * One row per produced Ad Grant structure, keyed by identified person.
 *
 * Three generations per person. Counted when the structure is produced, not
 * when it is requested. The person key is `${provider}:${providerId}` from
 * the room binding — LinkedIn `sub` or a hash of a WhatsApp chat id. Never a
 * phone number, never a token, never a Google customer id.
 *
 * drizzle-kit follows the re-export in shared/schema.ts. The table does not
 * exist on a deployment until someone runs `npm run db:push` against a
 * DATABASE_URL. Without that, the count lives only in process memory.
 */
export const adgrantGenerations = pgTable(
  "adgrant_generations",
  {
    id: text("id").primaryKey(),
    personKey: text("person_key").notNull(),
    workspaceId: text("workspace_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => ({ personIdx: index("adgrant_generations_person_idx").on(t.personKey) }),
);

export const adgrantGenerateSchema = z.object({
  websiteUrl: z.string().trim().min(1).max(2000),
  location: z.string().trim().min(1).max(120),
  organisationName: z.string().trim().min(1).max(120).optional(),
});

export type AdgrantGenerationRow = typeof adgrantGenerations.$inferSelect;
