# UI/UX Rebuild v1 — 2026-02-27

**Branch:** `feat/uiux-rebuild-v1`  
**Author:** Nova (kilo/anthropic/claude-sonnet-4.6)

## Summary

Complete UI/UX overhaul of Mission Control dashboard delivering a cohesive design system across all 9 pages.

## Changes

### New: `src/components/ui.tsx`
Shared UI primitive library eliminating per-page duplication:
- `FreshnessIndicator` — live/stale data freshness with animated dot
- `HealthDot` — green/red system health indicator with glow
- `StatusBadge` — unified badge for task status, system health, agent modes (size: xs/sm/md)
- `AgentBadge` — agent identifier badges with brand colours (alex/sam/lyra/nova/ops/me)
- `IncidentBadge` — severity-coded incident labels
- `MetricCard` — compact metric tile with optional accent border + trend arrow
- `PageHeader` — standardised page title/subtitle/right-slot header
- `SectionCard` — glass panel section wrapper with optional title + badge
- `FilterInput` / `FilterSelect` — consistent filter bar components

### Updated: `src/components/Sidebar.tsx`
- Replaced broken Unicode PUA icons with clean ASCII/symbol chars (`◈ ≡ ◷ ◎ ◉ ⌗ ◆ ⊛ ◌`)
- Per-route accent colour system (9 distinct colours)
- Active route: coloured left-bar indicator, tinted background
- Wordmark with gradient `M` logomark + live pulse dot
- Slimmer: 220px (was 240px); collapses to 64px on tablet, 52px on mobile
- Footer: keyboard shortcut hint + version badge

### Updated: `src/app/globals.css`
- Refined colour palette with `--bg-0/1/2` tokens and fixed background-attachment
- Thinner scrollbars (5px, transparent track)
- `.panel-soft-interactive` variant for hover-lift cards
- `.btn-ghost` for lightweight inline actions
- `.btn-primary` / `.btn-secondary` / `.btn-danger` — tighter, consistent
- `.section-label` utility class
- `border-white/8` and `border-white/12` replacing `border-white/10` for subtler lines
- Improved `input-glass` (ring on focus, disabled state)
- Better `@keyframes pageEnter` (6px → 0 translate)

### Updated: All 9 pages
All pages now import shared primitives from `@/components/ui` instead of defining their own:

| Page       | Key Changes |
|------------|-------------|
| Overview   | 3-col grid; pipeline tiles are links to filtered tasks; plugin sparklines only render when data present; cleaner incident / done / queue panels; footer with Control link |
| Tasks      | Column headers use dot + label; hover-preview cards use shared `AgentBadge`/`StatusBadge`; cleaner column header / body separation; improved add-task button |
| Team       | Animated pulse dot matches agent activity; idle vs running state distinction |
| Office     | Gradient submit button per-agent accent; dashed add-order border |
| Capital    | Accent borders on metric cards (emerald/rose for PnL); better position/trade rows |
| Control    | Metric cards for workflow health; cron jobs with monospace IDs; clean policy key/value |
| Memory     | Expand/collapse with ↑↓ labels; better overflow |
| Calendar   | Rounded-lg day cells; selected-day note form; jobs list |
| Audit      | Three stat tiles; hover highlight on rows; agent badge in each row |

## Build
- `next build` passes with 0 type errors
- All pages are `"use client"` — no server-side changes

## Files Changed
```
src/components/ui.tsx             (new)
src/components/Sidebar.tsx        (rebuilt)
src/app/globals.css               (rebuilt)
src/app/page.tsx                  (rebuilt)
src/app/tasks/page.tsx            (rebuilt)
src/app/team/page.tsx             (updated)
src/app/office/page.tsx           (updated)
src/app/capital/page.tsx          (updated)
src/app/control/page.tsx          (updated)
src/app/memory/page.tsx           (updated)
src/app/calendar/page.tsx         (updated)
src/app/audit/page.tsx            (updated)
changelog/2026-02-27-uiux-rebuild-v1.md (this file)
```
