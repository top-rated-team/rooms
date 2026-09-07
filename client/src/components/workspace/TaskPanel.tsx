import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { AGENT_BY_ID, EXPERT_BY_KEY, type AgentDef, type ExpertDef } from "@shared/roster";
import { TASK_STATUSES, type Member, type Task, type TaskStatus } from "@shared/schema";
import { Avatar, initialsFor, toneFor } from "@/components/workspace/Avatar";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, CHROME, FOCUS, LABEL, META } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * The checklist, restyled to the room's three sizes and no colour.
 *
 * A status used to be a coloured pill — blue for in progress, red for blocked,
 * green for done — which is four more colours than this room has. It is now the
 * word itself: soft ink for a thing nobody has started, ink for a thing that is
 * moving or stuck, and a struck-through title for a thing that is finished.
 * Clicking it still cycles, and the title still says what the next click does.
 *
 * The progress bar is gone. In its place the count is written out and the rule
 * under the heading is inked as far as the work has got — a rule, not a box,
 * and it carries no colour of its own.
 * ------------------------------------------------------------------------- */

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
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
    if (agent) return { initials: agent.initials, tone: toneFor(key, "agent"), name: agent.name };
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
  const started = task.status !== "todo";

  return (
    <li className="border-t border-border py-3" data-testid={`task-${task.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={() => onUpdate(task.id, { status: nextStatus(task.status) })}
          title={`${STATUS_LABEL[task.status]} — click for ${STATUS_LABEL[nextStatus(task.status)]}`}
          className={cn(LABEL, FOCUS, "shrink-0", started && "font-medium text-foreground")}
          data-testid={`button-task-status-${task.id}`}
        >
          {STATUS_LABEL[task.status]}
        </button>
        {assignee ? (
          <Avatar initials={assignee.initials} tone={assignee.tone} size="sm" title={assignee.name} />
        ) : (
          <span className={cn(META, "shrink-0 text-muted-foreground")} title="Nobody yet">
            —
          </span>
        )}
      </div>

      {/* The title used to be a button that opened the detail, with a second
          button under it that did the same thing. One action, one control. */}
      <p
        className={cn(
          CHROME,
          "mt-1",
          task.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/60",
        )}
      >
        {task.title}
      </p>

      {task.detail ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(ACTION_QUIET, "mt-1.5 normal-case tracking-normal")}
          data-testid={`button-task-detail-${task.id}`}
        >
          {open ? "Hide detail" : "What this involves"}
        </button>
      ) : null}

      {open && task.detail ? <p className={cn(META, "mt-1.5 text-muted-foreground")}>{task.detail}</p> : null}
    </li>
  );
}

export interface TaskPanelProps {
  tasks: Task[];
  members: Member[];
  /**
   * What this checklist is for, in the room's own words. It used to be the
   * words "Conversion tracking" typed into this file, which was wrong in every
   * room opened through any door but one.
   */
  title?: string;
  onCreate: (title: string) => void;
  onUpdate: (id: string, patch: { status?: TaskStatus }) => void;
  className?: string;
}

export function TaskPanel({ tasks, members, title = "What has to happen", onCreate, onUpdate, className }: TaskPanelProps) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const done = useMemo(() => tasks.filter((t) => t.status === "done").length, [tasks]);
  const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  const commit = useCallback(() => {
    const next = value.trim();
    if (!next) {
      setAdding(false);
      return;
    }
    onCreate(next);
    setValue("");
    setAdding(false);
  }, [onCreate, value]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setValue("");
        setAdding(false);
      }
    },
    [commit],
  );

  return (
    <div className={cn("px-4 py-4", className)} data-testid="panel-tasks">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={LABEL}>{title}</h2>
          <span className={cn(META, "text-muted-foreground")} data-testid="text-task-progress">
            {done} of {tasks.length} done
          </span>
        </div>
        {/* The bar was a filled green rectangle. It is a rule now, inked as far
            as the work has got, and it borrows no colour to say so. */}
        <div className="mt-2 h-px w-full bg-border" aria-hidden="true">
          <div className="h-px bg-foreground transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <p className={cn(META, "mt-2 text-muted-foreground")}>
          Every line here needs a decision or a hand on a live system. There is no magic: just expertise, dedicated
          hours, and a systematic approach.
        </p>
      </div>

      <div className="mt-3">
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} members={members} onUpdate={onUpdate} />
          ))}
          {tasks.length === 0 ? (
            <li className={cn(META, "border-t border-border py-3 text-muted-foreground")}>
              Nothing on the list yet. Add the first thing that has to happen.
            </li>
          ) : null}
        </ul>

        {adding ? (
          <div className="mt-3 flex items-baseline gap-3 border-b border-foreground pb-1">
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              placeholder="What has to happen"
              aria-label="Task title"
              className={cn(CHROME, "min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground")}
              data-testid="input-new-task"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue("");
                setAdding(false);
              }}
              className={ACTION_QUIET}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(ACTION_QUIET, "mt-3")}
            data-testid="button-add-task"
          >
            Add a line
          </button>
        )}
      </div>
    </div>
  );
}

export default TaskPanel;
