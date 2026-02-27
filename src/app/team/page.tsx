"use client";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

// Visual consistency components (matching homepage)
function FreshnessIndicator({ lastUpdate }: { lastUpdate: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  const diff = now - lastUpdate;
  const isStale = diff > 60000;
  return (
    <span className={`text-[10px] ${isStale ? "text-amber-400" : "text-emerald-400"}`}>
      {isStale ? "⚠" : "●"} {diff > 3600000 ? `${Math.floor(diff/3600000)}h` : diff > 60000 ? `${Math.floor(diff/60000)}m` : "now"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    online: { label: "ONLINE", color: "text-emerald-300", bg: "bg-emerald-500/20" },
    offline: { label: "OFFLINE", color: "text-slate-400", bg: "bg-slate-500/20" },
    busy: { label: "BUSY", color: "text-amber-300", bg: "bg-amber-500/20" },
  };
  const c = config[status?.toLowerCase()] || { label: status?.slice(0, 6).toUpperCase() || "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

const agents = [
  {
    code: "alex",
    name: "Alex",
    model: "MiniMax M2.5",
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
    role: "Ops worker specialist. Handles delegated execution and operational automation.",
    accent: "sam" as const,
    aliases: ["sam", "agent", "clawdc"],
  },
  {
    code: "lyra",
    name: "Lyra",
    model: "MiniMax M2.5",
    channel: "Discord",
    role: "Capital lane strategist. Runs paper-trading research, signals, and portfolio reviews.",
    accent: "lyra" as const,
    aliases: ["lyra"],
  },
  {
    code: "nova",
    name: "Nova",
    model: "MiniMax M2.5",
    channel: "Headless Browser",
    role: "UI/UX specialist. Improves Mission Control dashboards, layouts, and human comfort.",
    accent: "nova" as const,
    aliases: ["nova"],
  },
];

function AgentCard({ agent, inProgressCount }: { agent: typeof agents[0]; inProgressCount: number | null }) {
  const accentColors: Record<string, { border: string; glow: string; text: string; gradient: string }> = {
    alex: { border: "border-amber-500/30", glow: "shadow-amber-500/10", text: "text-amber-400", gradient: "from-amber-500/20 to-violet-500/10" },
    sam: { border: "border-cyan-500/30", glow: "shadow-cyan-500/10", text: "text-cyan-400", gradient: "from-cyan-500/20 to-sky-500/10" },
    lyra: { border: "border-violet-500/30", glow: "shadow-violet-500/10", text: "text-violet-400", gradient: "from-violet-500/20 to-fuchsia-500/10" },
    nova: { border: "border-rose-500/30", glow: "shadow-rose-500/10", text: "text-rose-400", gradient: "from-rose-500/20 to-amber-500/10" },
  };
  const colors = accentColors[agent.accent];

  return (
    <div className={`panel-glass p-3 border ${colors.border} shadow-lg ${colors.glow}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${colors.text}`}>{agent.name}</span>
          <StatusBadge status="online" />
        </div>
        <span className="text-[9px] text-slate-500">{agent.channel}</span>
      </div>
      <p className="text-xs text-slate-400 mb-2 line-clamp-2" title={agent.role}>{agent.role}</p>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-500">{agent.model}</span>
        <span className={`text-xs font-semibold ${inProgressCount !== null && inProgressCount > 0 ? "text-cyan-400" : "text-slate-400"}`}>
          {inProgressCount === null ? "..." : inProgressCount > 0 ? `${inProgressCount} running` : "idle"}
        </span>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const tasks = useQuery(api.tasks.list);
  const [lastUpdate] = useState(Date.now());

  const getInProgressCount = (aliases: string[]) => {
    if (!tasks) return null;
    const normalized = aliases.map((a) => a.toLowerCase());
    return tasks.filter((t) => normalized.includes(t.assigned_to?.toLowerCase() || "") && t.status === "in_progress").length;
  };

  return (
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Team</h1>
          <p className="text-xs text-slate-400">Agent status & workload</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
        </div>
      </header>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {agents.map((agent) => (
          <AgentCard 
            key={agent.code} 
            agent={agent} 
            inProgressCount={getInProgressCount(agent.aliases)} 
          />
        ))}
      </div>
    </div>
  );
}
