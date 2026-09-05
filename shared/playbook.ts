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

export const SEED_CHANNELS: SeedChannel[] = [
  {
    slug: "conversion-tracking",
    name: "conversion-tracking",
    purpose: "Getting ChatGPT Ads conversions measured properly — the reason you're here.",
    kind: "project",
  },
  {
    slug: "chatgpt-ads",
    name: "chatgpt-ads",
    purpose: "Ask the docs agent anything about OpenAI's ad platform.",
    kind: "agent",
    counterpartKey: "agent:chatgpt-ads",
  },
];

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

/** Opening message posted by the system into #conversion-tracking. */
export const WELCOME_MESSAGE = `**Welcome — this workspace is yours.**

No signup: the link in your address bar *is* your account. Bookmark it, or send it to a colleague to pull them in.

Here's how it works:

- **Ask the agents anything.** \`@chatgpt-ads\` reads the official [ChatGPT Ads developer docs](https://developers.openai.com/ads/) and cites the page it used. \`@tracking\` designs the measurement setup around your stack.
- **Pull in a human** when it gets real — the checklist on the right is the actual conversion-tracking engagement, and every line on it needs a person.
- **Add channels** for anything else: Google Ads, Meta, SEO, a landing page build.

Start by telling us what you're running ads for, and what counts as a conversion.`;
