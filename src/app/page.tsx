"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Home() {
  const tasks = useQuery(api.tasks.list);

  const suggested = (tasks ?? []).filter((t) => t.status === "suggested").length;
  const backlog = (tasks ?? []).filter((t) => t.status === "backlog").length;
  const inProgress = (tasks ?? []).filter((t) => t.status === "in_progress").length;
  const done = (tasks ?? []).filter((t) => t.status === "done").length;

  const mission =
    "Operate as an autonomous AI organization that reduces Fendy's manual work, ships value 24/7, and builds compounding systems that grow without him.";

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Mission Overview</h1>
          <p className="page-subtitle">Realtime control surface for Alex and Sam.</p>
        </div>
      </header>

      <section className="panel-glass bg-gradient-to-br from-violet-500/15 via-indigo-500/10 to-cyan-500/15 p-6">
        <p className="m-0 text-xs uppercase tracking-[0.18em] text-slate-300">Mission</p>
        <p className="m-0 mt-2 text-base leading-relaxed text-slate-100">{mission}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Suggested", value: suggested, tone: "from-fuchsia-500/20 to-violet-500/20" },
          { label: "Backlog", value: backlog, tone: "from-indigo-500/20 to-violet-500/20" },
          { label: "In Progress", value: inProgress, tone: "from-cyan-500/20 to-sky-500/20" },
          { label: "Done", value: done, tone: "from-emerald-500/20 to-teal-500/20" },
        ].map((stat) => (
          <div key={stat.label} className={`panel-glass bg-gradient-to-br ${stat.tone} p-5`}>
            <p className="m-0 text-xs uppercase tracking-[0.18em] text-slate-300">{stat.label}</p>
            <p className="m-0 mt-2 text-3xl font-semibold text-slate-100">{tasks ? stat.value : "..."}</p>
          </div>
        ))}
      </section>

      <section className="panel-glass p-6">
        <h2 className="m-0 text-lg font-semibold text-slate-100">Control Panels</h2>
        <p className="m-0 mt-1 text-sm text-[color:var(--text-muted)]">Jump into operations modules.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/tasks", title: "Tasks", desc: "Kanban CRUD workflow" },
            { href: "/calendar", title: "Calendar", desc: "Schedule and day notes" },
            { href: "/memory", title: "Memory", desc: "Long-term and daily logs" },
            { href: "/team", title: "Team", desc: "Agent status and live load" },
            { href: "/office", title: "Office", desc: "Issue work orders" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="panel-soft p-4 transition hover:border-white/20 hover:bg-slate-800/65">
              <p className="m-0 text-base font-semibold text-slate-100">{item.title}</p>
              <p className="m-0 mt-1 text-sm text-[color:var(--text-muted)]">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
