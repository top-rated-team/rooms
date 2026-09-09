import { pgTable, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ---------------------------------------------------------------------------
 * A workspace is created the moment a visitor sends their first message.
 * No signup: the `token` is the whole credential — it lives in the URL
 * (/w/:token) and in localStorage, and it is the only way back in.
 * ------------------------------------------------------------------------- */
export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    name: text("name").notNull(),
    visitorName: text("visitor_name"),
    visitorEmail: text("visitor_email"),
    visitorCompany: text("visitor_company"),
    visitorWebsite: text("visitor_website"),
    /** Where the visitor came from: utm params, referrer, landing intent. */
    source: jsonb("source").$type<Record<string, string>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  },
  (t) => ({ tokenIdx: uniqueIndex("workspaces_token_idx").on(t.token) }),
);

export const channels = pgTable(
  "channels",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose"),
    /** project = group channel, dm = 1:1 with a human, agent = 1:1 with an AI */
    kind: text("kind").$type<ChannelKind>().notNull().default("project"),
    /** For kind=agent|dm: which member this channel is with. */
    counterpartKey: text("counterpart_key"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ wsIdx: index("channels_ws_idx").on(t.workspaceId) }),
);

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    /** Stable identity, e.g. "visitor", "agent:chatgpt-ads", "human:dan". */
    memberKey: text("member_key").notNull(),
    kind: text("kind").$type<MemberKind>().notNull(),
    displayName: text("display_name").notNull(),
    role: text("role"),
    initials: text("initials").notNull(),
    presence: text("presence").$type<Presence>().notNull().default("online"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => ({ wsIdx: index("members_ws_idx").on(t.workspaceId) }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    channelId: text("channel_id").notNull(),
    authorKey: text("author_key").notNull(),
    authorKind: text("author_kind").$type<MemberKind>().notNull(),
    body: text("body").notNull(),
    /** Set for replies inside a thread. */
    parentId: text("parent_id"),
    /** Citations, tool traces, streaming state, system-event payloads. */
    meta: jsonb("meta").$type<MessageMeta>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    wsIdx: index("messages_ws_idx").on(t.workspaceId),
    chIdx: index("messages_channel_idx").on(t.channelId),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    assigneeKey: text("assignee_key"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ wsIdx: index("tasks_ws_idx").on(t.workspaceId) }),
);

/** Every request that needs a human lands here and fires a notification. */
export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  name: text("name"),
  email: text("email"),
  company: text("company"),
  website: text("website"),
  /** "conversion-tracking" | "google-ads" | … — which service was asked for. */
  intent: text("intent"),
  message: text("message"),
  source: jsonb("source").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  notifiedAt: timestamp("notified_at"),
});

/* ------------------------------- enums ---------------------------------- */

export type ChannelKind = "project" | "dm" | "agent";
export type MemberKind = "visitor" | "expert" | "agent" | "system";
export type Presence = "online" | "away" | "offline";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
/** A repeating line. Checking it off brings it back next week. Absent means it does not repeat. */
export type TaskRepeat = "weekly";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface MessageMeta {
  citations?: Citation[];
  /** Set while an agent reply is still streaming in. */
  streaming?: boolean;
  /** System events rendered as inline chips rather than chat bubbles. */
  event?: "member_joined" | "task_created" | "task_done" | "expert_requested" | "workspace_created";
  error?: string;
  [key: string]: unknown;
}

/* ------------------------------- zod ------------------------------------ */

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, notifiedAt: true });

/**
 * An answer the visitor already read on a door page, handed back so the room
 * opens with the exchange they had rather than asking the agent the same
 * question again. `receipt` is required: an unsigned or wrongly-signed body is
 * discarded and the room falls back to asking, because an agent message in a
 * room reads as the company speaking and a browser may not put words there.
 */
export const carriedAnswerSchema = z.object({
  body: z.string().min(1).max(20000),
  receipt: z.string().min(16).max(64),
});

export const createWorkspaceSchema = z.object({
  firstMessage: z.string().min(1).max(4000).optional(),
  firstAnswer: carriedAnswerSchema.optional(),
  agentId: z.string().max(64).optional(),
  name: z.string().max(120).optional(),
  visitorName: z.string().max(120).optional(),
  visitorEmail: z.string().email().max(200).optional(),
  visitorCompany: z.string().max(160).optional(),
  visitorWebsite: z.string().max(300).optional(),
  source: z.record(z.string()).optional(),
});

export const postMessageSchema = z.object({
  channelId: z.string().min(1),
  body: z.string().min(1).max(8000),
  parentId: z.string().nullable().optional(),
  /** Agents explicitly summoned with @mentions in the composer. */
  mentions: z.array(z.string()).max(8).optional(),
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  purpose: z.string().max(300).optional(),
  kind: z.enum(["project", "dm", "agent"]).optional(),
  counterpartKey: z.string().max(80).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  detail: z.string().max(2000).optional(),
  assigneeKey: z.string().max(80).optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  repeat: z.enum(["weekly"]).nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  detail: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  assigneeKey: z.string().max(80).nullable().optional(),
  repeat: z.enum(["weekly"]).nullable().optional(),
});

export const inviteMemberSchema = z.object({
  memberKey: z.string().min(1).max(80),
  note: z.string().max(2000).optional(),
  email: z.string().email().max(200).optional(),
  name: z.string().max(120).optional(),
});

export const askSchema = z.object({
  question: z.string().min(1).max(4000),
  agentId: z.string().max(64).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(20)
    .optional(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Task = typeof tasks.$inferSelect & { repeat?: TaskRepeat | null };
export type Lead = typeof leads.$inferSelect;
export * from "./schema-rooms";
export * from "./schema-adgrant";
