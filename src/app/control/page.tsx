"use client";
/**
 * Control — Kill Switch & Policy
 * Enterprise-polish additions:
 *  - Incident timeline panel with severity filter + next automated action
 *  - Run-lock observability (which jobs currently hold locks)
 *  - Operator signal: critical alerts surfaced first, noise de-emphasized
 *  - Cron job names shown (not raw IDs), with next-run time
 */
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  FreshnessIndicator,
  StatusBadge,
  AgentBadge,
  PageHeader,
  SectionCard,
  MetricCard,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

type Policy = {
  killSwitch: boolean;
  allowHighRiskExternalActions: boolean;
  external: { maxActionsPerDay: number; xMode: "browse" | "post" };
  capitalLane: { mode: "paper" | "live" };
};

type CronJob = {
  id:       string;
  name?:    string;
  enabled?: boolean;
  state?: {
    lastStatus?:        string;
    nextRunAtMs?:       number;
    consecutiveErrors?: number;
    runningAtMs?:       number;
    lastError?:         string;
  };
  payload?: { timeoutSeconds?: number };
};

type RunLock = {
  name:       string;
  elapsedMs:  number;
  budgetMs:   number;
  overBudget: boolean;
};

type WorkflowHealth = {
  contractVersion:              string;
  targetAlertsTo:               string;
  doneLast24h:                  number;
  done_total:                   number;
  done_verified_pass:           number;
  done_with_fail_validation:    number;
  medianExecutionDurationMs:    number;
  blockedRatio:                 number;
  severity?:                    "none" | "warning" | "critical";
  sustainedAlerts?:             number;
  criticalSustainedAlerts?:     number;
  blockedByAssignee?:           Record<string, number>;
  oldestBacklogAgeMinutes?:     number;
  consecutiveCronErrorsByJob?:  Record<string, number>;
  activeCronErrors?:            number;
  validationLoopTasks?:         number;
  stalledBacklogTasks?:         number;
  runLocks?:                    RunLock[];
  runLocksCount?:               number;
  alerts:                       string[];
  criticalAlerts?:              string[];
};

