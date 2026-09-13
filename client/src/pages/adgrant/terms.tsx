import { Link } from "wouter";

import { Muted, P, Row, Rows, Section } from "@/components/site/LegalPage";
import { DISPLAY, LINK, META, PAGE, READ } from "@/components/site/doors/quiet";
import { thisLegalFacts, useLoginWays } from "@/pages/adgrant/catalogue";
import { Meta } from "@/components/adgrant/Meta";
import { sectionPath } from "@/components/adgrant/links";

const UPDATED = "13 September 2026";

function Out({ href, children }: { href: string; children: string }) {
  const internal = href.startsWith("/");
  if (internal) {
    return (
      <Link href={href} className={LINK}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

function contactHref(contact: string): string {
  return /^(https?:\/\/|mailto:|\/)/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * AdGrant.AI's own terms. Filled from the catalogue so a fork of this site
 * names the company that is actually on the resolved rows, and does not
 * borrow top-rated.team's page.
 */
export function Terms() {
  /* Undefined until the server says which ways in this deployment has, so no
     sentence here asserts one before it is known. See useLoginWays. */
  const ways = useLoginWays();
  const facts = thisLegalFacts(ways ?? undefined);

  return (
    <>
      <Meta
        title="Terms — AdGrant.AI"
        description="Who you are contracting with on adgrant.ai, what is free, how a structure is produced, what the AI agents are and are not, and how either side stops."
      />
      <section className={`${PAGE} pt-[var(--s5)]`}>
        <div className="max-w-[68ch]">
          <p className={META}>Legal</p>
          <h1 className={`${DISPLAY} m-0 mt-[var(--s2)]`}>Terms</h1>
          <p className={`${META} mt-[var(--s2)]`}>Last updated {UPDATED}</p>
          <div className={`mt-[var(--s3)] space-y-[var(--s2)] ${READ}`}>
            <P>
              These terms cover adgrant.ai: the website, the rooms it opens, the AI agents that answer in them, and
              {facts.generatesStructure
                ? " a Google Ad Grant structure produced from a nonprofit's website."
                : " the work agreed through any of the three."}
            </P>
            <Muted>
              You are contracting with {facts.legalName}. {facts.entity} Nothing on this page changes what a specific
              written quote or statement of work says; where the two differ, the quote wins.
            </Muted>
          </div>

          <Section title="Who you are dealing with">
            <P>
              Most of what is sold here is delivered by us, under one contract and one invoice, and each service page
              says so on its own row. {facts.invoiceLine}
            </P>
            {facts.partners.length > 0 ? (
              <P>
                Where a service is delivered by a partner company, that page names them, and your contract is with
                them rather than with us — the row says which, and it says it before you ask for anything. Today that
                is {facts.partners.map((partner) => partner.legalName).join("; ")}.
              </P>
            ) : null}
          </Section>

          <Section title="What is free, and what that means">
            <P>
              The AI agents are free to talk to, on this site and in a room, and no card is asked for. Opening a room
              is free and needs no account.
              {facts.generatesStructure
                ? " Producing a structure from a nonprofit website is free, up to the three-generation cap the room states — that cap is capacity on a shared daily quota, not a trial that becomes a bill."
                : ""}
            </P>
            <Muted>
              Free means free, not a trial that becomes a bill. Nothing here starts charging you because time passed.
              A price applies only after you have agreed to a specific piece of work.
            </Muted>
          </Section>

          {facts.generatesStructure ? (
            <Section title="What a generated structure is">
              <P>
                A structure is campaigns, ad groups, keywords, ads and extensions, produced from the nonprofit&rsquo;s
                own website and shown on this site. Nothing is written into a Google Ads account from this page. A
                person sets up the manager-account link afterwards if the structure should go into the grant account.
                That second step is a different piece of work, and it is not promised in the same session as the
                generation.
              </P>
              <Muted>
                Google Ad Grant accounts are subject to Google&rsquo;s own programme policies, and an account can be
                suspended by Google for breaching them. A generated structure is checked against those rules as this
                software knows them; that is not a promise that Google will approve or keep the account.
              </Muted>
            </Section>
          ) : null}

          <Section title="How work is agreed and paid for">
            <Rows>
              <Row term="The quote comes first">
                Paid work starts with a written scope and a price, agreed in the room or by email. If it is not
                written down, it is not agreed.
              </Row>
              <Row term="Media spend is the nonprofit's">
                Advertising budget — including the Ad Grant — is spent in accounts the nonprofit owns. We do not
                resell it, mark it up, or take a percentage of it.
              </Row>
              <Row term="Your accounts stay yours">
                Work happens in accounts you own, through access you grant and can withdraw. When we stop, access
                ends and nothing of yours moves.
              </Row>
              <Row term="Invoices">Issued by {facts.legalName} and payable within fourteen days unless the quote says otherwise.</Row>
            </Rows>
          </Section>

          <Section title="What the AI agents are">
            <P>
              Each agent answers from one body of published documentation and cites the page it used. They are useful
              and they are not infallible: an answer may be out of date the day a platform changes its rules, and
              none of them is professional advice. The Ad Grants agent does not say whether Google will approve or
              reinstate an account. Check anything you are about to act on, and ask a person here if it matters.
            </P>
            <Muted>
              Do not paste passwords, API keys, account credentials or card details into a chat, with an agent or
              with a person. The agents are instructed to refuse them.
            </Muted>
          </Section>

          {facts.rooms ? (
            <Section title="Rooms">
              <P>
                A room&rsquo;s address is its credential: anyone holding the link can read and write in it. Share it
                the way you would a document link, and ask us to close a room when it should be closed. We may remove
                a room that is being used to abuse the service or anybody in it.
              </P>
              <P>
                There are limits on how much an agent will answer in a room in an hour and in a month, so that one
                room cannot consume the service. When a limit is reached the room says so, and a person can still
                answer.
              </P>
            </Section>
          ) : null}

          <Section title="What we do not promise">
            <P>
              No result is guaranteed. Advertising outcomes depend on the nonprofit&rsquo;s work, its website and
              platform decisions nobody outside those platforms controls, and any figure discussed is an expectation
              rather than a commitment. Where a measured number is shown, it is what this product has processed, not
              a forecast for one account.
            </P>
            <P>
              The service is provided as it is. Our liability for any claim is limited to the amount you paid us for
              the work the claim concerns in the three months before it arose, and neither side is liable for
              indirect or consequential loss. Nothing here limits liability that cannot lawfully be limited.
            </P>
          </Section>

          <Section title="Stopping">
            <P>
              Either side can stop month-to-month work at the end of a month, in writing, with no penalty. Work
              already done is invoiced. On request we hand over what we made and remove our access.
            </P>
          </Section>

          <Section title="Law, and how to reach us">
            <P>
              These terms are governed by Slovak law, and the courts of the Slovak Republic have jurisdiction.
              {facts.contact ? (
                <>
                  {" "}
                  Before anybody goes near a court,{" "}
                  <Out href={contactHref(facts.contact)}>
                    {facts.contactLabel ? `${facts.contactLabel.charAt(0).toLowerCase()}${facts.contactLabel.slice(1)}` : facts.contact}
                  </Out>
                  .
                </>
              ) : null}
            </P>
            <Muted>
              How we handle personal data is on the <Out href={sectionPath("privacy")}>privacy page</Out>. When these
              terms change, the date at the top changes with them, and a change that affects work already agreed does
              not apply to it.
            </Muted>
          </Section>
        </div>
      </section>
    </>
  );
}

export default Terms;
