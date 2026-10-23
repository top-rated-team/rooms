import { OPEN_A_ROOM, ROOMS_PATH } from "@shared/rooms-moved";

export interface RoomsLinkProps {
  /** The classes of the place it stands in -- loud, quiet, or a nav link. */
  className: string;
  /** Distinct per place: the same link rendered twice must not share one id. */
  testId: string;
}

/**
 * "Open a room", as a link and nothing more. Rooms are MakeHybrid's Hybrid
 * Rooms now, under Top-Rated Team's name, with their own design and their own
 * sign-in: this site neither opens a room nor signs anybody in for one. A
 * plain <a> and not the router's Link, because /rooms is the server's, which
 * sends it on to wherever the rooms are (server/rooms-moved.ts).
 */
export function RoomsLink({ className, testId }: RoomsLinkProps) {
  return (
    <a href={ROOMS_PATH} className={className} data-testid={testId}>
      {OPEN_A_ROOM}
    </a>
  );
}

export default RoomsLink;
