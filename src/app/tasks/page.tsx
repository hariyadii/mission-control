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

// Visual consistency components (matching homepage)
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    suggested: { label: "SUGG", color: "text-fuchsia-300", bg: "bg-fuchsia-500/20" },
    backlog: { label: "BACKLOG", color: "text-indigo-300", bg: "bg-indigo-500/20" },
    in_progress: { label: "RUN", color: "text-cyan-300", bg: "bg-cyan-500/20" },
    blocked: { label: "BLOCK", color: "text-amber-300", bg: "bg-amber-500/20" },
    done: { label: "DONE", color: "text-emerald-300", bg: "bg-emerald-500/20" },
  };
  const c = config[status] || { label: status.slice(0, 6).toUpperCase(), color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

function AgentBadge({ agent }: { agent: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    sam: { label: "SAM", color: "text-cyan-300", bg: "bg-cyan-500/20" },
    lyra: { label: "LYRA", color: "text-violet-300", bg: "bg-violet-500/20" },
    alex: { label: "ALEX", color: "text-amber-300", bg: "bg-amber-500/20" },
    nova: { label: "NOVA", color: "text-rose-300", bg: "bg-rose-500/20" },
    ops: { label: "OPS", color: "text-slate-300", bg: "bg-slate-500/20" },
    me: { label: "ME", color: "text-emerald-300", bg: "bg-emerald-500/20" },
  };
  const c = config[agent?.toLowerCase()] || { label: agent?.slice(0, 4).toUpperCase() || "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

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

// Hover Preview Component - shows task details on hover with 200ms delay
function TaskCardHoverPreview({ 
  task, 
  onMove,
  onDelete 
}: { 
  task: Task;
  onMove: (taskId: string, status: TaskStatus) => void;
  onDelete: (taskId: string) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<"left" | "right">("right");
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const isRight = rect.left > window.innerWidth / 2;
    setPosition(isRight ? "left" : "right");
    showTimer = setTimeout(() => setIsVisible(true), 200);
  };

  const handleMouseLeave = () => {
    if (showTimer) clearTimeout(showTimer);
    hideTimer = setTimeout(() => setIsVisible(false), 150);
  };

  const handleMouseEnterPreview = () => {
    if (hideTimer) clearTimeout(hideTimer);
    setIsVisible(true);
  };

  const handleMouseLeavePreview = () => {
    hideTimer = setTimeout(() => setIsVisible(false), 150);
  };

  const createdDate = task.created_at ? new Date(task.created_at).toLocaleDateString() : "—";

  return (
    <div 
      className="relative inline-block w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hover Preview Panel */}
      {isVisible && (
        <div 
          className={`absolute top-0 z-50 w-64 p-3 panel-glass border border-white/20 rounded-lg shadow-xl ${
            position === "right" ? "left-full ml-2" : "right-full mr-2"
          }`}
          onMouseEnter={handleMouseEnterPreview}
          onMouseLeave={handleMouseLeavePreview}
        >
          <div className="space-y-2">
            {/* Title */}
            <div className="text-xs font-semibold text-slate-100 line-clamp-2">
              {task.title}
            </div>
            
            {/* Description */}
            <div className="text-[10px] text-slate-400 line-clamp-3">
              {task.description?.replace(/[#*_\-`]/g, "").slice(0, 150) || "No description"}
            </div>
            
            {/* Meta */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <StatusBadge status={task.status} />
              <AgentBadge agent={task.assigned_to} />
            </div>
            
            {/* Date */}
            <div className="text-[9px] text-slate-500">
              Created: {createdDate}
            </div>
            
            {/* Quick Actions Hint */}
            <div className="text-[9px] text-cyan-500/70 pt-1">
              Click to view • Drag to move
            </div>
          </div>
        </div>
      )}
      
      {/* The card content - this is what gets rendered normally */}
      <div className="panel-glass p-2 text-xs group cursor-pointer">
        <div className="flex items-start justify-between gap-1">
          <span className="text-slate-200 flex-1 line-clamp-2" title={task.title}>{task.title}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(String(task._id)); }}
            className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300 transition-opacity"
          >
            ×
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <AgentBadge agent={task.assigned_to} />
          <select
            value={task.status}
            onChange={(e) => onMove(String(task._id), e.target.value as TaskStatus)}
            className="flex-1 bg-slate-800/50 border border-white/10 rounded px-1 py-0.5 text-[9px] text-slate-400 focus:outline-none"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: "suggested", label: "Suggested", icon: "✦", color: "text-fuchsia-300", bg: "bg-fuchsia-500/20" },
  { key: "backlog", label: "Backlog", icon: "◌", color: "text-indigo-300", bg: "bg-indigo-500/20" },
  { key: "in_progress", label: "Running", icon: "◔", color: "text-cyan-300", bg: "bg-cyan-500/20" },
  { key: "blocked", label: "Blocked", icon: "⛔", color: "text-amber-300", bg: "bg-amber-500/20" },
  { key: "done", label: "Done", icon: "●", color: "text-emerald-300", bg: "bg-emerald-500/20" },
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
];
const LYRA_CORE_PLATFORM_KEYWORDS = [
  "capital",
  "trading",
  "trade",
  "position",
  "paper",
  "portfolio",
  "signal",
  "backtest",
  "strategy",
  "equity",
];
const ALEX_CORE_KEYWORDS = [
  "coordinator",
  "coordinating",
  "routing",
  "memory",
  "knowledge",
  "alignment",
];

function inferAssignee(title: string, description: string | undefined): Assignee {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (SAM_CORE_PLATFORM_KEYWORDS.some((k) => text.includes(k))) return "sam";
  if (LYRA_CORE_PLATFORM_KEYWORDS.some((k) => text.includes(k))) return "lyra";
  if (ALEX_CORE_KEYWORDS.some((k) => text.includes(k))) return "alex";
  return "sam";
}

function getDraftHealth(): DraftHealth {
  return { status: "ok" };
}

export default function TasksPage() {
  const tasks = useQuery(api.tasks.list);
  const createTask = useMutation(api.tasks.create);
  const updateStatus = useMutation(api.tasks.updateStatus);
  const updateTask = useMutation(api.tasks.updateTask);
  const removeTask = useMutation(api.tasks.remove);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterAssignee, setFilterAssignee] = useState<Assignee | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [draftHealth, setDraftHealth] = useState<DraftHealth>({ status: "ok" });

  useEffect(() => {
    setLastUpdate(Date.now());
    setDraftHealth(getDraftHealth());
  }, [tasks]);

  const filteredTasks = (tasks ?? []).filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAssignee !== "all" && t.assigned_to !== filterAssignee) return false;
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const tasksByStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.key] = filteredTasks.filter((t) => t.status === col.key);
      return acc;
    },
    {} as Record<string, Task[]>
  );

  const handleCreate = async (status: TaskStatus) => {
    const title = prompt(`Enter task title for ${status}:`);
    if (!title) return;
    const suggestedAssignee = inferAssignee(title, undefined);
    const assignee = confirm(`Assign to ${assigneeLabel(suggestedAssignee)}?`) ? suggestedAssignee : "sam";
    await createTask({
      title,
      assigned_to: assignee,
      status,
    });
  };

  const handleMove = async (taskId: string, newStatus: TaskStatus) => {
    await updateStatus({ id: taskId as Id<"tasks">, status: newStatus });
  };

  const handleAssign = async (taskId: string, assignee: Assignee) => {
    await updateTask({ id: taskId as Id<"tasks">, assigned_to: assignee });
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    await removeTask({ id: taskId as Id<"tasks"> });
  };

  const totalCount = filteredTasks.length;
  const doneCount = tasksByStatus["done"]?.length || 0;

  return (
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Tasks</h1>
          <p className="text-xs text-slate-400">Pipeline kanban</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
          <span className="text-xs text-slate-500">
            {totalCount} tasks • {doneCount} done
          </span>
        </div>
      </header>

      {/* FILTER BAR - Consistent with homepage */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 panel-glass">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[120px] bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
        />
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value as Assignee | "all")}
          className="bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All Agents</option>
          {ASSIGNEE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All Status</option>
          {COLUMNS.map((col) => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>
        <button
          onClick={() => { setFilterStatus("all"); setFilterAssignee("all"); setSearchQuery(""); }}
          className="px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition"
        >
          Clear
        </button>
      </div>

      {/* KANBAN GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col">
            {/* Column Header */}
            <div className={`flex items-center justify-between px-2 py-2 rounded-t-lg ${col.bg}`}>
              <div className="flex items-center gap-1.5">
                <span className={col.color}>{col.icon}</span>
                <span className="text-xs font-semibold text-slate-200">{col.label}</span>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${col.color} bg-slate-900/50`}>
                {tasksByStatus[col.key]?.length || 0}
              </span>
            </div>
            
            {/* Tasks List */}
            <div className="flex-1 space-y-1.5 p-2 panel-soft min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto">
              {(tasksByStatus[col.key] || []).map((task) => (
                <TaskCardHoverPreview 
                  key={String(task._id)} 
                  task={task}
                  onMove={handleMove}
                  onDelete={handleDelete}
                />
              ))}
              
              {/* Add Task Button */}
              <button
                onClick={() => handleCreate(col.key as TaskStatus)}
                className="w-full py-1.5 text-[10px] text-slate-500 hover:text-slate-300 border border-dashed border-white/10 rounded-lg hover:border-white/30 transition"
              >
                + Add task
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
