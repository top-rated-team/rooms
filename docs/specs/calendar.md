# Our booking calendar, through a service account

Bookings talk to Google Calendar directly. A third party no longer stands
between us and the calendar, and no vendor account id lives in this
repository.

**[V]** = verified against Google's documentation or against a test in this
parcel. **[I]** = reasoning. **[?]** = could not be verified on this machine.

---

## Mechanism

A Google Cloud service account authenticates with its own key. The owner
shares `GOOGLE_CALENDAR_ID` (`dan@top-rated.team`) with that account's
address — `top-rated-team@top-rated-team-cal.iam.gserviceaccount.com` —
with permission to make changes.

That avoids three things:

1. No OAuth consent screen, so no sensitive-scope verification and no demo
   video.
2. No refresh token to store.
3. No vendor.

The key is one environment variable, `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`,
holding the whole service-account JSON as one value. `private_key` carries
escaped newlines; `JSON.parse` restores them. `GOOGLE_CALENDAR_ID` is the
calendar. Those two names are already set on the deployment and are not
renamed.

Two steps a person has to do by hand, once:

- In Google Cloud: enable the Google Calendar API on the project that owns
  the service account, and create a JSON key for it.
- In Google Calendar: share the calendar with the service account's address
  with "Make changes to events".

Without both variables, the booking routes answer 503 with one sentence a
visitor can read. WhatsApp still uses the hosted connector; that is a different grant.

Nothing is written into anybody else's calendar. Attendees are an invite
Google emails; they are not a write into the visitor's calendar. The
visitor's own free/busy overlay is `server/booking/freebusy.ts` — a
different app, a different grant, a different person — and this parcel
does not touch it.

## Meet link: which of the two this deployment needs

Google's events.insert page says a service account needs domain-wide
delegation to populate the attendee list
([events/insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)).
The same page does not say whether `conferenceData` with
`conferenceDataVersion=1` produces a Meet link on a calendar that is merely
shared with the service account. `dan@top-rated.team` is Google Workspace,
so the fallback is domain-wide delegation: the service account impersonates
him (`JWT sub` = `GOOGLE_CALENDAR_ID`), configured in the Workspace admin
console with the calendar scope on this account.

The smallest probe is `npx tsx server/booking/gcal.ts`. It creates one
event with `conferenceData` and `conferenceDataVersion=1`, looks at whether
a Meet link comes back, and deletes the event. It tries the shared calendar
first, then impersonation.

### Measured, 16 September 2026, against the real calendar

Four attempts, service account
`top-rated-team@top-rated-team-cal.iam.gserviceaccount.com` on
`dan@top-rated.team`:

| | Result |
|---|---|
| plain event on the shared calendar | **created and deleted — works** |
| the same with `conferenceData` + `conferenceDataVersion=1` | created, `hangoutLink` absent, `conferenceData` null — **silently ignored, no error** |
| the same with one attendee | **403 `forbiddenForServiceAccounts`** — *"Service accounts cannot invite attendees without Domain-Wide Delegation of Authority."* |
| impersonating the owner | `401 unauthorized_client` — delegation not granted yet |

Delegation was then granted, and the same probe run again the same day:

| | Result |
|---|---|
| impersonating the owner, with a Meet conference | **`hangoutLink` returned, `status.statusCode: "success"`** |
| impersonating the owner, with an attendee | **accepted, no 403** |
| impersonating the owner, conference AND attendee | **both** |

So this deployment runs with `GOOGLE_CALENDAR_IMPERSONATE=true`, and the
booking keeps everything it had: a Meet link and an invitation to the person
who booked. Every probe event was deleted.

**Delegation is not optional on this deployment.** A shared calendar is
enough to hold a booking and no more: it loses the Meet link AND the
invitation to the person booking, and both of those work today. The Meet
failure is the nastier of the two because nothing reports it — the event is
created and the link is simply not there.

`GOOGLE_CALENDAR_IMPERSONATE=true` turns the delegation path on. It is an
environment switch and not a constant, because the grant itself happens in
the Workspace admin console and the person who grants it should not need a
deploy to use it.

To grant it: Workspace admin console → Security → Access and data control →
API controls → Domain-wide delegation → Add new, with

- **Client ID** `108371082754132041330`
- **Scope** `https://www.googleapis.com/auth/calendar`

The wire already allows `meetUrl: null`, so a deployment that wants neither a
Meet link nor an invitation can leave the switch off and still take
bookings.

## Availability is freeBusy.query

Listing events was a workaround for a hosted connector that had no free/busy endpoint.
`freeBusy.query` is narrower, faster, and does not bring titles or guests
into this process. Recurring instances are already expanded. All-day events
arrive as busy ranges. Transparent events are omitted.

Event fields that this process still needs, and why:

- **summary, description, attendees** — to create the booking the visitor
  sees in their invite.
- **conferenceData / hangoutLink** — the Meet link stored on the booking
  and shown in the confirmation.
- **id** — to delete on cancel and to delete the old event after a
  reschedule.

If a caller only needs to know whether a slot is free, it must not list
events.

The slot grid on the wire is unchanged: `timezone`, `slotMinutes`, `days[]`
with local wall-clock times, empty arrays for days with nothing free,
cached 45 seconds. Booking codes, return links and the popup contract are
untouched. A person with a booking made yesterday can still open, change
and cancel it.

## the hosted connector fallback

Callers this parcel does not own (`server/booking/confirm.ts`,
`server/booking/signin.ts`, and their tests) still import the hosted connector's
calendar client and still mock the hosted connector URLs. When the two Google variables
are unset, `calendar.ts` and `slots.ts` keep that path so those tests hold.
Production has the variables and takes the Google path. The handoff is to
point those two files at `server/booking/gcal.ts`.
