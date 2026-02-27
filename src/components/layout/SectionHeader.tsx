"use client";
/**
 * SectionHeader — section heading with optional badge/action
 */
import React from "react";

export interface SectionHeaderProps {
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const SectionHeader = React.memo(function SectionHeader({
  title,
  badge,
  action,
  className = "",
}: SectionHeaderProps) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-2 pb-2",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <h2
          className="text-[10px] font-bold uppercase tracking-widest truncate"
          style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}
        >
          {title}
        </h2>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
});

export default SectionHeader;
