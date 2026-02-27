"use client";
import { useEffect, useState } from "react";

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
    success: { label: "OK", color: "text-emerald-300", bg: "bg-emerald-500/20" },
    failed: { label: "FAIL", color: "text-rose-300", bg: "bg-rose-500/20" },
    pending: { label: "PEND", color: "text-amber-300", bg: "bg-amber-500/20" },
  };
  const c = config[status?.toLowerCase()] || { label: status?.slice(0, 6).toUpperCase() || "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

type Assignee = "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";
type AuditEntry = {
  id: string;
  timestamp: string;
  agent: Assignee;
  action: string;
  target: string;
  status: "success" | "failed" | "pending";
  details?: string;
  canUndo: boolean;
};

type DatePreset = "all" | "today" | "week" | "month";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [agentFilter, setAgentFilter] = useState<Assignee | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "pending">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const fetchAudit = async () => {
    try {
      const res = await fetch("/api/audit");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setLastUpdate(Date.now());
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    void fetchAudit();
    const id = setInterval(fetchAudit, 30000);
    return () => clearInterval(id);
  }, []);

  const filteredEntries = entries.filter((e) => {
    if (datePreset === "today") {
      const today = new Date().toISOString().slice(0, 10);
      if (!e.timestamp.startsWith(today)) return false;
    } else if (datePreset === "week") {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (new Date(e.timestamp).getTime() < weekAgo) return false;
    } else if (datePreset === "month") {
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (new Date(e.timestamp).getTime() < monthAgo) return false;
    }
    if (agentFilter !== "all" && e.agent !== agentFilter) return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (searchQuery && !e.action.toLowerCase().includes(searchQuery.toLowerCase()) && !e.target.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const successCount = entries.filter(e => e.status === "success").length;
  const failCount = entries.filter(e => e.status === "failed").length;

  return (
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Audit</h1>
          <p className="text-xs text-slate-400">Action history</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
        </div>
      </header>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="panel-glass p-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">Total</p>
          <p className="text-lg font-semibold text-slate-100">{entries.length}</p>
        </div>
        <div className="panel-glass p-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">Success</p>
          <p className="text-lg font-semibold text-emerald-400">{successCount}</p>
        </div>
        <div className="panel-glass p-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">Failed</p>
          <p className="text-lg font-semibold text-rose-400">{failCount}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 panel-glass">
        <input
          type="text"
          placeholder="Search actions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[120px] bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
        />
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          className="bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
        >
          {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value as Assignee | "all")}
          className="bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
        >
          <option value="all">All Agents</option>
          <option value="alex">Alex</option>
          <option value="sam">Sam</option>
          <option value="lyra">Lyra</option>
          <option value="nova">Nova</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
        >
          <option value="all">All Status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <button
          onClick={() => { setDatePreset("all"); setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
          className="px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200"
        >
          Clear
        </button>
      </div>

      {/* Audit List */}
      <div className="panel-glass p-2">
        <div className="space-y-1 max-h-[calc(100vh-400px)] overflow-y-auto">
          {filteredEntries.length > 0 ? (
            filteredEntries.slice(0, 50).map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 px-2 py-1.5 text-xs border-b border-white/5 last:border-0">
                <span className="text-[9px] text-slate-500 w-16 shrink-0">{new Date(entry.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                <StatusBadge status={entry.status} />
                <span className="text-slate-300 flex-1 truncate" title={entry.action}>{entry.action}</span>
                <span className="text-slate-500 truncate max-w-[100px]" title={entry.target}>{entry.target}</span>
                <span className="text-[9px] text-cyan-400 uppercase shrink-0">{entry.agent}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 text-center py-4">No audit entries</p>
          )}
        </div>
        {filteredEntries.length > 0 && (
          <p className="text-[9px] text-slate-500 text-center mt-2">
            Showing {Math.min(50, filteredEntries.length)} of {filteredEntries.length}
          </p>
        )}
      </div>
    </div>
  );
}
