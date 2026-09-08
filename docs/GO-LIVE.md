# Going live — twenty minutes, no terminal

Do these in order. Nothing here needs a command line.

## 1. Render (about ten minutes)

1. Sign in at **render.com** with GitHub.
2. **New** → **Blueprint** → choose `Being-Marketing/Top-Rated.Team` (named `chatgpt-ads-team` until the rename in docs/repo-move.md).
   Render reads `render.yaml` and shows one service, `top-rated-team`.
3. It asks for the values it refuses to read from a file. Only the first one
   matters today:
   - `OPENAI_API_KEY` — paste your key. Without it the panel cannot answer.
   - `DATABASE_URL` — see the database note below. Leave empty to look at it.
   - `LEAD_WEBHOOK_URL`, `RESEND_API_KEY`, `LEAD_EMAIL_FROM` — all optional.
     Leave them empty for now; requests still arrive and are stored.

   **Before you close the dashboard, copy `LEAD_INBOX_KEY`.** Render generates it
   and it is the password for `/leads`, the page that lists every request for a
   person that has come in. It is the only way to read that page.
4. **Apply**. The first build takes five to eight minutes, because it downloads
   the ChatGPT Ads knowledge base and builds the client.
5. When it goes green, open the address Render gives you
   (`top-rated-team-xxxx.onrender.com`) and check three things: the landing page
   loads, the panel answers a question, and pressing **Keep this** opens a room
   whose messages appear as you type.

> **The database note, and it is not Render's database.** With `DATABASE_URL`
> empty, rooms live in the process's memory and disappear on every deploy —
> taking every room address you have already given someone. That is fine for the
> first look and not fine once a client is in a room.
>
> Use **Neon's free tier**, not Render's Postgres. Two reasons. The code speaks
> Neon specifically: `server/db.ts` imports `drizzle-orm/neon-serverless` and
> hands it the `ws` module, which is Neon's own driver, so another Postgres is
> not a drop-in swap. And Render's free database deletes itself thirty days after
> it is created.
>
> neon.tech → new project → copy the connection string → paste it into
> `DATABASE_URL` on the Render service. The schema is created on the next deploy.

## 2. The domain (about five minutes)

1. In Render: **Settings** → **Custom Domains** → add `ai.top-rated.team`.
   Render shows you a target that looks like `top-rated-team-xxxx.onrender.com`.
2. In Cloudflare: **DNS** → **Add record**:
   - Type **CNAME**, Name `ai`, Target the address Render gave you.
   - **Proxy status: DNS only** — click the orange cloud until it turns grey.
3. Wait a minute, then reload the Render page. It says Verified and issues a
   certificate on its own.

> **Why the cloud must be grey.** With Cloudflare proxying, its certificate sits
> in front of Render's and the WebSocket has two hops that both have to be
> configured for it. Grey means Cloudflare answers the DNS question and then gets
> out of the way. You keep Cloudflare for everything else on the domain.

## 3. What to check when it is live

- The landing page, on a phone.
- Ask the panel something and watch the answer stream with its citations.
- Write a third message and confirm the "keep it or stay anonymous" row appears.
- Press **Keep this**, copy the address, and open it in a different browser —
  the room must be there with the conversation in it.
- Open `/services` and confirm seven doors, one live and six saying "Not open yet".

## If something is wrong

| What you see | What it is |
|---|---|
| Landing page fine, room never updates | The WebSocket is blocked. Almost always the orange cloud in Cloudflare. |
| Panel says it cannot answer | `OPENAI_API_KEY` is missing or wrong. |
| Rooms vanish after a deploy | Expected without `DATABASE_URL`. See the warning above. |
| Build ends with `vite: not found` | `npm ci` ran without devDependencies, which is where vite and esbuild live. Fixed in render.yaml (`--include=dev`, and NODE_ENV no longer set as a service variable). If you hit it on an older service, **Manual Deploy → Clear build cache & deploy**. |
| Blueprint never asked for the API key | It sometimes creates the service with the blanks empty instead of prompting. **Environment → Add Environment Variable → `OPENAI_API_KEY`**, then **Manual Deploy**. The build log says `OPENAI_API_KEY is not set` when this has happened — the site still works, the panel just answers from keyword search instead of semantic search. |
| First visitor waits thirty seconds | The free compute plan went to sleep. Move it to the $7 one. Note that messages on an already-open room do **not** count as traffic that keeps it awake. |
| `/leads` will not open | `LEAD_INBOX_KEY` was not copied out of the dashboard. Render → Environment shows it. |
| A request arrives but no email | Expected until `RESEND_API_KEY` and `LEAD_EMAIL_FROM` are set. The request is stored either way — read it at `/leads`. |
