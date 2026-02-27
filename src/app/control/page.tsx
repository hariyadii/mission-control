"use client";

import { useEffect, useMemo, useState } from "react";

// Visual consistency components (matching homepage)
function FreshnessIndicator({ lastUpdate }: { lastUpdate: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  const diff = now - lastUpdate;
  const isStale = diff > 60000;
  return (
    <span className={`text-[10px] ${isStale ? "text-amber-400" : "text-emerald-400"}`}>
      {isStale ? "⚠" : "●"} {diff > 3600000 ? `${Math.floor(diff/3600000)}h` : diff > 60000 ? `${Math.floor(diff/60000)}m` : "now"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    ok: { label: "OK", color: "text-emerald-300", bg: "bg-emerald-500/20" },
    warning: { label: "WARN", color: "text-amber-300", bg: "bg-amber-500/20" },
    critical: { label: "CRIT", color: "text-rose-300", bg: "bg-rose-500/20" },
    enabled: { label: "ON", color: "text-emerald-300", bg: "bg-emerald-500/20" },
    disabled: { label: "OFF", color: "text-slate-400", bg: "bg-slate-500/20" },
  };
  const c = config[status] || { label: status.slice(0, 6).toUpperCase(), color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

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
  state?: { lastStatus?: string; nextRunAtMs?: number };
};

type WorkflowHealth = {
  contractVersion: string;
  targetAlertsTo: string;
  doneLast24h: number;
  done_total: number;
  done_verified_pass: number;
  done_with_fail_validation: number;
  medianExecutionDurationMs: number;
  blockedRatio: number;
  severity?: "none" | "warning" | "critical";
  sustainedAlerts?: number;
  blockedByAssignee?: Record<string, number>;
  oldestBacklogAgeMinutes?: number;
  consecutiveCronErrorsByJob?: Record<string, number>;
  alerts: string[];
};

type ControlState = {
  policy: Policy;
  externalActionsToday: number;
  cronJobs: { jobs: CronJob[] };
  workflowHealth?: WorkflowHealth;
};

const LOOP_NAMES = [
  "sam-mission-suggester-3h",
  "alex-guardrail-20m",
  "alex-backlog-kicker-10m",
  "sam-worker-15m",
  "lyra-capital-suggester-3h",
  "lyra-capital-worker-30m",
  "evidence-sweeper-hourly",
];

export default function ControlPage() {
  const [data, setData] = useState<ControlState | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refresh = async () => {
    const [controlRes, autonomyRes] = await Promise.all([
      fetch("/api/control"),
      fetch("/api/autonomy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      }),
    ]);
    if (!controlRes.ok) return;
    const json = (await controlRes.json()) as { policy: Policy; externalActionsToday: number; cron: { jobs: CronJob[] } };
    const autonomy = autonomyRes.ok ? (await autonomyRes.json()) as { workflowHealth?: WorkflowHealth } : null;
    setData({
      policy: json.policy,
      externalActionsToday: json.externalActionsToday,
      cronJobs: json.cron,
      workflowHealth: autonomy?.workflowHealth,
    });
    setLastUpdate(Date.now());
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const health = data?.workflowHealth;
  const healthStatus = health?.severity || "none";

  const formatDuration = (ms: number) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Control</h1>
          <p className="text-xs text-slate-400">Kill switch & policy</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
          <StatusBadge status={healthStatus} />
        </div>
      </header>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Kill Switch</p>
          <p className={`text-lg font-semibold mt-1 ${data?.policy?.killSwitch ? "text-rose-400" : "text-emerald-400"}`}>
            {data?.policy?.killSwitch ? "ON" : "OFF"}
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">X Actions Today</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">
            {data?.externalActionsToday ?? "—"} / {data?.policy?.external?.maxActionsPerDay ?? "—"}
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Capital Mode</p>
          <p className="text-lg font-semibold text-slate-100 mt-1 uppercase">
            {data?.policy?.capitalLane?.mode ?? "—"}
          </p>
        </div>
        <div className="panel-glass p-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Health</p>
          <p className={`text-lg font-semibold mt-1 ${healthStatus === "none" ? "text-emerald-400" : healthStatus === "warning" ? "text-amber-400" : "text-rose-400"}`}>
            {healthStatus.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Workflow Health Details */}
      {health && (
        <section className="panel-glass p-3">
          <h2 className="text-xs font-semibold text-slate-300 mb-2">Workflow Health</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Done (24h)</p>
              <p className="text-slate-200">{health.doneLast24h}</p>
            </div>
            <div>
              <p className="text-slate-500">Total Done</p>
              <p className="text-slate-200">{health.done_total}</p>
            </div>
            <div>
              <p className="text-slate-500">Verified Pass</p>
              <p className="text-emerald-400">{health.done_verified_pass}</p>
            </div>
            <div>
              <p className="text-slate-500">Median Duration</p>
              <p className="text-slate-200">{formatDuration(health.medianExecutionDurationMs)}</p>
            </div>
          </div>
          {health.alerts && health.alerts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Alerts</p>
              {health.alerts.slice(0, 3).map((alert, i) => (
                <p key={i} className="text-xs text-amber-400">• {alert}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Cron Jobs */}
      <section className="panel-glass p-3">
        <h2 className="text-xs font-semibold text-slate-300 mb-2">Cron Jobs</h2>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {data?.cronJobs?.jobs?.map((job) => (
            <div key={job.id} className="flex items-center justify-between px-2 py-1.5 text-xs panel-soft">
              <span className="text-slate-300 truncate max-w-[180px]" title={job.id}>{job.id}</span>
              <StatusBadge status={job.enabled ? "enabled" : "disabled"} />
            </div>
          )) || (
            <p className="text-xs text-slate-500 text-center py-3">Loading...</p>
          )}
        </div>
      </section>

      {/* Policy Summary */}
      <section className="panel-glass p-3">
        <h2 className="text-xs font-semibold text-slate-300 mb-2">Policy</h2>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">High Risk Actions</span>
            <span className={data?.policy?.allowHighRiskExternalActions ? "text-rose-400" : "text-emerald-400"}>
              {data?.policy?.allowHighRiskExternalActions ? "Allowed" : "Blocked"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">X Mode</span>
            <span className="text-slate-300 uppercase">{data?.policy?.external?.xMode ?? "—"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
