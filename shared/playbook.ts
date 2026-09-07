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
    title: "Install the ChatGPT Ads measurement pixel",
    detail:
      "Base snippet high in <head>, initialised with your pixel ID from Ads Manager, verified firing on a real page load — not in a preview.",
    status: "todo",
    assigneeKey: "human:ihor",
  },
  {
    title: "Wire server-side conversions (Conversions API)",
    detail:
      "Server-to-server events for the conversions that happen after the browser is gone: webhook-confirmed payments, CRM stage changes, refunds.",
    status: "todo",
    assigneeKey: "human:ihor",
  },
  {
    title: "Deduplicate browser and server events",
    detail: "Shared event IDs so one purchase is one conversion, not two.",
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

export function seedFor(door: DoorSeedInput): DoorSeed {
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
