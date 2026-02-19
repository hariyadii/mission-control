"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview", icon: "◈" },
  { href: "/tasks", label: "Tasks", icon: "☰" },
  { href: "/calendar", label: "Calendar", icon: "◷" },
  { href: "/memory", label: "Memory", icon: "◎" },
  { href: "/team", label: "Team", icon: "◉" },
  { href: "/office", label: "Office", icon: "⌘" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar sticky top-0 flex min-h-screen flex-col border-r border-white/10 bg-slate-950/65 px-3 py-5 backdrop-blur-xl">
      <div className="mb-4 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3">
        <p className="sidebar-title m-0 text-sm font-semibold tracking-wide text-slate-100">Mission Control</p>
        <p className="sidebar-subtitle m-0 mt-1 text-xs text-[color:var(--text-muted)]">AI Ops Dashboard</p>
      </div>

      <nav className="flex flex-col gap-1.5">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
              <span className="text-base leading-none">{link.icon}</span>
              <span className="sidebar-label">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
