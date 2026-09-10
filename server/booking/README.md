# Booking server

Availability and the booking write. Unipile has no free/busy endpoint — seven
calendar routes exist and none of them is availability — so slots are computed
here: a padded events query, our own overlap test, working hours 09:00–17:00
on weekdays in the calendar's own timezone, 30-minute slots, cached for 45
seconds. Live holds occupy a slot the same way a calendar event does, until
they expire or become a booking.

The primary calendar is listed once (`is_primary`, `is_read_only === false`)
and cached in process. Widget loads do not list calendars again.

Three traps, each covered by a fixture that fails without the branch:

1. An all-day event is `{date}` with no `date_time`. `new Date(ev.start.date_time)`
   is Invalid Date on a holiday and the week would read as open.
2. `start`/`end` on the Unipile list are containment filters. The query window
   is padded by a day on each side; the overlap test is ours.
3. `expand_recurring=true` is always sent. Without it a weekly standup arrives
   as one master with an RRULE and is invisible to the calculation.

Busy is `is_cancelled !== true` and `transparency !== "transparent"` and
`event_type` not in `{birthday, fromGmail, declined}`. The undocumented
`busy=true` query is not relied on.

A booking with an address is written immediately: `transparency: opaque`,
`conference: {provider: google_meet}` with no `url` (Unipile auto-provisions
Meet), and `notify: true` — that default is false, and without it the visitor
never gets an invite. 201 is `{event_id}` only; the Meet URL is read back
with GET.

A booking with no address is not written on POST. `hold.ts` reserves the
slot, mints the dictatable code, and returns the wa.me link. That is a hold,
not a booking. The event is created when the inbound matcher in
`server/unipile/inbound.ts` sees the planted code, and only then. The hold
expires with the code — five minutes. If it expires unproven, nothing was
booked. GET `/api/booking/confirmed` reports that the booking exists, not
that a message arrived.

`date_time` is sent as UTC with a trailing `Z`, and `time_zone` is the
calendar's IANA zone. The brief's own example holds in the tests:
14:00 on 2026-09-10 in Europe/Bratislava is `2026-09-10T12:00:00.000Z`.

`attendees: []` with `notify: false` is the no-address write, verified
against the live tenant. A placeholder built from a phone number is not used.
With an address, that address is the attendee and `notify` is true.

The event description names who will be on the call. The host line is
`Dan Burykin: https://www.linkedin.com/in/burykin/`. A visitor line is added
only when Sign in with LinkedIn actually handed a profile over. Reminders
follow the route the visitor used: email (Google's invite) where there is an
address, WhatsApp to the chat that proved it where there is not. Never
LinkedIn.

The planted WhatsApp code uses the alphabet at `server/identity.ts:98-102`.
`BOOKING_CODE_RE` is the one pattern the matcher and the test share.

A booking that has been written can be shown, changed and cancelled. GET
`/api/booking?code=` is what the popup asks; the code is the credential.
The browser stores only a pointer to that code in its own session. A cookie
or a copied flag is not enough on its own: if the booking was cancelled
elsewhere, or the call time has passed, the server answers `{ found: false }`
and the popup shows the picker.

Change re-checks the new slot is free, writes the new event, then deletes the
old one. Releasing the old slot before the new one exists would lose the
booking if the write failed.

Cancel deletes the calendar event. Where they were invited, `notify` is true
so Google tells them. Where they proved by WhatsApp, a message goes to the
chat that proved it and nowhere else.

`https://top-rated.team/<code>` is the way back for a WhatsApp booking. The
code is six characters from the dictatable alphabet. None of the site's
first-level routes is six characters (`/team` is four, `/blog` four,
`/setup` and `/terms` five, `/pricing` and `/privacy` seven), so a bare
`/<code>` cannot collide with an existing page. The hop sets a short-lived
cookie and redirects to `/`, where the landing page mounts the popup.

The WhatsApp path is offered only on a house host, and only when Unipile is
configured. `WHATSAPP_URL` in `shared/roster.ts` is the owner's own mobile;
a fork inherits that constant, so a visitor on somebody else's deployment
must never be handed it. Off a house host there is no gate and no no-address
path: an address is required.

There is no visitor-calendar connection. The brief §2.3 prices it and refuses
it.
