"use client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const agents = [
  {
    code: "alex",
    name: "Alex",
    model: "Claude Sonnet 4.6",
    channel: "Telegram",
    role: "Primary controller. Handles Telegram interactions, coordination, and memory workflows.",
    accent: "alex" as const,
    aliases: ["alex"],
  },
  {
    code: "sam",
    name: "Sam",
    model: "MiniMax M2.5",
    channel: "Discord",
    role: "Worker specialist. Handles Discord operations and delegated execution tasks.",
    accent: "sam" as const,
    aliases: ["sam", "agent", "clawdc"],
  },
];

export default function TeamPage() {
  const tasks = useQuery(api.tasks.list);

  const getInProgressCount = (aliases: string[]) => {
    if (!tasks) return null;
    const normalized = aliases.map((a) => a.toLowerCase());
    return tasks.filter((t) => normalized.includes(t.assigned_to.toLowerCase()) && t.status === "in_progress").length;
  };

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Live view of active agents and workload.</p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        {agents.map((agent) => {
          const inProgressCount = getInProgressCount(agent.aliases);
          const badgeClass = agent.accent === "alex" ? "badge-alex" : "badge-sam";
          const gradient =
            agent.accent === "alex"
              ? "from-[rgba(109,91,255,0.2)] to-[rgba(138,77,255,0.16)]"
              : "from-[rgba(18,207,208,0.2)] to-[rgba(14,165,198,0.16)]";

          return (
            <article key={agent.code} className={`panel-glass bg-gradient-to-br ${gradient} p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="m-0 text-xl font-semibold text-slate-100">{agent.name}</p>
                  <p className="m-0 mt-1 text-sm text-slate-300">{agent.role}</p>
                </div>
                <span className={`badge ${badgeClass}`}>Online</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`badge ${badgeClass}`}>{agent.model}</span>
                <span className="badge badge-legacy">{agent.channel}</span>
              </div>

              <div className="panel-soft mt-4 p-3">
                <p className="m-0 text-xs uppercase tracking-wide text-slate-400">In Progress</p>
                <p className="m-0 mt-1 text-lg font-semibold text-slate-100">
                  {inProgressCount === null
                    ? "Loading..."
                    : inProgressCount === 0
                      ? "No tasks"
                      : `${inProgressCount} task${inProgressCount === 1 ? "" : "s"}`}
                </p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
