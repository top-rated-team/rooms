/**
 * Coming back to the page a sign-in started from.
 *
 * Every way in -- LinkedIn, the emailed link -- lands on the front page with
 * ?signin=1 (server/room-account.ts, roomSessionOutcomePath). The front page
 * used to show how it went, from the header's sign-in. Top-Rated Team's pages
 * carry no sign-in any more, so a page that does (the operator's booking
 * page) leaves its own address here first, and the front page, landing with
 * ?signin=1, goes straight back to it.
 *
 * Kept for half an hour, taken once, and only ever a path on this site: an
 * address read out of storage is not somewhere to send anybody else.
 */
const KEY = "tr-signin-return";
const KEEP_MS = 30 * 60_000;

type Stored = { path: string; at: number };

function isOwnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

export function rememberSignInReturn(path: string, now = Date.now()): void {
  if (!isOwnPath(path)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path, at: now } satisfies Stored));
  } catch {
    /* Private mode: the sign-in still works and lands on the front page. */
  }
}

/** The page to go back to, when this is a sign-in landing and one was left; null otherwise. */
export function takeSignInReturn(search: string, now = Date.now()): string | null {
  if (!new URLSearchParams(search).get("signin")) return null;
  let stored: Stored | null = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    stored = raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
  if (!stored || typeof stored.path !== "string" || typeof stored.at !== "number") return null;
  if (now - stored.at > KEEP_MS || now < stored.at) return null;
  return isOwnPath(stored.path) ? stored.path : null;
}
