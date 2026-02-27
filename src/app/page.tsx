"use client";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
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
  priority?: string;
};

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

function formatAge(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60_000);
  const h = Math.floor(m / 60);
  const days = Math.floor(h / 24);
  if (days > 0) return `${days}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "now";
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TaskRow({
  task,
  showOwner = true,
  showAge = true,
}: {
  task: Task;
  showOwner?: boolean;
  showAge?: boolean;
}) {
  const age = useMemo(() => formatAge(task._creationTime), [task._creationTime]);
  const isStale = Date.now() - task._creationTime > 3_600_000 && task.status !== "done";
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 text-xs border-b border-white/5 last:border-0 ${
        isStale ? "bg-amber-500/5" : ""
      }`}
    >
      {showAge && (
        <span className={`w-6 text-[10px] tabular-nums shrink-0 ${isStale ? "text-amber-400" : "text-slate-500"}`}>
          {age}
        </span>
      )}
      <span className="flex-1 truncate text-slate-200" title={task.title}>
        {task.title}
      </span>
      {showOwner && task.assigned_to && <AgentBadge agent={task.assigned_to} size="xs" />}
      <StatusBadge status={task.status} size="xs" />
    </div>
  );
}

function IncidentRow({
  incident,
}: {
  incident: { id: string; severity: string; message: string; timestamp: string; action?: string };
}) {
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 text-xs border-b border-white/5 last:border-0">
      <IncidentBadge severity={incident.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 truncate leading-snug" title={incident.message}>
          {incident.message}
        </p>
        {incident.action && (
          <p className="text-[9px] text-cyan-400 mt-0.5">→ {incident.action}</p>
        )}
      </div>
      <span className="text-[9px] text-slate-500 whitespace-nowrap shrink-0">{formatTs(incident.timestamp)}</span>
    </div>
  );
}

