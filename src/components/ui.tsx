"use client";
/**
 * Shared UI primitives — Mission Control v2.1
 * All page-level components import from here for visual consistency.
 */
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentCode = "alex" | "sam" | "lyra" | "nova" | "ops" | "me" | "agent";
export type Severity = "critical" | "warning" | "normal" | "none";

// ─── FreshnessIndicator ───────────────────────────────────────────────────────

export function FreshnessIndicator({ lastUpdate }: { lastUpdate: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  const diff = now - lastUpdate;
  const isStale = diff > 60_000;
  const label =
    diff > 3_600_000
      ? `${Math.floor(diff / 3_600_000)}h ago`
      : diff > 60_000
      ? `${Math.floor(diff / 60_000)}m ago`
      : "live";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${isStale ? "text-amber-400" : "text-emerald-400"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isStale ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
      {label}
    </span>
  );
}

// ─── HealthDot ────────────────────────────────────────────────────────────────

export function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        ok
          ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
          : "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]"
      }`}
    />
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

type StatusConfig = { label: string; color: string; bg: string };

const TASK_STATUS: Record<string, StatusConfig> = {
  suggested:   { label: "SUGG",    color: "text-fuchsia-300", bg: "bg-fuchsia-500/20 border border-fuchsia-500/30" },
  backlog:     { label: "BACKLOG", color: "text-indigo-300",  bg: "bg-indigo-500/20 border border-indigo-500/30"  },
  in_progress: { label: "RUN",     color: "text-cyan-300",    bg: "bg-cyan-500/20 border border-cyan-500/30"      },
  blocked:     { label: "BLOCK",   color: "text-amber-300",   bg: "bg-amber-500/20 border border-amber-500/30"    },
  done:        { label: "DONE",    color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  failed:      { label: "FAIL",    color: "text-rose-300",    bg: "bg-rose-500/20 border border-rose-500/30"      },
  ok:          { label: "OK",      color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  warning:     { label: "WARN",    color: "text-amber-300",   bg: "bg-amber-500/20 border border-amber-500/30"    },
  critical:    { label: "CRIT",    color: "text-rose-300",    bg: "bg-rose-500/20 border border-rose-500/30"      },
  none:        { label: "OK",      color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  enabled:     { label: "ON",      color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  disabled:    { label: "OFF",     color: "text-slate-400",   bg: "bg-slate-700/50 border border-slate-600/40"   },
  paper:       { label: "PAPER",   color: "text-violet-300",  bg: "bg-violet-500/20 border border-violet-500/30" },
  live:        { label: "LIVE",    color: "text-rose-300",    bg: "bg-rose-500/20 border border-rose-500/30"     },
  active:      { label: "ACTIVE",  color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  online:      { label: "ONLINE",  color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  offline:     { label: "OFFLINE", color: "text-slate-400",   bg: "bg-slate-700/50 border border-slate-600/40"  },
  busy:        { label: "BUSY",    color: "text-amber-300",   bg: "bg-amber-500/20 border border-amber-500/30"   },
  success:     { label: "OK",      color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  pending:     { label: "PEND",    color: "text-amber-300",   bg: "bg-amber-500/20 border border-amber-500/30"   },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "xs" | "sm" | "md";
}) {
  const c =
    TASK_STATUS[status?.toLowerCase()] ??
    ({ label: status?.slice(0, 6).toUpperCase() ?? "—", color: "text-slate-300", bg: "bg-slate-700/50 border border-slate-600/40" } as StatusConfig);
  const sizeClass =
    size === "xs"
      ? "px-1.5 py-0.5 text-[9px]"
      : size === "md"
      ? "px-3 py-1 text-xs"
      : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center rounded-md font-semibold tracking-wider ${c.color} ${c.bg} ${sizeClass}`}>
      {c.label}
    </span>
  );
}

