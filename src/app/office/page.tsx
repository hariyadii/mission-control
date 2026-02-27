"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AgentBadge, PageHeader } from "@/components/ui";

type DeskCode = "alex" | "sam" | "lyra" | "nova";

const desks = [
  {
    code: "alex" as DeskCode,
    name: "Alex",
    channel: "Telegram",
    task: "Coordinating tasks, routing work, and memory alignment",
    accent: { border: "border-amber-500/25",  text: "text-amber-400",   btn: "from-amber-500 to-orange-500"  },
  },
  {
    code: "sam" as DeskCode,
    name: "Sam",
    channel: "Discord",
    task: "Executing delegated workflows and operations lane automation",
    accent: { border: "border-cyan-500/25",   text: "text-cyan-400",    btn: "from-cyan-500 to-sky-500"      },
  },
  {
    code: "lyra" as DeskCode,
    name: "Lyra",
    channel: "Discord (pending bot)",
    task: "Running capital lane research, paper trade signals, and strategy compounding",
    accent: { border: "border-violet-500/25", text: "text-violet-400",  btn: "from-violet-500 to-purple-500" },
  },
  {
    code: "nova" as DeskCode,
    name: "Nova",
    channel: "Headless Browser",
    task: "UI/UX lane: improve Mission Control layout, readability, and workflow ergonomics",
    accent: { border: "border-rose-500/25",   text: "text-rose-400",    btn: "from-rose-500 to-pink-500"     },
  },
];

function DeskCard({ desk }: { desk: (typeof desks)[0] }) {
  const [open,       setOpen]      = useState(false);
  const [text,       setText]      = useState("");
  const [assignee,   setAssignee]  = useState<DeskCode>(desk.code);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const createTask = useMutation(api.tasks.create);

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await createTask({
        title: text.trim(),
        description: `Ordered from Office for ${assignee.charAt(0).toUpperCase() + assignee.slice(1)}`,
        assigned_to: assignee,
        status: "backlog",
      });
      setText("");
      setSubmitted(true);
      setTimeout(() => { setSubmitted(false); setOpen(false); }, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`panel-glass p-4 border ${desk.accent.border} min-w-0`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <AgentBadge agent={desk.code} size="sm" />
          <span className={`text-sm font-semibold ${desk.accent.text}`}>{desk.name}</span>
        </div>
        <span className="text-[10px] text-slate-500">{desk.channel}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3 leading-relaxed">{desk.task}</p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-3 text-xs font-medium text-slate-400 border border-dashed border-white/10 rounded-lg hover:border-white/25 hover:text-slate-200 transition min-h-[44px]"
        >
          + Create work order
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="Describe the work..."
            className="input-glass text-xs"
            autoFocus
          />
          <div className="flex gap-2">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value as DeskCode)}
              className="input-glass text-xs w-auto py-1.5"
            >
              {desks.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
            <button
              onClick={() => void submit()}
              disabled={submitting || !text.trim()}
              className={`btn-primary text-xs py-1.5 px-3 bg-gradient-to-r ${desk.accent.btn}`}
            >
              {submitting ? "…" : submitted ? "✓" : "Submit"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-ghost text-xs">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OfficePage() {
  return (
    <div className="space-y-4 page-enter">
      <PageHeader title="Office" subtitle="Issue work orders to agents" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {desks.map((d) => <DeskCard key={d.code} desk={d} />)}
      </div>
      <section className="panel-glass p-4">
        <p className="section-label mb-2">How it works</p>
        <ul className="text-xs text-slate-400 space-y-1.5">
          <li className="flex items-start gap-2"><span className="text-slate-600 mt-0.5">·</span> Select an agent and describe the work needed</li>
          <li className="flex items-start gap-2"><span className="text-slate-600 mt-0.5">·</span> Task enters backlog after submission</li>
          <li className="flex items-start gap-2"><span className="text-slate-600 mt-0.5">·</span> Agent picks it up on the next worker cycle</li>
        </ul>
      </section>
    </div>
  );
}
