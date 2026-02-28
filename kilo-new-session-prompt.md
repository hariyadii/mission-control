# Kilo Code Session 4 — Full UI Redesign (Mega-Prompt)

Copy everything below the `---` line into a new Kilo Code session.

---

ROLE: Senior Front-End Architect and UI Designer

OBJECTIVE: Complete UI redesign of the Mission Control Next.js dashboard. Four changes:
1. Warm "soft chocolate/latte" light theme replacing the dark navy
2. Top navigation bar replacing the sidebar (reclaim 220px)
3. Larger text sizes throughout
4. Bento grid dashboard layout with status-first hero and staggered animations

CRITICAL CONSTRAINTS:
- Do NOT ask for confirmation. Execute all changes directly.
- After every phase, run `git add -A && git commit -m "<description>" && git push` immediately.
- Keep ALL existing data fetching, business logic, and page functionality identical. Only change visual presentation.
- All 9 pages still work: /, /tasks, /audit, /control, /capital, /memory, /calendar, /team, /office

IMPORTANT: The dashboard page (src/app/page.tsx) is ~1020 lines. It contains LaneHealthStrip, IncidentTimeline, BacklogAgingPanel, TrueBlockerBanner, QueueSection, TaskRow components INLINE. When redesigning the dashboard, keep ALL this logic — just restructure the JSX layout in the return statement of the Home component (starting around line 766).

## PHASE A: Theme + Text Size (globals.css only)

### Step 1: Read src/app/globals.css (all 544 lines)

### Step 2: Replace the ENTIRE `:root` block (lines 10-104) with this warm latte palette

```css
:root {
  --bg-base:        #F5F0EB;
  --bg-0:           #EDE7E0;
  --bg-1:           #E6DED5;
  --bg-2:           #DDD4C9;
  --surface-1:      rgba(255, 250, 245, 0.92);
  --surface-2:      rgba(240, 232, 222, 0.75);
  --surface-3:      rgba(230, 222, 213, 0.55);
  --surface-hover:  rgba(210, 195, 178, 0.40);
  --glass:          rgba(255, 250, 245, 0.88);
  --glass-soft:     rgba(245, 240, 235, 0.65);
  --border:         rgba(139, 109, 82, 0.15);
  --border-subtle:  rgba(139, 109, 82, 0.08);
  --border-strong:  rgba(139, 109, 82, 0.25);
  --text-primary:   #3D2B1F;
  --text-secondary: #7A6555;
  --text-muted:     #A89585;
  --text-faint:     #C4B5A5;
  --text-main:      #3D2B1F;
  --text-2xs: 0.6875rem;
  --text-xs:  0.75rem;
  --text-sm:  0.8125rem;
  --text-base:0.9375rem;
  --text-lg:  1.125rem;
  --text-xl:  1.375rem;
  --text-2xl: 1.625rem;
  --text-3xl: 1.875rem;
  --sp-1: 0.25rem; --sp-2: 0.5rem; --sp-3: 0.75rem; --sp-4: 1rem;
  --sp-5: 1.25rem; --sp-6: 1.5rem; --sp-8: 2rem; --sp-10: 2.5rem;
  --shadow-xs:  0 1px 2px rgba(90,60,30,0.06);
  --shadow-sm:  0 2px 8px rgba(90,60,30,0.08);
  --shadow-md:  0 4px 16px rgba(90,60,30,0.10);
  --shadow-lg:  0 8px 32px rgba(90,60,30,0.12);
  --shadow-xl:  0 16px 48px rgba(90,60,30,0.15);
  --shadow-panel: 0 6px 32px rgba(90,60,30,0.08);
  --radius-sm: 0.375rem; --radius-md: 0.5rem; --radius-lg: 0.75rem; --radius-xl: 1rem;
  --status-ok-text:    #2D7A4A;
  --status-ok-bg:      rgba(45,122,74,0.10);
  --status-ok-border:  rgba(45,122,74,0.25);
  --status-warn-text:  #B07D2E;
  --status-warn-bg:    rgba(176,125,46,0.10);
  --status-warn-border:rgba(176,125,46,0.25);
  --status-crit-text:  #C44040;
  --status-crit-bg:    rgba(196,64,64,0.08);
  --status-crit-border:rgba(196,64,64,0.22);
  --status-info-text:  #2B7A8E;
  --status-info-bg:    rgba(43,122,142,0.10);
  --status-info-border:rgba(43,122,142,0.25);
  --status-idle-text:  #8B7A6A;
  --status-idle-bg:    rgba(139,122,106,0.10);
  --status-idle-border:rgba(139,122,106,0.20);
  --alex-start: #C68A3C; --alex-end: #A0722E;
  --sam-start:  #2B7A8E; --sam-end:  #1E6070;
  --lyra-start: #7B5EA7; --lyra-end: #624A8A;
  --nova-start: #C44040; --nova-end: #A03333;
  --topnav-h:      56px;
  --command-bar-h: 56px;
}
```

