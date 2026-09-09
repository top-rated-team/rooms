# Unipile, the room's identity, and our own booking widget

**Programme three's brief. Every parcel in it says "read this first", and this is why:
eight agents working from the owner's sentences alone would each invent a different
Unipile, and six of them would invent endpoints that do not exist.**

Everything below marked **[V]** was read in Unipile's own documentation or in this
repository this week. Everything marked **[I]** is reasoning from it. Where a contract is
unconfirmed it says so, and an unconfirmed contract is a five-minute experiment for
whoever builds it — never a guess written into shipped code.

---

## 0. THE FOUR THINGS ALREADY BUILT, so nobody rebuilds them

This is the single most expensive fact in the brief. The owner's request reads like
greenfield work in four places where it is not.

### 0.1 Room identity: both routes exist and are tested

`server/identity.ts` is 589 lines and its header states the design out loud:

> Two routes, and neither is allowed to be the only one:
> - LinkedIn, through the official Sign In with LinkedIn (OpenID Connect) authorization
>   screen. Nothing scraped, nothing session-based.
> - WhatsApp, through WAHA on another host: a wa.me link or a QR of that link opens
>   WhatsApp with a pre-filled message carrying this room's address, sent to us.

**LinkedIn OIDC is complete** — `server/identity.ts:64-67` holds the three real endpoints
(`/oauth/v2/authorization`, `/oauth/v2/accessToken`, `/v2/userinfo`) and the scope
`"openid profile"`. `startLinkedIn()` at `:245-270` carries the room token in `state`,
because LinkedIn demands an exact-match redirect URI and a per-room URI is impossible.
`completeLinkedIn()` at `:304-366` exchanges the code, reads only `sub` and the name, and
sets `accessToken = null` at `:346` — the token is never persisted.

**WhatsApp is complete as click-to-chat** — `server/waha.ts:65-68` builds
`https://wa.me/{ourDigits}?text={message}`, and `bindMessage()` at
`server/identity.ts:383-385` plants `Room-bind {nonce}` in that text. The nonce alphabet at
`:98-102` excludes `-`, `_`, `I`, `O`, `0`, `1` so it can be dictated over the phone; the
comment at `:79-97` records the bug that taught this — `nanoid(16)` produced `-`/`_` that
the matcher rejected and about 40% of binds failed silently.

The identifier stored is `sha256(HASH_PEPPER ‖ 0x00 ‖ chatId)` (`:387-389`). **A phone
number is never stored and never logged.** Keep it that way.

**The limitation that matters: it is all `new Map()` in process memory** —
`server/identity.ts:132-135`, and the header says why at `:32-34`: *"because this parcel
does not own shared/schema.ts. Bindings vanish on restart."* So today a claim does not
survive a deploy. That is the gap programme three closes, and it is a table, not a rewrite.

Binding is **not a gate**. `allowanceForWorkspace()` at `:164-179` gives a bound room three
times the turns and three times the budget. The room address stays a bearer credential.

### 0.2 The room list already exists

`listStoredWorkspaces()` in `client/src/hooks/use-workspace.ts:48-58` reads
`localStorage`, returns newest-first, and returns `[]` rather than throwing in private
mode. `rememberWorkspace()` at `:60-68` keeps the **last 12**. `client/src/App.tsx:51`
routes `/w` with no token to "the rooms this browser remembers".

**This is the list the owner saw** in the screenshot with three identical "Conversion
tracking" rows. Item 7's dropdown is a re-presentation of a list that is already
maintained — not a new store. It is `localStorage`, not a cookie; the behaviour the owner
described is the behaviour it already has.

### 0.3 The ChatWoot bridge already exists

Not a stub: `server/bridge/chatwoot.ts` (139 lines) + `server/bridge/index.ts` (756) +
`server/bridge/attribution.ts` (210) + 466 lines of tests, and a 377-line
`client/src/components/workspace/BridgePanel.tsx`.

