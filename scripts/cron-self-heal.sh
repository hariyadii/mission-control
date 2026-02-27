#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
HEAL_LOG="$REPORT_DIR/cron-self-heal.log"
RECOVERY_LOG="$REPORT_DIR/cron-recovery.log"
ALLOW_GATEWAY_RESTART="${ALLOW_GATEWAY_RESTART:-false}"

mkdir -p "$REPORT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "cron-self-heal: jq is required"
  exit 2
fi

timestamp="$(date -Iseconds)"
now_ms="$(date +%s%3N)"

cron_json="$(openclaw cron list --all --json)"

error_jobs="$(printf '%s\n' "$cron_json" | jq -c '[.jobs[] | select(.enabled==true and ((.state.lastStatus // "")=="error")) | {
  id,
  name,
  consecutiveErrors: (.state.consecutiveErrors // 0),
  lastError: (.state.lastError // ""),
  runningAtMs: (.state.runningAtMs // 0),
  timeoutSeconds: (.payload.timeoutSeconds // 180)
}]')"
checked="$(printf '%s\n' "$error_jobs" | jq -r 'length')"

declare -A initial_error_ids=()
while IFS= read -r item; do
  [[ -z "$item" ]] && continue
  id="$(printf '%s\n' "$item" | jq -r '.id')"
  initial_error_ids["$id"]=1
done < <(printf '%s\n' "$error_jobs" | jq -c '.[]')

retried=0
auto_recovered=0
pending=0
escalated=0
stuck_running=0

declare -A stuck_ids=()
mark_stuck() {
  local id="$1"
  local name="$2"
  local reason="$3"
  local elapsed_ms="$4"
  local budget_ms="$5"
  if [[ -n "${stuck_ids[$id]:-}" ]]; then
    return
  fi
  stuck_ids["$id"]=1
  stuck_running=$((stuck_running + 1))
  printf '%s severity=critical job=%s id=%s action=stuck_running reason=%s elapsed_ms=%s budget_ms=%s\n' \
    "$timestamp" "$name" "$id" "$reason" "$elapsed_ms" "$budget_ms" >> "$RECOVERY_LOG"
}

is_timeout_like() {
  local text="$1"
  local lower
  lower="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$lower" || "$lower" == *"timeout"* || "$lower" == *"timed out"* ]]
}

is_rate_limit_like() {
  local text="$1"
  local lower
  lower="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" == *"rate limit"* || "$lower" == *"rate_limit"* || "$lower" == *"too many requests"* || "$lower" == *"quota"* ]]
}

is_core_job_name() {
  local name="$1"
  [[ "$name" =~ ^(sam-worker-15m|lyra-capital-worker-30m|nova-worker-30m|alex-worker-30m|alex-guardrail-20m|ops-task-worker-5m|ops-autopilot-5m|ops-worker-5m|sam-compounding-audit-3h|alex-backlog-kicker-10m|self-healing-cron-monitor-10m)$ ]]
}

while IFS= read -r job; do
  [[ -z "$job" ]] && continue
  id="$(printf '%s\n' "$job" | jq -r '.id')"
  name="$(printf '%s\n' "$job" | jq -r '.name')"
  consecutive="$(printf '%s\n' "$job" | jq -r '.consecutiveErrors')"
  last_error="$(printf '%s\n' "$job" | jq -r '.lastError')"
  running_at="$(printf '%s\n' "$job" | jq -r '.runningAtMs')"
  timeout_seconds="$(printf '%s\n' "$job" | jq -r '.timeoutSeconds')"
  budget_ms=$(( (timeout_seconds + 90) * 1000 ))
  elapsed_ms=0
  if (( running_at > 0 )); then
    elapsed_ms=$(( now_ms - running_at ))
  fi

  if ! is_timeout_like "$last_error" && ! is_rate_limit_like "$last_error"; then
    continue
  fi

  if is_rate_limit_like "$last_error"; then
    # Skip (stay pending) only if the error is recent — within a 60-minute cooldown window.
    # After the TTL, allow one retry so quota-recovered core jobs self-heal automatically
    # instead of staying blocked until the next manual intervention.
    rate_limit_ttl_ms=$(( 60 * 60 * 1000 ))
    # Use the job's last-run timestamp as the rate-limit event time.
    # If running_at > 0 use that; otherwise treat as immediate (skip safely).
    rate_limit_elapsed_ms=0
    if (( running_at > 0 )); then
      rate_limit_elapsed_ms=$(( now_ms - running_at ))
    fi
    if (( running_at <= 0 || rate_limit_elapsed_ms < rate_limit_ttl_ms )); then
      pending=$((pending + 1))
      printf '%s severity=warning job=%s id=%s action=wait_rate_limit_cooldown consecutive=%s elapsed_ms=%s ttl_ms=%s\n' \
        "$timestamp" "$name" "$id" "$consecutive" "$rate_limit_elapsed_ms" "$rate_limit_ttl_ms" >> "$RECOVERY_LOG"
      continue
    fi
    # TTL expired — fall through to the standard retry path below.
    printf '%s severity=warning job=%s id=%s action=rate_limit_cooldown_expired_retrying consecutive=%s elapsed_ms=%s\n' \
      "$timestamp" "$name" "$id" "$consecutive" "$rate_limit_elapsed_ms" >> "$RECOVERY_LOG"
  fi

  if (( running_at > 0 && elapsed_ms > budget_ms )); then
    if is_core_job_name "$name"; then
      mark_stuck "$id" "$name" "error_running_over_budget" "$elapsed_ms" "$budget_ms"
    else
      printf '%s severity=warning job=%s id=%s action=skip_non_core_stuck elapsed_ms=%s budget_ms=%s\n' \
        "$timestamp" "$name" "$id" "$elapsed_ms" "$budget_ms" >> "$RECOVERY_LOG"
    fi
    continue
  fi

  if (( running_at > 0 )); then
    pending=$((pending + 1))
    printf '%s severity=warning job=%s id=%s action=wait_running elapsed_ms=%s budget_ms=%s\n' \
      "$timestamp" "$name" "$id" "$elapsed_ms" "$budget_ms" >> "$RECOVERY_LOG"
    continue
  fi

  if (( consecutive >= 3 )); then
    if is_core_job_name "$name"; then
      mark_stuck "$id" "$name" "repeated_errors" "$elapsed_ms" "$budget_ms"
    else
      printf '%s severity=warning job=%s id=%s action=skip_non_core_repeated_errors consecutive=%s\n' \
        "$timestamp" "$name" "$id" "$consecutive" >> "$RECOVERY_LOG"
    fi
    continue
  fi

  retried=$((retried + 1))
  retry_output="$(openclaw cron run "$id" --timeout 180000 2>&1 || true)"
  if printf '%s\n' "$retry_output" | jq -e '.ok == true and .ran == true' >/dev/null 2>&1; then
    auto_recovered=$((auto_recovered + 1))
    printf '%s severity=warning job=%s id=%s consecutive=%s action=retry auto_recovered=true\n' \
      "$timestamp" "$name" "$id" "$consecutive" >> "$RECOVERY_LOG"
  elif printf '%s\n' "$retry_output" | jq -e '.reason == "already-running"' >/dev/null 2>&1; then
    pending=$((pending + 1))
    printf '%s severity=warning job=%s id=%s consecutive=%s action=retry auto_recovered=pending reason=already-running\n' \
      "$timestamp" "$name" "$id" "$consecutive" >> "$RECOVERY_LOG"
  else
    printf '%s severity=warning job=%s id=%s consecutive=%s action=retry auto_recovered=false\n' \
      "$timestamp" "$name" "$id" "$consecutive" >> "$RECOVERY_LOG"
  fi
