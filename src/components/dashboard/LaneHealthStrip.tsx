"use client";
/**
 * LaneHealthStrip — per-agent lane health visualization
 *
 * Extracted from src/app/page.tsx. Shows backlog/in_progress/blocked
 * counts with a stacked progress bar and age indicators.
 */
import React, { useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export type LaneConfig = {
  id: string;
  label: string;
  aliases: string[];
  color: { text: string; bar: string; dot: string; border: string };
};

export type LaneStats = {
  backlog: number;
  inProgress: number;
  blocked: number;
  trueBlockers: number;
  lastActivityMs: number;   // ms since last update
  oldestBacklogMs: number;  // ms since oldest backlog task created
};

export type TaskForLane = {
  _id: string;
  _creationTime?: number;
  title: string;
  status: string;
  assigned_to?: string;
  blocked_reason?: string;
  updated_at?: string;
  created_at?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

export const LANES: LaneConfig[] = [
  { id: "alex",  label: "Alex",  aliases: ["alex"],              color: { text: "text-amber-300",  bar: "bg-amber-400",  dot: "bg-amber-400",  border: "border-amber-400/25"  } },
  { id: "sam",   label: "Sam",   aliases: ["sam", "agent"],      color: { text: "text-cyan-300",   bar: "bg-cyan-400",   dot: "bg-cyan-400",   border: "border-cyan-400/25"   } },
  { id: "lyra",  label: "Lyra",  aliases: ["lyra"],              color: { text: "text-violet-300", bar: "bg-violet-400", dot: "bg-violet-400", border: "border-violet-400/25" } },
  { id: "nova",  label: "Nova",  aliases: ["nova"],              color: { text: "text-rose-300",   bar: "bg-rose-400",   dot: "bg-rose-400",   border: "border-rose-400/25"   } },
  { id: "ops",   label: "Ops",   aliases: ["ops"],               color: { text: "text-stone-600",  bar: "bg-stone-400",  dot: "bg-stone-400",  border: "border-stone-400/25"  } },
];

const NOISE_REASONS = new Set([
  "duplicate_incident_ticket",
  "validation_contract_mismatch",
]);

// ── Helpers ────────────────────────────────────────────────────────────────

function ageMs(ts: number | string | undefined): number {
  if (!ts) return 0;
  const parsed = typeof ts === "number" ? ts : Date.parse(ts);
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : 0;
}

function formatAge(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "now";
}

function isTrueBlocker(task: TaskForLane): boolean {
  if (task.status !== "blocked") return false;
  const r = task.blocked_reason ?? "";
  return !NOISE_REASONS.has(r);
}

export function computeLaneStats(tasks: TaskForLane[], aliases: string[]): LaneStats {
  const nowMs = Date.now();
  const norm = aliases.map((a) => a.toLowerCase());
  const mine = tasks.filter((t) => norm.includes((t.assigned_to ?? "").toLowerCase()));

  let backlog = 0, inProgress = 0, blocked = 0, trueBlockers = 0;
  let lastActivityMs = Infinity;
  let oldestBacklogMs = 0;

  for (const t of mine) {
    if (t.status === "backlog") {
      backlog++;
      const a = ageMs(t.created_at ?? t._creationTime);
      if (a > oldestBacklogMs) oldestBacklogMs = a;
    }
    if (t.status === "in_progress") inProgress++;
    if (t.status === "blocked") {
      blocked++;
      if (isTrueBlocker(t)) trueBlockers++;
    }
    const updatedMs = t.updated_at ? ageMs(t.updated_at) : ageMs(t._creationTime);
    if (updatedMs < lastActivityMs) lastActivityMs = updatedMs;
  }

  return {
    backlog, inProgress, blocked, trueBlockers,
    lastActivityMs: lastActivityMs === Infinity ? nowMs : lastActivityMs,
    oldestBacklogMs,
  };
}

// ── LaneHealthStrip Component ──────────────────────────────────────────────

export interface LaneHealthStripProps {
  lane: LaneConfig;
  stats: LaneStats;
}

const LaneHealthStrip = React.memo(function LaneHealthStrip({
  lane,
  stats,
}: LaneHealthStripProps) {
  const { color } = lane;
  const isActive   = stats.inProgress > 0;
  const isWarning  = stats.trueBlockers > 0 || stats.oldestBacklogMs > 4 * 60 * 60_000;
  const isCritical = stats.trueBlockers > 1 || stats.oldestBacklogMs > 12 * 60 * 60_000;

  const borderClass = isCritical ? "border-rose-500/40" : isWarning ? "border-amber-500/35" : color.border;
  const totalWork = stats.backlog + stats.inProgress + stats.blocked;
  const inProgressPct = totalWork > 0 ? (stats.inProgress / totalWork) * 100 : 0;
  const backlogPct    = totalWork > 0 ? (stats.backlog    / totalWork) * 100 : 0;
  const blockedPct    = totalWork > 0 ? (stats.blocked    / totalWork) * 100 : 0;

  return (
    <div className={`panel-soft p-2.5 border ${borderClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot} ${isActive ? "animate-pulse" : "opacity-50"}`}
            aria-hidden="true"
          />
          <span className={`text-xs font-bold ${color.text}`}>{lane.label}</span>
          {isCritical && (
            <span className="text-[9px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1 py-0.5 rounded">
              CRIT
            </span>
          )}
          {!isCritical && isWarning && (
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1 py-0.5 rounded">
              WARN
            </span>
          )}
        </div>
        <span className="text-[9px] text-stone-500 tabular-nums">
          {formatAge(stats.lastActivityMs)} ago
        </span>
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
            stats.inProgress > 0
              ? "text-cyan-300 bg-cyan-500/15 border border-cyan-500/25"
              : "text-stone-500 bg-stone-100/50 border border-stone-200/50"
          }`}
          title="In progress"
        >
          {stats.inProgress} run
        </span>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums text-indigo-300 bg-indigo-500/15 border border-indigo-500/25"
          title="Backlog"
        >
          {stats.backlog} queue
        </span>
        {stats.blocked > 0 && (
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
              stats.trueBlockers > 0
                ? "text-rose-300 bg-rose-500/20 border border-rose-500/30"
                : "text-amber-300 bg-amber-500/15 border border-amber-500/25"
            }`}
            title={`${stats.trueBlockers} true blocker(s)`}
          >
            {stats.blocked} blk
          </span>
        )}
        {stats.oldestBacklogMs > 60 * 60_000 && (
          <span
            className="text-[9px] text-stone-500 tabular-nums ml-auto"
            title="Age of oldest backlog task"
          >
            oldest {formatAge(stats.oldestBacklogMs)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalWork > 0 && (
        <div
          className="h-1 rounded-full overflow-hidden bg-stone-100/80 flex"
          role="img"
          aria-label={`${lane.label}: ${stats.inProgress} running, ${stats.backlog} queued, ${stats.blocked} blocked`}
        >
          <div className="bg-cyan-500/70    h-full transition-all" style={{ width: `${inProgressPct}%` }} />
          <div className="bg-indigo-500/60  h-full transition-all" style={{ width: `${backlogPct}%` }} />
          <div
            className={`h-full transition-all ${stats.trueBlockers > 0 ? "bg-rose-500/70" : "bg-amber-500/50"}`}
            style={{ width: `${blockedPct}%` }}
          />
        </div>
      )}
    </div>
  );
});

export default LaneHealthStrip;

// ── LaneHealthGrid — renders all lanes ────────────────────────────────────

export interface LaneHealthGridProps {
  tasks: TaskForLane[];
  lanes?: LaneConfig[];
  className?: string;
}

export const LaneHealthGrid = React.memo(function LaneHealthGrid({
  tasks,
  lanes = LANES,
  className = "",
}: LaneHealthGridProps) {
  const laneStats = useMemo(
    () => lanes.map((lane) => ({ lane, stats: computeLaneStats(tasks, lane.aliases) })),
    [tasks, lanes]
  );

  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 ${className}`}>
      {laneStats.map(({ lane, stats }) => (
        <LaneHealthStrip key={lane.id} lane={lane} stats={stats} />
      ))}
    </div>
  );
});
