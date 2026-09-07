import type { ComponentType } from "react";

import ChatGptAdsBody from "@/components/site/doors/ChatGptAdsBody";

/**
 * The one exception to "a door is a row and nothing else".
 *
 * Every word on a door page is read out of shared/doors.ts, and that is what
 * makes seven offers cost roughly what one offer costs. One door has more than
 * a row's worth to say: the ChatGPT Ads door is the offer this site was built
 * to sell, it has been running longest, and it carries the argument that used
 * to be the whole home page. Rather than growing the row into a page-shaped
 * object that six doors would leave empty, that door gets a section of its own
 * and the other six get nothing.
 *
 * The rule for adding a second one: a door earns a body when it has something
 * to say that is true of it and of no other door, and that a person would read
 * before deciding. A restatement of the blurb is not that.
 *
 * A missing key is the normal case, not an error. A door with no body renders
 * the row and stops, which is the whole page for six of the seven.
 */
export const DOOR_BODIES: Record<string, ComponentType> = {
  "chatgpt-ads": ChatGptAdsBody,
};

export function doorBody(doorId: string): ComponentType | undefined {
  return DOOR_BODIES[doorId];
}
