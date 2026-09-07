# Getting this onto the internet

Nothing about this repository has been deployed yet. This page establishes what is
actually true today, gives you two hosts to choose between, tells you exactly what to
change in Cloudflare, and lists what to check when it is live.

Everything below was checked on 6 September 2026. Where a price appears, it is the
price on that day — look it up again before you commit to it.

## 1. The facts, checked

**There is no deployment configuration in this repository.** `git ls-files` matches
nothing for Replit, Vercel, Netlify, Docker, Fly, Railway, Render, Heroku, App Engine
or GitHub Actions. There is no `Dockerfile`, no `Procfile`, no `.replit`, no
`.github/workflows`. Nothing here tells any platform how to run this. That is why
this page exists.

**It is one process.** `npm run build` produces `dist/public` (the client) and
`dist/index.js` (the server, bundled by esbuild). `npm start` runs that bundle, which
binds `0.0.0.0` on `PORT` (default 5000) and serves three things at once: the JSON API
under `/api`, a WebSocket at `/ws`, and the built client as static files with an SPA
fallback. There is no second service to deploy and no build step at runtime.

**Node 20.12 or newer.** `package.json` declares no `engines` field, but
`server/index.ts` calls `process.loadEnvFile()`, which exists from Node 20.12. Use the
current 22 LTS.

**The knowledge base is committed.** `data/kb/kb.json` (287 KB) is in git, so the agent
has something to cite the moment the process starts. `data/kb/kb.embeddings.json` is
gitignored: without it retrieval falls back to keyword scoring, which works but is
worse. Run `npm run kb:embed` on the host — at build time, with `OPENAI_API_KEY`
present — if you want semantic retrieval.

**`ai.top-rated.team` is pointed at nothing.**

```
$ curl -sI https://ai.top-rated.team/
HTTP/2 530
server: cloudflare
$ curl -s https://ai.top-rated.team/
error code: 1016
$ dig +short ai.top-rated.team
104.21.52.16
172.67.193.239
```

Those two addresses are Cloudflare's, and `top-rated.team`'s nameservers are
`darl.ns.cloudflare.com` and `rayne.ns.cloudflare.com`. Cloudflare error 1016 is
"origin DNS error": a proxied record for the subdomain exists, and the origin it names
does not resolve. So the subdomain is already set up and already orange-clouded — it is
aimed at a machine that is not there. You are replacing a record, not creating one.

**The main site is not on Cloudflare's proxy, and not somewhere this can join.**
`top-rated.team` answers 200 with `server: Google Frontend`, `x-powered-by: Express`
and a `GAESA` cookie, and no `cf-ray` header: it is an Express app on Google App Engine
with the Cloudflare record grey-clouded. Someone will suggest putting this process next
to it. Don't — see "Hosts that do not fit" below.

## 2. What a host has to give you

| Requirement | Why |
|---|---|
| One always-on process | Rooms and messages live in memory unless `DATABASE_URL` is set, and a WebSocket cannot survive a sleeping instance. |
| One instance, not several | Same reason. Two instances with in-memory storage means two visitors in what they think is the same room see different things. |
| WebSocket upgrade on `/ws` | The workspace is live-updated over it. Without it the room loads and then never changes. |
| No response buffering on `POST /api/ask` | It is Server-Sent Events. Buffered, the answer arrives in one lump at the end and the panel looks broken. |
| ~512 MB RAM, minimal CPU | Node, a 287 KB knowledge base, and outbound HTTPS to `api.openai.com`. |

Persistence is a separate decision. With no `DATABASE_URL` the site runs, honestly,
entirely in memory — every deploy and every restart deletes every workspace anyone was
given a link to. That is fine for the first week and indefensible after the first
client. A Neon free-tier Postgres and `npm run db:push` fixes it.

## 3. Option A — Render (recommended)

A Render Web Service is the shape this app already is: one container, one process, a
port, WebSockets on by default, deployed from a GitHub push.

