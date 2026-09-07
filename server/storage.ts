import { asc, eq } from "drizzle-orm";
import { customAlphabet, nanoid } from "nanoid";
import {
  channels,
  leads,
  members,
  messages,
  tasks,
  workspaces,
  type Channel,
  type ChannelKind,
  type Lead,
  type Member,
  type MemberKind,
  type Message,
  type Presence,
  type Task,
  type TaskStatus,
  type Workspace,
} from "@shared/schema";
import type { WorkspaceState } from "@shared/api";
import { AGENT_BY_ID, EXPERTS } from "@shared/roster";
import { seedFor } from "@shared/playbook";
import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";
import { getDb, hasDb, type AppDatabase } from "./db";

/* ------------------------------ input shapes ------------------------------ */

export interface CreateWorkspaceInput {
  name?: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorCompany?: string;
  visitorWebsite?: string;
  source?: Record<string, string>;
}

/** A row on its way in: the caller may supply an id, or let storage mint one. */
export type NewMessage = Omit<Message, "id" | "workspaceId" | "parentId" | "meta" | "createdAt"> &
  Partial<Pick<Message, "id" | "workspaceId" | "parentId" | "meta">>;

export interface NewChannel {
  name: string;
  slug?: string;
  purpose?: string | null;
  kind?: ChannelKind;
  counterpartKey?: string | null;
  orderIndex?: number;
}

export interface NewMember {
  memberKey: string;
  kind: MemberKind;
  displayName: string;
  role?: string | null;
  initials?: string;
  presence?: Presence;
}

export interface NewTask {
  title: string;
  detail?: string | null;
  status?: TaskStatus;
  assigneeKey?: string | null;
  orderIndex?: number;
}

export interface NewLead {
  workspaceId?: string | null;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  website?: string | null;
  intent?: string | null;
  message?: string | null;
  source?: Record<string, string> | null;
}

export type MessagePatch = Partial<Pick<Message, "body" | "meta">>;
export type TaskPatch = Partial<Pick<Task, "title" | "detail" | "status" | "assigneeKey" | "orderIndex">>;

export interface Storage {
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceState & { token: string }>;
  getWorkspaceByToken(token: string): Promise<WorkspaceState | null>;
  addMessage(workspaceId: string, msg: NewMessage): Promise<Message>;
  updateMessage(id: string, patch: MessagePatch): Promise<Message | null>;
  addChannel(workspaceId: string, input: NewChannel): Promise<Channel>;
  addMember(workspaceId: string, input: NewMember): Promise<Member>;
  addTask(workspaceId: string, input: NewTask): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task | null>;
  createLead(input: NewLead): Promise<Lead>;
  touchWorkspace(id: string): Promise<void>;
}

export type StorageMode = "postgres" | "memory";

/* --------------------------------- ids ----------------------------------- */

/**
 * The workspace token is the entire credential and it lives in a URL people
 * copy by hand, so: alphanumeric only (no `-`/`_` to be lost at a line break or
 * eaten by a linkifier) and 22 characters, which is ~131 bits of entropy.
 */
const newToken = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 22);

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "channel";
}

function initialsFrom(name: string | undefined, fallback: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0].slice(0, 1);
  const second = parts.length > 1 ? parts[parts.length - 1].slice(0, 1) : parts[0].slice(1, 2);
  return (first + second).toUpperCase() || fallback;
}

/* -------------------------------- seeding -------------------------------- */

interface Seed {
  channels: Channel[];
  members: Member[];
  tasks: Task[];
  messages: Message[];
}

/**
 * Everything a workspace contains the moment it exists. Shared by both storage
 * implementations so an in-memory workspace and a persisted one are identical.
 */
