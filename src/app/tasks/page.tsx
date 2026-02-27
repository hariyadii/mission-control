"use client";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  CommandBar,
  FreshnessIndicator,
  AgentBadge,
  StatusBadge,
  PageHeader,
  FilterInput,
  FilterSelect,
  EmptyState,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

type Assignee   = "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";
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

const COLUMNS: {
  key: TaskStatus;
  label: string;
  dotClass: string;
  badgeClass: string;
}[] = [
  { key: "suggested",   label: "Suggested", dotClass: "bg-fuchsia-400",            badgeClass: "text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/28" },
  { key: "backlog",     label: "Backlog",   dotClass: "bg-indigo-400",             badgeClass: "text-indigo-300 bg-indigo-500/15 border border-indigo-500/28"    },
  { key: "in_progress", label: "Running",   dotClass: "bg-cyan-400 animate-pulse", badgeClass: "text-cyan-300 bg-cyan-500/15 border border-cyan-500/28"          },
  { key: "blocked",     label: "Blocked",   dotClass: "bg-amber-400",              badgeClass: "text-amber-300 bg-amber-500/15 border border-amber-500/28"       },
  { key: "done",        label: "Done",      dotClass: "bg-emerald-400",            badgeClass: "text-emerald-300 bg-emerald-500/15 border border-emerald-500/28" },
];

const STATUS_ORDER: TaskStatus[] = ["suggested", "backlog", "in_progress", "blocked", "done"];

const ASSIGNEE_OPTIONS: { value: Assignee; label: string }[] = [
  { value: "me",    label: "Me"            },
  { value: "alex",  label: "Alex"          },
  { value: "sam",   label: "Sam"           },
  { value: "lyra",  label: "Lyra"          },
  { value: "nova",  label: "Nova"          },
  { value: "ops",   label: "Ops"           },
  { value: "agent", label: "Agent (legacy)"},
];

// ── Assignee inference ─────────────────────────────────────────────────────

const SAM_KW  = ["mission control","autonomy","workflow","guardrail","cron","dashboard","api","task engine","execution","schema","convex"];
const LYRA_KW = ["capital","trading","trade","position","paper","portfolio","signal","backtest","strategy","equity"];
const ALEX_KW = ["coordinator","coordinating","routing","memory","knowledge","alignment"];

function inferAssignee(title: string, description?: string): Assignee {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (SAM_KW.some((k)  => text.includes(k))) return "sam";
  if (LYRA_KW.some((k) => text.includes(k))) return "lyra";
  if (ALEX_KW.some((k) => text.includes(k))) return "alex";
  return "sam";
}

