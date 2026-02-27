"use client";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  FreshnessIndicator,
  AgentBadge,
  StatusBadge,
  PageHeader,
  FilterInput,
  FilterSelect,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Constants ──────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskStatus; label: string; dotColor: string; badgeColor: string }[] = [
  { key: "suggested",  label: "Suggested", dotColor: "bg-fuchsia-400", badgeColor: "text-fuchsia-300 bg-fuchsia-500/20" },
  { key: "backlog",    label: "Backlog",   dotColor: "bg-indigo-400",  badgeColor: "text-indigo-300 bg-indigo-500/20"   },
  { key: "in_progress",label: "Running",   dotColor: "bg-cyan-400 animate-pulse", badgeColor: "text-cyan-300 bg-cyan-500/20" },
  { key: "blocked",    label: "Blocked",   dotColor: "bg-amber-400",   badgeColor: "text-amber-300 bg-amber-500/20"     },
  { key: "done",       label: "Done",      dotColor: "bg-emerald-400", badgeColor: "text-emerald-300 bg-emerald-500/20" },
];

const STATUS_ORDER: TaskStatus[] = ["suggested", "backlog", "in_progress", "blocked", "done"];

const ASSIGNEE_OPTIONS: { value: Assignee; label: string }[] = [
  { value: "me",    label: "Me"           },
  { value: "alex",  label: "Alex"         },
  { value: "sam",   label: "Sam"          },
  { value: "lyra",  label: "Lyra"         },
  { value: "nova",  label: "Nova"         },
  { value: "ops",   label: "Ops"          },
  { value: "agent", label: "Agent (legacy)"},
];

// ── Smart assignee inference ───────────────────────────────────────────────

const SAM_KW   = ["mission control","autonomy","workflow","guardrail","cron","control center","dashboard","api","task engine","execution"];
const LYRA_KW  = ["capital","trading","trade","position","paper","portfolio","signal","backtest","strategy","equity"];
const ALEX_KW  = ["coordinator","coordinating","routing","memory","knowledge","alignment"];

function inferAssignee(title: string, description?: string): Assignee {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (SAM_KW.some((k) => text.includes(k)))  return "sam";
  if (LYRA_KW.some((k) => text.includes(k))) return "lyra";
  if (ALEX_KW.some((k) => text.includes(k))) return "alex";
  return "sam";
}

function assigneeLabel(v: string) {
  const map: Record<string, string> = { alex:"Alex", sam:"Sam", me:"Me", lyra:"Lyra", nova:"Nova", ops:"Ops", agent:"Agent" };
  return map[v.toLowerCase()] ?? v;
}

// ── Hover-preview card ─────────────────────────────────────────────────────

