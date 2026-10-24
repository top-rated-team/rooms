/**
 * Where Top-Rated Team's rooms are now.
 *
 * Top-Rated Team's site no longer runs rooms of its own. They are MakeHybrid's
 * Hybrid Rooms, white-labelled as Top-Rated Team's and run from the operator's
 * MakeHybrid account: MakeHybrid's design, MakeHybrid's sign-in, and the
 * two-way WhatsApp, ChatWoot, Slack and ClickUp connections that used to live
 * here.
 *
 * AdGrant.AI's rooms followed. It is a MakeHybrid white label of its own on
 * app.adgrant.ai -- the whole product under its name -- and adgrant.ai is its
 * own application again (docs/ADGRANT-REPLIT.md). So on Top-Rated Team's hosts
 * nothing opens a room here, AdGrant.AI's included: a caller is told where its
 * rooms are, ADGRANT_ROOMS_URL for AdGrant.AI's and HYBRID_ROOMS_URL for ours.
 *
 * The move is still by host. AdGrant.AI's hosts no longer reach this process,
 * but if one were pointed back here it would answer exactly as it did -- that
 * is the rollback, and it needs no build.
 *
 * On Top-Rated Team's hosts every "Open a room" is a plain link to ROOMS_PATH,
 * and the server sends that on to HYBRID_ROOMS_URL (server/rooms-moved.ts), so
 * moving the rooms again is a setting in Render, not a build. An old room
 * address there, /w/<token>, goes to the same place without its token -- or,
 * when the room is one of AdGrant.AI's, to AdGrant.AI's rooms, also without it.
 */
import { ADGRANT_APP_ORIGIN, isAdGrantHost } from "./adgrant-site";

export const ROOMS_PATH = "/rooms";

/** The white label's own host on MakeHybrid, until HYBRID_ROOMS_URL says otherwise. */
export const DEFAULT_HYBRID_ROOMS_URL = "https://rooms.top-rated.team/rooms.html";

/** AdGrant.AI's rooms: its own MakeHybrid white label. */
export const ADGRANT_ROOMS_URL = `${ADGRANT_APP_ORIGIN}/rooms.html`;

/** What the link says wherever it stands. */
export const OPEN_A_ROOM = "Open a room";

/** Whether a request on this host is Top-Rated Team's, whose rooms have moved, rather than AdGrant.AI's, whose have not. */
export function roomsMovedOn(hostname: string | undefined | null): boolean {
  return !isAdGrantHost(hostname);
}
