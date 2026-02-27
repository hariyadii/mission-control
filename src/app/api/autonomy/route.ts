import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { exec as execCallback } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type Assignee = "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";
type Status = "suggested" | "backlog" | "in_progress" | "blocked" | "done";
type Action =
  | "guardrail"
  | "worker"
  | "claim"
  | "heartbeat"
  | "complete"
  | "status"
  | "kicker"
  | "normalize_states"
  | "validation_cleanup";
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
const WORKFLOW_ALERT_STATE_FILE = `${WORKSPACE_ROOT}/reports/workflow-alert-state.json`;
const OPS_STATE_FILE = `${WORKSPACE_ROOT}/reports/ops-incident-state.json`;
const HANDOFF_STATE_FILE = `${WORKSPACE_ROOT}/reports/handoff-state.json`;
const OPS_MONITOR_LOG_FILE = `${WORKSPACE_ROOT}/reports/ops-monitor-cycle.log`;
const OPS_WORKER_LOG_FILE = `${WORKSPACE_ROOT}/reports/ops-worker-cycle.log`;
const OPS_MONITOR_TIMER_UNIT = "openclaw-ops-monitor.timer";
const OPS_WORKER_TIMER_UNIT = "openclaw-ops-worker.timer";
const OPS_MONITOR_SUCCESS_SLA_MINUTES = 15;
const OPS_WORKER_SUCCESS_SLA_MINUTES = 20;
const MISSION_CONTROL_ROOT = "/home/ubuntu/mission-control";
const DEPLOY_STATE_FILE = `${MISSION_CONTROL_ROOT}/.deploy/last-deploy.json`;
const CRON_JOBS_FILE = "/home/ubuntu/.openclaw/cron/jobs.json";
const OPENCLAW_PATH_PREFIX = ["/home/ubuntu/.npm-global/bin", "/home/ubuntu/.bun/bin"].join(":");
const DRAFTS_SUBPATH = "autonomy/drafts";
const ASSIGNEE_WORKSPACES: Record<Exclude<Assignee, "me" | "agent">, string> = {
  alex: "/home/ubuntu/.openclaw/workspace",
  sam: "/home/ubuntu/.openclaw/workspace-sam",
  lyra: "/home/ubuntu/.openclaw/workspace-lyra",
  nova: "/home/ubuntu/.openclaw/workspace-nova",
  ops: "/home/ubuntu/.openclaw/workspace-ops",
};
const DRAFT_REQUIRED_ASSIGNEES = new Set<Assignee>(["alex", "sam", "lyra", "nova", "ops"]);
const MAX_GUARDRAIL_PER_RUN = 20;
const KICKER_GUARDRAIL_MIN_SUGGESTED_AGE_MINUTES = 2;
const THROUGHPUT_TARGET_PER_DAY = 8;
const THROUGHPUT_TARGET_ASSIGNEES: Assignee[] = ["alex", "sam", "lyra", "nova"];
const THROUGHPUT_WAKE_ASSIGNEES: Assignee[] = ["sam", "lyra", "nova"];
const THROUGHPUT_POLICY_BLOCKED_REASONS = new Set([
  "validation_contract_mismatch",
  "market_regime_constraint",
  "platform_constraint",
  "rate_limit_constraint",
  "external_constraint",
  "duplicate_incident_ticket",
]);
const GUARDRAIL_REVISION_MARKER = "guardrail_revision_v1:true";
const REVISIONABLE_GUARDRAIL_REASONS = new Set([
  "title_too_short",
  "task_too_vague",
  "description_too_short",
]);
const WIP_CAP_BY_ASSIGNEE: Record<Assignee, number> = {
  me: 1,
  alex: 2,
  sam: 4,
  lyra: 4,
  nova: 4,
  ops: 2,
  agent: 1,
};
const LEASE_MINUTES_BY_ASSIGNEE: Record<Assignee, number> = {
  me: 45,
  alex: 45,
  sam: 45,
  lyra: 75,
  nova: 45,
  ops: 45,
  agent: 45,
};
const RETRY_BACKOFF_MINUTES = [15, 60, 240];
const WORKFLOW_CRITICAL_ALERT_PREFIXES = ["backlog_idle:", "median_cycle_time_high:"];
const BLOCKED_REASON_PATTERNS: Array<{ reason: string; pattern: RegExp; unblock: string }> = [
  {
    reason: "market_regime_constraint",
    pattern: /(market\s+regime|regime\s+mismatch|adverse\s+market|no\s+edge|insufficient\s+liquidity|volatility\s+spike)/i,
    unblock: "market_regime_changes_or_new_signal",
  },
  {
    reason: "platform_constraint",
    pattern: /(platform\s+constraint|platform\s+limit|api\s+unavailable|service\s+down|maintenance\s+window|dependency\s+outage)/i,
    unblock: "platform_or_dependency_recovers",
  },
  {
    reason: "rate_limit_constraint",
    pattern: /(rate[\s_-]?limit|quota\s+exceeded|throttl)/i,
    unblock: "quota_window_resets",
  },
];
const BLOCKED_ALERT_IGNORE_REASONS = new Set(["duplicate_incident_ticket", "validation_contract_mismatch"]);
const BLOCKED_ALERT_MAX_AGE_MINUTES = 6 * 60;
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

const DEPLOY_INTENT_KEYWORDS = [
  "deploy",
  "deployment",
  "cron",
  "schedule",
  "invoker",
  "invoke",
  "wired",
  "integration",
  "integrate",
  "evidence",
  "artifact_path",
  "worker loop",
];

const UI_BROAD_KEYWORDS = [
  "improve ui",
  "improve ux",
  "overall ui",
  "overall ux",
  "improve mission control",
  "better ui",
  "better ux",
  "modernize ui",
  "redesign ui",
  "polish ui",
];

const CHALLENGER_TRIGGER_KEYWORDS = [
  "high-impact",
  "high impact",
  "new-build",
  "new build",
  "strategy",
  "architecture",
  "critical",
  "core workflow",
  "breaking change",
  "migration",
];

const CHALLENGER_ASSIGNEE_MAP: Partial<Record<Assignee, Assignee>> = {
  sam: "lyra",
  lyra: "sam",
  nova: "sam",
};

type UiSplitSpec = {
  title: string;
  description: string;
  assigned_to: Assignee;
  idempotency_key: string;
};

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
  if (
    normalized === "me" ||
    normalized === "alex" ||
    normalized === "sam" ||
    normalized === "lyra" ||
    normalized === "nova" ||
    normalized === "ops" ||
    normalized === "agent"
  ) {
    return normalized;
  }
  return fallback;
}

function parseLastHeartbeatMs(description?: string): number | null {
  if (!description) return null;
  const regex = /Heartbeat:\s*([0-9T:\-.+Z]+)\s+by\s+\w+/g;
  let latestRaw: string | undefined;
  for (let m = regex.exec(description); m !== null; m = regex.exec(description)) {
    latestRaw = m[1];
  }
  if (!latestRaw) return null;
  const parsed = Date.parse(latestRaw);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripStaleLeaseMarkers(description?: string): string {
  if (!description) return "";
  return description
    .split("\n")
    .filter((line) => !line.trim().startsWith("stale_lease_requeued:"))
    .join("\n")
    .trim();
}

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function parseCreatedAtMs(task: Pick<TaskDoc, "created_at">): number | null {
  const ms = Date.parse(task.created_at);
  return Number.isFinite(ms) ? ms : null;
}

function ageMinutesFromCreatedAt(task: Pick<TaskDoc, "created_at">, nowMs = Date.now()): number {
  const createdMs = parseCreatedAtMs(task);
  if (createdMs === null) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / 60000));
}

