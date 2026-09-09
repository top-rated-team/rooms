/**
 * What a brand-new workspace looks like the moment a visitor lands in it:
 * the channels, the human/agent line-up, and the conversion-tracking checklist
 * that turns a vague enquiry into a scoped piece of work.
 */

import type { TaskStatus } from "./schema";

export interface SeedChannel {
  slug: string;
  name: string;
  purpose: string;
  kind: "project" | "agent";
  counterpartKey?: string;
}

/**
 * WHAT A ROOM IS SEEDED WITH DEPENDS ON THE DOOR IT WAS OPENED THROUGH.
 *
 * It did not, and that was the worst defect in this product. Every room got
 * #conversion-tracking, the ChatGPT Ads agent, the Conversion Tracking agent,
 * Ihor and Dan, and a six-line checklist about measuring ChatGPT Ads
 * conversions — whichever door the visitor came through.
 *
 * So a charity arriving through Google Ad Grants was told the checklist on the
 * right was its conversion-tracking engagement. And a client arriving through
 * the PARTNER's door landed in a room staffed by Top-Rated Team's people, on
 * Top-Rated Team's services, with the member rail printing an accountability
 * line naming the partner as the payer of our contractor. That last one is not
 * untidy, it is false, and it is false about money in the one place the design
 * exists to be trustworthy about money.
 *
 * The rule now: a room seeds OUR people and OUR agents only when the door is
 * ours. A partner's room gets a project channel and the visitor, and nothing
 * else — their people are theirs to add, and the room footer already prints
 * whose terms and whose invoice apply.
 */
export interface DoorSeedInput {
  id: string;
  slug: string;
  headline: string;
  firstAgentId: string | null;
  /** True when Top-Rated Team contracts and invoices this work. */
  ours: boolean;
}

export interface DoorSeed {
  channels: SeedChannel[];
  /** Empty for every door but the one whose checklist has been written. */
  tasks: SeedTask[];
  /** Member keys of our own people. Empty on a partner's door. */
  expertIds: string[];
}

export interface SeedTask {
  title: string;
  detail: string;
  status: TaskStatus;
  assigneeKey: string;
}

/**
 * The real conversion-tracking engagement, as a checklist. It doubles as the
 * honest answer to "what am I actually paying a human for?" — every line here
 * needs a decision or a hand on a live system.
 */
export const CONVERSION_TRACKING_TASKS: SeedTask[] = [
  {
    title: "Map the funnel to conversion events",
    detail:
      "Decide which actions count, which one is the money event, and which are upstream signals. Wrong here and every downstream number is decoration.",
    status: "todo",
    assigneeKey: "agent:conversion-tracking",
  },
  {
    title: "Install the measurement pixel or tag on every platform you buy on",
    detail:
      "The ChatGPT Ads base snippet high in <head>, and the Google tag, Meta pixel or LinkedIn insight tag as each applies — each initialised with your own ID from its own Ads Manager, and each verified firing on a real page load rather than in a preview.",
    status: "todo",
    assigneeKey: "human:ihor",
  },
  {
    title: "Wire server-side conversions on each platform",
    detail:
      "Server-to-server events for the conversions that happen after the browser is gone: webhook-confirmed payments, CRM stage changes, refunds. Each platform has its own road in — the ChatGPT Ads and Meta Conversions APIs, Google's offline conversion imports and enhanced conversions, LinkedIn's conversions API — and they do not accept the same payload.",
    status: "todo",
    assigneeKey: "human:ihor",
  },
  {
    title: "Deduplicate browser and server events",
    detail:
      "Shared event IDs so one purchase is one conversion, not two — agreed once and used by both halves on every platform, because each one deduplicates on its own key and the first event received wins.",
    status: "todo",
    assigneeKey: "human:ihor",
  },
  {
    title: "Handle consent and regional rules",
    detail: "Consent gating that keeps legal happy without silently deleting half your conversions.",
    status: "todo",
    assigneeKey: "human:ihor",
  },
  {
    title: "Verify end to end and hand over documentation",
    detail:
      "Test conversions visible in Ads Manager, a written map of what fires where, and a rollback note for whoever touches the site next.",
    status: "todo",
    assigneeKey: "human:dan",
  },
];

/*
 * WELCOME_MESSAGE is gone, not moved. It was posted into the project channel at
 * seed time and said, in four paragraphs, what client/src/components/workspace/
 * RoomArrival.tsx now says in two — including the link-is-your-account fact,
 * which the address strip above it also states. Three tellings of one thing, in
 * one viewport, before the room had shown a visitor anything working.
 *
 * It was also the last place the seed hard-coded conversion tracking into every
 * room regardless of the door: it told a charity arriving through Ad Grants that
 * "the checklist on the right is the actual conversion-tracking engagement".
 */

