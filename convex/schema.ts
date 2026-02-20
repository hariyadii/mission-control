import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("suggested"), v.literal("backlog"), v.literal("in_progress"), v.literal("done")),
    assigned_to: v.union(v.literal("me"), v.literal("alex"), v.literal("sam"), v.literal("lyra"), v.literal("agent")),
    created_at: v.string(),
    updated_at: v.optional(v.string()),

    // Workflow core v2 fields
    workflow_contract_version: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
    intent_window: v.optional(v.string()),

    owner: v.optional(v.union(v.literal("me"), v.literal("alex"), v.literal("sam"), v.literal("lyra"), v.literal("agent"))),
    lease_until: v.optional(v.string()),
    heartbeat_at: v.optional(v.string()),

    retry_count_total: v.optional(v.number()),
    retry_count_run: v.optional(v.number()),
    blocked_reason: v.optional(v.string()),

    artifact_path: v.optional(v.string()),
    validation_status: v.optional(v.union(v.literal("pending"), v.literal("pass"), v.literal("fail"))),
  })
    .index("by_idempotency", ["idempotency_key"])
    .index("by_status_assignee", ["status", "assigned_to"]),
  calendarNotes: defineTable({
    date: v.string(), // YYYY-MM-DD
    note: v.string(),
    created_at: v.string(),
  }),
});
