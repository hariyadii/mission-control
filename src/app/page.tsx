"use client";
/**
 * Mission Control — Overview Dashboard
 * Enterprise-polish additions:
 *  1. Lane Health Strips — alex/sam/lyra/nova/ops with backlog/in_progress/blocked/last-activity
 *  2. Incident Timeline Panel — severity-filtered, latest action, next automated action
 *  3. Backlog Aging Visualization — age-bucket heatmap by assignee
 *  4. Operator Signal — true blockers highlighted, noise de-emphasized
 */
import Link from "next/link";
import { Suspense, useEffect, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  FreshnessIndicator,
  HealthDot,
  StatusBadge,
  AgentBadge,
  IncidentBadge,
  MetricCard,
  PageHeader,
  SectionCard,
  FilterInput,
  FilterSelect,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

type Task = {
  _id: string;
  _creationTime: number;
  title: string;
  status: string;
  assigned_to?: string;
  blocked_reason?: string;
  same_reason_fail_streak?: number;
  updated_at?: string;
  lease_until?: string;
  heartbeat_at?: string;
  created_at?: string;
};

type AutonomyStatus = {
  ok: boolean;
  total: number;
  byStatus: Record<string, number>;
  byAssignee: Record<string, number>;
  workflowHealth?: {
    alerts: string[];
    criticalAlerts?: string[];
    severity?: string;
    sustainedAlerts?: number;
    validationLoopTasks?: number;
    stalledBacklogTasks?: number;
    activeCronErrors?: number;
    opsExecutorHealthy?: boolean;
    runLocks?: Array<{ name: string; elapsedMs: number; budgetMs: number; overBudget: boolean }>;
    runLocksCount?: number;
    consecutiveCronErrorsByJob?: Record<string, number>;
    blockedByAssignee?: Record<string, number>;
    oldestBacklogAgeMinutes?: number;
    doneLast24h?: number;
    done_total?: number;
    done_verified_pass?: number;
    medianExecutionDurationMs?: number;
  };
  pluginMetrics?: {
    totalExecutions: number;
    byPlugin: Array<{
      plugin: string;
      runs: number;
      success: number;
      failed: number;
      successRate: number;
      avgDurationMs: number;
      lastRunAt: string | null;
      sparkline: number[];
    }>;
  };
  incidents?: Array<{
    id: string;
    severity: "critical" | "warning" | "normal";
    message: string;
    timestamp: string;
    action?: string;
  }>;
};

type CapitalStatus = {
  ok: boolean;
  portfolio?: {
    totalEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    drawdownPct: number;
    status: string;
    mode: string;
    positions?: Array<{ symbol: string; side: string; unrealizedPnl: number }>;
  };
  incidents?: Array<{
    id: string;
    severity: "critical" | "warning" | "normal";
    message: string;
    timestamp: string;
  }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function ageMs(ts: number | string | undefined): number {
  if (!ts) return 0;
  const parsed = typeof ts === "number" ? ts : Date.parse(ts);
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : 0;
}

function formatAge(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "now";
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// True blocker: has blocked_reason that is not policy noise, or fail_streak >= 3
function isTrueBlocker(task: Task): boolean {
  const NOISE_REASONS = new Set([
    "duplicate_incident_ticket",
    "validation_contract_mismatch", // handled separately via remediation
  ]);
  const reason = task.blocked_reason ?? "";
  if (task.status !== "blocked") return false;
  if (NOISE_REASONS.has(reason)) return false;
  return true;
}

// ── Lane Health Strip ──────────────────────────────────────────────────────

type LaneConfig = {
  id: string;
  label: string;
  aliases: string[];
  color: { text: string; bar: string; dot: string; border: string };
};

const LANES: LaneConfig[] = [
  { id: "alex",  label: "Alex",  aliases: ["alex"],              color: { text: "text-amber-300",  bar: "bg-amber-400",  dot: "bg-amber-400",  border: "border-amber-400/25"  } },
  { id: "sam",   label: "Sam",   aliases: ["sam", "agent"],      color: { text: "text-cyan-300",   bar: "bg-cyan-400",   dot: "bg-cyan-400",   border: "border-cyan-400/25"   } },
  { id: "lyra",  label: "Lyra",  aliases: ["lyra"],              color: { text: "text-violet-300", bar: "bg-violet-400", dot: "bg-violet-400", border: "border-violet-400/25" } },
  { id: "nova",  label: "Nova",  aliases: ["nova"],              color: { text: "text-rose-300",   bar: "bg-rose-400",   dot: "bg-rose-400",   border: "border-rose-400/25"   } },
  { id: "ops",   label: "Ops",   aliases: ["ops"],               color: { text: "text-stone-600",  bar: "bg-stone-400",  dot: "bg-stone-400",  border: "border-stone-400/25"  } },
];

type LaneStats = {
  backlog: number;
  inProgress: number;
  blocked: number;
  trueBlockers: number;
  lastActivityMs: number;   // ms since last update
  oldestBacklogMs: number;  // ms since oldest backlog task created
};

function computeLaneStats(tasks: Task[], aliases: string[]): LaneStats {
  const nowMs = Date.now();
  const norm = aliases.map((a) => a.toLowerCase());
  const mine = tasks.filter((t) => norm.includes((t.assigned_to ?? "").toLowerCase()));

  let backlog = 0, inProgress = 0, blocked = 0, trueBlockers = 0;
  let lastActivityMs = Infinity;
  let oldestBacklogMs = 0;

  for (const t of mine) {
    if (t.status === "backlog")     { backlog++; const a = ageMs(t.created_at ?? t._creationTime); if (a > oldestBacklogMs) oldestBacklogMs = a; }
    if (t.status === "in_progress") inProgress++;
    if (t.status === "blocked")     { blocked++; if (isTrueBlocker(t)) trueBlockers++; }
    const updatedMs = t.updated_at ? ageMs(t.updated_at) : ageMs(t._creationTime);
    if (updatedMs < lastActivityMs) lastActivityMs = updatedMs;
  }

  return {
    backlog, inProgress, blocked, trueBlockers,
    lastActivityMs: lastActivityMs === Infinity ? nowMs : lastActivityMs,
    oldestBacklogMs,
  };
}

function LaneHealthStrip({ lane, stats }: { lane: LaneConfig; stats: LaneStats }) {
  const { color } = lane;
  const isActive   = stats.inProgress > 0;
  const isWarning  = stats.trueBlockers > 0 || stats.oldestBacklogMs > 4 * 60 * 60_000;
  const isCritical = stats.trueBlockers > 1 || stats.oldestBacklogMs > 12 * 60 * 60_000;

  const borderClass = isCritical ? "border-rose-500/40" : isWarning ? "border-amber-500/35" : color.border;
  const totalWork = stats.backlog + stats.inProgress + stats.blocked;
  const inProgressPct = totalWork > 0 ? (stats.inProgress / totalWork) * 100 : 0;
  const backlogPct    = totalWork > 0 ? (stats.backlog    / totalWork) * 100 : 0;
  const blockedPct    = totalWork > 0 ? (stats.blocked    / totalWork) * 100 : 0;

  return (
    <div className={`panel-soft p-2.5 border ${borderClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot} ${isActive ? "animate-pulse" : "opacity-50"}`}
            aria-hidden="true"
          />
          <span className={`text-xs font-bold ${color.text}`}>{lane.label}</span>
          {isCritical && (
            <span className="text-[9px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1 py-0.5 rounded">
              CRIT
            </span>
          )}
          {!isCritical && isWarning && (
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1 py-0.5 rounded">
              WARN
            </span>
          )}
        </div>
        <span className="text-[9px] text-stone-500 tabular-nums">
          {formatAge(stats.lastActivityMs)} ago
        </span>
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
            stats.inProgress > 0
              ? "text-cyan-300 bg-cyan-500/15 border border-cyan-500/25"
              : "text-stone-500 bg-stone-100/50 border border-stone-200/50"
          }`}
          title="In progress"
        >
          {stats.inProgress} run
        </span>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums text-indigo-300 bg-indigo-500/15 border border-indigo-500/25"
          title="Backlog"
        >
          {stats.backlog} queue
        </span>
        {stats.blocked > 0 && (
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
              stats.trueBlockers > 0
                ? "text-rose-300 bg-rose-500/20 border border-rose-500/30"
                : "text-amber-300 bg-amber-500/15 border border-amber-500/25"
            }`}
            title={`${stats.trueBlockers} true blocker(s)`}
          >
            {stats.blocked} blk
          </span>
        )}
        {stats.oldestBacklogMs > 60 * 60_000 && (
          <span
            className="text-[9px] text-stone-500 tabular-nums ml-auto"
            title="Age of oldest backlog task"
          >
            oldest {formatAge(stats.oldestBacklogMs)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalWork > 0 && (
        <div
          className="h-1 rounded-full overflow-hidden bg-stone-100/80 flex"
          role="img"
          aria-label={`${lane.label}: ${stats.inProgress} running, ${stats.backlog} queued, ${stats.blocked} blocked`}
        >
          <div className="bg-cyan-500/70    h-full transition-all" style={{ width: `${inProgressPct}%` }} />
          <div className="bg-indigo-500/60  h-full transition-all" style={{ width: `${backlogPct}%` }} />
          <div className={`h-full transition-all ${stats.trueBlockers > 0 ? "bg-rose-500/70" : "bg-amber-500/50"}`}
               style={{ width: `${blockedPct}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Incident Timeline ──────────────────────────────────────────────────────

type Incident = {
  id: string;
  source: string;
  severity: string;
  message: string;
  timestamp: string;
  action?: string;
  nextAction?: string;
};

type SeverityFilter = "all" | "critical" | "warning" | "normal";

function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  const [filter, setFilter] = useState<SeverityFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return incidents;
    return incidents.filter((i) => i.severity === filter);
  }, [incidents, filter]);

  const critCount = incidents.filter((i) => i.severity === "critical").length;
  const warnCount = incidents.filter((i) => i.severity === "warning").length;

  return (
    <section className="panel-glass p-2.5" aria-label="Incident timeline">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
            Incidents
          </span>
          <div className="flex items-center gap-1">
            {critCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-500/25 text-[9px] text-rose-300 font-bold border border-rose-500/30">
                {critCount}C
              </span>
            )}
            {warnCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/25 text-[9px] text-amber-300 font-bold border border-amber-500/30">
                {warnCount}W
              </span>
            )}
            {critCount === 0 && warnCount === 0 && (
              <span className="text-[9px] text-emerald-400 font-medium">All clear</span>
            )}
          </div>
        </div>

        {/* Severity filter tabs */}
        <div className="flex items-center gap-0.5" role="group" aria-label="Filter by severity">
          {(["all", "critical", "warning", "normal"] as SeverityFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors capitalize ${
                filter === s
                  ? s === "critical"
                    ? "bg-rose-500/25 text-rose-300 border border-rose-500/30"
                    : s === "warning"
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/30"
                    : "bg-stone-200/60 text-stone-700 border border-stone-300/50"
                  : "text-stone-500 hover:text-stone-500"
              }`}
              aria-pressed={filter === s}
            >
              {s === "all" ? "All" : s.slice(0, 4).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline entries */}
      <div className="max-h-[160px] overflow-y-auto space-y-0">
        {filtered.length > 0 ? (
          filtered.map((inc) => (
            <div
              key={`${inc.source}-${inc.id}`}
              className={`flex items-start gap-2 px-2 py-1.5 text-xs rounded-md transition-colors ${
                inc.severity === "critical"
                  ? "bg-rose-500/6 border-l-2 border-rose-500/50"
                  : inc.severity === "warning"
                  ? "bg-amber-500/5 border-l-2 border-amber-500/40"
                  : ""
              }`}
            >
              <IncidentBadge severity={inc.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-stone-700 truncate leading-snug font-medium" title={inc.message}>
                  {inc.message}
                </p>
                {inc.action && (
                  <p className="text-[9px] text-cyan-400 mt-0.5 leading-snug">
                    ↳ Latest: {inc.action}
                  </p>
                )}
                {inc.nextAction && (
                  <p className="text-[9px] text-indigo-400 mt-0.5 leading-snug">
                    ⟳ Next: {inc.nextAction}
                  </p>
                )}
              </div>
              <span className="text-[9px] text-stone-500 whitespace-nowrap shrink-0">
                {formatTs(inc.timestamp)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[10px] text-stone-500 text-center py-4">
            {filter === "all" ? "No incidents" : `No ${filter} incidents`}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Backlog Aging Visualization ────────────────────────────────────────────

type AgeBucket = { label: string; maxMs: number; color: string; textColor: string };
const AGE_BUCKETS: AgeBucket[] = [
  { label: "<1h",   maxMs:     60 * 60_000, color: "bg-emerald-500/65", textColor: "text-emerald-300" },
  { label: "1–4h",  maxMs:  4 * 60 * 60_000, color: "bg-sky-500/65",     textColor: "text-sky-300"     },
  { label: "4–12h", maxMs: 12 * 60 * 60_000, color: "bg-amber-500/65",   textColor: "text-amber-300"   },
  { label: "12–24h",maxMs: 24 * 60 * 60_000, color: "bg-orange-500/65",  textColor: "text-orange-300"  },
  { label: ">24h",  maxMs: Infinity,          color: "bg-rose-500/65",    textColor: "text-rose-300"    },
];

function bucketIndex(ms: number): number {
  for (let i = 0; i < AGE_BUCKETS.length; i++) {
    if (ms < AGE_BUCKETS[i].maxMs) return i;
  }
  return AGE_BUCKETS.length - 1;
}

function BacklogAgingPanel({ tasks }: { tasks: Task[] }) {
  const backlogTasks = useMemo(
    () => tasks.filter((t) => t.status === "backlog"),
    [tasks]
  );

  // Per-assignee bucket counts
  const byLane = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const lane of LANES) {
      const mine = backlogTasks.filter((t) =>
        lane.aliases.includes((t.assigned_to ?? "").toLowerCase())
      );
      const buckets = new Array<number>(AGE_BUCKETS.length).fill(0);
      for (const t of mine) {
        const ms = ageMs(t.created_at ?? t._creationTime);
        buckets[bucketIndex(ms)]++;
      }
      result[lane.id] = buckets;
    }
    return result;
  }, [backlogTasks]);

  const totalByBucket = useMemo(() => {
    const totals = new Array<number>(AGE_BUCKETS.length).fill(0);
    for (const buckets of Object.values(byLane)) {
      buckets.forEach((n, i) => { totals[i] += n; });
    }
    return totals;
  }, [byLane]);

  const maxTotal = Math.max(...totalByBucket, 1);

  if (backlogTasks.length === 0) {
    return (
      <section className="panel-glass p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1.5">Backlog Aging</p>
        <p className="text-[10px] text-stone-500 text-center py-3">No backlog tasks</p>
      </section>
    );
  }

  return (
    <section className="panel-glass p-2.5" aria-label="Backlog aging heatmap">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
          Backlog Aging
        </span>
        <span className="text-[9px] text-stone-500 tabular-nums">
          {backlogTasks.length} tasks
        </span>
      </div>

      {/* Age bucket legend */}
      <div className="flex items-center gap-1.5 mb-2.5 px-0.5">
        {AGE_BUCKETS.map((b, i) => (
          <div key={b.label} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-sm shrink-0 ${b.color}`} aria-hidden="true" />
            <span className={`text-[8px] font-medium ${b.textColor}`}>{b.label}</span>
            <span className="text-[8px] text-stone-500 tabular-nums">({totalByBucket[i]})</span>
          </div>
        ))}
      </div>

      {/* Per-lane heatmap rows */}
      <div className="space-y-1.5">
        {LANES.map((lane) => {
          const buckets = byLane[lane.id] ?? [];
          const total = buckets.reduce((s, n) => s + n, 0);
          if (total === 0) return null;
          return (
            <div key={lane.id} className="flex items-center gap-2">
              <span className={`text-[9px] font-bold w-8 shrink-0 ${lane.color.text}`}>{lane.label}</span>
              {/* Stacked bar */}
              <div
                className="flex-1 h-4 rounded overflow-hidden flex bg-stone-50/60"
                role="img"
                aria-label={`${lane.label}: ${total} backlog tasks`}
              >
                {AGE_BUCKETS.map((b, i) => {
                  const pct = maxTotal > 0 ? (buckets[i] / maxTotal) * 100 : 0;
                  return pct > 0 ? (
                    <div
                      key={b.label}
                      className={`h-full transition-all ${b.color} flex items-center justify-center`}
                      style={{ width: `${pct}%`, minWidth: buckets[i] > 0 ? 4 : 0 }}
                      title={`${b.label}: ${buckets[i]} task${buckets[i] !== 1 ? "s" : ""}`}
                    >
                      {buckets[i] > 0 && pct > 8 && (
                        <span className="text-[8px] font-bold text-white/90">{buckets[i]}</span>
                      )}
                    </div>
                  ) : null;
                })}
              </div>
              <span className="text-[9px] text-stone-500 tabular-nums w-5 text-right shrink-0">{total}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── TaskRow (with operator-signal improvements) ────────────────────────────

function TaskRow({
  task,
  showOwner = true,
  showAge = true,
}: {
  task: Task;
  showOwner?: boolean;
  showAge?: boolean;
}) {
  const creationMs = task._creationTime;
  const age = useMemo(() => formatAge(ageMs(creationMs)), [creationMs]);
  const isStale     = ageMs(creationMs) > 3_600_000 && task.status !== "done";
  const isTrueBlk   = isTrueBlocker(task);
  const isHighStreak = (task.same_reason_fail_streak ?? 0) >= 3;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 text-xs border-b border-stone-200/50 last:border-0 ${
        isTrueBlk
          ? "bg-rose-500/6"
          : isHighStreak
          ? "bg-amber-500/6"
          : isStale
          ? "bg-amber-500/4"
          : ""
      }`}
    >
      {showAge && (
        <span
          className={`w-6 text-[10px] tabular-nums shrink-0 ${
            isTrueBlk ? "text-rose-400" : isStale ? "text-amber-400" : "text-stone-500"
          }`}
        >
          {age}
        </span>
      )}
      <span
        className={`flex-1 truncate ${isTrueBlk ? "text-rose-200" : "text-stone-700"}`}
        title={task.title}
      >
        {task.title}
      </span>
      {isTrueBlk && task.blocked_reason && (
        <span
          className="text-[9px] text-rose-400/80 truncate max-w-[80px] shrink-0 hidden sm:block"
          title={task.blocked_reason}
        >
          {task.blocked_reason.replace(/_/g, " ")}
        </span>
      )}
      {showOwner && task.assigned_to && <AgentBadge agent={task.assigned_to} size="xs" />}
      <StatusBadge status={isTrueBlk ? "blocked" : task.status} size="xs" />
    </div>
  );
}

// ── Queue Section ──────────────────────────────────────────────────────────

function QueueSection({
  label,
  dotColor,
  badgeColor,
  tasks,
  maxH = "120px",
}: {
  label: string;
  dotColor: string;
  badgeColor: string;
  tasks: Task[];
  maxH?: string;
}) {
  return (
    <section className="panel-glass p-2.5">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-600">{label}</span>
        </div>
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${badgeColor}`}>
          {tasks.length}
        </span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: maxH }}>
        {tasks.length > 0 ? (
          tasks.map((t) => <TaskRow key={t._id} task={t} showAge />)
        ) : (
          <p className="text-[10px] text-stone-500 text-center py-3">Empty</p>
        )}
      </div>
    </section>
  );
}

// ── True Blocker Banner ────────────────────────────────────────────────────

function TrueBlockerBanner({ tasks }: { tasks: Task[] }) {
  const trueBlockers = useMemo(
    () => tasks.filter((t) => isTrueBlocker(t)).slice(0, 5),
    [tasks]
  );

  if (trueBlockers.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-rose-500/35 bg-rose-500/8 px-3 py-2.5"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" aria-hidden="true" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-rose-300">
          True Blockers ({trueBlockers.length})
        </span>
        <span className="text-[9px] text-stone-500 ml-auto">Requires operator attention</span>
      </div>
      <div className="space-y-0.5">
        {trueBlockers.map((t) => (
          <div key={t._id} className="flex items-center gap-2 text-xs">
            <AgentBadge agent={t.assigned_to ?? "agent"} size="xs" />
            <span className="flex-1 truncate text-rose-200" title={t.title}>{t.title}</span>
            {t.blocked_reason && (
              <span className="text-[9px] text-rose-400/70 shrink-0 truncate max-w-[120px]">
                {t.blocked_reason.replace(/_/g, " ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

// ── Overview Skeletons ────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4 page-enter animate-pulse">
      <PageHeader
        title="Mission Control"
        subtitle="Autonomous AI operations dashboard"
        right={<div className="bg-stone-100/50 rounded h-4 w-32" />}
      />
      <LaneHealthSkeleton />
      <FilterPipelineSkeleton />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-3"><div className="h-32 bg-stone-100/30 rounded-lg" /><div className="h-48 bg-stone-100/30 rounded-lg" /></div>
        <div className="space-y-3"><div className="h-32 bg-stone-100/30 rounded-lg" /><div className="h-24 bg-stone-100/30 rounded-lg" /></div>
        <div className="space-y-3"><div className="h-40 bg-stone-100/30 rounded-lg" /><div className="h-40 bg-stone-100/30 rounded-lg" /></div>
      </div>
    </div>
  );
}

function LaneHealthSkeleton() {
  const LANE_COLORS = ["bg-amber-400", "bg-cyan-400", "bg-violet-400", "bg-rose-400", "bg-stone-400"];
  return (
    <section aria-label="Lane health overview">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Lane Health</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {LANE_COLORS.map((color, i) => (
          <div key={i} className="panel-soft p-2.5 border border-stone-200/50">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-1.5 h-1.5 rounded-full ${color} opacity-50`} />
              <div className="h-3 w-8 bg-stone-200/50 rounded" />
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="h-4 w-10 bg-stone-200/50 rounded" />
              <div className="h-4 w-10 bg-stone-200/50 rounded" />
            </div>
            <div className="h-1 rounded-full bg-stone-100/80 overflow-hidden">
              <div className="h-full bg-stone-200/50 rounded-full" style={{ width: "60%" }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilterPipelineSkeleton() {
  return (
    <>
      {/* Filter Bar Skeleton */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 panel-glass">
        <div className="h-7 w-32 bg-stone-100/50 rounded-lg" />
        <div className="h-7 w-24 bg-stone-100/50 rounded-lg" />
        <div className="h-7 w-24 bg-stone-100/50 rounded-lg" />
        <div className="ml-auto h-4 w-16 bg-stone-100/50 rounded" />
      </div>

      {/* Pipeline Counts Skeleton */}
      <SectionCard title="Pipeline">
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: "Sugg", color: "bg-fuchsia-500/15" },
            { label: "Queue", color: "bg-indigo-500/15" },
            { label: "Run", color: "bg-cyan-500/15" },
            { label: "Done", color: "bg-emerald-500/15" },
          ].map((s) => (
            <div key={s.label} className={`text-center p-2 rounded-lg ${s.color} border border-stone-200/50`}>
              <p className="text-[9px] uppercase tracking-widest font-semibold text-stone-500">{s.label}</p>
              <p className="text-xl font-bold text-stone-500 tabular-nums leading-tight mt-0.5">—</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

// ── New Suspense-wrapped Sections for Streaming ───────────────────────────

export default function Home() {
  return (
    <div className="flex flex-col gap-4 page-enter">
      <PageHeader
        title="Mission Control"
        subtitle="Autonomous AI operations dashboard"
        right={
          <div className="flex items-center gap-3">
            <FreshnessIndicator lastUpdate={Date.now()} />
            <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
              SYS <HealthDot ok={true} />
            </div>
          </div>
        }
      />

      {/* Lane Health - separate Suspense for streaming */}
      <Suspense fallback={<LaneHealthSkeleton />}>
        <LaneHealthSection />
      </Suspense>

      {/* Filter Pipeline - separate Suspense for streaming */}
      <Suspense fallback={<FilterPipelineSkeleton />}>
        <FilterPipelineSection />
      </Suspense>

      {/* Main 3-column content */}
      <Suspense fallback={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-3"><div className="h-32 bg-stone-100/30 rounded-lg" /><div className="h-48 bg-stone-100/30 rounded-lg" /></div>
          <div className="space-y-3"><div className="h-32 bg-stone-100/30 rounded-lg" /><div className="h-24 bg-stone-100/30 rounded-lg" /></div>
          <div className="space-y-3"><div className="h-40 bg-stone-100/30 rounded-lg" /><div className="h-40 bg-stone-100/30 rounded-lg" /></div>
        </div>
      }>
        <MainContent />
      </Suspense>
    </div>
  );
}

// ── Lane Health Section ───────────────────────────────────────────────────
function LaneHealthSection() {
  const tasks = useQuery(api.tasks.list);
  const allTasks = useMemo(() => (tasks as Task[] | undefined) ?? [], [tasks]);

  return (
    <section aria-label="Lane health overview">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
        Lane Health
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {LANES.map((lane) => (
          <LaneHealthStrip
            key={lane.id}
            lane={lane}
            stats={computeLaneStats(allTasks, lane.aliases)}
          />
        ))}
      </div>
    </section>
  );
}

// ── Filter Pipeline Section ───────────────────────────────────────────────
function FilterPipelineSection() {
  const tasks = useQuery(api.tasks.list);
  const allTasks = useMemo(() => (tasks as Task[] | undefined) ?? [], [tasks]);

  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (agentFilter !== "all" && t.assigned_to?.toLowerCase() !== agentFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [allTasks, agentFilter, statusFilter, searchQuery]);

  const pCounts = {
    suggested: filteredTasks.filter((t) => t.status === "suggested").length,
    backlog: filteredTasks.filter((t) => t.status === "backlog").length,
    running: filteredTasks.filter((t) => t.status === "in_progress").length,
    done: filteredTasks.filter((t) => t.status === "done").length,
  };

  return (
    <>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 panel-glass">
        <FilterInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search tasks..."
          className="text-xs"
        />
        <FilterSelect value={agentFilter} onChange={setAgentFilter} ariaLabel="Filter by agent" className="py-1.5">
          <option value="all">All agents</option>
          <option value="sam">Sam</option>
          <option value="lyra">Lyra</option>
          <option value="alex">Alex</option>
          <option value="nova">Nova</option>
          <option value="ops">Ops</option>
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" className="py-1.5">
          <option value="all">All status</option>
          <option value="suggested">Suggested</option>
          <option value="backlog">Backlog</option>
          <option value="in_progress">Running</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
        </FilterSelect>
        {(agentFilter !== "all" || statusFilter !== "all" || searchQuery) && (
          <button
            onClick={() => { setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
            className="btn-ghost text-[10px]"
            aria-label="Clear filters"
          >
            ✕ Clear
          </button>
        )}
        <span className="ml-auto text-[10px] text-stone-500 tabular-nums">
          {filteredTasks.length} tasks
        </span>
      </div>

      {/* Pipeline Counts */}
      <SectionCard title="Pipeline">
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: "suggested", label: "Sugg", color: "text-fuchsia-300", bg: "bg-fuchsia-500/15 border border-fuchsia-500/25", n: pCounts.suggested },
            { key: "backlog", label: "Queue", color: "text-indigo-300", bg: "bg-indigo-500/15 border border-indigo-500/25", n: pCounts.backlog },
            { key: "running", label: "Run", color: "text-cyan-300", bg: "bg-cyan-500/15 border border-cyan-500/25", n: pCounts.running },
            { key: "done", label: "Done", color: "text-emerald-300", bg: "bg-emerald-500/15 border border-emerald-500/25", n: pCounts.done },
          ].map((s) => (
            <Link
              key={s.key}
              href={"/tasks?status=" + (s.key === "running" ? "in_progress" : s.key)}
              className={"text-center p-2 rounded-lg " + s.bg + " hover:brightness-110 transition-all duration-150"}
              aria-label={s.label + ": " + s.n + " tasks"}
            >
              <p className={"text-[9px] uppercase tracking-widest font-semibold " + s.color}>{s.label}</p>
              <p className="text-xl font-bold text-stone-800 tabular-nums leading-tight mt-0.5">{s.n}</p>
            </Link>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

// ── Main Content Section (renamed from HomeContent) ───────────────────────
function MainContent() {
  const tasks = useQuery(api.tasks.list);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [capital, setCapital] = useState<CapitalStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [aRes, cRes] = await Promise.all([
          fetch("/api/autonomy", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "status" }),
          }),
          fetch("/api/capital", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "status" }),
          }),
        ]);
        if (!cancelled) {
          if (aRes.ok) setAutonomy((await aRes.json()) as AutonomyStatus);
          if (cRes.ok) setCapital ((await cRes.json()) as CapitalStatus);
          setLastUpdate(Date.now());
        }
      } catch { /* silent */ }
    };
    void load();
    const id = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const allTasks = useMemo(() => (tasks as Task[] | undefined) ?? [], [tasks]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (agentFilter  !== "all" && t.assigned_to?.toLowerCase() !== agentFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter)                    return false;
      if (searchQuery  && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [allTasks, agentFilter, statusFilter, searchQuery]);

  const running   = filteredTasks.filter((t) => t.status === "in_progress");
  const backlog   = filteredTasks.filter((t) => t.status === "backlog");
  const suggested = filteredTasks.filter((t) => t.status === "suggested");
  const done      = filteredTasks
    .filter((t) => t.status === "done")
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, 10);

  const pCounts = {
    suggested: filteredTasks.filter((t) => t.status === "suggested").length,
    backlog:   filteredTasks.filter((t) => t.status === "backlog").length,
    running:   filteredTasks.filter((t) => t.status === "in_progress").length,
    done:      filteredTasks.filter((t) => t.status === "done").length,
  };

  // All incidents (de-duped + enriched with nextAction from workflowHealth)
  const allIncidents = useMemo<Incident[]>(() => {
    const inc: Incident[] = [];
    autonomy?.incidents?.forEach((i, idx) => {
      inc.push({
        ...i,
        id: i.id ?? `a-${idx}`,
        source: "autonomy",
        nextAction: deriveNextAction(i.severity, i.message, autonomy?.workflowHealth?.alerts ?? []),
      });
    });
    capital?.incidents?.forEach((i, idx) => {
      inc.push({ ...i, id: i.id ?? `c-${idx}`, source: "capital" });
    });
    // Synthesize incidents from workflow alerts
    (autonomy?.workflowHealth?.alerts ?? []).forEach((alert, idx) => {
      const isCrit = (autonomy?.workflowHealth?.criticalAlerts ?? []).includes(alert);
      inc.push({
        id: `wf-${idx}`,
        source: "workflow",
        severity: isCrit ? "critical" : "warning",
        message: alert.replace(/_/g, " "),
        timestamp: new Date().toISOString(),
        action: undefined,
        nextAction: deriveNextAction(isCrit ? "critical" : "warning", alert, []),
      });
    });
    const order: Record<string, number> = { critical: 0, warning: 1, normal: 2 };
    return inc
      .sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2))
      .slice(0, 12);
  }, [autonomy?.incidents, capital?.incidents, autonomy?.workflowHealth?.alerts, autonomy?.workflowHealth?.criticalAlerts]);

  const capTrend = capital?.portfolio
    ? capital.portfolio.totalPnl >= 0 ? "up" : "down"
    : undefined;

  return (
    <div className="flex flex-col gap-4 page-enter">

      {/* ── Header ── */}
      <PageHeader
        title="Mission Control"
        subtitle="Autonomous AI operations dashboard"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
              SYS <HealthDot ok={autonomy?.ok ?? false} />
            </div>
          </>
        }
      />

      {/* ── True Blocker Alert Banner ── */}
      <TrueBlockerBanner tasks={allTasks} />

      {/* ── 3-Column Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* LEFT */}
        <div className="space-y-3">
          <SectionCard title="Pipeline">
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: "suggested", label: "Sugg",  color: "text-fuchsia-300", bg: "bg-fuchsia-500/15 border border-fuchsia-500/25", n: pCounts.suggested },
                { key: "backlog",   label: "Queue", color: "text-indigo-300",  bg: "bg-indigo-500/15 border border-indigo-500/25",   n: pCounts.backlog   },
                { key: "running",   label: "Run",   color: "text-cyan-300",    bg: "bg-cyan-500/15 border border-cyan-500/25",        n: pCounts.running   },
                { key: "done",      label: "Done",  color: "text-emerald-300", bg: "bg-emerald-500/15 border border-emerald-500/25",  n: pCounts.done      },
              ].map((s) => (
                <Link
                  key={s.key}
                  href={`/tasks?status=${s.key === "running" ? "in_progress" : s.key}`}
                  className={`text-center p-2 rounded-lg ${s.bg} hover:brightness-110 transition-all duration-150`}
                  aria-label={`${s.label}: ${s.n} tasks`}
                >
                  <p className={`text-[9px] uppercase tracking-widest font-semibold ${s.color}`}>{s.label}</p>
                  <p className="text-xl font-bold text-stone-800 tabular-nums leading-tight mt-0.5">{s.n}</p>
                </Link>
              ))}
            </div>
          </SectionCard>

          {/* Agent mini-panels */}
          <div className="grid grid-cols-2 gap-2">
            <section className="panel-glass p-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <AgentBadge agent="sam" size="xs" />
                <span className="text-[9px] text-stone-500">Ops</span>
                <HealthDot ok />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <MetricCard label="Tasks" value={autonomy?.byAssignee?.sam ?? "—"} />
                <MetricCard label="Runs"  value={autonomy?.pluginMetrics?.totalExecutions ?? "—"} />
              </div>
            </section>
            <section className="panel-glass p-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <AgentBadge agent="lyra" size="xs" />
                <span className="text-[9px] text-stone-500">Capital</span>
                <HealthDot ok={capital?.portfolio?.status === "ok"} />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <MetricCard
                  label="Equity"
                  value={capital?.portfolio ? `$${(capital.portfolio.totalEquity / 1000).toFixed(0)}k` : "—"}
                  trend={capTrend}
                  accent={capital?.portfolio?.totalPnl && capital.portfolio.totalPnl >= 0 ? "emerald" : "rose"}
                />
                <MetricCard
                  label="PnL"
                  value={capital?.portfolio
                    ? `${capital.portfolio.totalPnlPct >= 0 ? "+" : ""}${capital.portfolio.totalPnlPct.toFixed(0)}%`
                    : "—"}
                />
              </div>
            </section>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <MetricCard label="Total"     value={autonomy?.total ?? "—"} />
            <MetricCard label="Plugins"   value={autonomy?.pluginMetrics?.byPlugin?.length ?? "—"} />
            <MetricCard label="Positions" value={capital?.portfolio?.positions?.length ?? "—"} />
          </div>

          {/* Backlog aging */}
          <BacklogAgingPanel tasks={filteredTasks} />
        </div>

        {/* CENTER */}
        <div className="space-y-3">
          <QueueSection
            label="Running"
            dotColor="bg-cyan-400 animate-pulse"
            badgeColor="text-cyan-300 bg-cyan-500/20"
            tasks={running}
            maxH="140px"
          />
          <QueueSection
            label="Backlog"
            dotColor="bg-indigo-400"
            badgeColor="text-indigo-300 bg-indigo-500/20"
            tasks={backlog}
            maxH="110px"
          />
          <QueueSection
            label="Suggested"
            dotColor="bg-fuchsia-400"
            badgeColor="text-fuchsia-300 bg-fuchsia-500/20"
            tasks={suggested.slice(0, 5)}
            maxH="90px"
          />
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          {/* Incident Timeline */}
          <IncidentTimeline incidents={allIncidents} />

          {/* Done */}
          <section className="panel-glass p-2.5">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Completed</span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-[9px] text-emerald-300 font-bold border border-emerald-500/30">
                {done.length}
              </span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {done.length > 0 ? (
                done.map((t) => <TaskRow key={t._id} task={t} showOwner showAge={false} />)
              ) : (
                <p className="text-[10px] text-stone-500 text-center py-4">Nothing yet</p>
              )}
            </div>
          </section>

          {/* Plugin sparklines */}
          {autonomy?.pluginMetrics?.byPlugin && autonomy.pluginMetrics.byPlugin.length > 0 && (
            <section className="panel-glass p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Plugins</p>
              <div className="space-y-1.5">
                {autonomy.pluginMetrics.byPlugin.slice(0, 5).map((item) => {
                  const maxVal = Math.max(...item.sparkline.filter((x) => x > 0), 1);
                  return (
                    <div key={item.plugin} className="flex items-center gap-2">
                      <span className="text-[9px] text-stone-500 truncate w-[80px] shrink-0" title={item.plugin}>
                        {item.plugin.split("/").pop()}
                      </span>
                      <div className="flex-1 flex items-end gap-px h-3">
                        {item.sparkline.slice(0, 14).map((v, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-sm ${v > 0 ? "bg-emerald-500/60" : "bg-stone-100"}`}
                            style={{ height: `${v > 0 ? Math.max(20, (v / maxVal) * 100) : 20}%` }}
                          />
                        ))}
                      </div>
                      <span className="text-[9px] text-stone-500 tabular-nums w-10 text-right shrink-0">
                        {item.success}/{item.runs}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Mission Footer ── */}
      <div className="panel-glass bg-gradient-to-r from-indigo-500/8 to-cyan-500/8 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Mission</p>
          <p className="text-xs text-stone-500 mt-0.5">
            Autonomous AI ops — reduce manual work, ship value 24/7, build compounding systems.
          </p>
        </div>
        <Link href="/control" className="btn-ghost text-[10px] shrink-0">Control →</Link>
      </div>
    </div>
  );
}

// ── deriveNextAction helper ────────────────────────────────────────────────

function deriveNextAction(severity: string, message: string, alerts: string[]): string | undefined {
  const msg = message.toLowerCase();
  if (msg.includes("backlog_idle") || msg.includes("backlog idle")) return "kicker will wake suggester";
  if (msg.includes("blocked_ratio")) return "review blocked tasks; unblock or remediate";
  if (msg.includes("done_per_day_low") || msg.includes("throughput_gap")) return "kicker will trigger worker wake";
  if (msg.includes("median_cycle_time")) return "investigate slow plugin execution";
  if (msg.includes("cron") && severity === "critical") return "cron-self-heal will retry";
  if (msg.includes("rate_limit")) return "auto-unblock after quota TTL (240m)";
  if (msg.includes("validation_contract")) return "alex will remediate prompt alignment";
  if (alerts.some((a) => a.toLowerCase().includes("backlog_idle"))) return "suggester wake scheduled";
  return undefined;
}
