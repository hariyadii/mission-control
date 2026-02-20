import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { exec as execCallback } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type Assignee = "me" | "alex" | "sam" | "lyra" | "agent";
type Status = "suggested" | "backlog" | "in_progress" | "done";
type Action = "guardrail" | "worker" | "claim" | "heartbeat" | "complete" | "status";
type TaskDoc = Doc<"tasks">;

type PluginContext = {
  task: TaskDoc;
  allTasks: TaskDoc[];
  worker: Assignee;
  timestamp: string;
};

type PluginResult = {
  pluginId: string;
  notes: string[];
  files: string[];
};

type ExecutorPlugin = {
  id: string;
  match: (task: TaskDoc) => boolean;
  run: (ctx: PluginContext) => Promise<PluginResult>;
};

const WORKSPACE_ROOT = "/home/ubuntu/.openclaw/workspace";
const EXECUTIONS_DIR = `${WORKSPACE_ROOT}/autonomy/executions`;
const PLUGIN_OUTPUT_DIR = `${WORKSPACE_ROOT}/autonomy/plugins`;
const EXECUTOR_RUN_LOG_FILE = `${WORKSPACE_ROOT}/autonomy/metrics/executor-runs.jsonl`;
const POLICY_FILE = `${WORKSPACE_ROOT}/autonomy/policy.json`;
const EXTERNAL_ACTION_LOG_FILE = `${WORKSPACE_ROOT}/autonomy/metrics/external-actions.jsonl`;
const CRON_JOBS_FILE = "/home/ubuntu/.openclaw/cron/jobs.json";
const MAX_GUARDRAIL_PER_RUN = 5;
const WIP_CAP_BY_ASSIGNEE: Record<Assignee, number> = {
  me: 1,
  alex: 1,
  sam: 2,
  lyra: 2,
  agent: 1,
};
const LEASE_MINUTES_BY_ASSIGNEE: Record<Assignee, number> = {
  me: 45,
  alex: 45,
  sam: 45,
  lyra: 75,
  agent: 45,
};
const RETRY_BACKOFF_MINUTES = [15, 60, 240];
const exec = promisify(execCallback);

type ExternalRisk = "low" | "medium" | "high";
type AutonomyPolicy = {
  killSwitch: boolean;
  allowHighRiskExternalActions: boolean;
  external: {
    maxActionsPerDay: number;
    xMode: string;
  };
  capitalLane: {
    mode: string;
  };
};

const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
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

const RISKY_KEYWORDS = [
  "delete",
  "drop database",
  "truncate",
  "rm -rf",
  "exfiltrate",
  "secrets",
  "password",
  "token",
  "credential",
  "ssh",
  "production",
  "deploy",
  "billing",
  "payment",
  "wire",
  "lawsuit",
  "legal",
  "root",
  "sudo",
];

const VAGUE_KEYWORDS = [
  "misc",
  "stuff",
  "things",
  "tbd",
  "whatever",
  "help",
  "improve",
  "fix it",
  "work on",
  "do task",
];

function getClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(url);
}

function normalizeTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeAssignee(value: unknown, fallback: Assignee = "agent"): Assignee {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "me" || normalized === "alex" || normalized === "sam" || normalized === "lyra" || normalized === "agent") {
    return normalized;
  }
  return fallback;
}

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "task";
}

