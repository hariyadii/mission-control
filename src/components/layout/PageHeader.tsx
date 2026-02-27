"use client";
/**
 * PageHeader — page-level title block
 *
 * Extracted from ui.tsx PageHeader. Renders the page title and optional
 * subtitle with a right-side action slot.
 */
import React from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

const PageHeader = React.memo(function PageHeader({
  title,
  subtitle,
  right,
}: PageHeaderProps) {
  return (
    <header
      className="flex items-center justify-between gap-4 pb-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="min-w-0">
        <h1
          className="text-lg font-bold tracking-tight leading-tight truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-[11px] mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {right && (
        <div className="flex items-center gap-2.5 shrink-0">{right}</div>
      )}
    </header>
  );
});

export default PageHeader;
