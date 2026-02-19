"use client";

import { useEffect, useMemo, useState } from "react";

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

type ControlState = {
  policy: Policy;
  externalActionsToday: number;
  cronJobs: { jobs: CronJob[] };
};

const LOOP_NAMES = ["sam-mission-suggester-6h", "alex-guardrail-20m", "sam-worker-15m"];

export default function ControlPage() {
  const [data, setData] = useState<ControlState | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/control");
    if (!res.ok) return;
    const json = (await res.json()) as { policy: Policy; externalActionsToday: number; cron: { jobs: CronJob[] } };
    setData({ policy: json.policy, externalActionsToday: json.externalActionsToday, cronJobs: json.cron });
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const loopJobs = useMemo(() => {
    const jobs = data?.cronJobs?.jobs ?? [];
    return LOOP_NAMES.map((name) => jobs.find((j) => j.name === name)).filter(Boolean) as CronJob[];
  }, [data]);

  const post = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch("/api/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const policy = data?.policy;

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Autonomy Control Center</h1>
          <p className="page-subtitle">Pause/resume loops, run jobs, and manage risk policy.</p>
        </div>
      </header>

      <section className="panel-glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-xs uppercase tracking-[0.18em] text-slate-400">Global Kill Switch</p>
            <p className="m-0 mt-1 text-sm text-slate-300">{policy?.killSwitch ? "ON (loops disabled)" : "OFF (loops enabled)"}</p>
          </div>
          <button
            onClick={() => void post({ action: "killSwitch", enabled: !policy?.killSwitch })}
            className={policy?.killSwitch ? "btn-danger" : "btn-primary"}
            disabled={saving}
          >
            {policy?.killSwitch ? "Disable Kill Switch" : "Enable Kill Switch"}
          </button>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {loopJobs.map((job) => (
          <article key={job.id} className="panel-glass p-4">
            <p className="m-0 text-sm font-semibold text-slate-100">{job.name}</p>
            <p className="m-0 mt-1 text-xs text-slate-400">
              Status: {job.enabled ? "Active" : "Paused"} {job.state?.lastStatus ? `• last ${job.state.lastStatus}` : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn-secondary px-3 py-1.5" onClick={() => void post({ action: "runJob", jobId: job.id })}>
                Run Now
              </button>
              {job.enabled ? (
                <button className="btn-danger px-3 py-1.5" onClick={() => void post({ action: "disableJob", jobId: job.id })}>
                  Pause
                </button>
              ) : (
                <button className="btn-primary px-3 py-1.5" onClick={() => void post({ action: "enableJob", jobId: job.id })}>
                  Resume
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="panel-glass p-6">
        <h2 className="m-0 text-lg font-semibold text-slate-100">Risk & Capital Policy</h2>
        <p className="m-0 mt-1 text-sm text-slate-400">External actions today: {data?.externalActionsToday ?? "..."}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="panel-soft flex items-center justify-between p-3 text-sm text-slate-200">
            <span>Allow high-risk external actions</span>
            <input
              type="checkbox"
              checked={policy?.allowHighRiskExternalActions ?? false}
              onChange={(e) =>
                void post({ action: "setPolicy", patch: { allowHighRiskExternalActions: e.target.checked } })
              }
            />
          </label>

          <label className="panel-soft flex items-center justify-between p-3 text-sm text-slate-200">
            <span>Max external actions/day</span>
            <input
              type="number"
              className="input-glass w-24"
              value={policy?.external.maxActionsPerDay ?? 100}
              onChange={(e) =>
                void post({ action: "setPolicy", patch: { external: { maxActionsPerDay: Number(e.target.value), xMode: policy?.external.xMode ?? "browse" } } })
              }
            />
          </label>

          <label className="panel-soft flex items-center justify-between p-3 text-sm text-slate-200">
            <span>X mode</span>
            <select
              className="input-glass w-28"
              value={policy?.external.xMode ?? "browse"}
              onChange={(e) =>
                void post({ action: "setPolicy", patch: { external: { maxActionsPerDay: policy?.external.maxActionsPerDay ?? 100, xMode: e.target.value } } })
              }
            >
              <option value="browse">browse</option>
              <option value="post">post</option>
            </select>
          </label>

          <label className="panel-soft flex items-center justify-between p-3 text-sm text-slate-200">
            <span>Capital lane mode</span>
            <select
              className="input-glass w-28"
              value={policy?.capitalLane.mode ?? "paper"}
              onChange={(e) => void post({ action: "setPolicy", patch: { capitalLane: { mode: e.target.value } } })}
            >
              <option value="paper">paper</option>
              <option value="live">live</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
