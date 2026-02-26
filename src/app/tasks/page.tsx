"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type Assignee = "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";
type TaskStatus = "suggested" | "backlog" | "in_progress" | "blocked" | "done";

type FilterStatus = "all" | TaskStatus;

type Task = {
  _id: Id<"tasks">;
  _creationTime?: number;
  title: string;
  description?: string;
  status: TaskStatus;
  assigned_to: Assignee;
  created_at: string;
};

type DraftHealth = {
  status: "ok" | "missing";
  reason?: string | null;
};

const COLUMNS = [
  { key: "suggested", label: "Suggested", icon: "✦" },
  { key: "backlog", label: "Backlog", icon: "◌" },
  { key: "in_progress", label: "In Progress", icon: "◔" },
  { key: "blocked", label: "Blocked", icon: "⛔" },
  { key: "done", label: "Done", icon: "●" },
];

const STATUS_ORDER: TaskStatus[] = ["suggested", "backlog", "in_progress", "blocked", "done"];

const ASSIGNEE_OPTIONS: { value: Assignee; label: string }[] = [
  { value: "me", label: "Me" },
  { value: "alex", label: "Alex" },
  { value: "sam", label: "Sam" },
  { value: "lyra", label: "Lyra" },
  { value: "nova", label: "Nova" },
  { value: "ops", label: "Ops" },
  { value: "agent", label: "Agent (Legacy)" },
];

function assigneeLabel(value: string) {
  const v = value.toLowerCase();
  if (v === "alex") return "Alex";
  if (v === "sam") return "Sam";
  if (v === "me") return "Me";
  if (v === "lyra") return "Lyra";
  if (v === "nova") return "Nova";
  if (v === "ops") return "Ops";
  if (v === "agent") return "Agent";
  return value;
}

function assigneeClass(value: string) {
  const v = value.toLowerCase();
  if (v === "alex") return "badge badge-alex";
  if (v === "sam") return "badge badge-sam";
  if (v === "me") return "badge badge-me";
  if (v === "lyra") return "badge badge-lyra";
  if (v === "nova") return "badge badge-nova";
  if (v === "ops") return "badge badge-me";
  return "badge badge-legacy";
}

const SAM_CORE_PLATFORM_KEYWORDS = [
  "mission control",
  "autonomy",
  "workflow",
  "guardrail",
  "cron",
  "control center",
  "dashboard",
  "api",
  "task engine",
  "execution",
  "validator",
  "lease",
  "heartbeat",
  "retry",
  "schema",
  "convex",
  "plugin",
  "pipeline",
];

function samScope(task: Pick<Task, "assigned_to" | "title" | "description">): "core" | "secondary" | null {
  if (task.assigned_to !== "sam") return null;
  const combined = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return SAM_CORE_PLATFORM_KEYWORDS.some((kw) => combined.includes(kw)) ? "core" : "secondary";
}

