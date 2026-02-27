#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
STATE_FILE="$REPORT_DIR/critical-health-state.json"
LATEST_LINK="/home/ubuntu/backups/openclaw/latest"
WATCHDOG_FILE="$ROOT/.deploy/watchdog-state.json"
JSON_MODE="${1:-}"
ALERT_COOLDOWN_SECONDS=3600

mkdir -p "$REPORT_DIR"

issues=()
now_sec="$(date +%s)"
backlog=0
inprog=0
alerts=0

service_state() {
  local svc="$1"
  systemctl --user is-active "$svc" 2>/dev/null || echo "unknown"
}

gateway_state="$(service_state openclaw-gateway.service)"
mc_state="$(service_state openclaw-mission-control.service)"
[[ "$gateway_state" == "active" ]] || issues+=("gateway=$gateway_state")
[[ "$mc_state" == "active" ]] || issues+=("mission_control=$mc_state")

if status_json="$(curl -fsS -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"status"}' 2>/dev/null)"; then
  backlog="$(echo "$status_json" | jq -r '.byStatus.backlog // 0' 2>/dev/null || echo 0)"
  inprog="$(echo "$status_json" | jq -r '.byStatus.in_progress // 0' 2>/dev/null || echo 0)"
  alerts="$(echo "$status_json" | jq -r '.workflowHealth.alerts | length // 0' 2>/dev/null || echo 0)"
else
  issues+=("autonomy_status_unreachable")
  backlog=-1
  inprog=-1
  alerts=-1
fi

if [[ "$alerts" =~ ^[0-9]+$ ]] && (( alerts > 0 )); then
  issues+=("workflow_alerts=$alerts")
fi
if [[ "$backlog" =~ ^[0-9]+$ && "$inprog" =~ ^[0-9]+$ ]] && (( backlog >= 5 && inprog == 0 )); then
  issues+=("backlog_stall=$backlog")
fi

if [[ -L "$LATEST_LINK" || -d "$LATEST_LINK" ]]; then
  latest_dir="$(readlink -f "$LATEST_LINK")"
  archive="$latest_dir/openclaw-state.tgz"
  if [[ -f "$archive" ]]; then
    age_h=$(( ( now_sec - $(stat -c %Y "$archive") ) / 3600 ))
    if (( age_h > 30 )); then
      issues+=("backup_age_h=$age_h")
    fi
  else
    issues+=("backup_archive_missing")
  fi
else
  issues+=("backup_latest_missing")
fi

if ! "$ROOT/scripts/restore-verify.sh" >/tmp/critical-restore-verify.log 2>&1; then
  issues+=("restore_verify_failed")
fi

if [[ -f "$WATCHDOG_FILE" ]]; then
  wd_status="$(jq -r '.lastStatus // "unknown"' "$WATCHDOG_FILE" 2>/dev/null || echo "unknown")"
  wd_failures="$(jq -r '.consecutiveFailures // 0' "$WATCHDOG_FILE" 2>/dev/null || echo "0")"
  if [[ "$wd_status" == "rollback_failed" ]]; then
    issues+=("deploy_watchdog=rollback_failed")
  fi
  if [[ "$wd_failures" =~ ^[0-9]+$ ]] && (( wd_failures >= 2 )); then
    issues+=("deploy_smoke_failures=$wd_failures")
  fi
else
  issues+=("deploy_watchdog_state_missing")
fi

if (( ${#issues[@]} == 0 )); then
  printf '{"severity":"none","consecutive":0,"issues":[],"message":"NO_REPLY"}\n' > "$STATE_FILE"
  if [[ "$JSON_MODE" == "--json" ]]; then
    cat "$STATE_FILE"
  else
    echo "NO_REPLY"
  fi
  exit 0
fi

sorted_issues="$(printf '%s\n' "${issues[@]}" | sort | tr '\n' ';' | sed 's/;$//')"
prev_key="$(jq -r '.key // ""' "$STATE_FILE" 2>/dev/null || echo "")"
prev_consecutive="$(jq -r '.consecutive // 0' "$STATE_FILE" 2>/dev/null || echo "0")"
prev_notified_key="$(jq -r '.last_notified_key // ""' "$STATE_FILE" 2>/dev/null || echo "")"
prev_notified_severity="$(jq -r '.last_notified_severity // ""' "$STATE_FILE" 2>/dev/null || echo "")"
prev_notified_at="$(jq -r '.last_notified_at_epoch // 0' "$STATE_FILE" 2>/dev/null || echo "0")"
if [[ "$sorted_issues" == "$prev_key" ]]; then
  consecutive=$(( prev_consecutive + 1 ))
else
  consecutive=1
fi

severity="warning"
if [[ "$sorted_issues" == *"gateway="* ]] || [[ "$sorted_issues" == *"mission_control="* ]] || [[ "$sorted_issues" == *"autonomy_status_unreachable"* ]] || [[ "$sorted_issues" == *"restore_verify_failed"* ]]; then
  severity="critical"
elif (( consecutive >= 2 )); then
  severity="critical"
fi

summary="$(IFS='; '; echo "${issues[*]}")"
msg="Health alert [$severity]: ${summary} (backlog=${backlog} in_progress=${inprog} alerts=${alerts})"

should_suppress=false
if [[ "$sorted_issues" == "$prev_notified_key" && "$severity" == "$prev_notified_severity" ]]; then
  if [[ "$prev_notified_at" =~ ^[0-9]+$ ]] && (( now_sec - prev_notified_at < ALERT_COOLDOWN_SECONDS )); then
    should_suppress=true
  fi
fi

if [[ "$should_suppress" == "true" ]]; then
  printf '{"severity":"%s","consecutive":%s,"issues":%s,"message":"NO_REPLY","key":%s,"last_notified_key":%s,"last_notified_severity":%s,"last_notified_at_epoch":%s}\n' \
    "$severity" \
    "$consecutive" \
    "$(printf '%s\n' "${issues[@]}" | jq -R . | jq -s .)" \
    "$(printf '%s' "$sorted_issues" | jq -R .)" \
    "$(printf '%s' "$prev_notified_key" | jq -R .)" \
    "$(printf '%s' "$prev_notified_severity" | jq -R .)" \
    "${prev_notified_at:-0}" > "$STATE_FILE"
  if [[ "$JSON_MODE" == "--json" ]]; then
    cat "$STATE_FILE"
  else
    echo "NO_REPLY"
  fi
  exit 0
fi

echo "$(date -Iseconds) severity=${severity} consecutive=${consecutive} $msg" >> "$REPORT_DIR/critical-health-alerts.log"
printf '{"severity":"%s","consecutive":%s,"issues":%s,"message":%s,"key":%s,"last_notified_key":%s,"last_notified_severity":%s,"last_notified_at_epoch":%s}\n' \
  "$severity" \
  "$consecutive" \
  "$(printf '%s\n' "${issues[@]}" | jq -R . | jq -s .)" \
  "$(printf '%s' "$msg" | jq -R .)" \
  "$(printf '%s' "$sorted_issues" | jq -R .)" \
  "$(printf '%s' "$sorted_issues" | jq -R .)" \
  "$(printf '%s' "$severity" | jq -R .)" \
  "$now_sec" > "$STATE_FILE"

if [[ "$JSON_MODE" == "--json" ]]; then
  cat "$STATE_FILE"
else
  echo "$msg"
fi
