import type { DoorDef } from "@shared/doors";
import AskWidget from "@/components/site/AskWidget";
import { META_PLAIN, PANEL_CHROME } from "@/components/site/doors/quiet";

/**
 * The door's own chat, reused from the Top-Rated Team door page rather than
 * rewritten with the same words. The door comes from the catalogue, so the
 * agent and the starters are the nonprofit row. Nothing in it is kept: rooms
 * are not this site's any more (shared/rooms-moved.ts), and the door page
 * beside it carries the link to them.
 */
export function DoorChat({ door }: { door: DoorDef }) {
  return (
    <div className={PANEL_CHROME} data-testid="block-adgrant-door-chat">
      <AskWidget door={door} />
      <div className="mt-[var(--s4)] border-t border-border pt-[var(--s2)]">
        <p className={META_PLAIN} data-testid="text-adgrant-panel-promise">
          <span className="text-foreground">Nothing is saved.</span> Close this tab and it is gone.
        </p>
      </div>
    </div>
  );
}
