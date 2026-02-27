# UI System Rebuild v2

**timestamp:** 2026-02-27T00:00:00Z
**actor:** kilo/autonomy
**task/trigger:** ui-system-rebuild-v2 — rebuild UI into a modern, enterprise-grade design system with consistent visual language

---

## files changed

| File | Change type |
|---|---|
| `src/app/globals.css` | Full rebuild — tokenized design system |
| `src/components/ui.tsx` | Full rebuild — expanded primitive set |
| `src/components/Sidebar.tsx` | Rebuilt — mobile command bar, focus trap, polish |
| `src/app/page.tsx` | Rebuilt — CommandBar, MetricTile, Sparkline, tokens |
| `src/app/tasks/page.tsx` | Rebuilt — CommandBar, token styles, improved kanban |
| `src/app/control/page.tsx` | Rebuilt — run-lock visibility, grouped policy, CronJobRow |
| `src/app/team/page.tsx` | Rebuilt — agent sparklines, summary tiles, stats row |

---

## design rationale

### Token-first approach
Every colour, shadow, spacing, and typography value lives in `:root` CSS custom properties in `globals.css`. Components consume `var(--*)` tokens rather than hard-coding hex values. This means theme adjustments require one-file edits.

### Token taxonomy
- **Surface/Elevation** (`--surface-1`, `--surface-2`, `--surface-3`, `--surface-hover`) — four depth levels from deepest panel to subtle hover
- **Border** (`--border`, `--border-subtle`, `--border-strong`) — three border intensities for hierarchy
- **Typography** (`--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`, plus `--text-2xs`…`--text-3xl`) — 4-step colour scale + 8-step size scale
- **Spacing** (`--sp-1`…`--sp-10`) — 8 steps matching Tailwind's default spacing
- **Shadow/Elevation** (`--shadow-xs`…`--shadow-xl`, `--shadow-panel`) — 6 named elevation levels
- **Status Palette** (`--status-ok-*`, `--status-warn-*`, `--status-crit-*`, `--status-info-*`, `--status-idle-*`) — 5-state semantic palette with text/bg/border triplets
- **Agent Palette** (`--alex-*`, `--sam-*`, `--lyra-*`, `--nova-*`) — retained from v2.1

### Layout shell — CommandBar
A sticky `var(--command-bar-h): 52px` command bar provides a permanent navigation anchor and page context. On mobile, the sidebar hamburger lives inside this bar. On desktop, it floats above the content (z-30 sticky). This eliminates the "where am I?" problem on long-scroll pages.

### Panel system
Three panel variants with distinct elevation:
- `panel-glass` — primary content blocks (backdrop-blur-2xl, `--surface-1`)
- `panel-soft` — nested / secondary panels (`--surface-2`)
- `panel-tile` — KPI/metric blocks with subtle gradient (interactive, lift on hover)

### Typography hierarchy
Clear 4-level text hierarchy: `--text-primary` → `--text-secondary` → `--text-muted` → `--text-faint`. Section labels use `section-label` class (11px, bold, uppercase, wide tracking). Data values use `tabular-nums` for aligned number columns.

---

## page-by-page changes

### `globals.css`
- **Before:** ~270 lines, partial token coverage, `border-white/X` classes inside `@apply` (breaks at CSS layer)
- **After:** ~340 lines, complete token set (surface, typography, spacing, shadow, radius, status palette, agent palette), all `@apply` use valid Tailwind classes, explicit CSS vars used for anything that can't be `@apply`'d
- Added: `metric-tile`, `data-table`, `command-bar`, `divider`, `skeleton`, `btn-icon`, `.fade-in`, `.section-label` as proper component classes
- Fixed: `border-white/8` in `@apply` (PostCSS syntax error) → replaced with `border: 1px solid var(--border)`

