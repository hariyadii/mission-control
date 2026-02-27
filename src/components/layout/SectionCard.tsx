"use client";
/**
 * SectionCard — glass panel content block
 *
 * Extracted from ui.tsx SectionCard. Provides the standard panel-glass
 * container with optional title, badge, and action slot.
 */
import React from "react";

export interface SectionCardProps {
  title?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

const SectionCard = React.memo(function SectionCard({
  title,
  badge,
  children,
  className = "",
  action,
}: SectionCardProps) {
  return (
    <section className={`panel-glass p-3.5 ${className}`}>
      {(title || badge || action) && (
        <div
          className="flex items-center justify-between mb-3"
          style={{
            borderBottom: title ? "1px solid var(--border-subtle)" : undefined,
            paddingBottom: title ? "0.5rem" : undefined,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <h2
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}
              >
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
});

export default SectionCard;