It uses the **application/agent API**: `POST {base}/api/v1/accounts/{accountId}/conversations/{conversationId}/messages`
with header `api_access_token` and `{"content", "message_type":"outgoing", "private":false}`
(`chatwoot.ts:55-91`). That is the right shape for *speaking as an agent into one existing
conversation*, and the wrong shape for *a room creating its own conversation*.

`parseChatwootInbound()` at `:104-139` already parses the webhook. `POST /api/bridge/inbound`
already exists at `server/routes.ts:1279-1291`.

**But `BridgePanel` is imported nowhere.** `data/builds/top-rated-team.json:30` records
that deliberately, so that nothing on the site claims a bridge the room UI does not offer.

`docs/parcels-programme-1.json:329-350` is the parcel that specified all of it, and its
`done` text is the design constitution. Its load-bearing rules, which programme three must
not contradict:

- "ATTRIBUTION IS THE WHOLE PARCEL. Everything else here is plumbing."
- Every outbound message names the speaker, from the room's member record.
- An agent's message must never arrive looking like a person's.
- An unmappable inbound sender is marked unattributed, never guessed.
- A bridged agent turn claims through `server/spend.ts`.
- **The room token never appears in an outbound payload.**
- A delivery failure surfaces on the message, not in a log.

### 0.4 Booking is Google's overlay, and there are seventeen doors into it

`shared/roster.ts:925` — `BOOK_A_CALL_URL = "https://calendar.app.google/ucoG2E1L6KV7BPUD7"`.
`client/src/lib/booking.ts` injects Google's `scheduling-button-script.js`, builds a
1×1 clipped host div, calls `button.load({url, color, label, target})` and then clicks the
hidden button Google inserts as the target's **next sibling** (`:92-121`). `color` is
effectively required — Google's validator is `/^#(?:[0-9a-f]{3}){1,2}$/` and `load()`
throws without it.

`useBooking()` (`client/src/hooks/use-booking.ts:75`) returns exactly three props —
`{ onClick, onMouseEnter, onFocus }` — spread as `{...booking}`. It warms on the **first
interaction anywhere on the page** (`:28-42`), because there is no hover on a phone and
`touchstart` is only ~50 ms ahead of `click`.

There are **17 anchors in 11 files**, plus the `/call` slash command
(`client/src/components/workspace/Composer.tsx:220-228`, the one caller that bypasses the
hook because a slash command has no click to fall through), plus a hardcoded literal in the
frozen `client/index.html:133` for the no-JS shell.

**This is why the popup must keep `useBooking()`'s three-prop contract.** A parcel that
changes 17 call sites is a parcel that collides with every other parcel in its wave. Change
what the hook *does*, not what it *returns*.

---

## 1. THE UNIPILE CONTRACT

### 1.1 Base URL, key, and the one place they may live

**[V]** Every request is `https://{UNIPILE_DSN}/api/v1/...` where the DSN carries **host and
a non-standard port** — the reference default is `api1.unipile.com:13111`, and it differs
per tenant. Read it from `process.env.UNIPILE_DSN`. **Never hardcode `api1` or `13111`.**

**[V]** Authentication is one header, no OAuth, no `Bearer`:

```
X-API-KEY: {UNIPILE_API_KEY}
accept: application/json
```

The token authorises the **whole Unipile workspace**, not one account. Therefore:

> **The key never reaches the browser.** No client-side fetch to Unipile, ever. Every call
> is server-side, behind our own endpoint. The docs say it themselves: *"Utmost caution must
> be exercised to prevent inadvertent exposure of your X-API-KEY."*

Both variables are set in the Render dashboard as of 2026-09-09. `.env.example` must list
them, and the code must be **inert with a sentence** when they are absent — the pattern
`server/waha.ts` already uses, not a crash and not a dead button.

### 1.2 The error envelope — the same on every route

**[V]** RFC 7807-flavoured, `required`: `title`, `type`, `status`:

```json
{ "title": "…", "detail": "…", "instance": "…", "type": "errors/insufficient_privileges", "status": 403 }
```