// ── TaskCard ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onMove,
  onDelete,
}: {
  task: Task;
  onMove:   (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const showRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSide(r.left > window.innerWidth / 2 ? "left" : "right");
    showRef.current = setTimeout(() => setPreviewVisible(true), 220);
  };
  const leave = () => {
    if (showRef.current) clearTimeout(showRef.current);
    hideRef.current = setTimeout(() => setPreviewVisible(false), 160);
  };
  const pEnter = () => { if (hideRef.current) clearTimeout(hideRef.current); };
  const pLeave = () => { hideRef.current = setTimeout(() => setPreviewVisible(false), 160); };

  const createdDate = task.created_at ? new Date(task.created_at).toLocaleDateString() : "—";

  return (
    <div className="relative w-full" onMouseEnter={enter} onMouseLeave={leave}>
      {/* Hover preview */}
      {previewVisible && (
        <div
          aria-hidden="true"
          className={[
            "absolute top-0 z-50 w-56 p-3 panel-glass rounded-lg shadow-2xl fade-in",
            side === "right" ? "left-full ml-2" : "right-full mr-2",
          ].join(" ")}
          style={{ borderColor: "var(--border-strong)" }}
          onMouseEnter={pEnter}
          onMouseLeave={pLeave}
        >
          <p className="text-xs font-semibold line-clamp-2 mb-1.5" style={{ color: "var(--text-primary)" }}>
            {task.title}
          </p>
          <p className="text-[10px] line-clamp-3 mb-2" style={{ color: "var(--text-muted)" }}>
            {task.description?.replace(/[#*_\-`]/g, "").slice(0, 150) || "No description"}
          </p>
          <div
            className="flex items-center gap-1.5 pt-1.5"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <StatusBadge status={task.status} size="xs" />
            <AgentBadge agent={task.assigned_to} size="xs" />
          </div>
          <p className="text-[9px] mt-1" style={{ color: "var(--text-faint)" }}>Created {createdDate}</p>
        </div>
      )}

      {/* Card */}
      <div className="panel-soft p-2 text-xs group cursor-default">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span
            className="flex-1 line-clamp-2 leading-snug"
            style={{ color: "var(--text-secondary)" }}
            title={task.title}
          >
            {task.title}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(String(task._id)); }}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity ml-1 shrink-0 text-sm leading-none hover:text-rose-400"
            style={{ color: "var(--text-faint)" }}
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
            aria-label="Change task status"
            className="flex-1 rounded px-1 py-0.5 text-[9px] cursor-pointer outline-none focus:ring-1 focus:ring-indigo-400/40 focus:border-indigo-400/50"
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
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

// Required to avoid missing import error
import { useRef } from "react";

// ── Inline create form ─────────────────────────────────────────────────────

function InlineCreateForm({
  initialStatus,
  onSubmit,
  onCancel,
}: {
  initialStatus: TaskStatus;
  onSubmit: (title: string, assignee: Assignee, status: TaskStatus) => Promise<void>;
  onCancel: () => void;
}) {
  const [title,      setTitle]      = useState("");
  const [assignee,   setAssignee]   = useState<Assignee>(() => inferAssignee(""));
  const [submitting, setSubmitting] = useState(false);

  const handleTitle = (v: string) => { setTitle(v); setAssignee(inferAssignee(v)); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try { await onSubmit(trimmed, assignee, initialStatus); }
    finally { setSubmitting(false); }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="panel-soft p-2 space-y-1.5"
      role="dialog"
      aria-label={`Create task in ${initialStatus.replace("_", " ")}`}
    >
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => handleTitle(e.target.value)}
        placeholder="Task title…"
        className="input-glass text-xs py-1.5"
        aria-label="Task title"
        required
        maxLength={200}
      />
      <div className="flex items-center gap-1.5">
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value as Assignee)}
          aria-label="Assign to"
          className="flex-1 rounded px-1.5 py-1 text-[9px] outline-none focus:ring-1 focus:ring-indigo-400/40"
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {ASSIGNEE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="btn-primary text-[10px] px-2.5 py-1.5"
          aria-label="Add task"
        >
          {submitting ? "…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost text-[10px] px-2 py-1.5"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

type CreateFormState = { status: TaskStatus; title: string; assignee: Assignee };

export default function TasksPage() {
  const tasks        = useQuery(api.tasks.list);
  const createTask   = useMutation(api.tasks.create);
  const updateStatus = useMutation(api.tasks.updateStatus);
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
  const [createForm,     setCreateForm]     = useState<CreateFormState | null>(null);
  const [pendingDelete,  setPendingDelete]  = useState<string | null>(null);

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
        const d = new Date(t.created_at);
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

  const handleCreate = async (title: string, assignee: Assignee, status: TaskStatus) => {
    await createTask({ title, assigned_to: assignee, status });
    setCreateForm(null);
  };
  const handleMove          = async (id: string, s: TaskStatus) => {
    await updateStatus({ id: id as Id<"tasks">, status: s });
  };
  const handleDeleteRequest = (id: string) => { setPendingDelete(id); };
  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    await removeTask({ id: pendingDelete as Id<"tasks"> });
    setPendingDelete(null);
  };

  const totalCount = filteredTasks.length;
  const doneCount  = tasksByStatus["done"]?.length || 0;
  const hasFilter  = filterStatus !== "all" || filterAssignee !== "all" || searchQuery || dateFrom || dateTo;

  return (
    <div className="space-y-4 page-enter">

      {/* ── Command Bar ── */}
      <CommandBar
        title="Tasks"
        subtitle="Kanban pipeline"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {totalCount} · {doneCount} done
            </span>
          </>
        }
      />

      {/* ── Page Header ── */}
      <PageHeader
        title="Tasks"
        subtitle="Manage and track all pipeline tasks"
        right={
          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {totalCount} tasks · {doneCount} done
          </span>
        }
      />

      {/* ── Filter Bar ── */}
      <div
        className="flex flex-wrap items-center gap-2 p-2.5 panel-glass"
        role="search"
        aria-label="Filter tasks"
      >
        <FilterInput
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search tasks…"
        />
        <FilterSelect
          value={filterAssignee}
          onChange={(v) => handleAssignee(v as Assignee | "all")}
          ariaLabel="Filter by agent"
        >
          <option value="all">All agents ({assigneeCounts.all || 0})</option>
          {ASSIGNEE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({assigneeCounts[o.value] || 0})
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={filterStatus}
          onChange={(v) => handleStatus(v as FilterStatus)}
          ariaLabel="Filter by status"
        >
          <option value="all">All status</option>
          {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </FilterSelect>

        <button
          onClick={() => setShowDates(!showDates)}
          className={`btn-ghost text-[10px] ${showDates || dateFrom || dateTo ? "text-cyan-300" : ""}`}
          aria-label="Toggle date filters"
          aria-expanded={showDates}
        >
          ◷ Dates
        </button>

        {showDates && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleFrom(e.target.value)}
              aria-label="From date"
              className="input-glass text-xs py-1.5 w-auto"
            />
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleTo(e.target.value)}
              aria-label="To date"
              className="input-glass text-xs py-1.5 w-auto"
            />
          </div>
        )}

        {hasFilter && (
          <button onClick={clearFilters} className="btn-ghost text-[10px]" aria-label="Clear all filters">
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Delete confirmation modal ── */}
      {pendingDelete && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirm task deletion"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm"
        >
          <div className="panel-glass p-5 rounded-xl max-w-xs w-full mx-4 space-y-4 fade-in">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Delete this task?
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingDelete(null)}
                className="btn-secondary text-xs"
                autoFocus
              >
                Cancel
              </button>
              <button onClick={handleDeleteConfirm} className="btn-danger">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kanban Grid ── */}
      <div className="kanban-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col min-w-0">
            {/* Column header */}
            <div
              className="flex items-center justify-between px-2.5 py-2 rounded-t-xl"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderBottom: "none",
              }}
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.dotClass}`} aria-hidden="true" />
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "var(--text-secondary)", letterSpacing: "0.08em" }}
                >
                  {col.label}
                </span>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${col.badgeClass}`}>
                {tasksByStatus[col.key]?.length || 0}
              </span>
            </div>

            {/* Card area */}
            <div
              className="flex-1 space-y-1.5 p-2 overflow-y-auto rounded-b-xl max-h-screen-clamped"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                minHeight: 180,
                maxHeight: "max(200px, calc(100vh - 310px))",
              }}
            >
              {(tasksByStatus[col.key] || []).map((task) => (
                <TaskCard
                  key={String(task._id)}
                  task={task}
                  onMove={handleMove}
                  onDelete={handleDeleteRequest}
                />
              ))}
              {(tasksByStatus[col.key]?.length || 0) === 0 && !createForm && (
                <EmptyState icon="○" message="Empty" />
              )}
              {createForm?.status === col.key ? (
                <InlineCreateForm
                  initialStatus={col.key}
                  onSubmit={handleCreate}
                  onCancel={() => setCreateForm(null)}
                />
              ) : (
                <button
                  onClick={() => setCreateForm({ status: col.key, title: "", assignee: "sam" })}
                  className="w-full py-2 text-[10px] rounded-lg border border-dashed transition-colors"
                  style={{
                    color: "var(--text-faint)",
                    borderColor: "var(--border-subtle)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-faint)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
                  }}
                  aria-label={`Add task to ${col.label}`}
                >
                  + Add task
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
