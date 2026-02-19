import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type Assignee = "me" | "alex" | "sam" | "agent";
type Status = "suggested" | "backlog" | "in_progress" | "done";
type Action = "guardrail" | "worker" | "status";
type TaskDoc = Doc<"tasks">;

type PluginContext = {
  task: TaskDoc;
  allTasks: TaskDoc[];
  worker: Assignee;
  timestamp: string;
};

type PluginResult = {
  pluginId: string;
  notes: string[];
  files: string[];
};

type ExecutorPlugin = {
  id: string;
  match: (task: TaskDoc) => boolean;
  run: (ctx: PluginContext) => Promise<PluginResult>;
};

const WORKSPACE_ROOT = "/home/ubuntu/.openclaw/workspace";
const EXECUTIONS_DIR = `${WORKSPACE_ROOT}/autonomy/executions`;
const PLUGIN_OUTPUT_DIR = `${WORKSPACE_ROOT}/autonomy/plugins`;
const CRON_JOBS_FILE = "/home/ubuntu/.openclaw/cron/jobs.json";
const MAX_GUARDRAIL_PER_RUN = 3;

const RISKY_KEYWORDS = [
  "delete",
  "drop database",
  "truncate",
  "rm -rf",
  "exfiltrate",
  "secrets",
  "password",
  "token",
  "credential",
  "ssh",
  "production",
  "deploy",
  "billing",
  "payment",
  "wire",
  "lawsuit",
  "legal",
  "root",
  "sudo",
];

const VAGUE_KEYWORDS = [
  "misc",
  "stuff",
  "things",
  "tbd",
  "whatever",
  "help",
  "improve",
  "fix it",
  "work on",
  "do task",
];

function getClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(url);
}

function normalizeTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeAssignee(value: unknown, fallback: Assignee = "agent"): Assignee {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "me" || normalized === "alex" || normalized === "sam" || normalized === "agent") {
    return normalized;
  }
  return fallback;
}

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "task";
}

