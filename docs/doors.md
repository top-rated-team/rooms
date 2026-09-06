# Doors

Read this before you add, change or retire one. It assumes no programming knowledge.
The checklist for adding the eighth door is near the end.

## What a door is

A door is the page a stranger lands on. Seven doors, one workspace: whichever one a
visitor comes through, they meet the same panel, ask a question, get a cited answer for
free, and — only if the conversation turns out to be worth keeping — get a room with an
address of its own.

A door is not a separate website and not a separate product. It decides five things:

1. **What the page says it does** — the headline and the two sentences under it.
2. **Which agent answers first** — and what that agent will and will not touch.
3. **What the four starter questions are** — the questions printed before anyone types.
4. **Whose name the room carries** — on the footer, the contract and the invoice.
5. **How much of the work is ours** — one of three tiers, shown to the buyer as a chip.

Everything else — the panel, the streaming answer, the citations, the "nothing is saved
yet" line, the Keep step, the room, the badges, the task panel — is the same code for
every door and stays the same code. That is the point: seven offers cost roughly what
one offer costs.

## The seven doors today

| Door | Tier | Who invoices | State |
|---|---|---|---|
| Conversion tracking for ChatGPT Ads | Ours end to end | Top-Rated Team s.r.o. | live at `/` |
| Google Ads management | Ours end to end | Top-Rated Team s.r.o. | coming |
| Google Ad Grants, set up with AdGrant.AI | Ours end to end | Top-Rated Team s.r.o. | coming |
| LinkedIn Ads | Ours end to end | Top-Rated Team s.r.o. | coming |
| LinkedIn automation, with a written legal assessment | Lawyer first | Top-Rated Team s.r.o. for the build; the lawyer bills the assessment | coming |
| LinkedIn growth | A different company | Maksymenko LinkedIn Growth | coming |
| Custom AI builds | Ours end to end | Top-Rated Team s.r.o. | coming |

"Coming" is not a placeholder or a lie. A coming door appears on `/work` with its own
one-line explanation of why its panel is shut, because an offer that is real and a page
that is finished are two different things.

## Where a door lives

All seven are rows in one file, `shared/doors.ts`. One row per door, no logic in it,
nothing else to edit. Change a word there and the door page, the `/work` overview and
every room opened through it change with it. If anything below disagrees with that
file, the file is right — it is what the site actually reads.

## Every field, and what it is for

**`id`** — the short name the rest of the system uses: `chatgpt-ads`, `linkedin-growth`.
Every room ever opened through this door stores it. Choose it once and never change it;
changing it orphans the rooms that already carry the old one.

**`slug`** — the piece of the address after `/work/`. Normally the same as the id.

**`path`** — where the door lives today. `/work/<slug>` for all of them except the
ChatGPT Ads door, which is the home page.

**`initials`** and **`tone`** — two letters and a colour for the little square beside the
door's name. Cosmetic. `tone` must be one of the site's token classes so the door looks
right in dark mode as well as light; copy the pattern from a neighbouring row rather
than inventing a colour.

**`headline`** — what the page says at the top. Say the work, not the ambition:
"Conversion tracking for ChatGPT Ads", not "Unlock your full funnel potential".

**`blurb`** — two sentences at most, in the words the buyer would use. Say what gets
done, on whose system, and what proves it is done. The same two sentences are printed on
the door and on the `/work` row, so they have to read as well in a list as under a
headline.

**`firstAgentId`** — which agent opens the conversation, or nothing at all. The partner
door sets this to nothing on purpose: no agent of ours speaks for another company.

**`agentLine`** — that agent's job here, in one line, *including what it refuses*. The
LinkedIn automation door says the agent scopes the build and does not answer legal
questions. Writing the refusal down is what stops the agent from guessing later.

**`starters`** — at least four questions. The panel prints the first four and hides the
rest behind "N more", because eight on a card is a menu and a menu is read by nobody.
Take them from what people actually ask you — the support inbox, the first ten minutes
of a sales call — and write each as a whole question ending in a question mark. "Why did
my CPA double?" gets clicked. "CPA analysis" does not.

**`tier`** — one of three, and the visitor reads a plain-English chip for it:

| Tier | Chip | What it means to the person paying |
|---|---|---|
| `white` | Ours end to end | Top-Rated Team signs, invoices and answers for the work. |
| `light-grey` | Lawyer first | A qualified lawyer writes down what is allowed where you are before anything is built, and bills that part separately. |
| `grey` | A different company | Another company contracts with you, does the work and invoices you. Top-Rated Team is not in that chain and takes no share of it. |

**`status`** and **`comingLine`** — `live` means a visitor can open the panel now.
`coming` means the offer is real and the door is not built, and `comingLine` is the one
sentence saying so. A coming door with no `comingLine` is a dead end; write the
sentence.

**`kbNamespace`** — which body of knowledge the answers are retrieved from. Only
`chatgpt-ads` has a corpus today (`data/kb/kb.json`). A door pointing at a namespace
with nothing behind it does not invent an answer — the agent says what it is missing,
which is honest and also a wasted visit. Build the corpus before you set the door live.

