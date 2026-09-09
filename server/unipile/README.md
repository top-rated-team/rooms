This directory exists ahead of its code so `scripts/check-parcels.mjs` can verify that
programme three's `unipile-core` parcel owns a path that is really there. The checker
refuses a manifest whose owned path has not even a directory, and it is right to: a parcel
that owns nothing is a parcel nobody can review.

What lands here: one HTTP client for Unipile — DSN and key from the environment, the
`X-API-KEY` header, the RFC 7807 error envelope mapped to a typed union, and retries on
503/504 only. Read `docs/specs/unipile-rooms-and-booking.md` §1 first; every contract is
transcribed there with the URL it came from.

The key authorises the whole Unipile workspace, so nothing in this directory may ever be
imported by client code.
