"use client";
/**
 * MetricCard components — Mission Control shared UI
 *
 * Extracted from src/components/ui.tsx
 * All components are React.memo wrapped for pure display performance.
 *
 * Exports:
 *   MetricTile       — primary KPI block with variant accent borders
 *   MetricCard       — legacy alias with trend/accent props
 *   Sparkline        — tiny 7-slot bar chart for inline data visualization
 *   MetricTileVariant — type alias for tile accent variants
 */
import React, { memo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricTileVariant = "ok" | "warn" | "crit" | "info" | "violet" | "none";

// ─── MetricTile ───────────────────────────────────────────────────────────────

export interface MetricTileProps {
  label: string;
  value: string | number;
  /** Optional sub-label / secondary text */
  sub?: string;
  /** Accent left-border color variant */
  variant?: MetricTileVariant;
  /** Show skeleton loading state */
  loading?: boolean;
}

export const MetricTile = memo(function MetricTile({
  label,
  value,
  sub,
  variant = "none",
  loading = false,
}: MetricTileProps) {
  const accentClass = variant !== "none" ? `metric-tile--${variant}` : "";
  return (
    <div
      className={`metric-tile ${accentClass}`}
      role="figure"
      aria-label={`${label}: ${loading ? "loading" : value}`}
    >
      <span className="metric-tile__label">{label}</span>
      {loading ? (
        <span className="skeleton h-6 w-16 mt-0.5" />
      ) : (
        <span className="metric-tile__value">{value}</span>
      )}
      {sub && !loading && <span className="metric-tile__sub">{sub}</span>}
    </div>
  );
});

MetricTile.displayName = "MetricTile";

// ─── MetricCard (legacy alias) ────────────────────────────────────────────────

export type MetricCardAccent = "emerald" | "rose" | "cyan" | "violet" | "amber";
export type MetricCardTrend  = "up" | "down" | "stable";

export interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: MetricCardTrend;
  accent?: MetricCardAccent;
}

const VARIANT_MAP: Record<MetricCardAccent, MetricTileVariant> = {
  emerald: "ok",
  rose:    "crit",
  cyan:    "info",
  violet:  "violet",
  amber:   "warn",
};

const TREND_ICON:  Record<MetricCardTrend, string> = { up: "↑", down: "↓", stable: "→" };
const TREND_COLOR: Record<MetricCardTrend, string> = {
  up:     "text-emerald-400",
  down:   "text-rose-400",
  stable: "text-stone-500",
};

export const MetricCard = memo(function MetricCard({
  label,
  value,
  trend,
  accent,
}: MetricCardProps) {
  const variant: MetricTileVariant = accent ? VARIANT_MAP[accent] : "none";
  return (
    <div className={`metric-tile ${variant !== "none" ? `metric-tile--${variant}` : ""}`}>
      <span className="metric-tile__label">{label}</span>
      <span className="metric-tile__value">{value}</span>
      {trend && (
        <span className={`metric-tile__sub ${TREND_COLOR[trend]}`}>
          {TREND_ICON[trend]}
        </span>
      )}
    </div>
  );
});

MetricCard.displayName = "MetricCard";

// ─── Sparkline ────────────────────────────────────────────────────────────────

export type SparklineColor = "emerald" | "cyan" | "violet" | "amber" | "rose";

export interface SparklineProps {
  /** Array of numeric data points (7 recommended) */
  data: number[];
  /** Bar color theme */
  color?: SparklineColor;
  /** Height in pixels */
  height?: number;
}

const SPARKLINE_COLOR: Record<SparklineColor, string> = {
  emerald: "bg-emerald-500/65",
  cyan:    "bg-cyan-500/65",
  violet:  "bg-violet-500/65",
  amber:   "bg-amber-500/65",
  rose:    "bg-rose-500/65",
};

export const Sparkline = memo(function Sparkline({
  data,
  color = "emerald",
  height = 16,
}: SparklineProps) {
  const maxVal = Math.max(...data.filter((x) => x > 0), 1);
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
          className={`flex-1 rounded-sm ${v > 0 ? SPARKLINE_COLOR[color] : "bg-stone-100"}`}
          style={{ height: `${v > 0 ? Math.max(18, (v / maxVal) * 100) : 15}%` }}
        />
      ))}
    </div>
  );
});

Sparkline.displayName = "Sparkline";