### Step 3: Update body styles (around line 117-128)

Replace with:
```css
body {
  margin: 0;
  color: var(--text-primary);
  font-family: "Inter", "Sora", "Avenir Next", "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  background: var(--bg-base);
}
```

Remove the radial gradients and background-attachment.

### Step 4: Update component layer dark colors

Search and replace these SPECIFIC inline color values in the @layer components section:

1. `.command-bar` background: `rgba(6, 11, 24, 0.90)` → `rgba(255, 250, 245, 0.92)`
2. `.input-glass` background: `rgba(15, 23, 42, 0.70)` → `rgba(255, 252, 248, 0.80)`
3. `.input-glass:focus` border: `rgba(129,140,248,0.45)` → `rgba(139, 109, 82, 0.45)`
4. `.input-glass:focus` shadow: `rgba(129,140,248,0.15)` → `rgba(139, 109, 82, 0.12)`
5. `.btn-primary` gradient: `#6366f1 0%, #7c3aed 100%` → `#8B6D52 0%, #6B4F3A 100%`
6. `.btn-primary` border: `rgba(129,140,248,0.30)` → `rgba(139, 109, 82, 0.35)`
7. `.btn-primary` shadow: `rgba(99,102,241,0.22)` → `rgba(139, 109, 82, 0.15)`
8. `.btn-primary:hover` shadow: `rgba(99,102,241,0.38)` → `rgba(139, 109, 82, 0.25)`
9. `.btn-secondary` background: `rgba(30,41,59,0.70)` → `rgba(230, 222, 213, 0.70)`
10. `.btn-secondary` text: `text-slate-200` → keep, it will auto-adapt via token
11. Focus rings: all `rgba(129, 140, 248, ...)` → `rgba(139, 109, 82, ...)`
12. `.skeleton` background: `rgba(148,163,184,0.08)` → `rgba(139, 109, 82, 0.08)`
13. `.animate-shimmer` highlight: `rgba(255,255,255,0.05)` → `rgba(139, 109, 82, 0.06)`
14. Scrollbar thumb: `rgba(148,163,184,0.18)` → `rgba(139, 109, 82, 0.18)` and hover `0.30` → `0.28`

### Step 5: Update badge classes

Replace:
- `.badge-alex`: `border-amber-400/35 bg-amber-500/15 text-amber-200` → `border-amber-600/25 bg-amber-500/10 text-amber-800`
- `.badge-sam`: `border-cyan-400/35 bg-cyan-500/15 text-cyan-200` → `border-teal-600/25 bg-teal-500/10 text-teal-800`
- `.badge-me`: `border-indigo-400/35 bg-indigo-500/15 text-indigo-200` → `border-stone-500/25 bg-stone-400/10 text-stone-800`
- `.badge-lyra`: `border-violet-400/35 bg-violet-500/15 text-violet-200` → `border-purple-600/25 bg-purple-500/10 text-purple-800`
- `.badge-nova`: `border-rose-400/35 bg-rose-500/15 text-rose-200` → `border-red-600/25 bg-red-500/10 text-red-800`
- `.badge-legacy`: `border-slate-400/25 bg-slate-700/40 text-slate-400` → `border-stone-400/20 bg-stone-300/15 text-stone-600`

