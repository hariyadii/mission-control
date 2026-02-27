"use client";
/**
 * IncidentTimeline — severity-filtered incident list
 *
 * Extracted from src/app/page.tsx. Shows incidents with severity
 * filtering tabs and color-coded entries.
 */
import React, { useState, useMemo } from "react";
import { IncidentBadge } from "@/components/shared";

// ── Types ──────────────────────────────────────────────────────────────────

export type Incident = {
  id: string;
  source: string;
  severity: "critical" | "warning" | "normal";
  message: string;
  timestamp: string;
  action?: string;
  nextAction?: string;
};

export type SeverityFilter = "all" | "critical" | "warning" | "normal";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── IncidentTimeline Component ─────────────────────────────────────────────

export interface IncidentTimelineProps {
  incidents: Incident[];
  /** Initial severity filter */
  defaultFilter?: SeverityFilter;
  /** Max height for the scrollable list */
  maxHeight?: string;
  className?: string;
}

const IncidentTimeline = React.memo(function IncidentTimeline({
  incidents,
  defaultFilter = "all",
  maxHeight = "160px",
  className = "",
}: IncidentTimelineProps) {
  const [filter, setFilter] = useState<SeverityFilter>(defaultFilter);

  const filtered = useMemo(() => {
    if (filter === "all") return incidents;
    return incidents.filter((i) => i.severity === filter);
  }, [incidents, filter]);

  const critCount = incidents.filter((i) => i.severity === "critical").length;
  const warnCount = incidents.filter((i) => i.severity === "warning").length;

  return (
    <section
      className={`panel-glass p-2.5 ${className}`}
      aria-label="Incident timeline"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Incidents
          </span>
          <div className="flex items-center gap-1">
            {critCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-500/25 text-[9px] text-rose-300 font-bold border border-rose-500/30">
                {critCount}C
              </span>
            )}
            {warnCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/25 text-[9px] text-amber-300 font-bold border border-amber-500/30">
                {warnCount}W
              </span>
            )}
            {critCount === 0 && warnCount === 0 && (
              <span className="text-[9px] text-emerald-400 font-medium">All clear</span>
            )}
          </div>
        </div>

        {/* Severity filter tabs */}
        <div className="flex items-center gap-0.5" role="group" aria-label="Filter by severity">
          {(["all", "critical", "warning", "normal"] as SeverityFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors capitalize ${
                filter === s
                  ? s === "critical"
                    ? "bg-rose-500/25 text-rose-300 border border-rose-500/30"
                    : s === "warning"
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/30"
                    : "bg-slate-700/60 text-slate-200 border border-white/15"
                  : "text-slate-600 hover:text-slate-400"
              }`}
              aria-pressed={filter === s}
            >
              {s === "all" ? "All" : s.slice(0, 4).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline entries */}
      <div
        className="overflow-y-auto space-y-0"
        style={{ maxHeight }}
      >
        {filtered.length > 0 ? (
          filtered.map((inc) => (
            <div
              key={`${inc.source}-${inc.id}`}
              className={`flex items-start gap-2 px-2 py-1.5 text-xs rounded-md transition-colors ${
                inc.severity === "critical"
                  ? "bg-rose-500/6 border-l-2 border-rose-500/50"
                  : inc.severity === "warning"
                  ? "bg-amber-500/5 border-l-2 border-amber-500/40"
                  : ""
              }`}
            >
              <IncidentBadge severity={inc.severity} />
              <div className="flex-1 min-w-0">
                <p
                  className="text-slate-200 truncate leading-snug font-medium"
                  title={inc.message}
                >
                  {inc.message}
                </p>
                {inc.action && (
                  <p className="text-[9px] text-cyan-400 mt-0.5 leading-snug">
                    ↳ Latest: {inc.action}
                  </p>
                )}
                {inc.nextAction && (
                  <p className="text-[9px] text-indigo-400 mt-0.5 leading-snug">
                    ⟳ Next: {inc.nextAction}
                  </p>
                )}
              </div>
              <span className="text-[9px] text-slate-500 whitespace-nowrap shrink-0">
                {formatTs(inc.timestamp)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[10px] text-slate-600 text-center py-4">
            {filter === "all" ? "No incidents" : `No ${filter} incidents`}
          </p>
        )}
      </div>
    </section>
  );
});

export default IncidentTimeline;