// Queue section with collapsible list
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
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">{label}</span>
        </div>
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${badgeColor}`}>
          {tasks.length}
        </span>
      </div>
      <div className={`space-y-0 overflow-y-auto`} style={{ maxHeight: maxH }}>
        {tasks.length > 0 ? (
          tasks.map((t) => <TaskRow key={t._id} task={t} showAge />)
        ) : (
          <p className="text-[10px] text-slate-600 text-center py-3">Empty</p>
        )}
      </div>
    </section>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Home() {
  const tasks = useQuery(api.tasks.list);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [capital, setCapital] = useState<CapitalStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Filters
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
          if (cRes.ok) setCapital((await cRes.json()) as CapitalStatus);
          setLastUpdate(Date.now());
        }
      } catch { /* silent */ }
    };
    void load();
    const id = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return (tasks as Task[]).filter((t) => {
      if (agentFilter !== "all" && t.assigned_to?.toLowerCase() !== agentFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tasks, agentFilter, statusFilter, searchQuery]);

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

  // Incidents
  const allIncidents = useMemo(() => {
    const inc: Array<{
      id: string;
      source: string;
      severity: string;
      message: string;
      timestamp: string;
      action?: string;
    }> = [];
    autonomy?.incidents?.forEach((i, idx) =>
      inc.push({ ...i, id: i.id ?? `a-${idx}`, source: "autonomy" })
    );
    capital?.incidents?.forEach((i, idx) =>
      inc.push({ ...i, id: i.id ?? `c-${idx}`, source: "capital" })
    );
    const order: Record<string, number> = { critical: 0, warning: 1, normal: 2 };
    return inc.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2)).slice(0, 6);
  }, [autonomy?.incidents, capital?.incidents]);

  const critCount = allIncidents.filter((i) => i.severity === "critical").length;
  const warnCount = allIncidents.filter((i) => i.severity === "warning").length;

  // Capital trend
  const capTrend = capital?.portfolio
    ? capital.portfolio.totalPnl >= 0
      ? "up"
      : "down"
    : undefined;

  return (
    <div className="space-y-4 page-enter">

      {/* ── Header ── */}
      <PageHeader
        title="Mission Control"
        subtitle="Autonomous AI operations dashboard"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              SYS <HealthDot ok={autonomy?.ok ?? false} />
            </div>
          </>
        }
      />

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 panel-glass">
        <FilterInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search tasks..."
          className="text-xs"
        />
        <FilterSelect value={agentFilter} onChange={setAgentFilter} className="py-1.5">
          <option value="all">All agents</option>
          <option value="sam">Sam</option>
          <option value="lyra">Lyra</option>
          <option value="alex">Alex</option>
          <option value="nova">Nova</option>
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={setStatusFilter} className="py-1.5">
          <option value="all">All status</option>
          <option value="suggested">Suggested</option>
          <option value="backlog">Backlog</option>
          <option value="in_progress">Running</option>
          <option value="done">Done</option>
        </FilterSelect>
        {(agentFilter !== "all" || statusFilter !== "all" || searchQuery) && (
          <button
            onClick={() => { setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
            className="btn-ghost text-[10px]"
          >
            ✕ Clear
          </button>
        )}
        <span className="ml-auto text-[10px] text-slate-500 tabular-nums">
          {filteredTasks.length} tasks
        </span>
      </div>

      {/* ── 3-Column Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* LEFT — Pipeline + Agents */}
        <div className="space-y-3">

          {/* Pipeline Counter */}
          <SectionCard title="Pipeline">
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: "suggested", label: "Sugg",   color: "text-fuchsia-300", bg: "bg-fuchsia-500/15 border border-fuchsia-500/25", n: pCounts.suggested },
                { key: "backlog",   label: "Queue",  color: "text-indigo-300",  bg: "bg-indigo-500/15 border border-indigo-500/25",   n: pCounts.backlog   },
                { key: "running",   label: "Run",    color: "text-cyan-300",    bg: "bg-cyan-500/15 border border-cyan-500/25",        n: pCounts.running   },
                { key: "done",      label: "Done",   color: "text-emerald-300", bg: "bg-emerald-500/15 border border-emerald-500/25",  n: pCounts.done      },
              ].map((s) => (
                <Link
                  key={s.key}
                  href={`/tasks?status=${s.key === "running" ? "in_progress" : s.key}`}
                  className={`text-center p-2 rounded-lg ${s.bg} hover:brightness-110 transition-all duration-150`}
                >
                  <p className={`text-[9px] uppercase tracking-widest font-semibold ${s.color}`}>{s.label}</p>
                  <p className="text-xl font-bold text-slate-100 tabular-nums leading-tight mt-0.5">{s.n}</p>
                </Link>
              ))}
            </div>
          </SectionCard>

          {/* Agent Panels */}
          <div className="grid grid-cols-2 gap-2">
            {/* Sam */}
            <section className="panel-glass p-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <AgentBadge agent="sam" size="xs" />
                <span className="text-[9px] text-slate-500">Ops</span>
                <HealthDot ok />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <MetricCard label="Tasks" value={autonomy?.byAssignee?.sam ?? "—"} />
                <MetricCard label="Runs"  value={autonomy?.pluginMetrics?.totalExecutions ?? "—"} />
              </div>
            </section>
            {/* Lyra */}
            <section className="panel-glass p-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <AgentBadge agent="lyra" size="xs" />
                <span className="text-[9px] text-slate-500">Capital</span>
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
                  value={
                    capital?.portfolio
                      ? `${capital.portfolio.totalPnlPct >= 0 ? "+" : ""}${capital.portfolio.totalPnlPct.toFixed(0)}%`
                      : "—"
                  }
                />
              </div>
            </section>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-1.5">
            <MetricCard label="Total"     value={autonomy?.total                             ?? "—"} />
            <MetricCard label="Plugins"   value={autonomy?.pluginMetrics?.byPlugin?.length   ?? "—"} />
            <MetricCard label="Positions" value={capital?.portfolio?.positions?.length        ?? "—"} />
          </div>
        </div>

        {/* CENTER — Live Queues */}
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

        {/* RIGHT — Incidents + Done + Plugins */}
        <div className="space-y-3">
          {/* Incidents */}
          <section className="panel-glass p-2.5">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Incidents</span>
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
            <div className="max-h-[110px] overflow-y-auto">
              {allIncidents.length > 0 ? (
                allIncidents.map((inc, i) => <IncidentRow key={i} incident={inc} />)
              ) : (
                <p className="text-[10px] text-slate-600 text-center py-4">No incidents</p>
              )}
            </div>
          </section>

          {/* Done */}
          <section className="panel-glass p-2.5">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Completed</span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-[9px] text-emerald-300 font-bold border border-emerald-500/30">
                {done.length}
              </span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {done.length > 0 ? (
                done.map((t) => <TaskRow key={t._id} task={t} showOwner showAge={false} />)
              ) : (
                <p className="text-[10px] text-slate-600 text-center py-4">Nothing yet</p>
              )}
            </div>
          </section>

          {/* Plugin Sparklines */}
          {autonomy?.pluginMetrics?.byPlugin && autonomy.pluginMetrics.byPlugin.length > 0 && (
            <section className="panel-glass p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Plugins</p>
              <div className="space-y-1.5">
                {autonomy.pluginMetrics.byPlugin.slice(0, 5).map((item) => {
                  const maxVal = Math.max(...item.sparkline.filter((x) => x > 0), 1);
                  return (
                    <div key={item.plugin} className="flex items-center gap-2">
                      <span
                        className="text-[9px] text-slate-400 truncate w-[80px] shrink-0"
                        title={item.plugin}
                      >
                        {item.plugin.split("/").pop()}
                      </span>
                      <div className="flex-1 flex items-end gap-px h-3">
                        {item.sparkline.slice(0, 14).map((v, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-sm ${v > 0 ? "bg-emerald-500/60" : "bg-slate-800"}`}
                            style={{ height: `${v > 0 ? Math.max(20, (v / maxVal) * 100) : 20}%` }}
                          />
                        ))}
                      </div>
                      <span className="text-[9px] text-slate-500 tabular-nums w-10 text-right shrink-0">
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
      <div className="panel-glass bg-gradient-to-r from-indigo-500/8 to-cyan-500/8 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Mission</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Autonomous AI ops — reduce manual work, ship value 24/7, build compounding systems.
          </p>
        </div>
        <Link href="/control" className="btn-ghost text-[10px] shrink-0">
          Control →
        </Link>
      </div>

    </div>
  );
}
