# Going live — twenty minutes, no terminal

Do these in order. Nothing here needs a command line.

## 1. Render (about ten minutes)

1. Sign in at **render.com** with GitHub.
2. **New** → **Blueprint** → choose `Being-Marketing/chatgpt-ads-team`.
   Render reads `render.yaml` and shows one service, `top-rated-team`.
3. It asks for three values it refuses to read from a file:
   - `OPENAI_API_KEY` — paste your key. Without it the panel cannot answer.
   - `LEAD_WEBHOOK_URL` — optional. Leave empty for now.
   - `DATABASE_URL` — optional, and see the warning below.
4. **Apply**. The first build takes five to eight minutes, because it downloads
   the ChatGPT Ads knowledge base and builds the client.
5. When it goes green, open the address Render gives you
   (`top-rated-team-xxxx.onrender.com`) and check three things: the landing page
   loads, the panel answers a question, and pressing **Keep this** opens a room
   whose messages appear as you type.

> **The database warning.** With `DATABASE_URL` empty, rooms live in the
> process's memory and disappear on every deploy and every restart. That is fine
> for looking at it today. It is not fine the moment a real client is in a room.
> Render's own Postgres is a few clicks: **New → Postgres**, then copy its
> *Internal Database URL* into `DATABASE_URL` on the web service, and the schema
> is created on the next deploy.

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
- Open `/work` and confirm seven doors, one live and six saying "Not open yet".

## If something is wrong

| What you see | What it is |
|---|---|
| Landing page fine, room never updates | The WebSocket is blocked. Almost always the orange cloud in Cloudflare. |
| Panel says it cannot answer | `OPENAI_API_KEY` is missing or wrong. |
| Rooms vanish after a deploy | Expected without `DATABASE_URL`. See the warning above. |
| First visitor waits thirty seconds | The free plan went to sleep. Move to Starter. |