### Step 6: Replace sidebar CSS with top nav + bento CSS

Delete the duplicate `:root` block (around line 451-454), `.sidebar-root`, `.sidebar-expanded`, `.sidebar-collapsed`, `.sidebar` rules.

Add these new rules:

```css
/* ── Top Navigation ── */
.topnav {
  position: sticky; top: 0; z-index: 30;
  display: flex; align-items: center; gap: var(--sp-3);
  height: var(--topnav-h);
  background: rgba(255, 250, 245, 0.92);
  border-bottom: 1px solid var(--border);
  padding: 0 var(--sp-5);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
}
.topnav__tabs { display: flex; align-items: center; gap: var(--sp-1); }
.topnav__tab {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 36px; border-radius: var(--radius-md);
  border: 1px solid transparent; color: var(--text-muted);
  font-size: var(--text-base); transition: all 0.15s ease;
  cursor: pointer; text-decoration: none;
}
.topnav__tab:hover {
  color: var(--text-primary); background: var(--surface-hover); border-color: var(--border);
}
.topnav__tab--active {
  color: var(--text-primary); background: var(--surface-1);
  border-color: var(--border-strong); box-shadow: var(--shadow-xs); font-weight: 600;
}

/* ── Bento Grid ── */
.bento-grid {
  display: grid; gap: var(--sp-3);
  grid-template-columns: repeat(12, 1fr);
}
.bento-hero    { grid-column: span 12; }
.bento-wide    { grid-column: span 8; }
.bento-narrow  { grid-column: span 4; }
.bento-half    { grid-column: span 6; }
.bento-third   { grid-column: span 4; }
.bento-quarter { grid-column: span 3; }
.bento-full    { grid-column: span 12; }

@media (max-width: 1024px) {
  .bento-wide, .bento-narrow { grid-column: span 6; }
  .bento-third { grid-column: span 4; }
  .bento-quarter { grid-column: span 6; }
}
@media (max-width: 768px) {
  .bento-grid { grid-template-columns: 1fr; }
  .bento-hero, .bento-wide, .bento-narrow, .bento-half,
  .bento-third, .bento-quarter, .bento-full { grid-column: span 1; }
  .topnav { padding: 0 var(--sp-3); }
  .topnav__tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .topnav__tabs::-webkit-scrollbar { display: none; }
}

/* ── Status Hero ── */
.status-hero {
  display: flex; align-items: center; gap: var(--sp-5);
  padding: var(--sp-5) var(--sp-6);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}
.status-hero__indicator {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.5rem; font-weight: 700; flex-shrink: 0;
  transition: all 0.3s ease;
}
.status-hero--ok .status-hero__indicator {
  background: rgba(45, 122, 74, 0.12); color: var(--status-ok-text);
  box-shadow: 0 0 20px rgba(45, 122, 74, 0.15);
}
.status-hero--warn .status-hero__indicator {
  background: rgba(176, 125, 46, 0.12); color: var(--status-warn-text);
  box-shadow: 0 0 20px rgba(176, 125, 46, 0.15);
}
.status-hero--crit .status-hero__indicator {
  background: rgba(196, 64, 64, 0.10); color: var(--status-crit-text);
  box-shadow: 0 0 20px rgba(196, 64, 64, 0.15);
}

/* ── Staggered page enter animations ── */
@keyframes bentoEnter {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.bento-animate > * {
  animation: bentoEnter 0.35s ease-out both;
}
.bento-animate > *:nth-child(1) { animation-delay: 0.00s; }
.bento-animate > *:nth-child(2) { animation-delay: 0.04s; }
.bento-animate > *:nth-child(3) { animation-delay: 0.08s; }
.bento-animate > *:nth-child(4) { animation-delay: 0.12s; }
.bento-animate > *:nth-child(5) { animation-delay: 0.16s; }
.bento-animate > *:nth-child(6) { animation-delay: 0.20s; }
.bento-animate > *:nth-child(7) { animation-delay: 0.24s; }
.bento-animate > *:nth-child(8) { animation-delay: 0.28s; }
.bento-animate > *:nth-child(9) { animation-delay: 0.32s; }
.bento-animate > *:nth-child(10) { animation-delay: 0.36s; }

/* ── Metric count-up animation ── */
@keyframes countUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.metric-animate { animation: countUp 0.3s ease-out; }
```

