import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("suggested"),
      v.literal("backlog"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("done")
    ),
    assigned_to: v.union(
      v.literal("me"),
      v.literal("alex"),
      v.literal("sam"),
      v.literal("lyra"),
      v.literal("nova"),
      v.literal("ops"),
      v.literal("agent")
    ),
    created_at: v.string(),
    updated_at: v.optional(v.string()),

    // Workflow core v2 fields
    workflow_contract_version: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
    intent_window: v.optional(v.string()),

    owner: v.optional(
      v.union(
        v.literal("me"),
        v.literal("alex"),
        v.literal("sam"),
        v.literal("lyra"),
        v.literal("nova"),
        v.literal("ops"),
        v.literal("agent")
      )
    ),
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

    // Stability-hardening-v2: failure fingerprint breaker
    failure_fingerprint: v.optional(v.string()),
    lane_paused: v.optional(v.boolean()),
    lane_paused_reason: v.optional(v.string()),
    lane_paused_at: v.optional(v.string()),
  })
    .index("by_idempotency", ["idempotency_key"])
    .index("by_status_assignee", ["status", "assigned_to"])
    .index("by_failure_fingerprint", ["failure_fingerprint"]),
  calendarNotes: defineTable({
    date: v.string(), // YYYY-MM-DD
    note: v.string(),
    created_at: v.string(),
  }),
});
