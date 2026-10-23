# adgrant.ai goes back to its own application

Written 23 October 2026. adgrant.ai returns to the application it started as —
the Replit app with its own content API, generator, LinkedIn login, admin and
affiliate programme. What that application does not have stays in this
process and moves to **app.adgrant.ai**: the rooms, the Ad Grants agent and the
door chat, the three ways in, and the terms and privacy that describe them.

Nothing is deleted. adgrant.ai stays in `ADGRANT_HOSTS` and `HOUSE_HOSTS`, so
pointing the apex back at Render undoes the whole move with a DNS change.

| | before | after |
|---|---|---|
| `adgrant.ai`, `www.adgrant.ai` | this process (Render) | the Replit app |
| `app.adgrant.ai` | — | this process (Render), answering as AdGrant.AI |
| rooms, agents, LinkedIn / WhatsApp / email sign-in | adgrant.ai | app.adgrant.ai |
| AdGrant terms printed in a room, and in a partner's fork of this house | `https://adgrant.ai/terms` | `https://app.adgrant.ai/terms` |
| `top-rated.team/adgrant/<library>` | 301 → adgrant.ai | 301 → adgrant.ai (unchanged) |
| `top-rated.team/adgrant/services…`, `/terms`, `/privacy` | 301 → adgrant.ai | 301 → app.adgrant.ai |
| robots on the AdGrant host this process serves | the library sitemap | app.adgrant.ai: `Disallow: /`, no sitemap |
| `/api/adgrant/stats` and `npm run adgrant:build` | read adgrant.ai, which was this process | read the Replit app again |

---

## The order, and why it is this order

The pull request that carries this file links the terms and the old service
pages to app.adgrant.ai. **Merge it only once app.adgrant.ai answers**,
otherwise those links point at nothing. Everything else in it is inert until a
request arrives on that name.

### 1. A day before

- Open the Replit app on its own `*.replit.app` address and check it still
  deploys and answers. Its code is not on GitHub, so nothing here can check it.
- Write down the DNS records adgrant.ai and www.adgrant.ai have now. They are
  the rollback.
- Lower the TTL on both to 300 seconds.

### 2. app.adgrant.ai on Render

1. Render → service `srv-daeq2bv40ujc7389ao4g` → Settings → Custom Domains →
   add **`app.adgrant.ai`**.
2. At the registrar: a **CNAME** for `app` pointing at the service's
   `*.onrender.com` hostname. On Cloudflare, DNS only (grey cloud) until Render
   says Verified.
3. Wait for Verified and the certificate.

### 3. Merge the pull request

Render deploys `main`. Then, on `https://app.adgrant.ai`:

- `/` is the AdGrant.AI home, with the Ad Grants agent and the generator.
- `/robots.txt` says `Disallow: /`.
- `/terms` says "These terms cover app.adgrant.ai" and the line about the
  public site being a separate application.

### 4. LinkedIn

In the LinkedIn app the rooms already use, add
`https://app.adgrant.ai/api/room-login/linkedin/callback` to **Authorized
redirect URLs**. Leave the adgrant.ai one in place until the rollback window
has passed.

### 5. The Replit app

Four changes, before its domain is attached.

**a. Keep every room address working.** A room opened on adgrant.ai since
September has the address `https://adgrant.ai/w/<token>`, and that address is
the only key to the room. Add this to the Express server, after
`const app = express()` and before any route, static handler or SPA fallback:

```js
// AdGrant.AI's rooms, agents and sign-in are served from app.adgrant.ai.
// A room address is the only key to the room, so every one handed out on
// adgrant.ai has to keep opening it.
const ADGRANT_APP = "https://app.adgrant.ai";
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const p = req.path;
  const moved =
    p === "/w" || p.startsWith("/w/") ||
    p === "/services" || p.startsWith("/services/");
  if (!moved) return next();
  res.set("Referrer-Policy", "no-referrer");
  res.redirect(301, ADGRANT_APP + req.originalUrl);
});
```

If the app already has a page of its own at `/services`, drop those two
conditions. If it has no `/terms` or `/privacy` of its own, add
`p === "/terms" || p === "/privacy"` to `moved` — a nonprofit's data
protection officer must not land on a 404.

If you change the app through Replit Agent rather than by hand, the same thing
as a request:

