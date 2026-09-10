import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

/**
 * A booking that has been made, so that coming back to it survives a deploy.
 *
 * It lived in a Map in one process. Render redeploys this service several
 * times a day, and every one of them silently voided every return link — the
 * calendar event and the call still stood, and the person holding the link
 * was told the booking did not exist. That is the third parcel in this
 * repository to ship the same shape, which is why it is a table now.
 *
 * WHAT IS NOT HERE. No name, no topic, no address in the clear beyond what a
 * cancellation needs, and above all no hold: a hold is not a booking, it
 * lives five minutes, and it belongs in memory where it cannot outlive the
 * page that made it.
 *
 * `code` is the credential a visitor returns with, so it is the primary key
 * and it is minted fresh when the booking is recorded — never the hold's own
 * code, which by then has been printed on screen, drawn into a QR and sent
 * through WhatsApp.
 */
export const bookings = pgTable(
  "bookings",
  {
    code: text("code").primaryKey(),
    calendarId: text("calendar_id").notNull(),
    eventId: text("event_id").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    /* The wall-clock the visitor picked, kept beside the instant because the
       slot grid is built from calendar-local date and time and recomputing
       them from an instant needs the calendar's zone, which can change. */
    date: text("date").notNull(),
    time: text("time").notNull(),
    timezone: text("timezone").notNull(),
    meetUrl: text("meet_url"),
    /** True when Google was asked to invite an address. */
    invited: boolean("invited").notNull(),
    email: text("email"),
    /** The chat that proved a WhatsApp booking. Never a chat that did not. */
    chatId: text("chat_id"),
    name: text("name").notNull(),
    topic: text("topic").notNull(),
    createdAt: timestamp("created_at").notNull(),
    cancelledAt: timestamp("cancelled_at"),
  },
  (t) => ({ startsIdx: index("bookings_starts_idx").on(t.startsAt) }),
);

export type BookingRow = typeof bookings.$inferSelect;
