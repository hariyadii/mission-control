"use client";
import { useState, useEffect, useCallback } from "react";
import { FreshnessIndicator, PageHeader, FilterInput } from "@/components/ui";

type MemoryData = {
  longTerm: { name: string; content: string };
  daily:    { name: string; content: string; date: string }[];
};

function MemoryCard({ title, content, date }: { title: string; content: string; date?: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 220);
  const hasMore = content.length > 220;

  return (
    <article className="panel-soft p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-200 truncate">{title}</p>
          {date && <p className="text-[9px] text-slate-500 mt-0.5">{date}</p>}
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn-ghost text-[10px] shrink-0"
          >
            {expanded ? "↑ Collapse" : "↓ Expand"}
          </button>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-slate-400 overflow-x-hidden max-w-full">
        {expanded ? content : preview + (hasMore ? "…" : "")}
      </pre>
    </article>
  );
}

export default function MemoryPage() {
  const [query,      setQuery]      = useState("");
  const [data,       setData]       = useState<MemoryData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const fetchMemory = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/memory?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setData(json);
      setLastUpdate(Date.now());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMemory(""); }, [fetchMemory]);

  useEffect(() => {
    const t = setTimeout(() => void fetchMemory(query), 300);
    return () => clearTimeout(t);
  }, [query, fetchMemory]);

  return (
    <div className="space-y-4 page-enter">
      <PageHeader
        title="Memory"
        subtitle="Search & logs"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />

      <div className="panel-glass p-2.5">
        <FilterInput value={query} onChange={setQuery} placeholder="Search memory…" className="text-xs" />
      </div>

      {loading ? (
        <div className="panel-soft p-4 text-xs text-slate-500 text-center animate-pulse">Loading…</div>
      ) : !data ? (
        <div className="panel-soft p-4 text-xs text-rose-400 text-center">Failed to load memory</div>
      ) : (
        <div className="space-y-3">
          {data.longTerm.content && (
            <section className="panel-glass p-3">
              <p className="section-label text-violet-400 mb-2">Long-Term Memory</p>
              <MemoryCard title="MEMORY.md" content={data.longTerm.content} />
            </section>
          )}
          <section className="panel-glass p-3">
            <p className="section-label text-cyan-400 mb-2">Daily Notes</p>
            {data.daily.length === 0 ? (
              <p className="text-[10px] text-slate-600 text-center py-3">
                {query ? "No matches" : "No daily files"}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                {data.daily.slice(0, 12).map((f) => (
                  <MemoryCard key={f.name} title={f.name} content={f.content} date={f.date} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
