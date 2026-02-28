"use client";
import { Suspense, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  CommandBar,
  FreshnessIndicator,
  StatusBadge,
  AgentBadge,
  PageHeader,
  Sparkline,
} from "@/components/ui";

// ── Agent Roster ───────────────────────────────────────────────────────────

const AGENTS = [
  {
    code:    "alex",
    name:    "Alex",
    model:   "MiniMax M2.5",
    channel: "Telegram",
    role:    "Primary controller. Handles Telegram interactions, coordination, and memory workflows.",
    accent: {
      border: "border-amber-500/22",
      bar:    "bg-amber-400",
      text:   "text-amber-400",
      dot:    "bg-amber-400",
      glow:   "shadow-amber-500/8",
    },
    aliases: ["alex"],
  },
  {
    code:    "sam",
    name:    "Sam",
    model:   "MiniMax M2.5",
    channel: "Discord",
    role:    "Ops worker specialist. Handles delegated execution and operational automation.",
    accent: {
      border: "border-cyan-500/22",
      bar:    "bg-cyan-400",
      text:   "text-cyan-400",
      dot:    "bg-cyan-400",
      glow:   "shadow-cyan-500/8",
    },
    aliases: ["sam", "agent", "clawdc"],
  },
  {
    code:    "lyra",
    name:    "Lyra",
    model:   "MiniMax M2.5",
    channel: "Discord",
    role:    "Capital lane strategist. Runs paper-trading research, signals, and portfolio reviews.",
    accent: {
      border: "border-violet-500/22",
      bar:    "bg-violet-400",
      text:   "text-violet-400",
      dot:    "bg-violet-400",
      glow:   "shadow-violet-500/8",
    },
    aliases: ["lyra"],
  },
  {
    code:    "nova",
    name:    "Nova",
    model:   "MiniMax M2.5",
    channel: "Headless Browser",
    role:    "UI/UX specialist. Improves Mission Control dashboards, layouts, and human comfort.",
    accent: {
      border: "border-rose-500/22",
      bar:    "bg-rose-400",
      text:   "text-rose-400",
      dot:    "bg-rose-400",
      glow:   "shadow-rose-500/8",
    },
    aliases: ["nova"],
  },
] as const;

type AgentDef = typeof AGENTS[number];

// ── TaskStat ────────────────────────────────────────────────────────────────

