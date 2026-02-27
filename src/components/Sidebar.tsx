"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="sidebar sticky top-0 flex min-h-screen flex-col border-r border-white/8 bg-[#070c1a]/95 backdrop-blur-2xl"
      aria-label="Main navigation"
    >
      {/* Wordmark */}
      <div className="px-4 pt-5 pb-4 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0"
            aria-hidden="true"
          >
            <span className="text-white text-sm font-bold leading-none">M</span>
          </div>
          <div className="sidebar-title-wrap overflow-hidden">
            <p className="sidebar-title m-0 text-sm font-bold tracking-wide text-white leading-tight whitespace-nowrap">Mission Control</p>
            <p className="sidebar-subtitle m-0 text-[10px] text-slate-500 leading-tight whitespace-nowrap">AI Ops Dashboard</p>
          </div>
        </div>
        {/* Live dot */}
        <div className="flex items-center gap-1.5 mt-2.5 pl-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-emerald-400/80 font-medium">Systems online</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1">
        {NAV.map(({ href, label, icon, color }) => {
          const active = pathname === href;
          const s = ACTIVE_STYLES[color as NavColor];

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={[
                "nav-link group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150",
                active
                  ? `${s.bg} border shadow-sm`
                  : "border border-transparent hover:bg-slate-800/50 hover:border-white/8",
              ].join(" ")}
            >
              {/* Active accent bar */}
              {active && (
                <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r ${s.bar}`} />
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
              <span
                className={[
                  "sidebar-label text-sm font-medium transition-colors",
                  active ? s.text : "text-slate-400 group-hover:text-slate-200",
                ].join(" ")}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-white/8">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-900/60">
          <span className="text-[10px] text-slate-600">
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-white/10" aria-label="Press ? for keyboard shortcuts">?</kbd>
            <span className="sidebar-label"> shortcuts</span>
          </span>
          <span className="text-[10px] text-slate-600">v2.1</span>
        </div>
      </div>
    </aside>
  );
}
