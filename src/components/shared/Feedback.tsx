"use client";
/**
 * Feedback components — Mission Control shared UI
 *
 * Extracted from src/components/ui.tsx
 * All pure display components are React.memo wrapped.
 *
 * Exports:
 *   EmptyState      — consistent no-data placeholder with icon + message
 *   SkeletonBlock   — generic loading placeholder block
 *   LoadingSpinner  — animated spinner for async operations
 *   LoadingRows     — skeleton placeholder rows for tables
 */
import React, { memo } from "react";

// ─── EmptyState ───────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Icon character or emoji to display */
  icon?: string;
  /** Primary message text */
  message: string;
  /** Optional secondary/sub message */
  sub?: string;
}

export const EmptyState = memo(function EmptyState({
  icon = "○",
  message,
  sub,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 px-4 text-center">
      <span className="text-2xl text-slate-700 leading-none" aria-hidden="true">
        {icon}
      </span>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>
      {sub && (
        <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          {sub}
        </p>
      )}
    </div>
  );
});

EmptyState.displayName = "EmptyState";

// ─── SkeletonBlock ────────────────────────────────────────────────────────────

export interface SkeletonBlockProps {
  /** CSS width value */
  width?: string;
  /** CSS height value */
  height?: string;
  /** Extra className */
  className?: string;
}

export const SkeletonBlock = memo(function SkeletonBlock({
  width = "100%",
  height = "1rem",
  className = "",
}: SkeletonBlockProps) {
  return (
    <span
      className={`skeleton block ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
});

SkeletonBlock.displayName = "SkeletonBlock";

// ─── LoadingSpinner ───────────────────────────────────────────────────────────

export interface LoadingSpinnerProps {
  /** Size in pixels */
  size?: number;
  /** Spinner color class */
  colorClass?: string;
  /** Accessible label */
  label?: string;
}

export const LoadingSpinner = memo(function LoadingSpinner({
  size = 16,
  colorClass = "border-indigo-400",
  label = "Loading…",
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-flex items-center justify-center"
    >
      <span
        className={`inline-block rounded-full border-2 border-t-transparent animate-spin ${colorClass}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
});

LoadingSpinner.displayName = "LoadingSpinner";

// ─── LoadingRows ──────────────────────────────────────────────────────────────
// Skeleton placeholder rows for use inside a <tbody>

export interface LoadingRowsProps {
  /** Number of columns to span */
  cols?: number;
  /** Number of skeleton rows to render */
  rows?: number;
}

export const LoadingRows = memo(function LoadingRows({
  cols = 4,
  rows = 4,
}: LoadingRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}>
              <span
                className={`skeleton h-3 block ${
                  j === 0 ? "w-32" : j === cols - 1 ? "w-12" : "w-20"
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
});

LoadingRows.displayName = "LoadingRows";