async function writeTextFile(path: string, content: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

async function loadPolicy(): Promise<AutonomyPolicy> {
  try {
    const raw = await readFile(POLICY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AutonomyPolicy>;
    return {
      killSwitch: typeof parsed.killSwitch === "boolean" ? parsed.killSwitch : DEFAULT_AUTONOMY_POLICY.killSwitch,
      allowHighRiskExternalActions:
        typeof parsed.allowHighRiskExternalActions === "boolean"
          ? parsed.allowHighRiskExternalActions
          : DEFAULT_AUTONOMY_POLICY.allowHighRiskExternalActions,
      external: {
        maxActionsPerDay:
          typeof parsed.external?.maxActionsPerDay === "number" && parsed.external.maxActionsPerDay > 0
            ? Math.floor(parsed.external.maxActionsPerDay)
            : DEFAULT_AUTONOMY_POLICY.external.maxActionsPerDay,
        xMode: typeof parsed.external?.xMode === "string" ? parsed.external.xMode : DEFAULT_AUTONOMY_POLICY.external.xMode,
      },
      capitalLane: {
        mode:
          typeof parsed.capitalLane?.mode === "string"
            ? parsed.capitalLane.mode
            : DEFAULT_AUTONOMY_POLICY.capitalLane.mode,
      },
    };
  } catch {
    await mkdir(dirname(POLICY_FILE), { recursive: true });
    await writeFile(POLICY_FILE, `${JSON.stringify(DEFAULT_AUTONOMY_POLICY, null, 2)}\n`, "utf8");
    return DEFAULT_AUTONOMY_POLICY;
  }
}

async function countExternalActionsToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = await readFile(EXTERNAL_ACTION_LOG_FILE, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce((count, line) => {
        try {
          const parsed = JSON.parse(line) as { timestamp?: string };
          return typeof parsed.timestamp === "string" && parsed.timestamp.startsWith(today) ? count + 1 : count;
        } catch {
          return count;
        }
      }, 0);
  } catch {
    return 0;
  }
}

async function appendExternalActionLog(entry: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(EXTERNAL_ACTION_LOG_FILE), { recursive: true });
  await appendFile(EXTERNAL_ACTION_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

async function enforceExternalActionPolicy(risk: ExternalRisk): Promise<AutonomyPolicy> {
  const policy = await loadPolicy();
  if (policy.killSwitch) {
    throw new Error("autonomy kill switch is enabled");
  }
  if (risk === "high" && !policy.allowHighRiskExternalActions) {
    throw new Error("high risk external actions are disabled by policy");
  }
  const actionsToday = await countExternalActionsToday();
  if (actionsToday >= policy.external.maxActionsPerDay) {
    throw new Error(`external action limit reached (${policy.external.maxActionsPerDay}/day)`);
  }
  return policy;
}

async function runCommand(cmd: string): Promise<string> {
  const { stdout, stderr } = await exec(cmd, { cwd: WORKSPACE_ROOT, maxBuffer: 5 * 1024 * 1024, shell: "/bin/bash" });
  const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
  return output;
}

const TRADE_SIGNAL_PATTERNS = [
  /^capital\s*:\s*\w+usdt\s+(long|short)/i,
  /^(buy|sell|long|short)\s+(btc|eth|sol|bnb|xrp|doge|ada|btcusdt|ethusdt)/i,
  /^open\s+(a\s+)?(long|short)\s+position/i,
];

function isRiskyOrVague(task: TaskDoc): string | null {
  const combined = `${task.title} ${task.description ?? ""}`.trim().toLowerCase();
  if (task.title.trim().length < 6) return "title_too_short";
  if (combined.split(/\s+/).filter(Boolean).length < 3) return "task_too_vague";

  // Reject pure trade signal tasks (these should be automated by the capital plugin, not queued as missions)
  for (const pattern of TRADE_SIGNAL_PATTERNS) {
    if (pattern.test(task.title.trim())) return "trade_signal_not_mission";
  }

  // Reject tasks with no meaningful description (less than 10 words)
  const descWords = (task.description ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (descWords < 8) return "description_too_short";

  for (const keyword of RISKY_KEYWORDS) {
    if (combined.includes(keyword)) return `risky_keyword:${keyword}`;
  }

  for (const keyword of VAGUE_KEYWORDS) {
    if (combined.includes(keyword)) return `vague_keyword:${keyword}`;
  }

  return null;
}

function sortOldestFirst(tasks: TaskDoc[]): TaskDoc[] {
  return [...tasks].sort((a, b) => {
    const tA = Date.parse(a.created_at);
    const tB = Date.parse(b.created_at);
    if (Number.isNaN(tA) && Number.isNaN(tB)) return String(a._id).localeCompare(String(b._id));
    if (Number.isNaN(tA)) return 1;
    if (Number.isNaN(tB)) return -1;
    if (tA !== tB) return tA - tB;
    return String(a._id).localeCompare(String(b._id));
  });
}

async function loadAllTasks(client: ConvexHttpClient): Promise<TaskDoc[]> {
  return await client.query(api.tasks.list, {});
}

async function runGuardrail(client: ConvexHttpClient, requestedMax: unknown) {
  const maxToProcess = asPositiveInt(requestedMax, MAX_GUARDRAIL_PER_RUN, MAX_GUARDRAIL_PER_RUN);
  const allTasks = await loadAllTasks(client);

  const duplicateBlocklist = new Set(
    allTasks
      .filter((task) => task.status === "backlog" || task.status === "in_progress" || task.status === "done")
      .map((task) => normalizeTitle(task.title))
      .filter(Boolean)
  );

  const activeLoadByAssignee: Record<Assignee, number> = { me: 0, alex: 0, sam: 0, lyra: 0, agent: 0 };
  for (const task of allTasks) {
    if (task.status === "backlog" || task.status === "in_progress") {
      activeLoadByAssignee[task.assigned_to] += 1;
    }
  }

  const suggested = sortOldestFirst(allTasks.filter((task) => task.status === "suggested")).slice(0, maxToProcess);

  const accepted: Array<{ id: Id<"tasks">; title: string }> = [];
  const rejected: Array<{ id: Id<"tasks">; title: string; reason: string }> = [];
  const deferred: Array<{ id: Id<"tasks">; title: string; reason: string }> = [];

  for (const task of suggested) {
    const normalized = normalizeTitle(task.title);
    const duplicate = normalized.length > 0 && duplicateBlocklist.has(normalized);
    const riskyOrVagueReason = isRiskyOrVague(task);

    if (duplicate) {
      await client.mutation(api.tasks.remove, { id: task._id });
      rejected.push({ id: task._id, title: task.title, reason: "duplicate_title" });
      continue;
    }

    if (riskyOrVagueReason) {
      await client.mutation(api.tasks.remove, { id: task._id });
      rejected.push({ id: task._id, title: task.title, reason: riskyOrVagueReason });
      continue;
    }

    const cap = WIP_CAP_BY_ASSIGNEE[task.assigned_to] ?? 1;
    const active = activeLoadByAssignee[task.assigned_to] ?? 0;
    if (active >= cap) {
      deferred.push({ id: task._id, title: task.title, reason: "capacity_full" });
      continue;
    }

    await client.mutation(api.tasks.updateStatus, { id: task._id, status: "backlog" });
    duplicateBlocklist.add(normalized);
    activeLoadByAssignee[task.assigned_to] = active + 1;
    accepted.push({ id: task._id, title: task.title });
  }

  return {
    ok: true,
    action: "guardrail" as const,
    processed: suggested.length,
    accepted,
    rejected,
    deferred,
    acceptancePolicy: "0..5 (>=1 only if quality+capacity allows)",
    reasons: rejected.map(({ id, reason }) => ({ id, reason })),
  };
}

async function pluginWeeklyProgressReport(ctx: PluginContext): Promise<PluginResult> {
  const doneTasks = sortOldestFirst(ctx.allTasks.filter((t) => t.status === "done")).slice(-15);
  const date = ctx.timestamp.slice(0, 10);
  const reportPath = `${PLUGIN_OUTPUT_DIR}/weekly-progress-${date}.md`;
  const body = [
    `# Weekly Progress Report (${date})`,
    "",
    `Generated by worker: ${ctx.worker}`,
    "",
    "## Recently Completed Tasks",
    ...(doneTasks.length
      ? doneTasks.map((t) => `- ${t.title} (${t.assigned_to})`)
      : ["- No completed tasks yet."]),
    "",
    "## Summary",
    `- Completed count sampled: ${doneTasks.length}`,
    "- Next step: keep mission suggester + guardrail + worker loops active.",
    "",
  ].join("\n");

  const written = await writeTextFile(reportPath, body);
  return {
    pluginId: "weekly_progress_report",
    notes: ["Generated weekly progress report from completed tasks."],
    files: [written],
  };
}

async function pluginMemoryTagger(ctx: PluginContext): Promise<PluginResult> {
  const memoryDir = `${WORKSPACE_ROOT}/memory`;
  let files: string[] = [];
  try {
    files = (await readdir(memoryDir)).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }

  const tagsByFile: Record<string, string[]> = {};
  for (const file of files) {
    const fullPath = `${memoryDir}/${file}`;
    const raw = (await readFile(fullPath, "utf8")).toLowerCase();
    const tags: string[] = [];
    if (/(task|project|build|deploy|ops|workflow)/.test(raw)) tags.push("work");
    if (/(decision|decide|chose|lesson|learned)/.test(raw)) tags.push("decision");
    if (/(todo|next|follow up|pending)/.test(raw)) tags.push("todo");
    if (/(personal|family|health|travel)/.test(raw)) tags.push("personal");
    tagsByFile[file] = tags.length ? tags : ["uncategorized"];
  }

  const date = ctx.timestamp.slice(0, 10);
  const outPath = `${PLUGIN_OUTPUT_DIR}/memory-tags-${date}.json`;
  const payload = JSON.stringify({ generatedAt: ctx.timestamp, tagsByFile }, null, 2);
  const written = await writeTextFile(outPath, payload);

  return {
    pluginId: "memory_tagger",
    notes: [`Tagged ${files.length} memory file(s) into coarse categories.`],
    files: [written],
  };
}

async function pluginCronHealthDashboard(_ctx: PluginContext): Promise<PluginResult> {
  let jobs: Array<{ name?: string; enabled?: boolean; state?: { nextRunAtMs?: number; lastStatus?: string } }> = [];
  try {
    const raw = await readFile(CRON_JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw) as { jobs?: typeof jobs };
    jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    jobs = [];
  }

  const lines = [
    "# Cron Health Dashboard",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| Job | Enabled | Last Status | Next Run |",
    "|---|---|---|---|",
  ];

  for (const job of jobs) {
    const next = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : "-";
    lines.push(`| ${job.name ?? "unnamed"} | ${job.enabled ? "yes" : "no"} | ${job.state?.lastStatus ?? "-"} | ${next} |`);
  }

  if (!jobs.length) lines.push("| (none) | - | - | - |");

  const outPath = `${PLUGIN_OUTPUT_DIR}/cron-health-dashboard.md`;
  const written = await writeTextFile(outPath, `${lines.join("\n")}\n`);

  return {
    pluginId: "cron_health_dashboard",
    notes: ["Generated cron health dashboard from local scheduler state."],
    files: [written],
  };
}

async function pluginTicketTriagePlaybook(ctx: PluginContext): Promise<PluginResult> {
  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/ticket-triage-playbook-${slug}.md`;
  const content = [
    "# Ticket Triage Playbook",
    "",
    "## Priority Rules",
    "- P0: security/data-loss/payment outage",
    "- P1: core workflow broken",
    "- P2: degraded UX/workaround exists",
    "- P3: enhancement request",
    "",
    "## Routing",
    "- Billing -> finance queue",
    "- Access/login -> auth queue",
    "- API errors -> backend queue",
    "- UI defects -> frontend queue",
    "",
    "## SLA Targets",
    "- P0: 15 min acknowledge",
    "- P1: 1h acknowledge",
    "- P2/P3: same business day",
    "",
  ].join("\n");
  const written = await writeTextFile(outPath, content);

  return {
    pluginId: "ticket_triage_playbook",
    notes: ["Generated deterministic triage playbook and routing rules."],
    files: [written],
  };
}

async function pluginCapitalPaperTrade(ctx: PluginContext): Promise<PluginResult> {
  const text = `${ctx.task.title}\n${ctx.task.description ?? ""}`;
  const upperText = text.toUpperCase();
  const symbolMatch = upperText.match(
    /\b(BTCUSDT|ETHUSDT|SOLUSDT|BNBUSDT|XRPUSDT|DOGEUSDT|ADAUSDT|AAPL|TSLA|NVDA|MSFT|AMZN|SPY|QQQ)\b/
  );
  if (!symbolMatch) {
    throw new Error("capital_paper_trade could not find an allowlisted symbol in task title/description");
  }

  const symbol = symbolMatch[1];
  const side: "long" | "short" = upperText.includes("SHORT") ? "short" : "long";
  const market: "crypto" | "stock" = symbol.endsWith("USDT") ? "crypto" : "stock";

  // Strip any "Worker failure (...): ..." lines that appendFailureNote may have
  // appended to the description on previous failed attempts — we never want
  // error diagnostics leaking into the stored trade thesis.
  const rawDescription = ctx.task.description?.trim() ?? "";
  const cleanedDescription = rawDescription
    .split("\n")
    .filter((line) => !/^Worker failure \(.*\):/.test(line.trim()))
    .join("\n")
    .trim();
  const thesis = cleanedDescription || ctx.task.title.trim();

  const statusResponse = await fetch("http://localhost:3001/api/capital", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  });
  const statusText = await statusResponse.text();
  if (!statusResponse.ok) {
    throw new Error(`capital status request failed (${statusResponse.status}): ${statusText.slice(0, 300)}`);
  }

  let statusPayload: Record<string, unknown> = {};
  try {
    statusPayload = JSON.parse(statusText) as Record<string, unknown>;
  } catch {
    throw new Error("capital status response was not valid JSON");
  }

  const statusData =
    statusPayload && typeof statusPayload.data === "object" && statusPayload.data
      ? (statusPayload.data as Record<string, unknown>)
      : statusPayload;
  const halted =
    statusData.halted === true ||
    statusData.isHalted === true ||
    statusData.tradingHalted === true ||
    statusData.status === "halted" ||
    (statusData.portfolio && typeof statusData.portfolio === "object" && (statusData.portfolio as Record<string, unknown>).status === "halted");
  if (halted) {
    throw new Error("capital paper trading is halted");
  }

  const portfolioObj =
    statusData.portfolio && typeof statusData.portfolio === "object"
      ? (statusData.portfolio as Record<string, unknown>)
      : null;
  const totalEquityCandidate =
    portfolioObj?.totalEquity ??
    statusData.totalEquity ??
    statusData.total_equity ??
    statusData.equity ??
    statusData.accountEquity ??
    statusData.balance;
  const totalEquity = Number(totalEquityCandidate);
  if (!Number.isFinite(totalEquity) || totalEquity <= 0) {
    throw new Error("capital status missing a valid totalEquity");
  }

  const parseLastNumber = (raw: string): number => {
    const matches = raw.match(/-?\d+(?:\.\d+)?/g);
    if (!matches || !matches.length) throw new Error(`unable to parse numeric value from command output: ${raw.slice(0, 200)}`);
    const value = Number(matches[matches.length - 1]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`parsed invalid numeric value: ${String(value)}`);
    return value;
  };

  let entryPrice: number;
  if (market === "crypto") {
    const binanceOutput = await runCommand(`curl -s "https://api.binance.com/api/v3/ticker/price?symbol=${symbol}"`);
    let parsed: { price?: string } = {};
    try {
      parsed = JSON.parse(binanceOutput) as { price?: string };
    } catch {
      throw new Error(`failed parsing Binance ticker response for ${symbol}`);
    }
    entryPrice = Number(parsed.price);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new Error(`invalid Binance entry price for ${symbol}`);
    }
  } else {
    const stockOutput = await runCommand(`python3 - <<'PY'
import yfinance as yf
symbol = "${symbol}"
ticker = yf.Ticker(symbol)
hist = ticker.history(period="1d", interval="1m")
if hist.empty:
    hist = ticker.history(period="5d", interval="1d")
if hist.empty:
    raise SystemExit(2)
print(float(hist["Close"].dropna().iloc[-1]))
PY`);
    entryPrice = parseLastNumber(stockOutput);
  }

  const notional = totalEquity * 0.04;
  const size = notional / entryPrice;
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("calculated position size is invalid");
  }

  const riskPct = market === "crypto" ? 0.02 : 0.015;
  const stopLoss = side === "long" ? entryPrice * (1 - riskPct) : entryPrice * (1 + riskPct);
  const takeProfit = side === "long" ? entryPrice * (1 + 2 * riskPct) : entryPrice * (1 - 2 * riskPct);

  const tradePayload = {
    action: "trade",
    symbol,
    side,
    entryPrice,
    size,
    stopLoss,
    takeProfit,
    thesis,
  };
  const tradeResponse = await fetch("http://localhost:3001/api/capital", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tradePayload),
  });
  const tradeText = await tradeResponse.text();
  if (!tradeResponse.ok) {
    throw new Error(`capital trade request failed (${tradeResponse.status}): ${tradeText.slice(0, 300)}`);
  }
  let tradeResult: Record<string, unknown> = {};
  try {
    tradeResult = JSON.parse(tradeText) as Record<string, unknown>;
  } catch {
    throw new Error("capital trade response was not valid JSON");
  }
  if (tradeResult.ok !== true) {
    throw new Error(`capital trade response returned ok=false: ${tradeText.slice(0, 300)}`);
  }

  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/capital-trade-${slug}.md`;
  const content = [
    "# Capital Paper Trade",
    "",
    `Generated at: ${ctx.timestamp}`,
    `Worker: ${ctx.worker}`,
    `Task: ${ctx.task.title}`,
    "",
    "## Trade Parameters",
    `- Symbol: ${symbol}`,
    `- Market: ${market}`,
    `- Side: ${side}`,
    `- Entry Price: ${entryPrice}`,
    `- Total Equity: ${totalEquity}`,
    `- Notional (4%): ${notional}`,
    `- Size: ${size}`,
    `- Risk %: ${riskPct * 100}%`,
    `- Stop Loss: ${stopLoss}`,
    `- Take Profit: ${takeProfit}`,
    "",
    "## Thesis",
    thesis,
    "",
    "## Capital API Result",
    "```json",
    JSON.stringify(tradeResult, null, 2),
    "```",
    "",
  ].join("\n");
  const written = await writeTextFile(outPath, content);

  return {
    pluginId: "capital_paper_trade",
    notes: ["Submitted paper trade to local Capital API with 1R stop and 2R take-profit."],
    files: [written],
  };
}

async function pluginXScout(ctx: PluginContext): Promise<PluginResult> {
  const policy = await enforceExternalActionPolicy("medium");
  if (policy.external.xMode !== "browse") {
    throw new Error(`x_scout requires external.xMode=browse, got ${policy.external.xMode}`);
  }

  const timelineCommand = "x timeline | head -n 120";
  const searchCommand = 'x search "ai automation agents" Latest | head -n 120';
  const [timelineOutput, searchOutput] = await Promise.all([runCommand(timelineCommand), runCommand(searchCommand)]);

  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/x-scout-${slug}.md`;
  const content = [
    "# X Scout Report",
    "",
    `Generated at: ${ctx.timestamp}`,
    `Worker: ${ctx.worker}`,
    `Task: ${ctx.task.title}`,
    "",
    "## Command 1",
    `\`${timelineCommand}\``,
    "",
    "```text",
    timelineOutput || "(no output)",
    "```",
    "",
    "## Command 2",
    `\`${searchCommand}\``,
    "",
    "```text",
    searchOutput || "(no output)",
    "```",
    "",
  ].join("\n");

  const written = await writeTextFile(outPath, content);
  await appendExternalActionLog({
    timestamp: new Date().toISOString(),
    plugin: "x_scout",
    risk: "medium",
    status: "success",
    taskId: String(ctx.task._id),
    title: ctx.task.title,
    commands: [timelineCommand, searchCommand],
    reportPath: written,
  });

  return {
    pluginId: "x_scout",
    notes: ["Collected X timeline + targeted search results and wrote scout report."],
    files: [written],
  };
}

async function pluginLyraCapitalResearch(ctx: PluginContext): Promise<PluginResult> {
  const notes: string[] = [];
  const files: string[] = [];

  // Fetch market data
  const [btcRaw, fngRaw] = await Promise.allSettled([
    runCommand('curl -s "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"'),
    runCommand('curl -s "https://api.alternative.me/fng/?limit=3"'),
  ]);

  let btcData: { lastPrice?: string; priceChangePercent?: string; volume?: string } = {};
  let fngData: { data?: Array<{ value?: string; value_classification?: string }> } = {};
  if (btcRaw.status === "fulfilled") { try { btcData = JSON.parse(btcRaw.value) as typeof btcData; } catch { /* ignore */ } }
  if (fngRaw.status === "fulfilled") { try { fngData = JSON.parse(fngRaw.value) as typeof fngData; } catch { /* ignore */ } }

  const currentPrice = Number(btcData.lastPrice ?? 0);
  const change24h = Number(btcData.priceChangePercent ?? 0);
  const fngValue = Number(fngData.data?.[0]?.value ?? 50);
  const fngLabel = fngData.data?.[0]?.value_classification ?? "Neutral";

  // Portfolio state
  const statusRaw = await runCommand(
    "curl -s -X POST http://localhost:3001/api/capital -H 'content-type: application/json' -d '{\"action\":\"status\"}'"
  );
  let statusData: { portfolio?: { positions?: unknown[]; totalEquity?: number; status?: string } } = {};
  try { statusData = JSON.parse(statusRaw) as typeof statusData; } catch { /* ignore */ }

  const openPositions = statusData.portfolio?.positions?.length ?? 0;
  const totalEquity = statusData.portfolio?.totalEquity ?? 100000;
  const portfolioStatus = statusData.portfolio?.status ?? "active";

  // Simple signal engine
  let shouldTrade = false;
  let side: "long" | "short" = "long";
  let confidence = 0;
  let thesis = "";

  if (portfolioStatus !== "halted" && openPositions < 2) {
    // Long: extreme fear + slight recovery
    if (fngValue < 30 && change24h > -2 && change24h < 6) {
      shouldTrade = true; side = "long";
      confidence = 0.70 + (30 - fngValue) / 200;
      thesis = `BTC fear/greed at ${fngValue} (${fngLabel}), 24h change ${change24h.toFixed(2)}% — contrarian long in extreme fear.`;
    }
    // Short: extreme greed + overextended
    else if (fngValue > 78 && change24h > 6) {
      shouldTrade = true; side = "short";
      confidence = 0.68 + (fngValue - 78) / 200;
      thesis = `BTC fear/greed at ${fngValue} (${fngLabel}), 24h surge ${change24h.toFixed(2)}% — short overextension.`;
    }
  }

  const reportLines: string[] = [
    `# Capital Research: ${ctx.task.title}`,
    `Generated: ${ctx.timestamp}`,
    "",
    "## Market Context",
    `- BTC Price: $${currentPrice.toLocaleString()}`,
    `- 24h Change: ${change24h.toFixed(2)}%`,
    `- Fear/Greed: ${fngValue} (${fngLabel})`,
    "",
    "## Portfolio State",
    `- Open Positions: ${openPositions}`,
    `- Total Equity: $${totalEquity.toLocaleString()}`,
    `- Portfolio Status: ${portfolioStatus}`,
    "",
    "## Signal Analysis",
    `- Signal: ${shouldTrade ? `${side.toUpperCase()} (confidence ${confidence.toFixed(2)})` : "NO TRADE"}`,
    `- Thesis: ${thesis || "No clear signal identified."}`,
    "",
    "## Decision",
  ];

  if (shouldTrade && confidence >= 0.75) {
    // Get fresh price for trade
    let entryPrice = currentPrice;
    try {
      const priceRaw = await runCommand('curl -s "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"');
      const p = Number((JSON.parse(priceRaw) as { price?: string }).price);
      if (p > 0) entryPrice = p;
    } catch { /* use currentPrice */ }

    const riskPct = 0.02;
    const notional = totalEquity * 0.04;
    const size = notional / entryPrice;
    const stopLoss = side === "long" ? entryPrice * (1 - riskPct) : entryPrice * (1 + riskPct);
    const takeProfit = side === "long" ? entryPrice * (1 + 2 * riskPct) : entryPrice * (1 - 2 * riskPct);

    const tradePayload = JSON.stringify({ action: "trade", symbol: "BTCUSDT", side, entryPrice, size, stopLoss, takeProfit, thesis });
    const tradeRaw = await runCommand(
      `curl -s -X POST http://localhost:3001/api/capital -H 'content-type: application/json' -d '${tradePayload.replace(/'/g, "'\\''")}'`
    );
    let tradeOk = false;
    try { tradeOk = (JSON.parse(tradeRaw) as { ok?: boolean }).ok === true; } catch { /* ignore */ }

    reportLines.push(
      `- Action: ${tradeOk ? "TRADE EXECUTED ✅" : "TRADE FAILED ❌"}`,
      `- BTCUSDT ${side} @ $${entryPrice.toFixed(2)} | SL $${stopLoss.toFixed(2)} | TP $${takeProfit.toFixed(2)}`,
    );
    notes.push(`Research-driven ${side} signal (conf=${confidence.toFixed(2)}). Trade ${tradeOk ? "executed" : "failed"}.`);
  } else {
    const reason = !shouldTrade ? "No clear pattern" :
      confidence < 0.75 ? `Low confidence (${confidence.toFixed(2)})` :
      `Max positions or halted`;
    reportLines.push(`- Action: PASS — ${reason}`);
    notes.push(`No trade this cycle. Reason: ${reason}`);
  }

  const researchDir = "/home/ubuntu/.openclaw/workspace-lyra/research";
  const slug = safeSlug(ctx.task.title);
  const reportPath = `${researchDir}/capital-research-${ctx.timestamp.slice(0, 10)}-${slug}.md`;
  await mkdir(researchDir, { recursive: true });
  await writeFile(reportPath, reportLines.join("\n") + "\n", "utf8");
  files.push(reportPath);

  return { pluginId: "lyra_capital_research", notes, files };
}

async function pluginWebResearch(ctx: PluginContext): Promise<PluginResult> {
  const query = ctx.task.title
    .replace(/^(research|investigate|study|analyze|analyse|explore|gather|scrape)\s*/i, "")
    .trim();

  let searchOut = "(search unavailable)";
  try {
    searchOut = await runCommand(
      `curl -s --max-time 10 "https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5" -H "Accept: application/json" 2>/dev/null`
    );
  } catch { /* ignore */ }

  const slug = safeSlug(ctx.task.title);
  const reportPath = `${PLUGIN_OUTPUT_DIR}/web-research-${slug}.md`;
  const content = [
    `# Web Research: ${ctx.task.title}`,
    `Generated: ${ctx.timestamp}`,
    `Query: ${query}`,
    "",
    "## Raw Search Output (truncated)",
    "```",
    searchOut.slice(0, 3000),
    "```",
    "",
  ].join("\n");

  const written = await writeTextFile(reportPath, content);
  return {
    pluginId: "web_research",
    notes: [`Completed web research for: "${query}"`],
    files: [written],
  };
}

async function pluginDefault(ctx: PluginContext): Promise<PluginResult> {
  const slug = safeSlug(ctx.task.title);
  const outPath = `${PLUGIN_OUTPUT_DIR}/execution-note-${slug}.md`;
  const content = [
    `# Execution Note: ${ctx.task.title}`,
    "",
    `Generated at: ${ctx.timestamp}`,
    `Worker: ${ctx.worker}`,
    "",
    "This task did not match a specialized plugin, so a default deterministic execution note was produced.",
    "",
  ].join("\n");
  const written = await writeTextFile(outPath, content);
  return {
    pluginId: "default_executor",
    notes: ["Used default executor plugin."],
    files: [written],
  };
}

const EXECUTOR_PLUGINS: ExecutorPlugin[] = [
  {
    id: "weekly_progress_report",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("weekly") && t.includes("report");
    },
    run: pluginWeeklyProgressReport,
  },
  {
    id: "memory_tagger",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("memory") && t.includes("tag");
    },
    run: pluginMemoryTagger,
  },
  {
    id: "cron_health_dashboard",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("cron") && t.includes("dashboard");
    },
    run: pluginCronHealthDashboard,
  },
  {
    id: "ticket_triage_playbook",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("ticket") && t.includes("triage");
    },
    run: pluginTicketTriagePlaybook,
  },
  {
    id: "lyra_capital_research",
    match: (task) => {
      if (task.assigned_to !== "lyra") return false;
      const t = normalizeTitle(task.title);
      return (
        (t.includes("capital") && (t.includes("research") || t.includes("analysis") || t.includes("intelligence"))) ||
        t.includes("market research") ||
        t.includes("market analysis") ||
        t.includes("market intelligence") ||
        t.includes("sentiment") ||
        (t.includes("strategy") && t.includes("capital"))
      );
    },
    run: pluginLyraCapitalResearch,
  },
  {
    id: "capital_paper_trade",
    match: (task) => {
      const t = normalizeTitle(task.title);
      const padded = ` ${t} `;
      const hasExplicitSignal =
        /\b(btcusdt|ethusdt|solusdt|bnbusdt|xrpusdt|dogeusdt|adausdt|aapl|tsla|nvda|msft|amzn|spy|qqq)\b/.test(t) ||
        padded.includes(" long ") ||
        padded.includes(" short ") ||
        t.includes("paper trade");
      return hasExplicitSignal;
    },
    run: pluginCapitalPaperTrade,
  },
  {
    id: "x_scout",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return t.includes("x scout") || t.includes("x com") || t.includes("twitter") || t.includes("trend") || t.includes("meme");
    },
    run: pluginXScout,
  },
  {
    id: "web_research",
    match: (task) => {
      const t = normalizeTitle(task.title);
      return (
        t.startsWith("research ") ||
        t.includes("web research") ||
        t.includes("investigate") ||
        t.includes("gather data") ||
        t.includes("scrape")
      );
    },
    run: pluginWebResearch,
  },
];

