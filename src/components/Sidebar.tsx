"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = "mc_sidebar_collapsed";
const MOBILE_BREAKPOINT = 768;

const NAV = [
  { href: "/",        label: "Overview", icon: "◈", color: "indigo"  },
  { href: "/tasks",   label: "Tasks",    icon: "≡",  color: "sky"     },
  { href: "/calendar",label: "Calendar", icon: "◷",  color: "amber"   },
  { href: "/memory",  label: "Memory",   icon: "◎",  color: "rose"    },
  { href: "/team",    label: "Team",     icon: "◉",  color: "cyan"    },
  { href: "/office",  label: "Office",   icon: "⌗",  color: "violet"  },
  { href: "/capital", label: "Capital",  icon: "◆",  color: "emerald" },
  { href: "/control", label: "Control",  icon: "⊛",  color: "amber"   },
  { href: "/audit",   label: "Audit",    icon: "◌",  color: "rose"    },
];

type NavColor = "indigo" | "sky" | "amber" | "rose" | "cyan" | "violet" | "emerald";

const ACTIVE_STYLES: Record<NavColor, { icon: string; text: string; bg: string; bar: string }> = {
  indigo:  { icon: "text-indigo-400",  text: "text-indigo-100",  bg: "bg-indigo-500/15 border-indigo-400/30",  bar: "bg-indigo-400"  },
  sky:     { icon: "text-sky-400",     text: "text-sky-100",     bg: "bg-sky-500/15 border-sky-400/30",        bar: "bg-sky-400"     },
  amber:   { icon: "text-amber-400",   text: "text-amber-100",   bg: "bg-amber-500/15 border-amber-400/30",    bar: "bg-amber-400"   },
  rose:    { icon: "text-rose-400",    text: "text-rose-100",    bg: "bg-rose-500/15 border-rose-400/30",      bar: "bg-rose-400"    },
  cyan:    { icon: "text-cyan-400",    text: "text-cyan-100",    bg: "bg-cyan-500/15 border-cyan-400/30",      bar: "bg-cyan-400"    },
  violet:  { icon: "text-violet-400",  text: "text-violet-100",  bg: "bg-violet-500/15 border-violet-400/30",  bar: "bg-violet-400"  },
  emerald: { icon: "text-emerald-400", text: "text-emerald-100", bg: "bg-emerald-500/15 border-emerald-400/30",bar: "bg-emerald-400" },
};

