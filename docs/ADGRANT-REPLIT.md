# adgrant.ai goes back to its own application, and app.adgrant.ai is its MakeHybrid white label

Updated 24 October 2026.

- **adgrant.ai** goes back to the application it started as: the Replit app,
  with its own content API, generator, LinkedIn login, admin and affiliate
  programme.
- **app.adgrant.ai** is AdGrant.AI's white label on MakeHybrid, the way
  app.top-rated.team is Top-Rated Team's. The whole product appears under
  AdGrant.AI's name: Hybrid Rooms with their two-way WhatsApp, ChatWoot, Slack
  and ClickUp channels, the LinkedIn API, MCP, and the agents.
- **This process** answers on no AdGrant host. It only sends old addresses on.

For one day (23 October) app.adgrant.ai was this process. On 24 October the
owner moved AdGrant.AI to MakeHybrid like Top-Rated Team. The brand is
deployed from code in the make-hybrid repository: the `adgrant@1` seed in
`api/src/complete/brand-seed.ts`, owned by `contact@adgrant.ai`'s
organization.

Nothing is deleted. adgrant.ai and app.adgrant.ai stay in `ADGRANT_HOSTS` and
`HOUSE_HOSTS`. If either is pointed back at this service, it answers exactly as
it did, with no build. That is the rollback.

| | where it goes |
|---|---|
| `adgrant.ai`, `www.adgrant.ai` | the Replit app |
| `app.adgrant.ai` | MakeHybrid (the `makehybrid` Render service), as AdGrant.AI |
| AdGrant.AI's rooms, agents, sign-in | MakeHybrid, `https://app.adgrant.ai/rooms.html` |
| an old AdGrant.AI room address, `/w/<token>` | AdGrant.AI's rooms on app.adgrant.ai, without the token, like Top-Rated Team's |
| a request to open an AdGrant.AI room on a Top-Rated Team host | 410, with `https://app.adgrant.ai/rooms.html` |
| `top-rated.team/adgrant/<library>` and `/adgrant` | 301 → adgrant.ai, path kept |
| `top-rated.team/adgrant/terms`, `/privacy` | 301 → app.adgrant.ai `/terms.html`, `/privacy.html` |
| `top-rated.team/adgrant/services…` and anything else | 301 → `https://app.adgrant.ai/` |
| AdGrant terms printed in a partner's fork of this house | `https://app.adgrant.ai/terms.html` |
| `/api/adgrant/stats`, `npm run adgrant:build` | read the Replit app again |

The connector no longer lists `create_room`, because nothing opens a room
here. Its route still answers old callers with where rooms are
(`docs/connector.md`).

---

## The order

### 1. A day before

- Open the Replit app on its own `*.replit.app` address and check it still
  deploys and answers. Its code is not on GitHub, so nothing here can check it.
- Write down the DNS records adgrant.ai, www.adgrant.ai and app.adgrant.ai
  have now. They are the rollback.
- Lower the TTL on all three to 300 seconds.

### 2. MakeHybrid: the brand, free

1. Merge the make-hybrid pull request that adds the `adgrant@1` seed. At boot,
   it sets up the AdGrant.AI brand on `contact@adgrant.ai`'s organization, with
   the domain `app.adgrant.ai`. Top-Rated Team's brand is not touched.
2. Render → the **makehybrid** service → Environment → add `contact@adgrant.ai`
   to `MAKEHYBRID_ADMIN_EMAILS`, comma-separated. Saving redeploys. Sign in
   once as contact@adgrant.ai. From then on its organization is comped: free,
   with no limit.
3. Stripe → Customers → contact@adgrant.ai → its subscription → **Cancel
   immediately**. A comped organization is never touched by Stripe's webhooks,
   but Stripe charges a subscription that is still open when its trial ends.

### 3. app.adgrant.ai moves to MakeHybrid

A name can be on only one Render service, so it has to come off this one
before it goes on the makehybrid service. **Check first that the other side
can take it.** A Render Hobby workspace includes two custom domains. On
Render's current plans each extra one costs $0.25 a month; an older Hobby
workspace may refuse a third outright. Until the makehybrid side can take it,
leave `app.adgrant.ai` where it is. It keeps serving AdGrant.AI's rooms from
this process, and this repository's pull request stays unmerged.

