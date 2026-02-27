"use client";
/**
 * Divider — horizontal rule with token styling
 *
 * Extracted from ui.tsx Divider. Renders a horizontal rule using
 * CSS token-based border colors.
 */
import React from "react";

export interface DividerProps {
  subtle?: boolean;
  className?: string;
}

const Divider = React.memo(function Divider({
  subtle = false,
  className = "",
}: DividerProps) {
  return (
    <hr
      className={[subtle ? "divider-subtle" : "divider", className]
        .filter(Boolean)
        .join(" ")}
      style={{ margin: 0 }}
      aria-hidden="true"
    />
  );
});

export default Divider;