**`contract`** — five fields and an optional sixth, and they are the ones that cost
money to get wrong.

## The block that matters: `contract`

- **`legalName`** — the company the client is buying from, in full, including the legal
  form: `Top-Rated Team s.r.o.`, not `Top-Rated Team`.
- **`entity`** — what kind of body that is, in a client's words.
- **`termsUrl`** — the terms *that company* publishes. It may be empty, and where it is
  empty the room says so out loud. It must never quietly fall back to ours: borrowing
  another company's terms is worse than admitting there are none yet.
- **`invoiceLine`** — who invoices, and for what, in one sentence with no hedging.
- **`contact`** — where a person writes about a room opened through this door: an email
  address, or the address of a contact page. Two companies never share one, so it lives
  here rather than being defaulted in the room. Like `termsUrl` it may be empty, and
  where it is empty the room says there is no address on file rather than offering ours.
- **`contactLabel`** — optional link text, for when `contact` is a page rather than an
  address.

Every room remembers the door it was opened through and prints that door's name in its
footer. A visitor who came in through the partner door sees the partner's name in the
room, on the contract and on the invoice, and never sees Top-Rated Team's. The door
sets it once; nobody downstream has to remember.

**If the name is wrong, the client has been told the wrong thing about who they are
buying from.** Three things decide who the seller actually is, and none of them is what
the website calls itself: who sets the price, whose name is on the paper the client
receives, and who loses the money when it goes wrong. A wrong `legalName` gets the
second one wrong in writing, on every document that room produces.

For the partner door in particular: **the client pays the partner directly, and
Top-Rated Team does not invoice for that work at all — not even a share of it.** A
client who buys from both gets two contracts, two invoices and two support addresses.
That is not paperwork for its own sake; it is the only thing that keeps the two
businesses genuinely separate, and a shared invoice undoes it in one line.

If you find a room carrying the wrong name, it is not a display bug. Fix the row, then
re-issue whatever contract or invoice went out with the wrong name on it, and tell the
client plainly why a second document is arriving. Fixing the row alone leaves the wrong
document in their files.

This is design, not legal advice. When a door involves a company that is not
Top-Rated Team s.r.o., have its terms and its invoicing checked by someone qualified
before the door goes live, not after the first client.

## Adding the eighth door

**Decide these six things in writing first.** None of them is a developer question, and
answering them badly is what makes a door useless:

1. What is the work, in one sentence a client would recognise?
2. Which company signs and invoices for it, in its registered form, and where are its
   terms published?
3. Which tier is it — ours end to end, lawyer first, or a different company?
4. Who or what answers the first question, and what does that agent refuse?
5. What can it read? If there is no body of knowledge for the subject yet, the door
   opens as `coming` until there is.
6. What four questions does a real person ask about this work before they buy?

**Then the mechanical part**, which is small:

1. Add a row to `shared/doors.ts` with the fields above. Copy the nearest existing row
   and change it; do not start from an empty object.
2. If the door needs a new agent, add it to `shared/roster.ts` and give it something to
   cite.
3. If the company has no terms page yet, leave `termsUrl` empty rather than pointing at
   ours, and keep the door `coming` until it has one.
4. Update the one sentence under the hero on `/`, which counts the doors in words —
   "one of seven ways in". It is the only place the number is written out, and it is the
   only thing an eighth door makes untrue.

**Then check it as a visitor would**, in this order:

1. Open `/work`. The new row reads plainly and the company under it is right.
2. Open the door. Ask one of its four starters. The answer streams, cites something
   real, and the line "Nothing is saved yet. Close this tab and it is gone" is under it.
3. Press Keep. The room opens with that conversation already in it.
4. Scroll to the bottom of the room and **read the company name aloud**. If it is not
   the company that will send the invoice, stop and fix the row before anyone else sees
   the page.

## Rules that apply to every door

- **No price on the door.** Whoever sets the price is the seller of that work. On a door
  that is not Top-Rated Team's own, publishing a price makes Top-Rated Team the seller
  in fact, whatever the footer says.
- **No promise of a result.** Doors describe work. Proof lives in the case studies,
  attached to a named client and a real number.
- **Four starters, not eight.** Eight questions is a menu, and a menu is read by nobody.
- **One terms page per legal name.** Never point two companies at one page.
- **Nothing that decides for the client.** Doors do not rank, score, match or assign
  anyone automatically. A door presents work and starts a conversation; a person picks
  up the other end.

## Changing or retiring a door

Editing a headline, a blurb, a starter or an `agentLine` is safe: it changes what the
next visitor reads and nothing else.

Editing anything in `contract` is a paperwork change wearing a text-edit's clothes. A
room keeps the name it was opened with, so a corrected row fixes every room opened from
now on and leaves the existing ones as they were. Those have to be corrected one at a
time, along with any contract or invoice already sent under the wrong name.

To retire a door, set its `status` to `coming` with a sentence saying why, or stop
listing it — but leave the row in the file. Rooms opened through it keep working and
keep the name they were opened with. Deleting the row leaves those rooms pointing at a
door that no longer exists.
