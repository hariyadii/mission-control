"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { FreshnessIndicator, StatusBadge, PageHeader, SectionCard } from "@/components/ui";

type CronJob = {
  id:           string;
  name:         string;
  scheduleKind: string;
  scheduleDesc: string;
  payloadKind:  string;
  payloadText:  string;
  enabled:      boolean;
};

type CalendarNote = {
  _id:        Id<"calendarNotes">;
  date:       string;
  note:       string;
  created_at: string;
};

const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDay(y: number, m: number)    { return new Date(y, m, 1).getDay(); }
function toKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [year,        setYear]        = useState(today.getFullYear());
  const [month,       setMonth]       = useState(today.getMonth());
  const [jobs,        setJobs]        = useState<CronJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [newNote,     setNewNote]     = useState("");
  const [saving,      setSaving]      = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState(Date.now());

  const notes     = useQuery(api.calendar.listNotes) as CalendarNote[] | undefined;
  const addNote   = useMutation(api.calendar.addNote);
  const deleteNote= useMutation(api.calendar.deleteNote);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((d) => { setJobs(d.jobs ?? []); setLastUpdate(Date.now()); })
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); setSelectedDay(null); };
  const nextMonth = () => { if (month === 11) { setMonth(0);  setYear((y) => y + 1); } else setMonth((m) => m + 1); setSelectedDay(null); };

  const dim    = daysInMonth(year, month);
  const fd     = firstDay(year, month);
  const cells: (number | null)[] = [...Array(fd).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];

  const isToday = (d: number | null) =>
    d !== null && d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const notesForDay = (d: number | null) => {
    if (!d || !notes) return [];
    const k = toKey(year, month, d);
    return notes.filter((n) => n.date === k);
  };

  const selectedDateStr = selectedDay ? toKey(year, month, selectedDay) : null;
  const selectedNotes   = selectedDay ? notesForDay(selectedDay) : [];

  const saveNote = async () => {
    if (!newNote.trim() || !selectedDateStr) return;
    setSaving(true);
    try {
      await addNote({ date: selectedDateStr, note: newNote.trim() });
      setNewNote("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 page-enter">
      <PageHeader
        title="Calendar"
        subtitle="Schedule & notes"
        right={<FreshnessIndicator lastUpdate={lastUpdate} />}
      />

      {/* Calendar grid */}
      <SectionCard>
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="btn-ghost text-base px-2 py-1">‹</button>
          <p className="text-sm font-bold text-slate-100">{MONTHS[month]} {year}</p>
          <button onClick={nextMonth} className="btn-ghost text-base px-2 py-1">›</button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-[9px] font-semibold uppercase text-slate-600 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const sel    = selectedDay === d;
            const todayC = isToday(d);
            const hasN   = notesForDay(d).length > 0;
            return (
              <button
                key={i}
                type="button"
                disabled={d === null}
                onClick={() => d && setSelectedDay(sel ? null : d)}
                aria-label={d ? `${MONTHS[month]} ${d}, ${year}${isToday(d) ? " (today)" : ""}${notesForDay(d).length > 0 ? `, ${notesForDay(d).length} note${notesForDay(d).length > 1 ? "s" : ""}` : ""}` : undefined}
                aria-pressed={sel ? true : undefined}
                className={[
                  "relative min-h-[44px] rounded-lg text-xs font-medium transition-all duration-100 disabled:cursor-default",
                  d === null       ? "bg-transparent"                                                    :
                  todayC           ? "border border-indigo-400/50 bg-indigo-500/25 text-indigo-100"       :
                  sel              ? "border border-cyan-400/40 bg-cyan-500/15 text-cyan-100"             :
                                     "border border-white/8 bg-slate-900/40 text-slate-300 hover:border-white/18 hover:bg-slate-800/50",
                ].join(" ")}
              >
                {d}
                {d && hasN && (
                  <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${todayC ? "bg-white/60" : "bg-indigo-400"}`} />
                )}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Selected day notes */}
      {selectedDay && (
        <SectionCard title={selectedDateStr ?? ""}>
          <div className="space-y-1 max-h-[130px] overflow-y-auto mb-3">
            {selectedNotes.length === 0 ? (
              <p className="text-[10px] text-slate-600 py-2">No notes for this day</p>
            ) : selectedNotes.map((n) => (
              <div key={String(n._id)} className="flex items-center gap-2 px-2.5 py-1.5 text-xs panel-soft">
                <span className="flex-1 text-slate-200">{n.note}</span>
                <button onClick={() => void deleteNote({ id: n._id })} className="text-slate-600 hover:text-rose-400 transition-colors text-sm leading-none">×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveNote(); }}
              placeholder="Add note…"
              className="input-glass text-xs flex-1"
            />
            <button
              onClick={() => void saveNote()}
              disabled={saving || !newNote.trim()}
              className="btn-primary text-xs py-2 px-3"
            >
              {saving ? "…" : "Add"}
            </button>
          </div>
        </SectionCard>
      )}

      {/* Scheduled Jobs */}
      <SectionCard title="Scheduled Jobs">
        <div className="space-y-1 max-h-[220px] overflow-y-auto">
          {loadingJobs ? (
            <p className="text-xs text-slate-600 text-center py-3">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-3">No cron jobs</p>
          ) : (
            jobs.slice(0, 10).map((job, i) => (
              <div key={job.id ?? i} className="flex items-center gap-2.5 px-2.5 py-2 text-xs panel-soft">
                <span className="text-slate-200 font-medium truncate flex-1">{job.name}</span>
                <span className="text-[9px] text-indigo-400 font-mono shrink-0">{job.scheduleDesc}</span>
                <StatusBadge status={job.enabled ? "active" : "disabled"} size="xs" />
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}
