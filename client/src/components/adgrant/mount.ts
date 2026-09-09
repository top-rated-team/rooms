/**
 * Where this front is mounted in this application.
 *
 * client/index.html is the one head this process serves, so AdGrant.AI cannot
 * be a second site with its own title until the owner edits that frozen file.
 * This path is the product's own root until then. When the front moves to its
 * own host, this becomes "" and the route in App.tsx becomes "/".
 *
 * Internal links in this tree must go through this constant. They must not
 * point at "/" — that is the other product's home.
 */
export const ADGRANT_MOUNT = "/adgrant";
