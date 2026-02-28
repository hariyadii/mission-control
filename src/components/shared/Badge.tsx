"use client";
/**
 * Badge components — Mission Control shared UI
 *
 * Extracted from src/components/ui.tsx
 * All components are React.memo wrapped for pure display performance.
 *
 * Exports:
 *   StatusBadge   — task/system status pill
 *   AgentBadge    — agent identity pill
 *   IncidentBadge — severity indicator pill
 *   AgentCode     — type alias for agent identifiers
 *   Severity      — type alias for severity levels
 */
import React, { memo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentCode = "alex" | "sam" | "lyra" | "nova" | "ops" | "me" | "agent";
export type Severity  = "critical" | "warning" | "normal" | "none";

type BadgeConfig = { label: string; colorClass: string; bgClass: string };

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_CLS: Record<"xs" | "sm" | "md", string> = {
  xs: "px-1.5 py-0.5 text-[9px]",
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
};

// ─── StatusBadge ──────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, BadgeConfig> = {
  suggested:   { label: "SUGG",    colorClass: "text-fuchsia-300",  bgClass: "bg-fuchsia-500/15 border border-fuchsia-500/28"  },
  backlog:     { label: "BACKLOG", colorClass: "text-indigo-300",   bgClass: "bg-indigo-500/15 border border-indigo-500/28"    },
  in_progress: { label: "RUN",     colorClass: "text-cyan-300",     bgClass: "bg-cyan-500/15 border border-cyan-500/28"        },
  blocked:     { label: "BLOCK",   colorClass: "text-amber-300",    bgClass: "bg-amber-500/15 border border-amber-500/28"      },
  done:        { label: "DONE",    colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  failed:      { label: "FAIL",    colorClass: "text-rose-300",     bgClass: "bg-rose-500/15 border border-rose-500/28"        },
  ok:          { label: "OK",      colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  warning:     { label: "WARN",    colorClass: "text-amber-300",    bgClass: "bg-amber-500/15 border border-amber-500/28"      },
  critical:    { label: "CRIT",    colorClass: "text-rose-300",     bgClass: "bg-rose-500/15 border border-rose-500/28"        },
  none:        { label: "OK",      colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  enabled:     { label: "ON",      colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  disabled:    { label: "OFF",     colorClass: "text-stone-500",    bgClass: "bg-stone-200/45 border border-stone-300/38"      },
  paper:       { label: "PAPER",   colorClass: "text-violet-300",   bgClass: "bg-violet-500/15 border border-violet-500/28"   },
  live:        { label: "LIVE",    colorClass: "text-rose-300",     bgClass: "bg-rose-500/15 border border-rose-500/28"        },
  active:      { label: "ACTIVE",  colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  online:      { label: "ONLINE",  colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  offline:     { label: "OFFLINE", colorClass: "text-stone-500",    bgClass: "bg-stone-200/45 border border-stone-300/38"      },
  busy:        { label: "BUSY",    colorClass: "text-amber-300",    bgClass: "bg-amber-500/15 border border-amber-500/28"      },
  success:     { label: "OK",      colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  pending:     { label: "PEND",    colorClass: "text-amber-300",    bgClass: "bg-amber-500/15 border border-amber-500/28"      },
  error:       { label: "ERROR",   colorClass: "text-rose-300",     bgClass: "bg-rose-500/15 border border-rose-500/28"        },
  running:     { label: "RUN",     colorClass: "text-cyan-300",     bgClass: "bg-cyan-500/15 border border-cyan-500/28"        },
};

export interface StatusBadgeProps {
  status: string;
  size?: "xs" | "sm" | "md";
}

export const StatusBadge = memo(function StatusBadge({
  status,
  size = "sm",
}: StatusBadgeProps) {
  const key = status?.toLowerCase() ?? "";
  const c: BadgeConfig = STATUS_MAP[key] ?? {
    label:      key.slice(0, 6).toUpperCase() || "—",
    colorClass: "text-stone-600",
    bgClass:    "bg-stone-200/45 border border-stone-300/38",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold tracking-wider ${c.colorClass} ${c.bgClass} ${SIZE_CLS[size]}`}
    >
      {c.label}
    </span>
  );
});

StatusBadge.displayName = "StatusBadge";

// ─── AgentBadge ───────────────────────────────────────────────────────────────

const AGENT_MAP: Record<string, BadgeConfig> = {
  sam:   { label: "SAM",   colorClass: "text-cyan-300",    bgClass: "bg-cyan-500/15 border border-cyan-500/28"     },
  lyra:  { label: "LYRA",  colorClass: "text-violet-300",  bgClass: "bg-violet-500/15 border border-violet-500/28" },
  alex:  { label: "ALEX",  colorClass: "text-amber-300",   bgClass: "bg-amber-500/15 border border-amber-500/28"   },
  nova:  { label: "NOVA",  colorClass: "text-rose-300",    bgClass: "bg-rose-500/15 border border-rose-500/28"     },
  ops:   { label: "OPS",   colorClass: "text-stone-600",   bgClass: "bg-stone-200/45 border border-stone-300/38"   },
  me:    { label: "ME",    colorClass: "text-emerald-300", bgClass: "bg-emerald-500/15 border border-emerald-500/28"},
  agent: { label: "AGENT", colorClass: "text-stone-500",   bgClass: "bg-stone-200/45 border border-stone-300/38"   },
};

export interface AgentBadgeProps {
  agent: string;
  size?: "xs" | "sm" | "md";
}

export const AgentBadge = memo(function AgentBadge({
  agent,
  size = "sm",
}: AgentBadgeProps) {
  const key = agent?.toLowerCase() ?? "";
  const c: BadgeConfig = AGENT_MAP[key] ?? {
    label:      key.slice(0, 4).toUpperCase() || "—",
    colorClass: "text-stone-600",
    bgClass:    "bg-stone-200/45 border border-stone-300/38",
  };
  return (
    <span className={`inline-flex items-center rounded-md font-semibold ${c.colorClass} ${c.bgClass} ${SIZE_CLS[size]}`}>
      {c.label}
    </span>
  );
});

AgentBadge.displayName = "AgentBadge";

// ─── IncidentBadge ────────────────────────────────────────────────────────────

const INCIDENT_MAP: Record<string, BadgeConfig> = {
  critical: { label: "CRIT", colorClass: "text-rose-300",    bgClass: "bg-rose-500/22 border border-rose-500/38"     },
  warning:  { label: "WARN", colorClass: "text-amber-300",   bgClass: "bg-amber-500/22 border border-amber-500/38"   },
  normal:   { label: "OK",   colorClass: "text-emerald-300", bgClass: "bg-emerald-500/22 border border-emerald-500/38"},
};

export interface IncidentBadgeProps {
  severity: string;
}

export const IncidentBadge = memo(function IncidentBadge({ severity }: IncidentBadgeProps) {
  const c = INCIDENT_MAP[severity] ?? {
    label:      "—",
    colorClass: "text-stone-600",
    bgClass:    "bg-stone-200/45 border border-stone-300/38",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold ${c.colorClass} ${c.bgClass}`}>
      {c.label}
    </span>
  );
});

IncidentBadge.displayName = "IncidentBadge";
