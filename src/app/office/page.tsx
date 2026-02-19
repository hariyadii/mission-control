"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

const desks = [
  {
    code: "alex",
    name: "Alex",
    channel: "Telegram",
    task: "Coordinating tasks, routing work, and memory alignment",
    accent: "alex" as const,
  },
  {
    code: "sam",
    name: "Sam",
    channel: "Discord",
    task: "Executing delegated workflows and Discord operations",
    accent: "sam" as const,
  },
];

function DeskCard({ desk }: { desk: (typeof desks)[0] }) {
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orderText, setOrderText] = useState("");
  const [assignee, setAssignee] = useState<"alex" | "sam">(desk.code as "alex" | "sam");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const createTask = useMutation(api.tasks.create);

  const handleSubmit = async () => {
    if (!orderText.trim()) return;
    setSubmitting(true);
    try {
      await createTask({
        title: orderText.trim(),
        description: `Ordered from Office for ${assignee === "alex" ? "Alex" : "Sam"}`,
        assigned_to: assignee,
        status: "backlog",
      });
      setOrderText("");
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setOrdersOpen(false);
      }, 1400);
    } finally {
      setSubmitting(false);
    }
  };

  const isAlex = desk.accent === "alex";

  return (
    <article
      className={`panel-glass w-full max-w-[320px] p-5 ${
        isAlex
          ? "bg-gradient-to-br from-[rgba(109,91,255,0.2)] to-[rgba(138,77,255,0.13)]"
          : "bg-gradient-to-br from-[rgba(18,207,208,0.2)] to-[rgba(14,165,198,0.13)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-lg font-semibold text-slate-100">{desk.name}</p>
          <p className="m-0 mt-1 text-xs uppercase tracking-wide text-slate-300">{desk.channel}</p>
        </div>
        <span className={`badge ${isAlex ? "badge-alex" : "badge-sam"}`}>Active</span>
      </div>

      <p className="panel-soft mt-3 p-3 text-xs leading-relaxed text-slate-300">{desk.task}</p>

      <button onClick={() => setOrdersOpen(!ordersOpen)} className="btn-primary mt-4 w-full">
        {ordersOpen ? "Close Orders" : "Give Orders"}
      </button>

      {ordersOpen && (
        <div className="mt-3 space-y-2.5">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Assign To</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAssignee("alex")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  assignee === "alex"
                    ? "border-violet-300/45 bg-violet-500/25 text-violet-100"
                    : "border-white/15 bg-slate-800/65 text-slate-300"
                }`}
              >
                Alex
              </button>
              <button
                type="button"
                onClick={() => setAssignee("sam")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  assignee === "sam"
                    ? "border-cyan-300/45 bg-cyan-500/25 text-cyan-100"
                    : "border-white/15 bg-slate-800/65 text-slate-300"
                }`}
              >
                Sam
              </button>
            </div>
          </div>

          <textarea
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
            placeholder={`What should ${assignee === "alex" ? "Alex" : "Sam"} work on?`}
            rows={3}
            className="input-glass resize-y"
          />

          <button onClick={() => void handleSubmit()} disabled={submitting || !orderText.trim()} className="btn-primary w-full">
            {submitted ? "Queued" : submitting ? "Sending..." : "Assign Task"}
          </button>
        </div>
      )}
    </article>
  );
}

export default function OfficePage() {
  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Office</h1>
          <p className="page-subtitle">Issue work orders to active agents from the virtual floor.</p>
        </div>
      </header>

      <section className="panel-glass p-6">
        <div className="office-desks flex flex-wrap justify-center gap-4">
          {desks.map((desk) => (
            <DeskCard key={desk.code} desk={desk} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Agents Online", value: "2 / 2" },
          { label: "Channels", value: "Telegram + Discord" },
          { label: "Office Status", value: "Open" },
        ].map((stat) => (
          <article key={stat.label} className="panel-glass p-4">
            <p className="m-0 text-xs uppercase tracking-wide text-slate-400">{stat.label}</p>
            <p className="m-0 mt-1.5 text-base font-semibold text-slate-100">{stat.value}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