`type` is a **closed enum per status code**, so a typed mapper is cheap. The ones that
matter operationally:

| status | `type` | what it actually means |
|---|---|---|
| 401 | `errors/disconnected_account` | the linked device fell off; needs re-pairing |
| 401 | `errors/expired_credentials` | Google's refresh token died; needs reconnect |
| 401 | `errors/insufficient_privileges` | **the calendar-scope trap of §1.3** |
| 403 | `errors/account_restricted` | WhatsApp restricted the number — the ban path |
| 404 | `errors/resource_not_found` | |
| 429 | `errors/too_many_requests` | present on the two send routes, absent on reads |
| 503 | `errors/no_client_session` | no live socket right now — **retry, do not re-pair** |
| 503 | `errors/network_down`, `errors/service_unavailable` | retry with backoff |
| 504 | `errors/request_timeout` | retry |

**[V]** There is no `Retry-After`, no rate-limit headers, and no documented numeric quota.
**Retry only 503 and 504.** Treat a 401 as a loud operator alert, never as a retry.

### 1.3 The owner's job before any of this works

**[V]** Verbatim from Unipile's calendar page:

> "Calendar permissions are not enabled by default on your Unipile account. You need to
> activate the relevant scopes in the Settings section of your dashboard and reconnect your
> account to grant these permissions before you can use these API requests."

So: **enable the calendar scopes in the Unipile dashboard and reconnect
`dan@top-rated.team`.** The `account_id` may or may not survive a reconnect — the code must
read it from config (`UNIPILE_CALENDAR_ACCOUNT_ID`, default
`SddnpBwYRJWtOyJhzFzlnQ`) rather than assuming it.

Calendar support is **Google and Microsoft only**. No IMAP calendar.

### 1.4 Calendar: seven endpoints, and no free/busy among them

**[V]** The complete calendar surface, enumerated by exhaustion:

| Method | Path |
|---|---|
| GET | `/api/v1/calendars` |
| GET | `/api/v1/calendars/{calendar_id}` |
| GET | `/api/v1/calendars/{calendar_id}/events` |
| POST | `/api/v1/calendars/{calendar_id}/events` |
| GET | `/api/v1/calendars/{calendar_id}/events/{event_id}` |
| PATCH | `/api/v1/calendars/{calendar_id}/events/{event_id}` |
| DELETE | `/api/v1/calendars/{calendar_id}/events/{event_id}` |

**There is no free/busy endpoint and no availability or slots endpoint.** Unipile does not
proxy Google's `freeBusy.query`. **We compute availability ourselves.** This is the single
biggest design fact for the booking widget.

**List calendars** — `GET /api/v1/calendars?account_id={id}&limit=10`. Returns
`{data: Calendar[], next_cursor?}`. A `Calendar` carries `id` (this is the `calendar_id`
for every events call), `is_read_only`, `is_primary`, `access_role`
(`owner|writer|reader|freeBusyReader`) and **`timezone`** — the calendar's own IANA zone.
Call this **once at setup**, take the `is_primary` entry, assert `is_read_only === false`,
cache the `calendar_id` and the timezone in config. Do not list calendars on every widget
load.

**List events** — `GET /api/v1/calendars/{calendar_id}/events?account_id={id}&start=…&end=…&expand_recurring=true&limit=100`.
Windows are **RFC3339 absolute instants** (`2026-02-27T17:07:49Z`), not local wall clock.

Three traps in the response, each of which silently shows a busy day as free:

1. **All-day events have no `date_time`.** `start`/`end` are an `anyOf`: a timed event is
   `{date_time, time_zone}`, an all-day event is `{date}` only. `new Date(ev.start.date_time)`
   yields `Invalid Date` on the owner's holiday and the week reads as open. **Branch on
   `"date" in ev.start`** and treat an all-day event as busy for that whole date in the
   calendar's timezone.