> Add an Express middleware before every other route: for GET and HEAD
> requests whose path is `/w`, starts with `/w/`, is `/services` or starts with
> `/services/`, set `Referrer-Policy: no-referrer` and answer a 301 redirect to
> `https://app.adgrant.ai` followed by the original path and query string,
> unchanged. Do not change anything else.

**b. A way to the agent.** Link "Ask the AdGrant.AI agent" to
`https://app.adgrant.ai/`. That page is the Ad Grants agent (cites Google's own
Ad Grants policies) and the generator, and keeping a conversation opens a room.
A server that would rather ask than link can use the public connector on
`https://ai.top-rated.team/api/connector` — `ask_question` with
`agentId: "ad-grants"`, `create_room` with `doorId: "ad-grants"`; see
`docs/connector.md`. No key; the spend and rate limits bound it.

**c. The thirteen corrected pages.** The library on the Replit app is the
batch these pages were imported from, including six statements that are wrong
against Google's current documentation (`docs/specs/adgrant-and-dev-agents.md`
section 1). The corrected text is on disk here, one markdown file per page,
with what was corrected in the `corrections` frontmatter. Put these bodies into
the Replit app's content admin before its domain goes live:

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

Each is `data/adgrant/<page>.md`.

**d. What other sites say is there.** MakeHybrid's AdGrant.AI agent tells
people that "prices and terms are published" on adgrant.ai, and its home page
quotes management of one Ad Grant account at $99 a month. Either the Replit
app publishes both, or MakeHybrid's copy changes in the same week.

### 6. The domain

1. Replit → the deployment → Settings → link a custom domain:
   **`adgrant.ai`**, then **`www.adgrant.ai`**. Replit shows the records for
   each (an A record and a TXT record).
2. At the registrar, replace the apex and www records with Replit's. Leave
   `app` alone.
3. When Replit says Verified and `https://adgrant.ai/` is the Replit app,
   remove adgrant.ai and www.adgrant.ai from Render's Custom Domains.

### 7. Check

- `https://adgrant.ai/` is the Replit app, and a library page opens on it.
- An old `https://adgrant.ai/w/<token>` opens that room on app.adgrant.ai.
- `https://top-rated.team/adgrant/glossary` lands on the Replit app;
  `https://top-rated.team/adgrant/terms` lands on app.adgrant.ai.
- Sign in with LinkedIn on app.adgrant.ai returns to app.adgrant.ai.
- Ask the Ad Grants agent on `https://app.adgrant.ai/` a question and get an
  answer that cites a Google page.
- On makehybrid.com, "Visit adgrant.ai" lands on the Replit app.
- `https://app.adgrant.ai/api/adgrant/stats` answers `"live": true` — it reads
  the Replit app's `/api/templates/stats` again instead of the shipped snapshot.

### Rollback

Put back the apex and www records written down in step 1, and add both names
back to Render's Custom Domains. This process still answers as adgrant.ai,
because that name never left `ADGRANT_HOSTS`. app.adgrant.ai keeps working
throughout; nothing needs reverting in this repository.

---

## What does not change

- **White label, both ways.** `adgrantCatalogue()` and a partner's fork with
  `base: "adgrant-ai"` are decided in code, not by hostname
  (`shared/catalogue.ts`). A fork of this house prints app.adgrant.ai's terms,
  which are the terms of what happens in its rooms. Top-Rated Team's doors
  still name AdGrant.AI as the tool and link the product at adgrant.ai.
- **MakeHybrid.** It links to `https://adgrant.ai` and offers AdGrant.AI to
  white-label brands as a ready-made product (`partner`, `dfy` or `off`). It
  makes no request to either domain, so it needs no change.
- **Messages.** WhatsApp, ChatWoot, Slack and ClickUp post to the bridge on a
  top-rated.team address (ai.top-rated.team), never on an AdGrant host. `PUBLIC_BASE_URL` stays
  `https://top-rated.team`, and webhooks, magic links and booking emails are
  built from it.

## What a visitor notices

- A browser remembers its rooms per address. Rooms opened on adgrant.ai are not
  in the room menu on app.adgrant.ai until the visitor opens one of their old
  links (which redirects) or signs in, which lists the rooms bound to them.
- A signed-in session on adgrant.ai does not carry over. Signing in once on
  app.adgrant.ai does.
