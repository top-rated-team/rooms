# WhatsApp

One interface, two transports. Callers above `server/whatsapp/` — room
sign-in, the booking proof, the confirmation reply, the QR probe — talk to
that module and to nothing else.

```
send a message to a chat
parse an inbound body
tell me our own number
tell me whether the account is alive
```

## WAHA is the default, and the only one a fork is told to run

`.env.example`, the README and this page describe WAHA. A partner or a
white-label fork runs WAHA, pairs a number, sets the variables below, and
points the webhook here. That is the only WhatsApp instruction they get.

| variable | what it is |
|---|---|
| `WAHA_BASE_URL` | origin of the WAHA host, no trailing slash |
| `WAHA_API_KEY` | optional; sent as `X-Api-Key` when set |
| `WAHA_SESSION` | session name; defaults to `default` |
| `WAHA_WEBHOOK_SECRET` | shared secret the webhook must echo; without it inbound is refused |

Webhook address: `${PUBLIC_BASE_URL}/api/hooks/inbound` (and the older
`/api/identity/whatsapp/inbound` path still answers for a WAHA session that
was pointed there). Header: `X-Webhook-Secret`, or the name in
`WAHA_WEBHOOK_SECRET`'s pair on the WAHA side.

Send and inbound parse for WAHA live in `server/bridge/waha.ts`. The
interface's WAHA transport calls that file; it does not grow a second client.

### Fork setup, in order

1. Run [WAHA](https://waha.devlike.pro/) on a host you control.
2. Pair your WhatsApp number to a session (QR or pairing code in the WAHA UI).
3. Set `WAHA_BASE_URL`, and optionally `WAHA_API_KEY`, `WAHA_SESSION`,
   `WAHA_WEBHOOK_SECRET`.
4. Point the WAHA message webhook at `${PUBLIC_BASE_URL}/api/hooks/inbound`
   with the shared secret in `X-Webhook-Secret`.
5. Set `PUBLIC_BASE_URL` and `ROOM_HASH_PEPPER` so `wa.me` links and stored
   chat-id hashes stay stable across restarts.

Without those, every WhatsApp path reports unavailable in one sentence and
LinkedIn stays the way in. Nothing is faked.

## The other transport is a generic hosted-API adapter

`server/whatsapp/hosted.ts` names no vendor. Its base URL, auth header,
account id and webhook secret come from the environment
(`HOSTED_WHATSAPP_*`). They are values on a deployment, not strings in this
repository. Where a request or response shape is specific to the service a
house host happens to use, that file describes the shape; the
vendor-specific transcript lives in `private/` for whoever maintains that
tenant.

## Transport selection

Selecting the transport is reading the environment, not a migration. The
same number, the same account and the same peppered chat-id hashes, so every
existing binding still resolves.

If both are configured:

- on a house host (`isHouseHost` in `shared/operator.ts`) → hosted wins
- everywhere else → WAHA wins

A missing host falls back to `PUBLIC_BASE_URL`.

## The seven inbound checks

Every inbound message is dropped unless all of these hold. Each is a named
function with its own test, for both transports:

1. **Who it is from** — a sender id is present.
2. **Who it is to** — `account_id` is on the allowlist of accounts we operate.
3. **Which chat it is in** — `chat_id` is present (and equals the expected
   chat when one was planted).
4. **Is it our own echo** — `fromMe` / `is_sender`, or sender ≠ our user id.
5. **Is it a group** — booking and room sign-in are 1:1.
6. **Has the code expired** — timestamp is recent (a reconnect burst is not
   a live answer); planted-code TTLs sit above this.
7. **Is the account ours** — same allowlist as (2).

There is no HMAC on the hosted webhook. The shared secret is compared with
`timingSafeEqual`. No secret configured means the endpoint refuses
everything.

A check dropped because a webhook spells a field differently is the bug this
interface exists to avoid. Hosted messaging uses `message` for the body and
`message_received` for the event; WAHA uses `body`/`text` and `message`.
Both are accepted.

## Four decisions already made

1. **Visitor login stays on LinkedIn OIDC.** A hosted auth product that
   connects the visitor's own LinkedIn or WhatsApp account is not for
   visitors here — cost, disproportion, and the OIDC path is already built.
2. **WhatsApp is our number only.** The visitor taps a `wa.me` link and
   messages us. We do not connect their WhatsApp.
3. **Booking availability is computed here**, not by asking a visitor's
   calendar. The invite (`notify: true` when there is an address) is the
   cheap conflict check on their side.
4. **Correlate a reply by a planted code**, not by time. One WhatsApp
   number means the session identity travels inside the message text
   (`Room-bind`, `Room-login`, booking codes) from the same dictatable
   alphabet.

## What must not change

- WhatsApp stays house-only where `shared/operator.ts` says so.
- The sign-in code is spent on first use.
- No phone number is ever stored or logged — only
  `sha256(HASH_PEPPER ‖ 0x00 ‖ chatId)`.
- The QR of the `wa.me` link renders on a white plate on desktop, and not
  at all on a phone (the phone opens WhatsApp directly).
