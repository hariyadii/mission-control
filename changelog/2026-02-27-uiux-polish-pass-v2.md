# UI/UX Polish Pass v2 — 2026-02-27

**Branch:** `feat/uiux-polish-pass-v2`  
**Base:** `master` @ `be339c5` (merge: uiux rebuild v1)  
**Scope:** Strict regression + polish sweep across all 12 UI files

---

## Summary

Followed uiux-rebuild-v1 with a focused audit across all 9 page files, Sidebar, ui.tsx, and globals.css.
Identified and resolved 20 distinct issues across responsive behavior, accessibility, interaction states, visual consistency, and data-density safety. No backend, API, or route contract changes.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/app/globals.css` | Focus ring rewrite (WCAG-safe box-shadow), table header padding+border, section-label text bump, mobile tap-target enforcement for sidebar icons, max-h clamp utility, content-wrap min-width:0 |
| `src/components/Sidebar.tsx` | Remove redundant `role="navigation"`, remove incorrect `role="menubar"`/`role="menuitem"` ARIA, add `aria-label` on nav links for collapsed state, `aria-hidden` on logo mark, kbd aria-label |
| `src/components/ui.tsx` | MetricCard label 9px→10px, FilterInput flex/width fix (min-w-0), FilterInput aria-label, FilterSelect `ariaLabel` prop |
| `src/app/page.tsx` | Mission footer `flex-wrap` for 320px, FilterSelect ariaLabels |
| `src/app/tasks/page.tsx` | Preview popup `aria-hidden`, popup width 240→208px (overflow fix), delete button `focus-visible:opacity-100`, status select focus ring, kanban `max-h` clamp, FilterSelect ariaLabels |
| `src/app/team/page.tsx` | Card `min-w-0`, header flex `gap-2`+`flex-wrap`, remove `line-clamp` on role text |
| `src/app/office/page.tsx` | "Create work order" button `py-3 min-h-[44px]` tap target, `min-w-0` on card |
| `src/app/capital/page.tsx` | Position price row `min-w-0`+`gap-2`+`truncate` for overflow |
| `src/app/control/page.tsx` | X Actions card `min-w-0`+`truncate`, cron row `flex-1 min-w-0` truncation fix |
| `src/app/audit/page.tsx` | Audit list `max-h` clamped via `max(240px, calc(100vh-400px))`, FilterSelect ariaLabels |
| `src/app/calendar/page.tsx` | Calendar day buttons `min-h-[44px]`, `aria-label` with date+note count, `aria-pressed`, border-white/6→/8 |
| `src/app/memory/page.tsx` | `<pre>` `max-w-full` to prevent layout breaks |

---

## Issue → Fix Table

| ID | Category | Issue | Fix | File(s) |
|----|----------|-------|-----|---------|
| A11Y-01 | Accessibility | `role="menubar"` on `<nav>` and `role="menuitem"` on `<Link>` — incorrect ARIA, breaks screen reader navigation semantics | Removed both roles; links announce as navigation links (correct) | Sidebar.tsx |
| A11Y-02 | Accessibility | Delete button `opacity-0` by default — invisible to keyboard users (in tab order but not visible) | Added `focus-visible:opacity-100` so keyboard focus reveals it | tasks/page.tsx |
| A11Y-03 | Accessibility | Calendar day buttons lacked accessible names — screen readers only heard the digit | Added `aria-label` with full date, today indicator, and note count; added `aria-pressed` for selected state | calendar/page.tsx |
| A11Y-04 | Accessibility | Hover preview popup was in DOM without aria marking — screen readers could read it | Added `aria-hidden="true"` to exclude from AT tree | tasks/page.tsx |
| A11Y-05 | Accessibility | Collapsed sidebar nav links had no text for screen readers (label hidden by CSS) | Added `aria-label={label}` on each `<Link>` | Sidebar.tsx |
| INT-01 | Interaction | Focus ring used `ring-offset-slate-950` (#020617) while actual bg is `#060b18` — ring offset color mismatch, subtle visual glitch | Replaced with `box-shadow` double-ring using exact `#060b18` offset; opacity raised to 0.75 | globals.css |
| INT-02 | Interaction | TaskCard inline `<select>` had no visible focus ring beyond border change | Added `focus:ring-1 focus:ring-indigo-400/40` | tasks/page.tsx |
| INT-03 | Interaction | "Create work order" button was ~32px tall at `py-2 text-xs` — below 44px WCAG tap target | Changed to `py-3 min-h-[44px]` | office/page.tsx |
| INT-04 | Interaction | FilterInput/FilterSelect had no `aria-label` — unlabeled form controls | Added `aria-label` on FilterInput, `ariaLabel` prop on FilterSelect; applied across all pages | ui.tsx, page.tsx, tasks/page.tsx, audit/page.tsx |
| RESP-01 | Responsive | Sidebar nav icons at ≤480px had no `min-height` — tap targets could be <44px | Added `.sidebar .nav-link { min-height: 44px }` at ≤480px | globals.css |
| RESP-02 | Responsive | Tasks preview popup `w-60` (240px) could overflow at 375px viewport | Reduced to `w-52` (208px) | tasks/page.tsx |
| RESP-03 | Responsive | Mission footer `flex` without `flex-wrap` — 320px viewport could clip "Control →" button | Added `flex-wrap` | page.tsx |
| RESP-04 | Responsive | content-wrap lacked `min-width: 0` at ≤480px — could allow flex children to overflow | Added `min-width: 0` | globals.css |
| DATA-01 | Data density | Audit list used `max-h-[calc(100vh-400px)]` — goes to 0 or negative on short viewports | Replaced with `max(240px, calc(100vh-400px))` | audit/page.tsx |
| DATA-02 | Data density | Kanban columns used `max-h-[calc(100vh-300px)]` — same floor issue | Replaced with `max(200px, calc(100vh-300px))` | tasks/page.tsx |
| DATA-03 | Data density | Control cron row used fixed `max-w-[200px]` without `flex-1 min-w-0` — truncation ineffective in flex context | Changed to `flex-1 min-w-0 truncate` | control/page.tsx |
| DATA-04 | Data density | Capital position price row had no overflow protection for long price strings | Added `min-w-0 gap-2 truncate` to price span, `shrink-0` to SL/TP span | capital/page.tsx |
| VIS-01 | Visual | MetricCard label `text-[9px]` — below comfortable reading threshold | Bumped to `text-[10px]` | ui.tsx |
| VIS-02 | Visual | `section-label` `text-[10px]` — marginally small for information hierarchy | Bumped to `text-[11px]` | globals.css |
| VIS-03 | Visual | Table `<th>` lacked bottom border and horizontal padding — no visual separation from data rows | Added `border-b border-white/10 px-2 pb-2`; table cells also get `px-2` | globals.css |