function parseUpdatedAtMs(task: Pick<TaskDoc, "updated_at">): number | null {
  const ms = Date.parse(String(task.updated_at ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

function ageMinutesFromUpdatedAt(task: Pick<TaskDoc, "updated_at">, nowMs = Date.now()): number {
  const updatedMs = parseUpdatedAtMs(task);
  if (updatedMs === null) return 0;
  return Math.max(0, Math.floor((nowMs - updatedMs) / 60000));
}

function backlogAgeMinutes(task: Pick<TaskDoc, "created_at" | "updated_at">, nowMs = Date.now()): number {
  const byUpdated = ageMinutesFromUpdatedAt(task, nowMs);
  if (byUpdated > 0) return byUpdated;
  return ageMinutesFromCreatedAt(task, nowMs);
}

function isActionableBlockedForAlert(task: TaskDoc, nowMs: number): boolean {
  if (task.status !== "blocked") return false;
  const reason = String(task.blocked_reason ?? "").trim();
  if (reason && BLOCKED_ALERT_IGNORE_REASONS.has(reason)) return false;
  const ageMinutes = backlogAgeMinutes(task, nowMs);
  if (ageMinutes > BLOCKED_ALERT_MAX_AGE_MINUTES) return false;
  return true;
}

function hasGuardrailRevisionMarker(description?: string): boolean {
  return (description ?? "").toLowerCase().includes(GUARDRAIL_REVISION_MARKER);
}

function isRealtimeRevisionReason(reason: string | null): boolean {
  if (!reason) return false;
  if (reason.startsWith("vague_keyword:")) return true;
  return REVISIONABLE_GUARDRAIL_REASONS.has(reason);
}

function completionTimestampMs(task: Pick<TaskDoc, "updated_at" | "created_at">): number | null {
  const updatedMs = parseUpdatedAtMs(task);
  if (updatedMs !== null) return updatedMs;
  return parseCreatedAtMs(task);
}

function collectDoneByAssigneeLast24h(
  tasks: TaskDoc[],
  nowMs = Date.now(),
  includeTask: (task: TaskDoc) => boolean = () => true
): Record<Assignee, number> {
  const doneByAssignee: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  const cutoffMs = nowMs - 24 * 60 * 60 * 1000;
  for (const task of tasks) {
    if (task.status !== "done") continue;
    if (!includeTask(task)) continue;
    const finishedAtMs = completionTimestampMs(task);
    if (finishedAtMs === null || finishedAtMs < cutoffMs) continue;
    doneByAssignee[task.assigned_to] += 1;
  }
  return doneByAssignee;
}

function collectPolicyBlockedCredits(tasks: TaskDoc[], nowMs = Date.now()): Record<Assignee, number> {
  const credits: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  const cutoffMs = nowMs - 24 * 60 * 60 * 1000;
  for (const task of tasks) {
    if (task.status !== "blocked") continue;
    const reason = String(task.blocked_reason ?? "").trim();
    if (!THROUGHPUT_POLICY_BLOCKED_REASONS.has(reason)) continue;
    const taskMs = completionTimestampMs(task);
    if (taskMs === null || taskMs < cutoffMs) continue;
    credits[task.assigned_to] += 1;
  }
  return credits;
}

function collectThroughputDeficit(doneByAssigneeLast24h: Record<Assignee, number>): Record<Assignee, number> {
  const deficit: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  for (const assignee of THROUGHPUT_TARGET_ASSIGNEES) {
    const done = doneByAssigneeLast24h[assignee] ?? 0;
    deficit[assignee] = Math.max(0, THROUGHPUT_TARGET_PER_DAY - done);
  }
  return deficit;
}

function collectThroughputQualityPenalty(
  doneByAssigneeLast24h: Record<Assignee, number>,
  doneVerifiedPassByAssigneeLast24h: Record<Assignee, number>
): Record<Assignee, number> {
  const penalty: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  (Object.keys(penalty) as Assignee[]).forEach((assignee) => {
    const rawDone = doneByAssigneeLast24h[assignee] ?? 0;
    const verified = doneVerifiedPassByAssigneeLast24h[assignee] ?? 0;
    penalty[assignee] = Math.max(0, rawDone - verified);
  });
  return penalty;
}

function sumThroughputDeficit(deficitByAssignee: Record<Assignee, number>): number {
  return THROUGHPUT_TARGET_ASSIGNEES.reduce((sum, assignee) => sum + (deficitByAssignee[assignee] ?? 0), 0);
}

function classifyBlockedOutcome(output: string, validationReason?: string): {
  blocked: boolean;
  blockedReason?: string;
  blockedUntil?: string;
  unblockSignal?: string;
} {
  const combined = `${output}\n${validationReason ?? ""}`.toLowerCase();
  for (const rule of BLOCKED_REASON_PATTERNS) {
    if (rule.pattern.test(combined)) {
      return {
        blocked: true,
        blockedReason: rule.reason,
        blockedUntil: "condition_based",
        unblockSignal: rule.unblock,
      };
    }
  }

  if (/(cannot proceed|blocked by|waiting for|temporarily halted|dependency not ready)/i.test(combined)) {
    return {
      blocked: true,
      blockedReason: "external_constraint",
      blockedUntil: "condition_based",
      unblockSignal: "external_dependency_available",
    };
  }

  return { blocked: false };
}

type WorkflowAlertState = {
  alerts: string[];
  criticalAlerts: string[];
  consecutive: number;
  criticalConsecutive: number;
  updatedAt: string;
};

type OpsIncidentState = {
  status: "normal" | "warning" | "critical" | "recovering";
  consecutiveCriticalChecks: number;
  queueStallMinutes: number;
  lastAutoRemediationAction: string;
  lastAutoRemediationActionEffective: boolean;
  opsExecutorHealthy: boolean;
  updatedAt: string;
};

type OpsHealthSource = "systemd" | "cron" | "none";

type SystemdUnitHealth = {
  unit: string;
  exists: boolean;
  activeState: string;
  subState: string;
  result: string;
  stateChangeTimestamp: string;
};

type OpsSystemdHealth = {
  source: OpsHealthSource;
  timersHealthy: boolean;
  monitorLastSuccessAt: string | null;
  workerLastSuccessAt: string | null;
  executorHealthy: boolean;
};

type HandoffStateMeta = {
  snapshotValid: boolean;
  readinessSource: "script" | "api_fallback" | "error" | "unknown";
  generatedFrom: string;
  generatedAt: string | null;
};

function isCriticalWorkflowAlert(alert: string): boolean {
  return WORKFLOW_CRITICAL_ALERT_PREFIXES.some((prefix) => alert.startsWith(prefix));
}

async function loadWorkflowAlertState(): Promise<WorkflowAlertState> {
  try {
    const raw = await readFile(WORKFLOW_ALERT_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkflowAlertState>;
    if (Array.isArray(parsed.alerts) && typeof parsed.consecutive === "number") {
      return {
        alerts: parsed.alerts.map((item) => String(item)),
        criticalAlerts: Array.isArray(parsed.criticalAlerts) ? parsed.criticalAlerts.map((item) => String(item)) : [],
        consecutive: Math.max(0, Math.floor(parsed.consecutive)),
        criticalConsecutive:
          typeof parsed.criticalConsecutive === "number" ? Math.max(0, Math.floor(parsed.criticalConsecutive)) : 0,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      };
    }
  } catch {
    // no previous state
  }
  return { alerts: [], criticalAlerts: [], consecutive: 0, criticalConsecutive: 0, updatedAt: new Date(0).toISOString() };
}

async function saveWorkflowAlertState(state: WorkflowAlertState): Promise<void> {
  await mkdir(dirname(WORKFLOW_ALERT_STATE_FILE), { recursive: true });
  await writeFile(WORKFLOW_ALERT_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function loadOpsIncidentState(): Promise<OpsIncidentState> {
  try {
    const raw = await readFile(OPS_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<OpsIncidentState>;
    const status = String(parsed.status ?? "normal");
    const allowed = new Set(["normal", "warning", "critical", "recovering"]);
    return {
      status: allowed.has(status) ? (status as OpsIncidentState["status"]) : "normal",
      consecutiveCriticalChecks: Math.max(0, Math.floor(Number(parsed.consecutiveCriticalChecks ?? 0))),
      queueStallMinutes: Math.max(0, Math.floor(Number(parsed.queueStallMinutes ?? 0))),
      lastAutoRemediationAction: String(parsed.lastAutoRemediationAction ?? "none"),
      lastAutoRemediationActionEffective: parsed.lastAutoRemediationActionEffective === true,
      opsExecutorHealthy: parsed.opsExecutorHealthy !== false,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return {
      status: "normal",
      consecutiveCriticalChecks: 0,
      queueStallMinutes: 0,
      lastAutoRemediationAction: "none",
      lastAutoRemediationActionEffective: false,
      opsExecutorHealthy: false,
      updatedAt: new Date(0).toISOString(),
    };
  }
}

async function loadHandoffStateMeta(): Promise<HandoffStateMeta> {
  try {
    const raw = await readFile(HANDOFF_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<{
      snapshot_valid: boolean;
      readiness_source: "script" | "api_fallback" | "error" | "unknown";
      generated_from: string;
      timestamp: string;
    }>;
    const readinessSource =
      parsed.readiness_source === "script" ||
      parsed.readiness_source === "api_fallback" ||
      parsed.readiness_source === "error" ||
      parsed.readiness_source === "unknown"
        ? parsed.readiness_source
        : "unknown";
    const generatedAt = typeof parsed.timestamp === "string" && parsed.timestamp.length > 0 ? parsed.timestamp : null;
    const generatedFrom =
      typeof parsed.generated_from === "string" && parsed.generated_from.trim().length > 0
        ? parsed.generated_from.trim()
        : "ops-autopilot";
    return {
      snapshotValid: parsed.snapshot_valid === true,
      readinessSource,
      generatedFrom,
      generatedAt,
    };
  } catch {
    return {
      snapshotValid: false,
      readinessSource: "unknown",
      generatedFrom: "unknown",
      generatedAt: null,
    };
  }
}

function parseSystemdShow(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    map[key] = value;
  }
  return map;
}

async function getSystemdUnitHealth(unit: string): Promise<SystemdUnitHealth> {
  try {
    const raw = await runCommand(
      `systemctl --user show ${shellQuote(unit)} --property=LoadState,ActiveState,SubState,Result,StateChangeTimestamp`
    );
    const parsed = parseSystemdShow(raw);
    const loadState = String(parsed.LoadState ?? "").toLowerCase();
    const exists = loadState !== "" && loadState !== "not-found" && loadState !== "error";
    return {
      unit,
      exists,
      activeState: String(parsed.ActiveState ?? "inactive"),
      subState: String(parsed.SubState ?? "dead"),
      result: String(parsed.Result ?? "unknown"),
      stateChangeTimestamp: String(parsed.StateChangeTimestamp ?? ""),
    };
  } catch {
    return {
      unit,
      exists: false,
      activeState: "inactive",
      subState: "dead",
      result: "unknown",
      stateChangeTimestamp: "",
    };
  }
}

async function readLastCycleSuccessIso(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      const m = line.match(/^([0-9T:\-.+Z]+)\s+status=ok\s+cycle=\w+/i);
      if (m?.[1]) {
        const parsed = Date.parse(m[1]);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function collectOpsSystemdHealth(nowMs = Date.now()): Promise<OpsSystemdHealth> {
  const monitorTimer = await getSystemdUnitHealth(OPS_MONITOR_TIMER_UNIT);
  const workerTimer = await getSystemdUnitHealth(OPS_WORKER_TIMER_UNIT);
  const source: OpsHealthSource = monitorTimer.exists && workerTimer.exists ? "systemd" : "none";
  if (source !== "systemd") {
    return {
      source,
      timersHealthy: false,
      monitorLastSuccessAt: null,
      workerLastSuccessAt: null,
      executorHealthy: false,
    };
  }
  const timersHealthy = monitorTimer.activeState === "active" && workerTimer.activeState === "active";
  const monitorLastSuccessAt = await readLastCycleSuccessIso(OPS_MONITOR_LOG_FILE);
  const workerLastSuccessAt = await readLastCycleSuccessIso(OPS_WORKER_LOG_FILE);
  const monitorFresh =
    !!monitorLastSuccessAt &&
    nowMs - Date.parse(monitorLastSuccessAt) <= OPS_MONITOR_SUCCESS_SLA_MINUTES * 60 * 1000;
  const workerFresh =
    !!workerLastSuccessAt && nowMs - Date.parse(workerLastSuccessAt) <= OPS_WORKER_SUCCESS_SLA_MINUTES * 60 * 1000;
  return {
    source,
    timersHealthy,
    monitorLastSuccessAt,
    workerLastSuccessAt,
    executorHealthy: timersHealthy && monitorFresh && workerFresh,
  };
}

type CronJobStateView = {
  name?: string;
  enabled?: boolean;
  payload?: {
    timeoutSeconds?: number;
  };
  state?: {
    consecutiveErrors?: number;
    lastStatus?: string;
    runningAtMs?: number;
  };
};

async function collectConsecutiveCronErrorsByJob(): Promise<Record<string, number>> {
  try {
    const raw = await readFile(CRON_JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw) as { jobs?: CronJobStateView[] };
    const map: Record<string, number> = {};
    const nowMs = Date.now();
    for (const job of parsed.jobs ?? []) {
      const name = String(job.name ?? "").trim();
      if (!name || job.enabled === false) continue;
      const errors = Number(job.state?.consecutiveErrors ?? 0);
      const runningAtMs = Number(job.state?.runningAtMs ?? 0);
      const lastStatus = String(job.state?.lastStatus ?? "");
      if (runningAtMs > 0) {
        const elapsedMs = nowMs - runningAtMs;
        // Treat active run recovery as non-actionable for up to 10 minutes.
        if (elapsedMs < 10 * 60 * 1000 && (lastStatus === "error" || errors > 0)) {
          continue;
        }
      }
      if (Number.isFinite(errors) && errors > 0) {
        map[name] = Math.floor(errors);
      }
    }
    return map;
  } catch {
    return {};
  }
}

const WORKER_CRON_NAMES = new Set([
  "alex-worker-30m",
  "sam-worker-15m",
  "lyra-capital-worker-30m",
  "nova-worker-30m",
  "ops-task-worker-5m",
]);

async function hasHealthyWorkerActivity(nowMs: number): Promise<boolean> {
  try {
    const raw = await readFile(CRON_JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw) as {
      jobs?: Array<{
        name?: string;
        enabled?: boolean;
        payload?: { timeoutSeconds?: number };
        state?: { runningAtMs?: number };
      }>;
    };
    for (const job of parsed.jobs ?? []) {
      if (job.enabled === false) continue;
      const name = String(job.name ?? "");
      if (!WORKER_CRON_NAMES.has(name)) continue;
      const runningAtMs = Number(job.state?.runningAtMs ?? 0);
      if (runningAtMs <= 0) continue;
      const timeoutSeconds = Math.max(30, Math.floor(Number(job.payload?.timeoutSeconds ?? 180)));
      const budgetMs = (timeoutSeconds + 90) * 1000;
      const elapsedMs = nowMs - runningAtMs;
      if (elapsedMs >= 0 && elapsedMs <= budgetMs) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function findCronJobIdByName(name: string): Promise<string | null> {
  try {
    const raw = await readFile(CRON_JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw) as { jobs?: Array<{ id?: string; name?: string; enabled?: boolean }> };
    const match = (parsed.jobs ?? []).find((job) => job.name === name && job.enabled !== false);
    return match?.id ? String(match.id) : null;
  } catch {
    return null;
  }
}

type CronJobHealth = {
  exists: boolean;
  enabled: boolean;
  consecutiveErrors: number;
  lastStatus: string;
  runningAtMs: number;
  timeoutSeconds: number;
};

async function getCronJobHealthByName(name: string): Promise<CronJobHealth> {
  try {
    const raw = await readFile(CRON_JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw) as {
      jobs?: Array<{
        name?: string;
        enabled?: boolean;
        payload?: { timeoutSeconds?: number };
        state?: { consecutiveErrors?: number; lastStatus?: string; runningAtMs?: number };
      }>;
    };
    const match = (parsed.jobs ?? []).find((job) => String(job.name ?? "") === name);
    if (!match) {
      return { exists: false, enabled: false, consecutiveErrors: 0, lastStatus: "", runningAtMs: 0, timeoutSeconds: 180 };
    }
    return {
      exists: true,
      enabled: match.enabled !== false,
      consecutiveErrors: Math.max(0, Math.floor(Number(match.state?.consecutiveErrors ?? 0))),
      lastStatus: String(match.state?.lastStatus ?? ""),
      runningAtMs: Math.max(0, Math.floor(Number(match.state?.runningAtMs ?? 0))),
      timeoutSeconds: Math.max(30, Math.floor(Number(match.payload?.timeoutSeconds ?? 180))),
    };
  } catch {
    return { exists: false, enabled: false, consecutiveErrors: 0, lastStatus: "", runningAtMs: 0, timeoutSeconds: 180 };
  }
}

async function findCronJobIdPrefixByName(name: string): Promise<string | null> {
  const id = await findCronJobIdByName(name);
  if (!id) return null;
  return id.slice(0, 8);
}

async function resetWorkerCronSessionIfNeeded(assignee: Assignee): Promise<void> {
  const workerJobNameByAssignee: Partial<Record<Assignee, string>> = {
    alex: "alex-worker-30m",
    sam: "sam-worker-15m",
    lyra: "lyra-capital-worker-30m",
    nova: "nova-worker-30m",
    ops: "ops-task-worker-5m",
  };
  const workerJobName = workerJobNameByAssignee[assignee];
  if (!workerJobName) return;
  const prefix = await findCronJobIdPrefixByName(workerJobName);
  if (!prefix) return;
  await runCommand(`/home/ubuntu/mission-control/scripts/cron-session-reset.sh ${shellQuote(assignee)} ${shellQuote(prefix)}`).catch(
    () => undefined
  );
}

function getDraftPath(taskId: string, assignee: Assignee): string | undefined {
  if (!DRAFT_REQUIRED_ASSIGNEES.has(assignee)) return undefined;
  if (assignee === "me" || assignee === "agent") return undefined;
  return `${ASSIGNEE_WORKSPACES[assignee]}/${DRAFTS_SUBPATH}/${taskId}.md`;
}

async function validateTaskDraft(
  taskId: string,
  assignee: Assignee
): Promise<{ status: "pass" | "fail"; reason?: string; draftPath?: string }> {
  const draftPath = getDraftPath(taskId, assignee);
  if (!draftPath) return { status: "pass" };

  let content: string;
  try {
    content = await readFile(draftPath, "utf8");
  } catch {
    return { status: "fail", reason: "missing_task_draft", draftPath };
  }

  const normalized = content.toLowerCase();
  const requiredSections = ["objective", "plan", "validation", "deploy"];
  const missingSection = requiredSections.find((section) => !normalized.includes(section));
  if (missingSection) {
    return { status: "fail", reason: `draft_missing_section:${missingSection}`, draftPath };
  }

  const words = content.trim().split(/\s+/).filter(Boolean).length;
  if (words < 80) {
    return { status: "fail", reason: "draft_too_short", draftPath };
  }

  return { status: "pass", draftPath };
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
  const mergedPath = [process.env.PATH ?? "", OPENCLAW_PATH_PREFIX].filter(Boolean).join(":");
  const { stdout, stderr } = await exec(cmd, {
    cwd: WORKSPACE_ROOT,
    maxBuffer: 5 * 1024 * 1024,
    shell: "/bin/bash",
    env: { ...process.env, PATH: mergedPath },
  });
  const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
  return output;
}

const TRADE_SIGNAL_PATTERNS = [
  /^capital\s*:\s*\w+usdt\s+(long|short)/i,
  /^(buy|sell|long|short)\s+(btc|eth|sol|bnb|xrp|doge|ada|btcusdt|ethusdt)/i,
  /^open\s+(a\s+)?(long|short)\s+position/i,
];

const SAM_CORE_PLATFORM_KEYWORDS = [
  "mission control",
  "autonomy",
  "workflow",
  "guardrail",
  "cron",
  "control center",
  "dashboard",
  "api",
  "task engine",
  "execution",
  "validator",
  "lease",
  "heartbeat",
  "retry",
  "schema",
  "convex",
  "plugin",
  "pipeline",
];

function isSamCorePlatformTask(task: TaskDoc): boolean {
  const combined = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return SAM_CORE_PLATFORM_KEYWORDS.some((kw) => combined.includes(kw));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsKeyword(input: string, keyword: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
  return pattern.test(input);
}

function isRiskyOrVague(task: TaskDoc): string | null {
  const combined = `${task.title} ${task.description ?? ""}`.trim().toLowerCase();
  const revisedByGuardrail = hasGuardrailRevisionMarker(task.description);
  if (!revisedByGuardrail) {
    if (task.title.trim().length < 6) return "title_too_short";
    if (combined.split(/\s+/).filter(Boolean).length < 3) return "task_too_vague";
  }

  // Reject pure trade signal tasks (these should be automated by the capital plugin, not queued as missions)
  for (const pattern of TRADE_SIGNAL_PATTERNS) {
    if (pattern.test(task.title.trim())) return "trade_signal_not_mission";
  }

  // Reject tasks with no meaningful description (less than 10 words)
  const descWords = (task.description ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (!revisedByGuardrail && descWords < 8) return "description_too_short";

  for (const keyword of RISKY_KEYWORDS) {
    if (containsKeyword(combined, keyword)) return `risky_keyword:${keyword}`;
  }

  if (!revisedByGuardrail) {
    for (const keyword of VAGUE_KEYWORDS) {
      if (containsKeyword(combined, keyword)) return `vague_keyword:${keyword}`;
    }
  }

  return null;
}

function missingDeployIntent(task: TaskDoc): boolean {
  const requiresCompoundingGate =
    task.assigned_to === "sam" || task.assigned_to === "lyra" || task.assigned_to === "nova";
  if (!requiresCompoundingGate) return false;

  const combined = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return !DEPLOY_INTENT_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function deployIntentTemplateFor(assignee: Assignee): string {
  if (assignee === "lyra") {
    return [
      "DEPLOY_INTENT (AUTO):",
      "- integration_target: capital lane runtime under /home/ubuntu/.openclaw/workspace-lyra",
      "- activation: wire invocation in the worker/capital flow and verify with /api/autonomy status",
      "- evidence: include artifact_path plus one verification command/output",
      "- rollback: revert changed files and restore previous capital behavior",
    ].join("\n");
  }
  if (assignee === "nova") {
    return [
      "DEPLOY_INTENT (AUTO):",
      "- integration_target: mission-control UI code path under /home/ubuntu/mission-control",
      "- activation: ship via deploy-safe and verify endpoint/UI response",
      "- evidence: include before/after screenshots and artifact_path",
      "- rollback: revert UI files and redeploy-safe",
    ].join("\n");
  }
  return [
    "DEPLOY_INTENT (AUTO):",
    "- integration_target: mission-control operational workflow",
    "- activation: wire into scheduled/worker execution path and verify runtime signal",
    "- evidence: include artifact_path plus one verification command/output",
    "- rollback: revert changes and redeploy-safe",
  ].join("\n");
}

function withAutoDeployIntent(task: TaskDoc): { changed: boolean; description: string } {
  const current = (task.description ?? "").trim();
  if (/DEPLOY_INTENT\s*\(AUTO\)/i.test(current) || /DEPLOY_INTENT\s*:/i.test(current)) {
    return { changed: false, description: task.description ?? "" };
  }
  const block = deployIntentTemplateFor(task.assigned_to);
  const description = current.length > 0 ? `${current}\n\n${block}` : block;
  return { changed: true, description };
}

function buildGuardrailRealtimeRevision(task: TaskDoc, reason: string): { changed: boolean; title: string; description: string } {
  const currentDescription = (task.description ?? "").trim();
  if (hasGuardrailRevisionMarker(currentDescription)) {
    return { changed: false, title: task.title, description: task.description ?? "" };
  }

  const sanitizedBaseTitle = task.title.trim().length >= 6 ? task.title.trim() : `${task.assigned_to} mission`;
  const title =
    reason === "title_too_short"
      ? `Mission scope: ${sanitizedBaseTitle}`.slice(0, 120)
      : sanitizedBaseTitle.slice(0, 120);
  const nowIso = new Date().toISOString();
  const objectiveHint =
    reason === "description_too_short" || reason.startsWith("vague_keyword")
      ? "Define one concrete output artifact and one concrete activation step in this mission."
      : "Refine mission wording into concrete, verifiable execution steps.";
  const revisionBlock = [
    `${GUARDRAIL_REVISION_MARKER}`,
    `guardrail_revision_reason:${reason}`,
    `guardrail_revision_at:${nowIso}`,
    "",
    "REVISION_REQUIREMENTS:",
    "- objective: specific output artifact path under /home/ubuntu/...",
    "- verification: include at least one command/output proof",
    "- deployment: include activation/invocation path",
    "- rollback: include one rollback action",
    `- hint: ${objectiveHint}`,
  ].join("\n");

  const description = currentDescription.length > 0 ? `${currentDescription}\n\n${revisionBlock}` : revisionBlock;
  return { changed: true, title, description };
}

function isBroadUiTask(task: TaskDoc): boolean {
  if (task.assigned_to !== "nova") return false;
  const combined = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return UI_BROAD_KEYWORDS.some((kw) => combined.includes(kw));
}

function buildUiSplitSpecs(task: TaskDoc): UiSplitSpec[] {
  const parentId = String(task._id);
  const base = task.title.trim();
  const baseDescription = (task.description ?? "").trim();

  const specs = [
    {
      suffix: "Layout & Information Hierarchy",
      focus:
        "Restructure page layout and hierarchy so primary actions are obvious in <3 seconds and no section clips at 1366x768 or mobile widths.",
      checks: "overflow=pass; readability=pass; mobile=pass",
    },
    {
      suffix: "Typography & Readability",
      focus:
        "Improve font scale, line length, spacing, and heading contrast for fast scanning and low visual fatigue.",
      checks: "readability=pass; contrast=pass; hierarchy=pass",
    },
    {
      suffix: "Color, Contrast & State Signaling",
      focus:
        "Normalize palette and semantic colors (idle/working/blocked/review) so status is instantly scannable.",
      checks: "contrast=pass; state_signals=pass; consistency=pass",
    },
    {
      suffix: "Interaction Flow & Feedback",
      focus:
        "Reduce click depth and add clear live feedback for transitions (claim, in-progress, vote, done, error).",
      checks: "flow=pass; latency_feedback=pass; error_visibility=pass",
    },
    {
      suffix: "Mobile & Overflow Hardening",
      focus:
        "Ensure no clipping/overflow at 375px and 768px widths, including chat stream, vote panel, and task modal.",
      checks: "mobile=pass; overflow=pass; tap_targets=pass",
    },
  ] as const;

  return specs.map((spec, idx) => {
    const title = `[UI-SPLIT ${idx + 1}/5] ${spec.suffix}: ${base}`.slice(0, 120);
    const idempotency_key = `ui-split:${parentId}:${idx + 1}`;
    const description = [
      `split_parent_task:${parentId}`,
      "split_contract:v1",
      "workflow_contract_version:v2",
      "",
      "Original request:",
      baseDescription || "(no original description)",
      "",
      "Subtask objective:",
      spec.focus,
      "",
      "Required completion output:",
      "- what changed:",
      "- what remains:",
      "- risk:",
      "- ETA:",
      "- why this is better: measurable",
      "- before_screenshot: /abs/path",
      "- after_screenshot: /abs/path",
      "- components_changed:",
      `- checks: ${spec.checks}`,
      "- artifact_path: /home/ubuntu/mission-control/...",
      "",
      "Do not mark complete without deploy-safe + evidence.",
    ].join("\n");

    return {
      title,
      description,
      assigned_to: "nova",
      idempotency_key,
    };
  });
}

async function splitBroadUiTask(client: ConvexHttpClient, task: TaskDoc): Promise<{ created: number; ids: string[] }> {
  const specs = buildUiSplitSpecs(task);
  const ids: string[] = [];
  for (const spec of specs) {
    const createdId = await client.mutation(api.tasks.create, {
      title: spec.title,
      description: spec.description,
      assigned_to: spec.assigned_to,
      status: "suggested",
      idempotency_key: spec.idempotency_key,
      intent_window: new Date().toISOString(),
      workflow_contract_version: "v2",
    });
    ids.push(String(createdId));
  }
  await client.mutation(api.tasks.remove, { id: task._id });
  return { created: ids.length, ids };
}

function parseConfidenceScore(task: TaskDoc): number | null {
  const combined = `${task.title}\n${task.description ?? ""}`;
  const m = combined.match(/confidence\s*[:=]\s*(1(?:\.0+)?|0(?:\.\d+)?)/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function isChallengerTask(task: TaskDoc): boolean {
  return /^\[challenger\]/i.test(task.title) || /challenger_lane\s*:\s*true/i.test(task.description ?? "");
}

function shouldCreateChallenger(task: TaskDoc): boolean {
  if (isChallengerTask(task)) return false;
  if (task.status === "done") return false;
  const assignee = task.assigned_to;
  if (!CHALLENGER_ASSIGNEE_MAP[assignee]) return false;

  const confidence = parseConfidenceScore(task);
  if (confidence !== null && confidence < 0.75) return true;

  const combined = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return CHALLENGER_TRIGGER_KEYWORDS.some((kw) => combined.includes(kw));
}

function buildChallengerTitle(task: TaskDoc): string {
  return `[Challenger] ${task.title}`.slice(0, 120);
}

function buildChallengerDescription(task: TaskDoc, challenger: Assignee): string {
  return [
    `challenger_lane:true`,
    `primary_task_id:${String(task._id)}`,
    `primary_assignee:${task.assigned_to}`,
    `challenger_assignee:${challenger}`,
    "workflow_contract_version:v2",
    "",
    "Objective:",
    "Independently propose an alternative approach and evaluate tradeoffs against the primary plan.",
    "",
    "Required completion output:",
    "- what changed:",
    "- what remains:",
    "- risk:",
    "- ETA:",
    "- why this is better: measurable",
    "- challenger_hypothesis:",
    "- challenger_result:",
    "- challenger_tradeoff:",
    "- artifact_path: /home/ubuntu/...",
  ].join("\n");
}

async function ensureChallengerTask(
  client: ConvexHttpClient,
  task: TaskDoc
): Promise<{ created: boolean; id?: string; assignee?: Assignee }> {
  if (!shouldCreateChallenger(task)) return { created: false };
  const challenger = CHALLENGER_ASSIGNEE_MAP[task.assigned_to];
  if (!challenger) return { created: false };

  const createdId = await client.mutation(api.tasks.create, {
    title: buildChallengerTitle(task),
    description: buildChallengerDescription(task, challenger),
    assigned_to: challenger,
    status: "suggested",
    idempotency_key: `challenger:${String(task._id)}:${challenger}`,
    intent_window: new Date().toISOString(),
    workflow_contract_version: "v2",
  });

  return { created: true, id: String(createdId), assignee: challenger };
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
      .filter(
        (task) =>
          task.status === "backlog" || task.status === "in_progress" || task.status === "blocked" || task.status === "done"
      )
      .map((task) => normalizeTitle(task.title))
      .filter(Boolean)
  );

  const activeLoadByAssignee: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  for (const task of allTasks) {
    if (task.status === "backlog" || task.status === "in_progress") {
      activeLoadByAssignee[task.assigned_to] += 1;
    }
  }

  const suggested = sortOldestFirst(allTasks.filter((task) => task.status === "suggested")).slice(0, maxToProcess);

  const accepted: Array<{ id: Id<"tasks">; title: string }> = [];
  const rejected: Array<{ id: Id<"tasks">; title: string; reason: string }> = [];
  const deferred: Array<{ id: Id<"tasks">; title: string; reason: string }> = [];
  const revised: Array<{ id: Id<"tasks">; title: string; reason: string }> = [];
  const autoSplit: Array<{ id: Id<"tasks">; title: string; created: number; splitTaskIds: string[] }> = [];
  const challenger: Array<{ sourceTaskId: string; challengerTaskId: string; assigned_to: Assignee }> = [];

  for (const task of suggested) {
    let taskForChecks = task;
    let normalized = normalizeTitle(taskForChecks.title);
    const duplicate = normalized.length > 0 && duplicateBlocklist.has(normalized);
    const shouldSplitUi = isBroadUiTask(taskForChecks);
    let riskyOrVagueReason = isRiskyOrVague(taskForChecks);

    if (duplicate) {
      await client.mutation(api.tasks.remove, { id: taskForChecks._id });
      rejected.push({ id: taskForChecks._id, title: taskForChecks.title, reason: "duplicate_title" });
      continue;
    }

    if (shouldSplitUi) {
      const splitResult = await splitBroadUiTask(client, taskForChecks);
      autoSplit.push({
        id: taskForChecks._id,
        title: taskForChecks.title,
        created: splitResult.created,
        splitTaskIds: splitResult.ids,
      });
      continue;
    }

    if (isRealtimeRevisionReason(riskyOrVagueReason)) {
      const revision = buildGuardrailRealtimeRevision(taskForChecks, riskyOrVagueReason as string);
      if (revision.changed) {
        await client.mutation(api.tasks.updateTask, {
          id: taskForChecks._id,
          title: revision.title,
          description: revision.description,
        });
        taskForChecks = {
          ...taskForChecks,
          title: revision.title,
          description: revision.description,
        };
        revised.push({ id: taskForChecks._id, title: taskForChecks.title, reason: riskyOrVagueReason as string });
        normalized = normalizeTitle(taskForChecks.title);
      }
      riskyOrVagueReason = isRiskyOrVague(taskForChecks);
    }

    if (normalized.length > 0 && duplicateBlocklist.has(normalized)) {
      await client.mutation(api.tasks.remove, { id: taskForChecks._id });
      rejected.push({ id: taskForChecks._id, title: taskForChecks.title, reason: "duplicate_title_after_revision" });
      continue;
    }

    if (riskyOrVagueReason) {
      await client.mutation(api.tasks.remove, { id: taskForChecks._id });
      rejected.push({ id: taskForChecks._id, title: taskForChecks.title, reason: riskyOrVagueReason });
      if (normalized.length > 0) duplicateBlocklist.add(normalized);
      continue;
    }

    if (missingDeployIntent(taskForChecks)) {
      const enriched = withAutoDeployIntent(taskForChecks);
      if (enriched.changed) {
        await client.mutation(api.tasks.updateTask, {
          id: taskForChecks._id,
          description: enriched.description,
        });
        taskForChecks = {
          ...taskForChecks,
          description: enriched.description,
        };
      }
    }

    const cap = WIP_CAP_BY_ASSIGNEE[taskForChecks.assigned_to] ?? 1;
    const active = activeLoadByAssignee[taskForChecks.assigned_to] ?? 0;
    if (active >= cap) {
      deferred.push({ id: taskForChecks._id, title: taskForChecks.title, reason: "capacity_full" });
      continue;
    }

    await client.mutation(api.tasks.updateStatus, { id: taskForChecks._id, status: "backlog" });
    duplicateBlocklist.add(normalized);
    activeLoadByAssignee[taskForChecks.assigned_to] = active + 1;
    accepted.push({ id: taskForChecks._id, title: taskForChecks.title });

    const challengerResult = await ensureChallengerTask(client, taskForChecks);
    if (challengerResult.created && challengerResult.id && challengerResult.assignee) {
      challenger.push({
        sourceTaskId: String(taskForChecks._id),
        challengerTaskId: challengerResult.id,
        assigned_to: challengerResult.assignee,
      });
    }
  }

  return {
    ok: true,
    action: "guardrail" as const,
    processed: suggested.length,
    accepted,
    rejected,
    deferred,
    revised,
    autoSplit,
    challenger,
    acceptancePolicy: "0..20 (>=1 only if quality+capacity allows)",
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

async function pluginCapitalPaperTrade(ctx: PluginContext): Promise<PluginResult> {
  const text = `${ctx.task.title}\n${ctx.task.description ?? ""}`;
  const upperText = text.toUpperCase();
  const symbolMatch = upperText.match(
    /\b(BTCUSDT|ETHUSDT|SOLUSDT|BNBUSDT|XRPUSDT|DOGEUSDT|ADAUSDT|AAPL|TSLA|NVDA|MSFT|AMZN|SPY|QQQ)\b/
  );
  if (!symbolMatch) {
    throw new Error("capital_paper_trade could not find an allowlisted symbol in task title/description");
  }

  const symbol = symbolMatch[1];
  const side: "long" | "short" = upperText.includes("SHORT") ? "short" : "long";
  const market: "crypto" | "stock" = symbol.endsWith("USDT") ? "crypto" : "stock";

  // Strip any "Worker failure (...): ..." lines that appendFailureNote may have
  // appended to the description on previous failed attempts — we never want
  // error diagnostics leaking into the stored trade thesis.
  const rawDescription = ctx.task.description?.trim() ?? "";
  const cleanedDescription = rawDescription
    .split("\n")
    .filter((line) => !/^Worker failure \(.*\):/.test(line.trim()))
    .join("\n")
    .trim();
  const thesis = cleanedDescription || ctx.task.title.trim();

  const statusResponse = await fetch("http://localhost:3001/api/capital", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  });
  const statusText = await statusResponse.text();
  if (!statusResponse.ok) {
    throw new Error(`capital status request failed (${statusResponse.status}): ${statusText.slice(0, 300)}`);
  }

  let statusPayload: Record<string, unknown> = {};
  try {
    statusPayload = JSON.parse(statusText) as Record<string, unknown>;
  } catch {
    throw new Error("capital status response was not valid JSON");
  }

  const statusData =
    statusPayload && typeof statusPayload.data === "object" && statusPayload.data
      ? (statusPayload.data as Record<string, unknown>)
      : statusPayload;
  const halted =
    statusData.halted === true ||
    statusData.isHalted === true ||
    statusData.tradingHalted === true ||
    statusData.status === "halted" ||
    (statusData.portfolio && typeof statusData.portfolio === "object" && (statusData.portfolio as Record<string, unknown>).status === "halted");
  if (halted) {
    throw new Error("capital paper trading is halted");
  }

  const portfolioObj =
    statusData.portfolio && typeof statusData.portfolio === "object"
      ? (statusData.portfolio as Record<string, unknown>)
      : null;
  const totalEquityCandidate =
    portfolioObj?.totalEquity ??
    statusData.totalEquity ??
    statusData.total_equity ??
    statusData.equity ??
    statusData.accountEquity ??
    statusData.balance;
  const totalEquity = Number(totalEquityCandidate);
  if (!Number.isFinite(totalEquity) || totalEquity <= 0) {
    throw new Error("capital status missing a valid totalEquity");
  }

  const parseLastNumber = (raw: string): number => {
    const matches = raw.match(/-?\d+(?:\.\d+)?/g);
    if (!matches || !matches.length) throw new Error(`unable to parse numeric value from command output: ${raw.slice(0, 200)}`);
    const value = Number(matches[matches.length - 1]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`parsed invalid numeric value: ${String(value)}`);
    return value;
  };

  let entryPrice: number;
  if (market === "crypto") {
    const binanceOutput = await runCommand(`curl -s "https://api.binance.com/api/v3/ticker/price?symbol=${symbol}"`);
    let parsed: { price?: string } = {};
    try {
      parsed = JSON.parse(binanceOutput) as { price?: string };
    } catch {
      throw new Error(`failed parsing Binance ticker response for ${symbol}`);
    }
    entryPrice = Number(parsed.price);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new Error(`invalid Binance entry price for ${symbol}`);
    }
  } else {
    const stockOutput = await runCommand(`python3 - <<'PY'
import yfinance as yf
symbol = "${symbol}"
ticker = yf.Ticker(symbol)
hist = ticker.history(period="1d", interval="1m")
if hist.empty:
    hist = ticker.history(period="5d", interval="1d")
if hist.empty:
    raise SystemExit(2)
print(float(hist["Close"].dropna().iloc[-1]))
PY`);
    entryPrice = parseLastNumber(stockOutput);
  }

  const notional = totalEquity * 0.04;
  const size = notional / entryPrice;
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("calculated position size is invalid");
  }

  const riskPct = market === "crypto" ? 0.02 : 0.015;
  const stopLoss = side === "long" ? entryPrice * (1 - riskPct) : entryPrice * (1 + riskPct);
  const takeProfit = side === "long" ? entryPrice * (1 + 2 * riskPct) : entryPrice * (1 - 2 * riskPct);

  const tradePayload = {
    action: "trade",
    symbol,
    side,
    entryPrice,
    size,
    stopLoss,
    takeProfit,
    thesis,
  };
  const tradeResponse = await fetch("http://localhost:3001/api/capital", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tradePayload),
  });
  const tradeText = await tradeResponse.text();
  if (!tradeResponse.ok) {
    throw new Error(`capital trade request failed (${tradeResponse.status}): ${tradeText.slice(0, 300)}`);
  }
  let tradeResult: Record<string, unknown> = {};
  try {
    tradeResult = JSON.parse(tradeText) as Record<string, unknown>;
  } catch {
    throw new Error("capital trade response was not valid JSON");
  }
  if (tradeResult.ok !== true) {
    throw new Error(`capital trade response returned ok=false: ${tradeText.slice(0, 300)}`);
  }

  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/capital-trade-${slug}.md`;
  const content = [
    "# Capital Paper Trade",
    "",
    `Generated at: ${ctx.timestamp}`,
    `Worker: ${ctx.worker}`,
    `Task: ${ctx.task.title}`,
    "",
    "## Trade Parameters",
    `- Symbol: ${symbol}`,
    `- Market: ${market}`,
    `- Side: ${side}`,
    `- Entry Price: ${entryPrice}`,
    `- Total Equity: ${totalEquity}`,
    `- Notional (4%): ${notional}`,
    `- Size: ${size}`,
    `- Risk %: ${riskPct * 100}%`,
    `- Stop Loss: ${stopLoss}`,
    `- Take Profit: ${takeProfit}`,
    "",
    "## Thesis",
    thesis,
    "",
    "## Capital API Result",
    "```json",
    JSON.stringify(tradeResult, null, 2),
    "```",
    "",
  ].join("\n");
  const written = await writeTextFile(outPath, content);

  return {
    pluginId: "capital_paper_trade",
    notes: ["Submitted paper trade to local Capital API with 1R stop and 2R take-profit."],
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

async function pluginLyraCapitalResearch(ctx: PluginContext): Promise<PluginResult> {
  const notes: string[] = [];
  const files: string[] = [];

  // Fetch market data
  const [btcRaw, fngRaw] = await Promise.allSettled([
    runCommand('curl -s "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"'),
    runCommand('curl -s "https://api.alternative.me/fng/?limit=3"'),
  ]);

  let btcData: { lastPrice?: string; priceChangePercent?: string; volume?: string } = {};
  let fngData: { data?: Array<{ value?: string; value_classification?: string }> } = {};
  if (btcRaw.status === "fulfilled") { try { btcData = JSON.parse(btcRaw.value) as typeof btcData; } catch { /* ignore */ } }
  if (fngRaw.status === "fulfilled") { try { fngData = JSON.parse(fngRaw.value) as typeof fngData; } catch { /* ignore */ } }

  const currentPrice = Number(btcData.lastPrice ?? 0);
  const change24h = Number(btcData.priceChangePercent ?? 0);
  const fngValue = Number(fngData.data?.[0]?.value ?? 50);
  const fngLabel = fngData.data?.[0]?.value_classification ?? "Neutral";

  // Portfolio state
  const statusRaw = await runCommand(
    "curl -s -X POST http://localhost:3001/api/capital -H 'content-type: application/json' -d '{\"action\":\"status\"}'"
  );
  let statusData: { portfolio?: { positions?: unknown[]; totalEquity?: number; status?: string } } = {};
  try { statusData = JSON.parse(statusRaw) as typeof statusData; } catch { /* ignore */ }

  const openPositions = statusData.portfolio?.positions?.length ?? 0;
  const totalEquity = statusData.portfolio?.totalEquity ?? 100000;
  const portfolioStatus = statusData.portfolio?.status ?? "active";

  // Simple signal engine
  let shouldTrade = false;
  let side: "long" | "short" = "long";
  let confidence = 0;
  let thesis = "";

  if (portfolioStatus !== "halted" && openPositions < 2) {
    // Long: extreme fear + slight recovery
    if (fngValue < 30 && change24h > -2 && change24h < 6) {
      shouldTrade = true; side = "long";
      confidence = 0.70 + (30 - fngValue) / 200;
      thesis = `BTC fear/greed at ${fngValue} (${fngLabel}), 24h change ${change24h.toFixed(2)}% — contrarian long in extreme fear.`;
    }
    // Short: extreme greed + overextended
    else if (fngValue > 78 && change24h > 6) {
      shouldTrade = true; side = "short";
      confidence = 0.68 + (fngValue - 78) / 200;
      thesis = `BTC fear/greed at ${fngValue} (${fngLabel}), 24h surge ${change24h.toFixed(2)}% — short overextension.`;
    }
  }

  const reportLines: string[] = [
    `# Capital Research: ${ctx.task.title}`,
    `Generated: ${ctx.timestamp}`,
    "",
    "## Market Context",
    `- BTC Price: $${currentPrice.toLocaleString()}`,
    `- 24h Change: ${change24h.toFixed(2)}%`,
    `- Fear/Greed: ${fngValue} (${fngLabel})`,
    "",
    "## Portfolio State",
    `- Open Positions: ${openPositions}`,
    `- Total Equity: $${totalEquity.toLocaleString()}`,
    `- Portfolio Status: ${portfolioStatus}`,
    "",
    "## Signal Analysis",
    `- Signal: ${shouldTrade ? `${side.toUpperCase()} (confidence ${confidence.toFixed(2)})` : "NO TRADE"}`,
    `- Thesis: ${thesis || "No clear signal identified."}`,
    "",
    "## Decision",
  ];

  if (shouldTrade && confidence >= 0.75) {
    // Get fresh price for trade
    let entryPrice = currentPrice;
    try {
      const priceRaw = await runCommand('curl -s "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"');
      const p = Number((JSON.parse(priceRaw) as { price?: string }).price);
      if (p > 0) entryPrice = p;
    } catch { /* use currentPrice */ }

    const riskPct = 0.02;
    const notional = totalEquity * 0.04;
    const size = notional / entryPrice;
    const stopLoss = side === "long" ? entryPrice * (1 - riskPct) : entryPrice * (1 + riskPct);
    const takeProfit = side === "long" ? entryPrice * (1 + 2 * riskPct) : entryPrice * (1 - 2 * riskPct);

    const tradePayload = JSON.stringify({ action: "trade", symbol: "BTCUSDT", side, entryPrice, size, stopLoss, takeProfit, thesis });
    const tradeRaw = await runCommand(
      `curl -s -X POST http://localhost:3001/api/capital -H 'content-type: application/json' -d '${tradePayload.replace(/'/g, "'\\''")}'`
    );
    let tradeOk = false;
    try { tradeOk = (JSON.parse(tradeRaw) as { ok?: boolean }).ok === true; } catch { /* ignore */ }

    reportLines.push(
      `- Action: ${tradeOk ? "TRADE EXECUTED ✅" : "TRADE FAILED ❌"}`,
      `- BTCUSDT ${side} @ $${entryPrice.toFixed(2)} | SL $${stopLoss.toFixed(2)} | TP $${takeProfit.toFixed(2)}`,
    );
    notes.push(`Research-driven ${side} signal (conf=${confidence.toFixed(2)}). Trade ${tradeOk ? "executed" : "failed"}.`);
  } else {
    const reason = !shouldTrade ? "No clear pattern" :
      confidence < 0.75 ? `Low confidence (${confidence.toFixed(2)})` :
      `Max positions or halted`;
    reportLines.push(`- Action: PASS — ${reason}`);
    notes.push(`No trade this cycle. Reason: ${reason}`);
  }

  const researchDir = "/home/ubuntu/.openclaw/workspace-lyra/research";
  const slug = safeSlug(ctx.task.title);
  const reportPath = `${researchDir}/capital-research-${ctx.timestamp.slice(0, 10)}-${slug}.md`;
  await mkdir(researchDir, { recursive: true });
  await writeFile(reportPath, reportLines.join("\n") + "\n", "utf8");
  files.push(reportPath);

  return { pluginId: "lyra_capital_research", notes, files };
}

async function pluginWebResearch(ctx: PluginContext): Promise<PluginResult> {
  const query = ctx.task.title
    .replace(/^(research|investigate|study|analyze|analyse|explore|gather|scrape)\s*/i, "")
    .trim();

  let searchOut = "(search unavailable)";
  try {
    searchOut = await runCommand(
      `curl -s --max-time 10 "https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5" -H "Accept: application/json" 2>/dev/null`
    );
  } catch { /* ignore */ }

  const slug = safeSlug(ctx.task.title);
  const reportPath = `${PLUGIN_OUTPUT_DIR}/web-research-${slug}.md`;
  const content = [
    `# Web Research: ${ctx.task.title}`,
    `Generated: ${ctx.timestamp}`,
    `Query: ${query}`,
    "",
    "## Raw Search Output (truncated)",
    "```",
    searchOut.slice(0, 3000),
    "```",
    "",
  ].join("\n");

  const written = await writeTextFile(reportPath, content);
  return {
    pluginId: "web_research",
    notes: [`Completed web research for: "${query}"`],
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
    id: "lyra_capital_research",
    match: (task) => {
      if (task.assigned_to !== "lyra") return false;
      const t = normalizeTitle(task.title);
      return (
        (t.includes("capital") && (t.includes("research") || t.includes("analysis") || t.includes("intelligence"))) ||
        t.includes("market research") ||
        t.includes("market analysis") ||
        t.includes("market intelligence") ||
        t.includes("sentiment") ||
        (t.includes("strategy") && t.includes("capital"))
      );
    },
    run: pluginLyraCapitalResearch,
  },
  {
    id: "capital_paper_trade",
    match: (task) => {
      const t = normalizeTitle(task.title);
      const padded = ` ${t} `;
      const hasExplicitSignal =
        /\b(btcusdt|ethusdt|solusdt|bnbusdt|xrpusdt|dogeusdt|adausdt|aapl|tsla|nvda|msft|amzn|spy|qqq)\b/.test(t) ||
        padded.includes(" long ") ||
        padded.includes(" short ") ||
        t.includes("paper trade");
      return hasExplicitSignal;
    },
    run: pluginCapitalPaperTrade,
  },
  {
    id: "x_scout",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("x scout") || t.includes("x com") || t.includes("twitter") || t.includes("trend") || t.includes("meme");
    },
    run: pluginXScout,
  },
  {
    id: "web_research",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return (
        t.startsWith("research ") ||
        t.includes("web research") ||
        t.includes("investigate") ||
        t.includes("gather data") ||
        t.includes("scrape")
      );
    },
    run: pluginWebResearch,
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
  const latest = (await loadAllTasks(client)).find((candidate) => String(candidate._id) === String(task._id)) ?? task;
  const previousDescription = latest.description?.trim() ?? "";
  const failureNote = `Worker failure (${timestamp}): ${errorMessage}`;
  const newDescription = previousDescription ? `${previousDescription}\n\n${failureNote}` : failureNote;
  await client.mutation(api.tasks.updateTask, {
    id: task._id,
    description: newDescription,
  });
}

async function runWorker(
  client: ConvexHttpClient,
  requestedAssignee: unknown,
  requestedMax: unknown,
  requestedAllowLegacy: unknown
) {
  const allowLegacy = requestedAllowLegacy === true || String(requestedAllowLegacy ?? "").toLowerCase() === "true";
  if (!allowLegacy) {
    return {
      ok: false,
      action: "worker" as const,
      message: "legacy_worker_disabled_use_claim_heartbeat_complete",
      hint: "Use action=claim -> action=heartbeat -> action=complete",
    };
  }

  void requestedMax;
  const assignee = normalizeAssignee(requestedAssignee, "agent");
  const allTasks = await loadAllTasks(client);

  const backlog = sortOldestFirst(allTasks.filter((task) => task.status === "backlog"));

  let selected = backlog.find((task) => task.assigned_to === assignee);
  if (!selected && assignee === "sam") {
    selected = backlog.find((task) => task.assigned_to === "agent");
  }

  if (!selected) {
    return {
      ok: true,
      action: "worker" as const,
      worker: assignee,
      processed: 0,
      message: "no_matching_backlog_task",
    };
  }

  const runStartedAt = Date.now();
  const timestamp = new Date(runStartedAt).toISOString();
  // Set status + owner + lease atomically to close the race window between
  // a bare updateStatus and a subsequent updateTask (Issue 1 fix).
  await client.mutation(api.tasks.updateTask, {
    id: selected._id,
    status: "in_progress" as const,
    owner: assignee,
    lease_until: new Date(runStartedAt + LEASE_MINUTES_BY_ASSIGNEE[assignee] * 60 * 1000).toISOString(),
    heartbeat_at: timestamp,
    retry_count_run: 0,
    validation_status: "pending",
  });
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

async function collectRunLogStats() {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const runDurations24h: number[] = [];
  let doneLast24h = 0;

  try {
    const raw = await readFile(EXECUTOR_RUN_LOG_FILE, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<WorkerRunLogEntry>;
        if (
          typeof parsed.timestamp === "string" &&
          typeof parsed.durationMs === "number" &&
          (parsed.status === "success" || parsed.status === "failed")
        ) {
          const ts = Date.parse(parsed.timestamp);
          if (!Number.isNaN(ts) && ts >= dayAgo) {
            if (parsed.status === "success") doneLast24h += 1;
            if (parsed.durationMs > 0) runDurations24h.push(parsed.durationMs);
          }
        }
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    // no logs yet
  }

  return {
    doneLast24h,
    medianExecutionDurationMs: median(runDurations24h),
  };
}

async function runStatus(client: ConvexHttpClient) {
  const allTasks = await loadAllTasks(client);

  const byStatus: Record<Status, number> = {
    suggested: 0,
    backlog: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
  };
  const byAssignee: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };

  for (const task of allTasks) {
    if (task.status in byStatus) byStatus[task.status as Status] += 1;
    if (task.assigned_to in byAssignee) byAssignee[task.assigned_to as Assignee] += 1;
  }

  const pluginMetrics = await collectPluginMetrics();
  const runStats = await collectRunLogStats();

  const nowMs = Date.now();
  const doneByAssigneeLast24h = collectDoneByAssigneeLast24h(allTasks, nowMs);
  const doneVerifiedPassByAssigneeLast24h = collectDoneByAssigneeLast24h(
    allTasks,
    nowMs,
    (task) => task.validation_status === "pass"
  );
  const throughputCarryoverByAssignee = collectPolicyBlockedCredits(allTasks, nowMs);
  const throughputEffectiveDoneByAssigneeLast24h = (Object.keys(doneByAssigneeLast24h) as Assignee[]).reduce<
    Record<Assignee, number>
  >(
    (acc, assignee) => {
      acc[assignee] =
        (doneVerifiedPassByAssigneeLast24h[assignee] ?? 0) + (throughputCarryoverByAssignee[assignee] ?? 0);
      return acc;
    },
    { me: 0, alex: 0, sam: 0, lyra: 0, nova: 0, ops: 0, agent: 0 }
  );
  const throughputQualityPenaltyByAssignee = collectThroughputQualityPenalty(
    doneByAssigneeLast24h,
    doneVerifiedPassByAssigneeLast24h
  );
  const throughputDeficitByAssignee = collectThroughputDeficit(throughputEffectiveDoneByAssigneeLast24h);
  const totalThroughputDeficit = sumThroughputDeficit(throughputDeficitByAssignee);
  const throughputTargetTotal = THROUGHPUT_TARGET_ASSIGNEES.length * THROUGHPUT_TARGET_PER_DAY;
  const throughputDoneTotal = THROUGHPUT_TARGET_ASSIGNEES.reduce(
    (sum, assignee) => sum + (throughputEffectiveDoneByAssigneeLast24h[assignee] ?? 0),
    0
  );
  const activeTasks = allTasks.filter((t) => t.status !== "done");
  const challengerTasks = allTasks.filter((t) => isChallengerTask(t));
  const challengerByStatus = challengerTasks.reduce<Record<Status, number>>(
    (acc, task) => {
      acc[task.status] += 1;
      return acc;
    },
    { suggested: 0, backlog: 0, in_progress: 0, blocked: 0, done: 0 }
  );
  const doneTotal = byStatus.done;
  const doneVerifiedPass = allTasks.filter((t) => t.status === "done" && t.validation_status === "pass").length;
  const doneWithFailValidation = allTasks.filter((t) => t.status === "done" && t.validation_status === "fail").length;

  const blockedByAssigneeRaw: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  const backlogByAssigneeRaw: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  for (const task of allTasks) {
    if (task.status === "blocked") blockedByAssigneeRaw[task.assigned_to] += 1;
    if (task.status === "backlog") backlogByAssigneeRaw[task.assigned_to] += 1;
  }
  const blockedByAssignee = Object.fromEntries(
    Object.entries(blockedByAssigneeRaw).filter(([, count]) => count > 0)
  ) as Record<string, number>;
  const backlogByAssignee = Object.fromEntries(
    Object.entries(backlogByAssigneeRaw).filter(([, count]) => count > 0)
  ) as Record<string, number>;

  const oldestBacklogAgeMinutes = allTasks
    .filter((t) => t.status === "backlog")
    .reduce((maxAge, task) => Math.max(maxAge, backlogAgeMinutes(task, nowMs)), 0);
  const oldestSuggestedAgeMinutes = allTasks
    .filter((t) => t.status === "suggested")
    .reduce((maxAge, task) => Math.max(maxAge, ageMinutesFromCreatedAt(task, nowMs)), 0);

  const suggestedTasks = allTasks.filter((t) => t.status === "suggested");
  const activeLoadByAssignee: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    nova: 0,
    ops: 0,
    agent: 0,
  };
  for (const task of allTasks) {
    if (task.status === "backlog" || task.status === "in_progress") {
      activeLoadByAssignee[task.assigned_to] += 1;
    }
  }
  const deferredByReason = {
    missing_deploy_intent: 0,
    capacity_full: 0,
    other: 0,
  };
  let suggestedDeferredCandidates = 0;
  let staleSuggestedDeferredCandidates = 0;
  for (const task of suggestedTasks) {
    if (missingDeployIntent(task)) {
      deferredByReason.missing_deploy_intent += 1;
      suggestedDeferredCandidates += 1;
      const ageMinutes = ageMinutesFromCreatedAt(task, nowMs);
      if (ageMinutes >= 60) staleSuggestedDeferredCandidates += 1;
      continue;
    }

    const cap = WIP_CAP_BY_ASSIGNEE[task.assigned_to] ?? 1;
    const active = activeLoadByAssignee[task.assigned_to] ?? 0;
    if (active >= cap) {
      deferredByReason.capacity_full += 1;
      suggestedDeferredCandidates += 1;
      continue;
    }
  }

  const blockedSignalsRaw = byStatus.blocked;
  const blockedSignals = allTasks.filter((task) => isActionableBlockedForAlert(task, nowMs)).length;
  const blockedPoolRaw = byStatus.backlog + byStatus.in_progress + blockedSignalsRaw;
  const blockedPool = byStatus.backlog + byStatus.in_progress + blockedSignals;
  const blockedRatioRaw = blockedPoolRaw > 0 ? Number((blockedSignalsRaw / blockedPoolRaw).toFixed(3)) : 0;
  const blockedRatio = blockedPool > 0 ? Number((blockedSignals / blockedPool).toFixed(3)) : 0;
  const activeFlowCount = byStatus.backlog + byStatus.in_progress;

  const alerts: string[] = [];
  if (activeFlowCount > 0 && blockedPool >= 3 && blockedSignals >= 2 && blockedRatio > 0.15) {
    alerts.push(`blocked_ratio_high:${(blockedRatio * 100).toFixed(1)}%`);
  }
  if (runStats.doneLast24h < 4) alerts.push(`done_per_day_low:${runStats.doneLast24h}`);
  if (throughputDoneTotal < throughputTargetTotal) {
    alerts.push(`throughput_gap:${throughputDoneTotal}/${throughputTargetTotal}`);
  }
  if (runStats.medianExecutionDurationMs > 20 * 60 * 1000) {
    alerts.push(`median_cycle_time_high:${Math.round(runStats.medianExecutionDurationMs / 1000)}s`);
  }
  const healthyWorkerActivity = await hasHealthyWorkerActivity(nowMs);
  if (byStatus.backlog >= 3 && byStatus.in_progress === 0 && oldestBacklogAgeMinutes >= 20 && !healthyWorkerActivity) {
    alerts.push(`backlog_idle:${byStatus.backlog}`);
  }

  const previousAlertState = await loadWorkflowAlertState();
  const nextAlerts = [...alerts].sort();
  const nextCriticalAlerts = nextAlerts.filter((alert) => isCriticalWorkflowAlert(alert));
  const previousAlerts = [...previousAlertState.alerts].sort();
  const previousCriticalAlerts = [...previousAlertState.criticalAlerts].sort();
  const sameAlerts =
    nextAlerts.length === previousAlerts.length && nextAlerts.every((alert, index) => alert === previousAlerts[index]);
  const sameCriticalAlerts =
    nextCriticalAlerts.length === previousCriticalAlerts.length &&
    nextCriticalAlerts.every((alert, index) => alert === previousCriticalAlerts[index]);
  const sustainedAlerts = nextAlerts.length === 0 ? 0 : sameAlerts ? previousAlertState.consecutive + 1 : 1;
  const sustainedCriticalAlerts =
    nextCriticalAlerts.length === 0 ? 0 : sameCriticalAlerts ? previousAlertState.criticalConsecutive + 1 : 1;
  await saveWorkflowAlertState({
    alerts: nextAlerts,
    criticalAlerts: nextCriticalAlerts,
    consecutive: sustainedAlerts,
    criticalConsecutive: sustainedCriticalAlerts,
    updatedAt: new Date().toISOString(),
  });

  const severity: "none" | "warning" | "critical" =
    nextAlerts.length === 0 ? "none" : sustainedCriticalAlerts >= 2 ? "critical" : "warning";
  const consecutiveCronErrorsByJob = await collectConsecutiveCronErrorsByJob();
  const activeCronErrors = Object.keys(consecutiveCronErrorsByJob).length;
  const validationLoopTasks = allTasks.filter(
    (task) => task.status !== "done" && task.status !== "blocked" && (task.same_reason_fail_streak ?? 0) >= 3
  ).length;
  const stalledBacklogTasks = allTasks.filter((task) => task.status === "backlog" && backlogAgeMinutes(task, nowMs) >= 45).length;
  const opsOpenIncidentTasks = allTasks.filter(
    (task) =>
      task.assigned_to === "ops" &&
      (task.status === "backlog" || task.status === "in_progress") &&
      /^\[OPS\]\s*Remediate sustained critical reliability incident/i.test(String(task.title ?? ""))
  ).length;
  const opsIncidentState = await loadOpsIncidentState();
  const handoffStateMeta = await loadHandoffStateMeta();
  const opsHealthModeRaw = String(process.env.OPS_HEALTH_MODE ?? "auto").toLowerCase();
  const opsHealthMode: "auto" | "cron" | "systemd" =
    opsHealthModeRaw === "cron" || opsHealthModeRaw === "systemd" ? opsHealthModeRaw : "auto";
  const opsSystemdHealth = await collectOpsSystemdHealth(nowMs);
  const opsExecutorHealth = await getCronJobHealthByName("ops-task-worker-5m");
  const opsRunningElapsedMs = opsExecutorHealth.runningAtMs > 0 ? nowMs - opsExecutorHealth.runningAtMs : Number.POSITIVE_INFINITY;
  const opsRunningBudgetMs = (opsExecutorHealth.timeoutSeconds + 90) * 1000;
  const opsRunningHealthy = opsExecutorHealth.runningAtMs > 0 && opsRunningElapsedMs >= 0 && opsRunningElapsedMs <= opsRunningBudgetMs;
  const opsExecutorHealthyFromCron =
    opsExecutorHealth.exists &&
    opsExecutorHealth.enabled &&
    (opsRunningHealthy || (opsExecutorHealth.lastStatus !== "error" && opsExecutorHealth.consecutiveErrors < 2));
  let opsHealthSource: OpsHealthSource = "none";
  let opsTimersHealthy = false;
  let opsMonitorLastSuccessAt: string | null = null;
  let opsWorkerLastSuccessAt: string | null = null;
  let opsExecutorHealthy = false;
  if (opsHealthMode === "cron") {
    opsHealthSource = opsExecutorHealth.exists ? "cron" : "none";
    opsExecutorHealthy = opsExecutorHealthyFromCron;
  } else if (opsHealthMode === "systemd") {
    opsHealthSource = opsSystemdHealth.source;
    opsTimersHealthy = opsSystemdHealth.timersHealthy;
    opsMonitorLastSuccessAt = opsSystemdHealth.monitorLastSuccessAt;
    opsWorkerLastSuccessAt = opsSystemdHealth.workerLastSuccessAt;
    opsExecutorHealthy = opsSystemdHealth.executorHealthy;
  } else if (opsSystemdHealth.source === "systemd") {
    opsHealthSource = "systemd";
    opsTimersHealthy = opsSystemdHealth.timersHealthy;
    opsMonitorLastSuccessAt = opsSystemdHealth.monitorLastSuccessAt;
    opsWorkerLastSuccessAt = opsSystemdHealth.workerLastSuccessAt;
    opsExecutorHealthy = opsSystemdHealth.executorHealthy;
  } else {
    opsHealthSource = opsExecutorHealth.exists ? "cron" : "none";
    opsExecutorHealthy = opsExecutorHealthyFromCron;
  }
  const opsIncidentStateValue: OpsIncidentState["status"] =
    opsHealthSource === "systemd" &&
    opsExecutorHealthy &&
    activeCronErrors === 0 &&
    opsIncidentState.status === "critical"
      ? "recovering"
      : opsIncidentState.status;
  const queueStallMinutes = healthyWorkerActivity
    ? 0
    : byStatus.in_progress > 0
      ? 0
      : Math.max(0, Math.min(opsIncidentState.queueStallMinutes, oldestBacklogAgeMinutes));
  const readinessComputed: "yes" | "no" =
    activeCronErrors === 0 && severity !== "critical" && queueStallMinutes < 45 ? "yes" : "no";
  const changelogEvaluated24h = allTasks.filter((task) => {
    const checkedAt = Date.parse(String(task.changelog_last_checked_at ?? ""));
    if (!Number.isFinite(checkedAt)) return false;
    return checkedAt >= nowMs - 24 * 60 * 60 * 1000;
  });
  const changelogPass24h = changelogEvaluated24h.filter((task) => task.changelog_status === "pass").length;
  const changelogFail24h = changelogEvaluated24h.filter((task) => task.changelog_status === "fail").length;
  const changelogCompliance24h =
    changelogPass24h + changelogFail24h > 0
      ? Number((changelogPass24h / (changelogPass24h + changelogFail24h)).toFixed(4))
      : 1;
  const changelogViolationsOpen = allTasks.filter((task) => task.status !== "done" && task.changelog_status === "fail").length;

  return {
    ok: true,
    action: "status" as const,
    total: allTasks.length,
    byStatus,
    byAssignee,
    pluginMetrics,
    workflowHealth: {
      contractVersion: "v2",
      targetAlertsTo: "ops",
      doneLast24h: runStats.doneLast24h,
      done_total: doneTotal,
      done_verified_pass: doneVerifiedPass,
      done_with_fail_validation: doneWithFailValidation,
      medianExecutionDurationMs: runStats.medianExecutionDurationMs,
      blockedRatio,
      blockedRatioRaw,
      severity,
      ready: readinessComputed,
      sustainedAlerts,
      criticalSustainedAlerts: sustainedCriticalAlerts,
      blockedByAssignee,
      oldestBacklogAgeMinutes,
      consecutiveCronErrorsByJob,
      activeCronErrors,
      consecutiveCriticalChecks: opsIncidentState.consecutiveCriticalChecks,
      queueStallMinutes,
      lastAutoRemediationAction: opsIncidentState.lastAutoRemediationAction,
      lastAutoRemediationActionEffective: opsIncidentState.lastAutoRemediationActionEffective,
      opsIncidentState: opsIncidentStateValue,
      opsExecutorHealthy,
      opsHealthSource,
      opsMonitorLastSuccessAt,
      opsWorkerLastSuccessAt,
      opsTimersHealthy,
      readinessSource: handoffStateMeta.readinessSource,
      handoffSnapshotValid: handoffStateMeta.snapshotValid,
      handoffGeneratedFrom: handoffStateMeta.generatedFrom,
      handoffGeneratedAt: handoffStateMeta.generatedAt,
      opsOpenIncidentTasks,
      validationLoopTasks,
      stalledBacklogTasks,
      changelogCompliance24h,
      changelogViolationsOpen,
      oldestSuggestedAgeMinutes,
      suggestedDeferredCandidates,
      staleSuggestedDeferredCandidates,
      deferredByReason,
      backlogByAssignee,
      throughputTargetPerDay: THROUGHPUT_TARGET_PER_DAY,
      doneByAssigneeLast24h,
      throughputEffectiveDoneByAssigneeLast24h,
      throughputCarryoverByAssignee,
      throughputQualityPenaltyByAssignee,
      throughputDeficitByAssignee,
      totalThroughputDeficit,
      challenger: {
        total: challengerTasks.length,
        byStatus: challengerByStatus,
      },
      alerts,
      criticalAlerts: nextCriticalAlerts,
    },
  };
}

async function reconcileStaleInProgressTasks(client: ConvexHttpClient, tasks: TaskDoc[], nowMs: number) {
  let requeued = 0;
  for (const task of tasks.filter((t) => t.status === "in_progress")) {
    const assignee = task.assigned_to;
    const leaseMs = LEASE_MINUTES_BY_ASSIGNEE[assignee] * 60 * 1000;
    const heartbeatFieldMs = Date.parse(String(task.heartbeat_at ?? ""));
    const heartbeatMs = Number.isFinite(heartbeatFieldMs) ? heartbeatFieldMs : parseLastHeartbeatMs(task.description);
    const updatedMs = Date.parse(String(task.updated_at ?? ""));
    const activityMs = heartbeatMs ?? (Number.isFinite(updatedMs) ? updatedMs : nowMs);
    const orphaned = !task.owner || task.owner !== assignee;
    const stale = nowMs - activityMs > leaseMs;

    if (!orphaned && !stale) continue;

    const prev = task.description?.trim() ?? "";
    const markerReason = orphaned ? "orphan_owner" : "stale_lease";
    const staleNote = `stale_lease_requeued: ${new Date(nowMs).toISOString()} reason=${markerReason}`;
    const cleaned = prev
      .split("\n")
      .filter((line) => !line.trim().startsWith("Heartbeat:"))
      .join("\n")
      .trim();
    const nextDesc = `${cleaned}${cleaned ? "\n\n" : ""}${staleNote}`;
    await client.mutation(api.tasks.updateTask, {
      id: task._id,
      description: nextDesc,
      owner: undefined,
      lease_until: undefined,
      heartbeat_at: undefined,
    });
    await client.mutation(api.tasks.updateStatus, { id: task._id, status: "backlog" });
    requeued += 1;
  }
  return requeued;
}

async function runKicker(client: ConvexHttpClient) {
  const nowMs = Date.now();
  const firstSnapshot = await loadAllTasks(client);
  const requeued = await reconcileStaleInProgressTasks(client, firstSnapshot, nowMs);
  const kickoffSnapshot = requeued > 0 ? await loadAllTasks(client) : firstSnapshot;
  const suggested = sortOldestFirst(kickoffSnapshot.filter((t) => t.status === "suggested"));
  const inProgressCount = kickoffSnapshot.filter((t) => t.status === "in_progress").length;

  let guardrailTriggered = false;
  let guardrailAccepted = 0;
  let guardrailDeferred = 0;
  let guardrailRevised = 0;

  const oldestSuggestedAgeMinutes = suggested.length > 0 ? ageMinutesFromCreatedAt(suggested[0], nowMs) : 0;
  if (
    suggested.length > 0 &&
    inProgressCount <= 1 &&
    oldestSuggestedAgeMinutes >= KICKER_GUARDRAIL_MIN_SUGGESTED_AGE_MINUTES
  ) {
    const guardrail = await runGuardrail(client, MAX_GUARDRAIL_PER_RUN);
    guardrailTriggered = true;
    guardrailAccepted += guardrail.accepted.length;
    guardrailDeferred += guardrail.deferred.length;
    guardrailRevised += guardrail.revised.length;
  }

  let secondSnapshot = guardrailTriggered ? await loadAllTasks(client) : kickoffSnapshot;
  const doneByAssigneeLast24h = collectDoneByAssigneeLast24h(secondSnapshot, nowMs);
  const doneVerifiedPassByAssigneeLast24h = collectDoneByAssigneeLast24h(
    secondSnapshot,
    nowMs,
    (task) => task.validation_status === "pass"
  );
  const throughputCarryoverByAssignee = collectPolicyBlockedCredits(secondSnapshot, nowMs);
  const throughputEffectiveDoneByAssigneeLast24h = (Object.keys(doneByAssigneeLast24h) as Assignee[]).reduce<
    Record<Assignee, number>
  >(
    (acc, assignee) => {
      acc[assignee] =
        (doneVerifiedPassByAssigneeLast24h[assignee] ?? 0) + (throughputCarryoverByAssignee[assignee] ?? 0);
      return acc;
    },
    { me: 0, alex: 0, sam: 0, lyra: 0, nova: 0, ops: 0, agent: 0 }
  );
  const throughputDeficitByAssignee = collectThroughputDeficit(throughputEffectiveDoneByAssigneeLast24h);
  const totalThroughputDeficit = sumThroughputDeficit(throughputDeficitByAssignee);

  const suggesterWake = {
    triggered: false,
    result: "skipped" as "skipped" | "triggered" | "failed",
    reason: "none",
    triggeredJobs: [] as Array<{ assignee: Assignee; name: string; jobId: string }>,
    failedJobs: [] as Array<{ assignee: Assignee; name: string; reason: string }>,
  };

  const activeQueueCount = secondSnapshot.filter((t) => t.status === "suggested" || t.status === "backlog" || t.status === "in_progress").length;
  const queuePressureHigh = activeQueueCount >= 18;
  if (activeQueueCount === 0 && totalThroughputDeficit > 0 && !queuePressureHigh) {
    const suggesterJobByAssignee: Partial<Record<Assignee, string>> = {
      sam: "sam-mission-suggester-3h",
      lyra: "lyra-capital-suggester-3h",
      nova: "nova-mission-suggester-3h",
    };
    const wakeCandidates = THROUGHPUT_WAKE_ASSIGNEES
      .map((assignee) => ({ assignee, deficit: throughputDeficitByAssignee[assignee] ?? 0 }))
      .filter((item) => item.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit);

    const primary = wakeCandidates[0];
    if (primary) {
      const assignee = primary.assignee;
      const jobName = suggesterJobByAssignee[assignee];
      if (jobName) {
        const jobId = await findCronJobIdByName(jobName);
        if (!jobId) {
          suggesterWake.failedJobs.push({ assignee, name: jobName, reason: "suggester_cron_job_not_found" });
        } else {
          try {
            await runCommand(`openclaw cron run ${jobId} --timeout 240000`);
            suggesterWake.triggeredJobs.push({ assignee, name: jobName, jobId });
          } catch (error) {
            suggesterWake.failedJobs.push({
              assignee,
              name: jobName,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    if (suggesterWake.triggeredJobs.length > 0) {
      suggesterWake.triggered = true;
      suggesterWake.result = "triggered";
    } else if (suggesterWake.failedJobs.length > 0) {
      suggesterWake.result = "failed";
      suggesterWake.reason = "all_suggester_wakes_failed";
    } else {
      suggesterWake.reason = "no_deficit_for_wake_assignees";
    }
  } else if (queuePressureHigh) {
    suggesterWake.reason = "queue_pressure_high";
  } else if (totalThroughputDeficit === 0) {
    suggesterWake.reason = "throughput_target_met";
  } else {
    suggesterWake.reason = "queue_not_idle";
  }

  if (suggesterWake.triggered) {
    secondSnapshot = await loadAllTasks(client);
    const suggestedAfterWake = secondSnapshot.filter((t) => t.status === "suggested");
    const inProgressAfterWake = secondSnapshot.filter((t) => t.status === "in_progress").length;
    if (suggestedAfterWake.length > 0 && inProgressAfterWake === 0) {
      const guardrail = await runGuardrail(client, MAX_GUARDRAIL_PER_RUN);
      guardrailTriggered = true;
      guardrailAccepted += guardrail.accepted.length;
      guardrailDeferred += guardrail.deferred.length;
      guardrailRevised += guardrail.revised.length;
      secondSnapshot = await loadAllTasks(client);
    }
  }

  const backlog = sortOldestFirst(
    secondSnapshot.filter((t) => t.status === "backlog" && (t.same_reason_fail_streak ?? 0) < 3)
  );
  const inProgressAfter = secondSnapshot.filter((t) => t.status === "in_progress").length;

  const workerWake = {
    triggered: false,
    assignee: null as Assignee | null,
    jobName: null as string | null,
    jobId: null as string | null,
    result: "skipped" as "skipped" | "triggered" | "failed",
    reason: "none" as string,
  };

  const backlogPressureHigh = backlog.length >= 8;
  if (backlog.length > 0 && (inProgressAfter === 0 || (backlogPressureHigh && inProgressAfter < 2))) {
    const rankedBacklog = [...backlog]
      .map((task) => {
        const ageMinutes = backlogAgeMinutes(task, nowMs);
        const combined = `${task.title}\n${task.description ?? ""}`.toLowerCase();
        const confidenceBoost = /confidence\s*[:=]\s*(0\.(7|8|9)\d*|1(\.0+)?)/.test(combined) ? 50 : 0;
        const implementPathBoost = /(deploy|artifact_path|integration|workflow_contract_version|execution output|verification|script)/.test(
          combined
        )
          ? 20
          : 0;
        return {
          task,
          score: Math.min(ageMinutes, 180) + confidenceBoost + implementPathBoost,
        };
      })
      .sort((a, b) => b.score - a.score);
    const oldest = rankedBacklog[0]?.task ?? backlog[0];
    const preferredAssignee: Assignee =
      oldest.assigned_to === "agent" ? "sam" : oldest.assigned_to === "me" ? "alex" : oldest.assigned_to;
    const workerJobByAssignee: Record<Assignee, string> = {
      me: "alex-worker-30m",
      alex: "alex-worker-30m",
      sam: "sam-worker-15m",
      lyra: "lyra-capital-worker-30m",
      nova: "nova-worker-30m",
      ops: "ops-task-worker-5m",
      agent: "sam-worker-15m",
    };
    const jobName = workerJobByAssignee[preferredAssignee];
    const jobId = await findCronJobIdByName(jobName);

    workerWake.assignee = preferredAssignee;
    workerWake.jobName = jobName;
    workerWake.jobId = jobId;

    if (jobId) {
      try {
        await runCommand(`openclaw cron run ${jobId} --timeout 300000`);
        workerWake.triggered = true;
        workerWake.result = "triggered";
      } catch (error) {
        workerWake.result = "failed";
        workerWake.reason = error instanceof Error ? error.message : String(error);
      }
    } else if (preferredAssignee === "ops") {
      try {
        await runCommand("systemctl --user start openclaw-ops-worker.service");
        workerWake.triggered = true;
        workerWake.result = "triggered";
        workerWake.reason = "systemd_ops_worker_started";
      } catch (error) {
        workerWake.result = "failed";
        workerWake.reason = error instanceof Error ? error.message : String(error);
      }
    } else {
      workerWake.reason = "worker_cron_job_not_found";
    }
  }

  return {
    ok: true,
    action: "kicker" as const,
    guardrail: {
      triggered: guardrailTriggered,
      accepted: guardrailAccepted,
      deferred: guardrailDeferred,
      revised: guardrailRevised,
      oldestSuggestedAgeMinutes,
      minSuggestedAgeMinutes: KICKER_GUARDRAIL_MIN_SUGGESTED_AGE_MINUTES,
      staleRequeued: requeued,
    },
    suggesterWake,
    throughput: {
      targetPerDay: THROUGHPUT_TARGET_PER_DAY,
      doneByAssigneeLast24h,
      doneVerifiedPassByAssigneeLast24h,
      effectiveDoneByAssigneeLast24h: throughputEffectiveDoneByAssigneeLast24h,
      carryoverByAssignee: throughputCarryoverByAssignee,
      deficitByAssignee: throughputDeficitByAssignee,
      totalDeficit: totalThroughputDeficit,
    },
    workerWake,
  };
}

async function runClaim(client: ConvexHttpClient, requestedAssignee: unknown) {
  const assignee = normalizeAssignee(requestedAssignee, "agent");
  await resetWorkerCronSessionIfNeeded(assignee);
  const allTasks = await loadAllTasks(client);

  // Resume owned in-progress first when lease is still fresh.
  // If lease is stale, requeue to backlog so workers can recover automatically.
  const inProgress = sortOldestFirst(allTasks.filter((t) => t.status === "in_progress" && t.assigned_to === assignee));
  if (inProgress.length > 0) {
    const candidate = inProgress[0];
    const nowMs = Date.now();
    const leaseMs = LEASE_MINUTES_BY_ASSIGNEE[assignee] * 60 * 1000;
    const heartbeatFieldMs = Date.parse(String(candidate.heartbeat_at ?? ""));
    const heartbeatMs = Number.isFinite(heartbeatFieldMs) ? heartbeatFieldMs : parseLastHeartbeatMs(candidate.description);
    const updatedMs = Date.parse(String(candidate.updated_at ?? ""));
    const activityMs = heartbeatMs ?? (Number.isFinite(updatedMs) ? updatedMs : nowMs);
    const isStale = nowMs - activityMs > leaseMs;

    if (!isStale) {
      const cleanedDesc = stripStaleLeaseMarkers(candidate.description);
      if (cleanedDesc !== (candidate.description ?? "").trim()) {
        await client.mutation(api.tasks.updateTask, { id: candidate._id, description: cleanedDesc });
      }
      const leaseUntilIso = new Date(nowMs + leaseMs).toISOString();
      await client.mutation(api.tasks.updateTask, {
        id: candidate._id,
        owner: assignee,
        lease_until: leaseUntilIso,
        heartbeat_at: new Date(nowMs).toISOString(),
        retry_count_run: 0,
        validation_status: "pending",
      });
      const requiredDraftPath = getDraftPath(String(candidate._id), assignee);
      return {
        ok: true,
        action: "claim" as const,
        resumed: true,
        task: {
          id: String(candidate._id),
          title: candidate.title,
          description: cleanedDesc,
          assigned_to: candidate.assigned_to,
          status: candidate.status,
          workflow_contract_version: "v2",
          required_draft_path: requiredDraftPath,
        },
      };
    }

    const prev = candidate.description?.trim() ?? "";
    const staleNote = `stale_lease_requeued: ${new Date().toISOString()} by ${assignee}`;
    const cleaned = prev
      .split("\n")
      .filter((line) => !line.trim().startsWith("Heartbeat:"))
      .join("\n")
      .trim();
    const nextDesc = `${cleaned}${cleaned ? "\n\n" : ""}${staleNote}`;
    await client.mutation(api.tasks.updateTask, {
      id: candidate._id,
      description: nextDesc,
      owner: undefined,
      lease_until: undefined,
      heartbeat_at: undefined,
    });
    await client.mutation(api.tasks.updateStatus, { id: candidate._id, status: "backlog" });
  }

  const backlog = sortOldestFirst(allTasks.filter((t) => t.status === "backlog"));
  let selected: TaskDoc | undefined;

  if (assignee === "sam") {
    selected = backlog.find((t) => t.assigned_to === "sam" && isChallengerTask(t));
    if (!selected) selected = backlog.find((t) => t.assigned_to === "agent" && isChallengerTask(t));
    // Sam scope priority: Mission Control / autonomy core platform first.
    if (!selected) selected = backlog.find((t) => t.assigned_to === "sam" && isSamCorePlatformTask(t));
    if (!selected) selected = backlog.find((t) => t.assigned_to === "agent" && isSamCorePlatformTask(t));
    if (!selected) selected = backlog.find((t) => t.assigned_to === "sam");
    if (!selected) selected = backlog.find((t) => t.assigned_to === "agent");
  } else {
    selected = backlog.find((t) => t.assigned_to === assignee && isChallengerTask(t));
    if (!selected) selected = backlog.find((t) => t.assigned_to === assignee);
  }

  if (!selected) {
    return { ok: true, action: "claim" as const, task: null, message: "no_matching_backlog_task" };
  }

  // Atomically transition to in_progress and set owner/lease in a single mutation
  // to eliminate the race window where another claim could steal the task (Issue 1 fix).
  const claimNowMs = Date.now();
  const claimNowIso = new Date(claimNowMs).toISOString();
  const claimLeaseUntilIso = new Date(claimNowMs + LEASE_MINUTES_BY_ASSIGNEE[assignee] * 60 * 1000).toISOString();
  const cleanedSelectedDesc = stripStaleLeaseMarkers(selected.description);
  await client.mutation(api.tasks.updateTask, {
    id: selected._id,
    status: "in_progress" as const,
    owner: assignee,
    lease_until: claimLeaseUntilIso,
    heartbeat_at: claimNowIso,
    retry_count_run: 0,
    validation_status: "pending",
    ...(cleanedSelectedDesc !== (selected.description ?? "").trim() ? { description: cleanedSelectedDesc } : {}),
  });
  const requiredDraftPath = getDraftPath(String(selected._id), assignee);

  return {
    ok: true,
    action: "claim" as const,
    resumed: false,
    task: {
      id: String(selected._id),
      title: selected.title,
      description: cleanedSelectedDesc,
      assigned_to: selected.assigned_to,
      status: "in_progress" as const,
      workflow_contract_version: "v2",
      required_draft_path: requiredDraftPath,
    },
  };
}

function extractArtifactPath(output: string): string | undefined {
  const lines = output.split("\n").map((l) => l.trim());
  const candidate = lines.find((line) => line.includes("/home/ubuntu/") || line.includes("/workspace"));
  if (!candidate) return undefined;
  const m = candidate.match(/(\/home\/ubuntu\/[\w\-./]+)/);
  return m?.[1];
}

function isUiTask(taskTitle: string, assignee: Assignee): boolean {
  if (assignee !== "nova") return false;
  return /(ui|ux|dashboard|layout|mission control|frontend|sidebar|component|page)/i.test(taskTitle);
}

function outputImpliesNotDeployed(output: string): boolean {
  const s = output.toLowerCase();
  return (
    s.includes("pending next.js rebuild") ||
    s.includes("pending rebuild") ||
    s.includes("needs rebuild") ||
    s.includes("still shows old ui") ||
    s.includes("not live yet") ||
    s.includes("requires rebuild")
  );
}

function outputIndicatesIssueFound(output: string, taskTitle: string, reason?: string): boolean {
  const text = `${taskTitle}\n${output}`.toLowerCase();
  if (reason && reason !== "artifact_path_missing" && reason !== "artifact_not_found" && reason !== "ui_not_deployed") {
    return false;
  }
  return (
    text.includes("bug") ||
    text.includes("issue") ||
    text.includes("error") ||
    text.includes("fail") ||
    text.includes("broken") ||
    text.includes("regression") ||
    text.includes("alert component")
  );
}

const AUTONOMOUS_ASSIGNEES = new Set<Assignee>(["alex", "sam", "lyra", "nova", "ops"]);
type GithubMode = "pr" | "direct_push" | "skipped";

type GithubDelivery = {
  mode?: GithubMode;
  repo?: string;
  branch?: string;
  commit?: string;
  prUrl?: string;
  pushRef?: string;
  skippedReason?: string;
  directPushJustification?: string;
};

type RunUpdateField = {
  key: "what_changed" | "what_remains" | "risk" | "eta";
  aliases: string[];
};

const RUN_UPDATE_FIELDS: RunUpdateField[] = [
  { key: "what_changed", aliases: ["what changed", "what_changed", "what-changed"] },
  { key: "what_remains", aliases: ["what remains", "what_remains", "what-remains"] },
  { key: "risk", aliases: ["risk"] },
  { key: "eta", aliases: ["eta"] },
];

function normalizeOutputFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]+/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseLabeledSections(output: string): Map<string, string> {
  const lines = output.split("\n");
  const sections = new Map<string, string[]>();
  let currentKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    const match = line.match(/^\s*(?:[-*]\s*|\d+[.)]\s*)?(?:\*\*|__)?([A-Za-z][A-Za-z0-9 _-]{0,80})(?:\*\*|__)?\s*:\s*(.*)$/);
    if (match) {
      currentKey = normalizeOutputFieldKey(match[1]);
      if (!sections.has(currentKey)) sections.set(currentKey, []);
      const inlineValue = match[2]?.trim();
      if (inlineValue) {
        sections.get(currentKey)!.push(inlineValue);
      }
      continue;
    }
    if (currentKey) {
      sections.get(currentKey)!.push(line);
    }
  }

  const normalized = new Map<string, string>();
  sections.forEach((values, key) => {
    normalized.set(
      key,
      values
        .join("\n")
        .trim()
    );
  });
  return normalized;
}

function hasAliasInOutput(output: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[_-]/g, "[-_ ]");
  const pattern = new RegExp(
    `^\\s*(?:[-*]\\s*|\\d+[.)]\\s*)?(?:\\*\\*|__)?${escaped}(?:\\*\\*|__)?\\s*:\\s*.+$`,
    "im"
  );
  return pattern.test(output);
}

function getMissingRunUpdateFields(output: string): string[] {
  const sections = parseLabeledSections(output);
  return RUN_UPDATE_FIELDS.filter((field) =>
    !field.aliases.some((alias) => sections.has(normalizeOutputFieldKey(alias)) || hasAliasInOutput(output, alias))
  ).map((field) => field.key);
}

function getParsedRunUpdateLabels(output: string): string[] {
  const sections = parseLabeledSections(output);
  const parsed = new Set<string>(
    Array.from(sections.keys()).filter((key) =>
      RUN_UPDATE_FIELDS.some((field) => field.aliases.some((alias) => normalizeOutputFieldKey(alias) === key))
    )
  );
  for (const field of RUN_UPDATE_FIELDS) {
    if (field.aliases.some((alias) => hasAliasInOutput(output, alias))) {
      parsed.add(field.key);
    }
  }
  return Array.from(parsed).sort();
}

function hasMeasurableWhyBetter(output: string): boolean {
  const sections = parseLabeledSections(output);
  const snippet = sections.get("why_this_is_better");
  if (!snippet) return false;
  return /(\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:ms|s|sec|secs|px|rem)|\bfrom\b[\s\S]{1,120}\bto\b|reduced|increased|improved|faster|slower)/i.test(
    snippet
  );
}

function extractLabel(output: string, label: string): string | undefined {
  const sections = parseLabeledSections(output);
  const normalizedLabel = normalizeOutputFieldKey(label);
  const fromSections = sections.get(normalizedLabel);
  if (fromSections) {
    const firstLine = fromSections.split("\n")[0]?.trim();
    if (firstLine) return firstLine;
  }
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*(?:[-*]\\s*|\\d+[.)]\\s*)?(?:\\*\\*|__)?${escaped}(?:\\*\\*|__)?\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function extractPathLabel(output: string, label: string): string | undefined {
  const value = extractLabel(output, label);
  if (!value) return undefined;
  const m = value.match(/(\/home\/ubuntu\/[\w\-./]+)/);
  return m?.[1];
}

function parseReviewDecision(output: string): "pass" | "fail" | undefined {
  const value = extractLabel(output, "review_decision");
  if (!value) return undefined;
  if (/^pass$/i.test(value)) return "pass";
  if (/^fail$/i.test(value)) return "fail";
  return undefined;
}

const CODE_TASK_KEYWORDS = [
  "build",
  "deploy",
  "fix",
  "feature",
  "refactor",
  "pipeline",
  "api",
  "worker",
  "script",
  "automation",
  "frontend",
  "backend",
  "ui",
  "mission control",
];

const OUTAGE_KEYWORDS = [
  "outage",
  "down",
  "incident",
  "sev1",
  "sev-1",
  "production down",
  "service unavailable",
  "p0",
];

const CODE_ARTIFACT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sh", ".go", ".rs"];
const CODE_CONFIG_ARTIFACT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".sh",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".css",
  ".scss",
  ".html",
];
const CHANGELOG_ALLOWED_ROOTS = [
  "/home/ubuntu/.openclaw/workspace/changelog",
  "/home/ubuntu/.openclaw/workspace-sam/changelog",
  "/home/ubuntu/.openclaw/workspace-lyra/changelog",
  "/home/ubuntu/.openclaw/workspace-nova/changelog",
  "/home/ubuntu/mission-control/changelog",
  "/home/ubuntu/.openclaw/changelog",
];
const CHANGELOG_FILENAME_REGEX = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const CHANGELOG_FEATURE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHANGELOG_REQUIRED_SECTIONS = [
  "timestamp",
  "actor",
  "task/trigger",
  "files changed",
  "change summary",
  "verification",
  "rollback note",
  "outcome",
  "lessons",
  "next opening",
  "links",
];
const CHANGELOG_RUNTIME_EXEMPT_PATH_PATTERNS = ["/reports/", "/logs/", "/cache/", "/tmp/"];

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function inferRepoRoot(pathCandidate?: string): Promise<string | undefined> {
  if (!pathCandidate) return undefined;
  const baseDir = pathCandidate.endsWith("/") ? pathCandidate : dirname(pathCandidate);
  try {
    const out = await runCommand(`git -C ${shellQuote(baseDir)} rev-parse --show-toplevel`);
    const firstLine = out.split("\n")[0]?.trim();
    if (!firstLine || !firstLine.startsWith("/")) return undefined;
    return firstLine;
  } catch {
    return undefined;
  }
}

function isCodeIntentTask(taskTitle: string, taskDescription: string | undefined, output: string, artifactPath?: string): boolean {
  const combined = `${taskTitle}\n${taskDescription ?? ""}\n${output}`.toLowerCase();
  if (CODE_TASK_KEYWORDS.some((kw) => combined.includes(kw))) return true;
  if (artifactPath) {
    const lower = artifactPath.toLowerCase();
    if (CODE_ARTIFACT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
    if (lower.includes("/mission-control/")) return true;
  }
  return false;
}

function isLikelyRuntimeLogOnlyPath(pathCandidate?: string): boolean {
  if (!pathCandidate) return false;
  const lower = pathCandidate.toLowerCase();
  if (lower.endsWith(".jsonl")) return true;
  return CHANGELOG_RUNTIME_EXEMPT_PATH_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isCodeConfigEditTask(
  taskTitle: string,
  taskDescription: string | undefined,
  output: string,
  artifactPath?: string
): boolean {
  void taskTitle;
  void taskDescription;
  void output;
  if (!artifactPath) return false;
  const resolvedArtifact = resolve(artifactPath);
  const lowerArtifact = resolvedArtifact.toLowerCase();
  if (isLikelyRuntimeLogOnlyPath(resolvedArtifact)) return false;
  const inManagedPaths =
    lowerArtifact.startsWith(`${MISSION_CONTROL_ROOT.toLowerCase()}/`) ||
    /\/\.openclaw\/workspace(?:-sam|-lyra|-nova)?\/(tools|scripts|autonomy|agent|artifacts)\//i.test(lowerArtifact) ||
    lowerArtifact.startsWith("/home/ubuntu/.openclaw/");
  if (!inManagedPaths) return false;
  if (CODE_CONFIG_ARTIFACT_EXTENSIONS.some((ext) => lowerArtifact.endsWith(ext))) return true;
  if (
    /\/(?:openclaw\.json|openclaw\.json\.bak|package\.json|package-lock\.json|tsconfig\.json|next\.config\.js|tailwind\.config\.js|postcss\.config\.js|\.env(?:\.[^/]+)?)$/i.test(
      lowerArtifact
    )
  ) {
    return true;
  }
  return false;
}

function normalizeFeatureSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type ChangelogDelivery = {
  required: boolean;
  path?: string;
  feature?: string;
  exemptReason?: string;
  status: "pending" | "pass" | "fail";
};

function parseChangelogDelivery(
  output: string,
  requestedPath: unknown,
  requestedFeature: unknown,
  requestedExemptReason: unknown
): ChangelogDelivery {
  const pathFromBody = typeof requestedPath === "string" ? requestedPath.trim() : "";
  const featureFromBody = typeof requestedFeature === "string" ? requestedFeature.trim() : "";
  const exemptFromBody = typeof requestedExemptReason === "string" ? requestedExemptReason.trim() : "";
  const pathFromOutput = extractPathLabel(output, "changelog_path");
  const featureFromOutput = extractLabel(output, "changelog_feature");
  const exemptFromOutput = extractLabel(output, "changelog_exempt_reason");

  return {
    required: false,
    path: pathFromBody || pathFromOutput,
    feature: normalizeFeatureSlug(featureFromBody || featureFromOutput || ""),
    exemptReason: exemptFromBody || exemptFromOutput,
    status: "pending",
  };
}

async function validateChangelogDelivery(
  taskTitle: string,
  taskDescription: string | undefined,
  output: string,
  artifactPath: string | undefined,
  requestedPath: unknown,
  requestedFeature: unknown,
  requestedExemptReason: unknown
): Promise<{ status: "pass" | "fail"; reason?: string; changelog: ChangelogDelivery }> {
  const changelog = parseChangelogDelivery(output, requestedPath, requestedFeature, requestedExemptReason);
  const featureEdit = isCodeConfigEditTask(taskTitle, taskDescription, output, artifactPath);
  changelog.required = featureEdit;

  if (!featureEdit) {
    changelog.status = "pending";
    return { status: "pass", changelog };
  }

  if (isLikelyRuntimeLogOnlyPath(artifactPath)) {
    const exemptReason = changelog.exemptReason?.trim();
    if (!exemptReason || exemptReason.length < 6) {
      changelog.status = "fail";
      return { status: "fail", reason: "changelog_missing", changelog };
    }
    changelog.status = "pending";
    return { status: "pass", changelog };
  }

  if (!changelog.path || !changelog.feature) {
    changelog.status = "fail";
    return { status: "fail", reason: "changelog_missing", changelog };
  }

  if (!CHANGELOG_FEATURE_REGEX.test(changelog.feature)) {
    changelog.status = "fail";
    return { status: "fail", reason: "changelog_invalid_filename", changelog };
  }

  const resolved = resolve(changelog.path);
  const allowed = CHANGELOG_ALLOWED_ROOTS.some((root) => resolved === root || resolved.startsWith(`${root}/`));
  if (!allowed) {
    changelog.status = "fail";
    return { status: "fail", reason: "changelog_invalid_path", changelog };
  }

  const fileName = basename(resolved);
  if (!CHANGELOG_FILENAME_REGEX.test(fileName)) {
    changelog.status = "fail";
    return { status: "fail", reason: "changelog_invalid_filename", changelog };
  }
  if (!fileName.endsWith(`-${changelog.feature}.md`)) {
    changelog.status = "fail";
    return { status: "fail", reason: "changelog_invalid_filename", changelog };
  }

  let content = "";
  try {
    content = await readFile(resolved, "utf8");
  } catch {
    changelog.status = "fail";
    return { status: "fail", reason: "changelog_invalid_path", changelog };
  }
  const normalized = content.toLowerCase();
  const missingSections = CHANGELOG_REQUIRED_SECTIONS.filter((label) => !normalized.includes(label));
  if (missingSections.length > 0) {
    changelog.status = "fail";
    return { status: "fail", reason: "changelog_missing_required_sections", changelog };
  }

  changelog.path = resolved;
  changelog.status = "pass";
  return { status: "pass", changelog };
}

function isUrgentHotfixTask(taskTitle: string, taskDescription: string | undefined, output: string): boolean {
  const combined = `${taskTitle}\n${taskDescription ?? ""}\n${output}`.toLowerCase();
  if (!combined.includes("urgent-hotfix")) return false;
  return OUTAGE_KEYWORDS.some((kw) => combined.includes(kw));
}

function parseGithubDelivery(output: string): GithubDelivery {
  const modeRaw = extractLabel(output, "github_mode")?.toLowerCase();
  const mode: GithubMode | undefined =
    modeRaw === "pr" || modeRaw === "direct_push" || modeRaw === "skipped"
      ? (modeRaw as GithubMode)
      : undefined;
  return {
    mode,
    repo: extractLabel(output, "github_repo"),
    branch: extractLabel(output, "github_branch"),
    commit: extractLabel(output, "github_commit"),
    prUrl: extractLabel(output, "github_pr_url"),
    pushRef: extractLabel(output, "github_push_ref"),
    skippedReason: extractLabel(output, "github_skipped_reason"),
    directPushJustification: extractLabel(output, "direct_push_justification"),
  };
}

function isContractValidationReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return /^(run_update_missing_fields|why_better_not_measurable|challenger_missing_fields|artifact_path_missing|github_|ui_|deploy_|review_decision_missing|missing_task_draft|draft_|changelog_)/.test(
    reason
  );
}

function isValidGithubRepo(value?: string): boolean {
  if (!value) return false;
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.trim());
}

function isValidSha(value?: string): boolean {
  if (!value) return false;
  return /^[a-f0-9]{7,40}$/i.test(value.trim());
}

function isValidBranch(value?: string): boolean {
  if (!value) return false;
  return /^[A-Za-z0-9._\-\/]{3,200}$/.test(value.trim());
}

function isValidPrBranchConvention(value: string | undefined, assignee: Assignee, taskId: string): boolean {
  if (!value) return false;
  const escapedTaskId = taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAssignee = assignee.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^agent\\/${escapedAssignee}\\/${escapedTaskId}(?:-[A-Za-z0-9._-]+)?$`);
  return pattern.test(value.trim());
}

function isValidPrUrl(value?: string): boolean {
  if (!value) return false;
  return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/i.test(value.trim());
}

function isValidPushRef(value?: string): boolean {
  if (!value) return false;
  return /^refs\/heads\/[A-Za-z0-9._\-\/]{2,200}$/i.test(value.trim());
}

async function validateGithubDelivery(
  taskTitle: string,
  taskDescription: string | undefined,
  output: string,
  assignee: Assignee,
  taskId: string,
  artifactPath?: string
): Promise<{ status: "pass" | "fail"; reason?: string; github: GithubDelivery }> {
  const github = parseGithubDelivery(output);
  const codeTask = isCodeIntentTask(taskTitle, taskDescription, output, artifactPath);
  if (!codeTask) return { status: "pass", github };

  if (!github.mode) {
    return { status: "fail", reason: "github_mode_missing", github };
  }

  const repoRoot = await inferRepoRoot(artifactPath);
  if (!repoRoot) {
    if (github.mode !== "skipped") {
      return { status: "fail", reason: "github_non_repo_requires_skipped", github };
    }
    if (!github.skippedReason || github.skippedReason.length < 6) {
      return { status: "fail", reason: "github_skipped_reason_missing", github };
    }
    return { status: "pass", github };
  }

  if (!isValidGithubRepo(github.repo)) {
    return { status: "fail", reason: "github_repo_invalid", github };
  }

  if (github.mode === "pr") {
    if (!isValidBranch(github.branch)) return { status: "fail", reason: "github_branch_invalid", github };
    if (!isValidPrBranchConvention(github.branch, assignee, taskId)) {
      return { status: "fail", reason: "github_branch_convention_invalid", github };
    }
    if (!isValidSha(github.commit)) return { status: "fail", reason: "github_commit_invalid", github };
    if (!isValidPrUrl(github.prUrl)) return { status: "fail", reason: "github_pr_url_invalid", github };
    return { status: "pass", github };
  }

  if (github.mode === "direct_push") {
    if (!isUrgentHotfixTask(taskTitle, taskDescription, output)) {
      return { status: "fail", reason: "github_direct_push_not_allowed", github };
    }
    if (!isValidBranch(github.branch)) return { status: "fail", reason: "github_branch_invalid", github };
    if (!isValidSha(github.commit)) return { status: "fail", reason: "github_commit_invalid", github };
    if (!isValidPushRef(github.pushRef)) return { status: "fail", reason: "github_push_ref_invalid", github };
    if (!github.directPushJustification || github.directPushJustification.length < 8) {
      return { status: "fail", reason: "github_direct_push_justification_missing", github };
    }
    return { status: "pass", github };
  }

  if (!github.skippedReason || github.skippedReason.length < 6) {
    return { status: "fail", reason: "github_skipped_reason_missing", github };
  }
  return { status: "pass", github };
}

function isAlexReviewTask(description?: string): boolean {
  return (description ?? "").toLowerCase().includes("review_required_by:alex");
}

function isChallengerTitle(taskTitle: string): boolean {
  return /^\[challenger\]/i.test(taskTitle);
}

function getMissingChallengerFields(output: string): string[] {
  const required: Array<{ key: string; regex: RegExp }> = [
    { key: "challenger_hypothesis", regex: /^challenger_hypothesis\s*:/im },
    { key: "challenger_result", regex: /^challenger_result\s*:/im },
    { key: "challenger_tradeoff", regex: /^challenger_tradeoff\s*:/im },
  ];
  return required.filter((f) => !f.regex.test(output)).map((f) => f.key);
}

async function validateCompletion(
  taskId: string,
  taskTitle: string,
  taskDescription: string | undefined,
  assignee: Assignee,
  output: string,
  artifactPath?: string,
  taskCreatedAt?: string,
  requestedChangelogPath?: unknown,
  requestedChangelogFeature?: unknown,
  requestedChangelogExemptReason?: unknown
): Promise<{ status: "pass" | "fail"; reason?: string; github?: GithubDelivery; changelog?: ChangelogDelivery }> {
  if (AUTONOMOUS_ASSIGNEES.has(assignee)) {
    const missing = getMissingRunUpdateFields(output);
    if (missing.length > 0) {
      const missingSorted = [...missing].sort();
      const parsed = getParsedRunUpdateLabels(output);
      const parsedLabel = parsed.length > 0 ? parsed.join(",") : "none";
      return { status: "fail", reason: `run_update_missing_fields:${missingSorted.join(",")};parsed:${parsedLabel}` };
    }
    if (!hasMeasurableWhyBetter(output)) {
      return { status: "fail", reason: "why_better_not_measurable" };
    }
  }

  if (isChallengerTitle(taskTitle)) {
    const missing = getMissingChallengerFields(output);
    if (missing.length > 0) {
      return { status: "fail", reason: `challenger_missing_fields:${missing.join(",")}` };
    }
  }

  if (!artifactPath) return { status: "fail", reason: "artifact_path_missing" };

  try {
    await readFile(artifactPath, "utf8");
  } catch {
    return { status: "fail", reason: "artifact_not_found" };
  }

  const title = taskTitle.toLowerCase();

  if (isUiTask(taskTitle, assignee)) {
    if (!artifactPath.startsWith("/home/ubuntu/mission-control/")) {
      return { status: "fail", reason: "ui_artifact_outside_mission_control" };
    }
    if (outputImpliesNotDeployed(output)) {
      return { status: "fail", reason: "ui_not_deployed" };
    }
    const beforeScreenshot = extractPathLabel(output, "before_screenshot");
    const afterScreenshot = extractPathLabel(output, "after_screenshot");
    if (!beforeScreenshot || !afterScreenshot) {
      return { status: "fail", reason: "ui_screenshot_missing" };
    }
    if (beforeScreenshot === afterScreenshot) {
      return { status: "fail", reason: "ui_screenshots_identical_path" };
    }
    try {
      await readFile(beforeScreenshot, "utf8");
      await readFile(afterScreenshot, "utf8");
    } catch {
      return { status: "fail", reason: "ui_screenshot_not_found" };
    }

    const componentsChanged = extractLabel(output, "components_changed");
    if (!componentsChanged || componentsChanged.length < 8) {
      return { status: "fail", reason: "ui_components_changed_missing" };
    }

    const checks = extractLabel(output, "checks") ?? extractLabel(output, "quality_checks") ?? "";
    const checksNorm = checks.toLowerCase();
    const checksPass =
      checksNorm.includes("overflow=pass") &&
      checksNorm.includes("readability=pass") &&
      checksNorm.includes("mobile=pass");
    if (!checksPass) {
      return { status: "fail", reason: "ui_quality_checks_missing" };
    }

    if (!hasMeasurableWhyBetter(output)) {
      return { status: "fail", reason: "ui_why_better_not_measurable" };
    }
  }

  const touchesMissionControl = artifactPath.startsWith(`${MISSION_CONTROL_ROOT}/`);
  if (touchesMissionControl) {
    let deployMetaRaw = "";
    try {
      deployMetaRaw = await readFile(DEPLOY_STATE_FILE, "utf8");
    } catch {
      return { status: "fail", reason: "deploy_metadata_missing" };
    }

    type DeployState = { status?: string; deployedAt?: string };
    let deployMeta: DeployState = {};
    try {
      deployMeta = JSON.parse(deployMetaRaw) as DeployState;
    } catch {
      return { status: "fail", reason: "deploy_metadata_invalid" };
    }

    const deployedAtMs = Date.parse(String(deployMeta.deployedAt ?? ""));
    if (!Number.isFinite(deployedAtMs)) return { status: "fail", reason: "deploy_timestamp_invalid" };
    if (deployMeta.status !== "ok") return { status: "fail", reason: "deploy_status_not_ok" };

    const createdAtMs = Date.parse(String(taskCreatedAt ?? ""));
    if (Number.isFinite(createdAtMs) && deployedAtMs < createdAtMs) {
      return { status: "fail", reason: "deploy_not_after_task_created" };
    }
  }

  // code/script validators
  if (/(build|script|tool|pipeline|automation|parser|api)/.test(title)) {
    if (artifactPath.endsWith(".sh")) {
      try {
        await runCommand(`bash -n "${artifactPath}"`);
      } catch {
        return { status: "fail", reason: "shell_syntax_error" };
      }
    }
    if (artifactPath.endsWith(".py")) {
      try {
        await runCommand(`python3 -m py_compile "${artifactPath}"`);
      } catch {
        return { status: "fail", reason: "python_compile_error" };
      }
    }
  }

  // research validators
  if (/(research|analysis|report|intelligence|study)/.test(title)) {
    const content = await readFile(artifactPath, "utf8");
    const sources = (content.match(/https?:\/\//g) ?? []).length;
    if (content.length < 300) return { status: "fail", reason: "research_too_short" };
    if (sources < 1) return { status: "fail", reason: "research_missing_sources" };
  }

  const changelogValidation = await validateChangelogDelivery(
    taskTitle,
    taskDescription,
    output,
    artifactPath,
    requestedChangelogPath,
    requestedChangelogFeature,
    requestedChangelogExemptReason
  );
  if (changelogValidation.status === "fail") {
    return { status: "fail", reason: changelogValidation.reason, changelog: changelogValidation.changelog };
  }

  const githubValidation = await validateGithubDelivery(taskTitle, taskDescription, output, assignee, taskId, artifactPath);
  if (githubValidation.status === "fail") {
    return {
      status: "fail",
      reason: githubValidation.reason,
      github: githubValidation.github,
      changelog: changelogValidation.changelog,
    };
  }

  return { status: "pass", github: githubValidation.github, changelog: changelogValidation.changelog };
}

async function runComplete(
  client: ConvexHttpClient,
  taskId: unknown,
  output: unknown,
  requestedAssignee: unknown,
  requestedArtifactPath: unknown,
  requestedChangelogPath: unknown,
  requestedChangelogFeature: unknown,
  requestedChangelogExemptReason: unknown
) {
  if (!taskId || typeof taskId !== "string") {
    return { ok: false, error: "taskId is required" };
  }

  const allTasks = await loadAllTasks(client);
  const task = allTasks.find((t) => String(t._id) === taskId);
  if (!task) {
    return { ok: false, error: `task not found: ${taskId}` };
  }

  const assignee = normalizeAssignee(requestedAssignee ?? task.assigned_to, task.assigned_to);
  const outputStr = typeof output === "string" ? output.trim() : "";
  const artifactPath =
    (typeof requestedArtifactPath === "string" && requestedArtifactPath.trim()) || extractArtifactPath(outputStr);
  const draftValidation = await validateTaskDraft(taskId, assignee);
  const artifactValidation = await validateCompletion(
    taskId,
    task.title,
    task.description,
    assignee,
    outputStr,
    artifactPath,
    task.created_at,
    requestedChangelogPath,
    requestedChangelogFeature,
    requestedChangelogExemptReason
  );
  let validation = draftValidation.status === "fail" ? draftValidation : artifactValidation;
  const reviewTask = isAlexReviewTask(task.description);
  const novaUiHandoff = assignee === "nova" && isUiTask(task.title, assignee);
  const reviewDecision = reviewTask && assignee === "alex" ? parseReviewDecision(outputStr) : undefined;
  const blockedOutcome = isContractValidationReason(validation.reason)
    ? { blocked: false as const }
    : classifyBlockedOutcome(outputStr, validation.reason);
  if (reviewTask && assignee === "alex" && validation.status === "pass" && !reviewDecision) {
    validation = { status: "fail", reason: "review_decision_missing" };
  }

  const prev = task.description?.trim() ?? "";
  const completionBlock = [
    "---",
    "**Execution Output:**",
    outputStr || "(no output)",
    `Draft: ${draftValidation.draftPath ?? "(not required)"}`,
    `Draft validation: ${draftValidation.status}${draftValidation.reason ? ` (${draftValidation.reason})` : ""}`,
    artifactPath ? `Artifact: ${artifactPath}` : "Artifact: (missing)",
    artifactValidation.changelog?.path ? `Changelog: ${artifactValidation.changelog.path}` : "Changelog: (missing or not required)",
    artifactValidation.changelog?.feature
      ? `Changelog Feature: ${artifactValidation.changelog.feature}`
      : "Changelog Feature: (missing or not required)",
    `Validation: ${validation.status}${validation.reason ? ` (${validation.reason})` : ""}`,
  ].join("\n");
  const newDesc = prev ? `${prev}\n\n${completionBlock}` : completionBlock;

  let descriptionWithFollowUp = newDesc;
  let followUpTaskId: string | undefined;
  let finalStatus: Status = validation.status === "pass" ? "done" : "backlog";
  let finalAssignee: Assignee = task.assigned_to;
  let finalValidationStatus: "pending" | "pass" | "fail" = validation.status === "pass" ? "pass" : "fail";
  let blockedReason: string | undefined;
  let blockedUntil: string | undefined;
  let unblockSignal: string | undefined;
  const previousValidationReason =
    typeof task.last_validation_reason === "string" && task.last_validation_reason.trim().length > 0
      ? task.last_validation_reason
      : undefined;
  const previousSameReasonFailStreak =
    typeof task.same_reason_fail_streak === "number" && Number.isFinite(task.same_reason_fail_streak)
      ? Math.max(0, Math.floor(task.same_reason_fail_streak))
      : 0;
  const currentValidationReason = validation.status === "fail" ? validation.reason ?? "validation_failed" : undefined;
  let sameReasonFailStreak =
    validation.status === "fail"
      ? previousValidationReason === currentValidationReason
        ? previousSameReasonFailStreak + 1
        : 1
      : 0;
  let remediationTaskId =
    typeof task.remediation_task_id === "string" && task.remediation_task_id.trim().length > 0
      ? task.remediation_task_id
      : undefined;
  const isRemediationTask = /^Remediate validation loop:/i.test(task.title);

  if (validation.status === "fail" && !reviewTask && !novaUiHandoff && blockedOutcome.blocked) {
    finalStatus = "blocked";
    finalValidationStatus = "fail";
    blockedReason = blockedOutcome.blockedReason ?? "external_constraint";
    blockedUntil = blockedOutcome.blockedUntil ?? "condition_based";
    unblockSignal = blockedOutcome.unblockSignal ?? "manual_recheck";
    descriptionWithFollowUp = [
      descriptionWithFollowUp,
      "",
      `blocked_reason: ${blockedReason}`,
      `blocked_until: ${blockedUntil}`,
      `unblock_signal: ${unblockSignal}`,
    ].join("\n");
  } else if (validation.status === "fail" && !reviewTask && !novaUiHandoff && sameReasonFailStreak >= 3) {
    finalStatus = "blocked";
    finalValidationStatus = "fail";
    blockedReason = "validation_contract_mismatch";
    blockedUntil = "manual_or_policy_update";
    unblockSignal = "validator_or_prompt_alignment";

    if (!isRemediationTask) {
      const existingRemediation = allTasks
        .filter(
          (candidate) =>
            candidate.title.startsWith(`Remediate validation loop: ${String(task._id)}`) && candidate.status !== "done"
        )
        .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)))[0];

      if (existingRemediation) {
        remediationTaskId = String(existingRemediation._id);
      } else {
        const payloadExcerpt = outputStr.replace(/\s+/g, " ").slice(0, 500);
        const remediationDescription = [
          `Source task: ${String(task._id)}`,
          `Assignee: ${assignee}`,
          `Fail streak: ${sameReasonFailStreak}`,
          `Last validation reason: ${currentValidationReason}`,
          "",
          "This task was auto-blocked after 3 repeated validation failures with the same reason.",
          "Required remediation:",
          "- align worker prompt output keys with validator contract",
          "- confirm canonical endpoint and completion payload format",
          "- run one successful complete cycle and unblock source task",
          "",
          "Latest output excerpt:",
          payloadExcerpt || "(empty output)",
        ].join("\n");

        const remediationId = await client.mutation(api.tasks.create, {
          title: `Remediate validation loop: ${String(task._id)}`.slice(0, 120),
          description: remediationDescription,
          assigned_to: "alex",
          status: "backlog",
          idempotency_key: `remediation:${String(task._id)}`,
          intent_window: "validator_alignment",
          workflow_contract_version: "v2",
        });
        remediationTaskId = String(remediationId);
      }
    }
    descriptionWithFollowUp = [
      descriptionWithFollowUp,
      "",
      `blocked_reason: ${blockedReason}`,
      `blocked_until: ${blockedUntil}`,
      `unblock_signal: ${unblockSignal}`,
      ...(remediationTaskId ? [`remediation_task_id: ${remediationTaskId}`] : []),
    ].join("\n");
  }

  if (validation.status === "pass" && novaUiHandoff) {
    finalStatus = "backlog";
    finalAssignee = "alex";
    finalValidationStatus = "pending";
    descriptionWithFollowUp = [
      descriptionWithFollowUp,
      "",
      "review_required_by:alex",
      "review_source_assignee:nova",
      "review_expectations:",
      "- review_decision: pass|fail",
      "- review_notes: concise findings",
      "- verify before/after evidence + quality checks",
    ].join("\n");
  }

  if (reviewTask && assignee === "alex" && validation.status === "pass") {
    if (reviewDecision === "pass") {
      finalStatus = "done";
      finalAssignee = "alex";
      finalValidationStatus = "pass";
      descriptionWithFollowUp = `${descriptionWithFollowUp}\nReview gate: PASS by alex.`;
    } else if (reviewDecision === "fail") {
      finalStatus = "backlog";
      finalAssignee = "nova";
      finalValidationStatus = "fail";
      descriptionWithFollowUp = `${descriptionWithFollowUp}\nReview gate: FAIL by alex. Reassigned to nova for revision.`;
    }
  }

  if (
    validation.status === "fail" &&
    finalStatus !== "blocked" &&
    !reviewTask &&
    !novaUiHandoff &&
    outputIndicatesIssueFound(outputStr, task.title, validation.reason)
  ) {
    const summary = (outputStr || task.description || "Issue found but not verified as deployed.")
      .replace(/\s+/g, " ")
      .slice(0, 400);
    const followUpTitle = `Verify + ship fix: ${task.title}`.slice(0, 120);
    const followUpDescription = [
      `Source task: ${String(task._id)}`,
      `Owner lane: ${assignee}`,
      `Failure reason: ${validation.reason ?? "unknown"}`,
      "",
      "Do not close until verifiable evidence exists:",
      "- concrete artifact_path",
      "- deployment/visibility check",
      "",
      "Issue summary:",
      summary,
    ].join("\n");
    let createdId: Id<"tasks">;
    try {
      createdId = await client.mutation(api.tasks.create, {
        title: followUpTitle,
        description: followUpDescription,
        assigned_to: assignee,
        status: "backlog",
        idempotency_key: `followup:${String(task._id)}:${validation.reason ?? "fail"}`,
        intent_window: "verify_ship",
        workflow_contract_version: "v2",
      });
    } catch {
      // Some deployed schemas may lag and reject newer assignees (e.g. "nova").
      // Fall back to alex so verification work is still tracked instead of dropped.
      createdId = await client.mutation(api.tasks.create, {
        title: followUpTitle,
        description: `${followUpDescription}\n\nFallback owner: alex (schema compatibility).`,
        assigned_to: "alex",
        status: "backlog",
        idempotency_key: `followup:${String(task._id)}:${validation.reason ?? "fail"}:alex`,
        intent_window: "verify_ship",
        workflow_contract_version: "v2",
      });
    }
    followUpTaskId = String(createdId);
    descriptionWithFollowUp = `${newDesc}\nFollow-up: ${followUpTaskId}`;
  }

  await client.mutation(api.tasks.updateTask, {
    id: task._id,
    description: descriptionWithFollowUp,
    assigned_to: finalAssignee,
    owner: undefined,
    lease_until: undefined,
    heartbeat_at: undefined,
    retry_count_run: validation.status === "pass" ? 0 : (task.retry_count_run ?? 0) + 1,
    retry_count_total: validation.status === "pass" ? (task.retry_count_total ?? 0) : (task.retry_count_total ?? 0) + 1,
    artifact_path: artifactPath || undefined,
    validation_status: finalValidationStatus,
    blocked_reason: finalStatus === "blocked" ? blockedReason : undefined,
    blocked_until: finalStatus === "blocked" ? blockedUntil : undefined,
    unblock_signal: finalStatus === "blocked" ? unblockSignal : undefined,
    last_validation_reason: validation.status === "fail" ? currentValidationReason : undefined,
    same_reason_fail_streak: validation.status === "fail" ? sameReasonFailStreak : 0,
    remediation_task_id: validation.status === "fail" ? remediationTaskId : undefined,
    changelog_path: artifactValidation.changelog?.path,
    changelog_feature: artifactValidation.changelog?.feature,
    changelog_status: artifactValidation.changelog?.status ?? "pending",
    changelog_last_checked_at: new Date().toISOString(),
  });
  await client.mutation(api.tasks.updateStatus, {
    id: task._id,
    status: finalStatus,
  });

  await appendExecutorRunLog({
    timestamp: new Date().toISOString(),
    plugin: "agent_executed",
    status: validation.status === "pass" ? "success" : "failed",
    durationMs: 0,
    worker: assignee,
    taskId: String(task._id),
    title: task.title,
  }).catch(() => undefined);

  const retryTotal = validation.status === "pass" ? 0 : 1;
  const nextBackoff = validation.status === "pass" ? 0 : RETRY_BACKOFF_MINUTES[0];

  return {
    ok: true,
    action: "complete" as const,
    taskId,
    title: task.title,
    resultStatus: finalStatus,
    validation,
    artifact_path: artifactPath,
    github_delivery: artifactValidation.github ?? null,
    changelog_delivery: artifactValidation.changelog ?? null,
    follow_up_task_id: followUpTaskId,
    remediation_task_id: remediationTaskId,
    same_reason_fail_streak: sameReasonFailStreak,
    retry_count_total: retryTotal,
    recommended_backoff_minutes: nextBackoff,
  };
}

async function runHeartbeat(client: ConvexHttpClient, taskId: unknown, requestedAssignee: unknown) {
  if (!taskId || typeof taskId !== "string") {
    return { ok: false, error: "taskId is required" };
  }
  const assignee = normalizeAssignee(requestedAssignee, "agent");
  const allTasks = await loadAllTasks(client);
  const task = allTasks.find((t) => String(t._id) === taskId);
  if (!task) return { ok: false, action: "heartbeat" as const, reason: "not_found" };
  if (task.status !== "in_progress") return { ok: false, action: "heartbeat" as const, reason: "not_in_progress" };
  if (task.assigned_to !== assignee && !(assignee === "sam" && task.assigned_to === "agent")) {
    return { ok: false, action: "heartbeat" as const, reason: "owner_mismatch" };
  }

  const prev = task.description?.trim() ?? "";
  const marker = `Heartbeat: ${new Date().toISOString()} by ${assignee}`;
  const cleaned = prev
    .split("\n")
    .filter((line) => !line.trim().startsWith("Heartbeat:"))
    .join("\n")
    .trim();
  const newDesc = `${cleaned}${cleaned ? "\n\n" : ""}${marker}`;
  const heartbeatNowMs = Date.now();
  const heartbeatLeaseUntil = new Date(heartbeatNowMs + LEASE_MINUTES_BY_ASSIGNEE[assignee] * 60 * 1000).toISOString();
  const heartbeatNowIso = new Date(heartbeatNowMs).toISOString();
  await client.mutation(api.tasks.updateTask, {
    id: task._id,
    description: newDesc,
    heartbeat_at: heartbeatNowIso,
    lease_until: heartbeatLeaseUntil,
  });

  return {
    ok: true,
    action: "heartbeat" as const,
    lease_until: heartbeatLeaseUntil,
  };
}

async function runNormalizeStates(client: ConvexHttpClient, dryRun: unknown) {
  const normalized = await client.mutation(api.tasks.normalizeBlockedState, {
    dryRun: dryRun === true || String(dryRun ?? "").toLowerCase() === "true",
  });
  return {
    ...normalized,
    action: "normalize_states" as const,
  };
}

async function runValidationCleanup(client: ConvexHttpClient, requestedMax: unknown, requestedMinAgeMinutes: unknown) {
  const max = asPositiveInt(requestedMax, 20, 50);
  const minAgeMinutes = asPositiveInt(requestedMinAgeMinutes, 180, 24 * 60);
  const nowMs = Date.now();
  const allTasks = await loadAllTasks(client);
  const candidates = allTasks
    .filter(
      (task) =>
        task.status === "blocked" &&
        String(task.blocked_reason ?? "") === "validation_contract_mismatch" &&
        backlogAgeMinutes(task, nowMs) >= minAgeMinutes
    )
    .slice(0, max);

  const marker = "prompt_contract_aligned:true";
  const requeued: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const task of candidates) {
    const desc = String(task.description ?? "").toLowerCase();
    if (!desc.includes(marker)) {
      skipped.push({ id: String(task._id), reason: "alignment_marker_missing" });
      continue;
    }
    await client.mutation(api.tasks.updateTask, {
      id: task._id,
      blocked_reason: undefined,
      blocked_until: undefined,
      unblock_signal: undefined,
      same_reason_fail_streak: 0,
      last_validation_reason: undefined,
      remediation_task_id: undefined,
    });
    await client.mutation(api.tasks.updateStatus, { id: task._id, status: "backlog" });
    requeued.push(String(task._id));
  }

  return {
    ok: true,
    action: "validation_cleanup" as const,
    scanned: candidates.length,
    requeued: requeued.length,
    requeued_task_ids: requeued,
    skipped,
    minAgeMinutes,
    requiredMarker: marker,
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

    if (action === "kicker") {
      const result = await runKicker(client);
      return NextResponse.json(result);
    }

    if (action === "worker") {
      const result = await runWorker(
        client,
        (body as Record<string, unknown>).assignee,
        (body as Record<string, unknown>).max,
        (body as Record<string, unknown>).allowLegacy
      );
      return NextResponse.json(result);
    }

    if (action === "claim") {
      const result = await runClaim(client, (body as Record<string, unknown>).assignee);
      return NextResponse.json(result);
    }

    if (action === "heartbeat") {
      const result = await runHeartbeat(
        client,
        (body as Record<string, unknown>).taskId,
        (body as Record<string, unknown>).assignee
      );
      return NextResponse.json(result);
    }

    if (action === "complete") {
      const result = await runComplete(
        client,
        (body as Record<string, unknown>).taskId,
        (body as Record<string, unknown>).output,
        (body as Record<string, unknown>).assignee,
        (body as Record<string, unknown>).artifact_path,
        (body as Record<string, unknown>).changelog_path,
        (body as Record<string, unknown>).changelog_feature,
        (body as Record<string, unknown>).changelog_exempt_reason
      );
      return NextResponse.json(result);
    }

    if (action === "status") {
      const result = await runStatus(client);
      return NextResponse.json(result);
    }

    if (action === "normalize_states") {
      const result = await runNormalizeStates(client, (body as Record<string, unknown>).dryRun);
      return NextResponse.json(result);
    }

    if (action === "validation_cleanup") {
      const result = await runValidationCleanup(
        client,
        (body as Record<string, unknown>).max,
        (body as Record<string, unknown>).minAgeMinutes
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
