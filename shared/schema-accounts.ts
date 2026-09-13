import { pgTable, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";

/**
 * A durable person. Sign-in writes one of these and a cookie that points at a
 * session row. The cookie is the credential; this row is what it names.
 *
 * drizzle-kit follows the re-export in shared/schema.ts. The tables do not
 * exist on a deployment until someone runs `npm run db:push` against a
 * DATABASE_URL. Without that, accounts live only in process memory.
 */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").notNull(),
});

/**
 * A cookie value, stored hashed. Rotated on every sign-in. Long-lived: the
 * owner asked to remember somebody for as long as possible.
 */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => ({ accountIdx: index("sessions_account_idx").on(t.accountId) }),
);

/**
 * One way in, one account. The primary key is the identity, so a second
 * account cannot claim it. Attaching a way that already belongs to someone
 * else is refused, not merged.
 */
export const accountIdentities = pgTable(
  "account_identities",
  {
    provider: text("provider").$type<"linkedin" | "whatsapp" | "email">().notNull(),
    /** Opaque. LinkedIn `sub`, a hash of a WhatsApp chat id, or a hash of an email. Never a phone, never a token. */
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    attachedAt: timestamp("attached_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerId] }),
    accountIdx: index("account_identities_account_idx").on(t.accountId),
  }),
);

export type AccountRow = typeof accounts.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AccountIdentityRow = typeof accountIdentities.$inferSelect;
