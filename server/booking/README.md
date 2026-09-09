# Booking server

Availability and the booking write. Unipile has no free/busy endpoint — seven
calendar routes exist and none of them is availability — so slots are computed
here: a padded events query, our own overlap test, working hours 09:00–17:00
on weekdays in the calendar's own timezone, 30-minute slots, cached for 45
seconds.

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

Writing a booking sends `transparency: opaque`,
`conference: {provider: google_meet}` with no `url` (Unipile auto-provisions
Meet), and `notify: true` — that default is false, and without it the visitor
never gets an invite. 201 is `{event_id}` only; the Meet URL is read back
with GET.

`date_time` is sent as UTC with a trailing `Z`, and `time_zone` is the
calendar's IANA zone. The brief's own example holds in the tests:
14:00 on 2026-09-10 in Europe/Bratislava is `2026-09-10T12:00:00.000Z`.
This machine has no Unipile credentials, so the created event was not read
back out of Google Calendar here. That check still needs a live calendar.

`attendees: []` is schema-valid and untested against Unipile. It is not sent.
With a visitor email, that address is the attendee and `invited` is true.
Without one, `dan@top-rated.team` satisfies the required constraint and
`invited` is false. A placeholder built from a phone number is not used:
the create body has no phone field, and a number we do not have must not be
reported as an invite that will arrive.

The planted WhatsApp code uses the alphabet at `server/identity.ts:98-102`.
`BOOKING_CODE_RE` is the one pattern the matcher and the test share. Expiry
is five minutes. Confirmation is a matcher on `server/unipile/inbound.ts`,
not a second webhook parser.

There is no visitor-calendar connection. The brief §2.3 prices it and refuses
it.
