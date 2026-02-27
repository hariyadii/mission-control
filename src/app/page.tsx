"use client";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

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

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins}m`;
  return "now";
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

// ===== COMPONENTS =====

// Status Badge - GitactionBoard style
function StatusBadge({ status, size = "sm" }: { status: string; size?: "xs" | "sm" | "md" }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    suggested: { label: "SUGG", color: "text-fuchsia-300", bg: "bg-fuchsia-500/20" },
    backlog: { label: "BACKLOG", color: "text-indigo-300", bg: "bg-indigo-500/20" },
    in_progress: { label: "RUN", color: "text-cyan-300", bg: "bg-cyan-500/20" },
    done: { label: "DONE", color: "text-emerald-300", bg: "bg-emerald-500/20" },
    failed: { label: "FAIL", color: "text-rose-300", bg: "bg-rose-500/20" },
  };
  const c = config[status] || { label: status.slice(0, 6).toUpperCase(), color: "text-slate-300", bg: "bg-slate-500/20" };
  const sizeClasses = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  return <span className={`inline-flex items-center rounded font-semibold tracking-wider ${c.color} ${c.bg} ${sizeClasses}`}>{c.label}</span>;
}

// Incident Badge
function IncidentBadge({ severity }: { severity: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    critical: { label: "CRIT", color: "text-rose-300", bg: "bg-rose-500/30" },
    warning: { label: "WARN", color: "text-amber-300", bg: "bg-amber-500/30" },
    normal: { label: "OK", color: "text-emerald-300", bg: "bg-emerald-500/30" },
  };
  const c = config[severity] || { label: "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${c.color} ${c.bg}`}>{c.label}</span>;
}

// Agent Badge
function AgentBadge({ agent }: { agent: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    sam: { label: "SAM", color: "text-cyan-300", bg: "bg-cyan-500/20" },
    lyra: { label: "LYRA", color: "text-violet-300", bg: "bg-violet-500/20" },
    alex: { label: "ALEX", color: "text-amber-300", bg: "bg-amber-500/20" },
  };
  const c = config[agent?.toLowerCase()] || { label: agent?.slice(0, 4).toUpperCase() || "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

// Health Indicator
function HealthDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]"}`} />;
}

// Freshness Timestamp
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
      {isStale ? "⚠" : "●"} {formatRelativeTime(lastUpdate)}
    </span>
  );
}

// Compact Metric Card
function MetricCard({ label, value, trend }: { label: string; value: string | number; trend?: "up" | "down" | "stable" }) {
  const trendColors = { up: "text-emerald-400", down: "text-rose-400", stable: "text-slate-400" };
  return (
    <div className="panel-soft p-2">
      <p className="m-0 text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="m-0 mt-0.5 text-sm font-semibold text-slate-100">{value}</p>
      {trend && <p className={`m-0 text-[9px] ${trendColors[trend]}`}>{trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}</p>}
    </div>
  );
}

