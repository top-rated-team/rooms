import { Bot, Hash, ListChecks, Menu, MessageSquare, PanelRight, User } from "lucide-react";
import type { Channel } from "@shared/schema";
import { cn } from "@/lib/utils";

export type MobileView = "chat" | "tasks";

export interface ChannelHeaderProps {
  channel: Channel | null;
  memberCount: number;
  doneCount: number;
  taskCount: number;
  railOpen: boolean;
  mobileView: MobileView;
  onMobileView: (view: MobileView) => void;
  onToggleSidebar: () => void;
  onToggleRail: () => void;
}

const ICON_BUTTON =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-transparent h-9 w-9";

export function ChannelHeader({
  channel,
  memberCount,
  doneCount,
  taskCount,
  railOpen,
  mobileView,
  onMobileView,
  onToggleSidebar,
  onToggleRail,
}: ChannelHeaderProps) {
  const Icon = channel?.kind === "agent" ? Bot : channel?.kind === "dm" ? User : Hash;

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-3">
      <button type="button" onClick={onToggleSidebar} className={cn(ICON_BUTTON, "lg:hidden")} data-testid="button-open-sidebar">
        <Menu />
        <span className="sr-only">Open channels</span>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <h1 className="truncate text-sm font-semibold" data-testid="text-channel-name">
          {channel ? channel.name : "Workspace"}
        </h1>
        {channel?.purpose ? (
          <>
            <span className="hidden h-4 w-px bg-border md:block" />
            <p className="hidden truncate text-xs text-muted-foreground md:block">{channel.purpose}</p>
          </>
        ) : null}
      </div>

      <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
        {memberCount} {memberCount === 1 ? "member" : "members"}
      </span>

      {/* On phones the right rail is a tab, not a panel. */}
      <div className="flex items-center rounded-md border border-card-border p-0.5 lg:hidden">
        <button
          type="button"
          onClick={() => onMobileView("chat")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium",
            mobileView === "chat" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover-elevate",
          )}
          data-testid="button-view-chat"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </button>
        <button
          type="button"
          onClick={() => onMobileView("tasks")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium",
            mobileView === "tasks" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover-elevate",
          )}
          data-testid="button-view-tasks"
        >
          <ListChecks className="h-3.5 w-3.5" />
          {doneCount}/{taskCount}
        </button>
      </div>

      <button
        type="button"
        onClick={onToggleRail}
        aria-pressed={railOpen}
        className={cn(ICON_BUTTON, "hidden lg:inline-flex xl:hidden")}
        data-testid="button-toggle-rail"
      >
        <PanelRight />
        <span className="sr-only">{railOpen ? "Hide tasks" : "Show tasks"}</span>
      </button>
    </div>
  );
}

export default ChannelHeader;
