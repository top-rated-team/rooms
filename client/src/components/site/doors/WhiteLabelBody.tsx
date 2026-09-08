import { HEADING, LINK, META_PLAIN, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { DOOR_BY_ID } from "@shared/doors";
import { GITHUB_URL } from "@shared/roster";

/* ---------------------------------------------------------------------------
 * THE WHITE-LABEL DOOR'S OWN PAGE.
 *
 * The row in shared/doors.ts already names two offers in a blurb. This is the
 * rest of what a buyer asks before either one is real: what is actually resold,
 * what their client sees and does not, whose name is on the room, and what
 * happens if they stop. The old page at top-rated.team/white-label is the
 * source of the first offer's shape, and it is not the source of these
 * sentences — docs/specs/white-label.md §4.2 lists the claims this application
 * cannot stand behind. Do not restore:
 *
 *   "For Marketing Agencies"
 *   "Scale your agency without hiring"
 *   "Why Agencies Choose Us"
 *   "How We Work Together" as an agency-only address
 *   "your agency's Google Ads fulfillment needs"
 *   "your agency's needs, client portfolio"
 *   "dedicated team members assigned to your agency's portfolio"
 *   "White-Label Google Ads Partnership"
 *   "current challenges with Google Ads fulfillment"
 *   "with 24/7 availability" / "24/7 Availability" / "we're always online"
 *   "almost 24/7"
 *   "No minimum commitment required"
 *   "Flexible hourly or project-based pricing"
 *   "Flexible engagement: hourly, project-based, or retainer"
 *   "Transparent pricing with no hidden fees"
 *   "Your clients never know we exist" as an unqualified promise
 *   "With offices in Prague, Kyiv, and Madeira across 3 time zones"
 *   office cards ("Primary Office", "Development Hub", "Operations")
 *   "Top 10%" / "Google Partner"
 *   "Official Google Ads trainers for Barcelona & Lisbon"
 *   "100%" Job Success / "5,872+ hours" / "8+" Years / "<24h" Response Time
 *   "30 min" / "1-2 days" / "2-4 weeks" / "Ongoing"
 *   "within hours, not days" / "We respond within 24 hours"
 *   "Dedicated Account Manager" / "A single point of contact" / "Dedicated Support"
 *   "Slack, Asana, Monday, ClickUp - we use what you use"
 *   "We join your project management tools, Slack/Teams channels"
 *   "set up secure access to client accounts as needed"
 *   "NDA available upon request"
 *   "References from agency partners"
 *   "Schedule Partnership Call" / "Schedule Free Consultation"
 *   "Free audit and consultation available"
 *   "Ready to Scale?"
 *
 * The fork claims agree with docs/fork-and-partners.md: a copy you run is free,
 * nothing phones home, there is no commission and no licence key, and what is
 * paid for is help at the published prices. The repository is the fork target.
 * shared/roster.ts says it is private at the time of writing, so this page
 * does not call it public.
 *
 * Nothing here is a claim this repository cannot stand behind. There is no
 * agent on this door, no self-service setup page, and no form pretending to
 * be onboarding. A figure for the work is the price row further down, from
 * shared/pricing.ts — it is not printed a second time here.
 * ------------------------------------------------------------------------- */

const DOOR = DOOR_BY_ID["white-label"];

interface Fact {
  title: string;
  body: string;
}

const FACTS: Fact[] = [
  {
    title: "What is actually resold",
    body: "Two things, and they are not the same sale. The first is the work this company already does — whichever of our services you would have us behind, not Google Ads only — delivered under your brand. You carry the client. You set what they pay. You buy our part at the published prices. The second is this application, running as yours, with your own set of services rather than ours. That copy is free to run. What is paid for is help: standing it up, writing a door, or sitting in one of its rooms as the expert.",
  },
  {
    title: "What your client sees, and does not",
    body: "On the work: they see your brand on the deliverables. They do not see our name, our invoice, or a room of ours. We answer to you. On a copy you run: their rooms print your legal name, your terms, your invoice line and your support address. Ours is nowhere in that product. Direct contact with your client is not the default, and it is not a language service advertised here. Whether you tell them we exist is yours; it is not something this page polices.",
  },
  {
    title: "Whose name is on the room",
    body: `A room opened through this door is the conversation between you and us. The name in its footer is the name on the contract: ${DOOR.contract.invoiceLine} That invoice is yours, not your client's. Your client is on your contract and receives your invoice. If they later sit in a room on a copy you run, that room prints your name, not ours.`,
  },
  {
    title: "If you stop",
    body: "The work we were doing behind your name stops. Your client stays yours; we were never on their paper. A copy you already run keeps running. Nothing in it phones home, there is no licence key, and there is no switch here that turns it off. What we can withdraw is our own services from your catalogue, and our support — not the software.",
  },
];

export function WhiteLabelBody() {
  return (
    <>
      <section id="white-label-what" className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>Two offers. Four questions before either one is real.</h2>
          <div>
            <p className={READ_MUTED}>
              One is us doing the work behind your name. The other is this application running as yours. Agencies use
              both. So do teams that are not agencies. There is no assistant on this page, and no form that starts an
              arrangement. What it looks like depends on whose clients they are, whose paper the work is on, and which
              of your services we would be behind — that is a conversation with a person.
            </p>
          </div>
        </div>

        <ol className="mt-[var(--s5)]">
          {FACTS.map((fact, index) => (
            <li
              key={fact.title}
              data-testid="item-white-label-fact"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,26ch)_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${HEADING} lg:col-start-2`}>{fact.title}</h3>
              <p className="type-body text-muted-foreground lg:col-start-3 lg:row-start-1">{fact.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="white-label-source" className={`${PAGE} pt-[var(--s6)]`}>
        <div className="grid gap-[var(--s4)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h2 className={HEADING}>Run this yourself.</h2>
          <div>
            <p className={READ_MUTED}>
              The source is the repository. It is the fork target. A copy you run on your own hosting is free: no
              commission, nothing to report back, no licence key. Help is what the prices further down this page are
              for.
            </p>
            <p className={`mt-[var(--s3)] ${READ}`}>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-white-label-source"
                className={LINK}
              >
                {GITHUB_URL.replace(/^https:\/\//, "")}
              </a>
            </p>
            <p className={`mt-[var(--s2)] ${META_PLAIN}`}>
              The repository has not been published for visitors yet. If the link does not open, that is why. The
              address is the fork target either way.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

export default WhiteLabelBody;
