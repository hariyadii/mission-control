"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

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
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

  const notes = useQuery(api.calendar.listNotes) as CalendarNote[] | undefined;
  const addNote = useMutation(api.calendar.addNote);
  const deleteNote = useMutation(api.calendar.deleteNote);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
    setSelectedDay(null);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

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
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">Track scheduled jobs and attach notes to specific days.</p>
        </div>
      </header>

      <section className="panel-glass max-w-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={prevMonth} className="btn-secondary px-3 py-1.5 text-base">
            ‹
          </button>
          <p className="m-0 text-lg font-semibold text-slate-100">
            {MONTHS[month]} {year}
          </p>
          <button onClick={nextMonth} className="btn-secondary px-3 py-1.5 text-base">
            ›
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            const selected = selectedDay === d;
            const todayCell = isToday(d);
            return (
              <button
                key={`${i}-${d}`}
                type="button"
                onClick={() => {
                  if (d) setSelectedDay(selected ? null : d);
                }}
                className={`relative min-h-11 rounded-lg border text-sm transition ${
                  d === null
                    ? "cursor-default border-transparent bg-transparent text-transparent"
                    : todayCell
                      ? "border-indigo-200/40 bg-indigo-500/40 text-white"
                      : selected
                        ? "border-cyan-200/45 bg-cyan-500/25 text-cyan-100"
                        : "border-white/10 bg-slate-900/55 text-slate-100 hover:border-white/20 hover:bg-slate-800/65"
                }`}
              >
                {d ?? ""}
                {d && hasNotes(d) && (
                  <span
                    className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${todayCell ? "bg-white" : "bg-indigo-300"}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {selectedDay && (
        <section className="panel-glass max-w-3xl p-5">
          <p className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-300">{selectedDateStr}</p>

          {selectedNotes.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedNotes.map((n) => (
                <div key={n._id} className="panel-soft flex items-start gap-3 p-3">
                  <p className="m-0 flex-1 text-sm text-slate-200">{n.note}</p>
                  <button onClick={() => void handleDeleteNote(n._id)} className="btn-danger px-2.5 py-1">
                    X
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveNote();
              }}
              placeholder="Add note for this day..."
              className="input-glass"
            />
            <button onClick={() => void handleSaveNote()} disabled={saving || !newNote.trim()} className="btn-primary whitespace-nowrap">
              {saving ? "Saving..." : "Save Note"}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="m-0 text-lg font-semibold text-slate-100">Scheduled Jobs</h2>
        {loadingJobs ? (
          <div className="panel-soft p-4 text-sm text-slate-400">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="panel-soft p-6 text-center text-sm text-slate-400">No cron jobs configured.</div>
        ) : (
          <div className="space-y-2.5">
            {jobs.map((job, i) => (
              <article key={job.id ?? i} className="panel-glass p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 text-lg text-slate-300">◴</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="m-0 truncate text-sm font-semibold text-slate-100">{job.name}</p>
                      <span className={`ml-auto shrink-0 badge ${job.enabled ? "badge-sam" : "badge-legacy"}`}>
                        {job.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <p className="m-0 mt-1 font-mono text-xs text-indigo-200">{job.scheduleDesc}</p>
                    <p className="m-0 mt-0.5 text-xs text-slate-400">{job.payloadKind}</p>
                    {job.payloadText && (
                      <p className="m-0 mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
                        {job.payloadText}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
