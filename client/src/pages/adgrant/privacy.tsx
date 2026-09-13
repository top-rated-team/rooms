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
 * AdGrant.AI's own privacy page. Filled from the catalogue: login methods
 * this product actually offers, rooms, the generator, and any partner row.
 * A sentence that would not be true of this tree is not on this page.
 */
export function Privacy() {
  /* Undefined until the server says which ways in this deployment has, so no
     sentence here asserts one before it is known. See useLoginWays. */
  const loginWays = useLoginWays();
  const facts = thisLegalFacts(loginWays ?? undefined);
  const ways = [
    facts.login.linkedin ? "LinkedIn sign-in" : null,
    facts.login.whatsapp ? "a WhatsApp message to us" : null,
    facts.login.email ? "a link sent to an email address that already has a room" : null,
  ].filter((way): way is string => way !== null);
  const waysLine =
    loginWays === null
      ? "Reading which ways in this deployment has."
      : ways.length === 0
        ? "No sign-in method is configured on this deployment."
        : ways.length === 1
          ? ways[0]
          : `${ways.slice(0, -1).join(", ")} or ${ways[ways.length - 1]}`;

  return (
    <>
      <Meta
        title="Privacy — AdGrant.AI"
        description="What adgrant.ai collects, why, who processes it, and how to get it removed. No analytics, no advertising cookies, no tracking pixels."
      />
      <section className={`${PAGE} pt-[var(--s5)]`}>
        <div className="max-w-[68ch]">
          <p className={META}>Legal</p>
          <h1 className={`${DISPLAY} m-0 mt-[var(--s2)]`}>Privacy</h1>
          <p className={`${META} mt-[var(--s2)]`}>Last updated {UPDATED}</p>
          <div className={`mt-[var(--s3)] space-y-[var(--s2)] ${READ}`}>
            <P>
              This is what {facts.displayName} collects when you use adgrant.ai, why we collect it, who else
              processes it, and how to have it removed. It covers the website, the rooms it opens, the AI agents
              that answer in them, and — where you ask for one — a Google Ad Grant structure produced from a
              nonprofit&rsquo;s website.
            </P>
            <Muted>
              The controller is {facts.legalName}. {facts.entity}{" "}
              {facts.contact ? (
                <>
                  <Out href={contactHref(facts.contact)}>{facts.contactLabel ?? facts.contact}</Out> about anything on
                  this page, including a request to delete what we hold.
                </>
              ) : (
                "There is no contact address on file for this deployment."
              )}
            </Muted>
          </div>

          <Section title="The short version">
            <P>
              There is no analytics on this site. No Google Analytics, no Tag Manager, no advertising pixel, no
              session recorder, no cookie banner — because there are no tracking cookies to consent to. Nothing you
              do here is measured for advertising, and nothing about you is sold or shared with anyone for their own
              purposes.
            </P>
            <P>
              What we do keep is what the service needs to work: the conversation in a room, so it is there when you
              come back; a structure you asked us to produce, so you can open it again; and, if you identify
              yourself, the narrowest thing that identification can tell us.
            </P>
          </Section>

          <Section title="What we collect, and why">
            <Rows>
              {facts.rooms ? (
                <Row term="Opening a room">
                  A room is created the moment you open one. It holds its address, its name, the messages in it, its
                  channels, its members and its tasks. The address in the bar — everything after <code>/w/</code> —
                  is the credential: anyone who has it can read and write in that room, so treat it the way you
                  would a shared document link.
                </Row>
              ) : null}
              <Row term="Asking an agent">
                Your question, and the answer, are stored in the room once you keep the conversation. The question
                is sent to OpenAI to produce the answer. We do not use anything you write to train a model, and
                OpenAI does not train on API traffic. Until you keep it, the question lives only on this page.
              </Row>
              {facts.generatesStructure ? (
                <Row term="Producing a structure">
                  The nonprofit website you give us, the country or region the ads should show in, and the structure
                  that comes back. The structure is shown on this page and stored on the room that belongs to you. It
                  is not written into a Google Ads account. A generation needs the room bound to you first.
                </Row>
              ) : null}
              {facts.login.linkedin ? (
                <Row term="Signing in with LinkedIn">
                  We use Sign In with LinkedIn using OpenID Connect. We receive your LinkedIn subject identifier and
                  your name, and we keep those two so a room can be yours. LinkedIn&rsquo;s access token is used
                  once, to read that, and is discarded — we do not store it and we cannot act as you afterwards.
                  LinkedIn does not endorse this page.
                </Row>
              ) : null}
              {facts.login.whatsapp ? (
                <Row term="WhatsApp">
                  If you message us from a room, or to prove a room is yours, we store a salted one-way hash of the
                  conversation identifier and your WhatsApp display name. We do not store your phone number and we do
                  not log it.
                </Row>
              ) : null}
              {facts.login.email ? (
                <Row term="A link to your email">
                  If you ask for a link to a room, we send it to the address you typed. The address is used to reach
                  that room and is not added to a list.
                </Row>
              ) : null}
              <Row term="Your browser">
                The rooms this browser remembers — their address, name and when you last opened them — and your
                light or dark preference are kept in your browser&rsquo;s own storage. They are never sent to us and
                clearing your site data removes them.
              </Row>
              <Row term="Server records">
                Our server records the requests it answers, in the ordinary way, so that faults can be found. There
                is no profile built from them.
              </Row>
            </Rows>
          </Section>

          <Section title="How you identify yourself">
            <P>
              The ways in on this site are {waysLine}. Each one is shown only when this deployment has it
              configured. A way that is not configured is not offered, and this page does not describe it as if it
              were.
            </P>
          </Section>

          {facts.partners.length > 0 ? (
            <Section title="Work that is not ours">
              <P>
                Some services on this site are contracted by another company. That company&rsquo;s own terms apply
                to that work, and a room opened through that door names them in its footer. Today that is:
              </P>
              <Rows>
                {facts.partners.map((partner) => (
                  <Row key={partner.legalName} term={partner.legalName}>
                    {partner.headline}
                  </Row>
                ))}
              </Rows>
            </Section>
          ) : null}

          <Section title="Who else processes it">
            <Rows>
              <Row term="Neon">The database. Rooms, messages and generated structures, in the European Union.</Row>
              <Row term="Render">The hosting that runs the application.</Row>
              <Row term="OpenAI">Answers a question an agent was asked. Not used for training.</Row>
              {facts.login.linkedin ? <Row term="LinkedIn">Sign-in, as described above.</Row> : null}
              {facts.login.whatsapp ? (
                <Row term="A messaging connector">
                  Connects our own WhatsApp number to this application so a message can be answered. It sees the
                  message, and nothing about you beyond what is in it.
                </Row>
              ) : null}
              {facts.login.email ? (
                <Row term="Resend">Sends the email that opens a room, when that way in is switched on.</Row>
              ) : null}
            </Rows>
          </Section>

          <Section title="How long we keep it">
            <P>
              A room and its messages are kept while the work is live and for as long as you might want to come back
              to it. A generated structure is kept with that room. Ask us to delete a room and we will, and we will
              say when it is done.
            </P>
          </Section>

          <Section title="What you can ask for">
            <P>
              A copy of what we hold about you, a correction, or its deletion.
              {facts.contact ? (
                <>
                  {" "}
                  <Out href={contactHref(facts.contact)}>{facts.contactLabel ?? facts.contact}</Out>.
                </>
              ) : null}{" "}
              We answer within a month and usually the same week. If you are in the European Union or the United
              Kingdom you also have the right to complain to your data protection authority; in Slovakia, where this
              business is registered, that is the Office for Personal Data Protection.
            </P>
          </Section>

          <Section title="Changes">
            <P>
              When this page changes the date at the top changes with it. If a change means we start collecting
              something we did not collect before, we will say so here rather than only editing a line. How we
              contract is on the <Out href={sectionPath("terms")}>terms page</Out>.
            </P>
          </Section>
        </div>
      </section>
    </>
  );
}

export default Privacy;
