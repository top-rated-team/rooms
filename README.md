# ai.top-rated.team — ChatGPT Ads conversion tracking

A section of [top-rated.team](https://top-rated.team) that lands traffic from our own
ChatGPT Ads campaigns and converts it to the one piece of paid-ads work that still
needs a human: **conversion tracking setup**.

Two surfaces:

- **`/`** — a deliberately minimal landing page. One primary action (get the tracking
  set up by a person), one secondary (book a call), and an AI agent in the hero that
  answers ChatGPT Ads questions on the spot, grounded in
  [developers.openai.com/ads](https://developers.openai.com/ads/) and citing the page
  it used.
- **`/w/:token`** — a no-signup collaborative workspace. Slack's rails, ChatGPT's
  message column, ClickUp's task panel. A visitor chats with subject-matter AI agents
  and real experts in the same channels, and the URL is the entire credential.

The workspace is the seed of a standalone product: a shared space for freelancers,
experts, clients, teams, agencies and AI agents. The landing page is what pays for it.

## Stack

React 18 · Vite · TypeScript · Tailwind · Radix / shadcn-ui · wouter · TanStack Query
· Express · `ws` · Drizzle (Postgres, optional) · OpenAI SDK.

One process serves the API, the WebSocket, and the client (Vite middleware in dev,
static in prod).

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

## Layout

```
client/src/components/site/       landing page sections + the exact top-rated.team chrome
client/src/components/workspace/  the Slack/ChatGPT/ClickUp workspace
client/src/components/ui/         shadcn primitives, retuned to the main site's button recipes
server/                           express, routes, websocket, storage, notifications
server/ai/                        OpenAI client, retrieval, streaming agent runtime
shared/                           schema, API contract, agent & expert roster, seed playbook
scripts/build-kb.ts               fetch → chunk → embed the ChatGPT Ads docs
docs/                             build spec, brand reference, docs brief, SDK notes
```

## Brand

`client/src/index.css` carries top-rated.team's design tokens copied verbatim, light
and dark, along with its `hover-elevate` interaction system. The header and footer are
reproductions of the production markup — see `docs/REFERENCE-HEADER-FOOTER.md`. If the
main site retunes its palette or nav, re-copy rather than approximating: the whole
point is that this reads as one site.

## Security notes

- A workspace token is a bearer credential living in a URL. It is never logged, never
  sent in an outbound webhook, and `/w/` is disallowed in `robots.txt` and `noindex`.
- Agents refuse credentials pasted into chat and say so.
- Rate limits are applied per IP to workspace creation, lead capture and `/api/ask`.
