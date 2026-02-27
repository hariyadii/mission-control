"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

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
    active: { label: "ACTIVE", color: "text-emerald-300", bg: "bg-emerald-500/20" },
    disabled: { label: "OFF", color: "text-slate-400", bg: "bg-slate-500/20" },
  };
  const c = config[status?.toLowerCase()] || { label: status?.slice(0, 6).toUpperCase() || "—", color: "text-slate-300", bg: "bg-slate-500/20" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color} ${c.bg}`}>{c.label}</span>;
}

type CronJob = {
  id: string;
  name: string;
  scheduleKind: string;
  scheduleDesc: string;
  payloadKind: string;
  payloadText: string;
  enabled: boolean;
};

type CalendarNote = {
  _id: Id<"calendarNotes">;
  date: string;
  note: string;
  created_at: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateString(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const notes = useQuery(api.calendar.listNotes) as CalendarNote[] | undefined;
  const addNote = useMutation(api.calendar.addNote);
  const deleteNote = useMutation(api.calendar.deleteNote);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((data) => { setJobs(data.jobs ?? []); setLastUpdate(Date.now()); })
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isToday = (d: number | null) => d !== null && d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const notesForDay = (d: number | null) => {
    if (!d || !notes) return [];
    const key = toDateString(year, month, d);
    return notes.filter((n) => n.date === key);
  };
  const hasNotes = (d: number | null) => notesForDay(d).length > 0;

  const selectedDateStr = selectedDay ? toDateString(year, month, selectedDay) : null;
  const selectedNotes = selectedDay ? notesForDay(selectedDay) : [];

  const handleSaveNote = async () => {
    if (!newNote.trim() || !selectedDateStr) return;
    setSaving(true);
    try {
      await addNote({ date: selectedDateStr, note: newNote.trim() });
      setNewNote("");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (id: Id<"calendarNotes">) => {
    await deleteNote({ id });
  };

  return (
    <div className="space-y-3">
      {/* HEADER - Consistent with homepage */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Calendar</h1>
          <p className="text-xs text-slate-400">Schedule & notes</p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessIndicator lastUpdate={lastUpdate} />
        </div>
      </header>

      {/* Calendar Grid */}
      <section className="panel-glass p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="px-2 py-1 text-slate-400 hover:text-slate-200">‹</button>
          <p className="text-sm font-semibold text-slate-200">{MONTHS[month]} {year}</p>
          <button onClick={nextMonth} className="px-2 py-1 text-slate-400 hover:text-slate-200">›</button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1">
          {DAYS.map((d) => (
            <div key={d} className="py-1 text-center text-[9px] font-semibold uppercase text-slate-500">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const selected = selectedDay === d;
            const todayCell = isToday(d);
            return (
              <button
                key={i}
                type="button"
                onClick={() => { if (d) setSelectedDay(selected ? null : d); }}
                className={`relative min-h-8 rounded text-xs transition ${
                  d === null ? "cursor-default" :
                  todayCell ? "border border-indigo-400/50 bg-indigo-500/30 text-white" :
                  selected ? "border border-cyan-400/50 bg-cyan-500/20 text-cyan-100" :
                  "border border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/20"
                }`}
              >
                {d}
                {d && hasNotes(d) && (
                  <span className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${todayCell ? "bg-white" : "bg-indigo-400"}`} />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Day Notes */}
      {selectedDay && (
        <section className="panel-glass p-3">
          <p className="text-xs font-semibold text-slate-300 mb-2">{selectedDateStr}</p>
          <div className="space-y-1 max-h-[120px] overflow-y-auto mb-2">
            {selectedNotes.map((n) => (
              <div key={String(n._id)} className="flex items-center gap-2 px-2 py-1 text-xs panel-soft">
                <span className="flex-1 text-slate-300">{n.note}</span>
                <button onClick={() => void handleDeleteNote(n._id)} className="text-rose-400 hover:text-rose-300">×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSaveNote(); }}
              placeholder="Add note..."
              className="flex-1 bg-slate-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            <button onClick={() => void handleSaveNote()} disabled={saving || !newNote.trim()} className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-cyan-500 to-violet-500 text-white rounded-lg disabled:opacity-50">
              {saving ? "..." : "Add"}
            </button>
          </div>
        </section>
      )}

      {/* Scheduled Jobs */}
      <section className="panel-glass p-3">
        <h2 className="text-xs font-semibold text-slate-300 mb-2">Scheduled Jobs</h2>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {loadingJobs ? (
            <p className="text-xs text-slate-500 text-center py-2">Loading...</p>
          ) : jobs.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">No cron jobs</p>
          ) : (
            jobs.slice(0, 8).map((job, i) => (
              <div key={job.id ?? i} className="flex items-center gap-2 px-2 py-1.5 text-xs panel-soft">
                <span className="text-slate-300 font-medium truncate flex-1">{job.name}</span>
                <span className="text-[9px] text-indigo-400 font-mono">{job.scheduleDesc}</span>
                <StatusBadge status={job.enabled ? "active" : "disabled"} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
