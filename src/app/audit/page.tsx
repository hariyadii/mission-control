"use client";
/**
 * Audit — Action History
 * Enterprise-polish additions:
 *  - Execution trace timeline view: claim→heartbeat→complete events with visual timeline
 *  - Status-severity coloring: failed entries visually stand out
 *  - Entry detail expansion (click to expand full details)
 *  - Summary stats with quick-access failed filter
 */
import { useEffect, useState, useMemo } from "react";
import {
  FreshnessIndicator,
  StatusBadge,
  AgentBadge,
  PageHeader,
  FilterInput,
  FilterSelect,
} from "@/components/ui";

type Assignee   = "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";
type AuditEntry = {
  id:        string;
  timestamp: string;
  agent:     Assignee;
  action:    string;
  target:    string;
  status:    "success" | "failed" | "pending";
  details?:  string;
  canUndo:   boolean;
  // lifecycle enrichment fields (may or may not exist in API response)
  phase?:    "claim" | "heartbeat" | "complete" | "blocked" | "requeue" | "other";
  taskId?:   string;
};

type DatePreset = "all" | "today" | "week" | "month";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all",   label: "All time" },
  { value: "today", label: "Today"    },
  { value: "week",  label: "Week"     },
  { value: "month", label: "Month"    },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDatetime(ts: string): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day:   "numeric",
    hour:  "2-digit",
    minute:"2-digit",
    second:"2-digit",
  });
}

// Detect lifecycle phase from action string
function detectPhase(action: string): NonNullable<AuditEntry["phase"]> {
  const a = action.toLowerCase();
  if (a.includes("claim"))      return "claim";
  if (a.includes("heartbeat"))  return "heartbeat";
  if (a.includes("complete"))   return "complete";
  if (a.includes("blocked") || a.includes("block")) return "blocked";
  if (a.includes("requeue") || a.includes("stale"))  return "requeue";
  return "other";
}

const PHASE_STYLE: Record<NonNullable<AuditEntry["phase"]>, { dot: string; label: string; color: string }> = {
  claim:     { dot: "bg-cyan-400",    label: "Claim",    color: "text-cyan-300"   },
  heartbeat: { dot: "bg-indigo-400",  label: "Heartbeat",color: "text-indigo-300" },
  complete:  { dot: "bg-emerald-400", label: "Complete", color: "text-emerald-300"},
  blocked:   { dot: "bg-rose-400",    label: "Blocked",  color: "text-rose-300"   },
  requeue:   { dot: "bg-amber-400",   label: "Requeue",  color: "text-amber-300"  },
  other:     { dot: "bg-slate-500",   label: "Action",   color: "text-slate-400"  },
};

// ── Audit Entry Row ─────────────────────────────────────────────────────────

