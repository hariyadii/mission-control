"use client";
/**
 * StatusDot components — Mission Control shared UI
 *
 * Extracted from src/components/ui.tsx
 * All components are React.memo wrapped for pure display performance.
 *
 * Exports:
 *   HealthDot        — binary ok/fail indicator dot
 *   PulseIndicator   — colored dot with optional label and pulse animation
 */
import React, { memo } from "react";

// ─── HealthDot ────────────────────────────────────────────────────────────────

export interface HealthDotProps {
  /** Whether the system/service is healthy */
  ok: boolean;
  /** Size variant — sm = 6px, md = 8px */
  size?: "sm" | "md";
}

export const HealthDot = memo(function HealthDot({ ok, size = "md" }: HealthDotProps) {
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
});

HealthDot.displayName = "HealthDot";

// ─── PulseIndicator ───────────────────────────────────────────────────────────

export type PulseColor = "emerald" | "amber" | "rose" | "cyan" | "violet";

export interface PulseIndicatorProps {
  /** Dot and text color */
  color?: PulseColor;
  /** Optional text label rendered next to the dot */
  label?: string;
  /** Whether to animate the dot with a pulse */
  pulse?: boolean;
}

const DOT_COLOR: Record<PulseColor, string> = {
  emerald: "bg-emerald-400",
  amber:   "bg-amber-400",
  rose:    "bg-rose-400",
  cyan:    "bg-cyan-400",
  violet:  "bg-violet-400",
};

const TEXT_COLOR: Record<PulseColor, string> = {
  emerald: "text-emerald-400",
  amber:   "text-amber-400",
  rose:    "text-rose-400",
  cyan:    "text-cyan-400",
  violet:  "text-violet-400",
};

export const PulseIndicator = memo(function PulseIndicator({
  color = "emerald",
  label,
  pulse = true,
}: PulseIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${TEXT_COLOR[color]}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLOR[color]} ${pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
});

PulseIndicator.displayName = "PulseIndicator";
