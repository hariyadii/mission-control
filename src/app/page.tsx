"use client";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  CommandBar,
  FreshnessIndicator,
  HealthDot,
  StatusBadge,
  AgentBadge,
  IncidentBadge,
  MetricTile,
  MetricCard,
  PageHeader,
  SectionCard,
  Sparkline,
  FilterInput,
  FilterSelect,
  EmptyState,
  Divider,
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
  if (h   > 0) return `${h}h`;
  if (m   > 0) return `${m}m`;
  return "now";
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TaskRow({ task }: { task: Task }) {
  const age    = useMemo(() => formatAge(task._creationTime), [task._creationTime]);
  const isStale = Date.now() - task._creationTime > 3_600_000 && task.status !== "done";
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors ${
        isStale ? "bg-amber-500/5" : "hover:bg-white/[0.025]"
      }`}
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <span
        className={`w-6 text-[10px] tabular-nums shrink-0 ${isStale ? "text-amber-400" : "text-slate-500"}`}
      >
        {age}
      </span>
      <span className="flex-1 truncate" style={{ color: "var(--text-secondary)" }} title={task.title}>
        {task.title}
      </span>
      {task.assigned_to && <AgentBadge agent={task.assigned_to} size="xs" />}
      <StatusBadge status={task.status} size="xs" />
    </div>
  );
}

function IncidentRow({ incident }: {
  incident: { id: string; severity: string; message: string; timestamp: string; action?: string };
}) {
  return (
    <div
      className="flex items-start gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/[0.025]"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <IncidentBadge severity={incident.severity} />
      <div className="flex-1 min-w-0">
        <p className="truncate leading-snug" style={{ color: "var(--text-secondary)" }} title={incident.message}>
          {incident.message}
        </p>
        {incident.action && (
          <p className="text-[9px] text-cyan-400 mt-0.5">→ {incident.action}</p>
        )}
      </div>
      <span className="text-[9px] whitespace-nowrap shrink-0" style={{ color: "var(--text-muted)" }}>
        {formatTs(incident.timestamp)}
      </span>
    </div>
  );
}

// Queue column with header + scrollable list
function QueueColumn({
  label,
  dotColorClass,
  badgeClass,
  tasks,
  maxH = "130px",
}: {
  label: string;
  dotColorClass: string;
  badgeClass: string;
  tasks: Task[];
  maxH?: string;
}) {
  return (
    <section className="panel-glass overflow-hidden">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-2.5 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColorClass}`} aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)", letterSpacing: "0.08em" }}>
            {label}
          </span>
        </div>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${badgeClass}`}>
          {tasks.length}
        </span>
      </div>
      {/* Rows */}
      <div className="overflow-y-auto" style={{ maxHeight: maxH }}>
        {tasks.length > 0 ? (
          tasks.map((t) => <TaskRow key={t._id} task={t} />)
        ) : (
          <EmptyState icon="○" message="Empty" />
        )}
      </div>
    </section>
  );
}

// Pipeline counter tile
function PipelineTile({
  label,
  count,
  colorClass,
  bgClass,
  href,
}: {
  label: string;
  count: number;
  colorClass: string;
  bgClass: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`text-center p-2.5 rounded-xl border transition-all duration-150 hover:brightness-110 hover:-translate-y-px ${bgClass}`}
      aria-label={`${label}: ${count} tasks`}
    >
      <p className={`text-[9px] uppercase tracking-widest font-semibold leading-none ${colorClass}`}>{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-tight mt-1" style={{ color: "var(--text-primary)" }}>
        {count}
      </p>
    </Link>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Home() {
  const tasks    = useQuery(api.tasks.list);
  const [autonomy,   setAutonomy]   = useState<AutonomyStatus | null>(null);
  const [capital,    setCapital]    = useState<CapitalStatus  | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Filters
  const [agentFilter,  setAgentFilter]  = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery,  setSearchQuery]  = useState("");

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

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return (tasks as Task[]).filter((t) => {
      if (agentFilter  !== "all" && t.assigned_to?.toLowerCase() !== agentFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter)                    return false;
      if (searchQuery  && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tasks, agentFilter, statusFilter, searchQuery]);

  const running   = filteredTasks.filter((t) => t.status === "in_progress");
  const backlog   = filteredTasks.filter((t) => t.status === "backlog");
  const suggested = filteredTasks.filter((t) => t.status === "suggested");
  const done      = filteredTasks
    .filter((t) => t.status === "done")
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, 12);

  const pCounts = {
    suggested: filteredTasks.filter((t) => t.status === "suggested").length,
    backlog:   filteredTasks.filter((t) => t.status === "backlog").length,
    running:   filteredTasks.filter((t) => t.status === "in_progress").length,
    done:      filteredTasks.filter((t) => t.status === "done").length,
  };

  const allIncidents = useMemo(() => {
    const inc: Array<{
      id: string; source: string; severity: string;
      message: string; timestamp: string; action?: string;
    }> = [];
    autonomy?.incidents?.forEach((i, idx) => inc.push({ ...i, id: i.id ?? `a-${idx}`, source: "autonomy" }));
    capital?.incidents?.forEach((i, idx) => inc.push({ ...i, id: i.id ?? `c-${idx}`, source: "capital" }));
    const order: Record<string, number> = { critical: 0, warning: 1, normal: 2 };
    return inc.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2)).slice(0, 6);
  }, [autonomy?.incidents, capital?.incidents]);

  const critCount = allIncidents.filter((i) => i.severity === "critical").length;
  const warnCount = allIncidents.filter((i) => i.severity === "warning").length;

  const capPnlPositive = (capital?.portfolio?.totalPnl ?? 0) >= 0;
  const hasFilter = agentFilter !== "all" || statusFilter !== "all" || searchQuery;

  return (
    <div className="space-y-5 page-enter">

      {/* ── Sticky Command Bar ── */}
      <CommandBar
        title="Mission Control"
        subtitle="Overview"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>SYS</span>
              <HealthDot ok={autonomy?.ok ?? false} size="sm" />
            </div>
          </>
        }
      />

      {/* ── Page Title ── */}
      <PageHeader
        title="Overview"
        subtitle="Autonomous AI operations"
        right={
          <Link href="/control" className="btn-ghost text-[10px]">
            Control →
          </Link>
        }
      />

      {/* ── Pipeline Counter Row ── */}
      <div className="grid grid-cols-4 gap-2">
        <PipelineTile
          label="Suggested" count={pCounts.suggested}
          colorClass="text-fuchsia-300" href="/tasks?status=suggested"
          bgClass="bg-fuchsia-500/10 border-fuchsia-500/20 hover:border-fuchsia-500/35"
        />
        <PipelineTile
          label="Queued" count={pCounts.backlog}
          colorClass="text-indigo-300" href="/tasks?status=backlog"
          bgClass="bg-indigo-500/10 border-indigo-500/20 hover:border-indigo-500/35"
        />
        <PipelineTile
          label="Running" count={pCounts.running}
          colorClass="text-cyan-300" href="/tasks?status=in_progress"
          bgClass="bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-500/35"
        />
        <PipelineTile
          label="Done" count={pCounts.done}
          colorClass="text-emerald-300" href="/tasks?status=done"
          bgClass="bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/35"
        />
      </div>

      {/* ── Filter Bar ── */}
      <div
        className="flex flex-wrap items-center gap-2 p-2.5 panel-glass"
        role="search"
        aria-label="Filter tasks"
      >
        <FilterInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search tasks…"
        />
        <FilterSelect value={agentFilter} onChange={setAgentFilter} ariaLabel="Filter by agent">
          <option value="all">All agents</option>
          <option value="sam">Sam</option>
          <option value="lyra">Lyra</option>
          <option value="alex">Alex</option>
          <option value="nova">Nova</option>
          <option value="ops">Ops</option>
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status">
          <option value="all">All status</option>
          <option value="suggested">Suggested</option>
          <option value="backlog">Backlog</option>
          <option value="in_progress">Running</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
        </FilterSelect>
        {hasFilter && (
          <button
            onClick={() => { setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
            className="btn-ghost text-[10px]"
            aria-label="Clear all filters"
          >
            ✕ Clear
          </button>
        )}
        <span className="ml-auto text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {filteredTasks.length} tasks
        </span>
      </div>

      {/* ── Main 3-Column Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ── LEFT: Agents + Stats ── */}
        <div className="space-y-4">

          {/* Agent metrics */}
          <div className="grid grid-cols-2 gap-2.5">

            {/* Sam card */}
            <div className="panel-glass p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <AgentBadge agent="sam" size="xs" />
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>Worker</span>
                <HealthDot ok size="sm" />
              </div>
              <Divider subtle />
              <div className="grid grid-cols-2 gap-1.5">
                <MetricCard label="Tasks"  value={autonomy?.byAssignee?.sam ?? "—"} />
                <MetricCard label="Runs"   value={autonomy?.pluginMetrics?.totalExecutions ?? "—"} />
              </div>
            </div>

            {/* Lyra card */}
            <div className="panel-glass p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <AgentBadge agent="lyra" size="xs" />
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>Capital</span>
                <HealthDot ok={capital?.portfolio?.status === "ok"} size="sm" />
              </div>
              <Divider subtle />
              <div className="grid grid-cols-2 gap-1.5">
                <MetricCard
                  label="Equity"
                  value={capital?.portfolio ? `$${(capital.portfolio.totalEquity / 1000).toFixed(0)}k` : "—"}
                  trend={capPnlPositive ? "up" : "down"}
                  accent={capPnlPositive ? "emerald" : "rose"}
                />
                <MetricCard
                  label="PnL"
                  value={
                    capital?.portfolio
                      ? `${capital.portfolio.totalPnlPct >= 0 ? "+" : ""}${capital.portfolio.totalPnlPct.toFixed(1)}%`
                      : "—"
                  }
                />
              </div>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-3 gap-1.5">
            <MetricTile label="Total"     value={autonomy?.total                             ?? "—"} />
            <MetricTile label="Plugins"   value={autonomy?.pluginMetrics?.byPlugin?.length   ?? "—"} />
            <MetricTile label="Positions" value={capital?.portfolio?.positions?.length        ?? "—"} />
          </div>

          {/* Plugin sparklines */}
          {(autonomy?.pluginMetrics?.byPlugin?.length ?? 0) > 0 && (
            <SectionCard title="Plugins">
              <div className="space-y-2">
                {autonomy!.pluginMetrics!.byPlugin.slice(0, 6).map((item) => (
                  <div key={item.plugin} className="flex items-center gap-2">
                    <span
                      className="text-[9px] truncate shrink-0"
                      style={{ color: "var(--text-muted)", width: 72 }}
                      title={item.plugin}
                    >
                      {item.plugin.split("/").pop()}
                    </span>
                    <Sparkline data={item.sparkline.slice(0, 14)} color="emerald" height={14} />
                    <span
                      className="text-[9px] tabular-nums shrink-0"
                      style={{ color: "var(--text-muted)", width: 36, textAlign: "right" }}
                    >
                      {item.success}/{item.runs}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── CENTER: Live Queues ── */}
        <div className="space-y-3">
          <QueueColumn
            label="Running"
            dotColorClass="bg-cyan-400 animate-pulse"
            badgeClass="text-cyan-300 bg-cyan-500/18 border border-cyan-500/28"
            tasks={running}
            maxH="150px"
          />
          <QueueColumn
            label="Backlog"
            dotColorClass="bg-indigo-400"
            badgeClass="text-indigo-300 bg-indigo-500/18 border border-indigo-500/28"
            tasks={backlog}
            maxH="120px"
          />
          <QueueColumn
            label="Suggested"
            dotColorClass="bg-fuchsia-400"
            badgeClass="text-fuchsia-300 bg-fuchsia-500/18 border border-fuchsia-500/28"
            tasks={suggested.slice(0, 8)}
            maxH="100px"
          />
        </div>

        {/* ── RIGHT: Incidents + Completed ── */}
        <div className="space-y-3">

          {/* Incidents */}
          <SectionCard
            title="Incidents"
            badge={
              <div className="flex items-center gap-1">
                {critCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold border text-rose-300 bg-rose-500/18 border-rose-500/28">
                    {critCount}C
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold border text-amber-300 bg-amber-500/18 border-amber-500/28">
                    {warnCount}W
                  </span>
                )}
                {critCount === 0 && warnCount === 0 && (
                  <span className="text-[9px] text-emerald-400 font-medium">All clear</span>
                )}
              </div>
            }
          >
            <div className="max-h-[120px] overflow-y-auto -mx-0.5">
              {allIncidents.length > 0 ? (
                allIncidents.map((inc) => (
                  <IncidentRow key={`${inc.source}-${inc.id}`} incident={inc} />
                ))
              ) : (
                <EmptyState icon="✓" message="No incidents" />
              )}
            </div>
          </SectionCard>

          {/* Recently completed */}
          <SectionCard
            title="Completed"
            badge={
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold border text-emerald-300 bg-emerald-500/18 border-emerald-500/28">
                {done.length}
              </span>
            }
          >
            <div className="max-h-[220px] overflow-y-auto -mx-0.5">
              {done.length > 0 ? (
                done.map((t) => <TaskRow key={t._id} task={t} />)
              ) : (
                <EmptyState icon="○" message="Nothing yet" />
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Mission Statement Footer ── */}
      <div
        className="panel-glass px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        style={{ background: "linear-gradient(90deg, rgba(99,102,241,0.07), rgba(6,182,212,0.07))" }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-faint)" }}>
            Mission
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Autonomous AI ops — reduce manual work, ship value 24/7, build compounding systems.
          </p>
        </div>
        <Link href="/control" className="btn-secondary text-xs shrink-0">
          Control →
        </Link>
      </div>
    </div>
  );
}
