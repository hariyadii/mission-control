"use client";
import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
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

function AgentBadge({ agent }: { agent: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    sam: { label: "SAM", color: "text-cyan-300", bg: "bg-cyan-500/20" },
    lyra: { label: "LYRA", color: "text-violet-300", bg: "bg-violet-500/20" },
    alex: { label: "ALEX", color: "text-amber-300", bg: "bg-amber-500/20" },
    nova: { label: "NOVA", color: "text-rose-300", bg: "bg-rose-500/20" },
  };
  const c = config[agent?.toLowerCase()] || { label: agent?.slice(0, 4).toUpperCase() || "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

type DeskCode = "alex" | "sam" | "lyra" | "nova";

const desks = [
  {
    code: "alex" as DeskCode,
    name: "Alex",
    channel: "Telegram",
    task: "Coordinating tasks, routing work, and memory alignment",
    accent: "amber" as const,
  },
  {
    code: "sam" as DeskCode,
    name: "Sam",
    channel: "Discord",
    task: "Executing delegated workflows and operations lane automation",
    accent: "cyan" as const,
  },
  {
    code: "lyra" as DeskCode,
    name: "Lyra",
    channel: "Discord (pending bot)",
    task: "Running capital lane research, paper trade signals, and strategy compounding",
    accent: "violet" as const,
  },
  {
    code: "nova" as DeskCode,
    name: "Nova",
    channel: "Headless Browser",
    task: "UI/UX lane: improve Mission Control layout, readability, and workflow ergonomics",
    accent: "rose" as const,
  },
];

function DeskCard({ desk }: { desk: (typeof desks)[0] }) {
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orderText, setOrderText] = useState("");
  const [assignee, setAssignee] = useState<DeskCode>(desk.code);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const createTask = useMutation(api.tasks.create);

  const handleSubmit = async () => {
    if (!orderText.trim()) return;
    setSubmitting(true);
    try {
      await createTask({
        title: orderText.trim(),
        description: `Ordered from Office for ${assignee.charAt(0).toUpperCase() + assignee.slice(1)}`,
        assigned_to: assignee,
        status: "backlog",
      });
      setOrderText("");
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setOrdersOpen(false);
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  const accentColors: Record<string, { border: string; glow: string; text: string }> = {
    amber: { border: "border-amber-500/30", glow: "shadow-amber-500/20", text: "text-amber-400" },
    cyan: { border: "border-cyan-500/30", glow: "shadow-cyan-500/20", text: "text-cyan-400" },
    violet: { border: "border-violet-500/30", glow: "shadow-violet-500/20", text: "text-violet-400" },
    rose: { border: "border-rose-500/30", glow: "shadow-rose-500/20", text: "text-rose-400" },
  };
  const colors = accentColors[desk.accent];

  return (
    <div className={`panel-glass p-4 border ${colors.border} shadow-lg ${colors.glow}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AgentBadge agent={desk.code} />
          <span className="text-sm font-semibold text-slate-100">{desk.name}</span>
        </div>
        <span className="text-[10px] text-slate-500">{desk.channel}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">{desk.task}</p>
      
      {!ordersOpen ? (
        <button
          onClick={() => setOrdersOpen(true)}
          className="w-full py-2 text-xs font-medium text-slate-300 border border-white/10 rounded-lg hover:bg-slate-800/50 transition"
        >
          + Create Work Order
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
            placeholder="Describe the work..."
            className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
            autoFocus
          />
          <div className="flex gap-2">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value as DeskCode)}
              className="flex-1 bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              {desks.map((d) => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </select>
            <button
              onClick={handleSubmit}
              disabled={submitting || !orderText.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-cyan-500 to-violet-500 text-white rounded-lg disabled:opacity-50 transition"
            >
              {submitting ? "..." : submitted ? "✓" : "Submit"}
            </button>
            <button
              onClick={() => setOrdersOpen(false)}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OfficePage() {
  const [lastUpdate] = useState(Date.now());

  return (
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Office</h1>
          <p className="text-xs text-slate-400">Issue work orders</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
        </div>
      </header>

      {/* Desks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {desks.map((desk) => (
          <DeskCard key={desk.code} desk={desk} />
        ))}
      </div>

      {/* Instructions */}
      <section className="panel-glass p-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">How it works</p>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>• Select an agent and describe the work needed</li>
          <li>• Task goes to backlog after submission</li>
          <li>• Agent picks up task on next worker cycle</li>
        </ul>
      </section>
    </div>
  );
}
