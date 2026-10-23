import type { Channel } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, CHROME, LABEL, META } from "@/components/workspace/room-style";

export type MobileView = "chat" | "tasks";

export interface ChannelHeaderProps {
  channel: Channel | null;
  memberCount: number;
  doneCount: number;
  taskCount: number;
  /**
   * What the room is doing now and who it is waiting on, from
   * roomNowLine(tasks, members) in server/digest.ts. The third primitive of the
   * recurring-and-digest parcel: it built the sentence and could not mount it,
   * because this file was not its to edit.
   *
   * It replaces the channel's static purpose on a project channel — the purpose
   * says what the channel is FOR, which a reader learns once, where this says
   * what is happening, which changes. On an agent channel the purpose stays,
   * because an agent channel has no tasks and nothing to be waiting on.
   */
  nowLine?: string | null;
  railOpen: boolean;
  mobileView: MobileView;
  onMobileView: (view: MobileView) => void;
  onToggleSidebar: () => void;
  onToggleRail: () => void;
}

/**
 * The line that says which conversation this is. Four icons and a segmented
 * control became four words: the channel, what it is for, and the two toggles
 * a phone needs. Nothing here is a button-shaped object any more.
 */
export function ChannelHeader({
  channel,
  memberCount,
  doneCount,
  taskCount,
  nowLine,
  railOpen,
  mobileView,
  onMobileView,
  onToggleSidebar,
  onToggleRail,
}: ChannelHeaderProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-5 py-3 sm:px-8">
      <button type="button" onClick={onToggleSidebar} className={cn(ACTION_QUIET, "lg:hidden")} data-testid="button-open-sidebar">
        Channels
      </button>

      <h1 className={cn(CHROME, "min-w-0 truncate font-medium")} data-testid="text-channel-name">
        {channel ? (channel.kind === "project" ? `#${channel.name}` : channel.name) : "This room"}
      </h1>

      {nowLine && channel?.kind === "project" ? (
        <p
          className={cn(META, "hidden min-w-0 flex-1 truncate text-muted-foreground md:block")}
          data-testid="text-channel-now"
          title={nowLine}
        >
          {nowLine}
        </p>
      ) : channel?.purpose ? (
        <p className={cn(META, "hidden min-w-0 flex-1 truncate text-muted-foreground md:block")}>{channel.purpose}</p>
      ) : null}

      <span className={cn(META, "ml-auto hidden whitespace-nowrap text-muted-foreground sm:inline")}>
        {memberCount} {memberCount === 1 ? "name" : "names"}
      </span>

      {/* On phones the right rail is a view, not a panel. */}
      <span className={cn(LABEL, "flex items-baseline gap-2 lg:hidden")}>
        <button
          type="button"
          onClick={() => onMobileView("chat")}
          aria-pressed={mobileView === "chat"}
          className={cn(mobileView === "chat" ? "font-medium text-foreground" : "text-muted-foreground")}
          data-testid="button-view-chat"
        >
          Talk
        </button>
        <span aria-hidden="true" className="text-muted-foreground">
          /
        </span>
        <button
          type="button"
          onClick={() => onMobileView("tasks")}
          aria-pressed={mobileView === "tasks"}
          className={cn(mobileView === "tasks" ? "font-medium text-foreground" : "text-muted-foreground")}
          data-testid="button-view-tasks"
        >
          List {doneCount}/{taskCount}
        </button>
      </span>

      <button
        type="button"
        onClick={onToggleRail}
        aria-pressed={railOpen}
        className={cn(ACTION_QUIET, "hidden lg:inline-flex xl:hidden")}
        data-testid="button-toggle-rail"
      >
        {railOpen ? "Hide the panel" : "Show the panel"}
      </button>
    </div>
  );
}

export default ChannelHeader;
