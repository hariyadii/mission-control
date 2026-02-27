#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
STATE_FILE="$REPORT_DIR/ops-incident-state.json"
SNAPSHOT_FILE="$REPORT_DIR/readiness-snapshots.jsonl"
HANDOFF_FILE="$REPORT_DIR/handoff-state.json"
LOG_FILE="$REPORT_DIR/ops-autopilot.log"
REMEDIATION_STATE_FILE="$REPORT_DIR/ops-remediation-state.json"
ALERT_COOLDOWN_SECONDS=2700
TARGET_CHAT_ID="6825976580"
STEP_TIMEOUT_SECONDS=90

mkdir -p "$REPORT_DIR"

timestamp="$(date -Iseconds)"
now_sec="$(date +%s)"

cron_self_heal_json="$(timeout "${STEP_TIMEOUT_SECONDS}s" "$ROOT/scripts/cron-self-heal.sh" 2>/dev/null || echo '{}')"
kicker_line="$(timeout "${STEP_TIMEOUT_SECONDS}s" "$ROOT/scripts/backlog-kicker.sh" 2>/dev/null || echo 'kicker failed')"
readiness_out="$(timeout "${STEP_TIMEOUT_SECONDS}s" "$ROOT/scripts/autonomy-readiness-check.sh" 2>/dev/null || true)"

ready="$(echo "$readiness_out" | awk -F= '/^ready=/{print $2}' | tail -n1)"
readiness_severity="$(echo "$readiness_out" | awk -F= '/^severity=/{print $2}' | tail -n1)"
sustained_failure="$(echo "$readiness_out" | awk -F= '/^sustained_failure=/{print $2}' | tail -n1)"
enabled_errors="$(echo "$readiness_out" | sed -n 's/.*enabled_errors=\([0-9][0-9]*\).*/\1/p' | tail -n1)"
active_cron_errors="$(echo "$readiness_out" | awk -F= '/^active_cron_errors=/{print $2}' | tail -n1)"
readiness_source="script"
snapshot_valid=true