function TaskCard({
  task,
  onMove,
  onDelete,
}: {
  task: Task;
  onMove: (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  let showT: ReturnType<typeof setTimeout> | null = null;
  let hideT: ReturnType<typeof setTimeout> | null = null;

  const enter = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSide(r.left > window.innerWidth / 2 ? "left" : "right");
    showT = setTimeout(() => setPreviewVisible(true), 220);
  };
  const leave = () => { if (showT) clearTimeout(showT); hideT = setTimeout(() => setPreviewVisible(false), 160); };
  const previewEnter = () => { if (hideT) clearTimeout(hideT); };
  const previewLeave = () => { hideT = setTimeout(() => setPreviewVisible(false), 160); };

  const createdDate = task.created_at ? new Date(task.created_at).toLocaleDateString() : "—";

  return (
    <div className="relative w-full" onMouseEnter={enter} onMouseLeave={leave}>
      {/* Preview popup */}
      {previewVisible && (
        <div
          className={`absolute top-0 z-50 w-60 p-3 panel-glass border border-white/15 rounded-lg shadow-2xl ${
            side === "right" ? "left-full ml-2" : "right-full mr-2"
          }`}
          onMouseEnter={previewEnter}
          onMouseLeave={previewLeave}
        >
          <p className="text-xs font-semibold text-slate-100 line-clamp-2 mb-1.5">{task.title}</p>
          <p className="text-[10px] text-slate-400 line-clamp-3 mb-2">
            {task.description?.replace(/[#*_\-`]/g, "").slice(0, 140) || "No description"}
          </p>
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/8">
            <StatusBadge status={task.status} size="xs" />
            <AgentBadge agent={task.assigned_to} size="xs" />
          </div>
          <p className="text-[9px] text-slate-600 mt-1">Created {createdDate}</p>
        </div>
      )}

      {/* Card */}
      <div className="panel-soft p-2 text-xs group cursor-default">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-slate-200 flex-1 line-clamp-2 leading-snug" title={task.title}>
            {task.title}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(String(task._id)); }}
            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-all ml-1 shrink-0 text-sm leading-none"
            aria-label="Delete task"
          >
            ×
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <AgentBadge agent={task.assigned_to} size="xs" />
          <select
            value={task.status}
            onChange={(e) => onMove(String(task._id), e.target.value as TaskStatus)}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-slate-900/60 border border-white/8 rounded px-1 py-0.5 text-[9px] text-slate-400 focus:outline-none focus:border-indigo-400/50 cursor-pointer"
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

// ── Page ───────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const tasks        = useQuery(api.tasks.list);
  const createTask   = useMutation(api.tasks.create);
  const updateStatus = useMutation(api.tasks.updateStatus);
  const updateTask   = useMutation(api.tasks.updateTask);
  const removeTask   = useMutation(api.tasks.remove);
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>(() => (searchParams.get("status") as FilterStatus) || "all");
  const [filterAssignee, setFilterAssignee] = useState<Assignee | "all">(() => (searchParams.get("assignee") as Assignee | "all") || "all");
  const [searchQuery,    setSearchQuery]    = useState(() => searchParams.get("q") || "");
  const [dateFrom,       setDateFrom]       = useState(() => searchParams.get("from") || "");
  const [dateTo,         setDateTo]         = useState(() => searchParams.get("to") || "");
  const [showDates,      setShowDates]      = useState(false);
  const [lastUpdate,     setLastUpdate]     = useState(Date.now());

  const updateURL = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (!v || v === "all") p.delete(k); else p.set(k, v);
    });
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const handleStatus   = (v: FilterStatus)     => { setFilterStatus(v);   updateURL({ status: v });   };
  const handleAssignee = (v: Assignee | "all") => { setFilterAssignee(v); updateURL({ assignee: v }); };
  const handleSearch   = (v: string)           => { setSearchQuery(v);    updateURL({ q: v });        };
  const handleFrom     = (v: string)           => { setDateFrom(v);       updateURL({ from: v });     };
  const handleTo       = (v: string)           => { setDateTo(v);         updateURL({ to: v });       };

  const clearFilters = () => {
    setFilterStatus("all"); setFilterAssignee("all"); setSearchQuery(""); setDateFrom(""); setDateTo("");
    router.replace(pathname, { scroll: false });
  };

  useEffect(() => { setLastUpdate(Date.now()); }, [tasks]);

  const assigneeCounts = useMemo(() => {
    const c: Record<string, number> = { all: tasks?.length || 0 };
    tasks?.forEach((t) => { c[t.assigned_to] = (c[t.assigned_to] || 0) + 1; });
    return c;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (filterStatus   !== "all" && t.status      !== filterStatus)   return false;
      if (filterAssignee !== "all" && t.assigned_to !== filterAssignee) return false;
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (dateFrom || dateTo) {
        const d  = new Date(t.created_at);
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo   && d > new Date(dateTo + "T23:59:59")) return false;
      }
      return true;
    });
  }, [tasks, filterStatus, filterAssignee, searchQuery, dateFrom, dateTo]);

  const tasksByStatus = useMemo(() =>
    COLUMNS.reduce((acc, col) => {
      acc[col.key] = filteredTasks.filter((t) => t.status === col.key) as Task[];
      return acc;
    }, {} as Record<string, Task[]>),
  [filteredTasks]);

  const handleCreate = async (status: TaskStatus) => {
    const title = prompt(`Task title for [${status}]:`);
    if (!title) return;
    const suggested = inferAssignee(title);
    const assignee = confirm(`Assign to ${assigneeLabel(suggested)}?`) ? suggested : "sam";
    await createTask({ title, assigned_to: assignee, status });
  };

  const handleMove   = async (id: string, s: TaskStatus) => { await updateStatus({ id: id as Id<"tasks">, status: s }); };
  const handleDelete = async (id: string) => { if (confirm("Delete this task?")) await removeTask({ id: id as Id<"tasks"> }); };

  const totalCount = filteredTasks.length;
  const doneCount  = tasksByStatus["done"]?.length || 0;
  const hasFilter  = filterStatus !== "all" || filterAssignee !== "all" || searchQuery || dateFrom || dateTo;

  return (
    <div className="space-y-4 page-enter">

      {/* Header */}
      <PageHeader
        title="Tasks"
        subtitle="Kanban pipeline"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <span className="text-[10px] text-slate-500 tabular-nums">
              {totalCount} tasks · {doneCount} done
            </span>
          </>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 panel-glass">
        <FilterInput
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search tasks..."
          className="text-xs"
        />
        <FilterSelect value={filterAssignee} onChange={(v) => handleAssignee(v as Assignee | "all")} className="py-1.5">
          <option value="all">All ({assigneeCounts.all || 0})</option>
          {ASSIGNEE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({assigneeCounts[o.value] || 0})</option>
          ))}
        </FilterSelect>
        <FilterSelect value={filterStatus} onChange={(v) => handleStatus(v as FilterStatus)} className="py-1.5">
          <option value="all">All status</option>
          {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </FilterSelect>

        <button
          onClick={() => setShowDates(!showDates)}
          className={`btn-ghost text-[10px] ${showDates || dateFrom || dateTo ? "text-cyan-300" : ""}`}
        >
          ◷ Dates
        </button>

        {showDates && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={(e) => handleFrom(e.target.value)}
              className="input-glass text-xs py-1.5 w-auto" />
            <span className="text-slate-600 text-xs">→</span>
            <input type="date" value={dateTo}   onChange={(e) => handleTo(e.target.value)}
              className="input-glass text-xs py-1.5 w-auto" />
          </div>
        )}

        {hasFilter && (
          <button onClick={clearFilters} className="btn-ghost text-[10px]">✕ Clear</button>
        )}
      </div>

      {/* Kanban Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col">
            {/* Column header */}
            <div className="flex items-center justify-between px-2.5 py-2 rounded-t-lg bg-slate-900/60 border border-b-0 border-white/8">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.dotColor}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">{col.label}</span>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${col.badgeColor}`}>
                {tasksByStatus[col.key]?.length || 0}
              </span>
            </div>

            {/* Tasks */}
            <div className="flex-1 space-y-1.5 p-2 panel-soft rounded-t-none min-h-[180px] max-h-[calc(100vh-300px)] overflow-y-auto border-t-0">
              {(tasksByStatus[col.key] || []).map((task) => (
                <TaskCard
                  key={String(task._id)}
                  task={task}
                  onMove={handleMove}
                  onDelete={handleDelete}
                />
              ))}
              <button
                onClick={() => handleCreate(col.key)}
                className="w-full py-1.5 text-[10px] text-slate-600 hover:text-slate-300 border border-dashed border-white/8 hover:border-white/20 rounded-lg transition-colors"
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
