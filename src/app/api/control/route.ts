import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = "/home/ubuntu/.openclaw/workspace";
const POLICY_FILE = `${WORKSPACE_ROOT}/autonomy/policy.json`;
const EXTERNAL_LOG_FILE = `${WORKSPACE_ROOT}/autonomy/metrics/external-actions.jsonl`;

type Policy = {
  killSwitch: boolean;
  allowHighRiskExternalActions: boolean;
  external: {
    maxActionsPerDay: number;
    xMode: "browse" | "post";
  };
  capitalLane: {
    mode: "paper" | "live";
  };
};

const defaultPolicy: Policy = {
  killSwitch: false,
  allowHighRiskExternalActions: true,
  external: {
    maxActionsPerDay: 100,
    xMode: "browse",
  },
  capitalLane: {
    mode: "paper",
  },
};

async function loadPolicy(): Promise<Policy> {
  try {
    const raw = await readFile(POLICY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Policy>;
    return {
      killSwitch: parsed.killSwitch ?? defaultPolicy.killSwitch,
      allowHighRiskExternalActions:
        parsed.allowHighRiskExternalActions ?? defaultPolicy.allowHighRiskExternalActions,
      external: {
        maxActionsPerDay: parsed.external?.maxActionsPerDay ?? defaultPolicy.external.maxActionsPerDay,
        xMode: parsed.external?.xMode ?? defaultPolicy.external.xMode,
      },
      capitalLane: {
        mode: parsed.capitalLane?.mode ?? defaultPolicy.capitalLane.mode,
      },
    };
  } catch {
    return defaultPolicy;
  }
}

async function savePolicy(policy: Policy): Promise<void> {
  await mkdir(dirname(POLICY_FILE), { recursive: true });
  await writeFile(POLICY_FILE, JSON.stringify(policy, null, 2), "utf8");
}

async function countExternalActionsToday(): Promise<number> {
  try {
    const raw = await readFile(EXTERNAL_LOG_FILE, "utf8");
    const today = new Date().toISOString().slice(0, 10);
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as { timestamp?: string };
        } catch {
          return {};
        }
      })
      .filter((entry) => entry.timestamp?.startsWith(today)).length;
  } catch {
    return 0;
  }
}

async function runCronListAll() {
  const { stdout } = await execFileAsync("openclaw", ["cron", "list", "--all", "--json"], {
    timeout: 20000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout) as unknown;
}

async function runCronMutation(command: "run" | "enable" | "disable", jobId: string) {
  const { stdout } = await execFileAsync("openclaw", ["cron", command, jobId], {
    timeout: 20000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

export async function GET() {
  try {
    const [policy, cron, externalToday] = await Promise.all([
      loadPolicy(),
      runCronListAll(),
      countExternalActionsToday(),
    ]);

    return NextResponse.json({
      ok: true,
      policy,
      externalActionsToday: externalToday,
      cron,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "setPolicy") {
      const current = await loadPolicy();
      const patch = (body.patch ?? {}) as Partial<Policy>;
      const next: Policy = {
        killSwitch: patch.killSwitch ?? current.killSwitch,
        allowHighRiskExternalActions:
          patch.allowHighRiskExternalActions ?? current.allowHighRiskExternalActions,
        external: {
          maxActionsPerDay: patch.external?.maxActionsPerDay ?? current.external.maxActionsPerDay,
          xMode: patch.external?.xMode ?? current.external.xMode,
        },
        capitalLane: {
          mode: patch.capitalLane?.mode ?? current.capitalLane.mode,
        },
      };
      await savePolicy(next);
      return NextResponse.json({ ok: true, policy: next });
    }

    if (action === "runJob") {
      const jobId = String(body.jobId ?? "");
      if (!jobId) return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
      const result = await runCronMutation("run", jobId);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "enableJob") {
      const jobId = String(body.jobId ?? "");
      if (!jobId) return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
      const result = await runCronMutation("enable", jobId);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "disableJob") {
      const jobId = String(body.jobId ?? "");
      if (!jobId) return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
      const result = await runCronMutation("disable", jobId);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "killSwitch") {
      const enabled = Boolean(body.enabled);
      const policy = await loadPolicy();
      const cron = (await runCronListAll()) as { jobs?: Array<{ id: string; name?: string }> };
      const jobs = cron.jobs ?? [];
      const targetNames = new Set(["sam-mission-suggester-3h", "alex-guardrail-20m", "sam-worker-15m", "lyra-capital-suggester-3h", "lyra-capital-worker-30m"]);
      const filtered = jobs.filter((j) => targetNames.has(j.name ?? ""));

      for (const job of filtered) {
        await runCronMutation(enabled ? "disable" : "enable", job.id);
      }

      const nextPolicy = { ...policy, killSwitch: enabled };
      await savePolicy(nextPolicy);
      return NextResponse.json({ ok: true, policy: nextPolicy, touchedJobs: filtered.map((j) => j.id) });
    }

    return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
