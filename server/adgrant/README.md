# Ad Grant structure generator

This directory is product A in `docs/specs/adgrant-and-dev-agents.md` section 2:
generate a complete, policy-checked Ad Grant account structure from a nonprofit's
website, show it, and let them take a CSV into Google Ads Editor. It does not
write the structure into a Google Ads account. There is no Google Ads API client
here, no OAuth, no customer id, and no upload.

Writing into a live grant account is a different product. It needs a developer
token at Basic Access, an OAuth client, and a manager link a person at the
nonprofit accepts in the Google Ads UI. No page can promise that inside one
session.

## Policy gate

`policy.ts` is the valuable part. Pure functions over the generated object, no
network. Each rule is a named export with its Google page in a comment:

- single-word keywords, except the published list, brand terms and recognized
  medical conditions — https://support.google.com/nonprofits/answer/7587473
- at least two ad groups per campaign — https://support.google.com/nonprofits/answer/9314402
- at least two sitelinks — same page
- a specific geo-target — https://support.google.com/nonprofits/answer/117827
- https on an authorised domain — https://support.google.com/nonprofits/answer/1657899
- daily budget at or under $329 — https://support.google.com/nonprofits/answer/1332166
- conversion-based Smart bidding, not manual CPC, for accounts that require it
  (created on or after 22 April 2019) — https://support.google.com/nonprofits/answer/117827
- the $2 program-level max CPC where manual bidding is still in play —
  https://support.google.com/nonprofits/answer/98870

A generator that produced a structure Google would suspend would be worse than
no generator. If the gate fails, the structure is not shown and not counted.

## Three generations

Counted when a structure is produced, not when it is requested. Per identified
person, through the room binding that already exists (LinkedIn OpenID Connect or
the WhatsApp click-to-chat proof in `server/identity.ts`). There is not a third
way in.

Three is capacity, not a gift. A Google Ads API developer token is limited to
15,000 operations a day across every client, and one of these structures is
about 150 operations if it were later written into an account. This product does
not do that write. The remaining count is on every response so a visitor does
not have to hit the wall to learn it.

The count is a table, `adgrant_generations` in `shared/schema-adgrant.ts`.
Without `DATABASE_URL`, or before `npm run db:push`, it lives in this process
and a restart forgets it. The response says so.

## Routes

- `POST /api/workspaces/:token/adgrant/generate` — `{ websiteUrl, location, organisationName? }`
- `GET /api/workspaces/:token/adgrant/generations` — remaining, cap, and why three
