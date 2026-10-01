# Booking server

Availability and the booking write. the hosted connector has no free/busy endpoint — seven
calendar routes exist and none of them is availability — so slots are computed
here: a padded events query, our own overlap test, working hours 10:00–20:00
on weekdays in the site's zone — `BOOKING_TIME_ZONE`, else Europe/Prague, the
owner's clock; the calendar's own setting no longer decides — 30-minute slots, cached for 45
seconds. Live holds occupy a slot the same way a calendar event does, until
they expire or become a booking.

The primary calendar is listed once (`is_primary`, `is_read_only === false`)
and cached in process. Widget loads do not list calendars again.

Three traps, each covered by a fixture that fails without the branch:

1. An all-day event is `{date}` with no `date_time`. `new Date(ev.start.date_time)`
   is Invalid Date on a holiday and the week would read as open.
2. `start`/`end` on the the hosted connector list are containment filters. The query window
   is padded by a day on each side; the overlap test is ours.
3. `expand_recurring=true` is always sent. Without it a weekly standup arrives
   as one master with an RRULE and is invisible to the calculation.

Busy is `is_cancelled !== true` and `transparency !== "transparent"` and
`event_type` not in `{birthday, fromGmail, declined}`. The undocumented
`busy=true` query is not relied on.

A booking with an address is written immediately: `transparency: opaque`,
`conference: {provider: google_meet}` with no `url` (the hosted connector auto-provisions
Meet), and `notify: true` — that default is false, and without it the visitor
never gets an invite. 201 is `{event_id}` only; the Meet URL is read back
with GET.

A booking with no address is not written on POST. `hold.ts` reserves the
slot, mints the dictatable code, and returns the wa.me link. That is a hold,
not a booking. The event is created when the inbound matcher in
`server/the hosted connector/inbound.ts` sees the planted code, and only then. The hold
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

Change re-checks the new slot is free, then moves the same event to the new
time (a PATCH with `sendUpdates=all`): the guest gets Google's "Updated
invitation" and keeps the Meet link. Writing a new event and deleting the old
one sent a "Canceled event" letter for a call that was only moving. A failed
move leaves the call where it was; only an event already deleted from the
calendar by hand is written afresh.

Cancel deletes the calendar event. Where they were invited, `notify` is true
so Google tells them. Where they proved by WhatsApp, a message goes to the
chat that proved it and nowhere else.

`https://top-rated.team/<code>` is the way back for a WhatsApp booking. The
code is six characters from the dictatable alphabet. None of the site's
first-level routes is six characters (`/team` is four, `/blog` four,
`/setup` and `/terms` five, `/pricing` and `/privacy` seven), so a bare
`/<code>` cannot collide with an existing page. The hop sets a short-lived
cookie and redirects to `/`, where the landing page mounts the popup.

The WhatsApp path is offered only on a house host, and only when the hosted connector is
configured. `WHATSAPP_URL` in `shared/roster.ts` is the owner's own mobile;
a fork inherits that constant, so a visitor on somebody else's deployment
must never be handed it. Off a house host there is no gate and no no-address
path: an address is required.

There is no visitor-calendar connection. The brief §2.3 prices it and refuses
it.

## Times inside an email

`/admin/booking-widget` (operator only, `GET /api/admin/booking-widget`) turns
the free times into a block for an email: tables and inline styles, every day
or time a `/book` link with `date`, `time` and `confirm=email` on it, and the
recipient's address or a mail tool's merge tag (`{{email}}`, `*|EMAIL|*`) last.
`shared/booking-widget.ts` builds it; `shared/booking-link.ts` reads the link.
The times are the ones free when the block is made. A time gone by the time
the email is read opens the popup with a line saying so and what is free.

### Which days: nearest when opened, or fixed

"Nearest when the email is opened" is the default (`frame=live`). The block's
rows are places in a queue — row 0 is the nearest day with a free time among
the block's own times, then the next — counted again whenever a picture is
asked for (`live-block.ts`): each heading is two pictures, the weekday and
"1 OCT" (`client/public/booking-days`, `scripts/build-day-images.mjs`), each
time the free or taken picture on the reader's clock, from
`/api/booking/live/<row>/<weekday|date|HHMM>.png?c=<times>&tz=`. A click,
`/book/live?r=&t=&c=…`, works the row out again and opens the popup on that
time with the address filled in, for one press of Book: a mail client may
have fetched the pictures days earlier (Apple Mail fetches them on arrival),
so the day seen and the day clicked can differ, and only the page can show
the real one. The alt texts and the text version are the block as it stood
when made.

