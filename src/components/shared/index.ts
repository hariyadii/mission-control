/**
 * src/components/shared — barrel exports
 *
 * Import shared UI primitives from this single entry point:
 *
 *   import { StatusBadge, AgentBadge, HealthDot, MetricTile, ... } from "@/components/shared";
 */

// ── Badge ─────────────────────────────────────────────────────────────────────
export type { AgentCode, Severity, StatusBadgeProps, AgentBadgeProps, IncidentBadgeProps } from "./Badge";
export { StatusBadge, AgentBadge, IncidentBadge } from "./Badge";

// ── StatusDot ─────────────────────────────────────────────────────────────────
export type { HealthDotProps, PulseColor, PulseIndicatorProps } from "./StatusDot";
export { HealthDot, PulseIndicator } from "./StatusDot";

// ── MetricCard ────────────────────────────────────────────────────────────────
export type {
  MetricTileVariant,
  MetricTileProps,
  MetricCardAccent,
  MetricCardTrend,
  MetricCardProps,
  SparklineColor,
  SparklineProps,
} from "./MetricCard";
export { MetricTile, MetricCard, Sparkline } from "./MetricCard";

// ── DataTable ─────────────────────────────────────────────────────────────────
export type { DataTableColumn, DataTableProps } from "./DataTable";
export { DataTable } from "./DataTable";

// ── FormControls ──────────────────────────────────────────────────────────────
export type {
  FilterInputProps,
  FilterSelectProps,
  IconButtonProps,
  TooltipProps,
} from "./FormControls";
export { FilterInput, FilterSelect, IconButton, Tooltip } from "./FormControls";

// ── Feedback ──────────────────────────────────────────────────────────────────
export type {
  EmptyStateProps,
  SkeletonBlockProps,
  LoadingSpinnerProps,
  LoadingRowsProps,
} from "./Feedback";
export { EmptyState, SkeletonBlock, LoadingSpinner, LoadingRows } from "./Feedback";
