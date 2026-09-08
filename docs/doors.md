# Moved

`doors.md` — the tier rule, who invoices what, and why each offer sits where it
does — is no longer in this repository. It is commercial rather than technical:
useful to a competitor, and useful to nobody who wants to run a copy of this.

**If you are working in the owner's checkout**, it is at `private/doors.md`, and
every pointer in the code and in `parcels.json` was moved with it.

**If you have forked this**, you do not need it. What it describes is enforced
in code you already have: `shared/doors.ts` carries each offer's contract —
whose legal name, terms, invoice line and contact address a room prints — and
`server/pricing.test.ts` holds the rules down so a door cannot show a price that
is not its own.

This file stays as a signpost because prompts and comments pointed here for a
long time, and a dead path is worse than a redirect.
