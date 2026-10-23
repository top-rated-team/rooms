/**
 * Where rooms are now.
 *
 * This site no longer runs rooms of its own. They are MakeHybrid's Hybrid
 * Rooms, white-labelled as Top-Rated Team's and run from the operator's
 * MakeHybrid account: MakeHybrid's design, MakeHybrid's sign-in, and the
 * two-way WhatsApp, ChatWoot, Slack and ClickUp connections that used to
 * live here.
 *
 * Every "Open a room" on this site is a plain link to ROOMS_PATH, and the
 * server sends that on to HYBRID_ROOMS_URL (server/rooms-moved.ts). Moving
 * the rooms to another address is therefore a setting in Render, not a
 * build. The old room addresses, /w/<token>, go to the same place: the
 * token meant something here and means nothing there, so it is not passed on.
 */
export const ROOMS_PATH = "/rooms";

/** The white label's own host on MakeHybrid, until HYBRID_ROOMS_URL says otherwise. */
export const DEFAULT_HYBRID_ROOMS_URL = "https://rooms.top-rated.team/rooms.html";

/** What the link says wherever it stands. */
export const OPEN_A_ROOM = "Open a room";