function Stat({ label, value, colorClass }: { label: string; value: string | number; colorClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className={`text-sm font-bold tabular-nums ${colorClass ?? ""}`} style={{ color: colorClass ? undefined : "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// ── Team Skeleton ─────────────────────────────────────────────────────────

function AgentCardSkeleton({ agent }: { agent: AgentDef }) {
  const { border, text, dot } = agent.accent;
  
  return (
    <article
      className={`panel-glass p-4 border ${border} shadow-lg min-w-0 flex flex-col gap-3 animate-pulse`}
      aria-label={`${agent.name} agent card`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot} opacity-50`} />
          <div className="bg-stone-100/50 rounded h-5 w-16" />
          <div className="bg-stone-100/50 rounded h-4 w-12" />
        </div>
        <div className="bg-stone-100/50 rounded h-3 w-16" />
      </div>
      <div className="bg-stone-100/30 rounded h-12 w-full" />
      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="bg-stone-100/30 rounded h-8 w-20" />
        <div className="bg-stone-100/30 rounded h-8 w-20" />
        <div className="bg-stone-100/30 rounded h-8 w-20" />
      </div>
      <div className="flex items-center justify-between pt-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="bg-stone-100/30 rounded h-3 w-24" />
        <div className="bg-stone-100/30 rounded h-4 w-16" />
      </div>
    </article>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 animate-pulse">
      {AGENTS.map((agent) => (
        <div key={agent.code} className={`panel-tile p-3 border ${agent.accent.border} flex items-center gap-3`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${agent.accent.dot} opacity-40`} />
          <div className="min-w-0">
            <div className="bg-stone-100/50 rounded h-5 w-12 mb-1" />
            <div className="bg-stone-100/30 rounded h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AgentCard ───────────────────────────────────────────────────────────

function AgentCard({
  agent,
  inProgressCount,
  doneCount,
  backlogCount,
  sparkData,
}: {
  agent:           AgentDef;
  inProgressCount: number | null;
  doneCount:       number | null;
  backlogCount:    number | null;
  sparkData:       number[];
}) {
  const { border, text, dot, glow } = agent.accent;
  const isActive = inProgressCount !== null && inProgressCount > 0;

  const sparkColor =
    agent.code === "alex"  ? "amber"   :
    agent.code === "sam"   ? "cyan"    :
    agent.code === "lyra"  ? "violet"  :
    "rose";

  return (
    <article
      className={`panel-glass p-4 border ${border} shadow-lg ${glow} min-w-0 flex flex-col gap-3`}
      aria-label={`${agent.name} agent card`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${dot} ${isActive ? "animate-pulse" : "opacity-50"}`}
            aria-hidden="true"
          />
          <span className={`text-sm font-bold ${text}`}>{agent.name}</span>
          <AgentBadge agent={agent.code} size="xs" />
          <StatusBadge status={isActive ? "busy" : "online"} size="xs" />
        </div>
        <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
          {agent.channel}
        </span>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {agent.role}
      </p>

      <div
        className="flex items-center justify-between pt-2"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <Stat
          label="Running"
          value={inProgressCount === null ? "…" : inProgressCount}
          colorClass={isActive ? text : undefined}
        />
        <Stat label="Backlog" value={backlogCount === null ? "…" : backlogCount} />
        <Stat label="Done" value={doneCount === null ? "…" : doneCount} />

        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>
            7d
          </span>
          <Sparkline data={sparkData} color={sparkColor as "amber" | "cyan" | "violet" | "rose"} height={18} />
        </div>
      </div>

      <div
        className="flex items-center justify-between pt-1.5"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
          {agent.model}
        </span>
        <span className={`text-xs font-semibold ${isActive ? text : ""}`} style={{ color: isActive ? undefined : "var(--text-faint)" }}>
          {inProgressCount === null ? "…" : isActive ? `${inProgressCount} running` : "idle"}
        </span>
      </div>
    </article>
  );
}

// ── Main Content with Suspense ───────────────────────────────────────────

function TeamContent() {
  const tasks     = useQuery(api.tasks.list);
  const [lastUpdate] = useState(Date.now());

  const stats = useMemo(() => {
    if (!tasks) return null;
    const byAgent: Record<string, { inProgress: number; done: number; backlog: number; doneByDay: Record<string, number> }> = {};

    for (const agent of AGENTS) {
      byAgent[agent.code] = { inProgress: 0, done: 0, backlog: 0, doneByDay: {} };
    }

    const now = Date.now();
    const MS_PER_DAY = 86_400_000;

    for (const t of tasks) {
      const a = t.assigned_to?.toLowerCase() ?? "";
      const match = AGENTS.find((ag) => (ag.aliases as readonly string[]).includes(a));
      if (!match) continue;

      const bucket = byAgent[match.code];
      if (t.status === "in_progress") bucket.inProgress++;
      if (t.status === "done")        bucket.done++;
      if (t.status === "backlog")     bucket.backlog++;

      if (t.status === "done") {
        const ts = (t as { _creationTime?: number })._creationTime ?? 0;
        const daysAgo = Math.floor((now - ts) / MS_PER_DAY);
        if (daysAgo >= 0 && daysAgo < 7) {
          const slot = String(6 - daysAgo);
          bucket.doneByDay[slot] = (bucket.doneByDay[slot] ?? 0) + 1;
        }
      }
    }

    return byAgent;
  }, [tasks]);

  return (
    <div className="flex flex-col gap-5 page-enter">
      <CommandBar
        title="Team"
        subtitle="Agent roster"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />

      <PageHeader
        title="Team"
        subtitle="Agent status, workload, and 7-day activity"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />

      <Suspense fallback={<SummarySkeleton />}>
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {AGENTS.map((agent) => {
              const s   = stats[agent.code];
              const isActive = s.inProgress > 0;
              return (
                <div
                  key={agent.code}
                  className={`panel-tile p-3 border ${agent.accent.border} flex items-center gap-3`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${agent.accent.dot} ${isActive ? "animate-pulse" : "opacity-40"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${agent.accent.text}`}>{agent.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {isActive ? `${s.inProgress} running` : "idle"} · {s.done} done
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Suspense>

      <Suspense fallback={
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AGENTS.map((agent) => (
            <AgentCardSkeleton key={agent.code} agent={agent} />
          ))}
        </div>
      }>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AGENTS.map((agent) => {
            const s = stats?.[agent.code];
            const sparkData = s
              ? Array.from({ length: 7 }, (_, i) => s.doneByDay[String(i)] ?? 0)
              : [0, 0, 0, 0, 0, 0, 0];

            return (
              <AgentCard
                key={agent.code}
                agent={agent}
                inProgressCount={s?.inProgress ?? null}
                doneCount={s?.done ?? null}
                backlogCount={s?.backlog ?? null}
                sparkData={sparkData}
              />
            );
          })}
        </div>
      </Suspense>
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-5 page-enter animate-pulse">
        <div className="h-16 bg-stone-100/30 rounded-lg" />
        <SummarySkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AGENTS.map((agent) => (
            <AgentCardSkeleton key={agent.code} agent={agent} />
          ))}
        </div>
      </div>
    }>
      <TeamContent />
    </Suspense>
  );
}
