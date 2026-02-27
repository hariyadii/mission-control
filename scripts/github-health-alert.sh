#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
LOG_FILE="$REPORT_DIR/github-health.log"
TARGET_CHAT_ID="6825976580"

mkdir -p "$REPORT_DIR"

preflight_out="$($ROOT/scripts/github-preflight.sh 2>&1 || true)"
delivery_out="$($ROOT/scripts/github-delivery-verify.sh 2>&1 || true)"

preflight_ready="$(echo "$preflight_out" | awk -F= '/^ready=/{print $2}' | tail -n1)"
delivery_fail="$(echo "$delivery_out" | awk -F= '/^fail=/{print $2}' | tail -n1)"
delivery_total="$(echo "$delivery_out" | awk -F= '/^total_candidates=/{print $2}' | tail -n1)"

preflight_ok=false
[[ "$preflight_ready" == "true" ]] && preflight_ok=true

delivery_ok=false
if [[ -n "$delivery_fail" && "$delivery_fail" =~ ^[0-9]+$ ]] && (( delivery_fail == 0 )); then
  delivery_ok=true
fi

overall="ok"
if [[ "$preflight_ok" != "true" || "$delivery_ok" != "true" ]]; then
  overall="alert"
fi

entry="$(jq -nc \
  --arg ts "$(date -Iseconds)" \
  --arg status "$overall" \
  --argjson preflight_ok "$preflight_ok" \
  --argjson delivery_ok "$delivery_ok" \
  --arg delivery_fail "${delivery_fail:-0}" \
  --arg delivery_total "${delivery_total:-0}" \
  --arg preflight "$preflight_out" \
  --arg delivery "$delivery_out" \
  '{timestamp:$ts,status:$status,preflight_ok:$preflight_ok,delivery_ok:$delivery_ok,delivery_fail:($delivery_fail|tonumber),delivery_total:($delivery_total|tonumber),preflight:$preflight,delivery:$delivery}')"

echo "$entry" >> "$LOG_FILE"

if [[ "$overall" == "ok" ]]; then
  echo "NO_REPLY"
  exit 0
fi

msg=$(
  cat <<EOM
GitHub Health Alert

time: $(date -Iseconds)
preflight_ok=$preflight_ok
delivery_ok=$delivery_ok
delivery_fail=${delivery_fail:-0}/${delivery_total:-0}

$preflight_out

$delivery_out
EOM
)

openclaw message send \
  --channel telegram \
  --target "$TARGET_CHAT_ID" \
  --message "$msg" \
  --silent >/tmp/github-health-alert-send.json

echo "ALERT_SENT github_health"
