import { NextResponse } from "next/server";
import fs from "fs";

type ScheduleKind = "every" | "cron" | "at";

interface CronJobRaw {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: {
    kind: ScheduleKind;
    everyMs?: number;
    expr?: string;
    at?: string;
  };
  payload?: {
    kind: "systemEvent" | "agentTurn";
    text?: string;
    message?: string;
  };
}

function humanizeEveryMs(ms: number): string {
  const seconds = ms / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  if (days >= 1 && days % 1 === 0) return `Every ${days} day${days !== 1 ? "s" : ""}`;
  if (hours >= 1 && hours % 1 === 0) return `Every ${hours} hour${hours !== 1 ? "s" : ""}`;
  if (minutes >= 1 && minutes % 1 === 0) return `Every ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  return `Every ${seconds}s`;
}

function describeSchedule(schedule?: CronJobRaw["schedule"]): string {
  if (!schedule) return "Unknown";
  if (schedule.kind === "every" && schedule.everyMs != null) {
    return humanizeEveryMs(schedule.everyMs);
  }
  if (schedule.kind === "cron" && schedule.expr) {
    return schedule.expr;
  }
  if (schedule.kind === "at" && schedule.at) {
    return schedule.at;
  }
  return schedule.kind;
}

export async function GET() {
  try {
    const raw = fs.readFileSync("/home/ubuntu/.openclaw/cron/jobs.json", "utf-8");
    const parsed = JSON.parse(raw) as CronJobRaw[] | { jobs?: CronJobRaw[] };
    const rawJobs: CronJobRaw[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.jobs)
        ? parsed.jobs
        : [];

    const jobs = rawJobs.map((job, i) => ({
      id: job.id ?? `job-${i}`,
      name: job.name ?? job.id ?? `Job ${i + 1}`,
      scheduleKind: job.schedule?.kind ?? "unknown",
      scheduleDesc: describeSchedule(job.schedule),
      payloadKind: job.payload?.kind ?? "unknown",
      payloadText: job.payload?.text ?? job.payload?.message ?? "",
      enabled: job.enabled !== false,
    }));
    return NextResponse.json({ jobs });
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}
