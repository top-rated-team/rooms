import type { ComponentType } from "react";

import AdGrantDoor from "@/components/site/doors/AdGrantDoor";
import ChatGptAdsBody from "@/components/site/doors/ChatGptAdsBody";
import WhiteLabelBody from "@/components/site/doors/WhiteLabelBody";

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
  /*
   * The second one, and it earns it by the rule above: adgrant.ai is a working
   * tool with 74 pages of its own material behind it, and this is the only door
   * where the thing being sold is software the visitor operates rather than
   * people doing work. It was built by the door-ad-grants-adgrant-ai parcel and
   * sat imported by nothing until this line, because door.tsx was not its file
   * to edit — the handoff it could not apply itself.
   */
  "ad-grants": AdGrantDoor,
  /*
   * White label earns a body because the row is two offers, the old page
   * described one of them in sentences this application cannot stand behind,
   * and a buyer arriving by this name needs four answers the row cannot hold:
   * what is resold, what their client sees, whose name is on the room, and
   * what happens if they stop. The source is the second offer — run this
   * yourself — and it has to be linked, not summarised.
   */
  "white-label": WhiteLabelBody,
};

export function doorBody(doorId: string): ComponentType | undefined {
  return DOOR_BODIES[doorId];
}
