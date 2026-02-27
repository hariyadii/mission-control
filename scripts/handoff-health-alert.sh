#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
LOG_FILE="$REPORT_DIR/handoff-health-daily.log"
TARGET_CHAT_ID="6825976580"

mkdir -p "$REPORT_DIR"

output="$("$ROOT/scripts/handoff-health.sh" 2>&1 || true)"
timestamp="$(date -Iseconds)"
go_no_go="$(echo "$output" | awk -F= '/^go_no_go=/{print $2}' | tail -n1)"
reasons="$(echo "$output" | awk -F= '/^reasons=/{print $2}' | tail -n1)"

{
  echo "[$timestamp] handoff-health run"
  echo "$output"
  echo
} >> "$LOG_FILE"

if [[ "$go_no_go" == "GO" ]]; then
  echo "NO_REPLY"
  exit 0
fi

msg=$(
  cat <<EOF
Mission Control Handoff Alert (NO_GO)
time: $timestamp
${reasons:+reasons: $reasons}

$output
EOF
)

openclaw message send \
  --channel telegram \
  --target "$TARGET_CHAT_ID" \
  --message "$msg" \
  --silent \
  --json >/tmp/handoff-health-alert-send.json

echo "ALERT_SENT NO_GO reasons=${reasons:-unknown}"
