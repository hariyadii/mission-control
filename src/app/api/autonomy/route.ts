import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { exec as execCallback } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

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
const EXECUTOR_RUN_LOG_FILE = `${WORKSPACE_ROOT}/autonomy/metrics/executor-runs.jsonl`;
const POLICY_FILE = `${WORKSPACE_ROOT}/autonomy/policy.json`;
const EXTERNAL_ACTION_LOG_FILE = `${WORKSPACE_ROOT}/autonomy/metrics/external-actions.jsonl`;
const CRON_JOBS_FILE = "/home/ubuntu/.openclaw/cron/jobs.json";
const MAX_GUARDRAIL_PER_RUN = 3;
const exec = promisify(execCallback);

type ExternalRisk = "low" | "medium" | "high";
type AutonomyPolicy = {
  killSwitch: boolean;
  allowHighRiskExternalActions: boolean;
  external: {
    maxActionsPerDay: number;
    xMode: string;
  };
  capitalLane: {
    mode: string;
  };
};

const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  killSwitch: false,
  allowHighRiskExternalActions: true,
  external: {
    maxActionsPerDay: 100,
    xMode: "browse",
  },
  capitalLane: {
    mode: "paper",
  },
};

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

async function loadPolicy(): Promise<AutonomyPolicy> {
  try {
    const raw = await readFile(POLICY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AutonomyPolicy>;
    return {
      killSwitch: typeof parsed.killSwitch === "boolean" ? parsed.killSwitch : DEFAULT_AUTONOMY_POLICY.killSwitch,
      allowHighRiskExternalActions:
        typeof parsed.allowHighRiskExternalActions === "boolean"
          ? parsed.allowHighRiskExternalActions
          : DEFAULT_AUTONOMY_POLICY.allowHighRiskExternalActions,
      external: {
        maxActionsPerDay:
          typeof parsed.external?.maxActionsPerDay === "number" && parsed.external.maxActionsPerDay > 0
            ? Math.floor(parsed.external.maxActionsPerDay)
            : DEFAULT_AUTONOMY_POLICY.external.maxActionsPerDay,
        xMode: typeof parsed.external?.xMode === "string" ? parsed.external.xMode : DEFAULT_AUTONOMY_POLICY.external.xMode,
      },
      capitalLane: {
        mode:
          typeof parsed.capitalLane?.mode === "string"
            ? parsed.capitalLane.mode
            : DEFAULT_AUTONOMY_POLICY.capitalLane.mode,
      },
    };
  } catch {
    await mkdir(dirname(POLICY_FILE), { recursive: true });
    await writeFile(POLICY_FILE, `${JSON.stringify(DEFAULT_AUTONOMY_POLICY, null, 2)}\n`, "utf8");
    return DEFAULT_AUTONOMY_POLICY;
  }
}

async function countExternalActionsToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = await readFile(EXTERNAL_ACTION_LOG_FILE, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce((count, line) => {
        try {
          const parsed = JSON.parse(line) as { timestamp?: string };
          return typeof parsed.timestamp === "string" && parsed.timestamp.startsWith(today) ? count + 1 : count;
        } catch {
          return count;
        }
      }, 0);
  } catch {
    return 0;
  }
}

