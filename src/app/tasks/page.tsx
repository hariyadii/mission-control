"use client";
/**
 * Tasks — Kanban Pipeline
 * Enterprise-polish additions:
 *  - Execution Trace Drawer: claim→heartbeat→complete timeline from task description
 *  - True blocker highlighting (rose) vs noise (amber)
 *  - Blocked reason visible in card footer
 *  - Fail streak indicator on cards
 */
import { useEffect, useRef, useState, useMemo } from "react";
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

type Assignee   = "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";
type TaskStatus = "suggested" | "backlog" | "in_progress" | "blocked" | "done";
type FilterStatus = "all" | TaskStatus;

type Task = {
  _id:            Id<"tasks">;
  _creationTime?: number;
  title:          string;
  description?:   string;
  status:         TaskStatus;
  assigned_to:    Assignee;
  created_at:     string;
  updated_at?:    string;
  owner?:         string;
  lease_until?:   string;
  heartbeat_at?:  string;
  blocked_reason?:string;
  blocked_until?: string;
  unblock_signal?:string;
  same_reason_fail_streak?: number;
  retry_count_total?: number;
  last_validation_reason?: string;
  artifact_path?: string;
  validation_status?: string;
  remediation_task_id?: string;
  incident_fingerprint?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskStatus; label: string; dotColor: string; badgeColor: string }[] = [
  { key: "suggested",   label: "Suggested", dotColor: "bg-fuchsia-400",            badgeColor: "text-fuchsia-300 bg-fuchsia-500/20" },
  { key: "backlog",     label: "Backlog",   dotColor: "bg-indigo-400",             badgeColor: "text-indigo-300 bg-indigo-500/20"   },
  { key: "in_progress", label: "Running",   dotColor: "bg-cyan-400 animate-pulse", badgeColor: "text-cyan-300 bg-cyan-500/20"       },
  { key: "blocked",     label: "Blocked",   dotColor: "bg-amber-400",              badgeColor: "text-amber-300 bg-amber-500/20"     },
  { key: "done",        label: "Done",      dotColor: "bg-emerald-400",            badgeColor: "text-emerald-300 bg-emerald-500/20" },
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

const NOISE_REASONS = new Set([
  "duplicate_incident_ticket",
  "validation_contract_mismatch",
]);

// ── Helpers ────────────────────────────────────────────────────────────────

const SAM_KW  = ["mission control","autonomy","workflow","guardrail","cron","control center","dashboard","api","task engine","execution"];
const LYRA_KW = ["capital","trading","trade","position","paper","portfolio","signal","backtest","strategy","equity"];
const ALEX_KW = ["coordinator","coordinating","routing","memory","knowledge","alignment"];

function inferAssignee(title: string, description?: string): Assignee {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (SAM_KW.some((k)  => text.includes(k))) return "sam";
  if (LYRA_KW.some((k) => text.includes(k))) return "lyra";
  if (ALEX_KW.some((k) => text.includes(k))) return "alex";
  return "sam";
}

function isTrueBlocker(task: Task): boolean {
  if (task.status !== "blocked") return false;
  const r = task.blocked_reason ?? "";
  return !NOISE_REASONS.has(r);
}

function fmtTime(ts: string | undefined | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ts; }
}

