import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const ASSIGNEE = v.union(v.literal("me"), v.literal("alex"), v.literal("sam"), v.literal("lyra"), v.literal("agent"));
const STATUS = v.union(v.literal("suggested"), v.literal("backlog"), v.literal("in_progress"), v.literal("done"));

function nowIso(): string {
  return new Date().toISOString();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").order("desc").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    assigned_to: ASSIGNEE,
    status: v.optional(STATUS),
    idempotency_key: v.optional(v.string()),
    intent_window: v.optional(v.string()),
    workflow_contract_version: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();

    if (args.idempotency_key) {
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_idempotency", (q) => q.eq("idempotency_key", args.idempotency_key))
        .unique();
      if (existing) return existing._id;
    }

    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description ?? "",
      assigned_to: args.assigned_to,
      status: args.status ?? "backlog",
      created_at: timestamp,
      updated_at: timestamp,

      workflow_contract_version: args.workflow_contract_version ?? "v2",
      idempotency_key: args.idempotency_key,
      intent_window: args.intent_window,

      owner: undefined,
      lease_until: undefined,
      heartbeat_at: undefined,

      retry_count_total: 0,
      retry_count_run: 0,
      blocked_reason: undefined,

      artifact_path: undefined,
      validation_status: "pending",
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: STATUS,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status, updated_at: nowIso() });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateTask = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    assigned_to: v.optional(ASSIGNEE),

    owner: v.optional(ASSIGNEE),
    lease_until: v.optional(v.string()),
    heartbeat_at: v.optional(v.string()),
    retry_count_total: v.optional(v.number()),
    retry_count_run: v.optional(v.number()),
    blocked_reason: v.optional(v.string()),
    artifact_path: v.optional(v.string()),
    validation_status: v.optional(v.union(v.literal("pending"), v.literal("pass"), v.literal("fail"))),
    idempotency_key: v.optional(v.string()),
    intent_window: v.optional(v.string()),
    workflow_contract_version: v.optional(v.string()),
    updated_at: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
    await ctx.db.patch(id, { ...filtered, updated_at: nowIso() });
  },
});

export const claimForAssignee = mutation({
  args: {
    assignee: ASSIGNEE,
    leaseMinutes: v.optional(v.number()),
    allowAgentFallback: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const leaseMinutes = Math.max(5, Math.floor(args.leaseMinutes ?? 45));
    const leaseUntil = new Date(now + leaseMinutes * 60 * 1000).toISOString();
    const nowIsoString = new Date(now).toISOString();

    const all = await ctx.db.query("tasks").collect();

    // Resume owned in-progress first (stateful continuation)
    const ownedInProgress = all
      .filter((t) => t.status === "in_progress" && t.owner === args.assignee)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

    if (ownedInProgress.length > 0) {
      const task = ownedInProgress[0];
      await ctx.db.patch(task._id, {
        lease_until: leaseUntil,
        heartbeat_at: nowIsoString,
        retry_count_run: 0,
        updated_at: nowIsoString,
      });
      return { claimed: true, resumed: true, taskId: task._id };
    }

    const backlogCandidates = all
      .filter((t) => {
        if (t.status !== "backlog") return false;
        if (t.assigned_to === args.assignee) return true;
        if (args.allowAgentFallback && args.assignee === "sam" && t.assigned_to === "agent") return true;
        return false;
      })
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

    if (!backlogCandidates.length) {
      return { claimed: false, resumed: false, taskId: null };
    }

    const task = backlogCandidates[0];
    // optimistic check-ish: only claim if still backlog
    const fresh = await ctx.db.get(task._id);
    if (!fresh || fresh.status !== "backlog") {
      return { claimed: false, resumed: false, taskId: null };
    }

    await ctx.db.patch(task._id, {
      status: "in_progress",
      owner: args.assignee,
      lease_until: leaseUntil,
      heartbeat_at: nowIsoString,
      retry_count_run: 0,
      blocked_reason: undefined,
      validation_status: "pending",
      updated_at: nowIsoString,
    });

    return { claimed: true, resumed: false, taskId: task._id };
  },
});

export const heartbeatLease = mutation({
  args: {
    id: v.id("tasks"),
    assignee: ASSIGNEE,
    leaseMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return { ok: false, reason: "not_found" };
    if (task.status !== "in_progress") return { ok: false, reason: "not_in_progress" };
    if (task.owner !== args.assignee) return { ok: false, reason: "owner_mismatch" };

    const leaseMinutes = Math.max(5, Math.floor(args.leaseMinutes ?? 45));
    const leaseUntil = new Date(Date.now() + leaseMinutes * 60 * 1000).toISOString();
    await ctx.db.patch(args.id, {
      lease_until: leaseUntil,
      heartbeat_at: nowIso(),
      updated_at: nowIso(),
    });
    return { ok: true, lease_until: leaseUntil };
  },
});

export const completeTask = mutation({
  args: {
    id: v.id("tasks"),
    assignee: ASSIGNEE,
    output: v.optional(v.string()),
    artifact_path: v.optional(v.string()),
    validation_status: v.optional(v.union(v.literal("pass"), v.literal("fail"))),
    blocked_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return { ok: false, reason: "not_found" };
    if (task.status !== "in_progress") return { ok: false, reason: "not_in_progress" };
    if (task.owner && task.owner !== args.assignee) return { ok: false, reason: "owner_mismatch" };

    const output = args.output?.trim();
    let description = task.description ?? "";
    if (output) {
      description = description
        ? `${description}\n\n---\n**Execution Output:**\n${output}`
        : `**Execution Output:**\n${output}`;
    }

    const success = (args.validation_status ?? "pass") === "pass";

    await ctx.db.patch(args.id, {
      description,
      artifact_path: args.artifact_path,
      validation_status: success ? "pass" : "fail",
      blocked_reason: success ? undefined : (args.blocked_reason ?? "validation_failed"),
      status: success ? "done" : "backlog",
      owner: undefined,
      lease_until: undefined,
      heartbeat_at: nowIso(),
      retry_count_run: success ? 0 : (task.retry_count_run ?? 0) + 1,
      retry_count_total: success ? (task.retry_count_total ?? 0) : (task.retry_count_total ?? 0) + 1,
      updated_at: nowIso(),
    });

    return { ok: true, status: success ? "done" : "backlog" };
  },
});

export const requeueExpiredLeases = mutation({
  args: {
    nowIso: v.optional(v.string()),
    max: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.parse(args.nowIso ?? nowIso());
    const max = Math.max(1, Math.min(20, Math.floor(args.max ?? 10)));

    const all = await ctx.db.query("tasks").collect();
    const expired = all
      .filter((t) => t.status === "in_progress" && t.lease_until && Date.parse(t.lease_until) < now)
      .sort((a, b) => Date.parse(a.lease_until ?? "") - Date.parse(b.lease_until ?? ""))
      .slice(0, max);

    for (const task of expired) {
      await ctx.db.patch(task._id, {
        status: "backlog",
        owner: undefined,
        lease_until: undefined,
        blocked_reason: "stale_lease",
        retry_count_total: (task.retry_count_total ?? 0) + 1,
        updated_at: nowIso(),
      });
    }

    return { ok: true, requeued: expired.length };
  },
});
