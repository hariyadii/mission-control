#!/usr/bin/env node

// Evidence sweeper:
// - Closes "Verify artifact evidence: ..." tasks when evidence is provable.
// - If source task has no provable evidence, reopens source task to backlog and
//   closes verification task with escalation note.

const fs = require("fs");
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api.js");

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://joyous-squid-527.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

function safeSlug(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "task"
  );
}

function nowIso() {
  return new Date().toISOString();
}

function fileExists(path) {
  try {
    return Boolean(path && fs.existsSync(path));
  } catch {
    return false;
  }
}

function appendNote(existing, line) {
  const prev = (existing || "").trim();
  if (!prev) return line;
  return `${prev}\n\n${line}`;
}

function parseSourceTaskId(description) {
  const text = description || "";
  const m = text.match(/Source completed task:\s*([a-z0-9]+)/i);
  return m ? m[1] : null;
}

function artifactFromDescription(description) {
  const text = description || "";
  const m = text.match(/Artifact:\s*(\/home\/ubuntu\/[^\n\r\s]+)/i);
  return m ? m[1] : null;
}

function inferArtifact(sourceTask) {
  if (fileExists(sourceTask.artifact_path)) {
    return sourceTask.artifact_path;
  }

  const fromDesc = artifactFromDescription(sourceTask.description || "");
  if (fileExists(fromDesc)) {
    return fromDesc;
  }

  const slug = safeSlug(sourceTask.title || "");
  const candidates = [
    `/home/ubuntu/.openclaw/workspace/autonomy/plugins/execution-note-${slug}.md`,
    `/home/ubuntu/.openclaw/workspace/autonomy/plugins/capital-trade-${slug}.md`,
    `/home/ubuntu/.openclaw/workspace/autonomy/plugins/web-research-${slug}.md`,
    `/home/ubuntu/.openclaw/workspace/autonomy/plugins/x-scout-${slug}.md`,
    `/home/ubuntu/.openclaw/workspace/autonomy/executions/${String(sourceTask._id)}.md`,
  ];

  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }

  return null;
}

async function closeVerifyTaskWithSuccess(verifyTask, sourceTask, artifactPath) {
  const stamp = nowIso();
  const note = `EVIDENCE_SWEEPER_OK ${stamp} source=${String(sourceTask._id)} artifact=${artifactPath}`;

  await client.mutation(api.tasks.updateTask, {
    id: sourceTask._id,
    artifact_path: artifactPath,
    validation_status: "pass",
    description: appendNote(sourceTask.description || "", note),
  });

  await client.mutation(api.tasks.updateTask, {
    id: verifyTask._id,
    validation_status: "pass",
    description: appendNote(verifyTask.description || "", note),
  });
  await client.mutation(api.tasks.updateStatus, { id: verifyTask._id, status: "done" });
}

async function closeVerifyTaskWithEscalation(verifyTask, sourceTask) {
  const stamp = nowIso();
  const note = `EVIDENCE_SWEEPER_ESCALATE ${stamp} source=${String(sourceTask._id)} reason=artifact_missing -> source_reopened_backlog`;

  await client.mutation(api.tasks.updateTask, {
    id: sourceTask._id,
    validation_status: "fail",
    blocked_reason: "artifact_evidence_missing",
    description: appendNote(sourceTask.description || "", note),
  });

  await client.mutation(api.tasks.updateStatus, { id: sourceTask._id, status: "backlog" });
  await client.mutation(api.tasks.updateTask, {
    id: verifyTask._id,
    validation_status: "fail",
    description: appendNote(verifyTask.description || "", note),
  });
  await client.mutation(api.tasks.updateStatus, { id: verifyTask._id, status: "done" });
}

async function closeVerifyTaskSourceMissing(verifyTask) {
  const stamp = nowIso();
  const note = `EVIDENCE_SWEEPER_ESCALATE ${stamp} source=missing reason=source_task_not_found`;
  await client.mutation(api.tasks.updateTask, {
    id: verifyTask._id,
    validation_status: "fail",
    description: appendNote(verifyTask.description || "", note),
  });
  await client.mutation(api.tasks.updateStatus, { id: verifyTask._id, status: "done" });
}

async function main() {
  const tasks = await client.query(api.tasks.list, {});
  const taskById = new Map(tasks.map((t) => [String(t._id), t]));
  const verifyTasks = tasks.filter(
    (t) => t.status === "backlog" && typeof t.title === "string" && t.title.startsWith("Verify artifact evidence:")
  );

  let checked = 0;
  let verified = 0;
  let escalated = 0;
  let sourceMissing = 0;

  for (const verifyTask of verifyTasks) {
    checked += 1;
    const sourceId = parseSourceTaskId(verifyTask.description || "");
    if (!sourceId || !taskById.has(sourceId)) {
      await closeVerifyTaskSourceMissing(verifyTask);
      sourceMissing += 1;
      continue;
    }

    const sourceTask = taskById.get(sourceId);
    const artifactPath = inferArtifact(sourceTask);
    if (artifactPath) {
      await closeVerifyTaskWithSuccess(verifyTask, sourceTask, artifactPath);
      verified += 1;
    } else {
      await closeVerifyTaskWithEscalation(verifyTask, sourceTask);
      escalated += 1;
    }
  }

  console.log(
    `evidence_sweeper checked=${checked} verified=${verified} escalated=${escalated} source_missing=${sourceMissing}`
  );
}

main().catch((error) => {
  const msg = error && error.message ? error.message : String(error);
  console.error(`evidence_sweeper_error ${msg}`);
  process.exit(1);
});

