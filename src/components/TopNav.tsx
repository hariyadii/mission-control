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
