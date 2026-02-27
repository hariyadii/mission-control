"use client";
/**
 * CommandBar — sticky top bar
 *
 * Extracted from ui.tsx CommandBar. Provides the sticky top navigation
 * bar with left/right slots and optional title/subtitle.
 */
import React from "react";

export interface CommandBarProps {
  title?: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

const CommandBar = React.memo(function CommandBar({
  title,
  subtitle,
  left,
  right,
}: CommandBarProps) {
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
});

export default CommandBar;
