"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FreshnessIndicator, StatusBadge, PageHeader } from "@/components/ui";

const agents = [
  {
    code: "alex",
    name: "Alex",
    model: "MiniMax M2.5",
    channel: "Telegram",
    role: "Primary controller. Handles Telegram interactions, coordination, and memory workflows.",
    accent: { border: "border-amber-500/25",  glow: "shadow-amber-500/8",   text: "text-amber-400",   dot: "bg-amber-400"   },
    aliases: ["alex"],
  },
  {
    code: "sam",
    name: "Sam",
    model: "MiniMax M2.5",
    channel: "Discord",
    role: "Ops worker specialist. Handles delegated execution and operational automation.",
    accent: { border: "border-cyan-500/25",   glow: "shadow-cyan-500/8",    text: "text-cyan-400",    dot: "bg-cyan-400"    },
    aliases: ["sam", "agent", "clawdc"],
  },
  {
    code: "lyra",
    name: "Lyra",
    model: "MiniMax M2.5",
    channel: "Discord",
    role: "Capital lane strategist. Runs paper-trading research, signals, and portfolio reviews.",
    accent: { border: "border-violet-500/25", glow: "shadow-violet-500/8",  text: "text-violet-400",  dot: "bg-violet-400"  },
    aliases: ["lyra"],
  },
  {
    code: "nova",
    name: "Nova",
    model: "MiniMax M2.5",
    channel: "Headless Browser",
    role: "UI/UX specialist. Improves Mission Control dashboards, layouts, and human comfort.",
    accent: { border: "border-rose-500/25",   glow: "shadow-rose-500/8",    text: "text-rose-400",    dot: "bg-rose-400"    },
    aliases: ["nova"],
  },
];

function AgentCard({ agent, inProgressCount }: { agent: typeof agents[0]; inProgressCount: number | null }) {
  const { border, glow, text, dot } = agent.accent;
  const isActive = inProgressCount !== null && inProgressCount > 0;
  return (
    <div className={`panel-glass p-4 border ${border} shadow-lg ${glow} min-w-0`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${dot} ${isActive ? "animate-pulse" : "opacity-60"}`} />
          <span className={`text-sm font-bold ${text}`}>{agent.name}</span>
          <StatusBadge status="online" size="xs" />
        </div>
        <span className="text-[10px] text-slate-500">{agent.channel}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3 leading-relaxed">{agent.role}</p>
      <div className="flex items-center justify-between pt-2 border-t border-white/8">
        <span className="text-[10px] text-slate-600 font-mono">{agent.model}</span>
        <span className={`text-xs font-semibold ${isActive ? text : "text-slate-600"}`}>
          {inProgressCount === null ? "..." : isActive ? `${inProgressCount} running` : "idle"}
        </span>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const tasks = useQuery(api.tasks.list);
  const [lastUpdate] = useState(Date.now());

  const getCount = (aliases: string[]) => {
    if (!tasks) return null;
    const norm = aliases.map((a) => a.toLowerCase());
    return tasks.filter((t) => norm.includes(t.assigned_to?.toLowerCase() || "") && t.status === "in_progress").length;
  };

  return (
    <div className="space-y-4 page-enter">
      <PageHeader
        title="Team"
        subtitle="Agent status & workload"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map((a) => (
          <AgentCard key={a.code} agent={a} inProgressCount={getCount(a.aliases)} />
        ))}
      </div>
    </div>
  );
}
