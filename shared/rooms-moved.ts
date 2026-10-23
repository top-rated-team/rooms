/**
 * Where Top-Rated Team's rooms are now.
 *
 * Top-Rated Team's site no longer runs rooms of its own. They are MakeHybrid's
 * Hybrid Rooms, white-labelled as Top-Rated Team's and run from the operator's
 * MakeHybrid account: MakeHybrid's design, MakeHybrid's sign-in, and the
 * two-way WhatsApp, ChatWoot, Slack and ClickUp connections that used to live
 * here.
 *
 * AdGrant.AI is the exception, by the owner's decision: its rooms stay in this
 * application and answer on its own hosts (app.adgrant.ai; see
 * shared/adgrant-site.ts and docs/ADGRANT-REPLIT.md). So the move is by host:
 * on an AdGrant host nothing here changes anything.
 *
 * On Top-Rated Team's hosts every "Open a room" is a plain link to ROOMS_PATH,
 * and the server sends that on to HYBRID_ROOMS_URL (server/rooms-moved.ts), so
 * moving the rooms again is a setting in Render, not a build. An old room
 * address there, /w/<token>, goes to the same place without its token -- or,
 * when the room is one of AdGrant.AI's, to that room on app.adgrant.ai.
 */
import { isAdGrantHost } from "./adgrant-site";

export const ROOMS_PATH = "/rooms";

/** The white label's own host on MakeHybrid, until HYBRID_ROOMS_URL says otherwise. */
export const DEFAULT_HYBRID_ROOMS_URL = "https://rooms.top-rated.team/rooms.html";

/** What the link says wherever it stands. */
export const OPEN_A_ROOM = "Open a room";

/** Whether a request on this host is Top-Rated Team's, whose rooms have moved, rather than AdGrant.AI's, whose have not. */
export function roomsMovedOn(hostname: string | undefined | null): boolean {
  return !isAdGrantHost(hostname);
}
