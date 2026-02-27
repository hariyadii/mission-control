"use client";
import { useState, useEffect, useCallback } from "react";

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

type MemoryData = {
  longTerm: { name: string; content: string };
  daily: { name: string; content: string; date: string }[];
};

function MemoryCard({ title, content, date }: { title: string; content: string; date?: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 200);
  const hasMore = content.length > 200;

  return (
    <article className="panel-soft p-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div>
          <p className="text-xs font-semibold text-slate-200">{title}</p>
          {date && <p className="text-[9px] text-slate-500">{date}</p>}
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[9px] text-cyan-400 hover:text-cyan-300"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-slate-400">
        {expanded ? content : preview + (hasMore ? "..." : "")}
      </pre>
    </article>
  );
}

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const fetchMemory = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setData(json);
      setLastUpdate(Date.now());
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
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Memory</h1>
          <p className="text-xs text-slate-400">Search & logs</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
        </div>
      </header>

      {/* Search Bar */}
      <div className="panel-glass p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memory..."
          className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
        />
      </div>

      {loading ? (
        <div className="panel-soft p-3 text-xs text-slate-400">Loading...</div>
      ) : !data ? (
        <div className="panel-soft p-3 text-xs text-rose-400">Failed to load memory</div>
      ) : (
        <div className="space-y-2">
          {/* Long-Term Memory */}
          {data.longTerm.content && (
            <section className="panel-glass p-2">
              <h2 className="text-xs font-semibold text-violet-300 mb-2">Long-Term</h2>
              <MemoryCard title="MEMORY.md" content={data.longTerm.content} />
            </section>
          )}

          {/* Daily Notes */}
          <section className="panel-glass p-2">
            <h2 className="text-xs font-semibold text-cyan-300 mb-2">Daily Notes</h2>
            {data.daily.length === 0 ? (
              <p className="text-[10px] text-slate-500 text-center py-2">
                {query ? "No matches" : "No daily files"}
              </p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {data.daily.slice(0, 10).map((file) => (
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
