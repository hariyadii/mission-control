"use client";
/**
 * Memory — Search & Logs
 * Enterprise-polish:
 *  - Highlight search matches in content preview
 *  - Tag indicators for work/decision/todo/personal categories
 *  - Execution trace markers (tasks found in memory)
 *  - Loading skeleton instead of text placeholder
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { FreshnessIndicator, PageHeader, FilterInput } from "@/components/ui";

type MemoryData = {
  longTerm: { name: string; content: string };
  daily:    { name: string; content: string; date: string }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

// Detect content tags from text
function detectTags(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];
  if (/(task|project|build|deploy|ops|workflow|cron|autonomy)/.test(lower)) tags.push("work");
  if (/(decision|decide|chose|lesson|learned|rationale)/.test(lower))       tags.push("decision");
  if (/(todo|next|follow up|pending|action item)/.test(lower))               tags.push("todo");
  if (/(personal|family|health|travel)/.test(lower))                         tags.push("personal");
  if (/(incident|blocker|critical|outage|sev)/.test(lower))                  tags.push("incident");
  return tags.length ? tags : ["note"];
}

const TAG_STYLE: Record<string, { bg: string; text: string }> = {
  work:     { bg: "bg-indigo-500/15 border border-indigo-500/28", text: "text-indigo-300"  },
  decision: { bg: "bg-violet-500/15 border border-violet-500/28", text: "text-violet-300"  },
  todo:     { bg: "bg-amber-500/15 border border-amber-500/28",   text: "text-amber-300"   },
  personal: { bg: "bg-rose-500/15 border border-rose-500/28",     text: "text-rose-300"    },
  incident: { bg: "bg-rose-500/20 border border-rose-500/35",     text: "text-rose-400"    },
  note:     { bg: "bg-stone-200/45 border border-stone-300/35",   text: "text-stone-500"   },
};

// Highlight query matches in text
function highlightText(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), (m) => `【${m}】`);
}

// Count query occurrences in text
function countMatches(content: string, query: string): number {
  if (!query.trim()) return 0;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (content.match(new RegExp(escaped, "gi")) ?? []).length;
}

// ── Memory Card ────────────────────────────────────────────────────────────

function MemoryCard({
  title,
  content,
  date,
  query,
}: {
  title:   string;
  content: string;
  date?:   string;
  query:   string;
}) {
  const [expanded, setExpanded] = useState(false);
  const tags = useMemo(() => detectTags(content), [content]);
  const matches = useMemo(() => countMatches(content, query), [content, query]);

  const previewLength = 240;
  const preview  = content.slice(0, previewLength);
  const hasMore  = content.length > previewLength;
  const displayContent = expanded ? content : preview + (hasMore ? "…" : "");

  // Highlight matches in preview
  const displayWithHighlights = useMemo(() => {
    if (!query.trim()) return displayContent;
    return highlightText(displayContent, query);
  }, [displayContent, query]);

  return (
    <article className="panel-soft p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-stone-700 truncate">{title}</p>
            {/* Tags */}
            {tags.slice(0, 3).map((tag) => {
              const s = TAG_STYLE[tag] ?? TAG_STYLE.note;
              return (
                <span key={tag} className={`text-[8px] font-bold px-1 py-0.5 rounded ${s.bg} ${s.text}`}>
                  {tag}
                </span>
              );
            })}
            {matches > 0 && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30 text-yellow-300">
                {matches} match{matches !== 1 ? "es" : ""}
              </span>
            )}
          </div>
          {date && <p className="text-[9px] text-stone-500 mt-0.5">{date}</p>}
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn-ghost text-[10px] shrink-0"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "↑ Collapse" : "↓ Expand"}
          </button>
        )}
      </div>

      {/* Content with match highlights */}
      <pre
        className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-stone-500 overflow-x-hidden max-w-full"
        dangerouslySetInnerHTML={{
          __html: displayWithHighlights
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            // Re-apply our highlight markers as spans
            .replace(/【/g, '<mark class="bg-yellow-500/25 text-yellow-200 rounded px-0.5">')
            .replace(/】/g, "</mark>"),
        }}
      />
    </article>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function MemorySkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="panel-soft p-3 space-y-1.5 animate-pulse">
          <div className="h-3 bg-stone-200/60 rounded w-32" />
          <div className="h-2 bg-stone-100/70 rounded w-full" />
          <div className="h-2 bg-stone-100/70 rounded w-4/5" />
          <div className="h-2 bg-stone-100/70 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const [query,      setQuery]      = useState("");
  const [data,       setData]       = useState<MemoryData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [tagFilter,  setTagFilter]  = useState<string>("all");

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

  // Count all daily files by tag
  const tagCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = { all: data.daily.length };
    for (const f of data.daily) {
      for (const tag of detectTags(f.content)) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [data]);

  // Apply tag filter to daily files
  const filteredDaily = useMemo(() => {
    if (!data) return [];
    if (tagFilter === "all") return data.daily;
    return data.daily.filter((f) => detectTags(f.content).includes(tagFilter));
  }, [data, tagFilter]);

  // Total match count across all daily files
  const totalMatches = useMemo(() => {
    if (!data || !query.trim()) return 0;
    return data.daily.reduce((sum, f) => sum + countMatches(f.content, query), 0)
      + countMatches(data.longTerm.content ?? "", query);
  }, [data, query]);

  const availableTags = Object.keys(tagCounts).filter((k) => k !== "all");

  return (
    <div className="flex flex-col gap-4 page-enter">
      <PageHeader
        title="Memory"
        subtitle="Search workspace memory & daily logs"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />

      {/* Search bar */}
      <div className="panel-glass p-2.5 flex items-center gap-2">
        <FilterInput
          value={query}
          onChange={setQuery}
          placeholder="Search memory…"
          className="text-xs"
        />
        {query && totalMatches > 0 && (
          <span className="text-[10px] text-yellow-300 font-medium shrink-0 tabular-nums">
            {totalMatches} match{totalMatches !== 1 ? "es" : ""}
          </span>
        )}
        {query && totalMatches === 0 && !loading && (
          <span className="text-[10px] text-stone-500 shrink-0">No matches</span>
        )}
      </div>

      {/* Tag filter pills */}
      {availableTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by tag">
          <button
            onClick={() => setTagFilter("all")}
            aria-pressed={tagFilter === "all"}
            className={`text-[9px] font-semibold px-2 py-1 rounded-md transition-colors ${
              tagFilter === "all"
                ? "bg-stone-200/70 text-stone-700 border border-stone-300/50"
                : "text-stone-500 hover:text-stone-500"
            }`}
          >
            All ({tagCounts.all ?? 0})
          </button>
          {availableTags.map((tag) => {
            const s = TAG_STYLE[tag] ?? TAG_STYLE.note;
            return (
              <button
                key={tag}
                onClick={() => setTagFilter(tag === tagFilter ? "all" : tag)}
                aria-pressed={tagFilter === tag}
                className={`text-[9px] font-semibold px-2 py-1 rounded-md transition-colors capitalize ${
                  tagFilter === tag
                    ? `${s.bg} ${s.text}`
                    : "text-stone-500 hover:text-stone-500"
                }`}
              >
                {tag} ({tagCounts[tag] ?? 0})
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="panel-glass p-3">
            <p className="section-label text-violet-400 mb-2">Long-Term Memory</p>
            <MemorySkeleton />
          </div>
          <div className="panel-glass p-3">
            <p className="section-label text-cyan-400 mb-2">Daily Notes</p>
            <MemorySkeleton />
          </div>
        </div>
      ) : !data ? (
        <div className="panel-soft p-4 text-xs text-rose-400 text-center rounded-xl border border-rose-500/20">
          Failed to load memory
        </div>
      ) : (
        <div className="space-y-3">
          {data.longTerm.content && (
            <section className="panel-glass p-3">
              <p className="section-label text-violet-400 mb-2">Long-Term Memory</p>
              <MemoryCard title="MEMORY.md" content={data.longTerm.content} query={query} />
            </section>
          )}
          <section className="panel-glass p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="section-label text-cyan-400">Daily Notes</p>
              <span className="text-[9px] text-stone-500 tabular-nums">
                {filteredDaily.length} / {data.daily.length} files
              </span>
            </div>
            {filteredDaily.length === 0 ? (
              <p className="text-[10px] text-stone-500 text-center py-3">
                {query || tagFilter !== "all" ? "No matches" : "No daily files"}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {filteredDaily.slice(0, 15).map((f) => (
                  <MemoryCard key={f.name} title={f.name} content={f.content} date={f.date} query={query} />
                ))}
                {filteredDaily.length > 15 && (
                  <p className="text-[9px] text-stone-500 text-center py-2">
                    {filteredDaily.length - 15} more files not shown
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
