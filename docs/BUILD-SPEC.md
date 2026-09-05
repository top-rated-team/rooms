# Build spec — ai.top-rated.team (ChatGPT Ads section)

Read this before writing any file. Everything below is already decided.

## What this is

A section of **top-rated.team** that lives at **ai.top-rated.team** (later possibly its
own domain). It lands paid traffic from our own ChatGPT Ads and converts it to one
specific manual service: **conversion tracking setup** — the piece of paid-ads work
that still needs a human and cannot be fully automated by APIs or agents.

Two jobs, in priority order:

1. **Primary.** Convert a visitor to (a) a message to a human expert, (b) a booked
   call, or (c) a question answered on the spot by an AI agent grounded in
   <https://developers.openai.com/ads/>.
2. **Secondary.** Upsell the rest of the catalogue — Google/Meta/LinkedIn Ads, SEO,
   content, websites and software built with AI dev tooling.

Long-term the workspace becomes a standalone collaborative product for freelancers,
experts, clients, teams, agencies and AI agents. Build the workspace so that future
is not blocked, but ship the landing + workspace now.

## Stack

React 18 + Vite + TypeScript + Tailwind + Radix (shadcn/ui, new-york) + wouter +
TanStack Query on the client. Express + `ws` + Drizzle (Postgres, optional) on the
server. Single process: Express serves the API, the WebSocket and — in dev — Vite as
middleware. Aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`.

## Contracts — read these files first, do not redefine anything in them

- `shared/schema.ts` — Drizzle tables, enums, `MessageMeta`, `Citation`, zod request schemas.
- `shared/api.ts` — `WorkspaceState`, `ServerEvent`, `ClientEvent`, `AskEvent`, `KbStatus`.
- `shared/roster.ts` — `AGENTS`, `EXPERTS`, `SERVICES`, `PROOF`, `BOOK_A_CALL_URL`, `MAIN_SITE_URL`.
- `shared/playbook.ts` — `SEED_CHANNELS`, `CONVERSION_TRACKING_TASKS`, `WELCOME_MESSAGE`.
- `client/src/index.css` — brand tokens copied verbatim from top-rated.team, plus the
  `hover-elevate` / `active-elevate-2` interaction system.
- `tailwind.config.ts` — mirrors the main site (note `border-card-border`,
  `border-primary-border`, `border-secondary-border` are real classes).

## Brand rules — non-negotiable

The header and footer must be **byte-for-byte equivalent** to top-rated.team's, down to
the nav order, the `data-testid` attributes, the icon set and the copy. They are
reproduced in `docs/REFERENCE-HEADER-FOOTER.md`. Only two liberties are allowed:

1. Nav links are absolute to `https://top-rated.team/...` (this is a different origin).
2. The logo is served locally from `/assets/top-rated-logo.png`.

Everything else — spacing, typography scale, `py-20 lg:py-28` sections, `bg-card
border-y border-card-border` bands, `bg-muted/30` alternation, `max-w-7xl mx-auto px-4
sm:px-6 lg:px-8` containers, `h-16` header, Inter — matches the main site.

Buttons use the main site's exact class recipes:

```
primary   inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none
          disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0
          hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2
secondary … hover-elevate active-elevate-2 bg-secondary text-secondary-foreground border border-secondary-border min-h-8 rounded-md px-3 text-xs
ghost     … hover-elevate active-elevate-2 border border-transparent min-h-8 rounded-md px-3 text-xs
icon      … hover-elevate active-elevate-2 border border-transparent h-9 w-9
```

## Voice

Same as the main site: plain, specific, no hype. "There is no magic: just expertise,
dedicated hours, and a systematic approach." Never claim the AI replaces the human —
the entire pitch is that one specific thing still needs hands. British/US-neutral
English. No emoji in product copy.

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/w/:token` | Workspace (no signup; the token is the credential) |
| `*` | 404 |

## API

| Method | Path | Body → Response |
|---|---|---|
| `POST` | `/api/workspaces` | `createWorkspaceSchema` → `CreateWorkspaceResponse` |
| `GET` | `/api/workspaces/:token` | → `WorkspaceState` (404 if unknown) |
| `POST` | `/api/workspaces/:token/messages` | `postMessageSchema` → `Message` (agent reply streams over WS) |
| `POST` | `/api/workspaces/:token/channels` | `createChannelSchema` → `Channel` |
| `POST` | `/api/workspaces/:token/tasks` | `createTaskSchema` → `Task` |
| `PATCH` | `/api/workspaces/:token/tasks/:id` | `updateTaskSchema` → `Task` |
| `POST` | `/api/workspaces/:token/invite` | `inviteMemberSchema` → `{ member, lead }` |
| `POST` | `/api/leads` | `insertLeadSchema` → `{ ok: true }` |
| `POST` | `/api/ask` | `askSchema` → **SSE** stream of `AskEvent` |
| `GET` | `/api/kb/status` | → `KbStatus` |
| `WS` | `/ws?token=…` | `ServerEvent` down, `ClientEvent` up |

Validation failures → 400 `{ error: string }`. Unknown token → 404. Never leak stack traces.

## Degradation — this must run with an empty `.env`

- **No `OPENAI_API_KEY`**: the whole site still works. Agents reply with a clear,
  non-fake message saying live answers are not configured, and the human CTAs stay
  prominent. `KbStatus.llmReady` is `false` and the UI shows it honestly. Never fake
  an AI answer.
- **No `DATABASE_URL`**: `server/storage.ts` falls back to an in-memory store with the
  identical interface. Log the fallback once at boot.
- **No knowledge base built yet**: retrieval returns `[]`, agents say what they lack.

## Security rules

- The workspace token is a bearer credential in a URL: never log it, never put it in
  an outbound webhook payload, mark workspace pages `noindex`.
- Agents must refuse credentials/API keys pasted into chat (already in their prompts).
- Escape/sanitise markdown rendering: no raw HTML in `react-markdown`.
- Rate-limit `/api/ask` and workspace creation per IP in memory (simple token bucket).

## Definition of done

`npm run check` passes, `npm run build` passes, `npm run dev` serves a landing page
that is visually indistinguishable from a top-rated.team page in chrome, and a
workspace where a visitor can chat, get an agent reply, add a task, invite an expert
and share the link.
