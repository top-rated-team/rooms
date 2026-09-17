import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * What a room is allowed to spend, and who said so.
 *
 * It exists because of one rule the owner set, and the rule decides the whole
 * shape: "until the budget runs out" is not a stopping condition. Two agents
 * that may answer each other will answer each other, and a limit that is
 * reached is already a bill nobody expected. So an exchange between agents is
 * something a person STARTS, having been shown what it costs, with a card
 * already on file — never something a mention begins by accident.
 *
 * ONE ROW PER ROOM. No card number is here and none ever will be: Stripe holds
 * the card, this holds the customer and payment-method ids it gives back, plus
 * the brand and last four so a person can recognise which card they attached
 * without us storing anything that could be used as one.
 *
 * `agentExchangeTurns` is the ceiling the person was SHOWN when they agreed.
 * It is stored rather than read from a constant so that raising the default
 * later cannot silently raise what somebody already consented to.
 */
export const roomBilling = pgTable("room_billing", {
  workspaceId: text("workspace_id").primaryKey(),
  /** Stripe Customer. Created on the first card, reused after. */
  customerId: text("customer_id"),
  /** The saved card. Null means there is no card on file and no exchange may run. */
  paymentMethodId: text("payment_method_id"),
  /** For showing "Visa ···· 4242". Never enough to charge with. */
  cardBrand: text("card_brand"),
  cardLast4: text("card_last4"),
  cardAddedAt: timestamp("card_added_at"),
  /** The ceiling, in agent turns, that the person agreed to. Null means no consent. */
  agentExchangeTurns: integer("agent_exchange_turns"),
  /** How many of those turns have been spent. */
  agentExchangeUsed: integer("agent_exchange_used").notNull().default(0),
  /** When they agreed, and which member key pressed the button. */
  agentExchangeConsentAt: timestamp("agent_exchange_consent_at"),
  agentExchangeConsentBy: text("agent_exchange_consent_by"),
  updatedAt: timestamp("updated_at").notNull(),
});

export type RoomBillingRow = typeof roomBilling.$inferSelect;
