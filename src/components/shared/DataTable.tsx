"use client";
/**
 * DataTable component — Mission Control shared UI
 *
 * Extracted from src/components/ui.tsx
 * Accessible tabular data component with token-based styles.
 *
 * Exports:
 *   DataTable       — generic typed table with column definitions
 *   DataTableColumn — column definition type
 */
import React, { memo } from "react";
import type { ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataTableColumn<T> = {
  /** Unique key for this column */
  key: string;
  /** Column header text */
  header: string;
  /** Optional fixed width (CSS value) */
  width?: string;
  /** Optional extra className for td cells */
  className?: string;
  /** Render function for cell content */
  render: (row: T) => ReactNode;
};

export interface DataTableProps<T extends { id?: string; _id?: string }> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Use compact row padding */
  compact?: boolean;
  /** Message shown when rows is empty */
  emptyMessage?: string;
  /** Custom row key extractor */
  getKey?: (row: T) => string;
  /** Extra className on the wrapper div */
  className?: string;
}

// ─── DataTable ────────────────────────────────────────────────────────────────

function DataTableInner<T extends { id?: string; _id?: string }>({
  columns,
  rows,
  compact = false,
  emptyMessage = "No data",
  getKey,
  className = "",
}: DataTableProps<T>) {
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

// React.memo doesn't work directly with generic components, so we export
// the inner function directly. For pure display use cases, callers can
// wrap with useMemo on the rows/columns props.
export const DataTable = DataTableInner as typeof DataTableInner;