async function writeTextFile(path: string, content: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

function isRiskyOrVague(task: TaskDoc): string | null {
  const combined = `${task.title} ${task.description ?? ""}`.trim().toLowerCase();
  if (task.title.trim().length < 6) return "title_too_short";
  if (combined.split(/\s+/).filter(Boolean).length < 3) return "task_too_vague";

  for (const keyword of RISKY_KEYWORDS) {
    if (combined.includes(keyword)) return `risky_keyword:${keyword}`;
  }

  for (const keyword of VAGUE_KEYWORDS) {
    if (combined.includes(keyword)) return `vague_keyword:${keyword}`;
  }

  return null;
}

function sortOldestFirst(tasks: TaskDoc[]): TaskDoc[] {
  return [...tasks].sort((a, b) => {
    const tA = Date.parse(a.created_at);
    const tB = Date.parse(b.created_at);
    if (Number.isNaN(tA) && Number.isNaN(tB)) return String(a._id).localeCompare(String(b._id));
    if (Number.isNaN(tA)) return 1;
    if (Number.isNaN(tB)) return -1;
    if (tA !== tB) return tA - tB;
    return String(a._id).localeCompare(String(b._id));
  });
}

async function loadAllTasks(client: ConvexHttpClient): Promise<TaskDoc[]> {
  return await client.query(api.tasks.list, {});
}

async function runGuardrail(client: ConvexHttpClient, requestedMax: unknown) {
  const maxToProcess = asPositiveInt(requestedMax, MAX_GUARDRAIL_PER_RUN, MAX_GUARDRAIL_PER_RUN);
  const allTasks = await loadAllTasks(client);

  const duplicateBlocklist = new Set(
    allTasks
      .filter((task) => task.status === "backlog" || task.status === "in_progress" || task.status === "done")
      .map((task) => normalizeTitle(task.title))
      .filter(Boolean)
  );

  const suggested = sortOldestFirst(allTasks.filter((task) => task.status === "suggested")).slice(0, maxToProcess);

  const accepted: Array<{ id: Id<"tasks">; title: string }> = [];
  const rejected: Array<{ id: Id<"tasks">; title: string; reason: string }> = [];

  for (const task of suggested) {
    const normalized = normalizeTitle(task.title);
    const duplicate = normalized.length > 0 && duplicateBlocklist.has(normalized);
    const riskyOrVagueReason = isRiskyOrVague(task);

    if (duplicate) {
      await client.mutation(api.tasks.remove, { id: task._id });
      rejected.push({ id: task._id, title: task.title, reason: "duplicate_title" });
      continue;
    }

    if (riskyOrVagueReason) {
      await client.mutation(api.tasks.remove, { id: task._id });
      rejected.push({ id: task._id, title: task.title, reason: riskyOrVagueReason });
      continue;
    }

    await client.mutation(api.tasks.updateStatus, { id: task._id, status: "backlog" });
    duplicateBlocklist.add(normalized);
    accepted.push({ id: task._id, title: task.title });
  }

  return {
    ok: true,
    action: "guardrail" as const,
    processed: suggested.length,
    accepted,
    rejected,
    reasons: rejected.map(({ id, reason }) => ({ id, reason })),
  };
}

async function pluginWeeklyProgressReport(ctx: PluginContext): Promise<PluginResult> {
  const doneTasks = sortOldestFirst(ctx.allTasks.filter((t) => t.status === "done")).slice(-15);
  const date = ctx.timestamp.slice(0, 10);
  const reportPath = `${PLUGIN_OUTPUT_DIR}/weekly-progress-${date}.md`;
  const body = [
    `# Weekly Progress Report (${date})`,
    "",
    `Generated by worker: ${ctx.worker}`,
    "",
    "## Recently Completed Tasks",
    ...(doneTasks.length
      ? doneTasks.map((t) => `- ${t.title} (${t.assigned_to})`)
      : ["- No completed tasks yet."]),
    "",
    "## Summary",
    `- Completed count sampled: ${doneTasks.length}`,
    "- Next step: keep mission suggester + guardrail + worker loops active.",
    "",
  ].join("\n");

  const written = await writeTextFile(reportPath, body);
  return {
    pluginId: "weekly_progress_report",
    notes: ["Generated weekly progress report from completed tasks."],
    files: [written],
  };
}

async function pluginMemoryTagger(ctx: PluginContext): Promise<PluginResult> {
  const memoryDir = `${WORKSPACE_ROOT}/memory`;
  let files: string[] = [];
  try {
    files = (await readdir(memoryDir)).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }

  const tagsByFile: Record<string, string[]> = {};
  for (const file of files) {
    const fullPath = `${memoryDir}/${file}`;
    const raw = (await readFile(fullPath, "utf8")).toLowerCase();
    const tags: string[] = [];
    if (/(task|project|build|deploy|ops|workflow)/.test(raw)) tags.push("work");
    if (/(decision|decide|chose|lesson|learned)/.test(raw)) tags.push("decision");
    if (/(todo|next|follow up|pending)/.test(raw)) tags.push("todo");
    if (/(personal|family|health|travel)/.test(raw)) tags.push("personal");
    tagsByFile[file] = tags.length ? tags : ["uncategorized"];
  }

  const date = ctx.timestamp.slice(0, 10);
  const outPath = `${PLUGIN_OUTPUT_DIR}/memory-tags-${date}.json`;
  const payload = JSON.stringify({ generatedAt: ctx.timestamp, tagsByFile }, null, 2);
  const written = await writeTextFile(outPath, payload);

  return {
    pluginId: "memory_tagger",
    notes: [`Tagged ${files.length} memory file(s) into coarse categories.`],
    files: [written],
  };
}

async function pluginCronHealthDashboard(_ctx: PluginContext): Promise<PluginResult> {
  let jobs: Array<{ name?: string; enabled?: boolean; state?: { nextRunAtMs?: number; lastStatus?: string } }> = [];
  try {
    const raw = await readFile(CRON_JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw) as { jobs?: typeof jobs };
    jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    jobs = [];
  }

  const lines = [
    "# Cron Health Dashboard",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| Job | Enabled | Last Status | Next Run |",
    "|---|---|---|---|",
  ];

  for (const job of jobs) {
    const next = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : "-";
    lines.push(`| ${job.name ?? "unnamed"} | ${job.enabled ? "yes" : "no"} | ${job.state?.lastStatus ?? "-"} | ${next} |`);
  }

  if (!jobs.length) lines.push("| (none) | - | - | - |");

  const outPath = `${PLUGIN_OUTPUT_DIR}/cron-health-dashboard.md`;
  const written = await writeTextFile(outPath, `${lines.join("\n")}\n`);

  return {
    pluginId: "cron_health_dashboard",
    notes: ["Generated cron health dashboard from local scheduler state."],
    files: [written],
  };
}

async function pluginTicketTriagePlaybook(ctx: PluginContext): Promise<PluginResult> {
  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/ticket-triage-playbook-${slug}.md`;
  const content = [
    "# Ticket Triage Playbook",
    "",
    "## Priority Rules",
    "- P0: security/data-loss/payment outage",
    "- P1: core workflow broken",
    "- P2: degraded UX/workaround exists",
    "- P3: enhancement request",
    "",
    "## Routing",
    "- Billing -> finance queue",
    "- Access/login -> auth queue",
    "- API errors -> backend queue",
    "- UI defects -> frontend queue",
    "",
    "## SLA Targets",
    "- P0: 15 min acknowledge",
    "- P1: 1h acknowledge",
    "- P2/P3: same business day",
    "",
  ].join("\n");
  const written = await writeTextFile(outPath, content);

  return {
    pluginId: "ticket_triage_playbook",
    notes: ["Generated deterministic triage playbook and routing rules."],
    files: [written],
  };
}

async function pluginDefault(ctx: PluginContext): Promise<PluginResult> {
  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/execution-note-${slug}.md`;
  const content = [
    `# Execution Note: ${ctx.task.title}`,
    "",
    `Generated at: ${ctx.timestamp}`,
    `Worker: ${ctx.worker}`,
    "",
    "This task did not match a specialized plugin, so a default deterministic execution note was produced.",
    "",
  ].join("\n");
  const written = await writeTextFile(outPath, content);
  return {
    pluginId: "default_executor",
    notes: ["Used default executor plugin."],
    files: [written],
  };
}

const EXECUTOR_PLUGINS: ExecutorPlugin[] = [
  {
    id: "weekly_progress_report",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("weekly") && t.includes("report");
    },
    run: pluginWeeklyProgressReport,
  },
  {
    id: "memory_tagger",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("memory") && t.includes("tag");
    },
    run: pluginMemoryTagger,
  },
  {
    id: "cron_health_dashboard",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("cron") && t.includes("dashboard");
    },
    run: pluginCronHealthDashboard,
  },
  {
    id: "ticket_triage_playbook",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("ticket") && t.includes("triage");
    },
    run: pluginTicketTriagePlaybook,
  },
];