function scopeBadgeClass(scope: "core" | "secondary") {
  if (scope === "core") return "rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-200";
  return "rounded-full border border-amber-300/45 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200";
}

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatBlockedDuration(createdAt: string | undefined): string {
  if (!createdAt) return "";
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diff = now - created;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

function requiresDraft(assignee: Assignee) {
  return assignee === "alex" || assignee === "sam" || assignee === "lyra" || assignee === "nova" || assignee === "ops";
}

function inferDraftFromDescription(description?: string): DraftHealth | undefined {
  const text = String(description ?? "");
  if (/Draft validation:\s*pass/i.test(text)) return { status: "ok" };
  if (/Draft validation:\s*fail/i.test(text)) return { status: "missing" };
  return undefined;
}

function extractBlockedReason(description?: string): string | null {
  if (!description) return null;
  const text = String(description);
  // Match blocked_reason: <reason> in description
  const match = text.match(/blocked_reason:\s*([^\n]+)/i);
  if (match) return match[1].trim();
  // Also check for common patterns
  if (/waiting for/i.test(text)) return "waiting for external dependency";
  if (/dependency not ready/i.test(text)) return "dependency not ready";
  return null;
}

// Unblock Modal - captures reason for unblocking a blocked task
function UnblockModal({
  task,
  onClose,
  onUnblock,
}: {
  task: Task;
  onClose: () => void;
  onUnblock: (id: Id<"tasks">, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [unblocking, setUnblocking] = useState(false);

  const handleUnblock = async () => {
    setUnblocking(true);
    try {
      await onUnblock(task._id, reason.trim());
      onClose();
    } finally {
      setUnblocking(false);
    }
  };

  const commonReasons = [
    "Dependency resolved",
    "External dependency available",
    "Information provided",
    "Resource acquired",
    "Decision made",
    "Other",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 px-4 pt-[10vh]" onClick={onClose}>
      <div className="panel-glass w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-400/40">
            <span className="text-xl">✓</span>
          </div>
          <div>
            <h3 className="m-0 text-lg font-semibold text-slate-100">Unblock Task</h3>
            <p className="m-0 text-xs text-slate-400">Capture why this task is no longer blocked</p>
          </div>
        </div>

        <div className="mb-5">
          <p className="m-0 text-sm font-medium text-slate-200 mb-2">Task: <span className="text-slate-300">{task.title}</span></p>
          
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Reason for unblocking
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe what resolved the blocking issue..."
            rows={3}
            className="input-glass resize-y"
            autoFocus
          />
        </div>

        <div className="mb-5">
          <p className="m-0 text-xs text-slate-500 mb-2">Quick select:</p>
          <div className="flex flex-wrap gap-2">
            {commonReasons.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  reason === r
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                    : "border-slate-600 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleUnblock} disabled={unblocking || !reason.trim()} className="btn-primary bg-emerald-600 hover:bg-emerald-500">
            {unblocking ? "Unblocking..." : "Unblock Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({
  task,
  onClose,
  onSave,
}: {
  task: Task;
  onClose: () => void;
  onSave: (id: Id<"tasks">, title: string, description: string, assigned_to: Assignee) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignedTo, setAssignedTo] = useState<Assignee>(task.assigned_to);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave(task._id, title.trim(), description.trim(), assignedTo);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 px-4 pt-[10vh]" onClick={onClose}>
      <div className="panel-glass w-full max-w-xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 text-lg font-semibold text-slate-100">Edit Task</h3>
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-glass" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-glass resize-y"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Assignee</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value as Assignee)} className="input-glass">
              {ASSIGNEE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const tasks = useQuery(api.tasks.list);
  const createTask = useMutation(api.tasks.create);
  const updateStatus = useMutation(api.tasks.updateStatus);
  const updateTask = useMutation(api.tasks.updateTask);
  const removeTask = useMutation(api.tasks.remove);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<Assignee>("me");
  const [adding, setAdding] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [unblockingTask, setUnblockingTask] = useState<Task | null>(null);
  const [draftHealthByTask, setDraftHealthByTask] = useState<Record<string, DraftHealth>>({});
  const [currentTime, setCurrentTime] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  // Status filter options
  const FILTER_OPTIONS: { value: FilterStatus; label: string; icon: string }[] = [
    { value: "all", label: "All", icon: "◈" },
    { value: "suggested", label: "Suggested", icon: "✦" },
    { value: "backlog", label: "Backlog", icon: "◌" },
    { value: "in_progress", label: "In Progress", icon: "◔" },
    { value: "blocked", label: "Blocked", icon: "⛔" },
    { value: "done", label: "Done", icon: "●" },
  ];

  useEffect(() => {
    // Update time every minute
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-US", { 
        hour: "2-digit", 
        minute: "2-digit",
        timeZone: "Asia/Jakarta"
      }));
    };
    updateTime();
    const id = setInterval(updateTime, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDraftHealth = async () => {
      try {
        const response = await fetch("/api/drafts/status", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as {
          ok: boolean;
          items?: Array<{ id: string; status: "ok" | "missing"; reason?: string | null }>;
        };
        if (!json.ok || cancelled) return;
        const next: Record<string, DraftHealth> = {};
        for (const item of json.items ?? []) {
          next[item.id] = { status: item.status, reason: item.reason };
        }
        setDraftHealthByTask(next);
      } catch {
        // ignore; keep last successful snapshot
      }
    };

    void loadDraftHealth();
    const intervalId = setInterval(loadDraftHealth, 20000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      await createTask({ title: title.trim(), description: description.trim() || undefined, assigned_to: assignedTo });
      setTitle("");
      setDescription("");
    } finally {
      setAdding(false);
    }
  };

  const moveTask = async (task: Task, dir: -1 | 1) => {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = STATUS_ORDER[idx + dir];
    if (next) await updateStatus({ id: task._id, status: next });
  };

  const handleUpdateTask = async (id: Id<"tasks">, t: string, desc: string, assigned: Assignee) => {
    await updateTask({
      id,
      title: t || undefined,
      description: desc || undefined,
      assigned_to: assigned || undefined,
    });
  };

  // Handle unblocking a task with reason capture
  const handleUnblock = async (id: Id<"tasks">, reason: string) => {
    // Get the current task description
    const task = tasks?.find((t) => String(t._id) === String(id));
    if (!task) return;
    
    // Append the unblock reason to the description
    const currentDesc = task.description ?? "";
    const unblockNote = `\n\n**Unblocked:** ${reason} (${new Date().toLocaleString()})`;
    const newDesc = currentDesc + unblockNote;
    
    await updateTask({
      id,
      description: newDesc,
    });
    
    // Move to backlog
    await updateStatus({ id, status: "backlog" });
  };

  // Determine which columns to show based on filter
  const visibleColumns = statusFilter === "all" 
    ? COLUMNS 
    : COLUMNS.filter(col => col.key === statusFilter);

  const grouped = visibleColumns.reduce((acc, col) => {
    const filtered = (tasks ?? []).filter((t) => t.status === col.key);
    // Sort done tasks newest first
    if (col.key === "done") {
      filtered.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
    }
    acc[col.key] = filtered;
    return acc;
  }, {} as Record<string, Task[]>);

  return (
    <div className="space-y-6">
      {editingTask && <EditModal task={editingTask} onClose={() => setEditingTask(null)} onSave={handleUpdateTask} />}
      {unblockingTask && <UnblockModal task={unblockingTask} onClose={() => setUnblockingTask(null)} onUnblock={handleUnblock} />}

      <header className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Kanban execution board with live Convex sync.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Sam scope badges:</span>
            <span className={scopeBadgeClass("core")}>Core</span>
            <span className={scopeBadgeClass("secondary")}>Secondary</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Blocked task ratio indicator - enhanced with more prominence */}
          {tasks && (() => {
            const total = tasks.filter(t => t.status === "backlog" || t.status === "in_progress" || t.status === "blocked").length;
            const blocked = tasks.filter(t => t.status === "blocked").length;
            const ratio = total > 0 ? Math.round((blocked / total) * 100) : 0;
            const isCritical = ratio >= 50;
            const isWarning = ratio >= 35 && ratio < 50;
            const statusClass = isCritical 
              ? "bg-rose-500/25 border-rose-400/50" 
              : isWarning 
                ? "bg-amber-500/20 border-amber-400/40"
                : "bg-slate-800/60 border-transparent";
            const textClass = isCritical 
              ? "text-rose-300" 
              : isWarning 
                ? "text-amber-300"
                : "text-slate-200";
            const iconClass = isCritical 
              ? "text-rose-400 animate-pulse" 
              : isWarning 
                ? "text-amber-400"
                : "text-slate-400";
            return (
              <button
                onClick={() => setStatusFilter(isCritical || isWarning ? "blocked" : "all")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 transition hover:scale-105 border ${statusClass} ${
                  isCritical || isWarning ? "shadow-[0_0_12px_rgba(239,68,68,0.15)]" : ""
                }`}
                title={isCritical ? "Critical: Click to view blocked tasks" : isWarning ? "Warning: Click to view" : "Click to view all tasks"}
              >
                <span className={`text-lg ${iconClass}`}>⛔</span>
                <div className="flex flex-col items-start">
                  <span className={`text-sm font-bold ${textClass}`}>
                    {blocked} blocked
                  </span>
                  <span className={`text-xs font-semibold ${iconClass}`}>
                    {ratio}% of {total} active
                  </span>
                </div>
                {(isCritical || isWarning) && (
                  <span className={`text-[10px] font-bold uppercase tracking-wide ml-1 ${
                    isCritical ? "text-rose-400" : "text-amber-400"
                  }`}>
                    {isCritical ? "CRITICAL" : "WARNING"}
                  </span>
                )}
              </button>
            );
          })()}
          {currentTime && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5">
              <span className="text-sm text-slate-400">🕐</span>
              <span className="text-sm font-medium text-slate-200">{currentTime}</span>
              <span className="text-xs text-slate-500">ICT</span>
            </div>
          )}
        </div>
      </header>

      {/* Quick Unblock Panel - shows all blocked tasks with quick actions, sorted by oldest first */}
      {tasks && tasks.filter(t => t.status === "blocked").length > 0 && (
        <div className="panel-glass border-l-4 border-l-rose-500 bg-gradient-to-r from-rose-500/5 to-transparent p-4 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/20 border border-rose-400/40">
              <span className="text-rose-400 text-lg">⚡</span>
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-rose-300">Quick Unblock</h2>
              <p className="text-xs text-rose-400/60">Resolve blocked tasks to reduce workflow bottleneck</p>
            </div>
            <span className="ml-auto rounded-full bg-rose-500/20 border border-rose-400/40 px-3 py-1 text-xs font-bold text-rose-300">
              {tasks.filter(t => t.status === "blocked").length} tasks
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Sort blocked tasks by creation time (oldest first) */}
            {tasks
              .filter(t => t.status === "blocked")
              .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))
              .map(task => {
              const reason = extractBlockedReason(task.description);
              const blockedDuration = formatBlockedDuration(task.created_at);
              const isLongBlocked = blockedDuration.includes("d") || (blockedDuration.includes("h") && parseInt(blockedDuration) > 12);
              return (
                <div key={String(task._id)} className="flex items-center gap-3 rounded-lg bg-rose-500/10 border border-rose-400/30 px-4 py-3 hover:bg-rose-500/15 transition-all hover:shadow-[0_0_12px_rgba(244,63,94,0.15)]">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-200 line-clamp-1">{task.title}</p>
                      {/* Blocked duration badge - more prominent for long-blocked tasks */}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isLongBlocked 
                          ? "bg-rose-500/40 border border-rose-400/60 text-rose-100 animate-pulse" 
                          : "bg-slate-700/60 border border-slate-500/40 text-slate-300"
                      }`}>
                        {blockedDuration}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-rose-300/70">{reason || "No reason specified"}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        task.assigned_to === 'alex' ? 'bg-purple-500/20 text-purple-300' :
                        task.assigned_to === 'sam' ? 'bg-blue-500/20 text-blue-300' :
                        task.assigned_to === 'lyra' ? 'bg-green-500/20 text-green-300' :
                        task.assigned_to === 'nova' ? 'bg-pink-500/20 text-pink-300' :
                        'bg-slate-600/40 text-slate-400'
                      }`}>
                        {assigneeLabel(task.assigned_to)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setUnblockingTask(task)}
                      className="rounded bg-emerald-500/30 border border-emerald-400/50 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/50 transition flex items-center gap-1"
                    >
                      <span>⚡</span> Unblock
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void updateStatus({ id: task._id, status: "backlog" });
                      }}
                      className="rounded bg-slate-700/50 border border-slate-500/50 px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600/50 transition"
                      title="Move to backlog without reason"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Dependency Visualizer - shows blocking relationships */}
      {tasks && tasks.filter(t => t.status === "blocked").length > 0 && (
        <div className="panel-glass border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/5 to-transparent p-4 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 border border-amber-400/40">
              <span className="text-amber-400 text-lg">🔗</span>
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-amber-300">Dependency Graph</h2>
              <p className="text-xs text-amber-400/60">Visual map of blocking relationships (blocked → blocker)</p>
            </div>
          </div>
          
          {/* Extract dependency info from blocked task descriptions */}
          <div className="relative overflow-x-auto">
            <div className="flex flex-wrap gap-3 items-start">
              {/* Show blocked tasks as nodes with their blockers */}
              {tasks
                .filter(t => t.status === "blocked")
                .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))
                .map((blockedTask, idx) => {
                  // Try to extract what this task is waiting for
                  const reason = extractBlockedReason(blockedTask.description);
                  const blockedDuration = formatBlockedDuration(blockedTask.created_at);
                  
                  return (
                    <div key={String(blockedTask._id)} className="flex items-center gap-2">
                      {/* Blocked node */}
                      <div className="flex flex-col items-center">
                        <div className="rounded-lg bg-rose-500/20 border border-rose-400/40 px-3 py-2 min-w-[120px] max-w-[180px]">
                          <p className="text-xs font-semibold text-rose-200 line-clamp-2 text-center">{blockedTask.title}</p>
                          <p className="text-[10px] text-rose-400/70 text-center mt-1">{blockedDuration}</p>
                        </div>
                        <div className="h-6 w-0.5 bg-rose-500/50"></div>
                        <div className="rounded-full bg-rose-500/40 border border-rose-400/60 p-1">
                          <span className="text-rose-300 text-xs">⛔</span>
                        </div>
                      </div>
                      
                      {/* Arrow connector */}
                      <div className="flex items-center justify-center h-8">
                        <span className="text-amber-400 text-lg">→</span>
                      </div>
                      
                      {/* Blocker node - what it's waiting for */}
                      <div className="rounded-lg bg-slate-700/60 border border-slate-500/40 px-3 py-2 min-w-[140px] max-w-[200px]">
                        <p className="text-xs font-medium text-slate-300 line-clamp-2">
                          {reason || "External dependency"}
                        </p>
                        <div className="flex items-center justify-center gap-1 mt-2">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            blockedTask.assigned_to === 'alex' ? 'bg-purple-500/20 text-purple-300' :
                            blockedTask.assigned_to === 'sam' ? 'bg-blue-500/20 text-blue-300' :
                            blockedTask.assigned_to === 'lyra' ? 'bg-green-500/20 text-green-300' :
                            blockedTask.assigned_to === 'nova' ? 'bg-pink-500/20 text-pink-300' :
                            'bg-slate-600/40 text-slate-400'
                          }`}>
                            {assigneeLabel(blockedTask.assigned_to)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Connector arrow if not last */}
                      {idx < tasks.filter(t => t.status === "blocked").length - 1 && (
                        <div className="hidden sm:flex items-center justify-center h-8 mx-2">
                          <span className="text-slate-600 text-lg">|||</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            
            {/* Summary stats */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500/60"></span>
                  <span className="text-slate-400">
                    <span className="font-semibold text-rose-300">{tasks.filter(t => t.status === "blocked").length}</span> blocked
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500/60"></span>
                  <span className="text-slate-400">
                    <span className="font-semibold text-amber-300">{tasks.filter(t => t.status === "in_progress").length}</span> in progress
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500/60"></span>
                  <span className="text-slate-400">
                    <span className="font-semibold text-emerald-300">{tasks.filter(t => t.status === "backlog").length}</span> backlog
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="panel-glass p-5">
        <div className="task-form-row flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              required
              className="input-glass"
            />
          </div>
          <div className="min-w-[260px] flex-[2]">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="input-glass"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Assignee</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value as Assignee)} className="input-glass">
              {ASSIGNEE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={adding} className="btn-primary">
            {adding ? "Adding..." : "Add Task"}
          </button>
        </div>
      </form>

      {/* Status Filter Tabs */}
      <div className="panel-glass p-2">
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === filter.value
                  ? "bg-indigo-500/20 text-indigo-200 border border-indigo-300/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <span>{filter.icon}</span>
              <span>{filter.label}</span>
              {filter.value !== "all" && (
                <span className="ml-0.5 rounded-full bg-slate-800/60 px-1.5 py-0.5 text-[10px]">
                  {(tasks ?? []).filter(t => t.status === filter.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={`kanban-grid grid grid-cols-1 gap-4 ${statusFilter === "all" ? "xl:grid-cols-5" : "xl:grid-cols-1"}`}>
        {visibleColumns.map((col) => (
          <section key={col.key} className="panel-glass p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-slate-300">{col.icon}</span>
              <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-100">{col.label}</h2>
              <span className="ml-auto rounded-full border border-white/15 bg-slate-800/70 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                {grouped[col.key]?.length ?? 0}
              </span>
            </div>

            <div className={`space-y-2.5 ${col.key === "done" || col.key === "blocked" ? "max-h-[420px] overflow-y-auto pr-1" : ""}`}>
              {/* Sort blocked tasks by oldest first for priority attention */}
              {(col.key === "blocked" 
                ? [...(grouped[col.key] ?? [])].sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))
                : grouped[col.key]
              )?.map((task) => {
                const scope = samScope(task);
                const liveDraft = draftHealthByTask[String(task._id)];
                const inferredDraft = inferDraftFromDescription(task.description);
                const draftHealth = liveDraft ?? inferredDraft;
                return (
                <article
                  key={task._id}
                  onClick={() => setEditingTask(task)}
                  className={`panel-soft cursor-pointer p-3 transition hover:border-indigo-300/40 hover:bg-slate-800/70 ${task.status === "blocked" ? "border-l-4 border-l-rose-500/70 bg-rose-500/5" : ""}`}
                >
                  {task.status === "blocked" && (
                    <div className="mb-2 rounded-lg bg-gradient-to-r from-rose-500/20 to-rose-600/10 border border-rose-400/30 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-rose-400">⛔</span>
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-300">Blocked</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Blocked duration badge - prominent for visibility */}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            formatBlockedDuration(task.created_at).includes("d")
                              ? "bg-rose-500/50 border border-rose-400/70 text-rose-100" 
                              : "bg-rose-500/30 border border-rose-400/50 text-rose-200"
                          }`}>
                            {formatBlockedDuration(task.created_at)}
                          </span>
                          <span className="text-[10px] font-medium text-rose-400/70 uppercase">Action Required</span>
                        </div>
                      </div>
                      {extractBlockedReason(task.description) && (
                        <p className="m-0 mt-2 text-xs text-rose-200/90 leading-relaxed">
                          <span className="font-semibold">Reason:</span> {extractBlockedReason(task.description)}
                        </p>
                      )}
                      <p className="m-0 mt-2 text-[10px] text-rose-300/60">
                        Click "⚡ Unblock" to resolve and move to backlog
                      </p>
                    </div>
                  )}
                  <p className="m-0 line-clamp-2 text-sm font-semibold leading-snug text-slate-100">{task.title}</p>
                  {task.description && (
                    <p className="m-0 mt-1.5 line-clamp-3 text-xs leading-relaxed text-[color:var(--text-muted)]">
                      {task.description}
                    </p>
                  )}

                  {/* Badges row */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className={assigneeClass(task.assigned_to)}>{assigneeLabel(task.assigned_to)}</span>
                    <span className="text-xs text-slate-500" title={task.created_at}>
                      {formatRelativeTime(task._creationTime)}
                    </span>
                    {scope && (
                      <span className={scopeBadgeClass(scope)}>
                        {scope === "core" ? "Core" : "Secondary"}
                      </span>
                    )}
                    {requiresDraft(task.assigned_to) && task.status !== "suggested" && (
                      <span
                        className={
                          draftHealth?.status === "ok"
                            ? "rounded-full border border-emerald-300/45 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200"
                            : draftHealth?.status === "missing"
                              ? "rounded-full border border-rose-300/45 bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-200"
                              : "rounded-full border border-slate-300/30 bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300"
                        }
                        title={
                          draftHealth?.status === "ok"
                            ? "Draft requirement satisfied"
                            : draftHealth?.status === "missing"
                              ? `Draft missing or invalid${draftHealth.reason ? ` (${draftHealth.reason})` : ""}`
                              : "Checking draft status..."
                        }
                      >
                        Draft: {draftHealth?.status === "ok" ? "OK" : draftHealth?.status === "missing" ? "Missing" : "..."}
                      </span>
                    )}
                  </div>

                  {/* Action buttons row */}
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                    {task.status === "blocked" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUnblockingTask(task);
                        }}
                        title="Unblock this task"
                        className="rounded bg-emerald-500/20 border border-emerald-400/50 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition flex items-center gap-1"
                      >
                        <span>⚡</span> Unblock
                      </button>
                    )}
                    {task.status === "suggested" ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void updateStatus({ id: task._id, status: "backlog" });
                          }}
                          title="Approve into Backlog"
                          className="btn-primary px-2.5 py-1 text-xs"
                        >
                          Approve
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeTask({ id: task._id });
                          }}
                          title="Dismiss suggestion"
                          className="btn-secondary px-2.5 py-1 text-xs"
                        >
                          Dismiss
                        </button>
                      </>
                    ) : (
                      <>
                        {["in_progress", "blocked", "done"].includes(task.status) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveTask(task, -1);
                            }}
                            title="Move left"
                            className="btn-secondary px-2.5 py-1 text-xs"
                          >
                            ←
                          </button>
                        )}
                        {["backlog", "in_progress", "blocked"].includes(task.status) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveTask(task, 1);
                            }}
                            title="Move right"
                            className="btn-secondary px-2.5 py-1 text-xs"
                          >
                            →
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeTask({ id: task._id });
                          }}
                          title="Delete"
                          className="btn-danger"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
                );
              })}

              {(!grouped[col.key] || grouped[col.key].length === 0) && (
                <div className="panel-soft p-6 text-center text-sm text-slate-400">No tasks</div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
