#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
READINESS_SCRIPT="$ROOT/scripts/autonomy-readiness-check.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "handoff-health: jq is required but not installed"
  exit 2
fi

readiness_out="$("$READINESS_SCRIPT" 2>/dev/null || true)"
ready="$(echo "$readiness_out" | awk -F= '/^ready=/{print $2}' | tail -n1)"
readiness_severity="$(echo "$readiness_out" | awk -F= '/^severity=/{print $2}' | tail -n1)"
sustained_failure="$(echo "$readiness_out" | awk -F= '/^sustained_failure=/{print $2}' | tail -n1)"
enabled_errors="$(echo "$readiness_out" | sed -n 's/.*enabled_errors=\([0-9][0-9]*\).*/\1/p' | tail -n1)"
validation_loop_tasks="$(echo "$readiness_out" | awk -F= '/^validation_loop_tasks=/{print $2}' | tail -n1)"
active_cron_errors="$(echo "$readiness_out" | awk -F= '/^active_cron_errors=/{print $2}' | tail -n1)"
ops_health_source="$(echo "$readiness_out" | awk -F= '/^ops_health_source=/{print $2}' | tail -n1)"
ops_executor_healthy="$(echo "$readiness_out" | awk -F= '/^ops_executor_healthy=/{print $2}' | tail -n1)"
ops_timers_healthy="$(echo "$readiness_out" | awk -F= '/^ops_timers_healthy=/{print $2}' | tail -n1)"

status_json="$(curl -fsS -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"status"}')"

suggested="$(echo "$status_json" | jq -r '.byStatus.suggested // 0')"
backlog="$(echo "$status_json" | jq -r '.byStatus.backlog // 0')"
in_progress="$(echo "$status_json" | jq -r '.byStatus.in_progress // 0')"
blocked="$(echo "$status_json" | jq -r '.byStatus.blocked // 0')"
done="$(echo "$status_json" | jq -r '.byStatus.done // 0')"

wf_severity="$(echo "$status_json" | jq -r '.workflowHealth.severity // "none"')"
sustained_alerts="$(echo "$status_json" | jq -r '.workflowHealth.sustainedAlerts // 0')"
oldest_backlog_age="$(echo "$status_json" | jq -r '.workflowHealth.oldestBacklogAgeMinutes // 0')"

done_total="$(echo "$status_json" | jq -r '.workflowHealth.done_total // .byStatus.done // 0')"
done_verified_pass="$(echo "$status_json" | jq -r '.workflowHealth.done_verified_pass // 0')"
done_with_fail_validation="$(echo "$status_json" | jq -r '.workflowHealth.done_with_fail_validation // 0')"
done_unclassified=$(( done_total - done_verified_pass - done_with_fail_validation ))

pass_readiness=true
pass_cron=true
pass_queue=true
pass_throughput=true
pass_ops=true
pass_validation_loops=true
cron_severity="none"

reasons=()

if [[ "$ready" != "yes" || "$sustained_failure" == "true" ]]; then
  pass_readiness=false
  reasons+=("readiness_not_green")
fi

if [[ -z "${enabled_errors:-}" ]]; then
  enabled_errors=999
fi
if (( enabled_errors >= 2 )); then
  pass_cron=false
  reasons+=("enabled_cron_errors=$enabled_errors")
  cron_severity="critical"
elif (( enabled_errors == 1 )); then
  cron_severity="warning"
fi

if (( backlog > 0 && in_progress == 0 && oldest_backlog_age > 45 )); then
  pass_queue=false
  reasons+=("backlog_stuck_over_45m")
fi

# Throughput integrity check:
# - done_total cannot be less than verified+fail buckets
# - allow a temporary unclassified bucket (legacy/in-flight validation tasks)
if (( done_unclassified < 0 )); then
  pass_throughput=false
  reasons+=("done_bucket_overflow")
fi
if (( done_verified_pass < done_with_fail_validation )); then
  pass_throughput=false
  reasons+=("verified_pass_below_fail_validation")
fi

if [[ "${ops_health_source:-none}" != "none" && "${ops_executor_healthy:-false}" != "true" ]]; then
  pass_ops=false
  reasons+=("ops_executor_unhealthy")
fi

# Block handoff if too many tasks are stuck in a validation loop (queue debt threshold = 3).
if (( ${validation_loop_tasks:-0} >= 3 )); then
  pass_validation_loops=false
  reasons+=("validation_loop_tasks=${validation_loop_tasks}")
fi

go_no_go="GO"
if [[ "$pass_readiness" != true || "$pass_cron" != true || "$pass_queue" != true || "$pass_throughput" != true || "$pass_ops" != true || "$pass_validation_loops" != true ]]; then
  go_no_go="NO_GO"
fi

label_readiness="fail"
label_cron="fail"
label_queue="fail"
label_throughput="fail"
label_ops="fail"
label_validation_loops="fail"
if [[ "$pass_readiness" == true ]]; then label_readiness="pass"; fi
if [[ "$pass_cron" == true ]]; then label_cron="pass"; fi
if [[ "$pass_queue" == true ]]; then label_queue="pass"; fi
if [[ "$pass_throughput" == true ]]; then label_throughput="pass"; fi
if [[ "$pass_ops" == true ]]; then label_ops="pass"; fi
if [[ "$pass_validation_loops" == true ]]; then label_validation_loops="pass"; fi

verified_pct="0.0"
if (( done_total > 0 )); then
  verified_pct="$(awk -v p="$done_verified_pass" -v t="$done_total" 'BEGIN{ printf("%.1f", (p/t)*100) }')"
fi

echo "HANDOFF_HEALTH"
echo "timestamp=$(date -Iseconds)"
echo "go_no_go=$go_no_go"
echo "criterion_readiness=$label_readiness ready=${ready:-unknown} readiness_severity=${readiness_severity:-unknown} sustained_failure=${sustained_failure:-unknown} workflow_severity=${wf_severity} sustained_alerts=${sustained_alerts}"
echo "criterion_enabled_cron_errors_window=$label_cron enabled_errors=$enabled_errors cron_severity=$cron_severity"
echo "criterion_queue_no_stuck_backlog=$label_queue suggested=$suggested backlog=$backlog in_progress=$in_progress blocked=$blocked oldest_backlog_age_minutes=$oldest_backlog_age"
echo "criterion_throughput_integrity=$label_throughput done_total=$done_total done_verified_pass=$done_verified_pass done_with_fail_validation=$done_with_fail_validation done_unclassified=$done_unclassified verified_pass_pct=$verified_pct"
echo "criterion_ops_executor=$label_ops ops_health_source=${ops_health_source:-none} ops_executor_healthy=${ops_executor_healthy:-false} ops_timers_healthy=${ops_timers_healthy:-false}"
echo "criterion_validation_loops=$label_validation_loops validation_loop_tasks=${validation_loop_tasks:-0}"
echo "active_cron_errors=${active_cron_errors:-0}"
if (( ${#reasons[@]} > 0 )); then
  echo "reasons=$(IFS=';'; echo "${reasons[*]}")"
fi

if [[ "$go_no_go" == "GO" ]]; then
  exit 0
fi
exit 1