function AuditRow({ entry, showPhase }: { entry: AuditEntry; showPhase: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const phase: NonNullable<AuditEntry["phase"]> = entry.phase ?? detectPhase(entry.action) ?? "other";
  const phaseStyle = PHASE_STYLE[phase];
  const isFailed  = entry.status === "failed";

  return (
    <div
      className={`border-b border-white/5 last:border-0 transition-colors ${
        isFailed ? "bg-rose-500/5 hover:bg-rose-500/8" : "hover:bg-white/[0.025]"
      }`}
    >
      {/* Main row */}
      <button
        className="w-full flex items-center gap-2 px-2 py-2 text-xs text-left"
        onClick={() => entry.details ? setExpanded((e) => !e) : undefined}
        aria-expanded={entry.details ? expanded : undefined}
        aria-label={`Audit entry: ${entry.action}`}
      >
        {/* Time */}
        <span className="text-[9px] text-slate-600 w-12 tabular-nums shrink-0">
          {fmtTime(entry.timestamp)}
        </span>

        {/* Phase dot (timeline mode) */}
        {showPhase && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${phaseStyle.dot}`}
            aria-hidden="true"
            title={phaseStyle.label}
          />
        )}

        {/* Status badge */}
        <StatusBadge status={entry.status} size="xs" />

        {/* Action */}
        <span
          className={`flex-1 truncate ${isFailed ? "text-rose-200 font-medium" : "text-slate-200"}`}
          title={entry.action}
        >
          {entry.action}
        </span>

        {/* Target */}
        <span
          className="text-slate-500 truncate max-w-[100px] hidden md:block text-[10px]"
          title={entry.target}
        >
          {entry.target}
        </span>

        {/* Agent */}
        <AgentBadge agent={entry.agent} size="xs" />

        {/* Expand indicator */}
        {entry.details && (
          <span className={`text-[9px] text-slate-600 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
            ▾
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && entry.details && (
        <div className="px-3 pb-2.5 pt-0">
          <div className="rounded-lg bg-slate-900/60 border border-white/8 p-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[9px] font-bold ${phaseStyle.color}`}>{phaseStyle.label}</span>
              <span className="text-[9px] text-slate-500">{fmtDatetime(entry.timestamp)}</span>
            </div>
            <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-words leading-relaxed">
              {entry.details}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lifecycle Timeline Panel ────────────────────────────────────────────────
// Groups audit entries by task ID and shows a mini timeline per task.

function LifecycleTimeline({ entries }: { entries: AuditEntry[] }) {
  // Group by taskId (only when available)
  const grouped = useMemo(() => {
    const byTask = new Map<string, AuditEntry[]>();
    for (const e of entries) {
      if (!e.taskId) continue;
      const existing = byTask.get(e.taskId) ?? [];
      byTask.set(e.taskId, [...existing, e]);
    }
    return byTask;
  }, [entries]);

  if (grouped.size === 0) return null;

  return (
    <section className="panel-glass p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        Task Lifecycles ({grouped.size})
      </p>
      <div className="space-y-3 max-h-[220px] overflow-y-auto">
        {Array.from(grouped.entries()).slice(0, 8).map(([taskId, evs]) => (
          <div key={taskId} className="space-y-1">
            <p className="text-[9px] font-mono text-slate-500 truncate">{taskId}</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {evs
                .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
                .map((ev, i) => {
                  const phase: NonNullable<AuditEntry["phase"]> = ev.phase ?? detectPhase(ev.action) ?? "other";
                  const style = PHASE_STYLE[phase];
                  return (
                    <div key={i} className="flex items-center gap-1 shrink-0">
                      {i > 0 && <span className="text-slate-700 text-[8px]">—</span>}
                      <div className="flex flex-col items-center">
                        <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" title={`${style.label}: ${ev.action}`} />
                        <span className={`text-[8px] mt-0.5 ${style.color}`}>{style.label.slice(0, 5)}</span>
                        <span className="text-[8px] text-slate-700 tabular-nums">{fmtTime(ev.timestamp)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [entries,      setEntries]      = useState<AuditEntry[]>([]);
  const [datePreset,   setDatePreset]   = useState<DatePreset>("today");
  const [agentFilter,  setAgentFilter]  = useState<Assignee | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "pending">("all");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [lastUpdate,   setLastUpdate]   = useState(Date.now());
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/audit");
        if (res.ok) {
          const data = (await res.json()) as { entries?: AuditEntry[] };
          setEntries(data.entries || []);
          setLastUpdate(Date.now());
        }
      } catch { /* ignore */ }
    };
    void fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered = entries.filter((e) => {
    if (datePreset === "today") {
      if (!e.timestamp.startsWith(new Date().toISOString().slice(0, 10))) return false;
    } else if (datePreset === "week") {
      if (new Date(e.timestamp).getTime() < Date.now() - 7  * 864e5) return false;
    } else if (datePreset === "month") {
      if (new Date(e.timestamp).getTime() < Date.now() - 30 * 864e5) return false;
    }
    if (agentFilter  !== "all" && e.agent  !== agentFilter)  return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (searchQuery && !e.action.toLowerCase().includes(searchQuery.toLowerCase()) && !e.target.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const successCount = entries.filter((e) => e.status === "success").length;
  const failCount    = entries.filter((e) => e.status === "failed").length;
  const pendingCount = entries.filter((e) => e.status === "pending").length;

  // Operator signal: failed entries sort to top
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // Failed first
      if (a.status === "failed" && b.status !== "failed") return -1;
      if (b.status === "failed" && a.status !== "failed") return  1;
      // Then by time descending
      return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    });
  }, [filtered]);

  const hasTaskIdEntries = filtered.some((e) => !!e.taskId);

  return (
    <div className="flex flex-col gap-4 page-enter">
      <PageHeader
        title="Audit"
        subtitle="Action history & execution trace"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />

      {/* Stats — failed count surfaced prominently */}
      <div className="grid grid-cols-4 gap-2">
        <div className="panel-glass p-3 text-center">
          <p className="section-label mb-1">Total</p>
          <p className="text-2xl font-bold text-slate-100 tabular-nums">{entries.length}</p>
        </div>
        <div className="panel-glass p-3 text-center">
          <p className="section-label mb-1 text-emerald-500">Success</p>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{successCount}</p>
        </div>
        <button
          className={`panel-glass p-3 text-center transition-all ${
            failCount > 0 ? "border border-rose-500/35 bg-rose-500/6 cursor-pointer hover:bg-rose-500/10" : ""
          }`}
          onClick={() => failCount > 0 && setStatusFilter(statusFilter === "failed" ? "all" : "failed")}
          disabled={failCount === 0}
          aria-label={`Filter to failed entries (${failCount})`}
          aria-pressed={statusFilter === "failed"}
        >
          <p className={`section-label mb-1 ${failCount > 0 ? "text-rose-500" : ""}`}>Failed</p>
          <p className={`text-2xl font-bold tabular-nums ${failCount > 0 ? "text-rose-400" : "text-slate-600"}`}>
            {failCount}
          </p>
        </button>
        <div className="panel-glass p-3 text-center">
          <p className="section-label mb-1 text-amber-500">Pending</p>
          <p className="text-2xl font-bold text-amber-400 tabular-nums">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 panel-glass">
        <FilterInput value={searchQuery} onChange={setSearchQuery} placeholder="Search actions…" className="text-xs" />
        <FilterSelect value={datePreset}   onChange={(v) => setDatePreset(v as DatePreset)} ariaLabel="Filter by date range" className="py-1.5">
          {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </FilterSelect>
        <FilterSelect value={agentFilter}  onChange={(v) => setAgentFilter(v as Assignee | "all")} ariaLabel="Filter by agent" className="py-1.5">
          <option value="all">All agents</option>
          {["alex","sam","lyra","nova","ops"].map((a) => (
            <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
          ))}
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)} ariaLabel="Filter by status" className="py-1.5">
          <option value="all">All status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </FilterSelect>
        {hasTaskIdEntries && (
          <button
            onClick={() => setShowTimeline((t) => !t)}
            className={`btn-ghost text-[10px] ${showTimeline ? "text-cyan-300" : ""}`}
            aria-pressed={showTimeline}
          >
            ⊞ Timeline
          </button>
        )}
        {(agentFilter !== "all" || statusFilter !== "all" || searchQuery || datePreset !== "all") && (
          <button
            onClick={() => { setDatePreset("all"); setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
            className="btn-ghost text-[10px]"
          >
            ✕ Clear
          </button>
        )}
        <span className="ml-auto text-[10px] text-slate-500 tabular-nums">{filtered.length} entries</span>
      </div>

      {/* Lifecycle timeline (optional) */}
      {showTimeline && hasTaskIdEntries && (
        <LifecycleTimeline entries={filtered} />
      )}

      {/* Audit list — scroll-isolated */}
      <div className="panel-glass p-2.5 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: "max(240px, calc(100vh - 400px))" }}>
          {sortedFiltered.length > 0 ? (
            sortedFiltered.slice(0, 100).map((entry) => (
              <AuditRow key={entry.id} entry={entry} showPhase={!showTimeline} />
            ))
          ) : (
            <p className="text-xs text-slate-600 text-center py-6">No audit entries</p>
          )}
        </div>
        {sortedFiltered.length > 0 && (
          <p className="text-[9px] text-slate-600 text-center mt-2 pt-2 border-t border-white/5">
            Showing {Math.min(100, sortedFiltered.length)} of {sortedFiltered.length}
            {statusFilter === "all" && failCount > 0 && (
              <> · <button className="text-rose-400 hover:text-rose-200 ml-1" onClick={() => setStatusFilter("failed")}>
                {failCount} failed
              </button></>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
