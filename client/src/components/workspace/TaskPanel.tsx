import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Circle, CircleAlert, CircleCheck, CircleDashed, Plus, X } from "lucide-react";
import { AGENT_BY_ID, EXPERT_BY_KEY, type AgentDef, type ExpertDef } from "@shared/roster";
import { TASK_STATUSES, type Member, type Task, type TaskStatus } from "@shared/schema";
import { Avatar, initialsFor, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground border-muted-border",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  blocked: "bg-destructive/10 text-destructive border-destructive/30",
  done: "bg-accent/10 text-accent border-accent/30",
};

const STATUS_ICON: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: CircleDashed,
  blocked: CircleAlert,
  done: CircleCheck,
};

function nextStatus(status: TaskStatus): TaskStatus {
  const index = TASK_STATUSES.indexOf(status);
  return TASK_STATUSES[(index + 1) % TASK_STATUSES.length];
}

interface Assignee {
  initials: string;
  tone: string;
  name: string;
}

function assigneeFor(key: string | null, members: Member[]): Assignee | null {
  if (!key) return null;
  const member = members.find((m) => m.memberKey === key);
  if (member) {
    return { initials: member.initials, tone: toneFor(key, member.kind), name: member.displayName };
  }
  if (key.startsWith("agent:")) {
    const agent: AgentDef | undefined = AGENT_BY_ID[key.slice("agent:".length)];
    if (agent) return { initials: agent.initials, tone: agent.tone, name: agent.name };
  }
  const expert: ExpertDef | undefined = EXPERT_BY_KEY[key];
  if (expert) return { initials: expert.initials, tone: toneFor(key, "expert"), name: expert.name };
  return { initials: initialsFor(key), tone: toneFor(key, "system"), name: key };
}

interface TaskRowProps {
  task: Task;
  members: Member[];
  onUpdate: (id: string, patch: { status?: TaskStatus }) => void;
}

function TaskRow({ task, members, onUpdate }: TaskRowProps) {
  const [open, setOpen] = useState(false);
  const assignee = assigneeFor(task.assigneeKey, members);
  const Icon = STATUS_ICON[task.status];
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="border-b border-card-border last:border-0" data-testid={`task-${task.id}`}>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onUpdate(task.id, { status: nextStatus(task.status) })}
          title={`${STATUS_LABEL[task.status]} — click for ${STATUS_LABEL[nextStatus(task.status)]}`}
          className={cn(
            "hover-elevate active-elevate-2 mt-px inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
            STATUS_TONE[task.status],
          )}
          data-testid={`button-task-status-${task.id}`}
        >
          <Icon className="h-3 w-3" />
          <span className="hidden sm:inline">{STATUS_LABEL[task.status]}</span>
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          data-testid={`button-task-detail-${task.id}`}
        >
          <span
            className={cn(
              "block text-sm leading-snug",
              task.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/50",
            )}
          >
            {task.title}
          </span>
          {task.detail ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Chevron className="h-3 w-3" />
              {open ? "Hide detail" : "What this involves"}
            </span>
          ) : null}
        </button>

        {assignee ? (
          <Avatar initials={assignee.initials} tone={assignee.tone} size="sm" title={assignee.name} className="mt-px" />
        ) : (
          <span className="mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
            ?
          </span>
        )}
      </div>

      {open && task.detail ? (
        <p className="px-3 pb-3 text-xs leading-relaxed text-muted-foreground">{task.detail}</p>
      ) : null}
    </li>
  );
}

export interface TaskPanelProps {
  tasks: Task[];
  members: Member[];
  onCreate: (title: string) => void;
  onUpdate: (id: string, patch: { status?: TaskStatus }) => void;
  className?: string;
}

export function TaskPanel({ tasks, members, onCreate, onUpdate, className }: TaskPanelProps) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const done = useMemo(() => tasks.filter((t) => t.status === "done").length, [tasks]);
  const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  const commit = useCallback(() => {
    const value = title.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    onCreate(value);
    setTitle("");
    setAdding(false);
  }, [onCreate, title]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setTitle("");
        setAdding(false);
      }
    },
    [commit],
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)} data-testid="panel-tasks">
      <div className="shrink-0 px-3 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Conversion tracking</h2>
          <span className="text-xs text-muted-foreground" data-testid="text-task-progress">
            {done} of {tasks.length} done
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Every line here needs a decision or a hand on a live system. There is no magic: just expertise, dedicated
          hours, and a systematic approach.
        </p>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <ul className="border-y border-card-border">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} members={members} onUpdate={onUpdate} />
          ))}
          {tasks.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              No tasks yet. Add the first thing that has to happen.
            </li>
          ) : null}
        </ul>

        {adding ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              placeholder="Task title"
              aria-label="Task title"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-new-task"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setTitle("");
                setAdding(false);
              }}
              className="hover-elevate active-elevate-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cancel</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="hover-elevate active-elevate-2 flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted-foreground"
            data-testid="button-add-task"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Add task
          </button>
        )}
      </div>
    </div>
  );
}

export default TaskPanel;
