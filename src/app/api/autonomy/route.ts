import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type Assignee = "me" | "alex" | "sam" | "agent";
type Status = "suggested" | "backlog" | "in_progress" | "done";
type Action = "guardrail" | "worker" | "status";
type TaskDoc = Doc<"tasks">;

const EXECUTIONS_DIR = "/home/ubuntu/.openclaw/workspace/autonomy/executions";
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

function makeExecutionMarkdown(task: TaskDoc, worker: Assignee, timestamp: string): string {
  const description = task.description?.trim() ? task.description : "No description provided.";
  return [
    `# Execution: ${task.title}`,
    "",
    `- Task ID: ${task._id}`,
    `- Worker: ${worker}`,
    `- Assignee: ${task.assigned_to}`,
    `- Status Flow: backlog -> in_progress -> done`,
    `- Timestamp (UTC): ${timestamp}`,
    "",
    "## Description",
    description,
    "",
    "## Checklist",
    "- [x] Claimed task",
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
  const artifactPath = `${EXECUTIONS_DIR}/${selected._id}.md`;
  const markdown = makeExecutionMarkdown(selected, assignee, timestamp);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, markdown, "utf8");

  const previousDescription = selected.description?.trim() ?? "";
  const artifactLine = `Execution artifact: ${artifactPath}`;
  const newDescription = previousDescription
    ? `${previousDescription}\n\n${artifactLine}`
    : artifactLine;

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
      artifactPath,
      startedAt: timestamp,
      finishedStatus: "done" as const,
    },
  };
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

  return {
    ok: true,
    action: "status" as const,
    total: allTasks.length,
    byStatus,
    byAssignee,
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
