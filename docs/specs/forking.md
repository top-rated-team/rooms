# Forking, including a fork of a fork

**This is the answer the catalogue resolver implements.** A partner who
forks top-rated.team, and a partner who forks adgrant.ai, both go through
`resolveCatalogue` in `shared/catalogue.ts`. Nothing about whose name a
room prints is left to a page to remember.

AdGrant.AI is the first in-house fork: the same doors, rooms, agents and
sign-in, re-pointed at what each service does for a nonprofit. A live
white-label request already exists against adgrant.ai, so a fork of that
fork has to be a resolved case, not a surprise.

---

## Two houses, one company

| | top-rated.team | adgrant.ai |
|---|---|---|
| Kind | reference house | second in-house house |
| Trading name (`displayName`) | Top-Rated Team | AdGrant.AI |
| Legal name | Top-Rated Team (Danylo Burykin SZČO) | the same — AdGrant.AI is a product, not a second registered person |
| Terms | `https://top-rated.team/terms` | `https://adgrant.ai/terms` |
| Privacy | `https://top-rated.team/privacy` | `https://adgrant.ai/privacy` |
| Contact | `https://top-rated.team/contact` | the same address, labelled for AdGrant.AI |
| Face | the Top-Rated Team chrome | AdGrant.AI's own mark, menu and footer |
| Catalogue | `DOORS` | `adgrantCatalogue()` — every row, including the ones hidden for the LinkedIn review, with copy rewritten for a nonprofit |

A visitor on adgrant.ai never sees the Top-Rated Team header. The footer
names the same legal person and links back to top-rated.team as a
different site. That is honest: one company, two faces.

---

## What `resolveCatalogue` does

Three inputs, and only these three:

1. **The door table** — `DOORS`, or an already-resolved catalogue.
2. **An operator**, or none. None is the reference deployment.
3. **A house**, or none. None (or `top-rated-team`) is today's table.
   `adgrant-ai` clones every row and rewrites it before anything else
   runs.

`catalogue()` in `shared/doors.ts` is this function bound to `DOORS`.
`adgrantCatalogue()` is the same call with the house already set.

With no operator and no AdGrant house, the function returns `DOORS`
itself — the same array, the same row objects. That is what keeps
top-rated.team still.

---

## A partner who forks top-rated.team

One hop. `OperatorConfig.base` is omitted.

| Mode | Legal name | Terms | Contact | Agents | Room footer |
|---|---|---|---|---|---|
| **named** (referral) | ours — Top-Rated Team (Danylo Burykin SZČO) | ours, `top-rated.team/terms` | ours | ours, with our copy | our legal name, our terms, our invoice line |
| **white-label** | the partner's registered name | the partner's, or "none yet" if they have not given one | the partner's, or "no address on file" | ours, speaking the partner's legal name where the row used to name us | the partner's legal name, terms, invoice line and contact |
| **unchanged** (already somebody else's row) | that other company | theirs, or "none yet" — never ours | theirs, or none | none of ours, if the row said so | that other company |

White-label is refused when the row is not ours to re-brand: a partner
door, or the lawyer-first door where a lawyer is answerable for part of
the work. The resolver throws rather than rendering a lie.

The tool on a row — AdGrant.AI — keeps its own name under white-label.
The software is still that product. The contract is not.

---

## A partner who forks adgrant.ai (a fork of a fork)

Two hops, or one config with `base: "adgrant-ai"`. Both must agree.

1. Clone `DOORS` as the AdGrant in-house catalogue: every service, hidden
   ones included, copy re-pointed at a nonprofit, contracts carrying
   AdGrant.AI's trading name and `https://adgrant.ai/terms`.
2. Apply the partner's operator on that catalogue. The house legal name
   is now read off the inner catalogue, so white-label replaces *that*
   house, not a name that is no longer on the row.

| Mode | Legal name | Terms | Contact | Agents | Room footer |
|---|---|---|---|---|---|
| **named** | Top-Rated Team (Danylo Burykin SZČO) — the same company, because AdGrant.AI is not a second registered person | AdGrant.AI's, `https://adgrant.ai/terms` | AdGrant.AI's contact label, the same address | the AdGrant clone's agents and starters — what the service does for a nonprofit | that legal name, AdGrant terms, AdGrant invoice line |
| **white-label** | the partner's registered name | the partner's, or "none yet" | the partner's, or none | the AdGrant clone's agents, now naming the partner where the row named the house | the partner's legal name, terms, invoice line and contact |
| **unchanged** | the other company already on the row (Maksymenko, today) | theirs, or "none yet" | theirs, or none | none of ours | that other company |

The room footer always prints the **resolved** row's `contract`. It does
not look up `DOORS` again and it does not fall back to the outer house.
A named fork of adgrant.ai therefore shows AdGrant terms in the room, not
top-rated.team's. A white-label fork of adgrant.ai shows the partner's.

Chrome stays the face of the deployment the visitor is on. An in-house
fork keeps AdGrant.AI's mark and footer. A partner's own domain keeps
whatever they set on `/setup`. The catalogue does not pick a header.

---

## Privacy and terms on a fork

A fork does not inherit another company's policy pages. It gets its own,
part-filled from what that deployment actually has:

- **login methods** — LinkedIn, WhatsApp, a link to email — each named
  only as something this deployment can do, and only when it is
  configured
- **rooms** — a room's address is a bearer credential; that sentence is
  true wherever rooms open
- **partner services** — every resolved row whose `legalName` is not
  this operator's, named, so the page cannot claim the work is all ours

`catalogueLegalFacts` in `shared/catalogue.ts` is that fill. AdGrant.AI's
own `/privacy` and `/terms` read it. A partner's pages should read it
too; until they do, the handoff is in the parcel report.

---

## What must not change

- adgrant.ai answers at the root with its own head, icon and card.
- top-rated.team/adgrant keeps 301ing to adgrant.ai.
- `resolveCatalogue(DOORS)` with no operator and no AdGrant house is
  `DOORS`, the same array.
- The 27 library pages, the generator, the templates, the sitemap and
  the head rewrite stay as they are.
