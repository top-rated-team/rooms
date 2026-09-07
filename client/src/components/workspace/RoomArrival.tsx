import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, LABEL, READ } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * THE FIRST MINUTE.
 *
 * A visitor presses Keep on a door and arrives here, and this is the first time
 * they have seen a channel list, a member rail or a task panel. Until now the
 * room answered that with a seeded welcome message four paragraphs long, in a
 * channel the router does not necessarily land them in, listing three things
 * they could do and asking them to describe their business.
 *
 * This says four things instead, in the order somebody actually needs them:
 *
 *   1. What is already here — their own question and its answer, so the room is
 *      recognisably the conversation they just had and not a new product.
 *   2. That the address is the whole account, said next to the strip that
 *      carries it.
 *   3. That nobody has been told this exists. It is the true state of a new
 *      room, and every other surface implied the opposite: four names in the
 *      rail, all of them marked online, none of them notified.
 *   4. One thing to do next, which is to type.
 *
 * It is not a tour, there is no second button, and it can be dismissed for
 * good. The room behind it is fully usable with this panel closed — that is the
 * test of whether it was honest to show it at all.
 * ------------------------------------------------------------------------- */

export interface RoomArrivalProps {
  /** True when the visitor arrived with a conversation, which is the usual way. */
  hasQuestion: boolean;
  /** Puts the cursor in the composer. The only action on this panel. */
  onStart: () => void;
  /** Closes it for this room, on this device, for good. */
  onDismiss: () => void;
  className?: string;
}

export function RoomArrival({ hasQuestion, onStart, onDismiss, className }: RoomArrivalProps) {
  return (
    <section className={cn("border-b border-border pb-7", className)} data-testid="room-arrival">
      <h2 className={LABEL}>The room</h2>

      <p className={cn(READ, "mt-3 text-foreground")}>
        {hasQuestion
          ? "The question you asked on the way in is here, with the answer and the pages it came from."
          : "This room is empty, and it is yours."}
      </p>

      <p className={cn(READ, "mt-3 text-muted-foreground")}>
        Nobody has been told this room exists. Agents answer when you write to them; a person joins when you ask.
        Nothing here posts anywhere by itself.
      </p>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <button type="button" onClick={onStart} className={ACTION} data-testid="button-arrival-start">
          Say what you are working on
        </button>
        <button type="button" onClick={onDismiss} className={ACTION_QUIET} data-testid="button-arrival-dismiss">
          Hide this
        </button>
      </div>
    </section>
  );
}

export default RoomArrival;
