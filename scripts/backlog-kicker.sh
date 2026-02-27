#!/usr/bin/env bash
set -euo pipefail

resp="$(curl -fsS -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"kicker"}')"
ok="$(echo "$resp" | jq -r '.ok // false')"
if [[ "$ok" != "true" ]]; then
  echo "kicker failed: $resp"
  exit 1
fi

guardrail_triggered="$(echo "$resp" | jq -r '.guardrail.triggered // false')"
guardrail_accepted="$(echo "$resp" | jq -r '.guardrail.accepted // 0')"
guardrail_revised="$(echo "$resp" | jq -r '.guardrail.revised // 0')"
stale_requeued="$(echo "$resp" | jq -r '.guardrail.staleRequeued // 0')"
suggester_triggered="$(echo "$resp" | jq -r '.suggesterWake.triggered // false')"
suggester_result="$(echo "$resp" | jq -r '.suggesterWake.result // "unknown"')"
suggester_jobs="$(echo "$resp" | jq -r '.suggesterWake.triggeredJobs // [] | map(.name) | join(",")')"
worker_triggered="$(echo "$resp" | jq -r '.workerWake.triggered // false')"
worker_result="$(echo "$resp" | jq -r '.workerWake.result // "unknown"')"
worker_assignee="$(echo "$resp" | jq -r '.workerWake.assignee // "none"')"
worker_job="$(echo "$resp" | jq -r '.workerWake.jobName // "none"')"
throughput_deficit="$(echo "$resp" | jq -r '.throughput.totalDeficit // 0')"

status_after="$(curl -fsS -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"status"}')"
suggested_after="$(echo "$status_after" | jq -r '.byStatus.suggested // 0')"
backlog_after="$(echo "$status_after" | jq -r '.byStatus.backlog // 0')"
inprog_after="$(echo "$status_after" | jq -r '.byStatus.in_progress // 0')"

echo "kicker guardrail_triggered=$guardrail_triggered guardrail_accepted=$guardrail_accepted guardrail_revised=$guardrail_revised stale_requeued=$stale_requeued suggester_triggered=$suggester_triggered suggester_result=$suggester_result suggester_jobs=$suggester_jobs throughput_deficit=$throughput_deficit worker_triggered=$worker_triggered worker_result=$worker_result assignee=$worker_assignee job=$worker_job suggested=$suggested_after backlog=$backlog_after in_progress=$inprog_after"
