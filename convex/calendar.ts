import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listNotes = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("calendarNotes").collect(),
});

export const addNote = mutation({
  args: { date: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("calendarNotes", {
      date: args.date,
      note: args.note,
      created_at: new Date().toISOString(),
    });
  },
});

export const deleteNote = mutation({
  args: { id: v.id("calendarNotes") },
  handler: async (ctx, args) => await ctx.db.delete(args.id),
});
