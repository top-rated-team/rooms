# One workspace, seven doors

Seven offers aimed at seven kinds of traffic, and one room behind all of them. A
visitor arrives on the door that matches their problem and asks a question in a panel:
the answer streams, it cites what it used, it costs nothing, and nothing is saved. When
the conversation turns out to be worth keeping — they ask for a person, they paste
something of their own, they press Keep, or they write a third message — the page asks
once, and the conversation becomes a room with an address of its own.

The doors are ChatGPT Ads conversion tracking, Google Ads, Google Ad Grants, LinkedIn
Ads, LinkedIn automation with a written legal assessment, LinkedIn growth (delivered by
a separate partner company, under its own name and its own invoice), and custom AI
builds. They are rows in `shared/doors.ts` against one template — what each field does,
and what happens when the legal name on one of them is wrong, is in `private/doors.md`.

Three surfaces:

- **`/`** — the ChatGPT Ads door, and the one that has run longest. Two buttons and no
  third, and an AI agent in the hero, at the same weight as the headline, answering
  ChatGPT Ads questions grounded in
  [developers.openai.com/ads](https://developers.openai.com/ads/) and citing the page
  it used.
- **`/work`** — the seven doors on one page, each one a row of data rather than a page
  of its own, each carrying the name of the company that will send the invoice.
- **`/rooms`** — where rooms are. This site no longer runs rooms of its own: they are
  MakeHybrid's Hybrid Rooms, white-labelled as Top-Rated Team's and run from the
  operator's MakeHybrid account, with their own design, their own sign-in and the
  two-way WhatsApp, ChatWoot, Slack and ClickUp connections that used to live here.
  On Top-Rated Team's hosts `/rooms` and every old room address (`/w/:token`)
  redirect to `HYBRID_ROOMS_URL`; see `shared/rooms-moved.ts`.

Booking (`server/booking/`, the popup, `/admin/booking-widget`) is this site's and
stays here. So do AdGrant.AI's rooms: on AdGrant.AI's hosts (app.adgrant.ai) the room
page, its sign-in and its connections answer exactly as before, and an old
top-rated.team address of one of its rooms goes to it there.

## Stack

React 18 · Vite · TypeScript · Tailwind · Radix / shadcn-ui · wouter · TanStack Query
· Express · `ws` · Drizzle (Postgres, optional) · OpenAI SDK.

One process serves the API, the WebSocket (AdGrant.AI's rooms), and the client (Vite
middleware in dev, static in prod).

## Running it

```bash
npm install
cp .env.example .env      # everything in it is optional — see "Degradation"
npm run kb:fetch          # builds the ChatGPT Ads knowledge base (no API key needed)
npm run dev               # http://localhost:5000
```

With an `OPENAI_API_KEY` in `.env`, also run `npm run kb:embed` once to switch
retrieval from keyword scoring to semantic search.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (Express + Vite middleware) on `:5000` |
| `npm run build` | Client to `dist/public`, server bundled to `dist/` |
| `npm start` | Production server |
| `npm run check` | TypeScript, no emit |
| `npm run kb:fetch` | Download and chunk the ChatGPT Ads docs → `data/kb/kb.json` |
| `npm run kb:embed` | Embed those chunks → `data/kb/kb.embeddings.json` (needs a key) |
| `npm run db:push` | Push the Drizzle schema (needs `DATABASE_URL`) |

## Degradation

The site is built to run with an empty `.env`, because a half-configured deployment
that lies is worse than one that admits what it cannot do.

| Missing | Effect |
|---|---|
| `OPENAI_API_KEY` | Agents say live answers are not configured. The human CTAs stay fully functional. Nothing is faked. |
| `DATABASE_URL` | In-memory storage with the same interface. Workspaces vanish on restart. |
| `data/kb/kb.json` | Retrieval returns nothing and the agent says what it is missing. |
| `data/kb/kb.embeddings.json` | Retrieval falls back to BM25-style keyword scoring. |
| `LEAD_WEBHOOK_URL` | Leads are printed to stdout in a readable block instead of being POSTed. |
| `WAHA_BASE_URL` | WhatsApp paths report unavailable in one sentence. LinkedIn stays the way in. See `docs/specs/whatsapp.md`. |

## Layout

```
client/src/components/site/       door sections + the exact top-rated.team chrome
client/src/components/workspace/  the room (AdGrant.AI's hosts only)
shared/rooms-moved.ts             where Top-Rated Team's rooms are now (MakeHybrid, white-labelled)
client/src/components/ui/         shadcn primitives, retuned to the main site's button recipes
server/                           express, routes, websocket, storage, notifications
server/ai/                        OpenAI client, retrieval, streaming agent runtime
shared/                           the doors table, schema, API contract, agent & expert roster, seed playbook
scripts/build-kb.ts               fetch → chunk → embed the ChatGPT Ads docs
docs/                             doors, deployment, build spec, brand reference, docs brief, SDK notes
```

## Brand

`client/src/index.css` carries this site's own tokens, light and dark: warm paper,
one clay accent, three type sizes and one spacing scale. They used to be a verbatim
copy of top-rated.team's palette and are not any more — **re-copying that palette
would put the blue back**, which is the one thing this design does not have.

The logo is the exception and the only blue left on the page, kept deliberately.

`docs/REFERENCE-HEADER-FOOTER.md` documents the ten-link header and the seventeen-link
footer this round replaced. It is kept as a record of what was there, not as markup to
copy: following it would restore everything that was removed, including "FREE leads".

## Security notes

- A workspace token is a bearer credential living in a URL. It is never logged, never
  sent in an outbound webhook, and `/w/` is disallowed in `robots.txt` and `noindex`. On
  Top-Rated Team's hosts an old room address redirects without its token, unless the
  room is AdGrant.AI's, which it opens on app.adgrant.ai.
- Agents refuse credentials pasted into chat and say so.
- Rate limits are applied per IP to workspace creation, lead capture and `/api/ask`.
