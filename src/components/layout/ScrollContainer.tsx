"use client";
/**
 * ScrollContainer — scroll-isolated container
 *
 * Implements the proper scroll isolation pattern:
 * - Parent: flex column, overflow hidden
 * - Child: flex-1, min-height: 0, overflow-y: auto
 *
 * This prevents scroll from leaking to parent containers and ensures
 * each scrollable area scrolls independently.
 */
import React from "react";

export interface ScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Additional inline styles for the scroll area */
  style?: React.CSSProperties;
  /** aria-label for accessibility */
  "aria-label"?: string;
}

const ScrollContainer = React.memo(function ScrollContainer({
  children,
  className = "",
  style,
  "aria-label": ariaLabel,
}: ScrollContainerProps) {
  return (
    <div
      className={[
        "flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
});

export default ScrollContainer;

/**
 * ScrollWrapper — outer wrapper that establishes the flex column context
 * needed for ScrollContainer to work correctly.
 *
 * Usage:
 * <ScrollWrapper>
 *   <SomeHeader />
 *   <ScrollContainer>
 *     {items}
 *   </ScrollContainer>
 * </ScrollWrapper>
 */
export interface ScrollWrapperProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const ScrollWrapper = React.memo(function ScrollWrapper({
  children,
  className = "",
  style,
}: ScrollWrapperProps) {
  return (
    <div
      className={[
        "flex flex-col overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
    </div>
  );
});