### Step 7: Update .app-shell to flex-column (no sidebar)

Change `.app-shell` from `display: flex;` to `display: flex; flex-direction: column;`

### Step 8: Update .content-wrap

Change `padding-top: calc(var(--command-bar-h) + var(--sp-5))` to `padding-top: var(--sp-5)` (TopNav is inside the flow now, not sticky-offset).

### Step 9: Update mobile breakpoints

Replace the mobile sidebar rules (≤768px media query) — remove all `.sidebar-root` rules. Keep only:
```css
@media (max-width: 768px) {
  .content-wrap { padding: var(--sp-4) var(--sp-3) var(--sp-5) !important; }
}
```

### COMMIT PHASE A:
```bash
git add -A && git commit -m "feat: warm latte theme, text size bump, bento grid CSS, status hero styles, staggered animations" && git push
```

---

## PHASE B: TopNav + Layout Rewiring

### Step 1: Create src/components/TopNav.tsx

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/",         label: "Overview", icon: "◈"  },
  { href: "/tasks",    label: "Tasks",    icon: "≡"  },
  { href: "/calendar", label: "Calendar", icon: "◷"  },
  { href: "/memory",   label: "Memory",   icon: "◎"  },
  { href: "/team",     label: "Team",     icon: "◉"  },
  { href: "/office",   label: "Office",   icon: "⌗"  },
  { href: "/capital",  label: "Capital",  icon: "◆"  },
  { href: "/control",  label: "Control",  icon: "⊛"  },
  { href: "/audit",    label: "Audit",    icon: "◌"  },
] as const;

export default function TopNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <nav className="topnav" aria-label="Main navigation">
      <Link href="/" className="flex items-center gap-2.5 shrink-0 no-underline">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #8B6D52, #6B4F3A)", boxShadow: "0 2px 8px rgba(139,109,82,0.25)" }}
          aria-hidden="true"
        >
          <span className="text-white text-sm font-bold leading-none">M</span>
        </div>
        <div className="hidden sm:block overflow-hidden">
          <p className="m-0 text-sm font-bold tracking-wide leading-tight whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
            Mission Control
          </p>
          <p className="m-0 leading-tight whitespace-nowrap" style={{ color: "var(--text-muted)", fontSize: "var(--text-2xs)" }}>
            AI Ops Dashboard
          </p>
        </div>
      </Link>

      <div className="hidden sm:block w-px h-6 mx-1" style={{ background: "var(--border)" }} aria-hidden="true" />

      <div className="topnav__tabs flex-1 min-w-0">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href} href={href} title={label} aria-label={label}
              aria-current={active ? "page" : undefined}
              className={["topnav__tab", active ? "topnav__tab--active" : ""].filter(Boolean).join(" ")}
            >
              <span aria-hidden="true">{icon}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {mounted && (
          <span className="inline-flex items-center gap-1.5 shrink-0" style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--status-ok-text)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--status-ok-text)" }} aria-hidden="true" />
            Live
          </span>
        )}
      </div>
    </nav>
  );
}
```

### Step 2: Update src/app/layout.tsx

Replace entirely with:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import TopNav from "@/components/TopNav";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import { MissionControlProvider } from "@/contexts";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "OpenClaw Agent Mission Control",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", overflow: "hidden" }}>
        <ConvexClientProvider>
          <MissionControlProvider>
            <div className="app-shell">
              <TopNav />
              <main className="content-wrap">{children}</main>
            </div>
            <KeyboardShortcuts />
          </MissionControlProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
```

### COMMIT PHASE B:
```bash
git add -A && git commit -m "feat: replace sidebar with slim top navigation bar (TopNav)" && git push
```