function buildSeed(workspaceId: string, input: CreateWorkspaceInput, now: Date): Seed {
  /*
   * THE DOOR DECIDES WHAT IS IN THE ROOM. Everything below used to be the same
   * whichever door a visitor came through, which put our people and our
   * conversion-tracking checklist into a room opened on a partner's door — see
   * seedFor() in shared/playbook.ts for why that was the worst defect here.
   *
   * An unstamped room falls back to the default door rather than to nothing:
   * a room with no channels at all is unusable, and routes.ts already renders
   * the fault state for a room that named no company.
   */
  const door = DOOR_BY_ID[input.source?.door ?? ""] ?? DOOR_BY_ID[DEFAULT_DOOR_ID];
  const ours = door.contract.legalName === DOOR_BY_ID[DEFAULT_DOOR_ID].contract.legalName;
  const plan = seedFor({
    id: door.id,
    slug: door.slug,
    headline: door.headline,
    firstAgentId: door.firstAgentId,
    ours,
  });

  const channelRows: Channel[] = plan.channels.map((seed, index) => ({
    id: nanoid(),
    workspaceId,
    slug: seed.slug,
    name: seed.name,
    purpose: seed.purpose,
    kind: seed.kind,
    counterpartKey: seed.counterpartKey ?? null,
    orderIndex: index,
    createdAt: now,
  }));

  const memberRows: Member[] = [
    {
      id: nanoid(),
      workspaceId,
      memberKey: "visitor",
      kind: "visitor",
      displayName: input.visitorName?.trim() || "You",
      role: input.visitorCompany?.trim() || null,
      initials: initialsFrom(input.visitorName, "YO"),
      presence: "online",
      joinedAt: now,
    },
  ];

  // Every agent that owns a channel, plus the conversion-tracking agent: it is
  // the assignee on the first checklist item, so it must exist as a member even
  // though nothing opens a channel with it up front.
  const agentKeys: string[] = [];
  for (const seed of plan.channels) {
    if (seed.kind === "agent" && seed.counterpartKey && !agentKeys.includes(seed.counterpartKey)) {
      agentKeys.push(seed.counterpartKey);
    }
  }
  /* The conversion-tracking agent is the assignee on that door's checklist, so
   * it has to exist as a member there — and only there. It used to be added to
   * every room, including rooms with no checklist and rooms that are not ours. */
  if (plan.tasks.some((task) => task.assigneeKey === "agent:conversion-tracking")) {
    if (!agentKeys.includes("agent:conversion-tracking")) agentKeys.push("agent:conversion-tracking");
  }

  for (const key of agentKeys) {
    const agent = AGENT_BY_ID[key.replace(/^agent:/, "")];
    if (!agent) continue;
    memberRows.push({
      id: nanoid(),
      workspaceId,
      memberKey: key,
      kind: "agent",
      displayName: agent.name,
      role: agent.title,
      initials: agent.initials,
      presence: "online",
      joinedAt: now,
    });
  }

  for (const expertId of plan.expertIds) {
    const expert = EXPERTS.find((candidate) => candidate.id === expertId);
    if (!expert) continue;
    memberRows.push({
      id: nanoid(),
      workspaceId,
      memberKey: expert.memberKey,
      kind: "expert",
      displayName: expert.name,
      role: expert.title,
      initials: expert.initials,
      presence: "online",
      joinedAt: now,
    });
  }

  const taskRows: Task[] = plan.tasks.map((seed, index) => ({
    id: nanoid(),
    workspaceId,
    title: seed.title,
    detail: seed.detail,
    status: seed.status,
    assigneeKey: seed.assigneeKey,
    orderIndex: index,
    createdAt: now,
  }));

  /*
   * NO SEEDED WELCOME. RoomArrival.tsx says in its own header comment that it
   * exists to replace "a seeded welcome message four paragraphs long" — and this
   * function kept posting it, so a visitor got both. Rendered at 1440 the first
   * screen was five blocks of the room narrating itself before anything worked:
   * the address strip, two arrival paragraphs, the model banner, then four more
   * paragraphs repeating the first two.
   *
   * The arrival panel is the one that survives, because it is the one that knows
   * whether a question came in with the visitor.
   */
  const messageRows: Message[] = [];

  return { channels: channelRows, members: memberRows, tasks: taskRows, messages: messageRows };
}

