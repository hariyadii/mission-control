"use client";
/**
 * Sidebar + Mobile Command Bar — Mission Control v3
 *
 * Desktop: sticky left column, collapsible to icon rail.
 * Mobile (≤768px): fixed off-canvas drawer triggered by hamburger in a
 *   top command bar. The command bar is always visible on mobile so
 *   users always have a navigation anchor.
 *
 * Accessibility:
 * - aria-label, aria-current, aria-expanded, aria-controls on all interactive els
 * - Escape closes mobile drawer and returns focus to hamburger
 * - Focus trapped inside open drawer (cycles through focusable elements)
 * - All nav links have min 44×44 px tap target on mobile (enforced by CSS)
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = "mc_sidebar_collapsed";
const MOBILE_BP   = 768;

const NAV = [
  { href: "/",         label: "Overview", icon: "◈", color: "indigo"  },
  { href: "/tasks",    label: "Tasks",    icon: "≡",  color: "sky"     },
  { href: "/calendar", label: "Calendar", icon: "◷",  color: "amber"   },
  { href: "/memory",   label: "Memory",   icon: "◎",  color: "rose"    },
  { href: "/team",     label: "Team",     icon: "◉",  color: "cyan"    },
  { href: "/office",   label: "Office",   icon: "⌗",  color: "violet"  },
  { href: "/capital",  label: "Capital",  icon: "◆",  color: "emerald" },
  { href: "/control",  label: "Control",  icon: "⊛",  color: "amber"   },
  { href: "/audit",    label: "Audit",    icon: "◌",  color: "rose"    },
] as const;

type NavColor = "indigo" | "sky" | "amber" | "rose" | "cyan" | "violet" | "emerald";

const ACCENT: Record<NavColor, { icon: string; text: string; bg: string; bar: string }> = {
  indigo:  { icon: "text-indigo-400",  text: "text-indigo-100",  bg: "bg-indigo-500/15 border-indigo-400/28",  bar: "bg-indigo-400"  },
  sky:     { icon: "text-sky-400",     text: "text-sky-100",     bg: "bg-sky-500/15 border-sky-400/28",        bar: "bg-sky-400"     },
  amber:   { icon: "text-amber-400",   text: "text-amber-100",   bg: "bg-amber-500/15 border-amber-400/28",    bar: "bg-amber-400"   },
  rose:    { icon: "text-rose-400",    text: "text-rose-100",    bg: "bg-rose-500/15 border-rose-400/28",      bar: "bg-rose-400"    },
  cyan:    { icon: "text-cyan-400",    text: "text-cyan-100",    bg: "bg-cyan-500/15 border-cyan-400/28",      bar: "bg-cyan-400"    },
  violet:  { icon: "text-violet-400",  text: "text-violet-100",  bg: "bg-violet-500/15 border-violet-400/28",  bar: "bg-violet-400"  },
  emerald: { icon: "text-emerald-400", text: "text-emerald-100", bg: "bg-emerald-500/15 border-emerald-400/28",bar: "bg-emerald-400" },
};

// ── Sidebar ────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();

  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [isMobile,    setIsMobile]    = useState(false);
  const [mounted,     setMounted]     = useState(false);

  const sidebarRef  = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // ── Initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);

    const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Persist desktop collapsed state
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  // ── Focus trap + Escape in mobile drawer ────────────────────────────────
  useEffect(() => {
    if (!mobileOpen) return;
    const el = sidebarRef.current;
    if (!el) return;

    const focusables = Array.from(
      el.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])')
    );
    focusables[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
        return;
      }
      // Tab cycling
      if (e.key === "Tab" && focusables.length > 0) {
        const first = focusables[0];
        const last  = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // ── Derived state ────────────────────────────────────────────────────────
  const isCollapsed  = !isMobile && mounted && collapsed;
  const isDrawerOpen = isMobile && mobileOpen;
  const sidebarId    = "main-sidebar";

  return (
    <>
      {/* ── Mobile: top command bar with hamburger ──────────────────────── */}
      {isMobile && mounted && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] flex items-center gap-3 px-3"
          style={{
            height: "var(--command-bar-h)",
            background: "rgba(6, 11, 24, 0.95)",
            borderBottom: "1px solid var(--border)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Hamburger */}
          <button
            ref={hamburgerRef}
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls={sidebarId}
            className="flex items-center justify-center rounded-lg border text-slate-300 hover:text-white hover:border-white/20 transition"
            style={{
              minWidth: 36,
              minHeight: 36,
              borderColor: "var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <span aria-hidden="true" className="text-sm leading-none select-none">
              {mobileOpen ? "✕" : "☰"}
            </span>
          </button>

          {/* Wordmark */}
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)", boxShadow: "0 0 12px rgba(99,102,241,0.35)" }}
              aria-hidden="true"
            >
              <span className="text-white text-xs font-bold leading-none">M</span>
            </div>
            <span className="command-bar__title truncate">Mission Control</span>
          </div>

          {/* Live indicator */}
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 shrink-0"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            Live
          </span>
        </div>
      )}

      {/* ── Mobile overlay backdrop ────────────────────────────────────── */}
      {isDrawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[45] bg-black/65 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        id={sidebarId}
        ref={sidebarRef}
        aria-label="Main navigation"
        data-mobile={isMobile && mounted ? "true" : undefined}
        className={[
          "sidebar-root",
          "sticky top-0 flex flex-col",
          "transition-[width] duration-200 ease-in-out",
          // Desktop collapsed
          isCollapsed ? "sidebar-collapsed" : "sidebar-expanded",
          // Mobile off-canvas
          isMobile && mounted
            ? [
                "fixed left-0 top-0 z-[50] h-full min-h-screen",
                isDrawerOpen
                  ? "translate-x-0 shadow-2xl shadow-black/60"
                  : "-translate-x-full",
                "transition-transform duration-200",
              ].join(" ")
            : "min-h-screen",
        ].filter(Boolean).join(" ")}
        style={{
          background: "rgba(6, 11, 24, 0.97)",
          borderRight: "1px solid var(--border)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* ── Wordmark (desktop only) ──────────────────────────────── */}
        <div
          className="px-4 pt-5 pb-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                boxShadow: "0 0 16px rgba(99,102,241,0.35)",
              }}
              aria-hidden="true"
            >
              <span className="text-white text-sm font-bold leading-none">M</span>
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="m-0 text-sm font-bold tracking-wide text-white leading-tight whitespace-nowrap">
                  Mission Control
                </p>
                <p className="m-0 text-[10px] leading-tight whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  AI Ops Dashboard
                </p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-1.5 mt-2.5 pl-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              <span className="text-[10px] text-emerald-400/80 font-medium">Systems online</span>
            </div>
          )}
        </div>

        {/* ── Navigation ─────────────────────────────────────────────── */}
        <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1" aria-label="Primary navigation">
          {NAV.map(({ href, label, icon, color }) => {
            const active = pathname === href;
            const s = ACCENT[color as NavColor];

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={isCollapsed ? label : undefined}
                title={isCollapsed ? label : undefined}
                className={[
                  "nav-link group relative flex items-center gap-3 rounded-lg transition-all duration-150",
                  isCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                  active
                    ? `${s.bg} border shadow-sm`
                    : "border border-transparent",
                ].join(" ")}
                style={!active ? {
                  // hover handled by :hover below but we set style for non-active
                } : undefined}
                onMouseEnter={!active ? (e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "var(--surface-hover)";
                  el.style.borderColor = "var(--border)";
                } : undefined}
                onMouseLeave={!active ? (e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "";
                  el.style.borderColor = "";
                } : undefined}
              >
                {/* Active accent bar */}
                {active && (
                  <span
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r ${s.bar}`}
                    aria-hidden="true"
                  />
                )}

                {/* Icon */}
                <span
                  className={[
                    "text-base font-medium transition-colors shrink-0 w-5 text-center leading-none",
                    active ? s.icon : "text-slate-500 group-hover:text-slate-300",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {icon}
                </span>

                {/* Label */}
                {!isCollapsed && (
                  <span
                    className={[
                      "text-sm font-medium transition-colors whitespace-nowrap",
                      active ? s.text : "text-slate-400 group-hover:text-slate-200",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div
          className="px-3 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {isCollapsed ? (
            <div className="flex items-center justify-center">
              <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>v3</span>
            </div>
          ) : (
            <div
              className="flex items-center justify-between px-2 py-1.5 rounded-lg"
              style={{ background: "var(--surface-3)" }}
            >
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                <kbd
                  className="rounded px-1.5 py-0.5 text-[10px] font-mono border"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-secondary)",
                    borderColor: "var(--border)",
                  }}
                  aria-label="Press ? for keyboard shortcuts"
                >
                  ?
                </kbd>
                <span className="ml-1">shortcuts</span>
              </span>
              <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>v3</span>
            </div>
          )}

          {/* Desktop collapse toggle */}
          {!isMobile && mounted && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              aria-controls={sidebarId}
              className={[
                "mt-2 w-full flex items-center rounded-lg border text-xs py-1.5 transition-all duration-150",
                isCollapsed ? "justify-center px-2" : "justify-between px-2.5",
              ].join(" ")}
              style={{
                background: "var(--surface-3)",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              {!isCollapsed && <span className="font-medium text-[10px]">Collapse</span>}
              <span aria-hidden="true" className="leading-none">{isCollapsed ? "→" : "←"}</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