function makeExecutionMarkdown(task: TaskDoc, worker: Assignee, timestamp: string, plugin: PluginResult): string {
  const description = task.description?.trim() ? task.description : "No description provided.";
  return [
    `# Execution: ${task.title}`,
    "",
    `- Task ID: ${task._id}`,
    `- Worker: ${worker}`,
    `- Assignee: ${task.assigned_to}`,
    `- Plugin: ${plugin.pluginId}`,
    `- Status Flow: backlog -> in_progress -> done`,
    `- Timestamp (UTC): ${timestamp}`,
    "",
    "## Description",
    description,
    "",
    "## Plugin Notes",
    ...plugin.notes.map((n) => `- ${n}`),
    "",
    "## Generated Files",
    ...plugin.files.map((f) => `- ${f}`),
    "",
    "## Checklist",
    "- [x] Claimed task",
    "- [x] Ran executor plugin",
    "- [x] Created execution artifact",
    "- [x] Completed deterministic worker flow",
    "",
  ].join("\n");
}

async function runWorker(client: ConvexHttpClient, requestedAssignee: unknown, requestedMax: unknown) {
  const maxToProcess = asPositiveInt(requestedMax, 1, 1);
  const assignee = normalizeAssignee(requestedAssignee, "agent");
  const allTasks = await loadAllTasks(client);

  const backlog = sortOldestFirst(allTasks.filter((task) => task.status === "backlog"));

  let selected = backlog.find((task) => task.assigned_to === assignee);
  if (!selected && assignee === "sam") {
    selected = backlog.find((task) => task.assigned_to === "agent");
  }

  if (!selected || maxToProcess < 1) {
    return {
      ok: true,
      action: "worker" as const,
      worker: assignee,
      processed: 0,
      message: "no_matching_backlog_task",
    };
  }

  await client.mutation(api.tasks.updateStatus, { id: selected._id, status: "in_progress" });

  const timestamp = new Date().toISOString();
  const plugin = EXECUTOR_PLUGINS.find((p) => p.match(selected));
  const pluginResult = plugin
    ? await plugin.run({ task: selected, allTasks, worker: assignee, timestamp })
    : await pluginDefault({ task: selected, allTasks, worker: assignee, timestamp });

  const artifactPath = `${EXECUTIONS_DIR}/${selected._id}.md`;
  const markdown = makeExecutionMarkdown(selected, assignee, timestamp, pluginResult);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, markdown, "utf8");

  const previousDescription = selected.description?.trim() ?? "";
  const artifactLines = [
    `Execution artifact: ${artifactPath}`,
    ...pluginResult.files.map((f) => `Generated file: ${f}`),
  ].join("\n");
  const newDescription = previousDescription ? `${previousDescription}\n\n${artifactLines}` : artifactLines;

  await client.mutation(api.tasks.updateTask, {
    id: selected._id,
    description: newDescription,
  });

  await client.mutation(api.tasks.updateStatus, { id: selected._id, status: "done" });

  return {
    ok: true,
    action: "worker" as const,
    worker: assignee,
    processed: 1,
    task: {
      id: selected._id,
      title: selected.title,
      plugin: pluginResult.pluginId,
      artifactPath,
      generatedFiles: pluginResult.files,
      startedAt: timestamp,
      finishedStatus: "done" as const,
    },
  };
}


