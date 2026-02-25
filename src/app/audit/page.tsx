"use client";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type Assignee = "me" | "alex" | "sam" | "lyra" | "nova" | "agent";
type TaskStatus = "suggested" | "backlog" | "in_progress" | "blocked" | "done";
type ValidationStatus = "pending" | "pass" | "fail";

type Task = {
  _id: Id<"tasks">;
  _creationTime?: number;
  title: string;
  description?: string;
  status: TaskStatus;
  assigned_to: Assignee;
  created_at: string;
  updated_at?: string;
  owner?: Assignee;
  lease_until?: string;
  heartbeat_at?: string;
  validation_status?: ValidationStatus;
  artifact_path?: string;
  changelog_path?: string;
};

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

const AGENT_OPTIONS: { value: Assignee | "all"; label: string }[] = [
  { value: "all", label: "All Agents" },
  { value: "alex", label: "Alex" },
  { value: "sam", label: "Sam" },
  { value: "lyra", label: "Lyra" },
  { value: "nova", label: "Nova" },
  { value: "agent", label: "Agent" },
];

const STATUS_OPTIONS: { value: "all" | "success" | "failed" | "pending"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

const DATE_PRESETS: { value: DatePreset; label: string; icon: string }[] = [
  { value: "all", label: "All Time", icon: "◫" },
  { value: "today", label: "Today", icon: "◷" },
  { value: "week", label: "This Week", icon: "◫" },
  { value: "month", label: "This Month", icon: "◎" },
];

function assigneeLabel(value: string) {
  const v = value.toLowerCase();
  if (v === "alex") return "Alex";
  if (v === "sam") return "Sam";
  if (v === "lyra") return "Lyra";
  if (v === "nova") return "Nova";
  if (v === "agent") return "Agent";
  if (v === "me") return "Me";
  return value;
}

function statusBadge(status: "success" | "failed" | "pending") {
  if (status === "success") {
    return <span className="badge badge-success">✓ Success</span>;
  }
  if (status === "failed") {
    return <span className="badge badge-failed">✗ Failed</span>;
  }
  return <span className="badge badge-pending">◔ Pending</span>;
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateRange(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (preset === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (preset === "week") {
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (preset === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    // All time - far past to far future
    start.setFullYear(2020, 0, 1);
    end.setFullYear(2030, 11, 31);
  }

  return { start, end };
}

function isInDateRange(timestamp: string, preset: DatePreset): boolean {
  const { start, end } = getDateRange(preset);
  const date = new Date(timestamp);
  return date >= start && date <= end;
}

// Custom badge styles for audit statuses
const statusBadgeStyles = {
  success: "border-emerald-300/45 bg-emerald-500/20 text-emerald-200",
  failed: "border-rose-300/45 bg-rose-500/20 text-rose-200",
  pending: "border-amber-300/45 bg-amber-500/20 text-amber-200",
};

export default function AuditPage() {
  const tasks = useQuery(api.tasks.list);
  const [filteredEntries, setFilteredEntries] = useState<AuditEntry[]>([]);
  const [agentFilter, setAgentFilter] = useState<Assignee | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "pending">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Build audit entries from task history
  useEffect(() => {
    if (!tasks) return;

    const entries: AuditEntry[] = [];

    // Build audit trail from tasks
    tasks.forEach((task) => {
      const taskId = String(task._id);
      const agent = task.assigned_to;

      // Entry: Task Created
      entries.push({
        id: `${taskId}-created`,
        timestamp: task.created_at,
        agent: agent,
        action: "Task Created",
        target: task.title.substring(0, 50) + (task.title.length > 50 ? "..." : ""),
        status: "success",
        details: `Created in ${task.status} queue`,
        canUndo: false,
      });

      // Entry: Task Status (if not suggested/created)
      if (task.status === "in_progress" && task.heartbeat_at) {
        entries.push({
          id: `${taskId}-claimed`,
          timestamp: task.heartbeat_at,
          agent: task.owner || agent,
          action: "Task Claimed",
          target: task.title.substring(0, 50) + (task.title.length > 50 ? "..." : ""),
          status: "success",
          details: `Lease until ${task.lease_until ? new Date(task.lease_until).toLocaleString() : "N/A"}`,
          canUndo: true,
        });
      }

      // Entry: Validation Status
      if (task.validation_status) {
        entries.push({
          id: `${taskId}-validation`,
          timestamp: task.updated_at || task.created_at,
          agent: agent,
          action: "Validation",
          target: task.title.substring(0, 50) + (task.title.length > 50 ? "..." : ""),
          status: task.validation_status === "pass" ? "success" : task.validation_status === "fail" ? "failed" : "pending",
          details: `Validation: ${task.validation_status}`,
          canUndo: task.validation_status === "fail",
        });
      }

      // Entry: Completed
      if (task.status === "done") {
        entries.push({
          id: `${taskId}-completed`,
          timestamp: task.updated_at || task.created_at,
          agent: agent,
          action: "Task Completed",
          target: task.title.substring(0, 50) + (task.title.length > 50 ? "..." : ""),
          status: task.validation_status === "pass" ? "success" : task.validation_status === "fail" ? "failed" : "pending",
          details: task.artifact_path ? `Artifact: ${task.artifact_path.split("/").pop()}` : undefined,
          canUndo: true,
        });
      }

      // Entry: Blocked
      if (task.status === "blocked") {
        entries.push({
          id: `${taskId}-blocked`,
          timestamp: task.updated_at || task.created_at,
          agent: agent,
          action: "Task Blocked",
          target: task.title.substring(0, 50) + (task.title.length > 50 ? "..." : ""),
          status: "failed",
          details: task.description?.includes("stale_lease") ? "Stale lease requeued" : "Blocked manually",
          canUndo: true,
        });
      }
    });

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setFilteredEntries(entries);
  }, [tasks]);

  // Apply filters
  const displayedEntries = filteredEntries.filter((entry) => {
    // Date filter
    if (datePreset !== "all" && !isInDateRange(entry.timestamp, datePreset)) {
      return false;
    }

    // Agent filter
    if (agentFilter !== "all" && entry.agent !== agentFilter) {
      return false;
    }

    // Status filter
    if (statusFilter !== "all" && entry.status !== statusFilter) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        entry.target.toLowerCase().includes(query) ||
        entry.action.toLowerCase().includes(query) ||
        entry.agent.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Stats
  const totalEntries = filteredEntries.length;
  const successCount = filteredEntries.filter((e) => e.status === "success").length;
  const failedCount = filteredEntries.filter((e) => e.status === "failed").length;
  const pendingCount = filteredEntries.filter((e) => e.status === "pending").length;

  // Calculate success rate
  const successRate = totalEntries > 0 ? Math.round((successCount / totalEntries) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto page-enter">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">◫</span>
          <h1 className="text-3xl font-bold text-slate-100">Action Audit Trail</h1>
        </div>
        <p className="text-slate-400">Track and review all agent actions with undo capability</p>
      </div>

      {/* Stats Cards - Improved Design */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="panel-soft p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg text-indigo-400">◫</span>
            <span className="text-sm text-slate-400 font-medium">Total Actions</span>
          </div>
          <div className="text-3xl font-bold text-slate-100">{totalEntries}</div>
          <div className="text-xs text-slate-500 mt-1">{datePreset === "all" ? "All time" : DATE_PRESETS.find(p => p.value === datePreset)?.label}</div>
        </div>
        
        <div className="panel-soft p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg text-emerald-400">✓</span>
            <span className="text-sm text-slate-400 font-medium">Successful</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">{successCount}</div>
          <div className="text-xs text-emerald-500/80 mt-1">{successRate}% success rate</div>
        </div>
        
        <div className="panel-soft p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg text-rose-400">✗</span>
            <span className="text-sm text-slate-400 font-medium">Failed</span>
          </div>
          <div className="text-3xl font-bold text-rose-400">{failedCount}</div>
          <div className="text-xs text-rose-500/80 mt-1">
            {totalEntries > 0 ? Math.round((failedCount / totalEntries) * 100) : 0}% of total
          </div>
        </div>
        
        <div className="panel-soft p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full -mr-10 -mt-10"></div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg text-amber-400">◔</span>
            <span className="text-sm text-slate-400 font-medium">Pending</span>
          </div>
          <div className="text-3xl font-bold text-amber-400">{pendingCount}</div>
          <div className="text-xs text-amber-500/80 mt-1">Awaiting completion</div>
        </div>
      </div>

      {/* Filters */}
      <div className="panel-soft p-5 mb-6">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wider">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions, targets, agents..."
              className="input-glass"
            />
          </div>
          
          {/* Date Preset */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wider">Time Range</label>
            <div className="flex gap-1 bg-slate-900/60 p-1 rounded-lg border border-white/10">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setDatePreset(preset.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    datePreset === preset.value
                      ? "bg-indigo-500/30 text-indigo-200 border border-indigo-300/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Agent Filter */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wider">Agent</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value as Assignee | "all")}
              className="input-glass min-w-[140px]"
            >
              {AGENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wider">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "success" | "failed" | "pending")}
              className="input-glass min-w-[140px]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {(datePreset !== "all" || agentFilter !== "all" || statusFilter !== "all" || searchQuery) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {searchQuery && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/20 border border-indigo-300/30 rounded-md text-xs text-indigo-200">
              Search: "{searchQuery}" <button onClick={() => setSearchQuery("")} className="hover:text-white">×</button>
            </span>
          )}
          {datePreset !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-500/20 border border-violet-300/30 rounded-md text-xs text-violet-200">
              {DATE_PRESETS.find(p => p.value === datePreset)?.label} <button onClick={() => setDatePreset("all")} className="hover:text-white">×</button>
            </span>
          )}
          {agentFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-500/20 border border-cyan-300/30 rounded-md text-xs text-cyan-200">
              {AGENT_OPTIONS.find(a => a.value === agentFilter)?.label} <button onClick={() => setAgentFilter("all")} className="hover:text-white">×</button>
            </span>
          )}
          {statusFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-500/20 border border-slate-300/30 rounded-md text-xs text-slate-200">
              {STATUS_OPTIONS.find(s => s.value === statusFilter)?.label} <button onClick={() => setStatusFilter("all")} className="hover:text-white">×</button>
            </span>
          )}
          <button 
            onClick={() => { setSearchQuery(""); setDatePreset("all"); setAgentFilter("all"); setStatusFilter("all"); }}
            className="text-xs text-slate-500 hover:text-slate-300 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Audit Trail Table */}
      <div className="panel-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/40">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Target</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Details</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Undo</th>
              </tr>
            </thead>
            <tbody>
              {displayedEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl text-slate-600">◫</span>
                      <p className="text-slate-400">No audit entries found</p>
                      <p className="text-xs text-slate-500">Try adjusting your filters or date range</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{formatTimestamp(entry.timestamp)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge badge-${entry.agent}`}>{assigneeLabel(entry.agent)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200 font-medium">{entry.action}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 max-w-[200px] truncate" title={entry.target}>
                      {entry.target}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${statusBadgeStyles[entry.status]}`}>
                        {entry.status === "success" ? "✓ " : entry.status === "failed" ? "✗ " : "◔ "}
                        {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[150px] truncate" title={entry.details}>
                      {entry.details || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.canUndo ? (
                        <button className="btn-secondary text-xs">
                          ↺ Undo
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {displayedEntries.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>Showing {displayedEntries.length} of {totalEntries} actions</span>
          <span className="text-xs">
            {datePreset !== "all" ? `Filtered by ${DATE_PRESETS.find(p => p.value === datePreset)?.label.toLowerCase()}` : "Showing all time"}
          </span>
        </div>
      )}
    </div>
  );
}