type RunStatus = "success" | "failed";
type WorkerRunLogEntry = {
  timestamp: string;
  plugin: string;
  status: RunStatus;
  durationMs: number;
  worker: Assignee;
  taskId: string;
  title: string;
};

type LegacyExecutionEntry = {
  timestamp: string;
  plugin: string;
  taskId: string;
  title: string;
};

function makeExecutionMarkdown(task: TaskDoc, worker: Assignee, timestamp: string, plugin: PluginResult): string {
  const description = task.description?.trim() ? task.description : "No description provided.";
  return [
    `# Execution: ${task.title}`,
    "",
    `- Task ID: ${task._id}`,
    `- Worker: ${worker}`,
    `- Assignee: ${task.assigned_to}`,
    `- Plugin: ${plugin.pluginId}`,
    `- Status Flow: backlog -> in_progress -> done`,
    `- Timestamp (UTC): ${timestamp}`,
    "",
    "## Description",
    description,
    "",
    "## Plugin Notes",
    ...plugin.notes.map((n) => `- ${n}`),
    "",
    "## Generated Files",
    ...plugin.files.map((f) => `- ${f}`),
    "",
    "## Checklist",
    "- [x] Claimed task",
    "- [x] Ran executor plugin",
    "- [x] Created execution artifact",
    "- [x] Completed deterministic worker flow",
    "",
  ].join("\n");
}

