/**
 * The WhatsApp interface's shared types. Callers above this directory talk
 * to these and to nothing else.
 *
 * attendee_provider_id is a tagged union, not a phone number. The local
 * part of a LID is not recoverable as a number, and this process never
 * stores or logs a phone.
 */

export type SenderProviderId =
  | { form: "s.whatsapp.net"; value: string }
  | { form: "lid"; value: string }
  | { form: "other"; value: string };

export interface AcceptedInboundMessage {
  accountId: string;
  chatId: string;
  messageId: string;
  /** The body of the message. Field names on the wire differ per transport. */
  message: string;
  sender: {
    attendeeId: string | null;
    attendeeName: string | null;
    attendeeProviderId: SenderProviderId;
  };
  timestamp: string;
  /** Set when the transport carried it; after the seven checks this is always false for an accepted message. */
  fromMe?: boolean;
  /** Set when the transport carried it; after the seven checks this is always false for an accepted message. */
  isGroup?: boolean;
}

export interface AccountStatusInbound {
  accountId: string;
  accountType: string | null;
  status: string;
}

export type SendResult = { ok: true } | { ok: false; line: string };

export type ProbeResult =
  | { ok: true; digits: string }
  | { ok: false; line: string };

export type AliveResult = { ok: true } | { ok: false; line: string };

export type TransportName = "hosted" | "waha";
