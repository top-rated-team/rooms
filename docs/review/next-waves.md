# Work agreed but not yet a parcel

Two of these cannot enter `parcels.json` yet: they own files a parcel in flight
already owns, and `check-parcels.mjs` refuses two owners for one file. They go
in the moment their blocker lands. Written 9 September 2026 so that a pause
does not lose them.

## room-login follow-up — one pair in every state

Wave 13 shipped `LOGIN | Open a room` when nothing is remembered, and kept
`Your rooms | Open a room` when something is. The owner then said the second
state is not wanted: the pair should read `LOGIN | Open a room` always, and
hovering LOGIN should show the remembered-room list when this browser has one.

The brief in `parcels.json` was updated to say so, but wave 13 had already been
launched from the older prompt, so the change never reached the agent. It is
small and `RoomMenu.tsx` is unowned again — it needs one decision made
deliberately rather than in a hurry: hover currently opens the room list and
click currently opens the login panel, and with one label they have to share a
gesture without either becoming a surprise.

---

## adgrant-in-a-room — blocked on wave 16, and on one answer from Google

The owner's second half of the templates request, in his words: log into a
room, and there the agent hands over the setup files and offers to upload them
for you through the Top-Rated Team MCC — you give the CID of your Google Ads
account and accept the invitation. And the same agent should do all of that
from chat, not from a form.

What is already true: the AdGrant.AI agent exists and answers in a room
(`ad-grants` in `shared/roster.ts`), the generator produces a structure and a
Google Ads Editor CSV, and `/api/workspaces/:token/adgrant/generate` is how a
room asks for one. What is missing is the handover and the link.

- **The files come from the agent, in the conversation.** A message that
  carries attachments rather than a page that carries a button. That is a real
  change to what a room message can hold, and it is the part to design first
  because everything else hangs off it.
- **The MCC invitation is a Google Ads API operation**, not a link we can
  fabricate: a customer client link is created against the manager account and
  the customer accepts it in their own account. It needs the Google Ads API
  with a developer token at a level that permits it, and the account must be
  ours to invite from. **Confirm that access exists before this parcel is
  written** — if it does not, the honest version is that the agent produces the
  files and tells the person exactly what to click in their own account, and
  says so plainly rather than offering a link it cannot make.
- **A CID is not a credential and must not be treated as one.** It identifies
  an account; accepting the invitation is what grants anything, and that
  happens on Google's side, under the customer's own login.
- **Nothing is written into anybody's account without that acceptance**, and
  the room says so at the moment it asks for the CID, not in a policy page.
- Ad Grant accounts are suspended for policy breaches, so anything uploaded
  arrives Paused, exactly as the generator's CSV already does.

---

## room-account — Logout, and one account with several ways in

The owner's design, and the half of it that cannot be built yet.

WHAT IS DONE: the pair is `Login | Open a room` in every state, and each half
owns its own hover — hovering *Open a room* drops the rooms this browser
remembers, hovering *Login* shows the ways in.

WHAT IS NOT: he also wants the left half to read **Logout** once somebody is
signed in, clickable to sign out, with its own hover offering to attach
another way in — and the rooms already opened under that other way — to the
account they are already using.

**None of that is possible today, because there is no account.** Wave 13's
login is stateless: you prove who you are, the server answers with the rooms
bound to that identity, you pick one, and what remembers you afterwards is the
room token in this browser's localStorage. There is no session, no cookie, and
therefore nothing for a Logout to end and nothing for a second method to be
attached *to*.

So this parcel is a session and an identity, and it should be written as one:

- **A durable identity row**, and a cookie that points at it. The cookie is a
  credential, so: HttpOnly, Secure, SameSite, rotated on sign-in, and long —
  the owner's instruction is to remember somebody for as long as possible.
- **Logout ends the session and nothing else.** It must not forget the rooms
  in localStorage: a person signing out of a shared browser and losing their
  own rooms on their own laptop would be the same word doing two jobs.
- **Attaching a second method merges what it can reach.** Signing in with
  LinkedIn while already signed in by email adds that identity to the same
  account, and the rooms bound to it become reachable from it. The merge is
  the risky operation in the whole feature — think about what happens when the
  second identity already belongs to another account, and refuse rather than
  guess.
- **The label is state, so it must be read from the server**, not from a
  localStorage flag. A page that says Logout to somebody with no session, or
  Login to somebody who has one, is worse than one that says neither.

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

## adgrant.ai — the code is done; the domain is yours to point

Written 10 September 2026. Everything in this repository is ready: one build
answers as both sites and decides which it is per request. Nothing here waits
on another commit.

### What to do, in order

1. **Render.** Service `srv-daeq2bv40ujc7389ao4g` → Settings → Custom Domains →
   add **`adgrant.ai`** and **`www.adgrant.ai`**. Render then shows the DNS
   records to create, and verifies once they resolve.
2. **The registrar, where adgrant.ai's DNS lives.** Create what Render asked
   for — normally an **ALIAS/ANAME** (or **A**) record on the apex pointing at
   Render, and a **CNAME** on `www` pointing at the service's
   `*.onrender.com` hostname. If the DNS is on Cloudflare, set both records to
   **DNS only** (grey cloud) until Render says Verified, then turn the proxy
   back on if you want it.
3. **Wait for Render to say Verified** and issue the certificate. Minutes,
   usually; up to an hour if the old records were cached.
4. **Open `https://adgrant.ai/`.** You should get the AdGrant home at the
   root, with the menu links reading `/glossary` and not `/adgrant/glossary`.
5. **Tell me it is live** and I will remove the canonicals in one commit —
   see below. Nothing breaks if that waits a day.

`PUBLIC_BASE_URL` stays `https://top-rated.team`. It is what webhooks and
magic links are built from, and neither belongs to the AdGrant site.

### What the code already does

- `shared/adgrant-site.ts` names the two hostnames, and both the client and the
  server ask it, so they cannot disagree about which site this is.
- On adgrant.ai the tree answers at the root and the Top-Rated Team routes are
  **absent**, not hidden — `/pricing` and `/team` existing on both domains with
  no canonical between them is how both lose.
- `top-rated.team/adgrant` keeps working, so no published link breaks.
- `robots.txt` and `sitemap.xml` are routes, and the AdGrant sitemap is
  generated from the same pages that render — 33 addresses today.
- Both hostnames are house hosts, so the booking gate does not treat our own
  domain as a fork.

### The one thing to remove afterwards

While the pages are duplicated, every AdGrant page on top-rated.team declares
the live adgrant.ai URL as its canonical. Once the domain answers, that is a
page declaring itself a copy of itself. The condition is written as
"`ADGRANT_MOUNT` is not empty" in `client/src/components/adgrant/Meta.tsx`, so
it switches itself off **on the AdGrant host** the moment the domain resolves —
but the copies still served under `top-rated.team/adgrant` keep pointing at
adgrant.ai, which is correct and can stay indefinitely.

### Still open, and it is a content question rather than a technical one

adgrant.ai serves 27 pages today in the old design, and this repository now has
all 27 in the new one. Taking the domain over replaces whatever serves them
now. If anything lives there that is not in `shared/adgrant.ts` — the
`/nonprofits` set here is four pages, all `animal-shelters/<city>` — say what
it is before the DNS changes.