---

## Build Result

```
✓ Compiled successfully (TypeScript clean, no new errors)
✓ Generating static pages (19/19)
```

Pre-existing prerender errors for `/`, `/tasks`, `/team`, `/office`, `/capital`, `/control`, `/calendar`, `/audit`, `/memory` — all caused by missing `NEXT_PUBLIC_CONVEX_URL` in build env (identical to master baseline, not introduced by this pass).

---

## Residual UI Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `border-white/6`→`/8` inconsistency in calendar cells | Low | Dozens of `border-white/{5,6,8,10}` values remain scattered. A future design-token pass should consolidate to 3 stops. |
| `text-[9px]` values remain in badge components (`IncidentBadge`, `StatusBadge xs`) | Low | At `xs` size these are intentionally micro-labels; not body text. Monitor if density increases. |
| Kanban hover popup still disappears on keyboard focus-out | Low | Popup is `aria-hidden` so AT is protected, but sighted keyboard users who happen to hover lose the preview; acceptable for current density. |
| Team page always shows `StatusBadge status="online"` regardless of actual agent status | Medium | Hardcoded; requires API data surface change to fix. Out of scope per constraints. |
| Calendar `aria-label` calls `notesForDay(d)` twice per cell render | Low | Minor performance overhead at 42 cells; negligible but could be memoised in a future pass. |
| iOS Safari `input[type=date]` in tasks filter bar renders with native picker and ignores `input-glass` styling partially | Low | Pre-existing limitation of native date inputs; no cross-browser fix without a custom date picker component. |
