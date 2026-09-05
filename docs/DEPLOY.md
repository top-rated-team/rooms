# Deploying to ai.top-rated.team

The app is one Node process. It serves the API, the WebSocket and the built client.

## Build and run

```bash
npm ci
npm run kb:fetch        # and npm run kb:embed if OPENAI_API_KEY is set
npm run build
NODE_ENV=production PORT=5000 npm start
```

`npm run build` produces `dist/public` (client) and `dist/index.js` (server bundle).
`data/kb/kb.json` must be present on the host — either commit it, or run `kb:fetch` as
part of the deploy. Without it the agent has nothing to cite.

## DNS — the subdomain

`ai.top-rated.team` → a CNAME (or A record) at whatever hosts this process. Nothing
on the main top-rated.team deployment needs to change: the header and footer here link
back to it with absolute URLs, and it links here with a normal link.

Set `PUBLIC_BASE_URL=https://ai.top-rated.team` so the workspace links the server hands
out are absolute and correct.

## WebSocket

The workspace needs `/ws` to upgrade. Any proxy in front of this must forward the
`Upgrade` and `Connection` headers and not buffer. On nginx:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

`/api/ask` is Server-Sent Events. The server already sets `X-Accel-Buffering: no`;
if you use a different proxy, make sure response buffering is off for that path or the
answer will arrive in one lump at the end instead of streaming.

## Moving to a standalone domain later

Three things are domain-aware, and nothing else:

1. `PUBLIC_BASE_URL` (workspace links).
2. The canonical, Open Graph and sitemap URLs in `client/index.html` and
   `client/public/sitemap.xml`.
3. `MAIN_SITE_URL` in `shared/roster.ts` — keep pointing at top-rated.team; the
   credibility of the parent site is the reason this section converts.

Add a 301 from `ai.top-rated.team` to the new domain and keep the header/footer links
to top-rated.team intact.

## Environment

See `.env.example`. Everything is optional; the site degrades honestly rather than
breaking. In production you want at minimum `OPENAI_API_KEY`, `DATABASE_URL` and
`LEAD_WEBHOOK_URL` — without the last one, leads are only written to stdout.

## Health

The startup banner reports storage mode, LLM readiness and knowledge-base mode. Check
`GET /api/kb/status` after any deploy: `{ llmReady: true, mode: "embeddings" }` is the
fully-configured state.