Where it goes depends on where makehybrid.com runs. make-hybrid's
`deploy/hetzner/RUNBOOK.md` moves it from Render to a Hetzner server, where a
brand's domain needs no slot on Render at all.

**Still on Render, with room for one more domain:**

1. Render → the **top-rated-team** service (`srv-daeq2bv40ujc7389ao4g`) →
   Settings → Custom Domains → delete `app.adgrant.ai`.
2. Render → the **makehybrid** service → Custom Domains → add `app.adgrant.ai`.
3. At adgrant.ai's DNS provider, change the `app` record to what that service
   shows. If `BRAND_CNAME_TARGET` is set, the white-label page on
   makehybrid.com names the neutral hostname to point at instead
   (make-hybrid's `RENDER.md`, section 4).
4. **Verify** on Render.

**On Hetzner:**

1. Delete `app.adgrant.ai` from the top-rated-team service, and point the
   `app` record at that server, the same way makehybrid.com points
   there, or at `BRAND_CNAME_TARGET` if one is set.
2. Nothing to add by hand. Caddy gets the certificate the first time the name
   is opened, because MakeHybrid answers yes for a live brand's own domain
   (`api/src/complete/tls-ask.ts`).

Either way, use DNS only (grey cloud) on Cloudflare until the certificate is
issued. Then open `https://app.adgrant.ai/`. It shows AdGrant.AI's name, logo
and colour on MakeHybrid. The logo is `https://adgrant.ai/logo.png`, so it
appears once the Replit app has the domain (step 6).

### 4. Merge this repository's pull request

It points the old AdGrant.AI addresses at MakeHybrid's pages (the table
above). Render deploys `main`.

### 5. The Replit app

Four changes, before its domain is attached.

**a. Old room addresses.** A room opened on adgrant.ai since September has the
address `https://adgrant.ai/w/<token>`. Send it on to app.adgrant.ai, path and
all. That works whichever app answers there. While app.adgrant.ai is still
this process, the address opens the room itself. Once it is MakeHybrid, the
address opens AdGrant.AI's rooms there, because MakeHybrid sends `/w/…` on a
brand's host to `/rooms.html` and the old conversation stays in this
repository's database. Add this to the Express server, after
`const app = express()` and before any route, static handler or SPA fallback:

```js
// AdGrant.AI's rooms are served from app.adgrant.ai.
const ADGRANT_APP = "https://app.adgrant.ai";
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const p = req.path;
  if (p === "/w" || p.startsWith("/w/")) {
    res.set("Referrer-Policy", "no-referrer"); // a room address is its only key
    return res.redirect(302, ADGRANT_APP + req.originalUrl);
  }
  if (p === "/services" || p.startsWith("/services/")) return res.redirect(302, `${ADGRANT_APP}/`);
  next();
});
```

- If the app already has a page of its own at `/services`, drop that line.
- If it has no `/terms` or `/privacy` of its own, redirect those to
  `${ADGRANT_APP}/terms.html` and `${ADGRANT_APP}/privacy.html` once
  app.adgrant.ai is MakeHybrid. Until then, use `/terms` and `/privacy`. A
  nonprofit's data protection officer must not land on a 404.

The same thing as a request, for Replit Agent:

> Add an Express middleware before every other route. For GET and HEAD
> requests whose path is `/w` or starts with `/w/`, set
> `Referrer-Policy: no-referrer` and answer a 302 redirect to
> `https://app.adgrant.ai` followed by the original path and query string,
> unchanged. For `/services` or a path starting with `/services/`, answer a 302
> redirect to `https://app.adgrant.ai/`. Do not change anything else.

**b. A way to the rooms and the agents.** Link "Ask the AdGrant.AI agent" to
`https://app.adgrant.ai/` until app.adgrant.ai is MakeHybrid, and to
`https://app.adgrant.ai/rooms.html` after. MakeHybrid's Ad Grants agent answers
there, citing Google's own policies. Once a Google Ads account is linked under
Top-Rated Team's manager account, it can also read that account and propose
changes.

**c. The thirteen corrected pages.** The library on the Replit app is the
batch these pages were imported from. It includes six statements that are
wrong against Google's current documentation
(`docs/specs/adgrant-and-dev-agents.md` section 1). The corrected text is on
disk here, one markdown file per page, `data/adgrant/<page>.md`, with what was
corrected in the `corrections` frontmatter. Put these bodies into the Replit
app's content admin before its domain goes live:

| page | corrections |
|---|---|
| `glossary/ad-rank-google-ad-grant` | 2 |
| `glossary/broad-match-keywords-google-ad-grant` | 1 |
| `glossary/click-through-rate-ctr-google-ad-grant` | 2 |
| `glossary/maximize-conversions-bidding-google-ad-grants` | 1 |
| `glossary/quality-score-google-ad-grant` | 1 |
| `case-studies/homeless-shelter-google-ad-grant-structure-emergency-housing-donations` | 1 |
| `case-studies/youth-mentoring-nonprofit-google-ad-grant-structure` | 1 |
| `tricks/add-verify-additional-domains-google-ad-grant` | 2 |
| `tricks/avoid-account-suspension-google-ad-grant-5-percent-ctr-rule` | 3 |
| `tricks/bypass-2-cpc-cap-smart-bidding-google-ad-grant` | 1 |
| `tricks/collect-remarketing-audiences-google-ad-grant` | 1 |
| `tricks/recover-suspended-google-ad-grant-account` | 2 |
| `tricks/stretch-full-10000-google-ad-grant-monthly-budget` | 1 |

**d. What other sites say is there.** MakeHybrid's AdGrant.AI agent tells
people that "prices and terms are published" on adgrant.ai, and makehybrid.com
quotes management of one Ad Grant account at $99 a month. Either the Replit
app publishes both, or MakeHybrid's copy changes in the same week.

### 6. The domain adgrant.ai

1. Replit → the deployment → Settings → link a custom domain:
   **`adgrant.ai`**, then **`www.adgrant.ai`**. Replit shows an A record and a
   TXT record for each.
2. At the DNS provider, replace the apex and www records with Replit's. Leave
   `app` alone.
3. When Replit says Verified and `https://adgrant.ai/` is the Replit app,
   remove adgrant.ai and www.adgrant.ai from the **top-rated-team** service's
   Custom Domains. Not before: until DNS points at Replit, removing them takes
   the site down.

### 7. Check

- `https://adgrant.ai/` is the Replit app, a library page opens on it, and
  `https://adgrant.ai/logo.png` is the mark.
- `https://adgrant.ai/w/anything` lands on `https://app.adgrant.ai/rooms.html`.
- `https://app.adgrant.ai/` is AdGrant.AI's white label, logo included.
- `https://app.adgrant.ai/terms.html` is titled "Terms — AdGrant.AI".
- `https://top-rated.team/adgrant/glossary` lands on the Replit app.
- `https://top-rated.team/adgrant/terms` lands on
  `https://app.adgrant.ai/terms.html`.
- On makehybrid.com, "Visit adgrant.ai" lands on the Replit app.
- Stripe shows no open subscription for contact@adgrant.ai.

### Rollback

Put back the records written down in step 1. For app.adgrant.ai, also move the
name back onto the top-rated-team service. This process still answers as both
names, because neither left `ADGRANT_HOSTS`.

---

## What does not change

- **White label, both ways.**
  - `adgrantCatalogue()` and a partner's fork of this repository with
    `base: "adgrant-ai"` are decided in code, not by hostname
    (`shared/catalogue.ts`). Such a fork prints AdGrant.AI's terms on
    app.adgrant.ai.
  - On MakeHybrid, any white-label brand may offer AdGrant.AI as a ready-made
    product (`partner`, `dfy` or `off`). AdGrant.AI's own brand offers itself
    as itself.
  - Top-Rated Team's doors still name AdGrant.AI as the tool and link the
    product at adgrant.ai.
- **Messages.** The two-way channels for AdGrant.AI's rooms are MakeHybrid's
  now, as Top-Rated Team's are. `PUBLIC_BASE_URL` here stays
  `https://top-rated.team`.

## What a visitor notices

- AdGrant.AI's rooms have MakeHybrid's sign-in. An account made there is a new
  one: a LinkedIn, WhatsApp or email sign-in from the old rooms does not carry
  over.
- An old AdGrant.AI room opens AdGrant.AI's rooms, not that conversation. The
  conversation stays in this repository's database.
- The LinkedIn redirect URL added on 23 October for
  `https://app.adgrant.ai/api/room-login/linkedin/callback` is no longer used.
  It can stay or go.
