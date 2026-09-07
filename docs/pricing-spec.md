# Pricing and packaging — the owner's specification, 7 September 2026

Written down verbatim in substance before anything is built from it, because it
is the first thing on this site that makes a commercial promise. Two parcels
implement it: `pricing-and-packaging` and `room-identity-binding`.

## The ladder

| Price | What it buys |
|---|---|
| **from $49 per task** | A contractor dedicated to the project. **Unlimited hours on that task.** |
| **$49 / month** | Content-generation support, or boosting support for top-voice.ai or warmlike.com |
| **$99** | A conversion-tracking setup, **or** a full month of managing one Google Ad Grant account |
| **from $499 / month** | Managing paid advertising accounts |
| **+$49 / month** | Boosters for top-voice.ai or warmlike.com on the client's own account or Pages |
| **free** | Content campaigns and autopilot (its own door) and the AI agent — **on the condition of the client's own Anthropic and/or OpenAI keys**, which is then what pays for talking to the agents and for agents talking to each other |
| **custom** | Every other door |

## Access to the agents, by how identified the visitor is

1. **Nobody signed in** — a limited amount of conversation with the AI agents. Sold.
2. **Signed in** — more generous. The word the owner used is *конкретизація*: the
   allowance grows as the visitor becomes specific about who they are.
3. **The visitor starts pasting links to their own things** — the agent asks them
   to identify themselves *for confidentiality*, by one of two routes:
   - **LinkedIn**, through the official API.
   - **WhatsApp**, through [WAHA](https://waha.devlike.pro/), already running on
     another host: a link or a QR code opens WhatsApp with a pre-filled message
     carrying the link to their room, which reaches us.

   What is actually being offered, in the owner's words: bind the room to their
   LinkedIn, and/or just keep the link to it in WhatsApp for convenience.

## The taxi balance

A balance that pays for people and boosters — and hybrids of the two — but
**never for a pure AI agent**. Those are covered by the ladder above, or by the
client's own keys.

## What a buyer may see before paying

- A link to book a **free introductory call** with Dan Burykin *and* the
  contractor.
- The **Upwork profile** of Dan Burykin and of the contractor, for reference.
- Both must be visible **before** buying and **inside the room** afterwards.

## Slogans, as given

Usable on the home page or on a door. Three are marked, with the reason.

- AI does all of Paid Ads management today. Still human touch is needed for audiences and conversion tracking setup. It's the first priority!
- Expert audit of what AI agents are doing in your Google Ads and Paid Ads accounts.
- Considering ChatGPT Ads? First, integrate its audiences and events with Google Ads and any Paid Ads.
- AI agent or Human? Hire both for less!
- Custom AI agent solution for your Google Ads and Paid Ads
- ~~All Google Ads experts are fired today! Hire Hybrid of AI agent + human expert.~~ **Do not ship.** It is not true — Google Ads experts have not been fired — and it is a claim about other people's employment made to sell a service. The idea underneath it is the line above, which says the same thing without asserting something false.
- Considering ChatGPT Ads? Run your own cost effective organic Ads platform.
- Custom inbound LinkedIn funnel for your business needs via official LinkedIn API.
- Win attention for your offer! Do not create another products. It will sink in the information flow.
- Can't get into ChatGPT Plugins marketplace? GPTs are not retired, get some!
- ~~Never pay for AI tokens! Unlimited vibe coding for $99/mo~~ **Do not ship as written.** Both halves contradict something already shipped — see below.

## Three things in this spec that contradict code already deployed

These are not objections to the plan. They are places where shipping the plan
requires changing something that is currently enforced, and where shipping the
copy without changing the code would make the site untrue.

### 1. The agents are currently forbidden from saying any price

Two commits ago the house style shared by all nine agents grew a block naming
what an agent may never state: *"A price, fee, rate, retainer, hourly rate,
percentage of ad spend, setup cost, discount, tier or package. Not as a figure,
not as a range, not as 'typically', not as an example."* It exists because the
LinkedIn Ads agent invented a four-tier price list on the live site.

`server/ai/grounding.test.ts` holds it down, and one case asserts that **no
agent prompt contains a currency figure at all**.

Once prices are published the rule has to become *the other* rule, and it is a
different rule rather than a weaker one: **an agent may state a published price
verbatim and may never state any other number.** No arithmetic, no proration, no
"roughly", no discount, no estimate of what a custom door would cost. The prices
must reach the prompt from the same data the page renders, so an agent cannot
quote a figure the site does not show.

### 2. "Never pay for AI tokens" is the opposite of the free tier's condition

The free tier is free *because the client supplies their own Anthropic or OpenAI
keys* — so they pay for every token, directly, to the model provider instead of
to us. "Never pay for AI tokens" tells them they will not. The true and better
version of the same offer: **we take no margin on tokens — you bring your own
keys and pay the provider directly.**

### 3. "Unlimited" collides with the spend limits shipped in the same hour

`server/spend.ts` went live today with three bounds per room: 30 agent turns an
hour, a 20-minute active clock, and `ROOM_MONTHLY_BUDGET_USD`, default $5,
stopped at 100%. A room that hits any of them is told so in words.

"Unlimited vibe coding" and "unlimited hours" therefore need to say what is
actually unlimited, and it is a real and unusual offer either way:

- **"Unlimited hours" on a $49 task is true and it is about a person.** A
  contractor's time on that task is not metered. Say that.
- **Agent conversation is bounded**, and the bound is per room per month. On the
  bring-your-own-keys tier the ceiling is the client's own key and their own
  spending limit, which is genuinely uncapped by us — so *that* tier can say
  "we do not meter it" honestly.

Nothing here needs the limits removed. It needs the copy to say which of the two
things is uncapped.