async function appendExternalActionLog(entry: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(EXTERNAL_ACTION_LOG_FILE), { recursive: true });
  await appendFile(EXTERNAL_ACTION_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

async function enforceExternalActionPolicy(risk: ExternalRisk): Promise<AutonomyPolicy> {
  const policy = await loadPolicy();
  if (policy.killSwitch) {
    throw new Error("autonomy kill switch is enabled");
  }
  if (risk === "high" && !policy.allowHighRiskExternalActions) {
    throw new Error("high risk external actions are disabled by policy");
  }
  const actionsToday = await countExternalActionsToday();
  if (actionsToday >= policy.external.maxActionsPerDay) {
    throw new Error(`external action limit reached (${policy.external.maxActionsPerDay}/day)`);
  }
  return policy;
}

async function runCommand(cmd: string): Promise<string> {
  const { stdout, stderr } = await exec(cmd, { cwd: WORKSPACE_ROOT, maxBuffer: 5 * 1024 * 1024, shell: "/bin/bash" });
  const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
  return output;
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

async function pluginXScout(ctx: PluginContext): Promise<PluginResult> {
  const policy = await enforceExternalActionPolicy("medium");
  if (policy.external.xMode !== "browse") {
    throw new Error(`x_scout requires external.xMode=browse, got ${policy.external.xMode}`);
  }

  const timelineCommand = "x timeline | head -n 120";
  const searchCommand = 'x search "ai automation agents" Latest | head -n 120';
  const [timelineOutput, searchOutput] = await Promise.all([runCommand(timelineCommand), runCommand(searchCommand)]);

  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/x-scout-${slug}.md`;
  const content = [
    "# X Scout Report",
    "",
    `Generated at: ${ctx.timestamp}`,
    `Worker: ${ctx.worker}`,
    `Task: ${ctx.task.title}`,
    "",
    "## Command 1",
    `\`${timelineCommand}\``,
    "",
    "```text",
    timelineOutput || "(no output)",
    "```",
    "",
    "## Command 2",
    `\`${searchCommand}\``,
    "",
    "```text",
    searchOutput || "(no output)",
    "```",
    "",
  ].join("\n");

  const written = await writeTextFile(outPath, content);
  await appendExternalActionLog({
    timestamp: new Date().toISOString(),
    plugin: "x_scout",
    risk: "medium",
    status: "success",
    taskId: String(ctx.task._id),
    title: ctx.task.title,
    commands: [timelineCommand, searchCommand],
    reportPath: written,
  });

  return {
    pluginId: "x_scout",
    notes: ["Collected X timeline + targeted search results and wrote scout report."],
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
  {
    id: "x_scout",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("x scout") || t.includes("x com") || t.includes("twitter") || t.includes("trend") || t.includes("meme");
    },
    run: pluginXScout,
  },
];

type RunStatus = "success" | "failed";
type WorkerRunLogEntry = {
  timestamp: string;
  plugin: string;
  status: RunStatus;
  durationMs: number;
  worker: Assignee;
  taskId: string;
  title: string;
};

type LegacyExecutionEntry = {
  timestamp: string;
  plugin: string;
  taskId: string;
  title: string;
};

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

async function appendExecutorRunLog(entry: WorkerRunLogEntry): Promise<void> {
  await mkdir(dirname(EXECUTOR_RUN_LOG_FILE), { recursive: true });
  await appendFile(EXECUTOR_RUN_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

async function appendFailureNote(client: ConvexHttpClient, task: TaskDoc, errorMessage: string, timestamp: string): Promise<void> {
  const previousDescription = task.description?.trim() ?? "";
  const failureNote = `Worker failure (${timestamp}): ${errorMessage}`;
  const newDescription = previousDescription ? `${previousDescription}\n\n${failureNote}` : failureNote;
  await client.mutation(api.tasks.updateTask, {
    id: task._id,
    description: newDescription,
  });
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

  const runStartedAt = Date.now();
  const timestamp = new Date(runStartedAt).toISOString();
  const plugin = EXECUTOR_PLUGINS.find((p) => p.match(selected));
  const pluginId = plugin?.id ?? "default_executor";
  let pluginResult: PluginResult;

  try {
    pluginResult = plugin
      ? await plugin.run({ task: selected, allTasks, worker: assignee, timestamp })
      : await pluginDefault({ task: selected, allTasks, worker: assignee, timestamp });
  } catch (error) {
    const durationMs = Date.now() - runStartedAt;
    const errorMessage = error instanceof Error ? error.message : "unknown plugin execution error";

    await appendExecutorRunLog({
      timestamp: new Date().toISOString(),
      plugin: pluginId,
      status: "failed",
      durationMs,
      worker: assignee,
      taskId: String(selected._id),
      title: selected.title,
    }).catch(() => undefined);

    await client.mutation(api.tasks.updateStatus, { id: selected._id, status: "backlog" });
    await appendFailureNote(client, selected, errorMessage, new Date().toISOString());

    return {
      ok: true,
      action: "worker" as const,
      worker: assignee,
      processed: 0,
      failed: 1,
      message: "plugin_execution_failed",
      task: {
        id: selected._id,
        title: selected.title,
        plugin: pluginId,
        finishedStatus: "backlog" as const,
      },
      error: errorMessage,
    };
  }

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
  await appendExecutorRunLog({
    timestamp: new Date().toISOString(),
    plugin: pluginResult.pluginId,
    status: "success",
    durationMs: Date.now() - runStartedAt,
    worker: assignee,
    taskId: String(selected._id),
    title: selected.title,
  }).catch(() => undefined);

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
  const logs: WorkerRunLogEntry[] = [];
  try {
    const raw = await readFile(EXECUTOR_RUN_LOG_FILE, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<WorkerRunLogEntry>;
        if (
          typeof parsed.timestamp === "string" &&
          typeof parsed.plugin === "string" &&
          (parsed.status === "success" || parsed.status === "failed") &&
          typeof parsed.durationMs === "number" &&
          typeof parsed.worker === "string" &&
          typeof parsed.taskId === "string" &&
          typeof parsed.title === "string"
        ) {
          logs.push({
            timestamp: parsed.timestamp,
            plugin: parsed.plugin,
            status: parsed.status,
            durationMs: parsed.durationMs,
            worker: normalizeAssignee(parsed.worker),
            taskId: parsed.taskId,
            title: parsed.title,
          });
        }
      } catch {
        // ignore malformed json lines
      }
    }
  } catch {
    // no logs yet
  }

  const successfulTaskIds = new Set(logs.filter((r) => r.status === "success").map((r) => r.taskId));
  const legacyEntries: LegacyExecutionEntry[] = [];
  let files: string[] = [];
  try {
    files = (await readdir(EXECUTIONS_DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }

  for (const file of files) {
    const taskId = file.replace(/\.md$/i, "");
    if (successfulTaskIds.has(taskId)) continue;
    try {
      const raw = await readFile(`${EXECUTIONS_DIR}/${file}`, "utf8");
      const pluginMatch = raw.match(/^- Plugin:\s*(.+)$/m);
      const titleMatch = raw.match(/^# Execution:\s*(.+)$/m);
      const timestampMatch = raw.match(/^- Timestamp \(UTC\):\s*(.+)$/m);
      legacyEntries.push({
        timestamp: timestampMatch?.[1]?.trim() || new Date(0).toISOString(),
        plugin: pluginMatch?.[1]?.trim() || "unknown",
        taskId,
        title: titleMatch?.[1]?.trim() || taskId,
      });
    } catch {
      // ignore unreadable execution files
    }
  }

  const allRuns: WorkerRunLogEntry[] = [
    ...logs,
    ...legacyEntries.map((entry) => ({
      timestamp: entry.timestamp,
      plugin: entry.plugin,
      status: "success" as const,
      durationMs: 0,
      worker: "agent" as const,
      taskId: entry.taskId,
      title: entry.title,
    })),
  ];

  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const daySlots = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(dayStart);
    d.setUTCDate(dayStart.getUTCDate() - (6 - idx));
    return d.toISOString().slice(0, 10);
  });
  const slotIndexByDate = new Map(daySlots.map((date, idx) => [date, idx]));

  const byPluginMap = new Map<
    string,
    {
      plugin: string;
      runs: number;
      success: number;
      failed: number;
      durationTotalMs: number;
      durationCount: number;
      lastRunAt: string | null;
      sparkline: number[];
    }
  >();

  for (const run of allRuns) {
    const current = byPluginMap.get(run.plugin) ?? {
      plugin: run.plugin,
      runs: 0,
      success: 0,
      failed: 0,
      durationTotalMs: 0,
      durationCount: 0,
      lastRunAt: null,
      sparkline: [0, 0, 0, 0, 0, 0, 0],
    };

    current.runs += 1;
    if (run.status === "success") current.success += 1;
    if (run.status === "failed") current.failed += 1;
    if (run.durationMs > 0) {
      current.durationTotalMs += run.durationMs;
      current.durationCount += 1;
    }

    const runTime = Date.parse(run.timestamp);
    if (!Number.isNaN(runTime)) {
      if (!current.lastRunAt || runTime > Date.parse(current.lastRunAt)) {
        current.lastRunAt = new Date(runTime).toISOString();
      }
      const dateKey = new Date(runTime).toISOString().slice(0, 10);
      const slotIndex = slotIndexByDate.get(dateKey);
      if (slotIndex !== undefined) {
        current.sparkline[slotIndex] += 1;
      }
    }

    byPluginMap.set(run.plugin, current);
  }

  const byPlugin = Array.from(byPluginMap.values())
    .map((item) => ({
      plugin: item.plugin,
      runs: item.runs,
      success: item.success,
      failed: item.failed,
      successRate: item.runs > 0 ? Number(((item.success / item.runs) * 100).toFixed(1)) : 0,
      avgDurationMs: item.durationCount > 0 ? Math.round(item.durationTotalMs / item.durationCount) : 0,
      lastRunAt: item.lastRunAt,
      sparkline: item.sparkline,
    }))
    .sort((a, b) => b.runs - a.runs || a.plugin.localeCompare(b.plugin));

  return { totalExecutions: allRuns.length, byPlugin };
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