// ─── AgentBadge ───────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, StatusConfig> = {
  sam:   { label: "SAM",   color: "text-cyan-300",    bg: "bg-cyan-500/20 border border-cyan-500/30"     },
  lyra:  { label: "LYRA",  color: "text-violet-300",  bg: "bg-violet-500/20 border border-violet-500/30" },
  alex:  { label: "ALEX",  color: "text-amber-300",   bg: "bg-amber-500/20 border border-amber-500/30"   },
  nova:  { label: "NOVA",  color: "text-rose-300",    bg: "bg-rose-500/20 border border-rose-500/30"     },
  ops:   { label: "OPS",   color: "text-slate-300",   bg: "bg-slate-700/50 border border-slate-600/40"  },
  me:    { label: "ME",    color: "text-emerald-300", bg: "bg-emerald-500/20 border border-emerald-500/30"},
  agent: { label: "AGENT", color: "text-slate-400",   bg: "bg-slate-700/50 border border-slate-600/40"  },
};

export function AgentBadge({ agent, size = "sm" }: { agent: string; size?: "xs" | "sm" | "md" }) {
  const c =
    AGENT_COLORS[agent?.toLowerCase()] ??
    ({ label: agent?.slice(0, 4).toUpperCase() ?? "—", color: "text-slate-300", bg: "bg-slate-700/50 border border-slate-600/40" } as StatusConfig);
  const sizeClass =
    size === "xs"
      ? "px-1.5 py-0.5 text-[9px]"
      : size === "md"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center rounded-md font-semibold ${c.color} ${c.bg} ${sizeClass}`}>
      {c.label}
    </span>
  );
}

// ─── IncidentBadge ────────────────────────────────────────────────────────────

export function IncidentBadge({ severity }: { severity: string }) {
  const map: Record<string, StatusConfig> = {
    critical: { label: "CRIT", color: "text-rose-300",    bg: "bg-rose-500/30 border border-rose-500/40"     },
    warning:  { label: "WARN", color: "text-amber-300",   bg: "bg-amber-500/30 border border-amber-500/40"   },
    normal:   { label: "OK",   color: "text-emerald-300", bg: "bg-emerald-500/30 border border-emerald-500/40"},
  };
  const c = map[severity] ?? { label: "—", color: "text-slate-300", bg: "bg-slate-700/50 border border-slate-600/40" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold ${c.color} ${c.bg}`}>
      {c.label}
    </span>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  trend,
  accent,
}: {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "stable";
  accent?: "emerald" | "rose" | "cyan" | "violet" | "amber";
}) {
  const trendIcon = { up: "↑", down: "↓", stable: "→" }[trend ?? "stable"];
  const trendColor = { up: "text-emerald-400", down: "text-rose-400", stable: "text-slate-500" }[trend ?? "stable"];
  const accentBorder: Record<string, string> = {
    emerald: "border-l-2 border-emerald-500/60",
    rose:    "border-l-2 border-rose-500/60",
    cyan:    "border-l-2 border-cyan-500/60",
    violet:  "border-l-2 border-violet-500/60",
    amber:   "border-l-2 border-amber-500/60",
  };
  return (
    <div className={`panel-soft p-2.5 ${accent ? accentBorder[accent] : ""}`}>
      <p className="m-0 text-[9px] uppercase tracking-widest text-slate-500 font-medium">{label}</p>
      <p className="m-0 mt-1 text-sm font-bold text-slate-100 tabular-nums">{value}</p>
      {trend && (
        <p className={`m-0 text-[9px] font-semibold ${trendColor}`}>{trendIcon}</p>
      )}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-4 pb-1 border-b border-white/8">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-100 tracking-tight leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2.5 shrink-0">{right}</div>}
    </header>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  badge,
  children,
  className = "",
}: {
  title?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel-glass p-3 ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</h2>
          {badge && <div>{badge}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

export function FilterInput({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`flex-1 min-w-[120px] input-glass text-xs ${className}`}
    />
  );
}

export function FilterSelect({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`input-glass text-xs w-auto ${className}`}
    >
      {children}
    </select>
  );
}
