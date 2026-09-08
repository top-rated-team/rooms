# Installing the Top-Rated Team connector

This process serves one public surface at `/api/connector`. A custom GPT reads
it as an OpenAPI document. Claude reads it as an MCP server. Both call the same
handlers, so the two cannot drift.

On the deployment this repository is configured for, the host is
`https://ai.top-rated.team`. If this process is answering on another host, use
that host in every URL below.

What it can do:

- list the published services (from `shared/doors.ts`)
- list the published price rows (from `shared/pricing.ts`, as written)
- list the published case studies (from `shared/cases.ts`)
- ask a question that goes through the same path as `/api/ask`, including the
  spend ceiling in `server/spend.ts`
- open a room the same way the site does, and return only the address

What it cannot do: read a room, a lead, a member, or anything under `/w/`
except by handing the invited person the one address that was just created.
That address is the credential. Anyone who has it can enter.

Live answers need an `OPENAI_API_KEY` on the deployment. Without one, the ask
tool says live answers are not configured, and does not guess. That is the
same behaviour as the panel on the site.

Questions are bounded per address and across the panel, the way `/api/ask` is.
Opening a room is limited to ten per hour per address, with the same wording
the site uses when that limit is hit.

Authentication: none. The surface is public on purpose, and the spend and
rate limits are what bound it.

---

## Custom GPT (ChatGPT)

1. Open [ChatGPT](https://chatgpt.com) and sign in.
2. Go to **GPTs** → **Create**.
3. On the **Configure** tab, set the name to **Top-Rated Team** and paste the
   instructions at the end of this section into **Instructions**.
4. Under **Actions**, choose **Create new action**.
5. **Authentication**: None.
6. **Schema**: **Import from URL** and use:

   `https://ai.top-rated.team/api/connector/openapi.json`

   The same document is on this process at `/api/connector/openapi.json`. A
   copy of the discovery file lives at `/.well-known/ai-plugin.json` and
   points at that document.
7. Confirm the editor lists five actions: `list_services`, `list_prices`,
   `list_cases`, `ask_question`, `create_room`. If it lists none, the URL did
   not fetch; check the host.
8. **Save** (or **Update**). In **Preview**, ask “What services do you offer?”
   and confirm it calls `list_services` rather than inventing a list.

Instructions to paste:

```
You speak for Top-Rated Team. You explain the company, its services and its
published prices, and you can invite someone into a room.

How you know things:
- Call list_services before you describe an offer. Quote headline, blurb,
  status, agentLine and the contract fields as returned. If status is
  "coming", read comingLine and do not describe that panel as open.
- Call list_prices before you state a price. Repeat the row's price, buys and
  condition verbatim. Do not turn a figure into a range. Do not add a figure
  that is not in the list. If a service's priceTier is "partner", there is no
  row; say that the other company sets that price.
- Call list_cases when asked for proof. Repeat the metrics as returned. Do
  not invent a case for a service that has none.
- Call ask_question only when the service has a firstAgentId. Pass that id.
  If firstAgentId is null, no agent of ours answers there — say so, and offer
  a room or a call.
- Call create_room to invite someone. Pass doorId from list_services. Give
  the returned url to that person and to nobody else. Do not paste it into a
  public place. There is no way to look a room up later on this connector.

If ask_question says live answers are not configured, say that, and do not
guess. If it says the monthly cap is reached, say that, and offer a room or a
call. Body copy says Top-Rated Team. The legal name belongs on the contract
fields the tools return, not in every sentence.
```

---

## Claude

The MCP endpoint is:

`https://ai.top-rated.team/api/connector/mcp`

Discovery: `/.well-known/mcp.json` on the same host. Transport: Streamable
HTTP. No authentication.

### Claude.ai

1. Open [Claude](https://claude.ai) and sign in.
2. Go to **Settings** → **Connectors**.
3. Add a custom connector.
4. Name it **Top-Rated Team**.
5. Set the URL to `https://ai.top-rated.team/api/connector/mcp`.
6. Leave authentication empty.
7. Save, then start a chat and enable the connector. Ask “What services does
   Top-Rated Team offer?” and confirm it calls `list_services`.

### Claude Desktop

Edit the Claude Desktop config (`claude_desktop_config.json` on macOS under
`Application Support/Claude`) and add:

```json
{
  "mcpServers": {
    "top-rated-team": {
      "type": "http",
      "url": "https://ai.top-rated.team/api/connector/mcp"
    }
  }
}
```

Restart Claude Desktop. The tools `list_services`, `list_prices`,
`list_cases`, `ask_question` and `create_room` should appear.

### Claude Code

```bash
claude mcp add --transport http top-rated-team https://ai.top-rated.team/api/connector/mcp
```

`type` is `http`. The MCP spec name for that transport is `streamable-http`;
Claude Code accepts both.

---

## Checking it without a GPT

```bash
curl -sS https://ai.top-rated.team/api/connector/services | head
curl -sS https://ai.top-rated.team/api/connector/openapi.json | head
curl -sS -X POST https://ai.top-rated.team/api/connector/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}'
```

The initialize call should return `serverInfo.name` `top-rated-team` and a
`tools` capability. `notifications/initialized` is a notification and gets
HTTP 202 with no body.