async function appendExecutorRunLog(entry: WorkerRunLogEntry): Promise<void> {
  await mkdir(dirname(EXECUTOR_RUN_LOG_FILE), { recursive: true });
  await appendFile(EXECUTOR_RUN_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

async function appendFailureNote(client: ConvexHttpClient, task: TaskDoc, errorMessage: string, timestamp: string): Promise<void> {
  const previousDescription = task.description?.trim() ?? "";
  const failureNote = `Worker failure (${timestamp}): ${errorMessage}`;
  const newDescription = previousDescription ? `${previousDescription}\n\n${failureNote}` : failureNote;
  await client.mutation(api.tasks.updateTask, {
    id: task._id,
    description: newDescription,
  });
}

async function runWorker(
  client: ConvexHttpClient,
  requestedAssignee: unknown,
  requestedMax: unknown,
  requestedAllowLegacy: unknown
) {
  const allowLegacy = requestedAllowLegacy === true || String(requestedAllowLegacy ?? "").toLowerCase() === "true";
  if (!allowLegacy) {
    return {
      ok: false,
      action: "worker" as const,
      message: "legacy_worker_disabled_use_claim_heartbeat_complete",
      hint: "Use action=claim -> action=heartbeat -> action=complete",
    };
  }

  const maxToProcess = asPositiveInt(requestedMax, 1, 1);
  const assignee = normalizeAssignee(requestedAssignee, "agent");
  const allTasks = await loadAllTasks(client);

  const backlog = sortOldestFirst(allTasks.filter((task) => task.status === "backlog"));

  let selected = backlog.find((task) => task.assigned_to === assignee);
  if (!selected && assignee === "sam") {
    selected = backlog.find((task) => task.assigned_to === "agent");
  }

  if (!selected || maxToProcess < 1) {
    return {
      ok: true,
      action: "worker" as const,
      worker: assignee,
      processed: 0,
      message: "no_matching_backlog_task",
    };
  }

  await client.mutation(api.tasks.updateStatus, { id: selected._id, status: "in_progress" });

  const runStartedAt = Date.now();
  const timestamp = new Date(runStartedAt).toISOString();
  const plugin = EXECUTOR_PLUGINS.find((p) => p.match(selected));
  const pluginId = plugin?.id ?? "default_executor";
  let pluginResult: PluginResult;

  try {
    pluginResult = plugin
      ? await plugin.run({ task: selected, allTasks, worker: assignee, timestamp })
      : await pluginDefault({ task: selected, allTasks, worker: assignee, timestamp });
  } catch (error) {
    const durationMs = Date.now() - runStartedAt;
    const errorMessage = error instanceof Error ? error.message : "unknown plugin execution error";

    await appendExecutorRunLog({
      timestamp: new Date().toISOString(),
      plugin: pluginId,
      status: "failed",
      durationMs,
      worker: assignee,
      taskId: String(selected._id),
      title: selected.title,
    }).catch(() => undefined);

    await client.mutation(api.tasks.updateStatus, { id: selected._id, status: "backlog" });
    await appendFailureNote(client, selected, errorMessage, new Date().toISOString());

    return {
      ok: true,
      action: "worker" as const,
      worker: assignee,
      processed: 0,
      failed: 1,
      message: "plugin_execution_failed",
      task: {
        id: selected._id,
        title: selected.title,
        plugin: pluginId,
        finishedStatus: "backlog" as const,
      },
      error: errorMessage,
    };
  }

  const artifactPath = `${EXECUTIONS_DIR}/${selected._id}.md`;
  const markdown = makeExecutionMarkdown(selected, assignee, timestamp, pluginResult);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, markdown, "utf8");

  const previousDescription = selected.description?.trim() ?? "";
  const artifactLines = [
    `Execution artifact: ${artifactPath}`,
    ...pluginResult.files.map((f) => `Generated file: ${f}`),
  ].join("\n");
  const newDescription = previousDescription ? `${previousDescription}\n\n${artifactLines}` : artifactLines;

  await client.mutation(api.tasks.updateTask, {
    id: selected._id,
    description: newDescription,
  });

  await client.mutation(api.tasks.updateStatus, { id: selected._id, status: "done" });
  await appendExecutorRunLog({
    timestamp: new Date().toISOString(),
    plugin: pluginResult.pluginId,
    status: "success",
    durationMs: Date.now() - runStartedAt,
    worker: assignee,
    taskId: String(selected._id),
    title: selected.title,
  }).catch(() => undefined);

  return {
    ok: true,
    action: "worker" as const,
    worker: assignee,
    processed: 1,
    task: {
      id: selected._id,
      title: selected.title,
      plugin: pluginResult.pluginId,
      artifactPath,
      generatedFiles: pluginResult.files,
      startedAt: timestamp,
      finishedStatus: "done" as const,
    },
  };
}


async function collectPluginMetrics() {
  const logs: WorkerRunLogEntry[] = [];
  try {
    const raw = await readFile(EXECUTOR_RUN_LOG_FILE, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<WorkerRunLogEntry>;
        if (
          typeof parsed.timestamp === "string" &&
          typeof parsed.plugin === "string" &&
          (parsed.status === "success" || parsed.status === "failed") &&
          typeof parsed.durationMs === "number" &&
          typeof parsed.worker === "string" &&
          typeof parsed.taskId === "string" &&
          typeof parsed.title === "string"
        ) {
          logs.push({
            timestamp: parsed.timestamp,
            plugin: parsed.plugin,
            status: parsed.status,
            durationMs: parsed.durationMs,
            worker: normalizeAssignee(parsed.worker),
            taskId: parsed.taskId,
            title: parsed.title,
          });
        }
      } catch {
        // ignore malformed json lines
      }
    }
  } catch {
    // no logs yet
  }

  const successfulTaskIds = new Set(logs.filter((r) => r.status === "success").map((r) => r.taskId));
  const legacyEntries: LegacyExecutionEntry[] = [];
  let files: string[] = [];
  try {
    files = (await readdir(EXECUTIONS_DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }

  for (const file of files) {
    const taskId = file.replace(/\.md$/i, "");
    if (successfulTaskIds.has(taskId)) continue;
    try {
      const raw = await readFile(`${EXECUTIONS_DIR}/${file}`, "utf8");
      const pluginMatch = raw.match(/^- Plugin:\s*(.+)$/m);
      const titleMatch = raw.match(/^# Execution:\s*(.+)$/m);
      const timestampMatch = raw.match(/^- Timestamp \(UTC\):\s*(.+)$/m);
      legacyEntries.push({
        timestamp: timestampMatch?.[1]?.trim() || new Date(0).toISOString(),
        plugin: pluginMatch?.[1]?.trim() || "unknown",
        taskId,
        title: titleMatch?.[1]?.trim() || taskId,
      });
    } catch {
      // ignore unreadable execution files
    }
  }

  const allRuns: WorkerRunLogEntry[] = [
    ...logs,
    ...legacyEntries.map((entry) => ({
      timestamp: entry.timestamp,
      plugin: entry.plugin,
      status: "success" as const,
      durationMs: 0,
      worker: "agent" as const,
      taskId: entry.taskId,
      title: entry.title,
    })),
  ];

  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const daySlots = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(dayStart);
    d.setUTCDate(dayStart.getUTCDate() - (6 - idx));
    return d.toISOString().slice(0, 10);
  });
  const slotIndexByDate = new Map(daySlots.map((date, idx) => [date, idx]));

  const byPluginMap = new Map<
    string,
    {
      plugin: string;
      runs: number;
      success: number;
      failed: number;
      durationTotalMs: number;
      durationCount: number;
      lastRunAt: string | null;
      sparkline: number[];
    }
  >();

  for (const run of allRuns) {
    const current = byPluginMap.get(run.plugin) ?? {
      plugin: run.plugin,
      runs: 0,
      success: 0,
      failed: 0,
      durationTotalMs: 0,
      durationCount: 0,
      lastRunAt: null,
      sparkline: [0, 0, 0, 0, 0, 0, 0],
    };

    current.runs += 1;
    if (run.status === "success") current.success += 1;
    if (run.status === "failed") current.failed += 1;
    if (run.durationMs > 0) {
      current.durationTotalMs += run.durationMs;
      current.durationCount += 1;
    }

    const runTime = Date.parse(run.timestamp);
    if (!Number.isNaN(runTime)) {
      if (!current.lastRunAt || runTime > Date.parse(current.lastRunAt)) {
        current.lastRunAt = new Date(runTime).toISOString();
      }
      const dateKey = new Date(runTime).toISOString().slice(0, 10);
      const slotIndex = slotIndexByDate.get(dateKey);
      if (slotIndex !== undefined) {
        current.sparkline[slotIndex] += 1;
      }
    }

    byPluginMap.set(run.plugin, current);
  }

  const byPlugin = Array.from(byPluginMap.values())
    .map((item) => ({
      plugin: item.plugin,
      runs: item.runs,
      success: item.success,
      failed: item.failed,
      successRate: item.runs > 0 ? Number(((item.success / item.runs) * 100).toFixed(1)) : 0,
      avgDurationMs: item.durationCount > 0 ? Math.round(item.durationTotalMs / item.durationCount) : 0,
      lastRunAt: item.lastRunAt,
      sparkline: item.sparkline,
    }))
    .sort((a, b) => b.runs - a.runs || a.plugin.localeCompare(b.plugin));

  return { totalExecutions: allRuns.length, byPlugin };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

async function collectRunLogStats() {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const runDurations24h: number[] = [];
  let doneLast24h = 0;

  try {
    const raw = await readFile(EXECUTOR_RUN_LOG_FILE, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<WorkerRunLogEntry>;
        if (
          typeof parsed.timestamp === "string" &&
          typeof parsed.durationMs === "number" &&
          (parsed.status === "success" || parsed.status === "failed")
        ) {
          const ts = Date.parse(parsed.timestamp);
          if (!Number.isNaN(ts) && ts >= dayAgo) {
            if (parsed.status === "success") doneLast24h += 1;
            if (parsed.durationMs > 0) runDurations24h.push(parsed.durationMs);
          }
        }
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    // no logs yet
  }

  return {
    doneLast24h,
    medianExecutionDurationMs: median(runDurations24h),
  };
}

async function runStatus(client: ConvexHttpClient) {
  const allTasks = await loadAllTasks(client);

  const byStatus: Record<Status, number> = {
    suggested: 0,
    backlog: 0,
    in_progress: 0,
    done: 0,
  };
  const byAssignee: Record<Assignee, number> = {
    me: 0,
    alex: 0,
    sam: 0,
    lyra: 0,
    agent: 0,
  };

  for (const task of allTasks) {
    byStatus[task.status] += 1;
    byAssignee[task.assigned_to] += 1;
  }

  const pluginMetrics = await collectPluginMetrics();
  const runStats = await collectRunLogStats();

  const activeTasks = allTasks.filter((t) => t.status !== "done");
  const blockedSignals = allTasks.filter((t) => {
    if (t.status === "done") return false;
    const d = (t.description ?? "").toLowerCase();
    return d.includes("validation: fail") || d.includes("stale_lease") || d.includes("blocked");
  }).length;
  const blockedRatio = activeTasks.length > 0 ? Number((blockedSignals / activeTasks.length).toFixed(3)) : 0;

  const alerts: string[] = [];
  if (blockedRatio > 0.15) alerts.push(`blocked_ratio_high:${(blockedRatio * 100).toFixed(1)}%`);
  if (runStats.doneLast24h < 4) alerts.push(`done_per_day_low:${runStats.doneLast24h}`);
  if (runStats.medianExecutionDurationMs > 20 * 60 * 1000) {
    alerts.push(`median_cycle_time_high:${Math.round(runStats.medianExecutionDurationMs / 1000)}s`);
  }

  return {
    ok: true,
    action: "status" as const,
    total: allTasks.length,
    byStatus,
    byAssignee,
    pluginMetrics,
    workflowHealth: {
      contractVersion: "v2",
      targetAlertsTo: "alex",
      doneLast24h: runStats.doneLast24h,
      medianExecutionDurationMs: runStats.medianExecutionDurationMs,
      blockedRatio,
      alerts,
    },
  };
}

async function runClaim(client: ConvexHttpClient, requestedAssignee: unknown) {
  const assignee = normalizeAssignee(requestedAssignee, "agent");
  const allTasks = await loadAllTasks(client);

  // Resume owned in-progress first (stateful continuation best-effort)
  const inProgress = sortOldestFirst(allTasks.filter((t) => t.status === "in_progress" && t.assigned_to === assignee));
  if (inProgress.length > 0) {
    const resumed = inProgress[0];
    return {
      ok: true,
      action: "claim" as const,
      resumed: true,
      task: {
        id: String(resumed._id),
        title: resumed.title,
        description: resumed.description ?? "",
        assigned_to: resumed.assigned_to,
        status: resumed.status,
        workflow_contract_version: "v2",
      },
    };
  }

  const backlog = sortOldestFirst(allTasks.filter((t) => t.status === "backlog"));
  let selected = backlog.find((t) => t.assigned_to === assignee);
  if (!selected && assignee === "sam") {
    selected = backlog.find((t) => t.assigned_to === "agent");
  }

  if (!selected) {
    return { ok: true, action: "claim" as const, task: null, message: "no_matching_backlog_task" };
  }

  await client.mutation(api.tasks.updateStatus, { id: selected._id, status: "in_progress" });

  return {
    ok: true,
    action: "claim" as const,
    resumed: false,
    task: {
      id: String(selected._id),
      title: selected.title,
      description: selected.description ?? "",
      assigned_to: selected.assigned_to,
      status: "in_progress" as const,
      workflow_contract_version: "v2",
    },
  };
}

function extractArtifactPath(output: string): string | undefined {
  const lines = output.split("\n").map((l) => l.trim());
  const candidate = lines.find((line) => line.includes("/home/ubuntu/") || line.includes("/workspace"));
  if (!candidate) return undefined;
  const m = candidate.match(/(\/home\/ubuntu\/[\w\-./]+)/);
  return m?.[1];
}

async function validateCompletion(taskTitle: string, artifactPath?: string): Promise<{ status: "pass" | "fail"; reason?: string }> {
  if (!artifactPath) return { status: "fail", reason: "artifact_path_missing" };

  try {
    await readFile(artifactPath, "utf8");
  } catch {
    return { status: "fail", reason: "artifact_not_found" };
  }

  const title = taskTitle.toLowerCase();

  // code/script validators
  if (/(build|script|tool|pipeline|automation|parser|api)/.test(title)) {
    if (artifactPath.endsWith(".sh")) {
      try {
        await runCommand(`bash -n "${artifactPath}"`);
      } catch {
        return { status: "fail", reason: "shell_syntax_error" };
      }
    }
    if (artifactPath.endsWith(".py")) {
      try {
        await runCommand(`python3 -m py_compile "${artifactPath}"`);
      } catch {
        return { status: "fail", reason: "python_compile_error" };
      }
    }
  }

  // research validators
  if (/(research|analysis|report|intelligence|study)/.test(title)) {
    const content = await readFile(artifactPath, "utf8");
    const sources = (content.match(/https?:\/\//g) ?? []).length;
    if (content.length < 300) return { status: "fail", reason: "research_too_short" };
    if (sources < 1) return { status: "fail", reason: "research_missing_sources" };
  }

  return { status: "pass" };
}

async function runComplete(
  client: ConvexHttpClient,
  taskId: unknown,
  output: unknown,
  requestedAssignee: unknown,
  requestedArtifactPath: unknown
) {
  if (!taskId || typeof taskId !== "string") {
    return { ok: false, error: "taskId is required" };
  }

  const allTasks = await loadAllTasks(client);
  const task = allTasks.find((t) => String(t._id) === taskId);
  if (!task) {
    return { ok: false, error: `task not found: ${taskId}` };
  }

  const assignee = normalizeAssignee(requestedAssignee ?? task.assigned_to, task.assigned_to);
  const outputStr = typeof output === "string" ? output.trim() : "";
  const artifactPath =
    (typeof requestedArtifactPath === "string" && requestedArtifactPath.trim()) || extractArtifactPath(outputStr);

  const validation = await validateCompletion(task.title, artifactPath);

  const prev = task.description?.trim() ?? "";
  const completionBlock = [
    "---",
    "**Execution Output:**",
    outputStr || "(no output)",
    artifactPath ? `Artifact: ${artifactPath}` : "Artifact: (missing)",
    `Validation: ${validation.status}${validation.reason ? ` (${validation.reason})` : ""}`,
  ].join("\n");
  const newDesc = prev ? `${prev}\n\n${completionBlock}` : completionBlock;

  await client.mutation(api.tasks.updateTask, { id: task._id, description: newDesc });
  await client.mutation(api.tasks.updateStatus, { id: task._id, status: validation.status === "pass" ? "done" : "backlog" });

  await appendExecutorRunLog({
    timestamp: new Date().toISOString(),
    plugin: "agent_executed",
    status: validation.status === "pass" ? "success" : "failed",
    durationMs: 0,
    worker: assignee,
    taskId: String(task._id),
    title: task.title,
  }).catch(() => undefined);

  const retryTotal = validation.status === "pass" ? 0 : 1;
  const nextBackoff = validation.status === "pass" ? 0 : RETRY_BACKOFF_MINUTES[0];

  return {
    ok: true,
    action: "complete" as const,
    taskId,
    title: task.title,
    resultStatus: validation.status === "pass" ? "done" : "backlog",
    validation,
    artifact_path: artifactPath,
    retry_count_total: retryTotal,
    recommended_backoff_minutes: nextBackoff,
  };
}

async function runHeartbeat(client: ConvexHttpClient, taskId: unknown, requestedAssignee: unknown) {
  if (!taskId || typeof taskId !== "string") {
    return { ok: false, error: "taskId is required" };
  }
  const assignee = normalizeAssignee(requestedAssignee, "agent");
  const allTasks = await loadAllTasks(client);
  const task = allTasks.find((t) => String(t._id) === taskId);
  if (!task) return { ok: false, action: "heartbeat" as const, reason: "not_found" };
  if (task.status !== "in_progress") return { ok: false, action: "heartbeat" as const, reason: "not_in_progress" };
  if (task.assigned_to !== assignee && !(assignee === "sam" && task.assigned_to === "agent")) {
    return { ok: false, action: "heartbeat" as const, reason: "owner_mismatch" };
  }

  const prev = task.description?.trim() ?? "";
  const marker = `Heartbeat: ${new Date().toISOString()} by ${assignee}`;
  const newDesc = prev.includes("Heartbeat:") ? prev : `${prev}\n\n${marker}`.trim();
  await client.mutation(api.tasks.updateTask, { id: task._id, description: newDesc });

  return {
    ok: true,
    action: "heartbeat" as const,
    lease_until: new Date(Date.now() + LEASE_MINUTES_BY_ASSIGNEE[assignee] * 60 * 1000).toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as Record<string, unknown>)?.action ?? "status").toLowerCase() as Action;

    const client = getClient();

    if (action === "guardrail") {
      const result = await runGuardrail(client, (body as Record<string, unknown>).max);
      return NextResponse.json(result);
    }

    if (action === "worker") {
      const result = await runWorker(
        client,
        (body as Record<string, unknown>).assignee,
        (body as Record<string, unknown>).max,
        (body as Record<string, unknown>).allowLegacy
      );
      return NextResponse.json(result);
    }

    if (action === "claim") {
      const result = await runClaim(client, (body as Record<string, unknown>).assignee);
      return NextResponse.json(result);
    }

    if (action === "heartbeat") {
      const result = await runHeartbeat(
        client,
        (body as Record<string, unknown>).taskId,
        (body as Record<string, unknown>).assignee
      );
      return NextResponse.json(result);
    }

    if (action === "complete") {
      const result = await runComplete(
        client,
        (body as Record<string, unknown>).taskId,
        (body as Record<string, unknown>).output,
        (body as Record<string, unknown>).assignee,
        (body as Record<string, unknown>).artifact_path
      );
      return NextResponse.json(result);
    }

    if (action === "status") {
      const result = await runStatus(client);
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