function workspaceRow(input: CreateWorkspaceInput, now: Date): Workspace {
  return {
    id: nanoid(),
    token: newToken(),
    name: input.name?.trim() || input.visitorCompany?.trim() || "Conversion tracking",
    visitorName: input.visitorName?.trim() || null,
    visitorEmail: input.visitorEmail?.trim() || null,
    visitorCompany: input.visitorCompany?.trim() || null,
    visitorWebsite: input.visitorWebsite?.trim() || null,
    source: input.source ?? {},
    createdAt: now,
    lastActiveAt: now,
  };
}

function publicWorkspace(workspace: Workspace): WorkspaceState["workspace"] {
  return {
    id: workspace.id,
    token: workspace.token,
    name: workspace.name,
    visitorName: workspace.visitorName,
    visitorEmail: workspace.visitorEmail,
    visitorCompany: workspace.visitorCompany,
    visitorWebsite: workspace.visitorWebsite,
    // The door the room came through lives in here; the footer cannot name a
    // company without it. Everything in `source` was put there by the visitor's
    // own arrival, so it is theirs to read back.
    source: workspace.source ?? {},
    createdAt: workspace.createdAt,
  };
}

function messageRow(workspaceId: string, msg: NewMessage, now: Date): Message {
  return {
    id: msg.id ?? nanoid(),
    workspaceId,
    channelId: msg.channelId,
    authorKey: msg.authorKey,
    authorKind: msg.authorKind,
    body: msg.body,
    parentId: msg.parentId ?? null,
    meta: msg.meta ?? {},
    createdAt: now,
  };
}

function channelRow(workspaceId: string, input: NewChannel, now: Date): Channel {
  return {
    id: nanoid(),
    workspaceId,
    slug: input.slug ? slugify(input.slug) : slugify(input.name),
    name: input.name,
    purpose: input.purpose ?? null,
    kind: input.kind ?? "project",
    counterpartKey: input.counterpartKey ?? null,
    orderIndex: input.orderIndex ?? 0,
    createdAt: now,
  };
}

function memberRow(workspaceId: string, input: NewMember, now: Date): Member {
  return {
    id: nanoid(),
    workspaceId,
    memberKey: input.memberKey,
    kind: input.kind,
    displayName: input.displayName,
    role: input.role ?? null,
    initials: input.initials ?? initialsFrom(input.displayName, "??"),
    presence: input.presence ?? "online",
    joinedAt: now,
  };
}

function taskRow(workspaceId: string, input: NewTask, now: Date): Task {
  return {
    id: nanoid(),
    workspaceId,
    title: input.title,
    detail: input.detail ?? null,
    status: input.status ?? "todo",
    assigneeKey: input.assigneeKey ?? null,
    orderIndex: input.orderIndex ?? 0,
    createdAt: now,
  };
}

function leadRow(input: NewLead, now: Date): Lead {
  return {
    id: nanoid(),
    workspaceId: input.workspaceId ?? null,
    name: input.name ?? null,
    email: input.email ?? null,
    company: input.company ?? null,
    website: input.website ?? null,
    intent: input.intent ?? null,
    message: input.message ?? null,
    source: input.source ?? {},
    createdAt: now,
    notifiedAt: null,
  };
}

function byOrder<T extends { orderIndex: number; createdAt: Date }>(a: T, b: T): number {
  return a.orderIndex - b.orderIndex || a.createdAt.getTime() - b.createdAt.getTime();
}

/* ------------------------------- in-memory -------------------------------- */

/**
 * The default store. Complete, not a stub: with an empty `.env` the entire
 * product runs on this, and only loses its contents when the process restarts.
 */
class MemoryStorage implements Storage {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly byToken = new Map<string, string>();
  private channels: Channel[] = [];
  private members: Member[] = [];
  private messages: Message[] = [];
  private tasks: Task[] = [];
  private leads: Lead[] = [];

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceState & { token: string }> {
    const now = new Date();
    const workspace = workspaceRow(input, now);
    const seed = buildSeed(workspace.id, input, now);

    this.workspaces.set(workspace.id, workspace);
    this.byToken.set(workspace.token, workspace.id);
    this.channels.push(...seed.channels);
    this.members.push(...seed.members);
    this.tasks.push(...seed.tasks);
    this.messages.push(...seed.messages);

    return { ...this.stateOf(workspace), token: workspace.token };
  }