---

## PHASE C: Dashboard Bento Grid Redesign

This is the most important phase. You are redesigning ONLY the JSX in `src/app/page.tsx`'s Home component return statement (starting around line 766). Keep ALL the data fetching, helper functions, sub-components (LaneHealthStrip, IncidentTimeline, BacklogAgingPanel, QueueSection, TrueBlockerBanner, TaskRow) EXACTLY as they are. Only change the layout/structure of the return JSX.

### Step 1: Read src/app/page.tsx (all 1020 lines)

### Step 2: Redesign the return JSX of the Home component

Replace the current return block (from `return (` to the matching `)`) with this bento grid layout:

```tsx
return (
  <div className="flex flex-col gap-4 page-enter">

    {/* ── STATUS HERO — answers "Is everything OK?" at a glance ── */}
    <div className={`status-hero ${
      autonomy?.workflowHealth?.severity === "critical" || (autonomy?.workflowHealth?.criticalAlerts?.length ?? 0) > 0
        ? "status-hero--crit"
        : (autonomy?.workflowHealth?.alerts?.length ?? 0) > 0 || !autonomy?.ok
        ? "status-hero--warn"
        : "status-hero--ok"
    }`}>
      <div className="status-hero__indicator">
        {(autonomy?.workflowHealth?.criticalAlerts?.length ?? 0) > 0
          ? "✕"
          : (autonomy?.workflowHealth?.alerts?.length ?? 0) > 0
          ? "!"
          : "✓"}
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold m-0 leading-tight" style={{ color: "var(--text-primary)" }}>
          {(autonomy?.workflowHealth?.criticalAlerts?.length ?? 0) > 0
            ? "Critical Issues Detected"
            : (autonomy?.workflowHealth?.alerts?.length ?? 0) > 0
            ? "Attention Required"
            : "All Systems Operational"}
        </h1>
        <p className="text-sm m-0 mt-1" style={{ color: "var(--text-secondary)" }}>
          {autonomy?.total ?? 0} tasks · {pCounts.running} running · {allIncidents.length} incidents
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <FreshnessIndicator lastUpdate={lastUpdate} />
        <div className="flex items-center gap-1.5" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          SYS <HealthDot ok={autonomy?.ok ?? false} />
        </div>
      </div>
    </div>

    {/* ── TRUE BLOCKER ALERT ── */}
    <TrueBlockerBanner tasks={allTasks} />

    {/* ── BENTO GRID ── */}
    <div className="bento-grid bento-animate">

      {/* Row 1: Pipeline (wide) + Lane Health (narrow) */}
      <div className="bento-wide">
        <SectionCard title="Pipeline">
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: "suggested", label: "Suggested", color: "var(--lyra-start)", n: pCounts.suggested },
              { key: "backlog",   label: "Queue",     color: "var(--sam-start)",  n: pCounts.backlog },
              { key: "running",   label: "Running",   color: "var(--status-info-text)", n: pCounts.running },
              { key: "done",      label: "Done",      color: "var(--status-ok-text)",   n: pCounts.done },
            ].map((s) => (
              <Link
                key={s.key}
                href={`/tasks?status=${s.key === "running" ? "in_progress" : s.key}`}
                className="text-center p-3 rounded-xl border transition-all duration-150 hover:shadow-md"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: s.color }}>{s.label}</p>
                <p className="text-2xl font-bold tabular-nums leading-tight metric-animate" style={{ color: "var(--text-primary)" }}>{s.n}</p>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="bento-narrow">
        <section className="panel-glass p-3" aria-label="Lane health overview">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Lane Health</p>
          <div className="space-y-2">
            {LANES.map((lane) => (
              <LaneHealthStrip key={lane.id} lane={lane} stats={computeLaneStats(allTasks, lane.aliases)} />
            ))}
          </div>
        </section>
      </div>

      {/* Row 2: Agents (half) + Incidents (half) */}
      <div className="bento-half">
        <div className="grid grid-cols-2 gap-2">
          <section className="panel-glass p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AgentBadge agent="sam" size="xs" />
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Ops</span>
              <HealthDot ok />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <MetricCard label="Tasks" value={autonomy?.byAssignee?.sam ?? "—"} />
              <MetricCard label="Runs" value={autonomy?.pluginMetrics?.totalExecutions ?? "—"} />
            </div>
          </section>
          <section className="panel-glass p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AgentBadge agent="lyra" size="xs" />
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Capital</span>
              <HealthDot ok={capital?.portfolio?.status === "ok"} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <MetricCard
                label="Equity"
                value={capital?.portfolio ? `$${(capital.portfolio.totalEquity / 1000).toFixed(0)}k` : "—"}
                trend={capTrend}
                accent={capital?.portfolio?.totalPnl && capital.portfolio.totalPnl >= 0 ? "emerald" : "rose"}
              />
              <MetricCard
                label="PnL"
                value={capital?.portfolio ? `${capital.portfolio.totalPnlPct >= 0 ? "+" : ""}${capital.portfolio.totalPnlPct.toFixed(0)}%` : "—"}
              />
            </div>
          </section>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <MetricCard label="Total" value={autonomy?.total ?? "—"} />
          <MetricCard label="Plugins" value={autonomy?.pluginMetrics?.byPlugin?.length ?? "—"} />
          <MetricCard label="Positions" value={capital?.portfolio?.positions?.length ?? "—"} />
        </div>
      </div>

      <div className="bento-half">
        <IncidentTimeline incidents={allIncidents} />
      </div>

      {/* Row 3: Queues (wide) + Backlog Aging (narrow) */}
      <div className="bento-wide">
        <div className="grid grid-cols-3 gap-2">
          <QueueSection label="Running" dotColor="animate-pulse" badgeColor="" tasks={running} maxH="140px"
            style={{ "--dot-color": "var(--status-info-text)" }} />
          <QueueSection label="Backlog" dotColor="" badgeColor="" tasks={backlog} maxH="120px" />
          <QueueSection label="Suggested" dotColor="" badgeColor="" tasks={suggested.slice(0, 5)} maxH="100px" />
        </div>
      </div>

      <div className="bento-narrow">
        <BacklogAgingPanel tasks={filteredTasks} />
      </div>

      {/* Row 4: Filter + Completed + Plugins */}
      <div className="bento-full">
        <div className="flex flex-wrap items-center gap-2 p-3 panel-glass">
          <FilterInput value={searchQuery} onChange={setSearchQuery} placeholder="Search tasks..." />
          <FilterSelect value={agentFilter} onChange={setAgentFilter} ariaLabel="Filter by agent" className="py-1.5">
            <option value="all">All agents</option>
            <option value="sam">Sam</option>
            <option value="lyra">Lyra</option>
            <option value="alex">Alex</option>
            <option value="nova">Nova</option>
            <option value="ops">Ops</option>
          </FilterSelect>
          <FilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" className="py-1.5">
            <option value="all">All status</option>
            <option value="suggested">Suggested</option>
            <option value="backlog">Backlog</option>
            <option value="in_progress">Running</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </FilterSelect>
          {(agentFilter !== "all" || statusFilter !== "all" || searchQuery) && (
            <button onClick={() => { setAgentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }} className="btn-ghost" aria-label="Clear filters">
              ✕ Clear
            </button>
          )}
          <span className="ml-auto tabular-nums" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {filteredTasks.length} tasks
          </span>
        </div>
      </div>

      <div className="bento-half">
        <section className="panel-glass p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Completed</span>
            <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: "var(--status-ok-bg)", color: "var(--status-ok-text)", border: "1px solid var(--status-ok-border)" }}>
              {done.length}
            </span>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {done.length > 0 ? done.map((t) => <TaskRow key={t._id} task={t} showOwner showAge={false} />) : (
              <p className="text-center py-4" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Nothing yet</p>
            )}
          </div>
        </section>
      </div>

      <div className="bento-half">
        {autonomy?.pluginMetrics?.byPlugin && autonomy.pluginMetrics.byPlugin.length > 0 && (
          <section className="panel-glass p-3">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Plugins</p>
            <div className="space-y-1.5">
              {autonomy.pluginMetrics.byPlugin.slice(0, 5).map((item) => {
                const maxVal = Math.max(...item.sparkline.filter((x) => x > 0), 1);
                return (
                  <div key={item.plugin} className="flex items-center gap-2">
                    <span className="truncate w-[80px] shrink-0" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }} title={item.plugin}>
                      {item.plugin.split("/").pop()}
                    </span>
                    <div className="flex-1 flex items-end gap-px h-4">
                      {item.sparkline.slice(0, 14).map((v, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all"
                          style={{
                            height: `${v > 0 ? Math.max(20, (v / maxVal) * 100) : 20}%`,
                            background: v > 0 ? "var(--status-ok-text)" : "var(--surface-2)",
                            opacity: v > 0 ? 0.6 : 0.3,
                          }}
                        />
                      ))}
                    </div>
                    <span className="tabular-nums w-10 text-right shrink-0" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      {item.success}/{item.runs}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

    </div>
  </div>
);
```

