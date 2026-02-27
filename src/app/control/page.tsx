"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CommandBar,
  FreshnessIndicator,
  StatusBadge,
  PageHeader,
  SectionCard,
  MetricTile,
  Divider,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

type Policy = {
  killSwitch: boolean;
  allowHighRiskExternalActions: boolean;
  external: { maxActionsPerDay: number; xMode: "browse" | "post" };
  capitalLane: { mode: "paper" | "live" };
};

type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  state?: {
    lastStatus?: string;
    nextRunAtMs?: number;
    consecutiveErrors?: number;
    runningAtMs?: number;
  };
  payload?: { timeoutSeconds?: number };
};

type WorkflowHealth = {
  contractVersion:            string;
  doneLast24h:                number;
  done_total:                 number;
  done_verified_pass:         number;
  done_with_fail_validation:  number;
  medianExecutionDurationMs:  number;
  blockedRatio:               number;
  severity?:                  "none" | "warning" | "critical";
  sustainedAlerts?:           number;
  blockedByAssignee?:         Record<string, number>;
  oldestBacklogAgeMinutes?:   number;
  consecutiveCronErrorsByJob?: Record<string, number>;
  activeCronErrors?:          number;
  runLocksCount?:             number;
  runLocks?:                  Array<{ name: string; elapsedMs: number; budgetMs: number; overBudget: boolean }>;
  alerts:                     string[];
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

// ── Policy Row ─────────────────────────────────────────────────────────────

function PolicyRow({ label, value, highlight }: { label: string; value: string; highlight?: "ok" | "warn" | "crit" }) {
  const hColor = highlight === "crit" ? "text-rose-400" : highlight === "warn" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className={`text-xs font-semibold ${highlight ? hColor : ""}`} style={{ color: highlight ? undefined : "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// ── CronJobRow ─────────────────────────────────────────────────────────────

function CronJobRow({ job }: { job: CronJob }) {
  const isRunning = (job.state?.runningAtMs ?? 0) > 0;
  const hasError  = job.state?.lastStatus === "error";
  const errors    = job.state?.consecutiveErrors ?? 0;

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs transition-colors rounded-lg"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"}
      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = ""}
    >
      {/* Name */}
      <div className="min-w-0 flex-1">
        <span
          className="truncate block font-medium"
          style={{ color: "var(--text-primary)", fontSize: "0.7rem" }}
          title={job.name ?? job.id}
        >
          {job.name ?? job.id}
        </span>
        {errors > 0 && (
          <span className="text-[9px] text-rose-400">{errors} consecutive error{errors > 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Run-lock badge */}
      {isRunning && (
        <span className="text-[9px] font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/28 px-1.5 py-0.5 rounded-md shrink-0">
          RUNNING
        </span>
      )}

      {/* Next run */}
      <span className="text-[9px] shrink-0" style={{ color: "var(--text-muted)", minWidth: 40, textAlign: "right" }}>
        {fmtNextRun(job.state?.nextRunAtMs)}
      </span>

      {/* Status */}
      <StatusBadge status={!job.enabled ? "disabled" : hasError ? "error" : isRunning ? "running" : "enabled"} size="xs" />
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
      const json = (await ctrlRes.json()) as {
        policy: Policy;
        externalActionsToday: number;
        cron: { jobs: CronJob[] };
      };
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

  const severityColor =
    severity === "none"     ? "text-emerald-400" :
    severity === "warning"  ? "text-amber-400"   :
    "text-rose-400";

  const killColor = data?.policy?.killSwitch ? "text-rose-400" : "text-emerald-400";

  return (
    <div className="space-y-5 page-enter">

      {/* ── Command Bar ── */}
      <CommandBar
        title="Control"
        subtitle="Kill switch & policy"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <StatusBadge status={severity} size="xs" />
          </>
        }
      />

      {/* ── Page Header ── */}
      <PageHeader
        title="Control"
        subtitle="System policy, workflow health, and cron management"
        right={
          <div className="flex items-center gap-2">
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <StatusBadge status={severity} size="sm" />
          </div>
        }
      />

      {/* ── Top KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="metric-tile">
          <span className="metric-tile__label">Kill Switch</span>
          <span className={`metric-tile__value ${killColor}`}>
            {data?.policy?.killSwitch ? "ON" : "OFF"}
          </span>
        </div>
        <div className="metric-tile min-w-0">
          <span className="metric-tile__label">X Actions Today</span>
          <span className="metric-tile__value truncate">
            {data?.externalActionsToday ?? "—"}
            <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>
              {" "}/ {data?.policy?.external?.maxActionsPerDay ?? "—"}
            </span>
          </span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile__label">Capital Mode</span>
          <span className="metric-tile__value uppercase">
            {data?.policy?.capitalLane?.mode ?? "—"}
          </span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile__label">Health</span>
          <span className={`metric-tile__value ${severityColor}`}>
            {severity.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ── Workflow Health ── */}
      {health && (
        <SectionCard title="Workflow Health" badge={<StatusBadge status={severity} size="xs" />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <MetricTile
              label="Done (24h)"
              value={health.doneLast24h}
              variant={health.doneLast24h > 0 ? "ok" : "warn"}
            />
            <MetricTile
              label="Total Done"
              value={health.done_total}
            />
            <MetricTile
              label="Verified Pass"
              value={health.done_verified_pass}
              variant="ok"
            />
            <MetricTile
              label="Median Duration"
              value={fmtDuration(health.medianExecutionDurationMs)}
            />
          </div>

          {/* Run locks */}
          {(health.runLocksCount ?? 0) > 0 && (
            <>
              <Divider subtle />
              <div className="mt-2">
                <p className="section-label mb-2">Active Run Locks ({health.runLocksCount})</p>
                <div className="space-y-1">
                  {(health.runLocks ?? []).map((lock, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${lock.overBudget ? "bg-amber-400" : "bg-cyan-400 animate-pulse"}`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate font-mono text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        {lock.name}
                      </span>
                      <span
                        className={`text-[9px] tabular-nums ${lock.overBudget ? "text-amber-400" : "text-cyan-400"}`}
                      >
                        {Math.round(lock.elapsedMs / 1000)}s / {Math.round(lock.budgetMs / 1000)}s
                      </span>
                      {lock.overBudget && (
                        <span className="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/28 px-1 py-0.5 rounded">
                          OVER
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Alerts */}
          {health.alerts.length > 0 && (
            <>
              <Divider subtle />
              <div className="mt-2">
                <p className="section-label mb-2">Active Alerts</p>
                <div className="space-y-1">
                  {health.alerts.slice(0, 6).map((a, i) => (
                    <p key={i} className="text-xs text-amber-400 leading-snug">
                      <span aria-hidden="true">· </span>{a}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Blocked by assignee */}
          {health.blockedByAssignee && Object.keys(health.blockedByAssignee).length > 0 && (
            <>
              <Divider subtle />
              <div className="mt-2">
                <p className="section-label mb-2">Blocked by Assignee</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(health.blockedByAssignee).map(([agent, n]) => (
                    <div
                      key={agent}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                      style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
                    >
                      <span className="font-mono uppercase text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        {agent}
                      </span>
                      <span className="font-bold text-amber-300">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── Cron Jobs ── */}
      <SectionCard
        title="Cron Jobs"
        badge={
          data?.cronJobs?.jobs?.length !== undefined ? (
            <span
              className="text-[10px] font-medium tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {data.cronJobs.jobs.length} jobs
            </span>
          ) : undefined
        }
      >
        <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
          {data?.cronJobs?.jobs?.length ? (
            data.cronJobs.jobs.map((job) => <CronJobRow key={job.id} job={job} />)
          ) : (
            <div className="py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              {data ? "No cron jobs found" : "Loading…"}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Policy ── */}
      <SectionCard title="Policy">
        <PolicyRow
          label="Kill Switch"
          value={data?.policy?.killSwitch ? "ENABLED" : "DISABLED"}
          highlight={data?.policy?.killSwitch ? "crit" : "ok"}
        />
        <PolicyRow
          label="High-risk external actions"
          value={data?.policy?.allowHighRiskExternalActions ? "Allowed" : "Blocked"}
          highlight={data?.policy?.allowHighRiskExternalActions ? "warn" : "ok"}
        />
        <PolicyRow
          label="Capital mode"
          value={(data?.policy?.capitalLane?.mode ?? "—").toUpperCase()}
          highlight={data?.policy?.capitalLane?.mode === "live" ? "crit" : undefined}
        />
        <PolicyRow
          label="X Mode"
          value={(data?.policy?.external?.xMode ?? "—").toUpperCase()}
        />
        <PolicyRow
          label="Max external actions / day"
          value={String(data?.policy?.external?.maxActionsPerDay ?? "—")}
        />
      </SectionCard>
    </div>
  );
}