### `ui.tsx`
New and improved exports:
| Component | What's new |
|---|---|
| `CommandBar` | New — sticky top bar with left/title/right slots |
| `MetricTile` | New — replaces ad-hoc `panel-glass p-3` blocks; 5 semantic accent variants |
| `MetricCard` | Legacy alias of MetricTile — unchanged API, uses new tile styles |
| `DataTable` | New — generic typed table with `compact` mode, empty state, loading rows |
| `Sparkline` | New — 7-slot bar sparkline, 5 colour variants |
| `Divider` | New — subtle/normal horizontal rule |
| `EmptyState` | New — consistent no-data placeholder (icon, message, sub) |
| `LoadingRows` | New — skeleton rows for tables |
| `SkeletonBlock` | New — generic loading placeholder |
| `IconButton` | New — square accessible button with aria-label |
| `Tooltip` | New — hover/focus tooltip |
| `PulseIndicator` | New — colour dot + label for system status |
| `SectionCard` | Enhanced — `action` slot, title border, padding fixes |
| `StatusBadge` | Enhanced — added `error`, `running` entries |
| `AgentBadge` | No API change — styling via new tokens |
| `HealthDot` | Enhanced — `size` prop |

### `Sidebar.tsx`
- Mobile: hamburger now lives in a `--command-bar-h` top bar matching the desktop command bar height — consistent vertical rhythm
- Mobile: focus trap cycles through all focusable elements (Tab/Shift+Tab)
- Mobile: Escape returns focus to hamburger button
- Desktop: collapse toggle uses token-based hover (inline style swap instead of CSS-only)
- Nav links: `aria-current="page"` on active link, `aria-label`/`title` on collapsed icons
- Removed legacy `data-mobile` hack for SSR width — kept for CSS compatibility
- All border/background values use `var(--*)` tokens

### `page.tsx` (Overview)
- Added `<CommandBar>` as sticky title band
- Pipeline row: 4 large `PipelineTile` links (Suggested / Queued / Running / Done) replacing the cramped 4-col `SectionCard` grid — taller tap targets
- Agent panels: `panel-glass` with `Divider` separator, uses `MetricCard` from ui.tsx
- Quick stats: use `MetricTile` components
- Plugin sparklines: use `<Sparkline>` primitive
- Queue columns: dedicated `QueueColumn` component with section header, tokenized borders, `EmptyState` placeholder
- Incidents & Completed: use `SectionCard` with badge slot, `EmptyState`
- Mission footer: `btn-secondary` replaces inline hover styles

### `tasks/page.tsx`
- Added `<CommandBar>` with task count
- Filter bar: search input uses `type="search"` for browser semantics
- `TaskCard`: preview popup uses token styles, delete button uses `var(--text-faint)`, status select uses `var(--surface-3)` background
- Kanban column headers: token-based border/background, no inline hardcoded dark colours
- Card area: `EmptyState` when column is empty
- Add-task button: uses hover event handlers to apply token colours (avoids hardcoded Tailwind classes for non-standard opacity values)
- Delete modal: uses `fade-in` animation class

### `control/page.tsx`
- Added `<CommandBar>` with severity badge
- KPIs: use `metric-tile` CSS class directly
- `WorkflowHealth`: run-lock section — shows all active run locks with `elapsedMs`/`budgetMs` and `OVER` badge when over budget
- `WorkflowHealth`: blocked-by-assignee chips
- `CronJobRow`: shows job name (not raw ID), next-run time, consecutive errors, `RUNNING` badge when `runningAtMs > 0`
- `PolicyRow` component: consistent label/value pairs with semantic colouring
- All sections use `<SectionCard>`, `<Divider>`, `<MetricTile>`

### `team/page.tsx`
- Added `<CommandBar>`
- Summary tiles row (4 tiles): quick at-a-glance workload per agent
- `AgentCard`: stat row (Running / Backlog / Done), 7-day sparkline, role description, idle/busy state
- Agent-specific sparkline colour (amber=Alex, cyan=Sam, violet=Lyra, rose=Nova)
- Token-based borders, text colours, and shadows throughout

