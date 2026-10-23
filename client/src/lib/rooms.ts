/**
 * The one name under which this browser remembers its rooms, and the shape it
 * remembers them in.
 *
 * It lives here rather than in use-workspace.ts because two very different
 * places read it: the room, which imports the whole workspace chunk anyway,
 * and the site's header, which must not — that chunk is 195KB and the landing
 * page is what paid traffic downloads. RoomMenu carried its own copy of this
 * string for a wave, with a comment admitting it; a renamed key would have
 * emptied the menu and thrown nothing.
 */
export const ROOMS_STORAGE_KEY = "tr-workspaces";

export interface StoredWorkspace {
  token: string;
  name: string;
  lastSeen: string;
}