1. Push the repository to GitHub (the `Being-Marketing` organisation already holds it).
2. render.com → **New** → **Web Service** → connect the repo.
3. Settings:
   - Runtime **Node**
   - Build command: `npm ci && npm run build`
     (append ` && npm run kb:embed` once `OPENAI_API_KEY` is set, to get semantic
     retrieval; the build has the environment variables.)
   - Start command: `npm start`
   - Health check path: `/api/kb/status`
4. Instance type: **Starter, $7/month**. Not Free — a free instance sleeps after 15
   minutes of no traffic, which drops every open WebSocket and makes the next visitor
   wait through a cold start. This app is a sales page; that is the one thing it must
   not do.
5. Environment variables (Render sets `PORT` itself — do **not** set it):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `OPENAI_API_KEY` | the key |
   | `ROOM_MONTHLY_BUDGET_USD` | `5` — dollars one room may spend on AI answers per month. Warned at 80%, stopped at 100%. Not optional: a value that is not a positive number falls back to 5 rather than removing the ceiling. |
   | `OPENAI_CHAT_MODEL` | `gpt-5-mini` |
   | `OPENAI_EMBED_MODEL` | `text-embedding-3-small` |
   | `DATABASE_URL` | the Neon connection string, or leave unset and accept in-memory |
   | `LEAD_WEBHOOK_URL` | where an inbound lead is POSTed; unset means stdout only |
   | `LEAD_NOTIFY_EMAIL` | `dan@being.marketing` |
   | `PUBLIC_BASE_URL` | `https://ai.top-rated.team` |

6. Render → **Settings** → **Custom Domains** → add `ai.top-rated.team`. It gives you a
   CNAME target of the form `<service>.onrender.com`. Take that to section 5.

**Cost:** $7/month for the instance, $0 for Neon's free tier, plus OpenAI usage.

**Trade-offs.** Deploys restart the process, so in-memory rooms die on every deploy —
another argument for `DATABASE_URL`. One region. Build minutes are metered on the free
plan and generous on Starter. You get logs and a shell in the dashboard, and rollback
to a previous deploy is one click.

## 4. Option B — a small VPS you own

€4/month, no platform between you and the process, and you patch the operating system
yourself. Hetzner CX22 (2 vCPU, 4 GB) was €3.79/month plus VAT; any provider works.

```bash
# on the server, Ubuntu 24.04, as a non-root user
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git caddy
git clone <repo> ~/app && cd ~/app
npm ci && npm run build
```

`~/app/.env` holds the same variables as the table above, plus `PORT=5000`.

`/etc/systemd/system/ai-top-rated.service`:

```ini
[Unit]
Description=ai.top-rated.team
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now ai-top-rated`.

`/etc/caddy/Caddyfile` — Caddy gets its own certificate and proxies WebSockets and SSE
correctly with no extra configuration, which is the reason to prefer it to nginx here:

```
ai.top-rated.team {
    reverse_proxy 127.0.0.1:5000 {
        flush_interval -1   # never buffer; /api/ask is a stream
    }
}
```

If you keep Cloudflare's proxy on (orange cloud), Caddy cannot answer the HTTP-01
challenge; install a Cloudflare Origin Certificate instead and use `tls` with those
files. Grey-clouding the record is simpler.

Deploying an update is four lines, worth putting in `~/deploy.sh`:

```bash
cd ~/app && git pull && npm ci && npm run build && sudo systemctl restart ai-top-rated
```

**Cost:** about €5/month all in. **Trade-offs:** you own security updates, you have no
rollback button, and the box is a pet. In exchange it is cheaper, it never sleeps,
nothing is metered, and you can read the logs with `journalctl -u ai-top-rated -f`.

### Hosts that do not fit

- **Google App Engine standard**, where the main site lives, does not support
  WebSockets. The landing page would work and the workspace would silently never
  update. The flexible environment does support them, at roughly the cost of a VM.
- **Cloud Run** does WebSockets, but it scales to zero and to many. With in-memory
  storage, two visitors can land on different instances and see different rooms; with
  a cold start, the first visitor waits. Pinning min and max instances to 1 and setting
  `DATABASE_URL` makes it work — at which point you are paying for an always-on
  container with extra steps.