// Filter Bar Component
function FilterBar({ 
  agentFilter, setAgentFilter, 
  statusFilter, setStatusFilter,
  searchQuery, setSearchQuery 
}: {
  agentFilter: string;
  setAgentFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 panel-glass">
      <input
        type="text"
        placeholder="Search tasks..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="flex-1 min-w-[120px] bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
      />
      <select
        value={agentFilter}
        onChange={(e) => setAgentFilter(e.target.value)}
        className="bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
      >
        <option value="all">All Agents</option>
        <option value="sam">Sam</option>
        <option value="lyra">Lyra</option>
        <option value="alex">Alex</option>
      </select>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
      >
        <option value="all">All Status</option>
        <option value="suggested">Suggested</option>
        <option value="backlog">Backlog</option>
        <option value="in_progress">Running</option>
        <option value="done">Done</option>
      </select>
      <button
        onClick={() => { setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
        className="px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition"
      >
        Clear
      </button>
    </div>
  );
}

// Task Row - Compact with all info
function TaskRow({ task, showOwner = true, showAge = true, showHint = false }: { 
  task: Task; 
  showOwner?: boolean;
  showAge?: boolean;
  showHint?: boolean;
}) {
  const age = useMemo(() => formatAge(task._creationTime), [task._creationTime]);
  const isStale = Date.now() - task._creationTime > 3600000; // > 1 hour
  
  const hints: Record<string, string> = {
    suggested: "needs review",
    backlog: "ready to claim",
    in_progress: "executing...",
    done: "artifact saved",
  };
  
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 text-xs border-b border-white/5 last:border-0 ${isStale && task.status !== "done" ? "bg-amber-500/5" : ""}`}>
      {showAge && <span className={`text-[10px] w-6 ${isStale ? "text-amber-400" : "text-slate-500"}`}>{age}</span>}
      <span className="flex-1 truncate text-slate-200" title={task.title}>{task.title}</span>
      {showOwner && task.assigned_to && <AgentBadge agent={task.assigned_to} />}
      <StatusBadge status={task.status} size="xs" />
      {showHint && <span className="text-[9px] text-slate-500 hidden md:inline">{hints[task.status] || ""}</span>}
    </div>
  );
}

// Incident Row
function IncidentRow({ incident }: { incident: { id: string; severity: string; message: string; timestamp: string; action?: string } }) {
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 text-xs border-b border-white/5">
      <IncidentBadge severity={incident.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 truncate" title={incident.message}>{incident.message}</p>
        {incident.action && <p className="text-[9px] text-cyan-400 mt-0.5">→ {incident.action}</p>}
      </div>
      <span className="text-[9px] text-slate-500 whitespace-nowrap">{formatTimestamp(incident.timestamp)}</span>
    </div>
  );
}

// ===== MAIN PAGE =====

export default function Home() {
  const tasks = useQuery(api.tasks.list);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [capital, setCapital] = useState<CapitalStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  
  // Filter state
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [aRes, cRes] = await Promise.all([
          fetch("/api/autonomy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }) }),
          fetch("/api/capital", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }) }),
        ]);
        if (!cancelled) {
          if (aRes.ok) setAutonomy((await aRes.json()) as AutonomyStatus);
          if (cRes.ok) setCapital((await cRes.json()) as CapitalStatus);
          setLastUpdate(Date.now());
        }
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t: Task) => {
      if (agentFilter !== "all" && t.assigned_to?.toLowerCase() !== agentFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tasks, agentFilter, statusFilter, searchQuery]);

  const runningTasks = filteredTasks.filter((t: Task) => t.status === "in_progress");
  const backlogTasks = filteredTasks.filter((t: Task) => t.status === "backlog");
  const suggestedTasks = filteredTasks.filter((t: Task) => t.status === "suggested");
  const doneTasks = filteredTasks
    .filter((t: Task) => t.status === "done")
    .sort((a: Task, b: Task) => b._creationTime - a._creationTime)
    .slice(0, 8);

  // Combined incidents from both systems
  const allIncidents = useMemo(() => {
    const inc: Array<{ id: string; source: string; severity: string; message: string; timestamp: string; action?: string }> = [];
    autonomy?.incidents?.forEach((i, idx) => inc.push({ ...i, id: i.id ?? `autonomy-${idx}`, source: "autonomy" }));
    capital?.incidents?.forEach((i, idx) => inc.push({ ...i, id: i.id ?? `capital-${idx}`, source: "capital" }));
    return inc.sort((a, b) => {
      const sevOrder = { critical: 0, warning: 1, normal: 2 };
      return (sevOrder[a.severity as keyof typeof sevOrder] ?? 2) - (sevOrder[b.severity as keyof typeof sevOrder] ?? 2);
    }).slice(0, 5);
  }, [autonomy?.incidents, capital?.incidents]);

  const criticalCount = allIncidents.filter(i => i.severity === "critical").length;
  const warningCount = allIncidents.filter(i => i.severity === "warning").length;

  // Pipeline counts (from filtered)
  const pipelineCounts = {
    suggested: filteredTasks.filter((t: Task) => t.status === "suggested").length,
    backlog: filteredTasks.filter((t: Task) => t.status === "backlog").length,
    running: filteredTasks.filter((t: Task) => t.status === "in_progress").length,
    done: filteredTasks.filter((t: Task) => t.status === "done").length,
  };

  return (
    <div className="space-y-3">
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Mission Control</h1>
          <p className="text-xs text-slate-400">Enterprise ops dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">SYS</span>
            <HealthDot ok={autonomy?.ok ?? false} />
          </div>
        </div>
      </header>

      {/* FILTER BAR */}
      <FilterBar
        agentFilter={agentFilter}
        setAgentFilter={setAgentFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* MAIN 3-COLUMN GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* LEFT: Pipeline + Agents */}
        <div className="space-y-3">
          {/* Pipeline Compact */}
          <section className="panel-glass p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Pipeline</h2>
              <span className="text-[9px] text-slate-500">{filteredTasks.length} tasks</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: "suggested", label: "Sugg", color: "text-fuchsia-300", bg: "bg-fuchsia-500/20", count: pipelineCounts.suggested },
                { key: "backlog", label: "Backlog", color: "text-indigo-300", bg: "bg-indigo-500/20", count: pipelineCounts.backlog },
                { key: "running", label: "Run", color: "text-cyan-300", bg: "bg-cyan-500/20", count: pipelineCounts.running },
                { key: "done", label: "Done", color: "text-emerald-300", bg: "bg-emerald-500/20", count: pipelineCounts.done },
              ].map((step) => (
                <div key={step.key} className={`text-center p-1.5 rounded-lg bg-gradient-to-b ${step.bg}`}>
                  <p className={`text-[9px] uppercase tracking-wider ${step.color}`}>{step.label}</p>
                  <p className="text-lg font-bold text-slate-100">{step.count}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Agent Metrics */}
          <div className="grid grid-cols-2 gap-2">
            <section className="panel-glass p-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AgentBadge agent="sam" />
                <span className="text-[9px] text-slate-500">General Ops</span>
                <HealthDot ok={true} />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <MetricCard label="Assigned" value={autonomy?.byAssignee?.sam ?? "—"} />
                <MetricCard label="Runs" value={autonomy?.pluginMetrics?.totalExecutions ?? "—"} />
              </div>
            </section>
            <section className="panel-glass p-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AgentBadge agent="lyra" />
                <span className="text-[9px] text-slate-500">Capital</span>
                <HealthDot ok={capital?.portfolio?.status === "ok"} />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <MetricCard 
                  label="Equity" 
                  value={capital?.portfolio ? `$${(capital.portfolio.totalEquity/1000).toFixed(0)}k` : "—"} 
                  trend={capital?.portfolio?.totalPnl && capital.portfolio.totalPnl >= 0 ? "up" : "down"}
                />
                <MetricCard 
                  label="PnL" 
                  value={capital?.portfolio ? `${capital.portfolio.totalPnlPct >= 0 ? "+" : ""}${capital.portfolio.totalPnlPct.toFixed(0)}%` : "—"} 
                />
              </div>
            </section>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2">
            <MetricCard label="Total" value={autonomy?.total ?? "—"} />
            <MetricCard label="Plugins" value={autonomy?.pluginMetrics?.byPlugin?.length ?? "—"} />
            <MetricCard label="Positions" value={capital?.portfolio?.positions?.length ?? "—"} />
          </div>
        </div>

        {/* CENTER: Queues */}
        <div className="space-y-3">
          {/* Running Queue */}
          <section className="panel-glass p-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <h2 className="text-xs font-semibold text-slate-200">Running</h2>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-[9px] text-cyan-300 font-semibold">{runningTasks.length}</span>
            </div>
            <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
              {runningTasks.length > 0 ? runningTasks.map((t: Task) => (
                <TaskRow key={t._id} task={t} showAge showHint />
              )) : (
                <p className="text-[10px] text-slate-500 text-center py-3">No running tasks</p>
              )}
            </div>
          </section>

          {/* Backlog Queue */}
          <section className="panel-glass p-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                <h2 className="text-xs font-semibold text-slate-200">Backlog</h2>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-[9px] text-indigo-300 font-semibold">{backlogTasks.length}</span>
            </div>
            <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
              {backlogTasks.slice(0, 5).map((t: Task) => (
                <TaskRow key={t._id} task={t} showAge showHint />
              ))}
              {backlogTasks.length === 0 && (
                <p className="text-[10px] text-slate-500 text-center py-3">No backlog</p>
              )}
            </div>
          </section>

          {/* Suggested Queue */}
          <section className="panel-glass p-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-fuchsia-400"></span>
                <h2 className="text-xs font-semibold text-slate-200">Suggested</h2>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-[9px] text-fuchsia-300 font-semibold">{suggestedTasks.length}</span>
            </div>
            <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
              {suggestedTasks.slice(0, 4).map((t: Task) => (
                <TaskRow key={t._id} task={t} showAge />
              ))}
              {suggestedTasks.length === 0 && (
                <p className="text-[10px] text-slate-500 text-center py-2">No suggestions</p>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT: Incidents + Done */}
        <div className="space-y-3">
          {/* Incident Rail */}
          <section className="panel-glass p-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <h2 className="text-xs font-semibold text-slate-200">Incidents</h2>
              <div className="flex gap-1">
                {criticalCount > 0 && <span className="px-1 py-0.5 rounded bg-rose-500/30 text-[9px] text-rose-300 font-bold">{criticalCount}C</span>}
                {warningCount > 0 && <span className="px-1 py-0.5 rounded bg-amber-500/30 text-[9px] text-amber-300 font-bold">{warningCount}W</span>}
                {criticalCount === 0 && warningCount === 0 && <span className="text-[9px] text-emerald-400">All clear</span>}
              </div>
            </div>
            <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
              {allIncidents.length > 0 ? allIncidents.map((inc, i) => (
                <IncidentRow key={i} incident={inc} />
              )) : (
                <p className="text-[10px] text-slate-500 text-center py-3">No incidents</p>
              )}
            </div>
          </section>

          {/* Recently Done */}
          <section className="panel-glass p-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <h2 className="text-xs font-semibold text-slate-200">Done</h2>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[9px] text-emerald-300 font-semibold">{doneTasks.length}</span>
            </div>
            <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
              {doneTasks.length > 0 ? doneTasks.map((t: Task) => (
                <TaskRow key={t._id} task={t} showOwner showAge={false} />
              )) : (
                <p className="text-[10px] text-slate-500 text-center py-3">No completed tasks</p>
              )}
            </div>
          </section>

          {/* Plugin Sparklines */}
          <section className="panel-glass p-2">
            <h2 className="text-xs font-semibold text-slate-300 mb-1.5">Plugins</h2>
            <div className="space-y-1">
              {autonomy?.pluginMetrics?.byPlugin?.slice(0, 4).map((item) => (
                <div key={item.plugin} className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-400 truncate max-w-[80px]" title={item.plugin}>{item.plugin.split("/").pop()}</span>
                  <div className="flex-1 flex gap-px h-1.5">
                    {item.sparkline.slice(0, 12).map((v, i) => (
                      <div key={i} className={`flex-1 rounded-sm ${v > 0 ? "bg-emerald-500/70" : "bg-slate-700"}`} style={{ height: `${Math.min(100, (v / Math.max(...item.sparkline.filter(x => x > 0), 1)) * 100)}%` }} />
                    ))}
                  </div>
                  <span className="text-[9px] text-slate-500">{item.success}/{item.runs}</span>
                </div>
              ))}
              {(!autonomy?.pluginMetrics?.byPlugin || autonomy.pluginMetrics.byPlugin.length === 0) && (
                <p className="text-[10px] text-slate-500 text-center py-2">No plugin data</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* MISSION FOOTER */}
      <section className="panel-glass bg-gradient-to-r from-violet-500/10 to-cyan-500/10 p-2">
        <p className="text-[9px] uppercase tracking-widest text-slate-500">Mission</p>
        <p className="text-xs text-slate-300 mt-0.5">Autonomous AI ops — reduce manual work, ship value 24/7, build compounding systems.</p>
      </section>
    </div>
  );
}
