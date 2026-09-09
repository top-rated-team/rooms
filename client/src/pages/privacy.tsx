import { LegalPage, Muted, P, Row, Rows, Section } from "@/components/site/LegalPage";
import { LINK } from "@/components/site/doors/quiet";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import { CONTACT_EMAIL } from "@shared/roster";

/* ---------------------------------------------------------------------------
 * /privacy
 *
 * Written because there was none, and two applications were waiting on it:
 * Google's OAuth brand review, which rejected the app for a privacy policy
 * that "does not have sufficient content" — the address returned a 404 page
 * with a 200 status — and a LinkedIn API application made as a SaaS.
 *
 * The rule this page is written to is the site's own: everything here must be
 * true of the code as it stands. So it names the actual stores, the actual
 * processors and the actual fields, and where a thing is not built yet it
 * says "when", not "we may". A policy that reserves rights the software does
 * not exercise is the kind that gets read as boilerplate, by a reviewer and by
 * a customer both.
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

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      updated={UPDATED}
      documentTitle="Privacy — Top-Rated Team"
      description="What top-rated.team collects, why, who processes it, and how to get it removed. No analytics, no advertising cookies, no tracking pixels."
      standfirst={
        <>
          <P>
            This is what {OURS.displayName} collects when you use top-rated.team, why we collect it, who else
            processes it, and how to have it removed. It covers the website, the rooms it opens, the AI agents that
            answer in them, and the connections you can authorise — Google Calendar, LinkedIn and WhatsApp.
          </P>
          <Muted>
            The controller is {OURS.legalName}. {OURS.entity} Write to us at{" "}
            <Out href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Out> about anything on this page, including a
            request to delete what we hold.
          </Muted>
        </>
      }
    >
      <Section title="The short version">
        <P>
          There is no analytics on this site. No Google Analytics, no Tag Manager, no advertising pixel, no session
          recorder, no cookie banner — because there are no tracking cookies to consent to. Nothing you do here is
          measured for advertising, and nothing about you is sold or shared with anyone for their own purposes.
        </P>
        <P>
          What we do keep is what the service needs to work: the conversation in a room, so it is there when you come
          back; a message you send us, so somebody can answer it; and, if you choose to connect an account, the
          narrowest thing that account can tell us.
        </P>
      </Section>

      <Section title="What we collect, and why">
        <Rows>
          <Row term="Opening a room">
            A room is created the moment you open one. It holds its address, its name, the messages in it, its
            channels, its members and its tasks. If you tell an agent your name, company, website or email, those are
            kept on the room so the people in it can answer you. The address in the bar — everything after{" "}
            <code>/w/</code> — is the credential: anyone who has it can read and write in that room, so treat it the
            way you would a shared document link.
          </Row>
          <Row term="Asking an agent">
            Your question, and the answer, are stored in the room. The question is sent to OpenAI to produce the
            answer. We do not use anything you write to train a model, and OpenAI does not train on API traffic.
          </Row>
          <Row term="Leaving a message">
            Your name, your email, what you wrote, and which service page you wrote it from. This is the only place
            we ask for an email address as a matter of course, and it is there so a person can reply.
          </Row>
          <Row term="Booking a call">
            The date and time you pick, your name, the topic, and — only if you give it — your email address, so
            Google sends you a real calendar invitation. Without an email the meeting is still booked and no
            invitation is sent. The event is created in our own Google Calendar.
          </Row>
          <Row term="Your own calendar, if you connect it">
            Optional, and it exists so we do not offer you a time you are already busy. If you authorise it, we read
            your free/busy information through Google's{" "}
            <Out href="https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query">
              Free/Busy API
            </Out>{" "}
            under the scope <code>calendar.freebusy</code>. That returns time ranges and nothing else — no event
            titles, no guests, no locations, no descriptions. We hold it in memory for the length of the booking, we
            never write it down, and the connection ends when you confirm or after five minutes, whichever comes
            first. You can also revoke it yourself at any time at{" "}
            <Out href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</Out>.
          </Row>
          <Row term="Signing in with LinkedIn">
            We use{" "}
            <Out href="https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2">
              Sign In with LinkedIn using OpenID Connect
            </Out>
            . We receive your LinkedIn subject identifier and your name, and we keep those two so a room can be
            yours. LinkedIn's access token is used once, to read that, and is discarded — we do not store it and we
            cannot act as you afterwards. If you grant the <code>email</code> permission we receive your address and
            use it only to reach you about the work.
          </Row>
          <Row term="WhatsApp">
            If you message us from a room to prove the room is yours, we store a salted one-way hash of the
            conversation identifier and your WhatsApp display name. We do not store your phone number and we do not
            log it. If you type a number into a room yourself, that is kept separately and shown as a note rather
            than as something we verified.
          </Row>
          <Row term="Your browser">
            The rooms this browser remembers — their address, name and when you last opened them — and your light or
            dark preference are kept in your browser's own storage. They are never sent to us and clearing your site
            data removes them.
          </Row>
          <Row term="Server records">
            Our server records the requests it answers, in the ordinary way, so that faults can be found. There is no
            profile built from them.
          </Row>
        </Rows>
      </Section>

      <Section title="LinkedIn, in detail">
        <P>
          top-rated.team is a software service. Where it acts on LinkedIn it acts <em>for you</em>, on your
          instruction, through LinkedIn's official APIs and under the{" "}
          <Out href="https://www.linkedin.com/legal/l/api-terms-of-use">LinkedIn API Terms of Use</Out>. There is no
          scraping, no browser automation, no unofficial endpoint, and no credential of yours ever reaches us — you
          authorise through LinkedIn's own screen and can withdraw at{" "}
          <Out href="https://www.linkedin.com/mypreferences/d/data-sharing-with-third-parties">
            LinkedIn's permitted services settings
          </Out>
          .
        </P>
        <P>
          Two things it does. It signs you in, using OpenID Connect as described above. And, where you have
          explicitly asked for it and granted the permission, it reads and publishes content for a LinkedIn page you
          administer through LinkedIn's Community Management API — posts, comments and reactions, each one either
          composed by you or shown to you for approval before it is sent. We publish nothing you have not seen. We do
          not post as you without that approval, we do not send connection invitations or direct messages on your
          behalf, and we do not collect or store LinkedIn member data beyond what a piece of content you asked us to
          handle contains.
        </P>
        <Muted>
          What we receive from LinkedIn stays with the account that authorised it. It is not combined with data from
          another customer, not used to build any audience or profile, and not passed to anyone. If you disconnect,
          we delete what we hold from that authorisation.
        </Muted>
      </Section>

      <Section title="Who else processes it">
        <P>
          These are the services the software actually uses. Each one sees only what the row says, and none of them
          may use it for their own purposes.
        </P>
        <Rows>
          <Row term="Neon">The database. Rooms, messages and leads, in the European Union.</Row>
          <Row term="Render">The hosting that runs the application.</Row>
          <Row term="OpenAI">Answers a question an agent was asked. Not used for training.</Row>
          <Row term="A scheduling and messaging connector">
            Connects our own Google Calendar and our own WhatsApp number to this application, so a booking can be
            written and a message answered. It sees the booking and the message, and nothing about you beyond what is
            in them.
          </Row>
          <Row term="Google">Calendar, for the meeting itself and for the free/busy check if you authorised one.</Row>
          <Row term="LinkedIn">Sign-in, and page content where you have asked for it.</Row>
          <Row term="Resend">Sends the email that tells us you wrote, when email notification is switched on.</Row>
          <Row term="Chatwoot">
            Only where a room's owner has connected it, so that the people working on that room can answer from their
            own inbox. Off unless connected.
          </Row>
        </Rows>
      </Section>

      <Section title="How long we keep it">
        <P>
          A room and its messages are kept while the work is live and for as long as you might want to come back to
          it. A request to leave a message is kept as the record of an enquiry. Anything read from a calendar you
          connected is never written down at all. Ask us to delete a room or an enquiry and we will, and we will say
          when it is done.
        </P>
      </Section>

      <Section title="What you can ask for">
        <P>
          A copy of what we hold about you, a correction, or its deletion. Write to{" "}
          <Out href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Out>. We answer within a month and usually the
          same week. If you are in the European Union or the United Kingdom you also have the right to complain to
          your data protection authority; in Slovakia, where this business is registered, that is the Office for
          Personal Data Protection.
        </P>
        <P>
          You do not need us to withdraw a connection. Google access is revoked at{" "}
          <Out href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</Out> and LinkedIn
          access at{" "}
          <Out href="https://www.linkedin.com/mypreferences/d/data-sharing-with-third-parties">
            LinkedIn's permitted services settings
          </Out>
          . Both take effect immediately, without telling us first.
        </P>
      </Section>

      <Section title="Changes">
        <P>
          When this page changes the date at the top changes with it. If a change means we start collecting something
          we did not collect before, we will say so here rather than only editing a line.
        </P>
      </Section>
    </LegalPage>
  );
}
