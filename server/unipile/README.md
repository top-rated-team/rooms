# Unipile client

One HTTP client for the Unipile surface this programme uses, server-side only.
Calendar, messaging and webhook calls are not in this directory's core files;
three other parcels own those and each imports this module.

Base URL is `https://${UNIPILE_DSN}/api/v1/...`. The DSN is host and port, read
from the environment at call time, because it differs per tenant. Auth is the
single header `X-API-KEY`, with no Bearer prefix. That key authorises the whole
Unipile workspace, not one account, so nothing under `server/unipile/` may be
imported by client code. A test in `client.test.ts` fails if anything under
`client/` does.

Missing `UNIPILE_DSN` or `UNIPILE_API_KEY` is not a crash: `available()` is
false and `unavailableLine()` is one sentence a caller can put on screen.

Errors are the RFC 7807 envelope mapped to a union keyed on `type`. Unipile's
`detail` is dropped; it can name our account. Retries cover 503 and 504 only.
A 401 is logged as an operator alert and is not retried.

`accounts.ts` wraps `GET /api/v1/accounts` and `GET /api/v1/accounts/{id}` so
an operator view can see whether the calendar account and the WhatsApp account
are still connected, and what `sources[].status` says. A connected account can
rot. Phone numbers in Unipile's `connection_params` are not kept.

Read `docs/specs/unipile-rooms-and-booking.md` §1 for the contract this was
built from.