"Fixed dates" (`frame=fixed`, `from=`) lists the days free from that date, or
from today; every link names its date and time, so one click books.
"Days only" is always fixed.

### The recipient's clock

Nothing in an email address says where its owner is, so the widget page asks
"Where they are" — one field. Typing a town offers towns from
`city-search.ts` (GeoNames' 135,000 towns of a thousand people or more, CC BY
4.0, via the all-the-cities package, read once into flat arrays): each comes
with its own clock from its coordinates, so El Paso is on Mountain time and
Phoenix on its own. Typing a website or a company instead ("Find …") asks
`GET /api/admin/zone-lookup?q=` (`zone-lookup.ts`): a website in the text first
— `site-location.ts` reads the address the site prints (schema.org geo or
PostalAddress, geo meta tags, a Google Maps embed or link, a US, Canadian or
Australian address in the footer, a `tel:` country code, the country domain),
fetching only public hosts on standard ports, at most 1.5 MB and four
redirects, each checked again — then a town from the list, a one-clock
country, Wikidata's headquarters for a company, and OpenStreetMap's
Nominatim. Whatever is found is named for its town (`nearestCity` for a point
on the map). An address at a company's own domain is looked up as it is
typed. Before anything is known: the place set before for that address (kept
in the operator's browser), a guess from a one-clock country's domain, or the
site's own zone, Prague. The town is named in the email: "Eastern Time
(Smalltown, PA, EDT)".
`GET /api/admin/booking-widget?tz=&place=`
passes zone and town on. The block regroups the free times by the recipient's own days,
shows each on their clock and names the zone — "Eastern Time (New York,
GMT-4)", with each day's offset instead where the block spans a change of
clocks. Every link still carries the calendar's date and time, which is what
is booked, and each picture is `/api/booking/slot/<calendar date>/<HHMM>.png
?label=<their HHMM>`: their time drawn, the calendar slot's state. "Days only"
keeps the calendar's days, since the popup lists the times.

The popup's confirmation says the time on the visitor's own clock, with the
calendar's beside it where they differ. The picker, which Change opens, lists
times on the calendar's clock, names that zone, and says the visitor's offset
where it is not the same.

A booking from such a link is confirmed by email and nothing else — no
WhatsApp route, no LinkedIn button, no visitor-calendar row. POST
`/api/booking` with `confirm: "email"` does not write the event: it holds the
slot for 30 minutes (`confirm-email.ts`) and mails a link,
`/book/confirm/<token>`, to the address. Opening that link confirms nothing —
mail scanners open every link first — it opens the popup, which shows the time
and asks. POST `/api/booking/email-confirm` then asks the calendar once more
(the hold keeps visitors off the slot, not the owner), writes the event with
the address on it, so Google sends the invite, and records the booking with a
fresh return code. Twice is one event. A WhatsApp message carrying an email
hold's code proves nothing.

**One click books.** On the owner's instruction, the widget page requires
the address the block is for, signs it, and makes every time a
`/book?…&email=…&sig=…&instant=1` link. The link itself books nothing —
`/book` only hops to the page, so a mail scanner that fetches every link
books nothing — the page books it as it opens and opens on the confirmation,
with the Meet link, Change and Cancel. A browser that says it is driven by a
program (`navigator.webdriver`, as headless scanners are) gets the picker
with the time chosen and a Book button instead. A time taken meanwhile opens
the picker on what is still free.

Every copy of one email carries the same links, and nothing tells us who
clicked — the Cc line, a forward. So a signed block books once: when the
address already has a call coming up, any further click, on the same time
or another, is shown that call and nothing more — no return code, so no
Change or Cancel. The widget page says to send the block to that person
alone and to make one block each for several; the block itself says nothing
under the times but Other times.
Somebody else on the email can still be first to click and book a time in
the addressee's name; they get Google's invite and can decline it. Closing
that too would take a confirmation step, which the owner declined.

A block the owner made for one address skips that step. The widget page
signs the address (`link-sign.ts`, an HMAC under a label of its own, keyed
from `BOOKING_LINK_SECRET`, else the `LEAD_INBOX_KEY` render.yaml generates,
else `ROOM_HASH_PEPPER`), and a picked time whose address carries our
signature is written at once with Google's invite: the link went to that
inbox, so opening it proves what the letter would. The owner asked for this.
An address changed in the popup, a merge tag, or a signature that is not
ours is still confirmed by email. A deployment with none of those secrets
signs nothing, and every block keeps the step; changing the secret sends
older links back to it.