function fmtDate(ts: string | undefined | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

// ── Execution Trace Drawer ─────────────────────────────────────────────────
// Parses structured lifecycle events from the task description text.
// Events are written by the autonomy worker in a structured format.

type TraceEvent = {
  kind: "claim" | "heartbeat" | "complete" | "stale_requeue" | "blocked" | "created" | "note";
  ts:   string | null;
  detail?: string;
};

function parseTraceEvents(task: Task): TraceEvent[] {
  const events: TraceEvent[] = [];

  // Created
  events.push({
    kind: "created",
    ts: task.created_at ?? null,
    detail: `Created in ${task.status}`,
  });

  // Parse description for lifecycle markers
  const desc = task.description ?? "";
  const lines = desc.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Heartbeat: 2026-01-01T00:00:00.000Z by sam
    const hbMatch = trimmed.match(/^Heartbeat:\s*([0-9T:.\-Z+]+)\s+by\s+(\w+)/i);
    if (hbMatch) {
      events.push({ kind: "heartbeat", ts: hbMatch[1], detail: `by ${hbMatch[2]}` });
      continue;
    }

    // stale_lease_requeued: 2026-01-01T00:00:00.000Z by sam
    const staleMatch = trimmed.match(/stale_lease_requeued:\s*([0-9T:.\-Z+]+)/i);
    if (staleMatch) {
      events.push({ kind: "stale_requeue", ts: staleMatch[1], detail: trimmed });
      continue;
    }

    // Blocked markers
    if (/^blocked_reason:/i.test(trimmed)) {
      events.push({ kind: "blocked", ts: task.updated_at ?? null, detail: trimmed });
    }

    // Execution Output → completion
    if (/^\*\*Execution Output:\*\*/i.test(trimmed) || trimmed === "**Execution Output:**") {
      events.push({ kind: "complete", ts: task.updated_at ?? null, detail: "Execution output recorded" });
    }
  }

  // Add synthesized claim event from owner + heartbeat_at
  if (task.owner && task.heartbeat_at) {
    const claimTs = task.heartbeat_at;
    const existing = events.find((e) => e.kind === "heartbeat" && e.ts === claimTs);
    if (!existing) {
      events.push({ kind: "claim", ts: claimTs, detail: `Claimed by ${task.owner}` });
    }
  } else if (task.status === "in_progress" && task.owner) {
    events.push({ kind: "claim", ts: task.updated_at ?? null, detail: `Claimed by ${task.owner}` });
  }

  // Completion event
  if (task.status === "done") {
    events.push({ kind: "complete", ts: task.updated_at ?? null, detail: `Completed — validation: ${task.validation_status ?? "pass"}` });
  }

  // Sort chronologically
  events.sort((a, b) => {
    const ta = a.ts ? Date.parse(a.ts) : 0;
    const tb = b.ts ? Date.parse(b.ts) : 0;
    return ta - tb;
  });

  // Deduplicate (same kind + ts)
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.kind}:${e.ts ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TRACE_STYLE: Record<TraceEvent["kind"], { dot: string; label: string; textColor: string }> = {
  created:      { dot: "bg-slate-500",   label: "Created",    textColor: "text-slate-400"  },
  claim:        { dot: "bg-cyan-400",    label: "Claimed",    textColor: "text-cyan-300"   },
  heartbeat:    { dot: "bg-indigo-400",  label: "Heartbeat",  textColor: "text-indigo-300" },
  complete:     { dot: "bg-emerald-400", label: "Completed",  textColor: "text-emerald-300"},
  stale_requeue:{ dot: "bg-amber-400",   label: "Stale/Req",  textColor: "text-amber-300"  },
  blocked:      { dot: "bg-rose-400",    label: "Blocked",    textColor: "text-rose-300"   },
  note:         { dot: "bg-slate-600",   label: "Note",       textColor: "text-slate-400"  },
};

function ExecutionTraceDrawer({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const events = useMemo(() => parseTraceEvents(task), [task]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    drawerRef.current?.focus();
  }, []);

  const isTrueBlk  = isTrueBlocker(task);
  const failStreak = task.same_reason_fail_streak ?? 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex"
      role="dialog"
      aria-modal="true"
      aria-label={`Execution trace: ${task.title}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative ml-auto w-full max-w-md h-full bg-[#070c1a]/98 border-l border-white/10 flex flex-col shadow-2xl overflow-hidden"
        style={{ outline: "none" }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/8 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Execution Trace</p>
            <p className="text-sm font-semibold text-slate-100 leading-snug line-clamp-2" title={task.title}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <AgentBadge agent={task.assigned_to} size="xs" />
              <StatusBadge status={task.status} size="xs" />
              {isTrueBlk && (
                <span className="text-[9px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                  TRUE BLOCKER
                </span>
              )}
              {failStreak >= 3 && (
                <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  STREAK ×{failStreak}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost text-base leading-none shrink-0 mt-0.5"
            aria-label="Close trace drawer"
          >
            ×
          </button>
        </div>

        {/* Metadata */}
        <div className="px-4 py-2.5 border-b border-white/6 shrink-0">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
            <div>
              <span className="text-slate-600 uppercase tracking-wider font-semibold">Created</span>
              <span className="block text-slate-300 mt-0.5">{fmtDate(task.created_at)}</span>
            </div>
            <div>
              <span className="text-slate-600 uppercase tracking-wider font-semibold">Updated</span>
              <span className="block text-slate-300 mt-0.5">{fmtDate(task.updated_at)}</span>
            </div>
            {task.owner && (
              <div>
                <span className="text-slate-600 uppercase tracking-wider font-semibold">Owner</span>
                <span className="block text-slate-300 mt-0.5">{task.owner}</span>
              </div>
            )}
            {task.lease_until && (
              <div>
                <span className="text-slate-600 uppercase tracking-wider font-semibold">Lease until</span>
                <span className="block text-slate-300 mt-0.5">{fmtTime(task.lease_until)}</span>
              </div>
            )}
            {task.retry_count_total !== undefined && task.retry_count_total > 0 && (
              <div>
                <span className="text-slate-600 uppercase tracking-wider font-semibold">Retries</span>
                <span className="block text-amber-300 mt-0.5">{task.retry_count_total}</span>
              </div>
            )}
            {task.artifact_path && (
              <div className="col-span-2">
                <span className="text-slate-600 uppercase tracking-wider font-semibold">Artifact</span>
                <span className="block text-emerald-300 mt-0.5 font-mono text-[9px] truncate" title={task.artifact_path}>
                  {task.artifact_path}
                </span>
              </div>
            )}
            {task.blocked_reason && (
              <div className="col-span-2">
                <span className="text-slate-600 uppercase tracking-wider font-semibold">Blocked reason</span>
                <span className={`block mt-0.5 ${isTrueBlk ? "text-rose-300" : "text-amber-300"}`}>
                  {task.blocked_reason.replace(/_/g, " ")}
                </span>
              </div>
            )}
            {task.unblock_signal && (
              <div className="col-span-2">
                <span className="text-slate-600 uppercase tracking-wider font-semibold">Unblock signal</span>
                <span className="block text-cyan-300 mt-0.5">{task.unblock_signal.replace(/_/g, " ")}</span>
              </div>
            )}
            {task.remediation_task_id && (
              <div className="col-span-2">
                <span className="text-slate-600 uppercase tracking-wider font-semibold">Remediation task</span>
                <span className="block text-violet-300 mt-0.5 font-mono text-[9px] truncate" title={task.remediation_task_id}>
                  {task.remediation_task_id}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Lifecycle Events</p>

          {events.length === 0 ? (
            <p className="text-[10px] text-slate-600 text-center py-6">No lifecycle events parsed</p>
          ) : (
            <div className="relative">
              {/* Vertical connector line */}
              <div
                className="absolute left-[5px] top-2 bottom-2 w-px bg-white/6"
                aria-hidden="true"
              />
              <div className="space-y-3 pl-5">
                {events.map((ev, i) => {
                  const style = TRACE_STYLE[ev.kind];
                  return (
                    <div key={i} className="relative">
                      {/* Dot */}
                      <span
                        className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${style.dot} shadow-sm`}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-[10px] font-bold ${style.textColor}`}>{style.label}</span>
                          <span className="text-[9px] text-slate-600 tabular-nums">{fmtTime(ev.ts)}</span>
                        </div>
                        {ev.detail && (
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug line-clamp-2" title={ev.detail}>
                            {ev.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Raw description (collapsed) */}
        {task.description && (
          <div className="px-4 py-2.5 border-t border-white/6 shrink-0">
            <details className="group">
              <summary className="text-[10px] font-semibold text-slate-500 cursor-pointer hover:text-slate-300 list-none flex items-center gap-1.5 select-none">
                <span className="group-open:rotate-90 transition-transform duration-150 text-xs">▶</span>
                Raw description
              </summary>
              <pre className="mt-2 text-[9px] text-slate-500 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-[140px] overflow-y-auto">
                {task.description}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TaskCard ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onMove,
  onDelete,
  onTrace,
}: {
  task:    Task;
  onMove:  (id: string, s: TaskStatus) => void;
  onDelete:(id: string) => void;
  onTrace: (task: Task) => void;
}) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const showT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSide(r.left > window.innerWidth / 2 ? "left" : "right");
    showT.current = setTimeout(() => setPreviewVisible(true), 220);
  };
  const leave = () => {
    if (showT.current) clearTimeout(showT.current);
    hideT.current = setTimeout(() => setPreviewVisible(false), 160);
  };
  const pEnter = () => { if (hideT.current) clearTimeout(hideT.current); };
  const pLeave = () => { hideT.current = setTimeout(() => setPreviewVisible(false), 160); };

  const createdDate = task.created_at ? new Date(task.created_at).toLocaleDateString() : "—";
  const isTrueBlk   = isTrueBlocker(task);
  const failStreak  = task.same_reason_fail_streak ?? 0;
  const isHighStreak = failStreak >= 3;

  return (
    <div className="relative w-full" onMouseEnter={enter} onMouseLeave={leave}>
      {/* Hover preview */}
      {previewVisible && (
        <div
          aria-hidden="true"
          className={`absolute top-0 z-50 w-52 p-3 panel-glass border border-white/15 rounded-lg shadow-2xl ${
            side === "right" ? "left-full ml-2" : "right-full mr-2"
          }`}
          onMouseEnter={pEnter}
          onMouseLeave={pLeave}
        >
          <p className="text-xs font-semibold text-slate-100 line-clamp-2 mb-1.5">{task.title}</p>
          <p className="text-[10px] text-slate-400 line-clamp-3 mb-2">
            {task.description?.replace(/[#*_\-`]/g, "").slice(0, 140) || "No description"}
          </p>
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/8 flex-wrap">
            <StatusBadge status={task.status} size="xs" />
            <AgentBadge agent={task.assigned_to} size="xs" />
            {isTrueBlk && (
              <span className="text-[8px] text-rose-400 font-bold">TRUE BLOCKER</span>
            )}
          </div>
          {task.blocked_reason && (
            <p className="text-[9px] text-amber-300/80 mt-1 truncate" title={task.blocked_reason}>
              ⚑ {task.blocked_reason.replace(/_/g, " ")}
            </p>
          )}
          <p className="text-[9px] text-slate-600 mt-1">Created {createdDate}</p>
        </div>
      )}

      {/* Card */}
      <div
        className={`panel-soft p-2 text-xs group cursor-default ${
          isTrueBlk
            ? "border-rose-500/30 bg-rose-500/5"
            : isHighStreak
            ? "border-amber-500/25 bg-amber-500/4"
            : ""
        }`}
      >
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span
            className={`flex-1 line-clamp-2 leading-snug ${isTrueBlk ? "text-rose-100" : "text-slate-200"}`}
            title={task.title}
          >
            {task.title}
          </span>
          <div className="flex items-center gap-0.5 shrink-0 ml-1">
            {/* Trace button */}
            <button
              onClick={(e) => { e.stopPropagation(); onTrace(task); }}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-slate-600 hover:text-indigo-400 text-[10px] leading-none px-0.5"
              aria-label="View execution trace"
              title="Execution trace"
            >
              ⊞
            </button>
            {/* Delete button */}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(String(task._id)); }}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-slate-600 hover:text-rose-400 text-sm leading-none"
              aria-label="Delete task"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <AgentBadge agent={task.assigned_to} size="xs" />
          <select
            value={task.status}
            onChange={(e) => onMove(String(task._id), e.target.value as TaskStatus)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Change task status"
            className="flex-1 bg-slate-900/60 border border-white/8 rounded px-1 py-0.5 text-[9px] text-slate-400 focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/40 cursor-pointer"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        {/* Footer: blocker reason or fail streak */}
        {isTrueBlk && task.blocked_reason && (
          <p className="mt-1.5 text-[8px] text-rose-400/80 truncate leading-tight" title={task.blocked_reason}>
            ⚑ {task.blocked_reason.replace(/_/g, " ")}
          </p>
        )}
        {!isTrueBlk && isHighStreak && (
          <p className="mt-1.5 text-[8px] text-amber-400/80 leading-tight">
            ⚡ fail streak ×{failStreak}
          </p>
        )}
        {!isTrueBlk && !isHighStreak && task.blocked_reason && NOISE_REASONS.has(task.blocked_reason) && (
          <p className="mt-1.5 text-[8px] text-slate-600 truncate leading-tight" title={task.blocked_reason}>
            {task.blocked_reason.replace(/_/g, " ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Inline Create Form ─────────────────────────────────────────────────────

type CreateFormState = { status: TaskStatus; title: string; assignee: Assignee };

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

  const handleTitleChange = (v: string) => { setTitle(v); setAssignee(inferAssignee(v)); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try { await onSubmit(trimmed, assignee, initialStatus); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="panel-soft p-2 space-y-1.5" role="dialog" aria-label={`Create task in ${initialStatus}`}>
      <input
        autoFocus type="text" value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Task title…" className="input-glass text-xs py-1"
        aria-label="Task title" required maxLength={200}
      />
      <div className="flex items-center gap-1.5">
        <select
          value={assignee} onChange={(e) => setAssignee(e.target.value as Assignee)}
          className="flex-1 bg-slate-900/60 border border-white/8 rounded px-1.5 py-1 text-[9px] text-slate-400 focus:outline-none focus:border-indigo-400/50"
          aria-label="Assign to"
        >
          {ASSIGNEE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" disabled={submitting || !title.trim()} className="btn-primary text-[10px] px-2 py-1 disabled:opacity-50" aria-label="Add task">
          {submitting ? "…" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost text-[10px] px-2 py-1" aria-label="Cancel">✕</button>
      </div>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

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
  const [traceTask,      setTraceTask]      = useState<Task | null>(null);

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

  // Operator signal: count true blockers
  const trueBlockerCount = useMemo(
    () => filteredTasks.filter((t) => isTrueBlocker(t as Task)).length,
    [filteredTasks]
  );

  const handleCreate = async (title: string, assignee: Assignee, status: TaskStatus) => {
    await createTask({ title, assigned_to: assignee, status });
    setCreateForm(null);
  };
  const handleMove          = async (id: string, s: TaskStatus) => { await updateStatus({ id: id as Id<"tasks">, status: s }); };
  const handleDeleteRequest = (id: string)  => { setPendingDelete(id); };
  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    await removeTask({ id: pendingDelete as Id<"tasks"> });
    setPendingDelete(null);
  };

  const totalCount = filteredTasks.length;
  const doneCount  = tasksByStatus["done"]?.length || 0;
  const hasFilter  = filterStatus !== "all" || filterAssignee !== "all" || searchQuery || dateFrom || dateTo;

  return (
    <div className="flex flex-col gap-4 page-enter">

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

      {/* True blocker operator alert */}
      {trueBlockerCount > 0 && (
        <div
          className="rounded-lg border border-rose-500/35 bg-rose-500/8 px-3 py-2 flex items-center justify-between gap-3"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" aria-hidden="true" />
            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
              {trueBlockerCount} true blocker{trueBlockerCount > 1 ? "s" : ""} — requires attention
            </span>
          </div>
          <button
            onClick={() => handleStatus("blocked")}
            className="text-[9px] text-rose-400 hover:text-rose-200 font-semibold transition-colors"
          >
            Show blocked →
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 panel-glass">
        <FilterInput value={searchQuery} onChange={handleSearch} placeholder="Search tasks..." className="text-xs" />
        <FilterSelect value={filterAssignee} onChange={(v) => handleAssignee(v as Assignee | "all")} ariaLabel="Filter by agent" className="py-1.5">
          <option value="all">All ({assigneeCounts.all || 0})</option>
          {ASSIGNEE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({assigneeCounts[o.value] || 0})</option>
          ))}
        </FilterSelect>
        <FilterSelect value={filterStatus} onChange={(v) => handleStatus(v as FilterStatus)} ariaLabel="Filter by status" className="py-1.5">
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
            <input type="date" value={dateFrom} onChange={(e) => handleFrom(e.target.value)} className="input-glass text-xs py-1.5 w-auto" aria-label="From date" />
            <span className="text-slate-600 text-xs">→</span>
            <input type="date" value={dateTo}   onChange={(e) => handleTo(e.target.value)}   className="input-glass text-xs py-1.5 w-auto" aria-label="To date" />
          </div>
        )}

        {hasFilter && (
          <button onClick={clearFilters} className="btn-ghost text-[10px]" aria-label="Clear all filters">✕ Clear</button>
        )}
      </div>

      {/* Delete confirmation */}
      {pendingDelete && (
        <div role="alertdialog" aria-modal="true" aria-label="Confirm delete" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="panel-glass p-5 rounded-xl max-w-xs w-full mx-4 space-y-4">
            <p className="text-sm text-slate-200 font-medium">Delete this task?</p>
            <p className="text-xs text-slate-400">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingDelete(null)} className="btn-secondary text-xs" autoFocus>Cancel</button>
              <button onClick={handleDeleteConfirm} className="btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Trace Drawer */}
      {traceTask && (
        <ExecutionTraceDrawer task={traceTask} onClose={() => setTraceTask(null)} />
      )}

      {/* Kanban Grid */}
      <div className="kanban-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.key] ?? [];
          const colTrueBlockers = colTasks.filter((t) => isTrueBlocker(t as Task)).length;
          return (
            <div key={col.key} className="flex flex-col">
              {/* Column header */}
              <div className="flex items-center justify-between px-2.5 py-2 rounded-t-lg bg-slate-900/60 border border-b-0 border-white/8">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.dotColor}`} aria-hidden="true" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">{col.label}</span>
                  {col.key === "blocked" && colTrueBlockers > 0 && (
                    <span className="text-[8px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/25 px-1 py-0.5 rounded" title="True blockers">
                      {colTrueBlockers}
                    </span>
                  )}
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${col.badgeColor}`}>
                  {colTasks.length}
                </span>
              </div>

              {/* Task cards — scroll-isolated column body */}
              <div
                className="flex-1 min-h-0 space-y-1.5 p-2 panel-soft rounded-t-none min-h-[180px] overflow-y-auto border-t-0"
                style={{ maxHeight: "max(200px, calc(100vh - 300px))" }}
              >
                {colTasks.map((task) => (
                  <TaskCard
                    key={String(task._id)}
                    task={task as Task}
                    onMove={handleMove}
                    onDelete={handleDeleteRequest}
                    onTrace={(t) => setTraceTask(t)}
                  />
                ))}
                {createForm?.status === col.key ? (
                  <InlineCreateForm initialStatus={col.key} onSubmit={handleCreate} onCancel={() => setCreateForm(null)} />
                ) : (
                  <button
                    onClick={() => setCreateForm({ status: col.key, title: "", assignee: "sam" })}
                    className="w-full py-1.5 text-[10px] text-slate-600 hover:text-slate-300 border border-dashed border-white/8 hover:border-white/20 rounded-lg transition-colors"
                    aria-label={`Add task to ${col.label}`}
                  >
                    + Add task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
