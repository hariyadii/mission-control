"use client";
/**
 * Mission Control Design System — shared UI primitives v3
 *
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────
 * All visual tokens live in globals.css :root.
 * Components here consume those tokens (CSS vars + Tailwind utility classes).
 * No hard-coded hex colours outside of globals.css.
 *
 * EXPORTED PRIMITIVES
 * ─────────────────────────────────────────────────────────────
 * Layout     : CommandBar, PageHeader, SectionCard, Divider
 * Data       : DataTable, MetricTile, MetricCard (legacy alias), Sparkline
 * Badges     : StatusBadge, AgentBadge, IncidentBadge
 * Indicators : FreshnessIndicator, HealthDot, PulseIndicator
 * Inputs     : FilterInput, FilterSelect
 * Feedback   : EmptyState, LoadingRows, SkeletonBlock
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentCode = "alex" | "sam" | "lyra" | "nova" | "ops" | "me" | "agent";
export type Severity  = "critical" | "warning" | "normal" | "none";

// ─────────────────────────────────────────────────────────────────────────────
// FreshnessIndicator
// ─────────────────────────────────────────────────────────────────────────────

export function FreshnessIndicator({ lastUpdate }: { lastUpdate: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  const diff    = now - lastUpdate;
  const isStale = diff > 60_000;
  const label   =
    diff > 3_600_000 ? `${Math.floor(diff / 3_600_000)}h ago` :
    diff > 60_000    ? `${Math.floor(diff / 60_000)}m ago`    :
    "live";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium ${
        isStale ? "text-amber-400" : "text-emerald-400"
      }`}
      aria-live="polite"
      aria-label={`Data is ${label}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isStale ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
        }`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HealthDot
// ─────────────────────────────────────────────────────────────────────────────

export function HealthDot({ ok, size = "md" }: { ok: boolean; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  return (
    <span
      aria-label={ok ? "Healthy" : "Unhealthy"}
      role="img"
      className={`inline-block rounded-full ${dim} ${
        ok
          ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.75)]"
          : "bg-rose-400 shadow-[0_0_5px_rgba(251,113,133,0.75)]"
      }`}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PulseIndicator — inline status dot with optional label
// ─────────────────────────────────────────────────────────────────────────────

export function PulseIndicator({
  color = "emerald",
  label,
  pulse = true,
}: {
  color?: "emerald" | "amber" | "rose" | "cyan" | "violet";
  label?: string;
  pulse?: boolean;
}) {
  const dotColor: Record<string, string> = {
    emerald: "bg-emerald-400",
    amber:   "bg-amber-400",
    rose:    "bg-rose-400",
    cyan:    "bg-cyan-400",
    violet:  "bg-violet-400",
  };
  const textColor: Record<string, string> = {
    emerald: "text-emerald-400",
    amber:   "text-amber-400",
    rose:    "text-rose-400",
    cyan:    "text-cyan-400",
    violet:  "text-violet-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${textColor[color]}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor[color]} ${pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────

type BadgeConfig = { label: string; colorClass: string; bgClass: string };

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
  disabled:    { label: "OFF",     colorClass: "text-slate-400",    bgClass: "bg-slate-700/45 border border-slate-600/38"      },
  paper:       { label: "PAPER",   colorClass: "text-violet-300",   bgClass: "bg-violet-500/15 border border-violet-500/28"   },
  live:        { label: "LIVE",    colorClass: "text-rose-300",     bgClass: "bg-rose-500/15 border border-rose-500/28"        },
  active:      { label: "ACTIVE",  colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  online:      { label: "ONLINE",  colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  offline:     { label: "OFFLINE", colorClass: "text-slate-400",    bgClass: "bg-slate-700/45 border border-slate-600/38"      },
  busy:        { label: "BUSY",    colorClass: "text-amber-300",    bgClass: "bg-amber-500/15 border border-amber-500/28"      },
  success:     { label: "OK",      colorClass: "text-emerald-300",  bgClass: "bg-emerald-500/15 border border-emerald-500/28"  },
  pending:     { label: "PEND",    colorClass: "text-amber-300",    bgClass: "bg-amber-500/15 border border-amber-500/28"      },
  error:       { label: "ERROR",   colorClass: "text-rose-300",     bgClass: "bg-rose-500/15 border border-rose-500/28"        },
  running:     { label: "RUN",     colorClass: "text-cyan-300",     bgClass: "bg-cyan-500/15 border border-cyan-500/28"        },
};

const SIZE_CLS = {
  xs: "px-1.5 py-0.5 text-[9px]",
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "xs" | "sm" | "md";
}) {
  const key = status?.toLowerCase() ?? "";
  const c: BadgeConfig = STATUS_MAP[key] ?? {
    label:      key.slice(0, 6).toUpperCase() || "—",
    colorClass: "text-slate-300",
    bgClass:    "bg-slate-700/45 border border-slate-600/38",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold tracking-wider ${c.colorClass} ${c.bgClass} ${SIZE_CLS[size]}`}
    >
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentBadge
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_MAP: Record<string, BadgeConfig> = {
  sam:   { label: "SAM",   colorClass: "text-cyan-300",    bgClass: "bg-cyan-500/15 border border-cyan-500/28"     },
  lyra:  { label: "LYRA",  colorClass: "text-violet-300",  bgClass: "bg-violet-500/15 border border-violet-500/28" },
  alex:  { label: "ALEX",  colorClass: "text-amber-300",   bgClass: "bg-amber-500/15 border border-amber-500/28"   },
  nova:  { label: "NOVA",  colorClass: "text-rose-300",    bgClass: "bg-rose-500/15 border border-rose-500/28"     },
  ops:   { label: "OPS",   colorClass: "text-slate-300",   bgClass: "bg-slate-700/45 border border-slate-600/38"   },
  me:    { label: "ME",    colorClass: "text-emerald-300", bgClass: "bg-emerald-500/15 border border-emerald-500/28"},
  agent: { label: "AGENT", colorClass: "text-slate-400",   bgClass: "bg-slate-700/45 border border-slate-600/38"   },
};

export function AgentBadge({
  agent,
  size = "sm",
}: {
  agent: string;
  size?: "xs" | "sm" | "md";
}) {
  const key = agent?.toLowerCase() ?? "";
  const c: BadgeConfig = AGENT_MAP[key] ?? {
    label:      key.slice(0, 4).toUpperCase() || "—",
    colorClass: "text-slate-300",
    bgClass:    "bg-slate-700/45 border border-slate-600/38",
  };
  return (
    <span className={`inline-flex items-center rounded-md font-semibold ${c.colorClass} ${c.bgClass} ${SIZE_CLS[size]}`}>
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IncidentBadge
// ─────────────────────────────────────────────────────────────────────────────

export function IncidentBadge({ severity }: { severity: string }) {
  const map: Record<string, BadgeConfig> = {
    critical: { label: "CRIT", colorClass: "text-rose-300",    bgClass: "bg-rose-500/22 border border-rose-500/38"     },
    warning:  { label: "WARN", colorClass: "text-amber-300",   bgClass: "bg-amber-500/22 border border-amber-500/38"   },
    normal:   { label: "OK",   colorClass: "text-emerald-300", bgClass: "bg-emerald-500/22 border border-emerald-500/38"},
  };
  const c = map[severity] ?? { label: "—", colorClass: "text-slate-300", bgClass: "bg-slate-700/45 border border-slate-600/38" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold ${c.colorClass} ${c.bgClass}`}>
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandBar — sticky top bar injected at the page level
// ─────────────────────────────────────────────────────────────────────────────

export function CommandBar({
  title,
  subtitle,
  left,
  right,
}: {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className="command-bar"
      role="banner"
      aria-label="Command bar"
    >
      {/* Left slot */}
      {left && <div className="flex items-center gap-2 shrink-0">{left}</div>}

      {/* Title */}
      {(title || subtitle) && (
        <div className="flex flex-col justify-center min-w-0 flex-1">
          {title && <span className="command-bar__title">{title}</span>}
          {subtitle && <span className="command-bar__subtitle">{subtitle}</span>}
        </div>
      )}

      {/* Spacer when no title/left */}
      {!title && !subtitle && !left && <div className="flex-1" />}

      {/* Right slot */}
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader — page-level title block (rendered below CommandBar)
// ─────────────────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header
      className="flex items-center justify-between gap-4 pb-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight leading-tight truncate" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex items-center gap-2.5 shrink-0">{right}</div>}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────────────────

