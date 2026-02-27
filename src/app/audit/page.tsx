"use client";
import { useEffect, useState } from "react";
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
};

type DatePreset = "all" | "today" | "week" | "month";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all",   label: "All time" },
  { value: "today", label: "Today"    },
  { value: "week",  label: "Week"     },
  { value: "month", label: "Month"    },
];

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AuditPage() {
  const [entries,      setEntries]      = useState<AuditEntry[]>([]);
  const [datePreset,   setDatePreset]   = useState<DatePreset>("today");
  const [agentFilter,  setAgentFilter]  = useState<Assignee | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "pending">("all");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [lastUpdate,   setLastUpdate]   = useState(Date.now());

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/audit");
        if (res.ok) { setEntries((await res.json()).entries || []); setLastUpdate(Date.now()); }
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

  return (
    <div className="space-y-4 page-enter">
      <PageHeader
        title="Audit"
        subtitle="Action history"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="panel-glass p-3 text-center">
          <p className="section-label mb-1">Total</p>
          <p className="text-2xl font-bold text-slate-100 tabular-nums">{entries.length}</p>
        </div>
        <div className="panel-glass p-3 text-center">
          <p className="section-label mb-1 text-emerald-500">Success</p>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{successCount}</p>
        </div>
        <div className="panel-glass p-3 text-center">
          <p className="section-label mb-1 text-rose-500">Failed</p>
          <p className="text-2xl font-bold text-rose-400 tabular-nums">{failCount}</p>
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
        {(agentFilter !== "all" || statusFilter !== "all" || searchQuery || datePreset !== "all") && (
          <button
            onClick={() => { setDatePreset("all"); setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
            className="btn-ghost text-[10px]"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Audit list */}
      <div className="panel-glass p-2.5">
        <div className="space-y-0 overflow-y-auto" style={{ maxHeight: "max(240px, calc(100vh - 400px))" }}>
          {filtered.length > 0 ? (
            filtered.slice(0, 60).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 px-2 py-2 text-xs border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
              >
                <span className="text-[9px] text-slate-600 w-12 tabular-nums shrink-0">{fmtTime(entry.timestamp)}</span>
                <StatusBadge status={entry.status} size="xs" />
                <span className="text-slate-200 flex-1 truncate" title={entry.action}>{entry.action}</span>
                <span className="text-slate-500 truncate max-w-[100px] hidden md:block" title={entry.target}>{entry.target}</span>
                <AgentBadge agent={entry.agent} size="xs" />
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-600 text-center py-6">No audit entries</p>
          )}
        </div>
        {filtered.length > 0 && (
          <p className="text-[9px] text-slate-600 text-center mt-2 pt-2 border-t border-white/5">
            Showing {Math.min(60, filtered.length)} of {filtered.length}
          </p>
        )}
      </div>
    </div>
  );
}