/**
 * The room opened from the home page, which belongs to no door.
 *
 * It used to be seeded as a chatgpt-ads room, because storage falls back to the
 * default door for anything unstamped — so a visitor who pressed "Open a room"
 * on the front page arrived to a CONVERSION-TRACKING CHECKLIST they had not
 * asked for, and to a room called "Conversion tracking". That is the same
 * defect this file's own header describes about Ad Grants rooms, arriving by a
 * different route.
 *
 * A general room gets a place to write and the lawyer, and nothing pretending
 * to know what the work is. What it is for is decided by the person in it.
 */
export const GENERAL_ROOM_ID = "general";

export function seedFor(door: DoorSeedInput): DoorSeed {
  if (door.id === GENERAL_ROOM_ID) {
    return {
      channels: [
        {
          slug: "room",
          name: "room",
          purpose: "Say what you are working on. Whichever agent or person it needs can be brought in here.",
          kind: "project",
        },
        {
          slug: "ask-legal",
          name: "ask-legal",
          purpose:
            "What the platforms and regulators actually publish about automation, outreach, consent and advertising — and which tier a piece of work falls in.",
          kind: "agent",
          counterpartKey: "agent:legal",
        },
      ],
      tasks: [],
      expertIds: ["ihor", "dan"],
    };
  }

  const project: SeedChannel = {
    slug: door.slug,
    name: door.slug,
    purpose: door.headline,
    kind: "project",
  };

  if (!door.ours) {
    /*
     * A partner's room. One channel, the visitor, and nothing of ours: no
     * agent of ours answers in their room and no contractor of ours is
     * listed in it. Their side adds their own people.
     */
    return { channels: [project], tasks: [], expertIds: [] };
  }

  const channels: SeedChannel[] = [project];
  if (door.firstAgentId) {
    /*
     * `ask-` prefixed, because on several doors the agent's id IS the door's
     * slug — ad-grants, chatgpt-ads — and naming both channels the same thing
     * produced two channels with one slug in the same room. Anything that looks
     * a channel up by slug then has two answers, which is the kind of defect
     * that surfaces as a link going to the wrong place weeks later.
     */
    channels.push({
      slug: `ask-${door.firstAgentId}`,
      name: `ask-${door.firstAgentId}`,
      purpose: "Ask this door's agent anything it can answer from its own documentation.",
      kind: "agent",
      counterpartKey: `agent:${door.firstAgentId}`,
    });
  }

  /*
   * THE LAWYER IS IN EVERY ROOM OF OURS, on the owner's instruction, and it is
   * the one agent on the roster that is not tied to a door.
   *
   * The reason it belongs everywhere is that the question belongs everywhere.
   * "Are we allowed to do this" arrives in a paid-ads room about a competitor's
   * trademark, in an Ad Grants room about the policy that keeps the grant, and
   * in a LinkedIn room about automated invitations. Putting it only on the door
   * whose tier is named after it would mean the client with the question has to
   * already know which door their question is behind.
   *
   * Not in a partner's room, and that is the same rule as everything else
   * above: nothing of ours is seeded into a room another company invoices. The
   * return above has already left with one channel by the time this runs.
   */
  channels.push({
    slug: "ask-legal",
    name: "ask-legal",
    purpose:
      "What the platforms and regulators actually publish about automation, outreach, consent and advertising — and which tier a piece of work falls in.",
    kind: "agent",
    counterpartKey: "agent:legal",
  });

  /*
   * google-ads-dev and linkedin-dev are not seeded. They sit on AGENTS, so
   * they are already reachable in every room via @mention — including every
   * Google Ads, paid ads and custom-AI (dev) room. Seeding would add a
   * channel and a member row per room, and the only house-wide seeded agent
   * is the lawyer above. They arrive when somebody asks, the way
   * shopping-feed does.
   */

  /*
   * ONE DOOR HAS A WRITTEN CHECKLIST, and the others get none rather than that
   * one. An empty checklist is a room waiting to be filled; a checklist about
   * somebody else's engagement is a room telling the client the wrong thing.
   * Each remaining door needs its own, written by whoever knows that work —
   * that is content, not code, and inventing it here would repeat the mistake
   * this function was written to fix.
   */
  const tasks = door.id === "chatgpt-ads" ? CONVERSION_TRACKING_TASKS : [];

  /*
   * Our two are seeded on our own doors because a room with nobody in it reads
   * as a demo. On a partner's door they are seeded by nobody.
   */
  return { channels, tasks, expertIds: ["ihor", "dan"] };
}