**IMPORTANT NOTE**: The QueueSection component's `dotColor` and `badgeColor` props use tailwind classes like `bg-cyan-400`. After the theme change, these should use warm equivalents. Update the QueueSection calls to use appropriate colors, or better yet, update the QueueSection component itself to use CSS token colors via inline styles instead of hard-coded tailwind classes. For example, change the dot's background to use `style={{ background: "var(--status-info-text)" }}` instead of a tailwind class.

Also update the LaneHealthStrip component's color references. The LANES array (around line 152-158) uses dark-theme tailwind classes like `text-amber-300`, `bg-amber-400`, etc. These need to be updated for the light theme:
- `text-amber-300` → `text-amber-700`
- `text-cyan-300` → `text-teal-700`
- `text-violet-300` → `text-purple-700`
- `text-rose-300` → `text-red-700`
- `text-slate-300` → `text-stone-600`
- `bg-amber-400` → `bg-amber-500`
- `bg-cyan-400` → `bg-teal-500`
- `bg-violet-400` → `bg-purple-500`
- `bg-rose-400` → `bg-red-500`
- `bg-slate-400` → `bg-stone-500`
- All `border-*-400/25` → `border-*-500/20`

And in the LaneHealthStrip component JSX: replace `text-slate-500`, `text-slate-600`, `bg-slate-800/50`, `bg-slate-800/80`, `bg-slate-900/60` etc with warm equivalents using CSS tokens or `stone-*` tailwind classes.

