"use client";
/**
 * PageWrapper — standard page container with scroll isolation
 *
 * Implements the flex-1 min-h-0 overflow-y-auto pattern for proper
 * scroll isolation within the app shell.
 */
import React from "react";

export interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
  /** If true, applies page-enter animation */
  animate?: boolean;
}

const PageWrapper = React.memo(function PageWrapper({
  children,
  className = "",
  animate = true,
}: PageWrapperProps) {
  return (
    <div
      className={[
        "flex flex-col flex-1 min-h-0",
        animate ? "page-enter" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
});

export default PageWrapper;