status_json="$(curl -fsS -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"status"}' 2>/dev/null || echo '{}')"
backlog="$(echo "$status_json" | jq -r '.byStatus.backlog // 0' 2>/dev/null || echo 0)"
in_progress="$(echo "$status_json" | jq -r '.byStatus.in_progress // 0' 2>/dev/null || echo 0)"
suggested="$(echo "$status_json" | jq -r '.byStatus.suggested // 0' 2>/dev/null || echo 0)"
alerts_count="$(echo "$status_json" | jq -r '.workflowHealth.alerts | length // 0' 2>/dev/null || echo 0)"
wf_severity="$(echo "$status_json" | jq -r '.workflowHealth.severity // "none"' 2>/dev/null || echo none)"
wf_queue_stall="$(echo "$status_json" | jq -r '.workflowHealth.queueStallMinutes // 0' 2>/dev/null || echo 0)"
wf_active_cron_errors="$(echo "$status_json" | jq -r '.workflowHealth.activeCronErrors // 0' 2>/dev/null || echo 0)"
alerts_key="$(echo "$status_json" | jq -r '.workflowHealth.alerts // [] | sort | join("|")' 2>/dev/null || echo '')"
cron_error_jobs_key="$(echo "$status_json" | jq -r '.workflowHealth.consecutiveCronErrorsByJob // {} | keys | sort | join("|")' 2>/dev/null || echo '')"
ops_open_incident_tasks="$(echo "$status_json" | jq -r '.workflowHealth.opsOpenIncidentTasks // 0' 2>/dev/null || echo 0)"
ops_executor_healthy="$(echo "$status_json" | jq -r '.workflowHealth.opsExecutorHealthy // false' 2>/dev/null || echo false)"
cron_json="$(openclaw cron list --all --json 2>/dev/null || echo '{"jobs":[]}' )"
healthy_worker_activity="$(echo "$cron_json" | jq -r --argjson now "$(date +%s%3N)" '
  any(
    .jobs[];
    .enabled == true
    and ((.name // "") | test("^(alex-worker-30m|sam-worker-15m|lyra-capital-worker-30m|nova-worker-30m|ops-task-worker-5m)$"))
    and ((.state.runningAtMs // 0) > 0)
    and (($now - (.state.runningAtMs // 0)) <= (((.payload.timeoutSeconds // 180) + 90) * 1000))
  )
' 2>/dev/null || echo false)"
if [[ "$healthy_worker_activity" != "true" ]]; then
  healthy_worker_activity="false"
fi

queue_stall_minutes=0
if [[ "$backlog" =~ ^[0-9]+$ && "$in_progress" =~ ^[0-9]+$ ]] && (( backlog > 0 && in_progress == 0 )) && [[ "$healthy_worker_activity" != "true" ]]; then
  oldest_backlog="$(echo "$status_json" | jq -r '.workflowHealth.oldestBacklogAgeMinutes // 0' 2>/dev/null || echo 0)"
  queue_stall_minutes="$oldest_backlog"
fi

if [[ -z "${enabled_errors:-}" ]]; then
  enabled_errors=0
fi
if [[ -z "${active_cron_errors:-}" ]]; then
  active_cron_errors=0
fi
if [[ -z "${readiness_severity:-}" ]]; then
  readiness_severity="$wf_severity"
fi
if [[ -z "${ready:-}" ]]; then
  readiness_source="api_fallback"
  if [[ "$wf_active_cron_errors" =~ ^[0-9]+$ ]] && (( wf_active_cron_errors >= 2 )); then
    ready="no"
  elif [[ "$wf_queue_stall" =~ ^[0-9]+$ ]] && (( wf_queue_stall >= 45 )) && (( in_progress == 0 )); then
    ready="no"
  elif [[ "$wf_severity" == "critical" ]]; then
    ready="no"
  elif [[ "$wf_severity" == "warning" || "$wf_severity" == "none" ]]; then
    ready="yes"
  else
    ready="error"
  fi
fi
if [[ "$ready" == "error" ]]; then
  readiness_source="error"
  snapshot_valid=false
fi

prev_consecutive_critical="$(jq -r '.consecutiveCriticalChecks // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
prev_status="$(jq -r '.status // "normal"' "$STATE_FILE" 2>/dev/null || echo normal)"
prev_last_notified_fp="$(jq -r '.lastNotifiedFingerprint // ""' "$STATE_FILE" 2>/dev/null || echo '')"
prev_last_notified_at="$(jq -r '.lastNotifiedAtEpoch // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
prev_handoff_generated_at="$(jq -r '.generated_at_epoch // 0' "$HANDOFF_FILE" 2>/dev/null || echo 0)"

state="normal"
critical=false
if [[ "$sustained_failure" == "true" ]]; then
  critical=true
fi
if [[ "$readiness_severity" == "critical" ]]; then
  critical=true
fi
if [[ "$enabled_errors" =~ ^[0-9]+$ ]] && (( enabled_errors >= 2 )); then
  critical=true
fi
if [[ "$queue_stall_minutes" =~ ^[0-9]+$ ]] && (( queue_stall_minutes >= 45 )); then
  critical=true
fi

if [[ "$critical" == "true" ]]; then
  state="critical"
elif [[ "$readiness_severity" == "warning" || "$alerts_count" -gt 0 || "$active_cron_errors" -gt 0 ]]; then
  state="warning"
fi

if [[ "$prev_status" == "critical" && "$state" == "warning" ]]; then
  state="recovering"
fi

consecutive_critical=0
if [[ "$state" == "critical" ]]; then
  if [[ "$prev_consecutive_critical" =~ ^[0-9]+$ ]]; then
    consecutive_critical=$((prev_consecutive_critical + 1))
  else
    consecutive_critical=1
  fi
fi

auto_recovered="$(echo "$cron_self_heal_json" | jq -r '.autoRecovered // 0' 2>/dev/null || echo 0)"
retried="$(echo "$cron_self_heal_json" | jq -r '.retried // 0' 2>/dev/null || echo 0)"
escalated="$(echo "$cron_self_heal_json" | jq -r '.escalated // 0' 2>/dev/null || echo 0)"

last_action="none"
if [[ "$escalated" =~ ^[0-9]+$ ]] && (( escalated > 0 )); then
  last_action="gateway_restart_by_self_heal"
elif [[ "$retried" =~ ^[0-9]+$ ]] && (( retried > 0 )); then
  last_action="cron_retry"
fi
if echo "$kicker_line" | grep -q 'worker_triggered=true'; then
  if [[ "$last_action" == "none" ]]; then
    last_action="worker_wake"
  else
    last_action="${last_action}+worker_wake"
  fi
fi
if echo "$kicker_line" | grep -q 'guardrail_triggered=true'; then
  if [[ "$last_action" == "none" ]]; then
    last_action="guardrail_kick"
  else
    last_action="${last_action}+guardrail_kick"
  fi
fi

kicker_worker_triggered="$(echo "$kicker_line" | sed -n 's/.*worker_triggered=\([^ ]*\).*/\1/p' | tail -n1)"
kicker_guardrail_triggered="$(echo "$kicker_line" | sed -n 's/.*guardrail_triggered=\([^ ]*\).*/\1/p' | tail -n1)"
kicker_in_progress="$(echo "$kicker_line" | sed -n 's/.*in_progress=\([0-9][0-9]*\).*/\1/p' | tail -n1)"
kicker_guardrail_accepted="$(echo "$kicker_line" | sed -n 's/.*guardrail_accepted=\([0-9][0-9]*\).*/\1/p' | tail -n1)"
[[ -z "${kicker_in_progress:-}" ]] && kicker_in_progress=0
[[ -z "${kicker_guardrail_accepted:-}" ]] && kicker_guardrail_accepted=0

last_action_effective=false
if [[ "$last_action" == *"gateway_restart_by_self_heal"* && "$escalated" =~ ^[0-9]+$ ]] && (( escalated > 0 )); then
  last_action_effective=true
fi
if [[ "$kicker_worker_triggered" == "true" && "$kicker_in_progress" =~ ^[0-9]+$ ]] && (( kicker_in_progress > 0 )); then
  last_action_effective=true
fi
if [[ "$kicker_guardrail_triggered" == "true" && "$kicker_guardrail_accepted" =~ ^[0-9]+$ ]] && (( kicker_guardrail_accepted > 0 )); then
  last_action_effective=true
fi

incident_fp="$(
  printf '%s' "state=$state;alerts=${alerts_key};cron_jobs=${cron_error_jobs_key};ops_exec=${ops_executor_healthy}" |
    sha256sum | awk '{print $1}'
)"

should_notify=false
if [[ "$state" == "critical" && "$consecutive_critical" -ge 2 ]]; then
  if [[ "$incident_fp" != "$prev_last_notified_fp" ]]; then
    should_notify=true
  elif [[ "$prev_last_notified_at" =~ ^[0-9]+$ ]] && (( now_sec - prev_last_notified_at >= ALERT_COOLDOWN_SECONDS )); then
    should_notify=true
  fi
fi

if [[ "$should_notify" == "true" ]]; then
  msg="OPS CRITICAL\nstate=$state\nready=${ready:-unknown}\nenabled_errors=$enabled_errors\nactive_cron_errors=$active_cron_errors\nqueue_stall_minutes=$queue_stall_minutes\nalerts=$alerts_count\naction=$last_action\nnext=automatic recovery continues"
  openclaw message send --channel telegram --target "$TARGET_CHAT_ID" --message "$msg" --silent --json >/tmp/ops-autopilot-alert.json 2>/dev/null || true
  last_notified_fp="$incident_fp"
  last_notified_at="$now_sec"
else
  last_notified_fp="$prev_last_notified_fp"
  last_notified_at="$prev_last_notified_at"
fi

handoff_go="NO_GO"
if [[ "$state" != "critical" && "$ready" == "yes" ]]; then
  handoff_go="GO"
fi

snapshot_json="$(jq -cn \
  --arg ts "$timestamp" \
  --arg state "$state" \
  --arg ready "${ready:-unknown}" \
  --arg severity "${readiness_severity:-none}" \
  --argjson enabledErrors "$enabled_errors" \
  --argjson activeCronErrors "$active_cron_errors" \
  --argjson backlog "$backlog" \
  --argjson suggested "$suggested" \
  --argjson inProgress "$in_progress" \
  --argjson queueStall "$queue_stall_minutes" \
  --argjson alerts "$alerts_count" \
  --arg action "$last_action" \
  --arg go "$handoff_go" \
  '{timestamp:$ts,state:$state,ready:$ready,severity:$severity,enabledErrors:$enabledErrors,activeCronErrors:$activeCronErrors,backlog:$backlog,suggested:$suggested,inProgress:$inProgress,queueStallMinutes:$queueStall,alerts:$alerts,lastAutoRemediationAction:$action,handoff:$go}')"

printf '%s\n' "$snapshot_json" >> "$SNAPSHOT_FILE"

jq -cn \
  --arg status "$state" \
  --arg updatedAt "$timestamp" \
  --arg action "$last_action" \
  --arg fp "$last_notified_fp" \
  --argjson actionEffective "$last_action_effective" \
  --argjson opsExecutorHealthy "$( [[ "$ops_executor_healthy" == "true" ]] && echo true || echo false )" \
  --argjson lastNotifiedAt "$last_notified_at" \
  --argjson c "$consecutive_critical" \
  --argjson q "$queue_stall_minutes" \
  '{status:$status,updatedAt:$updatedAt,lastAutoRemediationAction:$action,lastAutoRemediationActionEffective:$actionEffective,opsExecutorHealthy:$opsExecutorHealthy,consecutiveCriticalChecks:$c,queueStallMinutes:$q,lastNotifiedFingerprint:$fp,lastNotifiedAtEpoch:$lastNotifiedAt}' > "$STATE_FILE"

skip_handoff_write=false
if [[ "$prev_handoff_generated_at" =~ ^[0-9]+$ ]] && (( prev_handoff_generated_at > now_sec )); then
  skip_handoff_write=true
fi
if [[ "$skip_handoff_write" != "true" ]]; then
  jq -cn \
    --arg timestamp "$timestamp" \
    --arg go "$handoff_go" \
    --arg state "$state" \
    --arg ready "${ready:-unknown}" \
    --arg reason "enabled_errors=${enabled_errors};queue_stall=${queue_stall_minutes};alerts=${alerts_count}" \
    --arg readiness_source "$readiness_source" \
    --arg generated_from "ops-autopilot" \
    --argjson snapshot_valid "$snapshot_valid" \
    --argjson generated_at_epoch "$now_sec" \
    '{timestamp:$timestamp,go_no_go:$go,state:$state,ready:$ready,reason:$reason,readiness_source:$readiness_source,generated_from:$generated_from,snapshot_valid:$snapshot_valid,generated_at_epoch:$generated_at_epoch}' > "$HANDOFF_FILE"
else
  printf '%s handoff_state_write_skipped reason=stale_epoch prev=%s now=%s\n' "$timestamp" "$prev_handoff_generated_at" "$now_sec" >> "$LOG_FILE"
fi

# Auto-ticket only when a critical incident persists and queue is visibly impacted.
if [[ "$state" == "critical" && "$consecutive_critical" -ge 2 ]]; then
  previous_ticket_fp="$(jq -r '.lastTicketFingerprint // ""' "$REMEDIATION_STATE_FILE" 2>/dev/null || echo '')"
  previous_ticket_at="$(jq -r '.lastTicketAtEpoch // 0' "$REMEDIATION_STATE_FILE" 2>/dev/null || echo 0)"
  open_ticket_exists=false
  if [[ "$ops_open_incident_tasks" =~ ^[0-9]+$ ]] && (( ops_open_incident_tasks > 0 )); then
    open_ticket_exists=true
  fi
  should_ticket=false
  if [[ "$open_ticket_exists" == "false" && "$incident_fp" != "$previous_ticket_fp" ]]; then
    should_ticket=true
  elif [[ "$open_ticket_exists" == "false" && "$previous_ticket_at" =~ ^[0-9]+$ ]] && (( now_sec - previous_ticket_at >= 7200 )); then
    should_ticket=true
  fi

  if [[ "$should_ticket" == "true" ]]; then
    ticket_payload="$(jq -cn \
      --arg title "[OPS] Remediate sustained critical reliability incident" \
      --arg description "remediation_source:ops\nincident_fingerprint:${incident_fp}\nstate:${state}\nready:${ready}\nenabled_errors:${enabled_errors}\nactive_cron_errors:${active_cron_errors}\nqueue_stall_minutes:${queue_stall_minutes}\nalerts:${alerts_count}\nlast_auto_action:${last_action}\n\nRequired:\n- identify root cause in failing cron jobs\n- fix and verify no 2 consecutive errors\n- report mitigation + rollback\n" \
      --arg assigned_to "ops" \
      --arg status "backlog" \
      '{title:$title,description:$description,assigned_to:$assigned_to,status:$status}')"
    curl -fsS -X POST http://127.0.0.1:3001/api/agent-task -H 'content-type: application/json' -d "$ticket_payload" >/tmp/ops-autopilot-ticket.json 2>/dev/null || true
    jq -cn --arg fp "$incident_fp" --argjson at "$now_sec" '{lastTicketFingerprint:$fp,lastTicketAtEpoch:$at}' > "$REMEDIATION_STATE_FILE"
  fi
fi

printf '%s ops_autopilot state=%s ready=%s enabled_errors=%s active_cron_errors=%s queue_stall=%s healthy_worker_activity=%s action=%s action_effective=%s ops_open_incident_tasks=%s\n' \
  "$timestamp" "$state" "${ready:-unknown}" "$enabled_errors" "$active_cron_errors" "$queue_stall_minutes" "$healthy_worker_activity" "$last_action" "$last_action_effective" "$ops_open_incident_tasks" >> "$LOG_FILE"
printf '%s ops_autopilot_snapshot readiness_source=%s snapshot_valid=%s\n' "$timestamp" "$readiness_source" "$snapshot_valid" >> "$LOG_FILE"

echo "$snapshot_json"
