"use client";
import { useEffect, useState } from "react";
import {
  FreshnessIndicator,
  StatusBadge,
  PageHeader,
  SectionCard,
  MetricCard,
} from "@/components/ui";

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
  contractVersion:           string;
  targetAlertsTo:            string;
  doneLast24h:               number;
  done_total:                number;
  done_verified_pass:        number;
  done_with_fail_validation: number;
  medianExecutionDurationMs: number;
  blockedRatio:              number;
  severity?: "none" | "warning" | "critical";
  sustainedAlerts?:          number;
  blockedByAssignee?:        Record<string, number>;
  oldestBacklogAgeMinutes?:  number;
  consecutiveCronErrorsByJob?: Record<string, number>;
  alerts: string[];
};

type ControlState = {
  policy:             Policy;
  externalActionsToday: number;
  cronJobs:           { jobs: CronJob[] };
  workflowHealth?:    WorkflowHealth;
};

function fmtDuration(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function ControlPage() {
  const [data,       setData]       = useState<ControlState | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refresh = async () => {
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
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  const health   = data?.workflowHealth;
  const severity = health?.severity || "none";

  return (
    <div className="space-y-4 page-enter">
      <PageHeader
        title="Control"
        subtitle="Kill switch & policy"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <StatusBadge status={severity} size="xs" />
          </>
        }
      />

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
            {data?.externalActionsToday ?? "—"} / {data?.policy?.external?.maxActionsPerDay ?? "—"}
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
          <p className={`text-xl font-bold mt-1 ${severity === "none" ? "text-emerald-400" : severity === "warning" ? "text-amber-400" : "text-rose-400"}`}>
            {severity.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Workflow health */}
      {health && (
        <SectionCard title="Workflow Health">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <MetricCard label="Done (24h)"      value={health.doneLast24h}            />
            <MetricCard label="Total Done"      value={health.done_total}             />
            <MetricCard label="Verified Pass"   value={health.done_verified_pass}     accent="emerald" />
            <MetricCard label="Median Duration" value={fmtDuration(health.medianExecutionDurationMs)} />
          </div>
          {health.alerts.length > 0 && (
            <div className="pt-2 border-t border-white/8">
              <p className="section-label mb-1.5">Alerts</p>
              {health.alerts.slice(0, 4).map((a, i) => (
                <p key={i} className="text-xs text-amber-400 leading-snug">· {a}</p>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Cron Jobs */}
      <SectionCard title="Cron Jobs">
        <div className="space-y-1 max-h-[220px] overflow-y-auto">
          {data?.cronJobs?.jobs?.map((job) => (
            <div key={job.id} className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs panel-soft min-w-0">
              <span className="text-slate-300 truncate flex-1 min-w-0 font-mono text-[10px]" title={job.id}>{job.id}</span>
              <StatusBadge status={job.enabled ? "enabled" : "disabled"} size="xs" />
            </div>
          )) ?? (
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
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-400">X Mode</span>
            <span className="text-slate-300 uppercase font-mono">{data?.policy?.external?.xMode ?? "—"}</span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