  async getWorkspaceByToken(token: string): Promise<WorkspaceState | null> {
    const id = this.byToken.get(token);
    const workspace = id ? this.workspaces.get(id) : undefined;
    return workspace ? this.stateOf(workspace) : null;
  }

  async addMessage(workspaceId: string, msg: NewMessage): Promise<Message> {
    const row = messageRow(workspaceId, msg, new Date());
    this.messages.push(row);
    return row;
  }

  async updateMessage(id: string, patch: MessagePatch): Promise<Message | null> {
    const index = this.messages.findIndex((message) => message.id === id);
    if (index === -1) return null;
    // Rows are replaced rather than mutated so anything already handed out
    // (a broadcast payload, a pending response) keeps the value it was given.
    const updated: Message = { ...this.messages[index], ...patch };
    this.messages[index] = updated;
    return updated;
  }

  async addChannel(workspaceId: string, input: NewChannel): Promise<Channel> {
    const row = channelRow(workspaceId, input, new Date());
    this.channels.push(row);
    return row;
  }

  async addMember(workspaceId: string, input: NewMember): Promise<Member> {
    const row = memberRow(workspaceId, input, new Date());
    this.members.push(row);
    return row;
  }

  async addTask(workspaceId: string, input: NewTask): Promise<Task> {
    const row = taskRow(workspaceId, input, new Date());
    this.tasks.push(row);
    return row;
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    const index = this.tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;
    const updated: Task = { ...this.tasks[index], ...patch };
    this.tasks[index] = updated;
    return updated;
  }

  async createLead(input: NewLead): Promise<Lead> {
    const row = leadRow(input, new Date());
    this.leads.push(row);
    return row;
  }

  async touchWorkspace(id: string): Promise<void> {
    const workspace = this.workspaces.get(id);
    if (workspace) this.workspaces.set(id, { ...workspace, lastActiveAt: new Date() });
  }

  private stateOf(workspace: Workspace): WorkspaceState {
    const id = workspace.id;
    return {
      workspace: publicWorkspace(workspace),
      channels: this.channels.filter((row) => row.workspaceId === id).sort(byOrder),
      members: this.members.filter((row) => row.workspaceId === id),
      // Insertion order is the true chronology; timestamps can tie inside a
      // millisecond when a placeholder follows its trigger message.
      messages: this.messages.filter((row) => row.workspaceId === id),
      tasks: this.tasks.filter((row) => row.workspaceId === id).sort(byOrder),
    };
  }
}

/* -------------------------------- postgres -------------------------------- */

class PgStorage implements Storage {
  constructor(private readonly db: AppDatabase) {}

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceState & { token: string }> {
    const now = new Date();
    const workspace = workspaceRow(input, now);
    const seed = buildSeed(workspace.id, input, now);

    // One transaction: a half-seeded workspace would show an empty sidebar and
    // no checklist, which reads as a broken product rather than a failed write.
    await this.db.transaction(async (tx) => {
      await tx.insert(workspaces).values(workspace);
      if (seed.channels.length) await tx.insert(channels).values(seed.channels);
      if (seed.members.length) await tx.insert(members).values(seed.members);
      if (seed.tasks.length) await tx.insert(tasks).values(seed.tasks);
      if (seed.messages.length) await tx.insert(messages).values(seed.messages);
    });

    return {
      workspace: publicWorkspace(workspace),
      channels: seed.channels,
      members: seed.members,
      messages: seed.messages,
      tasks: seed.tasks,
      token: workspace.token,
    };
  }