It needs `RESEND_API_KEY`, `LEAD_EMAIL_FROM` and `PUBLIC_BASE_URL`. Without
them a time picked from the email is booked at once with Google's invite, as
any booking with an address is, and the widget page says so in red.

Holds live in memory, so a deploy inside those 30 minutes loses the hold, and
the link then says it is not one we know.

## Times that stay current in a sent email

A block is frozen when it is sent and read later, when some of its times
have gone. So each time in it is a link around an image,
`/api/booking/slot/<date>/<HHMM>.png` (`slot-image.ts`), that answers with a
free or a crossed-out picture as the calendar stands when it is asked —
`no-store`, so a mail client that asks again gets the answer of the moment.
The 96 pictures (every half-hour, free and taken) are drawn once by
`scripts/build-slot-images.mjs` into `client/public/booking-slots/`; the
server has no image library and Gmail shows no SVG. The alt text is the
time, for readers who see no images.

Gmail fetches images through its proxy when a message is opened, which is
what countdown-timer emails depend on. Apple Mail may fetch them once, on
arrival; Outlook on the desktop shows none until the reader allows them.
When the calendar cannot be asked, the answer is "free": a time wrongly
crossed out loses a booking, one wrongly shown free is caught at the click.

The click is checked again whatever the picture said: the popup opens on the
picked time only if it is still free, and otherwise says so and shows what is
free that day; the emailed confirmation and reply to book ask the calendar
before writing, and a taken time is answered with the times still free.

## Reply to book

No longer made by the widget page: the owner chose one click on a web link
over an email to send. The receiving side stays, so the addresses in blocks
already sent still book.

Gmail without an add-on changes nothing in a pasted block, so a link in it
cannot carry the address of whoever it went to. With `BOOKING_INBOX_DOMAIN`
set, a time in the block is instead a `mailto:` to an address that names the
slot, `call-2026-09-30-1030@<domain>` (`shared/booking-reply.ts`), and the
email the recipient sends is the booking (`reply-to-book.ts`):

- Resend receives mail for the domain and posts `email.received` to
  `POST /api/booking/inbound-email`. The webhook's fields are not believed:
  the email is read back from `GET /emails/receiving/{id}` with our key, so a
  forged webhook books nothing. That is also why no signature is checked —
  `server/index.ts` is frozen and parses JSON before any route.
- The slot is the address it was sent to, the person the address it came
  from. Our own mail, automatic replies and other addresses are left alone.
  An address with a call already coming up is told so, not given a second.
- `postBooking` writes it with the sender on the event, so Google sends the
  invite; the sender gets a reply with the way to change or cancel, or, when
  the time has gone, the times still free as addresses to write to.
- Each email is handled once however often the webhook comes. 503 asks
  Resend to try again (Resend or the calendar briefly away); all else is 200.

Not checked: SPF and DKIM. A forged From line books a call in someone else's
name, and they get an invite they can decline — the same as typing their
address into the popup. Day links and Other times stay web links to the popup.

## The owner's signature links

`https://top-rated.team/#` and `https://top-rated.team/book#` are the site to
everyone. In a browser signed in as the operator — by LinkedIn, WhatsApp or
email, whichever is on that account — they open `/admin/booking-widget`
instead (`client/src/lib/operator-shortcut.ts`, asking
`GET /api/admin/operator`, which logs nothing). The empty `#` is the mark, and
the server never sees it, so a bare `/book` is served as the page itself
rather than redirected: browsers drop an empty `#` across a 302. `/book` with
anything after it still hops to `/#book&…`.

## Who is on the call

Every event that invites anyone also invites the owner, already accepted:
`BOOKING_HOST_EMAIL`, else `GOOGLE_CALENDAR_ID` when it is a person's address,
else `OPERATOR_EMAIL` (`bookingHostEmail`). An event with no guest — the
WhatsApp route — still names nobody, because naming the organiser alone mails
him an invitation to his own event.

"Also invite" on the widget page names more people for the call. They ride
in every link of the block (`guests=`), and the recipient's signature covers
them (`signAddress(address, guests)`), so a link edited to invite someone
else books for the address alone and invites nobody more. A link signed
without guests verifies exactly as before.
