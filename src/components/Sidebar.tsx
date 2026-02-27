"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview", icon: "󠎈", color: "text-slate-400", activeColor: "text-indigo-400" },
  { href: "/tasks", label: "Tasks", icon: "☰", color: "text-slate-400", activeColor: "text-indigo-400" },
  { href: "/calendar", label: "Calendar", icon: "󠍷", color: "text-slate-400", activeColor: "text-amber-400" },
  { href: "/memory", label: "Memory", icon: "󠎎", color: "text-slate-400", activeColor: "text-rose-400" },
  { href: "/team", label: "Team", icon: "󠎉", color: "text-slate-400", activeColor: "text-cyan-400" },
  { href: "/office", label: "Office", icon: "⌘", color: "text-slate-400", activeColor: "text-violet-400" },
  { href: "/capital", label: "Capital", icon: "󠍍", color: "text-slate-400", activeColor: "text-emerald-400" },
  { href: "/control", label: "Control", icon: "⚙", color: "text-slate-400", activeColor: "text-amber-400" },
  { href: "/audit", label: "Audit", icon: "󠍫", color: "text-slate-400", activeColor: "text-rose-400" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar sticky top-0 flex min-h-screen flex-col border-r border-white/10 bg-gradient-to-b from-slate-900 to-slate-950/80 px-4 py-6 backdrop-blur-xl shadow-2xl" role="navigation" aria-label="Main navigation">
      {/* Enhanced Header */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800 to-slate-900/60 px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="sidebar-title m-0 text-lg font-bold tracking-wide text-white">Mission Control</p>
            <p className="sidebar-subtitle m-0 mt-1 text-xs text-slate-400">AI Ops Dashboard</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">v2.0</span>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Enhanced Navigation */}
      <nav className="flex flex-col gap-2" role="menubar" aria-label="Page navigation">
        {links.map((link) => {
          const active = pathname === link.href;
          const hoverColor = active ? link.activeColor : "text-slate-400 hover:text-white";
          const bgColor = active ? `bg-gradient-to-r from-${link.activeColor.replace('text-', '')}-500/20 to-transparent` : "bg-transparent";
          
          return (
            <Link 
              key={link.href} 
              href={link.href} 
              className={`nav-link group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${active ? "nav-link-active shadow-lg" : "hover:shadow-sm hover:bg-slate-700/50"} ${bgColor}`}
              role="menuitem"
              aria-current={active ? "page" : undefined}
            >
              <span className={`text-2xl transition-transform group-hover:scale-110 ${active ? link.activeColor : link.color}`} aria-hidden="true">
                {link.icon}
              </span>
              <span className={`sidebar-label font-medium transition-colors ${active ? "text-white font-semibold" : "text-slate-300"}`}>
                {link.label}
              </span>
              {active && (
                <div className="ml-auto flex h-1.5 w-1.5 rounded-full bg-white/20 shadow-[0_0_8px_rgba(255,255,255,0.2)]" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Enhanced Footer */}
      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/50 border border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Press </span>
            <kbd className="rounded bg-slate-700 px-2 py-1 text-[10px] font-mono text-slate-400 border border-white/10">
              ?
            </kbd>
            <span className="text-[10px] text-slate-500"> for shortcuts</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">⌨️</span>
          </div>
        </div>
      </div>
    </aside>
  );
}