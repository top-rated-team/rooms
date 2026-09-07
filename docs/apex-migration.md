# Moving the new site onto top-rated.team

## Why this is even a question

The naming decision was: this **is** Top-Rated Team, not a separate product. The
owner's follow-up is the correct consequence, and it is one I should have stated
myself — if it is the same firm, `ai.` has no meaning. A subdomain promises a
separate thing. So the new site belongs on the apex, and `ai.top-rated.team`
becomes a redirect to it.

`ai.` was never a decision. It was a free address to deploy to while the thing
was being built, and it stopped being temporary without anyone choosing that.

## The rule that governs the whole move

**Do not point the apex at the new app until every existing URL below has an
answer.** The moment `top-rated.team` serves this application, any address it
has no route for returns the 404 page. Those addresses are the nine years: they
are what the record on the first screen is standing on. Losing `/services` and
five blog posts to save a template is the worst trade available here.

## Everything that answers on top-rated.team today

Nine in the sitemap, plus five blog posts that are not in it. Fourteen.

| Address | What it is | Where it goes | Settled? |
|---|---|---|---|
| `/` | the old home | the new home — the index of the doors | yes |
| `/services` | what is sold | `/use-case`, which is the same job | yes |
| `/leads` | "FREE leads" | removed by the owner's decision — 301 to `/` | yes |
| `/contact` | contact page | the footer's contact, or a thin page | yes |
| `/case-studies` | results | needs a home: a page, or the section on `/` | **no** |
| `/team` | the roster | the room's people, or a page | **no** |
| `/white-label` | a real service, agencies reselling | **there is no door for it.** Probably the eighth door | **no** |
| `/roi-calculator` | a tool | like AdGrant.AI: a tool on a door, or keep the page | **no** |
| `/blog` | index | keep | recommended |
| `/blog/selfdeclared-intent-turn-linkedin-lead-forms-into-google-ads-best-training-data` | post | keep at the same URL | recommended |
| `/blog/six-months-ago-manual-bid-adjustments-every-tuesday-morning` | post | keep at the same URL | recommended |
| `/blog/the-outcome-bridge-one-value-system-for-google-ads-and-linkedin-so-automation-st` | post | keep at the same URL | recommended |
| `/blog/when-ads-go-sideways-a-paid-media-incident-response-playbook-for-google-linkedin` | post | keep at the same URL | recommended |
| `/blog/stop-buying-leads-your-sales-team-cant-catch-sladriven-budget-brakes-for-google-` | post | keep at the same URL | recommended |

Plus this application's own addresses, which are young but already in a sitemap
crawlers have fetched: `/use-case` and the six door pages, and `/w` — all of
which move from `ai.top-rated.team` to the apex and need 301s from the
subdomain, exactly as `/work` got them when it became `/use-case`.

## Four decisions, and why each one is the owner's

1. **`/white-label`.** This is a service being sold that has no door. If it is
   still sold, it is the eighth door and the page becomes that door. If it is
   not, the page 301s and the offer goes. Nobody but the owner knows which.
2. **`/roi-calculator`.** A working tool, like AdGrant.AI. Same pattern
   available: a `tool` on the door it belongs to.
3. **`/case-studies` and `/team`.** Both exist as sections of the new home
   already, in shorter form. Either the URLs 301 to those sections, or they stay
   as pages because they earn their own address in search.
4. **The blog.** Recommended: keep all six URLs unchanged. Five posts about
   Google Ads and LinkedIn automation are both the standing search traffic and
   exactly the corpus material the doors' agents are short of.

## One thing that is already inconsistent

top-rated.team's own copy says "8+ years of Google Ads expertise". This site now
says 15+, on the owner's instruction. Whichever is right, they cannot both be
published — and `shared/roster.ts` still tells every agent "an 8+ year old
paid-ads team", so today the site and the agents disagree with each other too.

## Order of work

1. Answer the four decisions above.
2. Build the missing pages and doors on this application, still at
   `ai.top-rated.team`, and confirm all fourteen addresses resolve there.
3. Only then move the apex, with 301s from `ai.` in the same change.
4. Keep `adgrant.ai` exactly as it is: canonical, its own 74 URLs, restyled in
   its own repository (`top-rated/adgrant.ai`). The same door also answers at
   `/use-case/ad-grants` with a canonical link pointing at adgrant.ai, so the
   two never compete.