2. **`start`/`end` are containment filters, not overlap filters.** The docs say "starting
   after" and "ending before" — an event 09:00–10:00 is **excluded** from a
   `start=09:30&end=11:00` query while still blocking 09:30–10:00. **Pad the query window
   by a day on each side and do the real overlap test in our own code.**
3. **Recurrence.** Without `expand_recurring=true` a weekly standup comes back as one
   master event with an RRULE array rather than instances in the window — invisible to the
   calculation. **Always send `expand_recurring=true`.**

**What counts as busy.** Each event carries `transparency: "opaque" | "transparent"`
(Google's own free/busy marker), `is_cancelled`, `event_type`
(`birthday`, `fromGmail`, `outOfOffice`, …) and `attendees[].response_status`. There is a
`busy=true` query parameter, but **the docs never define it**. Do not rely on it alone:
fetch the window and filter in our own code on `is_cancelled !== true` **and**
`transparency !== "transparent"` **and** `event_type` not in a declined/birthday set. A rule
we can read and test beats an undocumented server-side interpretation.

**Create the event** — `POST /api/v1/calendars/{calendar_id}/events?account_id={id}`,
JSON body. Required: `title`, `attendees`, `start`, `end`. `attendees` is an array of
`{email}` and nothing else. Useful optional fields: `body`, `location`,
`transparency: "opaque"` so the booking blocks time, `visibility`,
`conference: {provider: "google_meet"}` — **with no `url`, which auto-provisions a Meet
link** — and `notify`.

**`notify` defaults to `false`, and that default is wrong for us.** **[V]** `true` means
"send notifications about the event to invited attendees" — Google's `sendUpdates`. **Set
`notify: true` or the visitor never receives an invite.**

**201 returns only `{object: "CalendarEventCreated", event_id}`** — not the event. To show
the visitor a Meet link you must `GET` the event afterwards.

**Unresolved [?]:** whether `attendees: []` satisfies the `required` constraint. The
OpenAPI declares no `minItems`, so an empty array is schema-valid, but nobody has tested
it. **Test it before relying on it**; the fallbacks are (a) the visitor's real email, which
we are collecting anyway, or (b) `dan@top-rated.team` as the sole attendee.

**Unresolved [?]:** whether `date_time` must be UTC-with-`Z` while `time_zone` is advisory,
or whether `date_time` may be local wall clock read in `time_zone`. The docs say "ISO 8601
UTC datetime" **and** carry a separate `time_zone` field, which is contradictory. **Send UTC
`Z` and the IANA zone both, then read the created event back out of Google Calendar and
confirm the real time before shipping.** A booking widget that is an hour out is worse than
no booking widget.

### 1.5 WhatsApp messaging

**[V]** Two send routes, both **`multipart/form-data`, not JSON** — the single biggest
porting difference from WAHA:

- `POST /api/v1/chats/{chat_id}/messages` — into an existing chat. Fields: `text`,
  `account_id` (optional, and worth setting as a safety rail), `quote_id`, `attachments`,
  `typing_duration` (WhatsApp only). Returns `{object: "MessageSent", message_id}`.
- `POST /api/v1/chats` — start a new chat. Required `account_id` and `attendees_ids`
  (array of attendee provider ids). The docs say it *"creates a new chat if needed or uses
  an existing one"*, so it is the single upsert send path. Returns
  `{object: "ChatStarted", chat_id, message_id}`.

Webhook creation is the exception: `POST /api/v1/webhooks` **is** JSON.

**Outbound to a stranger is permitted — and dangerous.** **[V]** Unipile's WhatsApp is a
**linked-device** integration (QR scan or an 8-digit pairing code), not the Business Cloud
API: there is no WABA, no template approval and no 24-hour customer-service window anywhere
in its WhatsApp guide. So the API will let us message a number that never wrote to us.
WhatsApp itself is the limit, and **[V]** Unipile's own provider-limits page is unambiguous:

> Fresh accounts can be blocked after only 2–3 new chats. […] We recommend waiting up to 24
> hours after connecting, reconnecting, or disconnecting/reconnecting a WhatsApp account
> before creating new chats. […] Avoid sending messages with intervals shorter than 10-20
> seconds. […] Number of new chat creations (outreach) — this is a metric monitored by
> WhatsApp.

And the asymmetry that decides our design: **"If you received lot of inbound message, you
can reply to all of them safely, like on UI."**

> **Replying to an inbound chat is safe and effectively unlimited. Creating a new chat to a
> stranger is the operation that gets the number banned.** Every flow in this programme
> therefore has the *visitor* open WhatsApp to us — a `wa.me` deep link, which is inbound —
> and we reply. This is what the owner described, and it is the safe direction. Do not build
> a path that cold-messages a number the visitor typed.

**Reading a contact.** `GET /api/v1/chats/{chat_id}/attendees` and
`GET /api/v1/chat_attendees/{id}` return a `ChatAttendee`: `id` (Unipile's, stable, the
right primary key for our own tables), `provider_id`, `name` (the WhatsApp push name),
`picture_url`, `is_self`. **There is no `phone` field and no WhatsApp branch of
`specifics`.** `GET /api/v1/users/{identifier}?account_id={id}` doubles as the "does this
number have WhatsApp" check — **[V]** *"You can test if a number has WhatsApp by using the
GET /users/{identifier} route."*

**The `@lid` landmine.** **[V]** WhatsApp is migrating from phone-bearing JIDs to LID, a
privacy identifier that decouples a user from their number. Unipile's own docs are
internally inconsistent about which form is "internal": one bullet says `0000000000@lid`,
the parenthetical under *public* id says `33600000000@s.whatsapp.net`. So:

> `attendee_provider_id` is a **tagged union**, not a phone number. It may be
> `<phone>@s.whatsapp.net`, from which the number is recoverable, or `<id>@lid`, from which
> it is not. **Never regex it for digits and assume a phone.** WAHA has a
> `GET /api/{session}/lids/{lid}` resolver; **no equivalent exists in Unipile's index**, so
> this is a capability the migration loses. Settle it with Unipile support before any code
> depends on recovering a number.

The identity ladder, most reliable first: `attendee_id` (ours to associate) →
`attendee_provider_id` (tagged union) → `attendee_name` (push name: user-set, unverified,
changeable, sometimes absent — display only) → phone number (**not a first-class field
anywhere**).

### 1.6 The webhook, created in code, and the rule the owner set

**[V]** `POST /api/v1/webhooks`, JSON, `X-API-KEY`. Minimum body
`{"request_url": "…", "source": "messaging"}`. `GET /api/v1/webhooks` lists;
`DELETE /api/v1/webhooks/{id}` removes.

**Create it programmatically.** The owner asked for this directly. On boot: list, look for
ours by `request_url`, create it when absent, and never create a second. Delete ones
pointing at retired hosts. Idempotent, and inert without the env vars.

**[V]** Two documented gotchas, both of which fail silently:

1. **A webhook created by API has no `Content-Type` header by default** — verbatim: *"Unlike
   webhook created from Dashboard, webhook created by API does not contain header content
   type JSON by default."* Without
   `headers: [{"key":"Content-Type","value":"application/json"}]`, `express.json()` will not
   parse the body and `req.body` is empty.
2. **There is no HMAC signature.** Authentication is a shared secret in a header you choose
   — the docs' example is `{"key":"Unipile-Auth","value":"yoursecretkey"}`. No signing, no
   timestamp, no replay protection. So the secret must be long and random
   (`UNIPILE_WEBHOOK_SECRET`), compared with `timingSafeEqual`, and the endpoint treated as
   hostile until it matches. `server/identity.ts:466-474` shows the shape — **but note its
   bug and do not copy it: when the env var is unset the check passes.** In this programme,
   no secret means the endpoint refuses everything.

**[V] Retries: five attempts when the response is not 200 within 30 s, with increasing
delay.** So reply 200 fast, and **make handling idempotent on `message_id`** or a retry
duplicates a room message.

**[V] The payload.** Field names differ from the REST API in a way that produces a real bug:

| field | note |
|---|---|
| `account_id`, `account_type` | which of our accounts this arrived on |
| `account_info.user_id` | **our own** provider id on that account |
| `event` | `message_received` \| `message_reaction` \| `message_read` \| `message_edited` \| `message_deleted` \| `message_delivered` |
| `chat_id` | Unipile's chat id |
| `message_id` | the idempotency key |
| **`message`** | **the body is `message`, a string — the REST API calls it `text`** |
| `sender.attendee_provider_id` | the sender's provider id |
| `sender.attendee_name` | push name |
| `attendees[]` | everyone in the chat |
| `timestamp` | ISO 8601 |

**[V] Our own sent messages arrive as `message_received` too** — verbatim: *"Sent messages
are included in message_received […] You can compare `account_info.user_id` with
`sender.attendee_provider_id` to know if linked Unipile account is the sender or not."*
There is **no `fromMe` flag**. A handler that skips this comparison will echo our own
agents' replies back into the room as if the visitor had said them.

**[V] A reconnect delivers a burst of messages from the disconnected period** — there is no
backfill on first connect, but there is on reconnect. So check `timestamp` before treating a
message as live.

### The message rule, stated once, binding on every parcel

The owner's instruction, and it is not negotiable:

> **Always check who the message is from, who it is to, and which chat it is in.**

Concretely, every inbound message is dropped unless **all** of these hold, and each check is
its own named function with its own test:

1. **The shared secret matches**, compared with `timingSafeEqual`. No secret configured →
   refuse.
2. **`account_id` is one of ours** — an allowlist of the account ids we operate, not "any
   account_id present".
3. **It is not our own echo** — `sender.attendee_provider_id !== account_info.user_id`.
4. **`chat_id` is present and is the chat we expect** for whatever the message is answering.
   A booking code from a different chat than the one it was planted in is not a match.
5. **`message_id` has not been seen** — idempotent, because retries are guaranteed.
6. **`event === "message_received"`** — the other five events are not messages.
7. **`timestamp` is recent** — a reconnect burst is not a live answer.

An inbound message that fails any check is recorded and dropped, never guessed at. This is
the same rule `server/bridge/index.ts` already applies to ChatWoot ("an unmappable inbound
sender is marked unattributed, never guessed") and it is now written down for WhatsApp too.

---

## 2. FOUR DECISIONS ALREADY MADE, with the reasoning, so no parcel relitigates them

### 2.1 Visitor login stays on LinkedIn OIDC. Unipile hosted auth is NOT for visitors.

The owner asked whether a room could be claimed through Unipile. It can, and it must not
be, for three independent reasons — any one of which would be enough.

**Cost.** **[V]** Unipile's own pricing page: *"1 account = 1 linked identity"*, billed per
linked account per month on the **peak** count in each 30-day period — €49 total for up to
10 accounts, then €5 each to 50, €4 each to 200. In this product the thing being connected
would be **the visitor**. So every claimed room becomes a billed identity every month for
as long as it stays connected: 100 claimed rooms ≈ €499/month, 1,000 ≈ €4,000+/month —
recurring, for a login. `render.yaml` sets `ROOM_MONTHLY_BUDGET_USD` to **$5** per room. The
identity bill would exceed the entire AI budget of the room it identifies.

**What it asks of the visitor.** **[V]** Unipile's LinkedIn connection supports
username/password, 2FA and one-time password, and an account row reports
`connection_method: credentials | cookies | unilogin`. The docs warn against putting the
hosted-auth link in an iframe because of *"issues with solving the LinkedIn captcha"* — that
is not an OAuth consent screen, it is an automated login being challenged. **The visitor
would type their LinkedIn password into a page on `account.unipile.com`, and we would then
hold an operational session on their account.** LinkedIn OIDC proves who someone is and
gives us `sub` and a name. Unipile hosted auth hands us their account. For "prove you own
this room", the first is correct and the second is disproportionate.

**It is already built.** §0.1. `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are the
only things it wants.

**[V]** LinkedIn's discovery document confirms `scopes_supported: ["openid","profile","email"]`
and `claims_supported` including `email` and `email_verified`. The repo requests
`"openid profile"` only. **Adding `email` is a deliberate decision with a review cost, not a
free upgrade** — leave the scope alone unless the owner asks, and say so if a parcel wants
an address.

### 2.2 WhatsApp: swap the transport for OUR number only

WAHA is used for exactly two things: learning our own number so the `wa.me` link has a
destination (`probeWaha()`, `server/waha.ts:89-115`), and receiving an inbound webhook.
Unipile does both for **one** account — ours — at €49/month flat and **no per-visitor
cost**. That is a legitimate and worthwhile swap.

**It does not change what we ask of the visitor**, and must not. The visitor still taps a
`wa.me` link and messages us. Connecting the *visitor's* WhatsApp through Unipile would be
€5/visitor/month for a QR scan that links their personal WhatsApp to our tenant — strictly
worse than the click-to-chat proof we already have, on every axis.

**Ban exposure does not improve.** WAHA and Unipile are both WhatsApp-Web automation; the
number carries the same risk either way. What improves is that Unipile exposes account-status
webhooks, so a session that falls off is something we learn rather than discover.

### 2.3 The booking popup computes availability itself, and the visitor's own calendar stays out of it

There is no free/busy endpoint (§1.4), so slots are ours to compute: a padded events query,
our own overlap test, our own working-hours rule in the calendar's own timezone, cached
server-side for 30–60 s.

The owner asked for two-way sync with the booker's own Google Calendar so he cannot be
booked into a slot the *visitor* is busy in. **The cheap 95% of that is `notify: true`.**
**[V]** Google emails the invite, the visitor accepts it in their own client, and their own
calendar does the conflict check — with zero OAuth, zero consent screen, zero extra linked
account and zero euros. Connecting the visitor's calendar through Unipile would cost
€5/visitor/month and a consent flow, to catch the case where someone books a slot they are
personally busy in and then declines the invite.

So: **build the invite path. Do not build visitor-calendar connection.** If the owner still
wants it after seeing the invite work, it is a later parcel with a stated price.

### 2.4 Correlating a WhatsApp reply to a session: plant a code, do not guess from time

The owner suggested matching on the click time plus the booked date and time. That is
weaker than what the repo already does, and the reason is structural:

**We have one WhatsApp number.** Email can do per-session addressing
(`room+abc123@…`); a web app can do per-session URLs. WhatsApp gives us **no per-session
address** — every visitor writes to the same JID. So no property of the transport identifies
the session. Correlation must be carried **inside the message content**, or established
before the message exists. There is no third option.

Of the signals actually in the webhook payload: the sender's JID cannot be matched for a
first-time visitor (we have never seen it) and may be `@lid` anyway; the push name is
self-set and not unique; the timestamp is a weak tiebreak that fails the moment two people
book in the same minute. **Only the message text is high-precision, and only because we can
plant a token in it via `?text=`.**

This is exactly what `bindMessage()` already does with `Room-bind {nonce}`. **Do the same
for a booking**: a short dictatable code in the pre-filled text, from the same alphabet
(no `-`, `_`, `I`, `O`, `0`, `1`), matched by an exported regex the handler and the test
share. The owner's five-minute expiry is a good **secondary** guard — keep it, as an expiry
on the planted code rather than as the matching rule.

---

## 3. THE BOOKING API, fixed here so two parcels can build to it in parallel

`booking-server` implements these; `booking-dialog` consumes them. Neither may change the
shape without changing this file first.

```
GET /api/booking/slots?from=2026-09-10&days=14
→ 200
{
  "timezone": "Europe/Bratislava",
  "slotMinutes": 30,
  "days": [
    { "date": "2026-09-10", "slots": ["09:00", "09:30", "14:00"] },
    { "date": "2026-09-11", "slots": [] }
  ]
}
→ 503 { "error": "…one sentence a visitor can read…" }
```

Slots are **local wall-clock times in `timezone`**, because that is what a human picks. The
server converts. A day with no slots is present with an empty array, so the UI can say
"nothing free" rather than omitting the day.

```
POST /api/booking
{ "date": "2026-09-10", "time": "14:00", "email": "someone@example.com", "name": "…", "topic": "google-ads" }
→ 201
{
  "booked": true,
  "startsAt": "2026-09-10T12:00:00.000Z",
  "timezone": "Europe/Bratislava",
  "meetUrl": "https://meet.google.com/…" | null,
  "invited": true,
  "whatsapp": { "url": "https://wa.me/420774654822?text=…", "code": "K7QMX2" }
}
→ 409 { "error": "That time has just been taken. Here is what is still free." , "days": [...] }
→ 503 { "error": "…" }
```

`email` is the **only** optional field the owner wants on the form. With it, `notify: true`
and the visitor gets a real Google invite. Without it, the event is still created and
`invited` is `false` — and per the owner, a placeholder address built from the phone number
left of the `@` is permitted **only** when there is a phone number to build it from, and it
must never be presented to the visitor as an invite that will arrive.

`whatsapp.code` is the planted code of §2.4. `whatsapp.url` is the deep link the popup
opens on a phone.

```
POST /api/unipile/inbound          (the webhook; secret in a header)
→ 200 { "ok": true }               always, fast, idempotent
→ 401 { "error": "Not found" }     secret missing or wrong
```

```
GET /api/booking/confirmed?code=K7QMX2
→ 200 { "confirmed": true, "at": "2026-09-09T10:03:00.000Z" } | { "confirmed": false }
```

The popup polls this after opening WhatsApp, so the confirmation appears in the popup the
visitor came from as well as in WhatsApp. The code expires in five minutes; after that the
visitor books again.

---

## 4. ENVIRONMENT

| variable | who sets it | what happens without it |
|---|---|---|
| `UNIPILE_DSN` | Render dashboard ✅ set | every Unipile path reports unavailable in a sentence |
| `UNIPILE_API_KEY` | Render dashboard ✅ set | same |
| `UNIPILE_CALENDAR_ACCOUNT_ID` | default `SddnpBwYRJWtOyJhzFzlnQ` | falls back to the default |
| `UNIPILE_WHATSAPP_ACCOUNT_ID` | default `y8T1nMDYR0ejEsMQpLr9OA` | falls back to the default |
| `UNIPILE_WEBHOOK_SECRET` | Render dashboard — **needed** | the inbound endpoint refuses everything |
| `LINKEDIN_CLIENT_ID` / `_SECRET` | Render dashboard — status unknown | the LinkedIn route says so and WhatsApp stays |
| `DATABASE_URL` | Render dashboard — **not set** | **rooms live in memory and every deploy destroys them** |
| `PUBLIC_BASE_URL` | set to the apex | the webhook cannot compute its own address |

**`DATABASE_URL` is the one that blocks a claim from meaning anything.** A claim persisted
into a table that does not exist is a claim that vanishes on the next deploy, which is the
bug the owner already reported. `room-identity` must state this in its own report rather
than quietly shipping a feature that cannot work yet.

---

## 5. WHAT IS NOT IN THIS PROGRAMME

- **Connecting a visitor's own calendar or WhatsApp account.** §2.1, §2.3. Priced, refused,
  and available as a later parcel if the owner wants it after seeing the invite work.
- **Adding `email` to the LinkedIn scope.** §2.1.
- **Rebuilding adgrant.ai's 74 library pages.** `adgrant-front` builds the new front page
  and shell; the library stays where it is and is linked, exactly as
  `client/src/components/site/doors/adgrant-style.ts:17-27` already links it.
- **A LID→phone resolver.** §1.5. Blocked on Unipile support.
