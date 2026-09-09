# Work agreed but not yet a parcel

Two of these cannot enter `parcels.json` yet: they own files a parcel in flight
already owns, and `check-parcels.mjs` refuses two owners for one file. They go
in the moment their blocker lands. Written 9 September 2026 so that a pause
does not lose them.

---

## booking-return — blocked on wave 14 releasing `BookingDialog.tsx`

The owner booked through the QR code and it worked. What is missing is
everything after.

- **The browser should remember a booking it made.** A successful booking sets
  a flag in the site's own session, so pressing *Book a call* again opens the
  confirmation rather than an empty picker. The room token rule applies: the
  flag is a pointer, not a credential — it must not be enough on its own to
  read or change somebody else's booking.
- **The confirmation carries two links: change, and cancel.** Both today are
  absent, and a booking a visitor cannot get out of is a booking they will
  simply not attend.
- **A WhatsApp booking needs a way back in from anywhere.** A link of the shape
  `https://top-rated.team/<code>` that opens the site with the popup already
  showing that booking, so a person who booked from a phone and closed the tab
  can still change or cancel it. The code is the credential there, so it has to
  be treated as one: single meaning, expiring with the booking, and never
  logged.
- **Clearing the flag.** Cancelling clears it. So does the call time passing.
  Neither can be relied on across devices — the flag is per browser — so the
  server's answer, not the flag, decides what the popup shows.
- Cancelling must delete the calendar event and, where the visitor gave an
  address, let Google tell them. Where they proved by WhatsApp, the message
  goes to the chat that proved it and nowhere else.

## visitor-calendar — the thing the privacy page described before it existed

The owner asked twice why a visitor cannot connect their own Google Calendar so
we do not offer them a time they are already busy. The answer, established on
9 September 2026, is that nobody ever built it. The design exists — a separate
Google app with the non-sensitive `calendar.freebusy` scope, which the owner has
already published — and `/privacy` described it in the present tense until this
was found. That row now says it is not built.

- `freeBusy.query` returns busy intervals and nothing else: no titles, no
  guests, no locations. That is the whole reason this scope is non-sensitive
  and the reason the design does not need anything wider.
- It is the VISITOR's Google, not ours. Ours is connected through the
  scheduling connector and stays that way. Two different apps, two different
  consent screens, and the visitor's token is never written down.
- The connection ends when they confirm or after five minutes. Disconnecting
  removes only that visitor's own Google account, never `dan@top-rated.team`
  and never any LinkedIn or WhatsApp account.
- When it ships, `/privacy` moves back to the present tense in the same commit.
  Not before, and not after.

---

## adgrant.ai — a decision, not a configuration

The new AdGrant.AI site is served at `top-rated.team/adgrant`, mounted in
`client/src/App.tsx`. Pointing the `adgrant.ai` domain at Render today would
serve the top-rated.team landing page at `adgrant.ai/`, because nothing in this
codebase looks at the hostname. Four things have to be settled first:

1. **A host-aware root.** `adgrant.ai/` must mount the AdGrant tree at `/`,
   while `top-rated.team/adgrant` keeps working or redirects.
2. **The 33 + 74 pages already on adgrant.ai.** This repo links out to them as
   an external library. Taking the domain over replaces whatever serves them
   now — that is a content decision, not a deployment one.
3. **`HOUSE_HOSTS` in `shared/operator.ts`.** `adgrant.ai` is ours, so it
   belongs there; without it the booking gate treats the domain as a fork and
   refuses a booking with no address.
4. **Canonicals, sitemap and `llms.txt`** would otherwise publish the same
   pages under two domains.

The Render and DNS half is small once that is settled: add `adgrant.ai` and
`www.adgrant.ai` as custom domains on service `srv-daeq2bv40ujc7389ao4g`, then
put the ALIAS/ANAME and CNAME records Render hands back at the registrar.
`PUBLIC_BASE_URL` stays `https://top-rated.team` — webhooks and magic links are
built from it.
