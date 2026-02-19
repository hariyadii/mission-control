"use client";
import { useState, useEffect, useCallback } from "react";

type MemoryData = {
  longTerm: { name: string; content: string };
  daily: { name: string; content: string; date: string }[];
};

function MemoryCard({ title, content, date }: { title: string; content: string; date?: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 300);
  const hasMore = content.length > 300;

  return (
    <article className="panel-soft p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-sm font-semibold text-slate-100">{title}</p>
          {date && <p className="m-0 mt-0.5 text-xs text-slate-400">{date}</p>}
        </div>
        {hasMore && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setExpanded(!expanded);
            }}
            className="btn-secondary px-2.5 py-1 text-xs"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-300">
        {expanded ? content : preview + (hasMore ? "..." : "")}
      </pre>
    </article>
  );
}

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMemory = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMemory("");
  }, [fetchMemory]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchMemory(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, fetchMemory]);

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Memory</h1>
          <p className="page-subtitle">Search across long-term memory and daily notes.</p>
        </div>
      </header>

      <section className="panel-glass p-5">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Search Memory</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to filter memory files..."
          className="input-glass max-w-xl"
        />
      </section>

      {loading ? (
        <div className="panel-soft p-4 text-sm text-slate-300">Loading memory...</div>
      ) : !data ? (
        <div className="panel-soft border-rose-400/35 p-4 text-sm text-rose-200">Failed to load memory.</div>
      ) : (
        <div className="space-y-5">
          {data.longTerm.content && (
            <section className="panel-glass p-5">
              <h2 className="m-0 text-base font-semibold text-violet-200">Long-Term Memory</h2>
              <p className="m-0 mt-1 text-xs text-slate-400">MEMORY.md</p>
              <div className="mt-3">
                <MemoryCard title="MEMORY.md" content={data.longTerm.content} />
              </div>
            </section>
          )}

          <section className="panel-glass p-5">
            <h2 className="m-0 text-base font-semibold text-cyan-200">Daily Notes</h2>
            {data.daily.length === 0 ? (
              <div className="panel-soft mt-3 p-6 text-center text-sm text-slate-400">
                {query ? "No matching memory files." : "No daily memory files found."}
              </div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {data.daily.map((file) => (
                  <MemoryCard key={file.name} title={file.name} content={file.content} date={file.date} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