type ControlState = {
  policy:               Policy;
  externalActionsToday: number;
  cronJobs:             { jobs: CronJob[] };
  workflowHealth?:      WorkflowHealth;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtNextRun(ms?: number): string {
  if (!ms) return "—";
  const diff = ms - Date.now();
  if (diff < 0) return "overdue";
  const m = Math.ceil(diff / 60_000);
  if (m < 60) return `in ${m}m`;
  return `in ${Math.ceil(m / 60)}h`;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Derive next automated action from alert string
function deriveNextAction(alert: string, severity: string): string | undefined {
  const a = alert.toLowerCase();
  if (a.includes("backlog_idle"))      return "kicker → suggester wake";
  if (a.includes("blocked_ratio"))     return "operator review required";
  if (a.includes("done_per_day_low"))  return "kicker → worker wake";
  if (a.includes("throughput_gap"))    return "kicker → worker wake";
  if (a.includes("median_cycle_time")) return "investigate slow plugin";
  if (a.includes("rate_limit"))        return "auto-unblock in ~240m";
  if (a.includes("validation"))        return "alex remediation task";
  if (severity === "critical")         return "cron-self-heal retry";
  return undefined;
}

// ── Incident Timeline (workflow alerts) ────────────────────────────────────

type IncidentEntry = {
  id:         string;
  severity:   "critical" | "warning" | "normal";
  message:    string;
  nextAction: string | undefined;
};

type SevFilter = "all" | "critical" | "warning";

function IncidentTimeline({ health }: { health: WorkflowHealth | undefined }) {
  const [filter, setFilter] = useState<SevFilter>("all");

  const incidents = useMemo<IncidentEntry[]>(() => {
    if (!health) return [];
    const critSet = new Set(health.criticalAlerts ?? []);
    return (health.alerts ?? []).map((alert, i) => {
      const isCrit = critSet.has(alert);
      const sev: "critical" | "warning" = isCrit ? "critical" : "warning";
      return {
        id:         String(i),
        severity:   sev,
        message:    alert.replace(/_/g, " "),
        nextAction: deriveNextAction(alert, sev),
      };
    });
  }, [health]);

  const filtered = filter === "all" ? incidents : incidents.filter((i) => i.severity === filter);
  const critCount = incidents.filter((i) => i.severity === "critical").length;
  const warnCount = incidents.filter((i) => i.severity === "warning").length;

  if (incidents.length === 0) return null;

  return (
    <SectionCard title="Active Alerts">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {critCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-rose-300 bg-rose-500/20 border border-rose-500/30">
              {critCount} CRIT
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30">
              {warnCount} WARN
            </span>
          )}
        </div>
        {/* Severity filter */}
        <div className="flex items-center gap-0.5" role="group" aria-label="Filter alerts by severity">
          {(["all", "critical", "warning"] as SevFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize transition-colors ${
                filter === s
                  ? s === "critical"
                    ? "bg-rose-500/25 text-rose-300 border border-rose-500/30"
                    : s === "warning"
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/30"
                    : "bg-slate-700/60 text-slate-200 border border-white/15"
                  : "text-slate-600 hover:text-slate-400"
              }`}
            >
              {s === "all" ? "All" : s.slice(0, 4).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
        {filtered.map((inc) => (
          <div
            key={inc.id}
            className={`rounded-lg px-2.5 py-2 text-xs ${
              inc.severity === "critical"
                ? "bg-rose-500/8 border-l-2 border-rose-500/55"
                : "bg-amber-500/6 border-l-2 border-amber-500/45"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`font-medium leading-snug ${inc.severity === "critical" ? "text-rose-200" : "text-amber-200"}`}>
                {inc.message}
              </p>
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${
                inc.severity === "critical"
                  ? "text-rose-300 bg-rose-500/20 border border-rose-500/25"
                  : "text-amber-300 bg-amber-500/15 border border-amber-500/25"
              }`}>
                {inc.severity === "critical" ? "CRIT" : "WARN"}
              </span>
            </div>
            {inc.nextAction && (
              <p className="text-[9px] text-cyan-400 mt-1">⟳ Next: {inc.nextAction}</p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Run Lock Panel ─────────────────────────────────────────────────────────

function RunLockPanel({ health }: { health: WorkflowHealth | undefined }) {
  const locks = health?.runLocks ?? [];
  if (locks.length === 0) return null;

  return (
    <SectionCard
      title={`Run Locks (${locks.length})`}
    >
      <div className="space-y-1.5">
        {locks.map((lock, i) => {
          const pct = Math.min(100, Math.round((lock.elapsedMs / lock.budgetMs) * 100));
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${lock.overBudget ? "bg-amber-400" : "bg-cyan-400 animate-pulse"}`}
                  aria-hidden="true"
                />
                <span className="flex-1 font-mono text-[10px] text-slate-300 truncate" title={lock.name}>
                  {lock.name}
                </span>
                <span className={`text-[9px] tabular-nums shrink-0 ${lock.overBudget ? "text-amber-400 font-bold" : "text-cyan-300"}`}>
                  {fmtElapsed(lock.elapsedMs)} / {fmtElapsed(lock.budgetMs)}
                </span>
                {lock.overBudget && (
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/28 px-1 py-0.5 rounded shrink-0">
                    OVER
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div className="h-1 rounded-full overflow-hidden bg-slate-800/70">
                <div
                  className={`h-full rounded-full transition-all ${lock.overBudget ? "bg-amber-500/70" : "bg-cyan-500/60"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── Cron Job Row ────────────────────────────────────────────────────────────

function CronJobRow({ job }: { job: CronJob }) {
  const nowMs    = Date.now();
  const runningMs = job.state?.runningAtMs ?? 0;
  const isRunning = runningMs > 0 && nowMs - runningMs < ((job.payload?.timeoutSeconds ?? 180) + 90) * 1000;
  const hasError  = job.state?.lastStatus === "error";
  const errors    = job.state?.consecutiveErrors ?? 0;
  const isOverBudget = isRunning && (nowMs - runningMs > ((job.payload?.timeoutSeconds ?? 180) + 90) * 1000);

  const displayName = job.name ?? job.id.slice(0, 24);

  return (
    <div className={`flex items-center justify-between gap-2 px-2.5 py-2 text-xs panel-soft min-w-0 ${
      hasError && errors >= 3 ? "border-rose-500/30 bg-rose-500/5" : ""
    }`}>
      {/* Status dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          !job.enabled ? "bg-slate-700" :
          hasError && errors >= 3 ? "bg-rose-400 animate-pulse" :
          hasError ? "bg-amber-400" :
          isRunning ? "bg-cyan-400 animate-pulse" :
          "bg-emerald-400/70"
        }`}
        aria-hidden="true"
      />

      {/* Name */}
      <span
        className={`flex-1 truncate text-[10px] min-w-0 ${
          hasError && errors >= 3 ? "text-rose-300 font-semibold" : "text-slate-300"
        }`}
        title={job.name ?? job.id}
      >
        {displayName}
      </span>

      {/* Consecutive errors badge (only when actionable) */}
      {errors >= 2 && (
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${
          errors >= 3
            ? "text-rose-300 bg-rose-500/20 border border-rose-500/25"
            : "text-amber-300 bg-amber-500/15 border border-amber-500/25"
        }`}>
          ×{errors}
        </span>
      )}

      {/* Running badge */}
      {isRunning && (
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${
          isOverBudget
            ? "text-amber-300 bg-amber-500/15 border border-amber-500/25"
            : "text-cyan-300 bg-cyan-500/15 border border-cyan-500/25"
        }`}>
          {isOverBudget ? "SLOW" : "RUN"}
        </span>
      )}

      {/* Next run */}
      <span className="text-[9px] text-slate-600 tabular-nums shrink-0 min-w-[40px] text-right">
        {fmtNextRun(job.state?.nextRunAtMs)}
      </span>

      {/* Status badge */}
      <StatusBadge status={!job.enabled ? "disabled" : hasError ? "failed" : "enabled"} size="xs" />
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function ControlPage() {
  const [data,       setData]       = useState<ControlState | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const [ctrlRes, autoRes] = await Promise.all([
        fetch("/api/control"),
        fetch("/api/autonomy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "status" }),
        }),
      ]);
      if (!ctrlRes.ok) return;
      const json = (await ctrlRes.json()) as { policy: Policy; externalActionsToday: number; cron: { jobs: CronJob[] } };
      const auto = autoRes.ok ? (await autoRes.json()) as { workflowHealth?: WorkflowHealth } : null;
      setData({
        policy:               json.policy,
        externalActionsToday: json.externalActionsToday,
        cronJobs:             json.cron,
        workflowHealth:       auto?.workflowHealth,
      });
      setLastUpdate(Date.now());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const health   = data?.workflowHealth;
  const severity = health?.severity || "none";

  // Operator signal: separate actionable (crit) from noise (warn)
  const critAlerts = health?.criticalAlerts ?? [];
  const hasActionable = critAlerts.length > 0;

  return (
    <div className="flex flex-col gap-4 page-enter">
      <PageHeader
        title="Control"
        subtitle="Kill switch, policy & workflow health"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <StatusBadge status={severity} size="xs" />
          </>
        }
      />

      {/* Operator attention banner for actionable alerts */}
      {hasActionable && (
        <div
          className="rounded-xl border border-rose-500/35 bg-rose-500/8 px-4 py-3"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" aria-hidden="true" />
            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
              {critAlerts.length} critical alert{critAlerts.length > 1 ? "s" : ""} — operator attention required
            </span>
          </div>
          <div className="space-y-0.5 pl-3.5">
            {critAlerts.slice(0, 3).map((a, i) => (
              <p key={i} className="text-xs text-rose-200 leading-snug">· {a.replace(/_/g, " ")}</p>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="panel-glass p-3">
          <p className="section-label mb-1">Kill Switch</p>
          <p className={`text-xl font-bold mt-1 ${data?.policy?.killSwitch ? "text-rose-400" : "text-emerald-400"}`}>
            {data?.policy?.killSwitch ? "ON" : "OFF"}
          </p>
        </div>
        <div className="panel-glass p-3 min-w-0">
          <p className="section-label mb-1">X Actions Today</p>
          <p className="text-xl font-bold text-slate-100 mt-1 tabular-nums truncate">
            {data?.externalActionsToday ?? "—"}
            <span className="text-sm font-normal text-slate-500">
              {" "}/ {data?.policy?.external?.maxActionsPerDay ?? "—"}
            </span>
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="section-label mb-1">Capital Mode</p>
          <p className="text-xl font-bold text-slate-100 mt-1 uppercase">
            {data?.policy?.capitalLane?.mode ?? "—"}
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="section-label mb-1">Health</p>
          <p className={`text-xl font-bold mt-1 ${
            severity === "none"    ? "text-emerald-400" :
            severity === "warning" ? "text-amber-400"   :
            "text-rose-400"
          }`}>
            {severity.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Incident timeline for workflow alerts */}
      <IncidentTimeline health={health} />

      {/* Run locks */}
      <RunLockPanel health={health} />

      {/* Workflow health */}
      {health && (
        <SectionCard title="Workflow Health">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <MetricCard label="Done (24h)"      value={health.doneLast24h}            />
            <MetricCard label="Total Done"      value={health.done_total}             />
            <MetricCard label="Verified Pass"   value={health.done_verified_pass}     accent="emerald" />
            <MetricCard label="Median Duration" value={fmtDuration(health.medianExecutionDurationMs)} />
          </div>

          {/* Blocked by assignee */}
          {health.blockedByAssignee && Object.keys(health.blockedByAssignee).length > 0 && (
            <div className="pt-2 border-t border-white/8 mb-3">
              <p className="section-label mb-1.5">Blocked by Assignee</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(health.blockedByAssignee).map(([a, n]) => (
                  <div key={a} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/60 border border-white/8">
                    <AgentBadge agent={a} size="xs" />
                    <span className="text-[10px] font-bold text-amber-300 tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stalled / validation loops (de-emphasized when not critical) */}
          {((health.stalledBacklogTasks ?? 0) > 0 || (health.validationLoopTasks ?? 0) > 0) && (
            <div className="pt-2 border-t border-white/8 grid grid-cols-2 gap-2">
              {(health.stalledBacklogTasks ?? 0) > 0 && (
                <div className="text-xs">
                  <span className="text-slate-500">Stalled backlog: </span>
                  <span className="text-amber-300 font-semibold">{health.stalledBacklogTasks}</span>
                </div>
              )}
              {(health.validationLoopTasks ?? 0) > 0 && (
                <div className="text-xs">
                  <span className="text-slate-500">Validation loops: </span>
                  <span className="text-rose-300 font-semibold">{health.validationLoopTasks}</span>
                </div>
              )}
            </div>
          )}

          {/* Consecutive cron errors (only show when actionable: >=2) */}
          {health.consecutiveCronErrorsByJob && Object.keys(health.consecutiveCronErrorsByJob).length > 0 && (
            <div className="pt-2 border-t border-white/8">
              <p className="section-label mb-1.5">Cron Errors (Consecutive)</p>
              <div className="space-y-1">
                {Object.entries(health.consecutiveCronErrorsByJob).map(([job, n]) => (
                  <div key={job} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 truncate font-mono text-[10px]">{job}</span>
                    <span className={`font-bold tabular-nums ${n >= 3 ? "text-rose-400" : "text-amber-400"}`}>×{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Cron Jobs — improved with names + next-run + error counts */}
      <SectionCard title="Cron Jobs">
        <div className="space-y-1 max-h-[260px] overflow-y-auto">
          {data?.cronJobs?.jobs?.length ? (
            // Sort: errored first, then by name
            [...(data.cronJobs.jobs)]
              .sort((a, b) => {
                const errA = (a.state?.consecutiveErrors ?? 0);
                const errB = (b.state?.consecutiveErrors ?? 0);
                if (errA !== errB) return errB - errA;
                return (a.name ?? a.id).localeCompare(b.name ?? b.id);
              })
              .map((job) => <CronJobRow key={job.id} job={job} />)
          ) : (
            <p className="text-xs text-slate-600 text-center py-3">Loading…</p>
          )}
        </div>
      </SectionCard>

      {/* Policy */}
      <SectionCard title="Policy">
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-400">High risk external actions</span>
            <span className={data?.policy?.allowHighRiskExternalActions ? "text-rose-400 font-semibold" : "text-emerald-400 font-semibold"}>
              {data?.policy?.allowHighRiskExternalActions ? "Allowed" : "Blocked"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-400">X Mode</span>
            <span className="text-slate-300 uppercase font-mono">{data?.policy?.external?.xMode ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-400">Capital mode</span>
            <span className={`font-semibold uppercase ${data?.policy?.capitalLane?.mode === "live" ? "text-rose-400" : "text-slate-300"}`}>
              {data?.policy?.capitalLane?.mode ?? "—"}
            </span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
