#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
STATE_FILE="$REPORT_DIR/autonomy-readiness-state.json"
RECOVERY_LOG="$REPORT_DIR/cron-recovery.log"
GITHUB_LOG="$REPORT_DIR/github-health.log"
GITHUB_PREFLIGHT_SCRIPT="$ROOT/scripts/github-preflight.sh"
CRON_JSON="$(mktemp)"
trap 'rm -f "$CRON_JSON"' EXIT

mkdir -p "$REPORT_DIR"

critical_json="$("$ROOT/scripts/critical-health-alert.sh" --json || true)"
critical_severity="$(echo "$critical_json" | jq -r '.severity // "none"' 2>/dev/null || echo "none")"

now_ms="$(date +%s%3N)"
openclaw cron list --all --json > "$CRON_JSON"
jobs_total="$(jq -r '.jobs | length' "$CRON_JSON")"
jobs_enabled="$(jq -r '[.jobs[] | select(.enabled==true)] | length' "$CRON_JSON")"
jobs_error_enabled="$(jq -r --argjson now "$now_ms" '
  [
    .jobs[]
    | select(.enabled == true)
    | select((.state.lastStatus // "") == "error")
    | . as $job
    | ($job.state.runningAtMs // 0) as $running
    | ($job.payload.timeoutSeconds // 180) as $timeout
    | ($now - $running) as $elapsed
    | if ($running > 0 and $elapsed < (($timeout + 90) * 1000)) then
        empty
      else
        $job
      end
  ]
  | length
' "$CRON_JSON")"
healthy_worker_activity="$(jq -r --argjson now "$now_ms" '
  any(
    .jobs[];
    .enabled == true
    and ((.name // "") | test("^(alex-worker-30m|sam-worker-15m|lyra-capital-worker-30m|nova-worker-30m|ops-task-worker-5m)$"))
    and ((.state.runningAtMs // 0) > 0)
    and (($now - (.state.runningAtMs // 0)) <= (((.payload.timeoutSeconds // 180) + 90) * 1000))
  )
' "$CRON_JSON")"
if [[ "$healthy_worker_activity" != "true" ]]; then
  healthy_worker_activity="false"
fi

status_json="$(curl -fsS -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"status"}')"
suggested="$(echo "$status_json" | jq -r '.byStatus.suggested // 0')"
backlog="$(echo "$status_json" | jq -r '.byStatus.backlog // 0')"
inprog="$(echo "$status_json" | jq -r '.byStatus.in_progress // 0')"
blocked="$(echo "$status_json" | jq -r '.byStatus.blocked // 0')"
done="$(echo "$status_json" | jq -r '.byStatus.done // 0')"
alerts="$(echo "$status_json" | jq -r '.workflowHealth.alerts | length // 0')"
critical_alerts="$(echo "$status_json" | jq -r '.workflowHealth.criticalAlerts | length // 0')"
validation_loop_tasks="$(echo "$status_json" | jq -r '.workflowHealth.validationLoopTasks // 0')"
stalled_backlog_tasks="$(echo "$status_json" | jq -r '.workflowHealth.stalledBacklogTasks // 0')"
active_cron_errors="$(echo "$status_json" | jq -r '.workflowHealth.activeCronErrors // 0')"
ops_health_source="$(echo "$status_json" | jq -r '.workflowHealth.opsHealthSource // "none"')"
ops_executor_healthy="$(echo "$status_json" | jq -r '.workflowHealth.opsExecutorHealthy // false')"
ops_timers_healthy="$(echo "$status_json" | jq -r '.workflowHealth.opsTimersHealthy // false')"

now_sec="$(date +%s)"
prev_backlog_since="$(jq -r '.backlog_stall_since // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
prev_alert_consecutive="$(jq -r '.alert_consecutive // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
prev_critical_alert_consecutive="$(jq -r '.critical_alert_consecutive // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
prev_github_issue_consecutive="$(jq -r '.github_issue_consecutive // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
prev_ops_issue_consecutive="$(jq -r '.ops_issue_consecutive // 0' "$STATE_FILE" 2>/dev/null || echo 0)"

github_ready=true
github_ready_reason="none"
if [[ -x "$GITHUB_PREFLIGHT_SCRIPT" ]]; then
  github_preflight_out="$("$GITHUB_PREFLIGHT_SCRIPT" 2>&1 || true)"
  github_preflight_ready="$(echo "$github_preflight_out" | awk -F= '/^ready=/{print $2}' | tail -n1)"
  if [[ "$github_preflight_ready" != "true" ]]; then
    github_ready=false
    github_ready_reason="$(echo "$github_preflight_out" | awk -F= '/^reasons=/{print $2}' | tail -n1)"
  fi
else
  github_ready=false
  github_ready_reason="github_preflight_script_missing"
fi

github_total_checks_24h=0
github_failures_24h=0
github_delivery_failures_24h=0
if [[ -f "$GITHUB_LOG" ]]; then
  cutoff_epoch=$(( now_sec - 86400 ))
  github_stats="$(tail -n 500 "$GITHUB_LOG" | awk '/^\\{/{print}' | jq -s --argjson cutoff "$cutoff_epoch" '
    reduce .[] as $item (
      {total:0, fail:0, delivery_fail:0};
      (try ($item.timestamp | fromdateiso8601) catch 0) as $ts
      | if $ts >= $cutoff then
          .total += 1
          | if (($item.status // "ok") != "ok") then .fail += 1 else . end
          | if (($item.delivery_ok // true) != true) then .delivery_fail += 1 else . end
        else
          .
        end
    )
  ' 2>/dev/null || echo '{\"total\":0,\"fail\":0,\"delivery_fail\":0}')"
  github_total_checks_24h="$(echo "$github_stats" | jq -r '.total // 0')"
  github_failures_24h="$(echo "$github_stats" | jq -r '.fail // 0')"
  github_delivery_failures_24h="$(echo "$github_stats" | jq -r '.delivery_fail // 0')"
fi
github_delivery_fail_ratio="0.0000"
if (( github_total_checks_24h > 0 )); then
  github_delivery_fail_ratio="$(awk -v f="$github_delivery_failures_24h" -v t="$github_total_checks_24h" 'BEGIN{ printf("%.4f", f/t) }')"
fi

backlog_stall_since=0
backlog_stall_minutes=0
if (( backlog >= 3 && inprog == 0 )) && [[ "$healthy_worker_activity" != "true" ]]; then
  if [[ "$prev_backlog_since" =~ ^[0-9]+$ ]] && (( prev_backlog_since > 0 )); then
    backlog_stall_since="$prev_backlog_since"
  else
    backlog_stall_since="$now_sec"
  fi
  backlog_stall_minutes=$(( (now_sec - backlog_stall_since) / 60 ))
fi

alert_consecutive=0
if (( alerts > 0 )); then
  if [[ "$prev_alert_consecutive" =~ ^[0-9]+$ ]]; then
    alert_consecutive=$(( prev_alert_consecutive + 1 ))
  else
    alert_consecutive=1
  fi
fi

critical_alert_consecutive=0
if (( critical_alerts > 0 )); then
  if [[ "$prev_critical_alert_consecutive" =~ ^[0-9]+$ ]]; then
    critical_alert_consecutive=$(( prev_critical_alert_consecutive + 1 ))
  else
    critical_alert_consecutive=1
  fi
fi

github_issue_consecutive=0
github_issue=false
if [[ "$github_ready" != "true" || "$github_failures_24h" -gt 0 ]]; then
  github_issue=true
fi
if [[ "$github_issue" == "true" ]]; then
  if [[ "$prev_github_issue_consecutive" =~ ^[0-9]+$ ]]; then
    github_issue_consecutive=$(( prev_github_issue_consecutive + 1 ))
  else
    github_issue_consecutive=1
  fi
fi

ops_issue=false
if [[ "$ops_health_source" != "none" && "$ops_executor_healthy" != "true" ]]; then
  ops_issue=true
fi
ops_issue_consecutive=0
if [[ "$ops_issue" == "true" ]]; then
  if [[ "$prev_ops_issue_consecutive" =~ ^[0-9]+$ ]]; then
    ops_issue_consecutive=$(( prev_ops_issue_consecutive + 1 ))
  else
    ops_issue_consecutive=1
  fi
fi

sustained_cron_errors=false
sustained_backlog_stall=false
sustained_alerts=false
sustained_github_failure=false
sustained_ops_failure=false
if (( jobs_error_enabled >= 2 )); then sustained_cron_errors=true; fi
if (( backlog >= 3 && inprog == 0 && backlog_stall_minutes >= 45 )) && [[ "$healthy_worker_activity" != "true" ]]; then sustained_backlog_stall=true; fi
if (( critical_alert_consecutive >= 2 )); then sustained_alerts=true; fi
if [[ "$github_ready" != "true" && "$github_issue_consecutive" -ge 2 ]]; then sustained_github_failure=true; fi
if (( github_total_checks_24h >= 2 )); then
  if awk -v ratio="$github_delivery_fail_ratio" 'BEGIN{exit !(ratio >= 0.5)}'; then
    sustained_github_failure=true
  fi
fi
if [[ "$ops_issue" == "true" && "$ops_issue_consecutive" -ge 2 ]]; then sustained_ops_failure=true; fi

sustained_failure=false
ready="yes"
if [[ "$sustained_cron_errors" == "true" || "$sustained_backlog_stall" == "true" || "$sustained_alerts" == "true" || "$sustained_github_failure" == "true" || "$sustained_ops_failure" == "true" ]]; then
  sustained_failure=true
  ready="no"
fi

severity="none"
if [[ "$ready" == "no" ]]; then
  severity="critical"
elif (( jobs_error_enabled == 1 || alerts > 0 )) || { (( backlog >= 3 && inprog == 0 )) && [[ "$healthy_worker_activity" != "true" ]]; } || [[ "$ops_issue" == "true" ]]; then
  severity="warning"
elif [[ "$github_issue" == "true" ]]; then
  severity="warning"
elif [[ "$critical_severity" == "warning" || "$critical_severity" == "critical" ]]; then
  severity="warning"
fi

auto_recovered_jobs=0
if [[ -f "$RECOVERY_LOG" ]]; then
  auto_recovered_jobs="$(grep -c 'auto_recovered=true' "$RECOVERY_LOG" || true)"
fi

printf '{"backlog_stall_since":%s,"alert_consecutive":%s,"updated_at":"%s"}\n' \
  "$backlog_stall_since" \
  "$alert_consecutive" \
  "$(date -Iseconds)" > "$STATE_FILE.tmp"
jq --argjson gh "$github_issue_consecutive" --argjson critical "$critical_alert_consecutive" \
  --argjson opsIssue "$ops_issue_consecutive" \
  '. + {github_issue_consecutive: $gh, critical_alert_consecutive: $critical, ops_issue_consecutive: $opsIssue}' \
  "$STATE_FILE.tmp" > "$STATE_FILE"
rm -f "$STATE_FILE.tmp"

echo "AUTONOMY_READINESS"
echo "timestamp=$(date -Iseconds)"
echo "ready=$ready"
echo "severity=$severity"
echo "sustained_failure=$sustained_failure"
echo "sustained_alerts=$alert_consecutive"
echo "critical_alerts=$critical_alerts"
echo "critical_alert_consecutive=$critical_alert_consecutive"
echo "auto_recovered_jobs=$auto_recovered_jobs"
echo "github_ready=$github_ready"
echo "github_ready_reason=${github_ready_reason:-none}"
echo "github_failures_24h=$github_failures_24h"
echo "github_delivery_fail_ratio=$github_delivery_fail_ratio"
echo "github_issue_consecutive=$github_issue_consecutive"
echo "validation_loop_tasks=$validation_loop_tasks"
echo "stalled_backlog_tasks=$stalled_backlog_tasks"
echo "active_cron_errors=$active_cron_errors"
echo "ops_health_source=$ops_health_source"
echo "ops_executor_healthy=$ops_executor_healthy"
echo "ops_timers_healthy=$ops_timers_healthy"
echo "ops_issue_consecutive=$ops_issue_consecutive"
echo "healthy_worker_activity=$healthy_worker_activity"
echo "tasks suggested=$suggested backlog=$backlog in_progress=$inprog blocked=$blocked done=$done alerts=$alerts critical_alerts=$critical_alerts oldest_backlog_age_minutes=$backlog_stall_minutes"
echo "cron total=$jobs_total enabled=$jobs_enabled enabled_errors=$jobs_error_enabled"
echo "checks cron_errors_ge_2=$sustained_cron_errors backlog_stalled_45m=$sustained_backlog_stall alerts_consecutive_ge_2=$sustained_alerts github_sustained_failure=$sustained_github_failure ops_sustained_failure=$sustained_ops_failure"
