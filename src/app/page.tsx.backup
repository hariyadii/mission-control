"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type AutonomyStatus = {
  ok: boolean;
  total: number;
  byStatus: Record<string, number>;
  byAssignee: Record<string, number>;
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
};

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "-";
  const d = new Date(parsed);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const PIPELINE_STEPS = [
  { key: "suggested", label: "Suggested", color: "text-fuchsia-300", bg: "from-fuchsia-500/20 to-violet-500/15", agent: "sam/lyra suggest" },
  { key: "backlog", label: "Backlog", color: "text-indigo-300", bg: "from-indigo-500/20 to-violet-500/15", agent: "alex guardrail" },
  { key: "in_progress", label: "In Progress", color: "text-cyan-300", bg: "from-cyan-500/20 to-sky-500/15", agent: "sam/lyra execute" },
  { key: "done", label: "Done", color: "text-emerald-300", bg: "from-emerald-500/20 to-teal-500/15", agent: "artifact written" },
];

export default function Home() {
  const tasks = useQuery(api.tasks.list);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [capital, setCapital] = useState<CapitalStatus | null>(null);

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
          if (cRes.ok) setCapital((await cRes.json()) as CapitalStatus);
        }
      } catch { /* ignore */ }
    };

    void load();
    const id = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const byStatus = autonomy?.byStatus ?? {};
  const inProgressTasks = (tasks ?? []).filter((t) => t.status === "in_progress");
  const recentDone = (tasks ?? [])
    .filter((t) => t.status === "done")
    .sort((a, b) => ((b as { _creationTime?: number })._creationTime ?? 0) - ((a as { _creationTime?: number })._creationTime ?? 0))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Mission Control</h1>
          <p className="page-subtitle">Autonomous AI org — compounding 24/7.</p>
        </div>
      </header>

      {/* Mission Statement */}
      <section className="panel-glass bg-gradient-to-br from-violet-500/15 via-indigo-500/10 to-cyan-500/15 p-5">
        <p className="m-0 text-xs uppercase tracking-[0.18em] text-slate-400">Mission</p>
        <p className="m-0 mt-2 text-sm leading-relaxed text-slate-200">
          Operate as an autonomous AI organization that reduces Fendy&apos;s manual work, ships value 24/7,
          and builds compounding systems that grow without him.
        </p>
      </section>

      {/* Pipeline Flow */}
      <section className="panel-glass p-5">
        <h2 className="m-0 text-base font-semibold text-slate-100">Pipeline</h2>
        <p className="m-0 mt-1 text-xs text-slate-400">suggest → guardrail → backlog → worker → done</p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PIPELINE_STEPS.map((step) => {
            const count = byStatus[step.key] ?? (tasks ? (tasks.filter((t) => t.status === step.key).length) : null);
            return (
              <div key={step.key} className={`panel-soft bg-gradient-to-br ${step.bg} p-4`}>
                <p className={`m-0 text-xs uppercase tracking-[0.12em] ${step.color}`}>{step.label}</p>
                <p className="m-0 mt-1 text-2xl font-semibold text-slate-100">{count ?? "…"}</p>
                <p className="m-0 mt-1 text-xs text-slate-500">{step.agent}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Two lanes: Sam + Lyra */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sam lane */}
        <section className="panel-glass p-5">
          <div className="flex items-center gap-2">
            <span className="badge badge-sam">Sam</span>
            <h2 className="m-0 text-base font-semibold text-slate-100">General Ops Lane</h2>
          </div>
          <p className="m-0 mt-1 text-xs text-slate-400">Builds tools, scripts, pipelines, automations</p>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Tasks assigned</span>
              <span>{autonomy?.byAssignee?.sam ?? "…"}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Executions</span>
              <span>{autonomy?.pluginMetrics?.totalExecutions ?? "…"}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Worker cadence</span>
              <span className="text-emerald-400">every 15m</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Suggest cadence</span>
              <span className="text-fuchsia-400">every 3h</span>
            </div>
          </div>
          <p className="m-0 mt-3 rounded-lg bg-slate-800/60 p-2 text-xs text-slate-400">
            Sam claims tasks from backlog and BUILDS real artifacts: code, scripts, research reports.
            Output written to <code className="text-slate-300">/workspace-sam/artifacts/</code>
          </p>
        </section>

        {/* Lyra lane */}
        <section className="panel-glass p-5">
          <div className="flex items-center gap-2">
            <span className="badge badge-lyra">Lyra</span>
            <h2 className="m-0 text-base font-semibold text-slate-100">Capital Lane</h2>
          </div>
          <p className="m-0 mt-1 text-xs text-slate-400">Builds trading infrastructure + executes disciplined paper trades</p>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Portfolio equity</span>
              <span className={capital?.portfolio?.totalPnl && capital.portfolio.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {capital?.portfolio ? `$${capital.portfolio.totalEquity.toLocaleString()}` : "…"}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>PnL</span>
              <span className={capital?.portfolio?.totalPnl && capital.portfolio.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {capital?.portfolio ? `${capital.portfolio.totalPnl >= 0 ? "+" : ""}$${capital.portfolio.totalPnl.toFixed(2)} (${capital.portfolio.totalPnlPct.toFixed(2)}%)` : "…"}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Open positions</span>
              <span>{capital?.portfolio?.positions?.length ?? "…"}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Mode</span>
              <span className="text-amber-400">{capital?.portfolio?.mode ?? "…"}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Worker cadence</span>
              <span className="text-emerald-400">every 30m</span>
            </div>
          </div>
          <p className="m-0 mt-3 rounded-lg bg-slate-800/60 p-2 text-xs text-slate-400">
            Lyra: research → analyze → decide → trade. Research output goes to{" "}
            <code className="text-slate-300">/workspace-lyra/research/</code>. Trades only on strong signals (conf ≥ 0.75).
          </p>
        </section>
      </div>

      {/* In Progress now */}
      {inProgressTasks.length > 0 && (
        <section className="panel-glass p-5">
          <h2 className="m-0 text-base font-semibold text-slate-100">
            🔄 In Progress <span className="ml-2 text-sm font-normal text-cyan-400">({inProgressTasks.length})</span>
          </h2>
          <div className="mt-3 space-y-2">
            {inProgressTasks.map((t) => (
              <div key={String(t._id)} className="panel-soft flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-slate-200">{t.title}</span>
                <span className={`badge ${t.assigned_to === "lyra" ? "badge-lyra" : "badge-sam"}`}>{t.assigned_to}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently done */}
      <section className="panel-glass p-5">
        <h2 className="m-0 text-base font-semibold text-slate-100">Recently Completed</h2>
        <div className="mt-3 space-y-2">
          {recentDone.length > 0 ? recentDone.map((t) => (
            <div key={String(t._id)} className="panel-soft flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate-300">{t.title}</span>
              <span className={`badge ${t.assigned_to === "lyra" ? "badge-lyra" : "badge-sam"}`}>{t.assigned_to}</span>
            </div>
          )) : (
            <p className="text-sm text-slate-400">No completed tasks yet.</p>
          )}
        </div>
      </section>

      {/* Plugin metrics */}
      <section className="panel-glass p-5">
        <h2 className="m-0 text-base font-semibold text-slate-100">Plugin Metrics</h2>
        <div className="mt-3 space-y-2">
          {(autonomy?.pluginMetrics?.byPlugin ?? []).slice(0, 6).map((item) => (
            <div key={item.plugin} className="panel-soft px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">{item.plugin}</span>
                <span className={`text-xs ${item.successRate >= 80 ? "text-emerald-400" : item.successRate >= 50 ? "text-amber-400" : "text-rose-400"}`}>
                  {item.successRate.toFixed(0)}% ok • last {formatTimestamp(item.lastRunAt)}
                </span>
              </div>
              <div className="mt-2 flex h-5 items-end gap-0.5">
                {item.sparkline.map((v, i) => {
                  const max = Math.max(...item.sparkline, 1);
                  const h = Math.max(2, Math.round((v / max) * 18));
                  return <div key={i} className="w-2 rounded-sm bg-cyan-400/60" style={{ height: h }} />;
                })}
              </div>
            </div>
          ))}
          {!(autonomy?.pluginMetrics?.byPlugin ?? []).length && (
            <p className="text-sm text-slate-400">No plugin executions yet.</p>
          )}
        </div>
      </section>

      {/* Nav grid */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/tasks", title: "Tasks", desc: "Pipeline kanban" },
          { href: "/capital", title: "Capital", desc: "Lyra portfolio & trades" },
          { href: "/control", title: "Control", desc: "Kill switch & policy" },
          { href: "/team", title: "Team", desc: "Agent status" },
          { href: "/office", title: "Office", desc: "Issue work orders" },
          { href: "/memory", title: "Memory", desc: "Logs & long-term memory" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="panel-soft p-4 transition hover:border-white/20 hover:bg-slate-800/65">
            <p className="m-0 text-sm font-semibold text-slate-100">{item.title}</p>
            <p className="m-0 mt-0.5 text-xs text-slate-400">{item.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