// ── Sidebar ────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();

  // Collapsed state (desktop) — persisted to localStorage
  const [collapsed, setCollapsed] = useState(false);
  // Mobile open state (off-canvas drawer)
  const [mobileOpen, setMobileOpen] = useState(false);
  // Detect mobile
  const [isMobile, setIsMobile] = useState(false);
  // Track if initial load done (avoid SSR mismatch)
  const [mounted, setMounted] = useState(false);

  const sidebarRef = useRef<HTMLElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  // Initialise from localStorage + detect mobile after mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);

    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileOpen(false); // close drawer on widen
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Persist desktop collapsed state
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  // Trap focus in mobile drawer & close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const el = sidebarRef.current;
    if (!el) return;
    // Focus first focusable element inside
    const focusables = el.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])'
    );
    focusables[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        toggleBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggleDesktop = () => setCollapsed((c) => !c);
  const toggleMobile  = () => setMobileOpen((o) => !o);

  // Determine render mode
  const isCollapsed = !isMobile && mounted && collapsed;
  const isDrawerOpen = isMobile && mobileOpen;

  const sidebarId = "main-sidebar";

  return (
    <>
      {/* ── Mobile hamburger (outside sidebar, visible ≤768px) ── */}
      {isMobile && mounted && (
        <button
          ref={toggleBtnRef}
          onClick={toggleMobile}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          aria-controls={sidebarId}
          className="fixed top-3 left-3 z-[60] flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#070c1a]/95 backdrop-blur-xl shadow-lg text-slate-300 hover:text-white hover:border-white/20 transition focus-visible:outline-none"
          style={{ boxShadow: "0 0 0 2px #060b18, 0 0 0 4px rgba(129,140,248,0.5)" }}
        >
          <span aria-hidden="true" className="text-base leading-none">
            {mobileOpen ? "✕" : "☰"}
          </span>
        </button>
      )}

      {/* ── Mobile overlay backdrop ── */}
      {isDrawerOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[45] bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        id={sidebarId}
        ref={sidebarRef}
        aria-label="Main navigation"
        data-mobile={isMobile && mounted ? "true" : undefined}
        className={[
          "sidebar-root",
          "sticky top-0 flex flex-col border-r border-white/8 bg-[#070c1a]/95 backdrop-blur-2xl",
          "transition-[width] duration-200 ease-in-out",
          // Desktop collapsed
          isCollapsed ? "sidebar-collapsed" : "sidebar-expanded",
          // Mobile off-canvas
          isMobile && mounted
            ? `fixed left-0 top-0 z-[50] h-full min-h-screen ${isDrawerOpen ? "translate-x-0 shadow-2xl shadow-black/50" : "-translate-x-full"} transition-transform duration-200`
            : "min-h-screen",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* ── Wordmark ── */}
        <div className="px-4 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0"
              aria-hidden="true"
            >
              <span className="text-white text-sm font-bold leading-none">M</span>
            </div>
            {!isCollapsed && (
              <div className="sidebar-title-wrap overflow-hidden">
                <p className="sidebar-title m-0 text-sm font-bold tracking-wide text-white leading-tight whitespace-nowrap">
                  Mission Control
                </p>
                <p className="sidebar-subtitle m-0 text-[10px] text-slate-500 leading-tight whitespace-nowrap">
                  AI Ops Dashboard
                </p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-1.5 mt-2.5 pl-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400/80 font-medium">Systems online</span>
            </div>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1">
          {NAV.map(({ href, label, icon, color }) => {
            const active = pathname === href;
            const s = ACTIVE_STYLES[color as NavColor];

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
                    : "border border-transparent hover:bg-slate-800/50 hover:border-white/8",
                ].join(" ")}
              >
                {/* Active accent bar */}
                {active && (
                  <span
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r ${s.bar}`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={[
                    "text-base font-medium transition-colors shrink-0 w-5 text-center",
                    active ? s.icon : "text-slate-500 group-hover:text-slate-300",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {icon}
                </span>
                {!isCollapsed && (
                  <span
                    className={[
                      "sidebar-label text-sm font-medium transition-colors whitespace-nowrap",
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

        {/* ── Footer ── */}
        <div className="px-3 py-3 border-t border-white/8 shrink-0">
          {isCollapsed ? (
            <div className="flex items-center justify-center">
              <span className="text-[10px] text-slate-600 font-mono">v2</span>
            </div>
          ) : (
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-900/60">
              <span className="text-[10px] text-slate-600">
                <kbd
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-white/10"
                  aria-label="Press ? for keyboard shortcuts"
                >
                  ?
                </kbd>
                <span className="sidebar-label"> shortcuts</span>
              </span>
              <span className="text-[10px] text-slate-600">v2.1</span>
            </div>
          )}

          {/* ── Desktop collapse toggle ── */}
          {!isMobile && mounted && (
            <button
              onClick={toggleDesktop}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              aria-controls={sidebarId}
              className={[
                "mt-2 w-full flex items-center rounded-lg border border-white/8 bg-slate-900/40",
                "text-slate-500 hover:text-slate-300 hover:border-white/15 hover:bg-slate-800/50",
                "transition-all duration-150 text-[10px] py-1.5",
                isCollapsed ? "justify-center px-2" : "justify-between px-2.5",
              ].join(" ")}
            >
              {!isCollapsed && (
                <span className="font-medium">Collapse</span>
              )}
              <span aria-hidden="true" className="text-xs">
                {isCollapsed ? "→" : "←"}
              </span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
