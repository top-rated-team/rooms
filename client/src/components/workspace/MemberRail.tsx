import { useMemo } from "react";
import { UserPlus } from "lucide-react";
import { AGENT_BY_ID, type AgentDef } from "@shared/roster";
import type { Member } from "@shared/schema";
import { Avatar, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";

const KIND_ORDER: Record<string, number> = { visitor: 0, expert: 1, agent: 2, system: 3 };

function roleFor(member: Member): string {
  if (member.role) return member.role;
  if (member.kind === "agent") {
    const agent: AgentDef | undefined = AGENT_BY_ID[member.memberKey.replace(/^agent:/, "")];
    if (agent) return agent.title;
  }
  if (member.kind === "visitor") return "You";
  return "";
}

export interface MemberRailProps {
  members: Member[];
  onInvite: () => void;
  onOpenDm: (memberKey: string) => void;
  className?: string;
}

export function MemberRail({ members, onInvite, onOpenDm, className }: MemberRailProps) {
  const ordered = useMemo(
    () =>
      [...members]
        .filter((m) => m.kind !== "system")
        .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.displayName.localeCompare(b.displayName)),
    [members],
  );

  return (
    <div className={cn("shrink-0 px-3 py-3", className)} data-testid="rail-members">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">In this workspace</h2>
        <span className="text-xs text-muted-foreground">{ordered.length}</span>
      </div>

      <ul className="mt-2 space-y-0.5">
        {ordered.map((member) => {
          const isHuman = member.kind === "expert";
          const role = roleFor(member);
          return (
            <li key={member.memberKey}>
              <button
                type="button"
                onClick={() => isHuman && onOpenDm(member.memberKey)}
                disabled={!isHuman}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left",
                  isHuman ? "hover-elevate active-elevate-2" : "cursor-default",
                )}
                data-testid={`member-${member.memberKey}`}
              >
                <Avatar
                  initials={member.initials}
                  tone={toneFor(member.memberKey, member.kind)}
                  size="sm"
                  presence={member.kind === "agent" ? null : member.presence}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{member.displayName}</span>
                    {member.kind === "agent" ? (
                      <span className="shrink-0 rounded border border-primary-border bg-primary/10 px-1 text-[9px] font-semibold uppercase leading-4 text-primary">
                        AI
                      </span>
                    ) : null}
                  </span>
                  {role ? <span className="block truncate text-[11px] text-muted-foreground">{role}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onInvite}
        className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 bg-secondary text-secondary-foreground border border-secondary-border min-h-8 px-3 mt-3"
        data-testid="button-rail-invite"
      >
        <UserPlus />
        Invite an expert
      </button>
    </div>
  );
}

export default MemberRail;