  async getWorkspaceByToken(token: string): Promise<WorkspaceState | null> {
    const found = await this.db.select().from(workspaces).where(eq(workspaces.token, token)).limit(1);
    const workspace = found[0];
    if (!workspace) return null;

    const [channelRows, memberRows, messageRows, taskRows] = await Promise.all([
      this.db.select().from(channels).where(eq(channels.workspaceId, workspace.id)).orderBy(asc(channels.orderIndex), asc(channels.createdAt)),
      this.db.select().from(members).where(eq(members.workspaceId, workspace.id)).orderBy(asc(members.joinedAt)),
      this.db.select().from(messages).where(eq(messages.workspaceId, workspace.id)).orderBy(asc(messages.createdAt), asc(messages.id)),
      this.db.select().from(tasks).where(eq(tasks.workspaceId, workspace.id)).orderBy(asc(tasks.orderIndex), asc(tasks.createdAt)),
    ]);

    return {
      workspace: publicWorkspace(workspace),
      channels: channelRows,
      members: memberRows,
      messages: messageRows,
      tasks: taskRows,
    };
  }

  async addMessage(workspaceId: string, msg: NewMessage): Promise<Message> {
    const row = messageRow(workspaceId, msg, new Date());
    await this.db.insert(messages).values(row);
    return row;
  }

  async updateMessage(id: string, patch: MessagePatch): Promise<Message | null> {
    if (Object.keys(patch).length === 0) {
      const found = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1);
      return found[0] ?? null;
    }
    const updated = await this.db.update(messages).set(patch).where(eq(messages.id, id)).returning();
    return updated[0] ?? null;
  }

  async addChannel(workspaceId: string, input: NewChannel): Promise<Channel> {
    const row = channelRow(workspaceId, input, new Date());
    await this.db.insert(channels).values(row);
    return row;
  }

  async addMember(workspaceId: string, input: NewMember): Promise<Member> {
    const row = memberRow(workspaceId, input, new Date());
    await this.db.insert(members).values(row);
    return row;
  }

  async addTask(workspaceId: string, input: NewTask): Promise<Task> {
    const row = taskRow(workspaceId, input, new Date());
    await this.db.insert(tasks).values(row);
    return row;
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    if (Object.keys(patch).length === 0) {
      const found = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
      return found[0] ?? null;
    }
    const updated = await this.db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    return updated[0] ?? null;
  }

  async createLead(input: NewLead): Promise<Lead> {
    const row = leadRow(input, new Date());
    await this.db.insert(leads).values(row);
    return row;
  }

  async touchWorkspace(id: string): Promise<void> {
    await this.db.update(workspaces).set({ lastActiveAt: new Date() }).where(eq(workspaces.id, id));
  }
}

/* ------------------------------- selection -------------------------------- */

let active: { mode: StorageMode; store: Storage } | null = null;

function resolve(): { mode: StorageMode; store: Storage } {
  if (active) return active;

  const database = hasDb() ? getDb() : null;
  if (database) {
    console.log("[storage] postgres — DATABASE_URL is set");
    active = { mode: "postgres", store: new PgStorage(database) };
  } else {
    console.log("[storage] in-memory — no DATABASE_URL, so workspaces are lost on restart");
    active = { mode: "memory", store: new MemoryStorage() };
  }

  return active;
}

/** Which implementation is live. Resolving it is what emits the boot log line. */
export function storageMode(): StorageMode {
  return resolve().mode;
}

/**
 * Resolution is deferred to the first call rather than done at import, because
 * `.env` is only loaded once `server/index.ts` starts running.
 */
export const storage: Storage = {
  createWorkspace: (input) => resolve().store.createWorkspace(input),
  getWorkspaceByToken: (token) => resolve().store.getWorkspaceByToken(token),
  addMessage: (workspaceId, msg) => resolve().store.addMessage(workspaceId, msg),
  updateMessage: (id, patch) => resolve().store.updateMessage(id, patch),
  addChannel: (workspaceId, input) => resolve().store.addChannel(workspaceId, input),
  addMember: (workspaceId, input) => resolve().store.addMember(workspaceId, input),
  addTask: (workspaceId, input) => resolve().store.addTask(workspaceId, input),
  updateTask: (id, patch) => resolve().store.updateTask(id, patch),
  createLead: (input) => resolve().store.createLead(input),
  touchWorkspace: (id) => resolve().store.touchWorkspace(id),
};
