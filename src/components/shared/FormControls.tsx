"use client";
/**
 * FormControls components — Mission Control shared UI
 *
 * Extracted from src/components/ui.tsx
 * All pure display components are React.memo wrapped.
 *
 * Exports:
 *   FilterInput   — search/filter text input
 *   FilterSelect  — dropdown select for filter options
 *   IconButton    — accessible square icon button
 *   Tooltip       — lightweight hover/focus tooltip wrapper
 */
import React, { memo, useState, useRef } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";

// ─── FilterInput ──────────────────────────────────────────────────────────────

export interface FilterInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export const FilterInput = memo(function FilterInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: FilterInputProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`flex-1 min-w-0 input-glass text-xs ${className}`}
    />
  );
});

FilterInput.displayName = "FilterInput";

// ─── FilterSelect ─────────────────────────────────────────────────────────────

export interface FilterSelectProps {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export const FilterSelect = memo(function FilterSelect({
  value,
  onChange,
  children,
  className = "",
  ariaLabel,
}: FilterSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`input-glass text-xs w-auto ${className}`}
    >
      {children}
    </select>
  );
});

FilterSelect.displayName = "FilterSelect";

// ─── IconButton ───────────────────────────────────────────────────────────────

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label for screen readers */
  label: string;
  children: ReactNode;
  className?: string;
}

export const IconButton = memo(function IconButton({
  label,
  children,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`btn-icon ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

IconButton.displayName = "IconButton";

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export interface TooltipProps {
  /** Tooltip text content */
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 fade-in
                     whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium shadow-lg"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-primary)",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
