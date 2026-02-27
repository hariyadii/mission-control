#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("usage: export-convex-state.mjs <output_path>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) {
  console.error("missing NEXT_PUBLIC_CONVEX_URL");
  process.exit(1);
}

const client = new ConvexHttpClient(url);
const tasks = await client.query(api.tasks.list, {});

const payload = {
  exportedAt: new Date().toISOString(),
  source: "convex/tasks.list",
  totalTasks: tasks.length,
  byStatus: tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    },
    { suggested: 0, backlog: 0, in_progress: 0, done: 0 }
  ),
  tasks,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`convex_export_ok path=${outputPath} total=${tasks.length}`);
