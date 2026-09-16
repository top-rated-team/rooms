# Booking API

Fixed here so the server and the dialog can build to the same shapes. Change
this file before changing either side.

WhatsApp proof for a booking goes through `server/whatsapp/` — see
`docs/specs/whatsapp.md`. The calendar write goes through a Google service
account — see `docs/specs/calendar.md`.

## Slots

```
GET /api/booking/slots?from=2026-09-10&days=14
→ 200
{
  "timezone": "Europe/Prague",
  "slotMinutes": 30,
  "days": [
    { "date": "2026-09-10", "slots": ["09:00", "09:30", "14:00"] },
    { "date": "2026-09-11", "slots": [] }
  ]
}
→ 503 { "error": "…one sentence a visitor can read…" }
```

Slots are local wall-clock times in `timezone`. A day with no slots is
present with an empty array.

Availability is computed here: a padded events (or free/busy) query, an
overlap test in our own code, working hours in the calendar's timezone,
cached briefly server-side. There is no free/busy endpoint on the WhatsApp
transport, and the visitor's own calendar stays out of the write path.

## Create

```
POST /api/booking
{ "date": "2026-09-10", "time": "14:00", "email": "someone@example.com", "name": "…", "topic": "google-ads" }
→ 201
{
  "booked": true,
  "startsAt": "2026-09-10T12:00:00.000Z",
  "timezone": "Europe/Prague",
  "meetUrl": "https://meet.google.com/…" | null,
  "invited": true,
  "whatsapp": { "url": "https://wa.me/…?text=…", "code": "K7QMX2" }
}
→ 409 { "error": "That time has just been taken. Here is what is still free.", "days": [...] }
→ 503 { "error": "…" }
```

`email` is the only optional field on the form. With it, the visitor gets a
real calendar invite. Without it, on a house host, the slot is held and a
WhatsApp code is planted — nothing is written to the calendar until the
visitor sends the message.

## Hold, prove, confirm (no address)

1. **Hold.** `POST /api/booking` with no address reserves the slot, mints
   the code, returns the `wa.me` link. The hold expires with the code
   (five minutes).
2. **Prove.** On a phone the button opens WhatsApp. On a desktop the same
   link is a QR that is itself clickable. The inbound handler runs the
   seven checks in `docs/specs/whatsapp.md`.
3. **Confirm.** When the matcher fires, the event is created. Then the
   popup shows the Meet link.

If the hold expires unproven, nothing was booked.

```
GET /api/booking/confirmed?code=K7QMX2
→ 200 { "confirmed": true, "at": "…", … } | { "confirmed": false } | { "confirmed": false, "expired": true }
```

`confirmed` means the booking exists, not merely that a message arrived.

## Inbound webhook

```
POST /api/hooks/inbound
→ 200 { "ok": true }     always, fast, idempotent
→ 401 { "error": "Not found" }   secret missing or wrong
```

Secret in a header we configure. No HMAC. Correlate by the planted code in
the message text, not by time.

## Reminders

| how they identified | invite | reminder |
|---|---|---|
| email typed, or from LinkedIn sign-in | calendar invite | email |
| WhatsApp only | no invite | WhatsApp, to the chat that proved it |
| nothing at all | there is no booking | — |

Never LinkedIn as a reminder channel.

## Four decisions (booking)

1. Visitor login for rooms stays on LinkedIn OIDC; booking may offer Sign in
   with LinkedIn as a way to hand over an address once that product is live.
2. WhatsApp is our number only — the visitor opens `wa.me`.
3. Availability is computed here; the visitor's calendar is not connected
   for the write.
4. A WhatsApp reply is correlated by a planted code, not by click time.
