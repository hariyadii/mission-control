import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const ASSIGNEE = v.union(
  v.literal("me"),
  v.literal("alex"),
  v.literal("sam"),
  v.literal("lyra"),
  v.literal("nova"),
  v.literal("ops"),
  v.literal("agent")
);
const STATUS = v.union(
  v.literal("suggested"),
  v.literal("backlog"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done")
);

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
      description: args.description,
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
      blocked_until: undefined,
      unblock_signal: undefined,
      last_validation_reason: undefined,
      same_reason_fail_streak: 0,
      remediation_task_id: undefined,
      remediation_source: undefined,
      incident_fingerprint: undefined,
      auto_recovery_attempts: 0,
      escalated_to_user_at: undefined,

      artifact_path: undefined,
      validation_status: "pending",
      changelog_path: undefined,
      changelog_feature: undefined,
      changelog_status: "pending",
      changelog_last_checked_at: undefined,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: STATUS,
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      status: args.status,
      updated_at: nowIso(),
    };
    if (args.status !== "in_progress") {
      patch.owner = undefined;
      patch.lease_until = undefined;
      patch.heartbeat_at = undefined;
    }
    if (args.status !== "blocked") {
      patch.blocked_reason = undefined;
      patch.blocked_until = undefined;
      patch.unblock_signal = undefined;
    }
    await ctx.db.patch(args.id, patch);
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
    blocked_until: v.optional(v.string()),
    unblock_signal: v.optional(v.string()),
    last_validation_reason: v.optional(v.string()),
    same_reason_fail_streak: v.optional(v.number()),
    remediation_task_id: v.optional(v.string()),
    remediation_source: v.optional(v.string()),
    incident_fingerprint: v.optional(v.string()),
    auto_recovery_attempts: v.optional(v.number()),
    escalated_to_user_at: v.optional(v.string()),
    artifact_path: v.optional(v.string()),
    validation_status: v.optional(v.union(v.literal("pending"), v.literal("pass"), v.literal("fail"))),
    changelog_path: v.optional(v.string()),
    changelog_feature: v.optional(v.string()),
    changelog_status: v.optional(v.union(v.literal("pending"), v.literal("pass"), v.literal("fail"))),
    changelog_last_checked_at: v.optional(v.string()),
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
      blocked_until: undefined,
      unblock_signal: undefined,
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
    changelog_path: v.optional(v.string()),
    changelog_feature: v.optional(v.string()),
    changelog_status: v.optional(v.union(v.literal("pending"), v.literal("pass"), v.literal("fail"))),
    changelog_last_checked_at: v.optional(v.string()),
    blocked_reason: v.optional(v.string()),
    blocked_until: v.optional(v.string()),
    unblock_signal: v.optional(v.string()),
    remediation_source: v.optional(v.string()),
    incident_fingerprint: v.optional(v.string()),
    auto_recovery_attempts: v.optional(v.number()),
    escalated_to_user_at: v.optional(v.string()),
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
    const blockedReason = args.blocked_reason ?? "validation_failed";
    const blockedLike =
      /market|regime|platform|dependency|await|upstream|rate[_ -]?limit|maintenance|window|liquidity|exchange/i.test(
        blockedReason
      );

    await ctx.db.patch(args.id, {
      description,
      artifact_path: args.artifact_path,
      validation_status: success ? "pass" : "fail",
      blocked_reason: success ? undefined : blockedLike ? blockedReason : undefined,
      blocked_until: success ? undefined : blockedLike ? (args.blocked_until ?? task.blocked_until ?? "condition_based") : undefined,
      unblock_signal: success ? undefined : blockedLike ? (args.unblock_signal ?? task.unblock_signal ?? "manual_recheck") : undefined,
      remediation_source: args.remediation_source ?? (success ? undefined : task.remediation_source),
      incident_fingerprint: args.incident_fingerprint ?? (success ? undefined : task.incident_fingerprint),
      auto_recovery_attempts: args.auto_recovery_attempts ?? (success ? 0 : task.auto_recovery_attempts ?? 0),
      escalated_to_user_at: args.escalated_to_user_at ?? task.escalated_to_user_at,
      status: success ? "done" : blockedLike ? "blocked" : "backlog",
      changelog_path: args.changelog_path,
      changelog_feature: args.changelog_feature,
      changelog_status: args.changelog_status ?? (success ? "pass" : "fail"),
      changelog_last_checked_at: args.changelog_last_checked_at ?? nowIso(),
      owner: undefined,
      lease_until: undefined,
      heartbeat_at: success ? nowIso() : undefined,
      retry_count_run: success ? 0 : (task.retry_count_run ?? 0) + 1,
      retry_count_total: success ? (task.retry_count_total ?? 0) : (task.retry_count_total ?? 0) + 1,
      last_validation_reason: success ? undefined : blockedReason,
      same_reason_fail_streak: success ? 0 : task.last_validation_reason === blockedReason ? (task.same_reason_fail_streak ?? 0) + 1 : 1,
      updated_at: nowIso(),
    });

    return { ok: true, status: success ? "done" : blockedLike ? "blocked" : "backlog" };
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
      const staleMarker = `stale_lease_requeued:${nowIso()}`;
      const previousDescription = task.description?.trim() ?? "";
      const description = previousDescription ? `${previousDescription}\n${staleMarker}` : staleMarker;
      await ctx.db.patch(task._id, {
        status: "backlog",
        owner: undefined,
        lease_until: undefined,
        blocked_reason: undefined,
        blocked_until: undefined,
        unblock_signal: undefined,
        description,
        retry_count_total: (task.retry_count_total ?? 0) + 1,
        updated_at: nowIso(),
      });
    }

    return { ok: true, requeued: expired.length };
  },
});

export const normalizeBlockedState = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun === true;
    const all = await ctx.db.query("tasks").collect();
    let movedBacklogToBlocked = 0;
    let clearedNonBlockedMetadata = 0;

    for (const task of all) {
      const hasBlockedMeta = Boolean(task.blocked_reason || task.blocked_until || task.unblock_signal);
      if (task.status === "backlog" && hasBlockedMeta && task.blocked_reason) {
        movedBacklogToBlocked += 1;
        if (!dryRun) {
          await ctx.db.patch(task._id, {
            status: "blocked",
            updated_at: nowIso(),
          });
        }
        continue;
      }

      if (task.status !== "blocked" && hasBlockedMeta) {
        clearedNonBlockedMetadata += 1;
        if (!dryRun) {
          await ctx.db.patch(task._id, {
            blocked_reason: undefined,
            blocked_until: undefined,
            unblock_signal: undefined,
            updated_at: nowIso(),
          });
        }
      }
    }

    return {
      ok: true,
      dryRun,
      total: all.length,
      movedBacklogToBlocked,
      clearedNonBlockedMetadata,
    };
  },
});
