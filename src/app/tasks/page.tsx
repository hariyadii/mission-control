"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type Assignee = "me" | "alex" | "sam" | "lyra" | "agent";
type TaskStatus = "suggested" | "backlog" | "in_progress" | "done";

type Task = {
  _id: Id<"tasks">;
  _creationTime?: number;
  title: string;
  description?: string;
  status: TaskStatus;
  assigned_to: Assignee;
  created_at: string;
};

const COLUMNS = [
  { key: "suggested", label: "Suggested", icon: "✦" },
  { key: "backlog", label: "Backlog", icon: "◌" },
  { key: "in_progress", label: "In Progress", icon: "◔" },
  { key: "done", label: "Done", icon: "●" },
];

const STATUS_ORDER: TaskStatus[] = ["suggested", "backlog", "in_progress", "done"];

const ASSIGNEE_OPTIONS: { value: Assignee; label: string }[] = [
  { value: "me", label: "Me" },
  { value: "alex", label: "Alex" },
  { value: "sam", label: "Sam" },
  { value: "lyra", label: "Lyra" },
  { value: "agent", label: "Agent (Legacy)" },
];

function assigneeLabel(value: string) {
  const v = value.toLowerCase();
  if (v === "alex") return "Alex";
  if (v === "sam") return "Sam";
  if (v === "me") return "Me";
  if (v === "lyra") return "Lyra";
  if (v === "agent") return "Agent";
  return value;
}

function assigneeClass(value: string) {
  const v = value.toLowerCase();
  if (v === "alex") return "badge badge-alex";
  if (v === "sam") return "badge badge-sam";
  if (v === "me") return "badge badge-me";
  if (v === "lyra") return "badge badge-alex";
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

  const grouped = COLUMNS.reduce((acc, col) => {
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
      </header>

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

      <div className="kanban-grid grid grid-cols-1 gap-4 lg:grid-cols-4">
        {COLUMNS.map((col) => (
          <section key={col.key} className="panel-glass p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-slate-300">{col.icon}</span>
              <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-100">{col.label}</h2>
              <span className="ml-auto rounded-full border border-white/15 bg-slate-800/70 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                {grouped[col.key]?.length ?? 0}
              </span>
            </div>

            <div className={`space-y-2.5 ${col.key === "done" ? "max-h-[420px] overflow-y-auto pr-1" : ""}`}>
              {grouped[col.key]?.map((task) => {
                const scope = samScope(task);
                return (
                <article
                  key={task._id}
                  onClick={() => setEditingTask(task)}
                  className="panel-soft cursor-pointer p-3 transition hover:border-indigo-300/40 hover:bg-slate-800/70"
                >
                  <p className="m-0 line-clamp-2 text-sm font-semibold leading-snug text-slate-100">{task.title}</p>
                  {task.description && (
                    <p className="m-0 mt-1.5 line-clamp-3 text-xs leading-relaxed text-[color:var(--text-muted)]">
                      {task.description}
                    </p>
                  )}

                  {/* Badges row */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className={assigneeClass(task.assigned_to)}>{assigneeLabel(task.assigned_to)}</span>
                    {scope && (
                      <span className={scopeBadgeClass(scope)}>
                        {scope === "core" ? "Core" : "Secondary"}
                      </span>
                    )}
                  </div>

                  {/* Action buttons row */}
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
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
                        {["in_progress", "done"].includes(task.status) && (
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
                        {["backlog", "in_progress"].includes(task.status) && (
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
