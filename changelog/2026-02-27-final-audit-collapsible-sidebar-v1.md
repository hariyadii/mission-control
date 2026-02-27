# Changelog: Final Audit + Collapsible Sidebar v1

## Timestamp
2026-02-27T00:00:00Z

## Actor
kilo/anthropic/claude-sonnet-4.6 (Kilo Code agent)

## Task / Trigger
Branch: `feat/final-audit-and-collapsible-sidebar-v1` from master @ `77c17365d63b346055e33cf7a7622dc1024c585c`

Full-system audit (backend + autonomy + frontend) followed by collapsible sidebar feature implementation.

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `src/components/Sidebar.tsx` | Feature | Full rewrite — collapsible desktop toggle, mobile off-canvas drawer, localStorage persistence, ARIA attributes |
| `src/app/globals.css` | Enhancement | CSS variables for sidebar widths, collapsible classes (`sidebar-root`, `sidebar-expanded`, `sidebar-collapsed`), mobile off-canvas responsive rules |
| `src/app/control/page.tsx` | Fix | Wrapped `refresh` in `useCallback`; added `refresh` to `useEffect` dependency array (fixes stale closure risk) |
| `changelog/2026-02-27-final-audit-collapsible-sidebar-v1.md` | Docs | This file |

---

## Change Summary

### Audit Findings (VALID)

| # | Severity | Area | Finding |
|---|----------|------|---------|
| F1 | **High** | Frontend/Sidebar | No collapsible toggle — sidebar always expanded; no `aria-expanded`, no `aria-controls`, no localStorage state, no mobile off-canvas |
| F2 | **Medium** | Frontend/Control | `refresh` async function used inside `useEffect` without being in the dependency array — stale closure risk under future React strict mode |
| F3 | **Medium** | Frontend/Tasks | Timer refs (`showT`, `hideT`) in `TaskCard` use `let` at component scope instead of `useRef` — low-severity memory pattern, benign at current usage but non-idiomatic |
| F4 | **Medium** | Backend/Autonomy | Hardcoded absolute paths (`/home/ubuntu/...`) — portability risk, not a runtime bug |
| F5 | **Medium** | Backend/Control | `killSwitch` action targets a hardcoded set of 5 cron job names — won't cover new jobs automatically |
| F6 | **Low** | Scripts | `handoff-health.sh:38` arithmetic on potentially unset variable — guarded by `:-0` defaults in practice |
| F7 | **Low** | CSS | `.sidebar` width hardcoded literal `220px` — replaced with CSS variable |

### Fixes Implemented

**F1 → Fixed** (collapsible sidebar):
- Desktop: "Collapse/Expand" toggle button at sidebar footer; collapses to icon-only 64px strip
- Mobile (≤768px): off-canvas drawer with hamburger button, backdrop overlay, slide-in transition
- State persisted to `localStorage` key `mc_sidebar_collapsed`
- Keyboard accessible: toggle button is focusable with `aria-expanded` and `aria-controls="main-sidebar"`
- Escape key closes mobile drawer; focus returns to toggle button
- Route change auto-closes mobile drawer
- Visual style preserved (same colors, borders, active indicators, icon layout)

**F2 → Fixed** (`control/page.tsx`):
- `refresh` wrapped in `useCallback`
- Added to `useEffect` dependency array — eliminates stale closure warning

**F7 → Fixed** (`globals.css`):
- Introduced `--sidebar-expanded-w: 220px` and `--sidebar-collapsed-w: 64px` CSS variables
- `.sidebar-root`, `.sidebar-expanded`, `.sidebar-collapsed` classes drive width via variables

### No-change findings (by design)
- F3: timer refs in `TaskCard` — benign pattern, fix would require more invasive refactor; deferred
- F4: hardcoded paths — env-specific by design; no fix needed
- F5: hardcoded kill-switch targets — operational policy; no fix needed in this pass

---

## Verification

| Check | Result |
|-------|--------|
| `npm run build` — TypeScript compile | ✓ Compiled successfully |
| `npm run build` — Type check | ✓ Linting and checking validity of types |
| Prerender errors | ✗ Pre-existing (no `NEXT_PUBLIC_CONVEX_URL`; unrelated to this change) |
| `bash -n scripts/autonomy-readiness-check.sh` | ✓ PASS |
| `bash -n scripts/handoff-health.sh` | ✓ PASS |
| `bash -n scripts/cron-self-heal.sh` | ✓ PASS |

---

## Rollback Note

```bash
git revert HEAD --no-edit
# or
git checkout 77c17365d63b346055e33cf7a7622dc1024c585c -- src/components/Sidebar.tsx src/app/globals.css src/app/control/page.tsx
```

To revert only the sidebar:
```bash
git checkout 77c17365d63b346055e33cf7a7622dc1024c585c -- src/components/Sidebar.tsx src/app/globals.css
```

---

## Links
- Base SHA: `77c17365d63b346055e33cf7a7622dc1024c585c`
- Branch: `feat/final-audit-and-collapsible-sidebar-v1`
- Sidebar component: `src/components/Sidebar.tsx`
- CSS tokens: `src/app/globals.css` (lines 205–244)