async function collectPluginMetrics() {
  const counts: Record<string, number> = {};
  let totalExecutions = 0;

  let files: string[] = [];
  try {
    files = (await readdir(EXECUTIONS_DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }

  for (const file of files) {
    try {
      const raw = await readFile(`${EXECUTIONS_DIR}/${file}`, "utf8");
      const match = raw.match(/^- Plugin:\s*(.+)$/m);
      const plugin = match?.[1]?.trim() || "unknown";
      counts[plugin] = (counts[plugin] ?? 0) + 1;
      totalExecutions += 1;
    } catch {
      // ignore unreadable execution files
    }
  }

  const byPlugin = Object.entries(counts)
    .map(([plugin, count]) => ({ plugin, count }))
    .sort((a, b) => b.count - a.count || a.plugin.localeCompare(b.plugin));

  return { totalExecutions, byPlugin };
}

async function runStatus(client: ConvexHttpClient) {
  const allTasks = await loadAllTasks(client);

  const byStatus: Record<Status, number> = {
    suggested: 0,
    backlog: 0,
    in_progress: 0,
    done: 0,
  };
  const byAssignee: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    agent: 0,
  };

  for (const task of allTasks) {
    byStatus[task.status] += 1;
    byAssignee[task.assigned_to] += 1;
  }

  const pluginMetrics = await collectPluginMetrics();

  return {
    ok: true,
    action: "status" as const,
    total: allTasks.length,
    byStatus,
    byAssignee,
    pluginMetrics,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as Record<string, unknown>)?.action ?? "status").toLowerCase() as Action;

    const client = getClient();

    if (action === "guardrail") {
      const result = await runGuardrail(client, (body as Record<string, unknown>).max);
      return NextResponse.json(result);
    }

    if (action === "worker") {
      const result = await runWorker(
        client,
        (body as Record<string, unknown>).assignee,
        (body as Record<string, unknown>).max
      );
      return NextResponse.json(result);
    }

    if (action === "status") {
      const result = await runStatus(client);
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
