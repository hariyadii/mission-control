import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("suggested"), v.literal("backlog"), v.literal("in_progress"), v.literal("done")),
    assigned_to: v.union(v.literal("me"), v.literal("alex"), v.literal("sam"), v.literal("lyra"), v.literal("agent")),
    created_at: v.string(),
  }),
  calendarNotes: defineTable({
    date: v.string(), // YYYY-MM-DD
    note: v.string(),
    created_at: v.string(),
  }),
});