export function Divider({ subtle = false }: { subtle?: boolean }) {
  return (
    <hr
      className={subtle ? "divider-subtle" : "divider"}
      style={{ margin: 0 }}
      aria-hidden="true"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionCard — primary content block
// ─────────────────────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  badge,
  children,
  className = "",
  action,
}: {
  title?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`panel-glass p-3.5 ${className}`}>
      {(title || badge || action) && (
        <div className="flex items-center justify-between mb-3" style={{ borderBottom: title ? "1px solid var(--border-subtle)" : undefined, paddingBottom: title ? "0.5rem" : undefined }}>
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>
                {title}
              </h2>
            )}
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricTile — primary KPI block
// ─────────────────────────────────────────────────────────────────────────────

type MetricTileVariant = "ok" | "warn" | "crit" | "info" | "violet" | "none";

export function MetricTile({
  label,
  value,
  sub,
  variant = "none",
  loading = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  variant?: MetricTileVariant;
  loading?: boolean;
}) {
  const accentClass = variant !== "none" ? `metric-tile--${variant}` : "";
  return (
    <div className={`metric-tile ${accentClass}`} role="figure" aria-label={`${label}: ${loading ? "loading" : value}`}>
      <span className="metric-tile__label">{label}</span>
      {loading ? (
        <span className="skeleton h-6 w-16 mt-0.5" />
      ) : (
        <span className="metric-tile__value">{value}</span>
      )}
      {sub && !loading && <span className="metric-tile__sub">{sub}</span>}
    </div>
  );
}

// Legacy alias — keeps page.tsx working without changes
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
  const trendIcon  = { up: "↑", down: "↓", stable: "→" }[trend ?? "stable"];
  const trendColor = { up: "text-emerald-400", down: "text-rose-400", stable: "text-slate-500" }[trend ?? "stable"];
  const variantMap: Record<string, MetricTileVariant> = {
    emerald: "ok",
    rose:    "crit",
    cyan:    "info",
    violet:  "violet",
    amber:   "warn",
  };
  const variant: MetricTileVariant = accent ? variantMap[accent] : "none";
  return (
    <div className={`metric-tile ${variant !== "none" ? `metric-tile--${variant}` : ""}`}>
      <span className="metric-tile__label">{label}</span>
      <span className="metric-tile__value">{value}</span>
      {trend && (
        <span className={`metric-tile__sub ${trendColor}`}>{trendIcon}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline — tiny 7-slot bar chart
// ─────────────────────────────────────────────────────────────────────────────

export function Sparkline({
  data,
  color = "emerald",
  height = 16,
}: {
  data: number[];
  color?: "emerald" | "cyan" | "violet" | "amber" | "rose";
  height?: number;
}) {
  const maxVal = Math.max(...data.filter((x) => x > 0), 1);
  const colorCls: Record<string, string> = {
    emerald: "bg-emerald-500/65",
    cyan:    "bg-cyan-500/65",
    violet:  "bg-violet-500/65",
    amber:   "bg-amber-500/65",
    rose:    "bg-rose-500/65",
  };
  return (
    <div
      className="flex items-end gap-px shrink-0"
      style={{ height }}
      aria-hidden="true"
      role="img"
    >
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${v > 0 ? colorCls[color] : "bg-slate-800"}`}
          style={{ height: `${v > 0 ? Math.max(18, (v / maxVal) * 100) : 15}%` }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DataTable — accessible tabular data with token-based styles
// ─────────────────────────────────────────────────────────────────────────────

export type DataTableColumn<T> = {
  key: string;
  header: string;
  width?: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T extends { id?: string; _id?: string }>({
  columns,
  rows,
  compact = false,
  emptyMessage = "No data",
  getKey,
  className = "",
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  compact?: boolean;
  emptyMessage?: string;
  getKey?: (row: T) => string;
  className?: string;
}) {
  const rowKey = (row: T, i: number) =>
    getKey ? getKey(row) : String(row._id ?? row.id ?? i);
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className={`data-table ${compact ? "data-table--compact" : ""}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-6 muted text-xs">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((col) => (
                  <td key={col.key} className={col.className ?? ""}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterInput
// ─────────────────────────────────────────────────────────────────────────────

export function FilterInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`flex-1 min-w-0 input-glass text-xs ${className}`}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterSelect
// ─────────────────────────────────────────────────────────────────────────────

export function FilterSelect({
  value,
  onChange,
  children,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`input-glass text-xs w-auto ${className}`}
    >
      {children}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState — consistent no-data placeholder
// ─────────────────────────────────────────────────────────────────────────────

export function EmptyState({
  icon = "○",
  message,
  sub,
}: {
  icon?: string;
  message: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 px-4 text-center">
      <span className="text-2xl text-slate-700 leading-none" aria-hidden="true">{icon}</span>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{message}</p>
      {sub && <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoadingRows — skeleton placeholder for tables
// ─────────────────────────────────────────────────────────────────────────────

export function LoadingRows({ cols = 4, rows = 4 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}>
              <span className={`skeleton h-3 block ${j === 0 ? "w-32" : j === cols - 1 ? "w-12" : "w-20"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonBlock — generic loading placeholder
// ─────────────────────────────────────────────────────────────────────────────

export function SkeletonBlock({ width = "100%", height = "1rem", className = "" }: { width?: string; height?: string; className?: string }) {
  return <span className={`skeleton block ${className}`} style={{ width, height }} aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// IconButton — accessible square button
// ─────────────────────────────────────────────────────────────────────────────

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: { label: string; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`btn-icon ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip — lightweight hover label (keyboard/mouse)
// ─────────────────────────────────────────────────────────────────────────────

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 fade-in
                     whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium shadow-lg"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-primary)",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