In the IncidentTimeline component: replace `text-slate-400`, `text-slate-200`, `text-slate-500`, `text-slate-600`, `bg-slate-700/60` with warm equivalents.

In QueueSection, TaskRow, TrueBlockerBanner: same pattern — replace all `slate-*` references with `stone-*` equivalents, and dark background references with warm ones.

### COMMIT PHASE C:
```bash
git add -A && git commit -m "feat: bento grid dashboard, status hero, staggered animations, warm color inline fixes" && git push
```

---

## PHASE D: Remaining Page Fixes + Build

### Step 1: Fix hard-coded dark colors across ALL files

Run:
```bash
grep -rn "slate-\|rgba(6\|rgba(15\|rgba(30\|#05\|#06\|#0a\|#0f" src/ --include="*.tsx" | grep -v node_modules | head -60
```

For every match in page files and component files (NOT Sidebar.tsx, which is now unused):
- Replace `text-slate-*` → `text-stone-*` equivalents
- Replace dark rgba backgrounds → warm equivalents
- Replace any remaining `#05*`, `#06*`, `#0a*`, `#0f*` hex colors → use CSS tokens

### Step 2: Build verify

```bash
npx next build 2>&1 | tail -30
```

Fix any errors, then commit.

### COMMIT PHASE D:
```bash
git add -A && git commit -m "fix: warm theme color fixes across all pages, build verified" && git push
```

---

EXECUTION: Begin immediately with Phase A. Do not ask for confirmation.
