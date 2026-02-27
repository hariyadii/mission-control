#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
DEPLOY_DIR="$ROOT/.deploy"
STATE_FILE="$DEPLOY_DIR/watchdog-state.json"
mkdir -p "$DEPLOY_DIR"

read_fail_count() {
  if [[ -f "$STATE_FILE" ]]; then
    jq -r '.consecutiveFailures // 0' "$STATE_FILE" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

write_state() {
  local failures="$1"
  local status="$2"
  local ts
  ts="$(date -Iseconds)"
  cat > "$STATE_FILE" <<EOF
{
  "consecutiveFailures": $failures,
  "lastStatus": "$status",
  "updatedAt": "$ts"
}
EOF
}

if "$ROOT/scripts/deploy-smoke.sh" >/tmp/mission-control-smoke-watchdog.log 2>&1; then
  write_state 0 "ok"
  echo "deploy_watchdog_ok failures=0"
  exit 0
fi

FAILURES="$(read_fail_count)"
NEXT_FAILURES=$((FAILURES + 1))

if [[ "$NEXT_FAILURES" -lt 2 ]]; then
  write_state "$NEXT_FAILURES" "smoke_failed"
  echo "deploy_watchdog_warn failures=$NEXT_FAILURES action=none"
  exit 0
fi

if "$ROOT/scripts/deploy-rollback.sh" >/tmp/mission-control-rollback-watchdog.log 2>&1; then
  write_state 0 "rollback_ok"
  echo "deploy_watchdog_rollback_ok failures_reset=1"
  exit 0
fi

write_state "$NEXT_FAILURES" "rollback_failed"
echo "deploy_watchdog_rollback_failed failures=$NEXT_FAILURES"
exit 1