- **Vercel and Netlify** run serverless functions with a request timeout. This is one
  long-lived process holding WebSocket connections. It is the wrong shape.

## 5. Cloudflare — exactly what to change

1. **DNS → the existing `ai` record.** It is the 1016. Edit it, do not add a second:
   - Option A: type **CNAME**, name `ai`, target `<service>.onrender.com`.
   - Option B: type **A**, name `ai`, target the server's IPv4 (and an **AAAA** for its
     IPv6 if it has one).
2. **Set the proxy status to DNS only (grey cloud) for the first deploy.** Render and
   Caddy both issue their certificate by answering a challenge on port 80, and the
   orange cloud intercepts it. Once `https://ai.top-rated.team` answers 200 on its own,
   you may turn the proxy back on.
3. **SSL/TLS → Overview → Full (strict)** before you turn the proxy on. "Flexible"
   sends plaintext to an origin that redirects to HTTPS, which is an infinite redirect.
4. **Network → WebSockets → On.** It is on by default on every plan; check it, because
   `/ws` is the entire workspace.
5. **No "Cache Everything" rule may match `/api/*`.** The answer stream must not be
   cached or transformed. The server already sends `Cache-Control: no-cache,
   no-transform` and `X-Accel-Buffering: no`.
6. Cloudflare closes an idle WebSocket at about 100 seconds. `server/ws.ts` pings every
   30, so this is already handled — do not remove that heartbeat.

**One thing to fix before you turn the orange cloud on.** `server/index.ts` sets
`app.set("trust proxy", 1)` — one hop. Behind Cloudflare *and* a platform load balancer
there are two, so Express reads the wrong end of `X-Forwarded-For` and every visitor
looks like the same IP address. The per-IP rate limits on workspace creation, leads and
`/api/ask` would then apply to everyone at once, and the first person to hit a limit
locks out the rest. Either leave the record grey-clouded (one hop, correct as written)
or change that 1 to a 2 at the same time as you turn the proxy on.

## 6. After the first deploy, check these

```bash
# 1. the page is served at all
curl -sI https://ai.top-rated.team/ | head -3

# 2. the agent is configured, and how it retrieves
curl -s https://ai.top-rated.team/api/kb/status
# want: {"ready":true,"mode":"embeddings",...,"llmReady":true}
# "mode":"keyword"  -> kb:embed did not run. Answers are worse, not broken.
# "llmReady":false  -> no API key. The panel will say so rather than fake it.
# "ready":false     -> data/kb/kb.json did not make it onto the host.

# 3. the answer streams instead of arriving in one lump
curl -N -X POST https://ai.top-rated.team/api/ask \
  -H 'content-type: application/json' \
  -d '{"question":"How do I install the ChatGPT Ads pixel?"}'

# 4. workspace tokens stay out of search
curl -s https://ai.top-rated.team/robots.txt | grep /w/
curl -sI https://ai.top-rated.team/w/test | grep -i x-robots-tag
```

5. **The WebSocket.** Open a workspace in a browser, DevTools → Network → WS. `/ws`
   must show `101 Switching Protocols` and stay open past a minute. If it connects and
   dies at 100 seconds, something in front of it is not forwarding the ping.
6. **Persistence.** Create a workspace, keep the URL, redeploy, reload it. If the room
   is gone, `DATABASE_URL` is not set — which is a decision, not a bug, but make it
   deliberately.
7. **The boot log.** The startup banner prints storage mode, LLM readiness and
   knowledge-base mode in three lines. Read it after every deploy; it is the fastest
   answer to "why is the agent saying it cannot do that".

## 7. Moving to a different address later

Three things are domain-aware and nothing else is:

1. `PUBLIC_BASE_URL` — the workspace links the server hands out.
2. The canonical, Open Graph and sitemap URLs in `client/index.html` and
   `client/public/sitemap.xml`.
3. `MAIN_SITE_URL` in `shared/roster.ts`, which should keep pointing at
   `top-rated.team`: eight years of proof on the parent domain is why this converts.

Add a 301 from the old subdomain and leave the header and footer links to
`top-rated.team` alone.