done < <(printf '%s\n' "$error_jobs" | jq -c '.[]')

running_jobs="$(printf '%s\n' "$cron_json" | jq -c '[.jobs[] | select(.enabled==true and ((.state.runningAtMs // 0) > 0)) | {
  id,
  name,
  runningAtMs: (.state.runningAtMs // 0),
  timeoutSeconds: (.payload.timeoutSeconds // 180)
}]')"
while IFS= read -r job; do
  [[ -z "$job" ]] && continue
  id="$(printf '%s\n' "$job" | jq -r '.id')"
  name="$(printf '%s\n' "$job" | jq -r '.name')"
  if ! is_core_job_name "$name"; then
    continue
  fi
  running_at="$(printf '%s\n' "$job" | jq -r '.runningAtMs')"
  timeout_seconds="$(printf '%s\n' "$job" | jq -r '.timeoutSeconds')"
  budget_ms=$(( (timeout_seconds + 90) * 1000 ))
  elapsed_ms=$(( now_ms - running_at ))
  if (( elapsed_ms > budget_ms )); then
    mark_stuck "$id" "$name" "running_over_budget" "$elapsed_ms" "$budget_ms"
  fi
done < <(printf '%s\n' "$running_jobs" | jq -c '.[]')

if (( stuck_running > 0 )); then
  escalated=$((escalated + 1))
  if [[ "$ALLOW_GATEWAY_RESTART" == "true" ]]; then
    openclaw gateway restart >/tmp/cron-self-heal-gateway-restart.log 2>&1 || true
    printf '%s severity=critical action=gateway_restart reason=stuck_running_jobs count=%s\n' \
      "$timestamp" "$stuck_running" >> "$RECOVERY_LOG"
    sleep 3
  else
    printf '%s severity=critical action=restart_suppressed reason=stuck_running_jobs count=%s hint=set_ALLOW_GATEWAY_RESTART_true_for_auto_restart\n' \
      "$timestamp" "$stuck_running" >> "$RECOVERY_LOG"
  fi
fi

post_json="$(openclaw cron list --all --json)"
remaining_errors="$(printf '%s\n' "$post_json" | jq -r '[.jobs[] | select(.enabled==true and ((.state.lastStatus // "")=="error"))] | length')"

resolved_after=0
for id in "${!initial_error_ids[@]}"; do
  status_now="$(printf '%s\n' "$post_json" | jq -r --arg id "$id" '.jobs[] | select(.id==$id) | (.state.lastStatus // "")' | head -n1)"
  if [[ "$status_now" != "error" ]]; then
    resolved_after=$((resolved_after + 1))
  fi
done
if (( resolved_after > auto_recovered )); then
  auto_recovered="$resolved_after"
fi

severity_out="ok"
if (( stuck_running > 0 || escalated > 0 )); then
  severity_out="critical"
elif (( remaining_errors > 0 || pending > 0 )); then
  severity_out="warning"
fi
summary="$(jq -cn \
  --arg timestamp "$timestamp" \
  --arg severity "$severity_out" \
  --argjson checked "$checked" \
  --argjson retried "$retried" \
  --argjson autoRecovered "$auto_recovered" \
  --argjson pending "$pending" \
  --argjson stuckRunning "$stuck_running" \
  --argjson escalated "$escalated" \
  --argjson remainingErrors "$remaining_errors" \
  '{timestamp:$timestamp,severity:$severity,checked:$checked,retried:$retried,autoRecovered:$autoRecovered,pending:$pending,stuckRunning:$stuckRunning,escalated:$escalated,remainingErrors:$remainingErrors}')"

printf '%s\n' "$summary" >> "$HEAL_LOG"
printf '%s\n' "$summary"
