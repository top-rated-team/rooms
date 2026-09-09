import { Link } from "wouter";

import { LegalPage, Muted, P, Row, Rows, Section } from "@/components/site/LegalPage";
import { LINK } from "@/components/site/doors/quiet";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import { CONTACT_EMAIL } from "@shared/roster";

/* ---------------------------------------------------------------------------
 * /terms
 *
 * The footer linked here and so did every door's contract row, and the address
 * answered with a 404 page under a 200 status. A contract line that names
 * terms nobody can read is worse than no line at all, because it is the line a
 * buyer checks before they decide who they are dealing with.
 *
 * Written short on purpose. Everything commercial here is already stated
 * somewhere a visitor reads first — the pricing ladder, each door's contract
 * row, the room's own footer — and terms that contradict those would be found
 * out on the first invoice. So this page says the same things once more, in
 * the order a dispute would raise them, and adds only what those surfaces do
 * not carry.
 * ------------------------------------------------------------------------- */

/** The house contract, the way Footer.tsx reads it: the default door's. */
const OURS = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;

const UPDATED = "9 September 2026";

function Out({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

export default function Terms() {
  return (
    <LegalPage
      title="Terms"
      updated={UPDATED}
      documentTitle="Terms — Top-Rated Team"
      description="Who you are contracting with, what is free, how work is agreed and invoiced, what the AI agents are and are not, and how either side stops."
      standfirst={
        <>
          <P>
            These terms cover top-rated.team: the website, the rooms it opens, the AI agents that answer in them, and
            the work agreed through any of the three.
          </P>
          <Muted>
            You are contracting with {OURS.legalName}. {OURS.entity} Nothing on this page changes what a specific
            written quote or statement of work says; where the two differ, the quote wins.
          </Muted>
        </>
      }
    >
      <Section title="Who you are dealing with">
        <P>
          Most of what is sold here is delivered by us, under one contract and one invoice, and each service page
          says so on its own row. Where a service is delivered by a partner company, that page names them, and your
          contract is with them rather than with us — the row says which, and it says it before you ask for anything.
        </P>
      </Section>

      <Section title="What is free, and what that means">
        <P>
          The audit is free. The AI agents are free to talk to, on this site and in a room, and no card is asked for.
          Opening a room is free and needs no account. The software behind this site can be run on your own hosting
          for nothing at all — no commission, no licence key, nothing reported back.
        </P>
        <Muted>
          Free means free, not a trial that becomes a bill. Nothing here starts charging you because time passed. A
          price applies only after you have agreed to a specific piece of work.
        </Muted>
      </Section>

      <Section title="How work is agreed and paid for">
        <Rows>
          <Row term="The quote comes first">
            Paid work starts with a written scope and a price, agreed in the room or by email. If it is not written
            down, it is not agreed.
          </Row>
          <Row term="What the prices mean">
            The rows on the <Link href="/pricing" className={LINK}>pricing page</Link> are what they say. Where a row
            is per month it is month to month, and you can stop at the end of any month.
          </Row>
          <Row term="Media spend is yours">
            Advertising budget is paid by you, to the platform, from your own account. We do not resell it, mark it
            up, or take a percentage of it.
          </Row>
          <Row term="Your accounts stay yours">
            Work happens in accounts you own, through access you grant and can withdraw. When we stop, access ends
            and nothing of yours moves.
          </Row>
          <Row term="Invoices">
            Issued by {OURS.legalName} and payable within fourteen days unless the quote says otherwise.
          </Row>
        </Rows>
      </Section>

      <Section title="What the AI agents are">
        <P>
          Each agent answers from one body of published documentation and cites the page it used. They are useful and
          they are not infallible: an answer may be out of date the day a platform changes its rules, and none of
          them is professional advice. The lawyer agent reads what platforms and regulators publish; it is not a
          lawyer and it cannot sign an opinion. Check anything you are about to act on, and ask a person here if it
          matters — that is what the people in the room are for.
        </P>
        <Muted>
          Do not paste passwords, API keys, account credentials or card details into a chat, with an agent or with a
          person. The agents are instructed to refuse them. If something needs a credential, it goes through the
          platform's own authorisation screen instead.
        </Muted>
      </Section>

      <Section title="Rooms">
        <P>
          A room's address is its credential: anyone holding the link can read and write in it. Share it the way you
          would a document link, and ask us to close a room when it should be closed. We may remove a room that is
          being used to abuse the service or anybody in it.
        </P>
        <P>
          There are limits on how much an agent will answer in a room in an hour and in a month, so that one room
          cannot consume the service. When a limit is reached the room says so, and a person can still answer.
        </P>
      </Section>

      <Section title="Third-party platforms">
        <P>
          Where you connect Google, LinkedIn or WhatsApp, that connection is governed by their terms as well as
          these, and we act only within the permission you granted. LinkedIn work is done through LinkedIn's official
          APIs under the{" "}
          <Out href="https://www.linkedin.com/legal/l/api-terms-of-use">LinkedIn API Terms of Use</Out>: no scraping,
          no browser automation, and nothing published without your approval. Google Ad Grant accounts are subject to
          Google's own programme policies, and an account can be suspended by Google for breaching them.
        </P>
      </Section>

      <Section title="What we do not promise">
        <P>
          No result is guaranteed. Advertising outcomes depend on your market, your offer and platform decisions
          nobody outside those platforms controls, and any figure discussed is an expectation rather than a
          commitment. Where a case study is shown, it is what happened in that account, not a forecast for yours.
        </P>
        <P>
          The service is provided as it is. Our liability for any claim is limited to the amount you paid us for the
          work the claim concerns in the three months before it arose, and neither side is liable for indirect or
          consequential loss. Nothing here limits liability that cannot lawfully be limited.
        </P>
      </Section>

      <Section title="Confidentiality">
        <P>
          What you tell us about your business stays between us. We will not name you as a client without your
          agreement, and a case study is published only with permission or with the account made unidentifiable.
        </P>
      </Section>

      <Section title="Stopping">
        <P>
          Either side can stop month-to-month work at the end of a month, in writing, with no penalty. Work already
          done is invoiced. On request we hand over what we made and remove our access.
        </P>
      </Section>

      <Section title="Law, and how to reach us">
        <P>
          These terms are governed by Slovak law, and the courts of the Slovak Republic have jurisdiction. Before
          anybody goes near a court, write to <Out href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Out> — in
          the whole history of this business every disagreement has been settled that way.
        </P>
        <Muted>
          How we handle personal data is on the <Link href="/privacy" className={LINK}>privacy page</Link>. When these
          terms change, the date at the top changes with them, and a change that affects work already agreed does not
          apply to it.
        </Muted>
      </Section>
    </LegalPage>
  );
}