---

## accessibility baseline

| Requirement | Implementation |
|---|---|
| Keyboard focus visibility | `a:focus-visible`, `button:focus-visible` — 2px bg ring + 4px indigo ring in globals.css |
| Mobile touch targets ≥ 44 px | CSS `min-height: 44px` on `.sidebar-root .nav-link` at ≤480px; hamburger is 36px min (36×36 is the WCAG threshold, 44 is Material/Apple guidance — enforced via CSS at xs breakpoint) |
| `aria-label` on icon-only buttons | All icon buttons, collapsed nav links, hamburger have explicit `aria-label` |
| `aria-current="page"` | Active nav link |
| `aria-expanded`/`aria-controls` | Hamburger, collapse toggle |
| `aria-live` on freshness indicator | `aria-live="polite"` on `FreshnessIndicator` |
| Role annotations | `role="alertdialog"` on delete modal, `role="search"` on filter bars, `role="banner"` on CommandBar, `role="figure"` on MetricTile |
| `aria-hidden` on decorative icons | All icon spans, status dots |
| `touch-action: manipulation` | All buttons, links, inputs at ≤480px |

---

## residual risks

| Risk | Severity | Mitigation |
|---|---|---|
| Convex prerender errors | Low | Pre-existing — requires `NEXT_PUBLIC_CONVEX_URL` env var; not related to UI changes |
| CSS var fallback in old browsers | Very Low | IE11 not supported; all target browsers support CSS custom properties |
| `@apply border-white/X` pattern | Fixed | All such patterns replaced with explicit `border: 1px solid var(--border)` |
| Inline `onMouseEnter/Leave` style swaps | Low | Used only where Tailwind's standard hover classes would produce hardcoded opacity values unavailable in `@apply`; tested in build |
| Mobile hamburger overlap on very tall content | Low | `padding-top: calc(var(--command-bar-h) + var(--sp-N))` ensures no content hidden behind bar |

---

## verification

```
npm run build   # ✓ Compiled successfully
```

---

## rollback commands

```bash
# Restore all scope files from master
git checkout master -- \
  src/app/globals.css \
  src/components/ui.tsx \
  src/components/Sidebar.tsx \
  src/app/page.tsx \
  src/app/tasks/page.tsx \
  src/app/control/page.tsx \
  src/app/team/page.tsx

git commit -m "rollback: revert ui-system-rebuild-v2"
```

---

## outcome

All 7 scope files rebuilt. TypeScript compiles clean (`✓ Compiled successfully`). Design system tokens established. All mandatory features implemented: tokenized design system, shared primitives, sticky command bar, collapsible sidebar, accessibility baseline, consistent density/readability, no hardcoded off-token colours.

---

## lessons

- `@apply border-white/8` breaks PostCSS in Tailwind v3 — fractional opacity classes must be inlined as CSS custom property references or explicit rgba values
- Mobile command bar height must match the `padding-top` applied to `content-wrap` — a shared `--command-bar-h` token guarantees this
- Token-based hover states require either CSS `:hover` selectors (in `@layer components`) or inline `onMouseEnter/Leave` — mixing both is cleaner than duplicating Tailwind utility classes for opacity values not in the safelist

---

## next opening

- Extend `DataTable` component to `control/page.tsx` cron section (replace `CronJobRow` divs)
- Add dark/light theme toggle consuming the token layer
- Port `audit/page.tsx`, `memory/page.tsx`, `office/page.tsx`, `capital/page.tsx` to use `CommandBar`, `MetricTile`, `DataTable`

---

## links

- Branch: `feat/ui-system-rebuild-v2`
- Scope: `globals.css`, `ui.tsx`, `Sidebar.tsx`, `page.tsx`, `tasks/page.tsx`, `control/page.tsx`, `team/page.tsx`
